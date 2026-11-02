// Acceptance abstraction: the core app never depends on a specific driver
// app's UI. Providers distinguish an ATTEMPTED interaction (REQUESTED) from a
// CONFIRMED acceptance — and anything ambiguous stays UNKNOWN.
//
// HONESTY NOTE: the native accessibility tap adapter is opt-in per platform
// and UNVERIFIED on real Rapido/Uber/Ola versions. It uses only the standard
// accessibility click on a visible Accept control (no root/ADB/uinput), and
// any failure falls back to the manual approval flow.
import { nativeBridge } from "@/src/services/nativeBridge";
import { previewOf } from "@/src/services/redact";
import { rideStore } from "@/src/services/rideStore";
import { subscriptionService } from "@/src/services/subscription";
import type { RideRequest } from "@/src/models/types";

export interface AcceptanceRequestResult {
  status: "REQUESTED" | "UNAVAILABLE" | "FAILED";
  reason?: string;
}

export interface AcceptanceEvidenceResult {
  status: "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";
  reason?: string;
  source: string;
}

export interface AcceptanceProvider {
  readonly name: string;
  isSupported(platform: RideRequest["platform"]): Promise<boolean>;
  requestAcceptance(requestId: string): Promise<AcceptanceRequestResult>;
  getAcceptanceEvidence(requestId: string): Promise<AcceptanceEvidenceResult>;
}

const EVIDENCE_TIMEOUT_MS = 15000;

const MANUAL_REASON =
  "Manual approval mode performs no on-screen interaction — accept in the driver app, then confirm here.";

/** Fully working fallback: the user accepts in the driver app and confirms here. */
export const manualAcceptanceProvider: AcceptanceProvider = {
  name: "user-manual",
  async isSupported() {
    return true;
  },
  async requestAcceptance() {
    return { status: "UNAVAILABLE" as const, reason: MANUAL_REASON };
  },
  async getAcceptanceEvidence() {
    // Evidence for manual mode comes from the user's explicit confirmation,
    // handled by confirmManualEvidence() — never assumed.
    return { status: "UNKNOWN" as const, reason: "Requires explicit user verification", source: "user-manual" };
  },
};

/**
 * Simulation provider — ONLY used for rides created by the built-in
 * simulator. Demonstrates the full REQUESTED → evidence flow, including a
 * realistic share of NOT_CONFIRMED outcomes.
 */
export const simulatedAcceptanceProvider: AcceptanceProvider = {
  name: "simulated",
  async isSupported() {
    return true;
  },
  async requestAcceptance(requestId) {
    const ride = rideStore.getRide(requestId);
    if (!ride?.simulated) return { status: "UNAVAILABLE" as const, reason: "Not a simulated request" };
    await delay(600);
    return { status: "REQUESTED" as const, reason: "Simulated interaction with a driver app" };
  },
  async getAcceptanceEvidence(requestId) {
    const ride = rideStore.getRide(requestId);
    if (!ride?.simulated) return { status: "UNKNOWN" as const, source: "simulated", reason: "Not a simulated request" };
    await delay(1000);
    return Math.random() < 0.85
      ? { status: "CONFIRMED" as const, source: "simulated", reason: "Simulated platform confirmation" }
      : { status: "NOT_CONFIRMED" as const, source: "simulated", reason: "Simulated platform reported the request was no longer available" };
  },
};

const EVIDENCE_POLL_MS = 1000;
const EVIDENCE_POLLS = 8;

/**
 * Native accessibility provider (opt-in, UNVERIFIED on real app versions).
 * Taps a single visible "Accept" control via the standard accessibility API
 * only when the driver enabled it for that platform. A tap is REQUESTED,
 * never ACCEPTED — confirmation needs a positive post-accept screen.
 */
export const nativeAcceptanceProvider: AcceptanceProvider = {
  name: "native-accessibility",
  async isSupported() {
    if (!nativeBridge.isAvailable()) return false;
    return rideStore.getSnapshot().nativePermission?.accessibility === "granted";
  },
  async requestAcceptance(requestId) {
    const ride = rideStore.getRide(requestId);
    if (!ride) return { status: "FAILED" as const, reason: "Request not found" };
    const result = nativeBridge.requestAcceptance(ride.platform, ride.fare);
    if (!result) return { status: "UNAVAILABLE" as const, reason: "Native module not available in this build" };
    const status = result.status === "REQUESTED" || result.status === "FAILED" ? result.status : "UNAVAILABLE";
    return { status, reason: result.reason };
  },
  async getAcceptanceEvidence(requestId) {
    const ride = rideStore.getRide(requestId);
    if (!ride) return { status: "UNKNOWN" as const, source: "native", reason: "Request not found" };
    let last: AcceptanceEvidenceResult = { status: "UNKNOWN", source: "native", reason: "No reliable confirmation on screen" };
    for (let i = 0; i < EVIDENCE_POLLS; i += 1) {
      await delay(EVIDENCE_POLL_MS);
      const result = nativeBridge.getAcceptanceEvidence(ride.platform);
      if (!result) break;
      last = {
        status: result.status === "CONFIRMED" || result.status === "NOT_CONFIRMED" ? result.status : "UNKNOWN",
        source: "native",
        reason: result.reason,
      };
      if (last.status === "CONFIRMED") break;
    }
    return last;
  },
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class AcceptanceManager {
  private inFlight = new Set<string>();

  providerFor(ride: RideRequest): AcceptanceProvider {
    if (ride.simulated) return simulatedAcceptanceProvider;
    const snap = rideStore.getSnapshot();
    const config = snap.platformConfigs.find((p) => p.platform === ride.platform);
    if (config?.acceptanceAssistEnabled && nativeBridge.isAvailable()) return nativeAcceptanceProvider;
    return manualAcceptanceProvider;
  }

  /**
   * User tapped "Accept" on an AWAITING_CONFIRMATION request (or auto-accept
   * triggered when explicitly opted in).
   * Runs the selected provider, then collects evidence ONCE.
   * Unknown outcomes land in UNKNOWN status for manual verification —
   * acceptance is never blindly retried.
   */
  async initiateAcceptance(rideId: string): Promise<{ ok: boolean; message: string; manualFallback?: boolean }> {
    if (this.inFlight.has(rideId)) {
      return { ok: false, message: "This request is already being handled" };
    }
    const ride = rideStore.getRide(rideId);
    if (!ride) return { ok: false, message: "Request not found" };
    if (ride.status !== "AWAITING_CONFIRMATION") {
      return { ok: false, message: `Request is ${ride.status.replace(/_/g, " ").toLowerCase()} — cannot accept now` };
    }
    if (ride.acceptance?.attempts?.some((a) => a.outcome === "REQUESTED")) {
      return { ok: false, message: "Acceptance was already attempted for this request" };
    }

    // Entitlement Guard: Auto-accept requires an active subscription pass
    if (!ride.simulated) {
      const sub = await subscriptionService.getCachedSubscription();
      if (!sub || !sub.has_access) {
        rideStore.log(
          "warn",
          "acceptance",
          `Auto-accept blocked: Active subscription pass required. Request awaits manual driver approval.`,
          undefined,
          ride.id,
        );
        return {
          ok: false,
          message: "Active subscription pass required for auto-acceptance assistance. Request awaits manual driver approval.",
          manualFallback: true,
        };
      }
    }

    const provider = this.providerFor(ride);
    this.inFlight.add(rideId);
    try {
      const requested = await provider.requestAcceptance(rideId);
      const attempts = [
        ...(ride.acceptance?.attempts ?? []),
        { at: Date.now(), outcome: requested.status, reason: requested.reason, provider: provider.name },
      ];

      if (requested.status === "REQUESTED") {
        const requestedAt = Date.now();
        const updated = rideStore.transition(rideId, "ACCEPT_REQUESTED", {
          patch: {
            acceptance: { provider: provider.name, attempts },
            latency: {
              ...ride.latency,
              interactionMs: Math.max(0, requestedAt - (ride.ruleResult?.evaluatedAt ?? requestedAt)),
            },
          },
          logMessage: `Acceptance interaction requested via ${provider.name}`,
          logCategory: "acceptance",
          logMeta: { provider: provider.name },
        });
        if (!updated) return { ok: false, message: "Request changed state — interaction cancelled" };
        return this.collectEvidence(rideId, provider);
      }

      // UNAVAILABLE / FAILED tap (or manual mode) → guide the user through manual acceptance.
      rideStore.log(
        requested.status === "FAILED" ? "warn" : "info",
        "acceptance",
        requested.reason ?? MANUAL_REASON,
        { provider: provider.name, outcome: requested.status },
        rideId,
      );
      return { ok: true, message: requested.reason ?? MANUAL_REASON, manualFallback: true };
    } finally {
      this.inFlight.delete(rideId);
    }
  }

  private async collectEvidence(rideId: string, provider: AcceptanceProvider): Promise<{ ok: boolean; message: string }> {
    const ride = rideStore.getRide(rideId);
    if (!ride) return { ok: false, message: "Request not found" };
    const requestedAt = ride.acceptance?.attempts[ride.acceptance.attempts.length - 1]?.at ?? Date.now();
    const withEvidenceLatency = () => ({ ...ride.latency, evidenceMs: Math.max(0, Date.now() - requestedAt) });
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      // Bounded wait: a provider that never answers yields UNKNOWN, never success.
      const timeoutPromise = new Promise<AcceptanceEvidenceResult>((resolve) => {
        timeoutId = setTimeout(
          () => resolve({ status: "UNKNOWN", source: provider.name, reason: "Timed out waiting for acceptance evidence" }),
          EVIDENCE_TIMEOUT_MS,
        );
        if (typeof (timeoutId as unknown as { unref?: () => void })?.unref === "function") {
          (timeoutId as unknown as { unref: () => void }).unref();
        }
      });
      const evidence = await Promise.race([
        provider.getAcceptanceEvidence(rideId),
        timeoutPromise,
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      if (evidence.status === "CONFIRMED") {
        const accepted = rideStore.transition(rideId, "ACCEPTED", {
          patch: {
            latency: withEvidenceLatency(),
            acceptance: {
              provider: provider.name,
              attempts: ride.acceptance?.attempts ?? [],
              evidence: { status: "CONFIRMED", source: evidence.source, reason: evidence.reason, at: Date.now() },
            },
          },
          logMessage: `Acceptance CONFIRMED (evidence: ${evidence.source})`,
          logCategory: "acceptance",
        });
        if (!accepted) return { ok: false, message: "Request changed state before confirmation — verify in the driver app" };
        return { ok: true, message: "Acceptance confirmed" };
      }
      if (evidence.status === "NOT_CONFIRMED") {
        rideStore.transition(rideId, "FAILED", {
          patch: {
            acceptance: {
              provider: provider.name,
              attempts: ride.acceptance?.attempts ?? [],
              evidence: { status: "NOT_CONFIRMED", source: evidence.source, reason: evidence.reason, at: Date.now() },
            },
          },
          logMessage: `Acceptance NOT confirmed — ${evidence.reason ?? "platform did not confirm"}`,
          logCategory: "acceptance",
          logLevel: "warn",
        });
        return { ok: false, message: evidence.reason ?? "Acceptance was not confirmed" };
      }
      // UNKNOWN — conflicting or absent evidence. Manual verification required.
      rideStore.transition(rideId, "UNKNOWN", {
        patch: {
          acceptance: {
            provider: provider.name,
            attempts: ride.acceptance?.attempts ?? [],
            evidence: { status: "UNKNOWN", source: evidence.source, reason: evidence.reason, at: Date.now() },
          },
        },
        logMessage: "Acceptance outcome UNKNOWN — manual verification required",
        logCategory: "acceptance",
        logLevel: "warn",
      });
      return { ok: false, message: "Outcome unknown — verify in the driver app" };
    } catch (error) {
      rideStore.transition(rideId, "UNKNOWN", {
        logMessage: `Evidence collection failed: ${previewOf(error instanceof Error ? error.message : "unknown error", 80)}`,
        logCategory: "acceptance",
        logLevel: "error",
      });
      return { ok: false, message: "Evidence collection failed — verify manually" };
    }
  }

  /**
   * User-driven evidence from the confirmation sheet:
   * "I accepted it in the app" / "It was not accepted".
   */
  confirmManualEvidence(rideId: string, accepted: boolean): { ok: boolean; message: string } {
    const ride = rideStore.getRide(rideId);
    if (!ride) return { ok: false, message: "Request not found" };
    if (ride.status !== "AWAITING_CONFIRMATION" && ride.status !== "ACCEPT_REQUESTED") {
      return { ok: false, message: `Request is ${ride.status.replace(/_/g, " ").toLowerCase()}` };
    }
    const provider = "user-manual";
    const current = ride.status === "AWAITING_CONFIRMATION"
      ? rideStore.transition(rideId, "ACCEPT_REQUESTED", {
          patch: {
            acceptance: {
              provider,
              attempts: [{ at: Date.now(), outcome: "REQUESTED", reason: "User accepted in the driver app", provider }],
            },
          },
          logMessage: "User reports accepting in the driver app",
          logCategory: "acceptance",
        })
      : ride;
    if (!current) return { ok: false, message: "Request changed state" };
    if (accepted) {
      const done = rideStore.transition(rideId, "ACCEPTED", {
        patch: {
          acceptance: current.acceptance
            ? { ...current.acceptance, evidence: { status: "CONFIRMED", source: "user-manual", at: Date.now() } }
            : current.acceptance,
        },
        logMessage: "Acceptance CONFIRMED by user in-app verification",
        logCategory: "acceptance",
      });
      return { ok: !!done, message: "Marked as accepted (user confirmed)" };
    }
    rideStore.transition(rideId, "FAILED", {
      patch: {
        acceptance: current.acceptance
          ? { ...current.acceptance, evidence: { status: "NOT_CONFIRMED", source: "user-manual", at: Date.now() } }
          : current.acceptance,
      },
      logMessage: "User reports the request was not accepted",
      logCategory: "acceptance",
      logLevel: "warn",
    });
    return { ok: true, message: "Marked as not accepted" };
  }

  /** Resolve an UNKNOWN outcome through explicit manual verification. */
  verifyUnknownOutcome(rideId: string, accepted: boolean): { ok: boolean; message: string } {
    const ride = rideStore.getRide(rideId);
    if (!ride || ride.status !== "UNKNOWN") return { ok: false, message: "Request is not awaiting verification" };
    if (accepted) {
      rideStore.transition(rideId, "ACCEPTED", {
        patch: {
          acceptance: {
            provider: ride.acceptance?.provider ?? "user-manual",
            attempts: ride.acceptance?.attempts ?? [],
            evidence: { status: "CONFIRMED", source: "user-manual", at: Date.now() },
          },
        },
        logMessage: "UNKNOWN outcome resolved as ACCEPTED by user verification",
        logCategory: "acceptance",
      });
      return { ok: true, message: "Marked as accepted (user verified)" };
    }
    rideStore.transition(rideId, "FAILED", {
      patch: {
        acceptance: {
          provider: ride.acceptance?.provider ?? "user-manual",
          attempts: ride.acceptance?.attempts ?? [],
          evidence: { status: "NOT_CONFIRMED", source: "user-manual", at: Date.now() },
        },
      },
      logMessage: "UNKNOWN outcome resolved as FAILED by user verification",
      logCategory: "acceptance",
      logLevel: "warn",
    });
    return { ok: true, message: "Marked as not accepted" };
  }

  /**
   * Auto-accept hook: only fires for eligible requests when the user chose
   * "auto (where permitted)" AND enabled acceptanceAssistEnabled for that
   * platform AND a provider actually supports the platform.
   */
  async autoConsider(ride: RideRequest): Promise<void> {
    if (ride.status !== "AWAITING_CONFIRMATION") return;
    const settings = rideStore.getSnapshot().settings;
    if (settings.acceptanceMode !== "auto-permitted") return;
    const config = rideStore.getSnapshot().platformConfigs.find((p) => p.platform === ride.platform);
    if (!config?.acceptanceAssistEnabled) return;

    const provider = this.providerFor(ride);
    const supported = await provider.isSupported(ride.platform).catch(() => false);
    if (!supported) {
      rideStore.log(
        "warn",
        "acceptance",
        `Automatic acceptance unavailable for ${ride.platform} — Accessibility is off or not supported in this build. Request awaits manual approval.`,
        { provider: provider.name },
        ride.id,
      );
      return;
    }
    await this.initiateAcceptance(ride.id);
  }
}

function registerAutoAcceptHook(): void {
  rideStore.setAutoAcceptHandler((ride) => {
    void acceptanceManager.autoConsider(ride);
  });
}

export const acceptanceManager = new AcceptanceManager();
export { registerAutoAcceptHook };

// Re-export for convenience in screens.
export { nativeBridge };
