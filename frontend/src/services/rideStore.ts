// Single source of truth for ride requests, settings and diagnostics.
// - Sequential (atomic) processing of incoming events via a promise queue.
// - Fingerprint-based duplicate suppression with time-bounded matching.
// - Expiry sweeping for non-terminal requests.
// - Persistence through the shared storage util; capped in-memory history.
// - Structured, redacted diagnostics for every decision.
import { parseRideNotification } from "@/src/parsers";
import { evaluateRide } from "@/src/rules/engine";
import { DEFAULT_SETTINGS, defaultPlatformConfigs } from "@/src/rules/defaults";
import { buildFingerprint, isSameRequest } from "@/src/state/fingerprint";
import { assertTransition, isTerminal } from "@/src/state/machine";
import { previewOf, redactMeta } from "@/src/services/redact";
import { storage } from "@/src/utils/storage";
import type {
  DiagnosticCategory,
  DiagnosticEntry,
  DiagnosticLevel,
  NativeNotificationEvent,
  PlatformConfig,
  RidePlatform,
  RideRequest,
  RideStatus,
  RuleSettings,
} from "@/src/models/types";

const RIDES_CAP = 400;
const LOGS_CAP = 250;
const PERSIST_DEBOUNCE_MS = 150;
const EXPIRY_SWEEP_MS = 5000;

const KEYS = {
  rides: "rideassist_rides_v1",
  logs: "rideassist_logs_v1",
  settings: "rideassist_settings_v1",
  platforms: "rideassist_platforms_v1",
  monitoring: "rideassist_monitoring_v1",
  simulator: "rideassist_simulator_v1",
} as const;

export interface NativePermissionStatus {
  notificationListener: "granted" | "denied" | "unavailable";
  accessibility: "granted" | "denied" | "unavailable";
}

export interface RideAssistState {
  ready: boolean;
  rides: RideRequest[];
  logs: DiagnosticEntry[];
  settings: RuleSettings;
  platformConfigs: PlatformConfig[];
  monitoring: boolean;
  simulatorOn: boolean;
  nativePermission: NativePermissionStatus | null;
}

export interface DailyStats {
  detected: number;
  matching: number;
  acceptedConfirmed: number;
  rejected: number;
  failedOrUnconfirmed: number;
  duplicateObservationsSuppressed: number;
  avgDetectionMs: number | null;
  avgParsingMs: number | null;
  avgEvaluationMs: number | null;
  lastDetectedAt: number | null;
  lastDetectedPreview: string | null;
}

type AutoAcceptHandler = (ride: RideRequest) => void;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The shared storage util handles primitives only — structured state is stored as JSON strings. */
function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : undefined;
  } catch {
    return undefined;
  }
}

export function startOfToday(now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

class RideStore {
  private state: RideAssistState = {
    ready: false,
    rides: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
    platformConfigs: defaultPlatformConfigs(),
    monitoring: false,
    simulatorOn: false,
    nativePermission: null,
  };

  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private autoAcceptHandler: AutoAcceptHandler | null = null;
  private seq = 0;

  // -- React (useSyncExternalStore) ---------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RideAssistState => this.state;

  private setState(patch: Partial<RideAssistState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
    this.schedulePersist();
  }

  // -- Init / persistence ---------------------------------------------------

  async init(): Promise<void> {
    if (this.state.ready) return;
    const [ridesRaw, logsRaw, settingsRaw, platformsRaw, monitoring, simulator] = await Promise.all([
      storage.getItem<string>(KEYS.rides, "[]"),
      storage.getItem<string>(KEYS.logs, "[]"),
      storage.getItem<string>(KEYS.settings, "{}"),
      storage.getItem<string>(KEYS.platforms, "[]"),
      storage.getItem<boolean>(KEYS.monitoring, false),
      storage.getItem<boolean>(KEYS.simulator, false),
    ]);
    const rides = parseJsonArray<RideRequest>(ridesRaw);
    const logs = parseJsonArray<DiagnosticEntry>(logsRaw);
    const platforms = parseJsonArray<PlatformConfig>(platformsRaw);
    const settings = parseJsonObject<RuleSettings>(settingsRaw);

    const now = Date.now();
    // Restart recovery: any request that was still open when the process died
    // is expired — never silently re-armed.
    let expiredOnRecovery = 0;
    const recoveredRides = (rides ?? []).map((ride) => {
      // An acceptance interrupted by process death has an unknown outcome —
      // it must be verified manually, never assumed or retried.
      if (ride.status === "ACCEPT_REQUESTED") {
        return { ...ride, status: "UNKNOWN" as RideStatus, updatedAt: now };
      }
      if (ride.status === "UNKNOWN") return ride;
      if (!isTerminal(ride.status) && ride.expiresAt <= now) {
        expiredOnRecovery += 1;
        return { ...ride, status: "EXPIRED" as RideStatus, updatedAt: now };
      }
      return ride;
    });

    this.state = {
      ...this.state,
      rides: recoveredRides.slice(-RIDES_CAP),
      logs: (logs ?? []).slice(-LOGS_CAP),
      settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
      platformConfigs: defaultPlatformConfigs().map(
        (def) => ({ ...def, ...(platforms.find((p) => p.platform === def.platform) ?? {}) }),
      ),
      monitoring: monitoring ?? false,
      simulatorOn: simulator ?? false,
      ready: true,
    };

    this.log(
      "info",
      "system",
      `Session started — ${recoveredRides.length} request(s) in history`,
      expiredOnRecovery > 0 ? { recoveredAsExpired: expiredOnRecovery } : undefined,
    );

    this.sweepTimer = setInterval(() => this.sweepExpiry(), EXPIRY_SWEEP_MS);
    this.notify();
    this.schedulePersist();
  }

  dispose(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.sweepTimer = null;
    this.persistTimer = null;
  }

  private schedulePersist() {
    if (!this.state.ready) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void this.persist();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persist(): Promise<void> {
    const { rides, logs, settings, platformConfigs, monitoring, simulatorOn } = this.state;
    await Promise.all([
      storage.setItem(KEYS.rides, JSON.stringify(rides.slice(-RIDES_CAP))),
      storage.setItem(KEYS.logs, JSON.stringify(logs.slice(-LOGS_CAP))),
      storage.setItem(KEYS.settings, JSON.stringify(settings)),
      storage.setItem(KEYS.platforms, JSON.stringify(platformConfigs)),
      storage.setItem(KEYS.monitoring, monitoring),
      storage.setItem(KEYS.simulator, simulatorOn),
    ]);
  }

  // -- Diagnostics ----------------------------------------------------------

  log(
    level: DiagnosticLevel,
    category: DiagnosticCategory,
    message: string,
    meta?: Record<string, string | number | boolean | null>,
    rideId?: string,
  ): void {
    const entry: DiagnosticEntry = {
      id: makeId("log"),
      ts: Date.now(),
      level,
      category,
      message: previewOf(message, 200),
      meta: redactMeta(meta),
      rideId,
    };
    this.state = { ...this.state, logs: [...this.state.logs, entry].slice(-LOGS_CAP) };
    this.notify();
    this.schedulePersist();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  // -- Ingest pipeline ------------------------------------------------------

  /** Serialized processing keeps state transitions atomic per event. */
  ingestNotification(event: NativeNotificationEvent): Promise<RideRequest | null> {
    this.queue = this.queue.then(() => this.processEvent(event));
    return this.queue as Promise<RideRequest | null>;
  }

  private async processEvent(event: NativeNotificationEvent): Promise<RideRequest | null> {
    const now = Date.now();
    const detectionMs = Math.max(0, now - event.postedAt);

    // Late notification removal — never acceptance evidence.
    if (event.removed) {
      this.log("info", "detection", `Notification removed for ${event.platform} (not treated as acceptance evidence)`, {
        sourceEventId: event.id,
      });
      return null;
    }

    const parsed = parseRideNotification(event.platform, {
      title: event.title,
      text: event.text,
      subText: event.subText,
    });

    if (!parsed.isRideRequest) {
      this.log("info", "detection", `Ignored non-ride notification from ${event.platform}`, {
        reason: "no ride keywords",
      });
      return null;
    }

    // Duplicate suppression / late-notification reconciliation.
    const fingerprint = buildFingerprint(event.platform, parsed);
    for (let i = this.state.rides.length - 1; i >= 0; i -= 1) {
      const existing = this.state.rides[i];
      if (existing.platform !== event.platform) continue;
      if (!isSameRequest(fingerprint, now, existing.fingerprint, existing.detectedAt)) continue;
      if (isTerminal(existing.status)) {
        this.log("info", "detection", `Late notification for already-decided request ignored`, {
          rideStatus: existing.status,
        });
        return null;
      }
      // Same active request seen again (notification update / repeat delivery).
      const updated: RideRequest = {
        ...existing,
        observationCount: existing.observationCount + 1,
        updatedAt: now,
        simulated: existing.simulated || !!event.simulated,
      };
      this.replaceRide(updated);
      this.log("info", "detection", `Duplicate observation suppressed for ${event.platform} request`, {
        observationCount: updated.observationCount,
      });
      return updated;
    }

    // New request.
    this.seq += 1;
    const id = `r_${event.platform}_${now}_${this.seq}`;
    const missingFields = parsed.missingFields;
    let ride: RideRequest = {
      id,
      platform: event.platform,
      sourceEventId: event.id,
      fare: parsed.fare,
      pickupDistanceKm: parsed.pickupDistanceKm,
      tripDistanceKm: parsed.tripDistanceKm,
      category: parsed.category,
      detectedAt: event.postedAt,
      confidence: parsed.confidence,
      status: "DETECTED",
      missingFields,
      fingerprint,
      updatedAt: now,
      expiresAt: event.postedAt + this.state.settings.maxRequestAgeSec * 1000,
      observationCount: 1,
      rawPreview: parsed.rawPreview,
      simulated: !!event.simulated,
      latency: { detectionMs },
    };
    this.state = { ...this.state, rides: [...this.state.rides, ride].slice(-RIDES_CAP) };
    this.notify();

    // DETECTED → PARSING
    ride = this.transition(ride.id, "PARSING", {
      logMessage: "Parsing notification content",
      logCategory: "parsing",
    }) ?? ride;

    // PARSING → EVALUATING (parse finished with the fields above)
    const parseDoneAt = Date.now();
    ride = this.transition(ride.id, "EVALUATING", {
      patch: { latency: { ...ride.latency, parsingMs: parseDoneAt - now } },
      logMessage: `Parsed — fare: ${parsed.fare ?? "not detected"}, pickup: ${parsed.pickupDistanceKm ?? "not detected"} km, trip: ${parsed.tripDistanceKm ?? "not detected"} km, confidence ${(parsed.confidence * 100).toFixed(0)}%`,
      logCategory: "parsing",
      logMeta: { missingFields: missingFields.join(",") || "none" },
    }) ?? ride;

    // EVALUATING → decision
    const evaluateStarted = Date.now();
    const decision = evaluateRide(
      {
        platform: ride.platform,
        detectedAt: ride.detectedAt,
        confidence: ride.confidence,
        fare: ride.fare,
        pickupDistanceKm: ride.pickupDistanceKm,
        tripDistanceKm: ride.tripDistanceKm,
        category: ride.category,
        missingFields: ride.missingFields,
      },
      this.state.settings,
      this.state.platformConfigs,
      now,
    );
    const nextStatus: RideStatus = decision.eligible ? "AWAITING_CONFIRMATION" : "REJECTED";
    ride = this.transition(ride.id, nextStatus, {
      patch: {
        ruleResult: decision,
        latency: { ...ride.latency, evaluationMs: Date.now() - evaluateStarted },
      },
      logMessage: decision.eligible
        ? `Rules PASSED — eligible for acceptance (${decision.checks.filter((c) => c.passed === true).length} checks passed)`
        : `Rules REJECTED — ${decision.reasons[0] ?? "not eligible"}`,
      logCategory: "rules",
      logLevel: decision.eligible ? "info" : "warn",
      logMeta: { eligible: decision.eligible, failedChecks: decision.reasons.length },
    }) ?? ride;

    if (decision.eligible && this.autoAcceptHandler) {
      this.autoAcceptHandler(ride);
    }

    this.notify();
    this.schedulePersist();
    return ride;
  }

  // -- Mutations ------------------------------------------------------------

  transition(
    rideId: string,
    to: RideStatus,
    opts?: {
      patch?: Partial<RideRequest>;
      logMessage?: string;
      logLevel?: DiagnosticLevel;
      logCategory?: DiagnosticCategory;
      logMeta?: Record<string, string | number | boolean | null>;
    },
  ): RideRequest | null {
    const ride = this.state.rides.find((r) => r.id === rideId);
    if (!ride) return null;
    try {
      assertTransition(ride.status, to);
    } catch (error) {
      this.log(
        "error",
        "state",
        `Blocked illegal transition ${ride.status} → ${to}`,
        { reason: error instanceof Error ? error.message : "unknown" },
        rideId,
      );
      return null;
    }
    const updated: RideRequest = { ...ride, ...opts?.patch, status: to, updatedAt: Date.now() };
    this.replaceRide(updated);
    if (opts?.logMessage) {
      this.log(opts.logLevel ?? "info", opts.logCategory ?? "state", opts.logMessage, opts.logMeta, rideId);
    } else {
      this.log("debug", "state", `Status ${ride.status} → ${to}`, undefined, rideId);
    }
    return updated;
  }

  private replaceRide(updated: RideRequest) {
    const rides = this.state.rides.map((r) => (r.id === updated.id ? updated : r));
    this.state = { ...this.state, rides };
    this.notify();
    this.schedulePersist();
  }

  getRide(rideId: string): RideRequest | undefined {
    return this.state.rides.find((r) => r.id === rideId);
  }

  sweepExpiry(): number {
    const now = Date.now();
    let changed = 0;
    for (const ride of this.state.rides) {
      if (isTerminal(ride.status)) continue;
      // An in-flight acceptance or an UNKNOWN outcome must never silently
      // expire — it needs evidence or explicit manual verification.
      if (ride.status === "ACCEPT_REQUESTED" || ride.status === "UNKNOWN") continue;
      if (ride.expiresAt <= now) {
        const expired = this.transition(ride.id, "EXPIRED", {
          logMessage: `Request expired after ${this.state.settings.maxRequestAgeSec}s without action`,
          logCategory: "state",
          logLevel: "warn",
        });
        if (expired) changed += 1;
      }
    }
    if (changed > 0) this.notify();
    return changed;
  }

  dismissRide(rideId: string, reason = "Dismissed by user"): RideRequest | null {
    return this.transition(rideId, "REJECTED", {
      logMessage: reason,
      logCategory: "state",
      logLevel: "info",
    });
  }

  setSettings(settings: RuleSettings): void {
    this.setState({ settings });
    this.log("info", "system", "Ride filter settings updated");
  }

  setPlatformConfig(platform: RidePlatform, patch: Partial<PlatformConfig>): void {
    const platformConfigs = this.state.platformConfigs.map((p) =>
      p.platform === platform ? { ...p, ...patch } : p,
    );
    this.setState({ platformConfigs });
    this.log("info", "system", `Platform config updated for ${platform}`, {
      ...(patch.detectionEnabled !== undefined ? { detectionEnabled: patch.detectionEnabled } : {}),
      ...(patch.acceptanceAssistEnabled !== undefined ? { acceptanceAssistEnabled: patch.acceptanceAssistEnabled } : {}),
      ...(patch.packageName !== undefined ? { packageNameChanged: true } : {}),
    });
  }

  setMonitoring(on: boolean): void {
    this.setState({ monitoring: on });
    this.log("info", "permission", on ? "Monitoring started" : "Monitoring paused", {
      nativeListenerAvailable: this.state.nativePermission?.notificationListener ?? "unknown",
    });
  }

  setSimulator(on: boolean): void {
    this.setState({ simulatorOn: on });
    this.log("info", "simulator", on ? "Simulation mode enabled" : "Simulation mode disabled");
  }

  setNativePermission(status: NativePermissionStatus | null): void {
    this.setState({ nativePermission: status });
    if (status) {
      this.log("info", "permission", "Native permission status refreshed", {
        notificationListener: status.notificationListener,
        accessibility: status.accessibility,
      });
    }
  }

  clearAllData(): void {
    this.state = {
      ...this.state,
      rides: [],
      logs: [],
      settings: DEFAULT_SETTINGS,
      platformConfigs: defaultPlatformConfigs(),
      monitoring: false,
      simulatorOn: false,
    };
    this.notify();
    this.schedulePersist();
    this.log("info", "system", "All local data deleted — settings reset to defaults");
  }

  // -- Selectors ------------------------------------------------------------

  computeDailyStats(now: number = Date.now()): DailyStats {
    const todayStart = startOfToday(now);
    const todays = this.state.rides.filter((r) => r.detectedAt >= todayStart);
    const withLatency = todays.filter((r) => r.latency);
    const avg = (pick: (l: NonNullable<RideRequest["latency"]>) => number | undefined): number | null => {
      const values = withLatency.map((r) => pick(r.latency!)).filter((v): v is number => v !== undefined);
      if (values.length === 0) return null;
      return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    };
    const last = todays.length > 0 ? todays[todays.length - 1] : null;
    return {
      detected: todays.length,
      matching: todays.filter((r) => r.ruleResult?.eligible && !isTerminal(r.status)).length,
      acceptedConfirmed: todays.filter((r) => r.status === "ACCEPTED" && r.acceptance?.evidence?.status === "CONFIRMED").length,
      rejected: todays.filter((r) => r.status === "REJECTED" && r.ruleResult && !r.ruleResult.eligible).length,
      failedOrUnconfirmed: todays.filter((r) => r.status === "FAILED" || r.status === "UNKNOWN").length,
      duplicateObservationsSuppressed: todays.reduce((sum, r) => sum + Math.max(0, r.observationCount - 1), 0),
      avgDetectionMs: avg((l) => l.detectionMs),
      avgParsingMs: avg((l) => l.parsingMs),
      avgEvaluationMs: avg((l) => l.evaluationMs),
      lastDetectedAt: last?.detectedAt ?? null,
      lastDetectedPreview: last?.rawPreview ?? null,
    };
  }

  buildDiagnosticExport(): string {
    const { rides, logs, settings, platformConfigs } = this.state;
    return JSON.stringify(
      {
        app: "RideAssist",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        redaction: "OTPs, passwords, phone numbers and long digit runs removed; full notification content never stored",
        settings,
        platformConfigs,
        rides: rides.map((r) => ({
          id: r.id,
          platform: r.platform,
          status: r.status,
          fare: r.fare ?? null,
          pickupDistanceKm: r.pickupDistanceKm ?? null,
          tripDistanceKm: r.tripDistanceKm ?? null,
          category: r.category ?? null,
          confidence: r.confidence,
          detectedAt: new Date(r.detectedAt).toISOString(),
          missingFields: r.missingFields,
          observationCount: r.observationCount,
          simulated: r.simulated,
          ruleReasons: r.ruleResult?.reasons ?? [],
          acceptance: r.acceptance
            ? {
                provider: r.acceptance.provider,
                attempts: r.acceptance.attempts.length,
                evidence: r.acceptance.evidence ?? null,
              }
            : null,
          latency: r.latency ?? null,
          rawPreview: r.rawPreview,
        })),
        logs,
      },
      null,
      2,
    );
  }

  // -- Auto-accept hook (registered by services/acceptance.ts) --------------

  setAutoAcceptHandler(handler: AutoAcceptHandler | null): void {
    this.autoAcceptHandler = handler;
  }
}

export const rideStore = new RideStore();
