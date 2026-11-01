import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

import { rideStore } from "@/src/services/rideStore";
import { acceptanceManager } from "@/src/services/acceptance";
import { SIMULATOR_SCENARIOS, type SimulatorScenario } from "@/src/services/simulator";
import { DEFAULT_SETTINGS } from "@/src/rules/defaults";
import { storage, __resetStorage } from "./mocks/storage";
import type { NativeNotificationEvent, RideRequest, RideStatus } from "@/src/models/types";

jest.mock("@/src/services/nativeBridge", () => ({
  nativeBridge: {
    isAvailable: () => false,
    setMonitoring: async () => null,
    refreshPermissionStatus: async () => null,
    openNotificationAccessSettings: async () => undefined,
    openAccessibilitySettings: async () => undefined,
    isPackageInstalled: async () => null,
    syncPlatformPackages: async () => false,
    drainPendingEvents: async () => 0,
    addEventListener: () => () => undefined,
  },
}));

function scenarioEvent(
  scenario: SimulatorScenario,
  overrides: Partial<NativeNotificationEvent> = {},
): NativeNotificationEvent {
  return {
    id: `test_${scenario.id}`,
    platform: scenario.platform,
    title: scenario.title,
    text: scenario.text,
    subText: scenario.subText,
    postedAt: Date.now() + (scenario.postedAtOffsetSec ?? 0) * 1000,
    source: "notification",
    removed: false,
    simulated: true,
    ...overrides,
  };
}

const findScenario = (id: string) => SIMULATOR_SCENARIOS.find((s) => s.id === id)!;

// 24h operating window so the tests never depend on the wall clock.
const TEST_SETTINGS = { ...DEFAULT_SETTINGS, startHour: 0, endHour: 0 };

// Each "good" ride gets a unique fare: identical rides within the dedup window
// are (correctly) treated as the same request.
let uniqueFare = 150;
function goodCab(overrides: Partial<NativeNotificationEvent> = {}): NativeNotificationEvent {
  uniqueFare += 3;
  return scenarioEvent(findScenario("good-cab"), {
    text: `Ride request — ₹${uniqueFare} · Pickup 1.2 km · Trip 6.4 km · Cab`,
    ...overrides,
  });
}

afterAll(() => {
  rideStore.dispose();
});

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function rideById(id: string): RideRequest | undefined {
  return rideStore.getSnapshot().rides.find((r) => r.id === id);
}

function rideByPlatform(platform: string): RideRequest | undefined {
  const rides = rideStore.getSnapshot().rides.filter((r) => r.platform === platform);
  return rides[rides.length - 1];
}

beforeEach(() => {
  __resetStorage();
});

describe("ride store — restart recovery", () => {
  it("expires still-open requests found in persisted state after a restart", async () => {
    const staleRide: RideRequest = {
      id: "r_stale_1",
      platform: "rapido",
      sourceEventId: "evt_1",
      fare: 150,
      detectedAt: Date.now() - 60000,
      confidence: 0.9,
      status: "AWAITING_CONFIRMATION",
      missingFields: [],
      fingerprint: "rapido:150:2:8:cab",
      updatedAt: Date.now() - 60000,
      expiresAt: Date.now() - 30000, // expired while the app was dead
      observationCount: 1,
      rawPreview: "Ride request — ₹150",
      simulated: true,
    };
    storage.setItem("rideassist_rides_v1", JSON.stringify([staleRide]));

    await rideStore.init();
    expect(rideStore.getSnapshot().ready).toBe(true);
    expect(rideById("r_stale_1")?.status).toBe("EXPIRED");
  });
});

describe("ride store — full pipeline", () => {
  it("ingests, parses, evaluates and routes scenarios end-to-end", async () => {
    await rideStore.init();
    rideStore.setSettings({ ...TEST_SETTINGS });

    // 1. Good cab request → eligible, awaiting manual approval.
    const good = await rideStore.ingestNotification(goodCab());
    expect(good).not.toBeNull();
    expect(good!.status).toBe("AWAITING_CONFIRMATION");
    expect(good!.ruleResult?.eligible).toBe(true);
    expect(good!.fare).toBe(uniqueFare);
    expect(good!.latency?.detectionMs).toBeGreaterThanOrEqual(0);
    expect(good!.latency?.parsingMs).toBeGreaterThanOrEqual(0);
    expect(good!.latency?.evaluationMs).toBeGreaterThanOrEqual(0);

    // 2. Duplicate delivery is suppressed — same ride, more observations.
    // "duplicate" scenario mirrors "great-per-km" values.
    const great = await rideStore.ingestNotification(scenarioEvent(findScenario("great-per-km"), { id: "test_great" }));
    expect(great).not.toBeNull();
    const duplicateOfGreat = await rideStore.ingestNotification(scenarioEvent(findScenario("duplicate"), { id: "test_dup2" }));
    expect(duplicateOfGreat!.id).toBe(great!.id);
    expect(duplicateOfGreat!.observationCount).toBe(2);

    // 3. OTP noise is ignored (privacy) and logged.
    const otpResult = await rideStore.ingestNotification(scenarioEvent(findScenario("otp-noise"), { id: "test_otp" }));
    expect(otpResult).toBeNull();
    const logs = rideStore.getSnapshot().logs;
    expect(logs.some((l) => l.message.includes("Ignored non-ride notification"))).toBe(true);
    expect(logs.some((l) => l.message.includes("482113"))).toBe(false);

    // 4. Unrelated app notification is ignored.
    const noise = await rideStore.ingestNotification(scenarioEvent(findScenario("app-noise"), { id: "test_noise" }));
    expect(noise).toBeNull();

    // 5. Stale request is rejected by the age rule.
    const stale = await rideStore.ingestNotification(scenarioEvent(findScenario("stale"), { id: "test_stale" }));
    expect(stale!.status).toBe("REJECTED");
    expect(stale!.ruleResult?.reasons.some((r) => r.includes("older than"))).toBe(true);

    // 6. Low-confidence garbled request is rejected by the confidence rule.
    const garbled = await rideStore.ingestNotification(scenarioEvent(findScenario("low-confidence"), { id: "test_garbled" }));
    expect(garbled!.status).toBe("REJECTED");
    expect(garbled!.ruleResult?.reasons.some((r) => r.includes("below threshold"))).toBe(true);

    // 7. Fare below minimum → rejected with an explanation.
    const lowFare = await rideStore.ingestNotification(scenarioEvent(findScenario("low-fare"), { id: "test_lowfare" }));
    expect(lowFare!.status).toBe("REJECTED");
    expect(lowFare!.ruleResult?.reasons.some((r) => r.includes("below minimum"))).toBe(true);

    // 8. Daily stats are consistent.
    const stats = rideStore.computeDailyStats();
    expect(stats.detected).toBeGreaterThanOrEqual(3);
    expect(stats.rejected).toBeGreaterThanOrEqual(3);
    expect(stats.duplicateObservationsSuppressed).toBeGreaterThanOrEqual(1);
  });

  it("expires open requests through the sweeper", async () => {
    rideStore.setSettings({ ...TEST_SETTINGS, maxRequestAgeSec: 1 });
    const far = await rideStore.ingestNotification(scenarioEvent(findScenario("far-pickup"), { id: "test_far" }));
    expect(far!.status).toBe("REJECTED"); // pickup too far

    const good = await rideStore.ingestNotification(scenarioEvent(findScenario("bike-good"), { id: "test_bike" }));
    expect(good!.status).toBe("AWAITING_CONFIRMATION");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const swept = rideStore.sweepExpiry();
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(rideById(good!.id)?.status).toBe("EXPIRED");
    rideStore.setSettings({ ...TEST_SETTINGS });
  });

  it("supports dismissal of open requests", async () => {
    const good = await rideStore.ingestNotification(goodCab({ id: "test_dismiss" }));
    expect(good!.status).toBe("AWAITING_CONFIRMATION");
    rideStore.dismissRide(good!.id);
    expect(rideById(good!.id)?.status).toBe("REJECTED");
  });
});

describe("acceptance — attempts vs confirmations", () => {
  it("confirms a simulated acceptance with explicit evidence", async () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.05); // → CONFIRMED
    try {
      const ride = await rideStore.ingestNotification(goodCab({ id: "test_sim_accept" }));
      expect(ride!.status).toBe("AWAITING_CONFIRMATION");

      const result = await acceptanceManager.initiateAcceptance(ride!.id);
      expect(result.ok).toBe(true);
      await waitFor(() => rideById(ride!.id)?.status === "ACCEPTED");
      const done = rideById(ride!.id)!;
      expect(done.acceptance?.evidence?.status).toBe("CONFIRMED");
      expect(done.acceptance?.evidence?.source).toBe("simulated");
      expect(done.latency?.interactionMs).toBeGreaterThanOrEqual(0);
    } finally {
      randomSpy.mockRestore();
    }
  }, 15000);

  it("routes NOT_CONFIRMED evidence to FAILED — never to ACCEPTED", async () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99); // → NOT_CONFIRMED
    try {
      const ride = await rideStore.ingestNotification(goodCab({ id: "test_sim_fail" }));
      await acceptanceManager.initiateAcceptance(ride!.id);
      await waitFor(() => rideById(ride!.id)?.status === "FAILED");
      const done = rideById(ride!.id)!;
      expect(done.status).toBe("FAILED");
      expect(done.acceptance?.evidence?.status).toBe("NOT_CONFIRMED");
      expect(done.status === "ACCEPTED").toBe(false);
    } finally {
      randomSpy.mockRestore();
    }
  }, 15000);

  it("manual confirmation is the working fallback for real requests", async () => {
    const ride = await rideStore.ingestNotification(goodCab({ id: "test_manual", simulated: false }));
    expect(ride!.simulated).toBe(false);

    const result = acceptanceManager.confirmManualEvidence(ride!.id, true);
    expect(result.ok).toBe(true);
    const done = rideById(ride!.id)!;
    expect(done.status).toBe("ACCEPTED");
    expect(done.acceptance?.evidence?.source).toBe("user-manual");
  });

  it("manual rejection routes to FAILED", async () => {
    const ride = await rideStore.ingestNotification(goodCab({ id: "test_manual_reject", simulated: false }));
    acceptanceManager.confirmManualEvidence(ride!.id, false);
    expect(rideById(ride!.id)?.status).toBe("FAILED");
  });

  it("resolves UNKNOWN outcomes only through explicit user verification", async () => {
    const ride = await rideStore.ingestNotification(goodCab({ id: "test_unknown", simulated: false }));
    // Force an UNKNOWN outcome (as the evidence collector would).
    const toUnknown = rideStore.transition(ride!.id, "UNKNOWN", {
      logMessage: "Acceptance outcome UNKNOWN — manual verification required",
    });
    expect(toUnknown?.status).toBe("UNKNOWN");

    acceptanceManager.verifyUnknownOutcome(ride!.id, true);
    expect(rideById(ride!.id)?.status).toBe("ACCEPTED");
  });

  it("refuses to accept a request that is not awaiting approval", async () => {
    const ride = await rideStore.ingestNotification(goodCab({ id: "test_guard", simulated: false }));
    rideStore.dismissRide(ride!.id);
    const result = await acceptanceManager.initiateAcceptance(ride!.id);
    expect(result.ok).toBe(false);
    expect(rideById(ride!.id)?.status).toBe("REJECTED");
  });

  it("prevents duplicate acceptance attempts on the same ride", async () => {
    const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.05);
    try {
      const ride = await rideStore.ingestNotification(goodCab({ id: "test_dup_accept" }));
      const [first, second] = await Promise.all([
        acceptanceManager.initiateAcceptance(ride!.id),
        acceptanceManager.initiateAcceptance(ride!.id),
      ]);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(false);
      expect(second.message).toMatch(/already/i);
      await waitFor(() => rideById(ride!.id)?.status === "ACCEPTED");
      expect(rideById(ride!.id)?.acceptance?.attempts).toHaveLength(1);
    } finally {
      randomSpy.mockRestore();
    }
  }, 15000);
});

describe("diagnostics export", () => {
  it("exports valid, redacted JSON", async () => {
    await rideStore.ingestNotification(goodCab({ id: "test_export" }));
    const exported = rideStore.buildDiagnosticExport();
    const parsed = JSON.parse(exported);
    expect(parsed.app).toBe("RideAssist");
    expect(Array.isArray(parsed.rides)).toBe(true);
    expect(Array.isArray(parsed.logs)).toBe(true);
    // No raw OTP content anywhere in the export.
    expect(exported).not.toContain("482113");
  });
});

describe("local data deletion", () => {
  it("clears rides and logs and resets settings", async () => {
    rideStore.clearAllData();
    expect(rideStore.getSnapshot().rides).toHaveLength(0);
    expect(rideStore.getSnapshot().settings).toEqual(DEFAULT_SETTINGS);
  });
});
