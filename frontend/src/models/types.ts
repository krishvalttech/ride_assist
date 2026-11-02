// RideAssist core domain types. Strict — no `any`.
// Spec model (RidePlatform / RideStatus / RideRequest) with extensions for
// fingerprinting, latency diagnostics and acceptance evidence.

export type RidePlatform = "rapido" | "uber" | "ola";

export type RideStatus =
  | "DETECTED"
  | "PARSING"
  | "EVALUATING"
  | "REJECTED"
  | "AWAITING_CONFIRMATION"
  | "ACCEPT_REQUESTED"
  | "ACCEPTED"
  | "FAILED"
  | "EXPIRED"
  | "UNKNOWN";

export type MissingField = "fare" | "pickupDistanceKm" | "tripDistanceKm" | "category";

export type RequiredField = MissingField;

export interface LatencyMarks {
  /** ms from notification postedAt to ingestion (detection latency). */
  detectionMs?: number;
  /** ms from ingestion to parsing completed. */
  parsingMs?: number;
  /** ms from parsing completed to rule evaluation completed. */
  evaluationMs?: number;
  /** ms from evaluation to interaction requested. */
  interactionMs?: number;
  /** ms from interaction requested to acceptance evidence received. */
  evidenceMs?: number;
}

export type AcceptanceEvidenceStatus = "CONFIRMED" | "NOT_CONFIRMED" | "UNKNOWN";

export interface AcceptanceAttempt {
  at: number;
  outcome: "REQUESTED" | "UNAVAILABLE" | "FAILED";
  reason?: string;
  provider: string;
}

export interface AcceptanceEvidence {
  status: AcceptanceEvidenceStatus;
  /** Where the evidence came from, e.g. "user-manual", "simulated", "native". */
  source: string;
  reason?: string;
  at: number;
}

export interface AcceptanceRecord {
  provider: string;
  attempts: AcceptanceAttempt[];
  evidence?: AcceptanceEvidence;
}

export interface RideRequest {
  id: string;
  platform: RidePlatform;
  sourceEventId: string;
  fare?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  category?: string;
  pickupLocation?: string;
  dropLocation?: string;
  detectedAt: number;
  confidence: number;
  status: RideStatus;
  missingFields: MissingField[];
  /** Stable, non-sensitive fingerprint used to dedupe repeat notifications. */
  fingerprint: string;
  updatedAt: number;
  /** Epoch ms after which the request is no longer actionable. */
  expiresAt: number;
  ruleResult?: RuleDecision;
  latency?: LatencyMarks;
  acceptance?: AcceptanceRecord;
  /** Times this request was re-observed (notification updates / repeats). */
  observationCount: number;
  /** Redacted preview of the source notification — never full raw content. */
  rawPreview: string;
  /** True when injected by the built-in simulator rather than a real listener. */
  simulated: boolean;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export type AcceptanceMode = "manual" | "auto-permitted";

export interface RuleCheck {
  id: string;
  label: string;
  /** true = passed, false = failed, null = skipped (insufficient data). */
  passed: boolean | null;
  detail: string;
}

export interface RuleDecision {
  eligible: boolean;
  checks: RuleCheck[];
  /** Human-readable reasons for every failed check. */
  reasons: string[];
  evaluatedAt: number;
}

export interface RuleSettings {
  /** Minimum fare in ₹. */
  minFare: number;
  /** Maximum pickup distance in km. */
  maxPickupKm: number;
  /** Minimum estimated trip distance in km (when available). */
  minTripKm: number;
  /** Minimum fare per km (when fare and trip distance are both valid). */
  minFarePerKm: number;
  /** Allowed operating hours — startHour (inclusive) … endHour (exclusive, may wrap past midnight). */
  startHour: number;
  endHour: number;
  /** Maximum age of an incoming request, seconds. */
  maxRequestAgeSec: number;
  /** Minimum data confidence 0..1 required for eligibility. */
  minConfidence: number;
  /** Fields that must be present before a request can qualify. */
  requiredFields: RequiredField[];
  platformEnabled: Record<RidePlatform, boolean>;
  allowedCategories: Record<RidePlatform, string[]>;
  acceptanceMode: AcceptanceMode;
  /** Optional case-insensitive keywords to reject when found in destination (dropLocation). */
  excludedDropKeywords?: string[];
}

// ---------------------------------------------------------------------------
// Platform configuration
// ---------------------------------------------------------------------------

export interface PlatformConfig {
  platform: RidePlatform;
  /** Editable Android package id. Pre-filled but marked unverified until the
   *  user confirms it on their device — we never treat a guess as verified. */
  packageName: string;
  detectionEnabled: boolean;
  acceptanceAssistEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Native bridge events
// ---------------------------------------------------------------------------

export type NativeEventSource = "notification" | "screen";

export interface NativeNotificationEvent {
  id: string;
  platform: RidePlatform;
  title: string;
  text: string;
  subText?: string;
  postedAt: number;
  source: NativeEventSource;
  removed: boolean;
  /** Set only by the built-in simulator. */
  simulated?: boolean;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticCategory =
  | "detection"
  | "parsing"
  | "rules"
  | "state"
  | "acceptance"
  | "permission"
  | "simulator"
  | "system";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface DiagnosticEntry {
  id: string;
  ts: number;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  message: string;
  rideId?: string;
  meta?: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Capture Tool samples (redacted) for parser tuning
// ---------------------------------------------------------------------------

export interface CaptureSample {
  id: string;
  ts: number;
  platform: RidePlatform;
  source: NativeEventSource;
  /** "live" = captured from the listener/simulator, "manual" = pasted by the user. */
  origin: "live" | "manual";
  simulated: boolean;
  /** Redacted, bounded notification text. */
  preview: string;
  parsedAsRide: boolean;
  fare?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  category?: string;
  confidence: number;
  missingFields: MissingField[];
  /** User's ground-truth label used to judge the parser. */
  label: "ride" | "not-ride" | null;
}

// ---------------------------------------------------------------------------
// Parsed ride (output of a platform parser)
// ---------------------------------------------------------------------------

export interface ParsedRide {
  fare?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  category?: string;
  /** Short, redacted pickup label when the source exposes it. */
  pickupLocation?: string;
  /** Short, redacted drop label when the source exposes it. */
  dropLocation?: string;
  confidence: number;
  missingFields: MissingField[];
  /** True when the parser believes this notification is actually a ride request. */
  isRideRequest: boolean;
  rawPreview: string;
  parserVersion?: string;
}
