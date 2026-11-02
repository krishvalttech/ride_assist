import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { buildAnnouncement, registerVoiceAlerts } from "@/src/services/voiceAlerts";
import { buildCaptureSample, rideStore } from "@/src/services/rideStore";
import { parseRideNotification } from "@/src/parsers";
import { DEFAULT_SETTINGS } from "@/src/rules/defaults";
import { __resetStorage } from "./mocks/storage";

const mockSpeak = jest.fn();
const mockStop = jest.fn();
jest.mock("expo-speech", () => ({ speak: (...args: unknown[]) => mockSpeak(...args), stop: () => mockStop() }));

beforeEach(() => {
  __resetStorage();
  mockSpeak.mockClear();
});

describe("spoken ride alerts", () => {
  it("announces platform, fare and distances", () => {
    expect(
      buildAnnouncement({ platform: "rapido", fare: 184, pickupDistanceKm: 1.2, tripDistanceKm: 6.4, simulated: false }),
    ).toBe("Rapido Captain ride. 184 rupees. Pickup 1.2 kilometres. Trip 6.4 kilometres.");
  });

  it("says when data was not detected — never invents values", () => {
    const text = buildAnnouncement({ platform: "uber", fare: undefined, pickupDistanceKm: undefined, tripDistanceKm: undefined, simulated: true });
    expect(text).toBe("Simulated. Uber Driver ride. Fare not detected. Pickup distance not detected.");
  });

  it("speaks eligible rides only when enabled, once per ride", async () => {
    await rideStore.init();
    registerVoiceAlerts();
    rideStore.setSettings({ ...DEFAULT_SETTINGS, startHour: 0, endHour: 0 });

    const event = (id: string, fare: number) => ({
      id,
      platform: "rapido" as const,
      title: "New ride request",
      text: `Ride request — ₹${fare} · Pickup 1.0 km · Trip 6.0 km · Cab`,
      postedAt: Date.now(),
      source: "notification" as const,
      removed: false,
    });

    rideStore.setVoiceAlerts(false);
    await rideStore.ingestNotification(event("v1", 201));
    expect(mockSpeak).not.toHaveBeenCalled();

    rideStore.setVoiceAlerts(true);
    await rideStore.ingestNotification(event("v2", 222));
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(String(mockSpeak.mock.calls[0][0])).toContain("222 rupees");

    // Duplicate delivery of the same request is not re-announced.
    await rideStore.ingestNotification(event("v3", 222));
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // Rejected request (low fare) is never announced.
    await rideStore.ingestNotification(event("v4", 20));
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });
});

describe("notification capture tool", () => {
  it("captures redacted samples of ride and non-ride notifications only when enabled", async () => {
    await rideStore.init();
    rideStore.clearSamples();
    rideStore.setCapture(false);
    await rideStore.ingestNotification({
      id: "c0", platform: "uber", title: "Uber Driver", text: "Weekly summary ready", postedAt: Date.now(), source: "notification", removed: false,
    });
    expect(rideStore.getSnapshot().samples).toHaveLength(0);

    rideStore.setCapture(true);
    await rideStore.ingestNotification({
      id: "c1", platform: "rapido", title: "Verification", text: "Your OTP is 482113", postedAt: Date.now(), source: "notification", removed: false,
    });
    const samples = rideStore.getSnapshot().samples;
    expect(samples).toHaveLength(1);
    expect(samples[0].parsedAsRide).toBe(false);
    expect(samples[0].preview).not.toContain("482113");
    rideStore.setCapture(false);
  });

  it("supports labelling, deletion and export", () => {
    const parsed = parseRideNotification("ola", { title: "", text: "New ride — ₹150 · Pickup 1 km" });
    const sample = buildCaptureSample({ platform: "ola", title: "", text: "New ride — ₹150 · Pickup 1 km", source: "notification", simulated: false }, parsed, "manual");
    rideStore.addSample(sample);
    rideStore.labelSample(sample.id, "ride");
    expect(rideStore.getSnapshot().samples.find((s) => s.id === sample.id)?.label).toBe("ride");
    const exported = JSON.parse(rideStore.buildSamplesExport());
    expect(exported.kind).toBe("notification-samples");
    rideStore.deleteSample(sample.id);
    expect(rideStore.getSnapshot().samples.find((s) => s.id === sample.id)).toBeUndefined();
    rideStore.dispose();
  });
});
