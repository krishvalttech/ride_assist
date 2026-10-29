// Deterministic, platform-independent rules engine.
// Pure functions only: no clock reads, no I/O — `now` is injected so the same
// inputs always produce the same decision (unit-tested).
import type {
  MissingField,
  PlatformConfig,
  RidePlatform,
  RuleCheck,
  RuleDecision,
  RuleSettings,
} from "@/src/models/types";
import { formatINR } from "@/src/services/platformRegistry";

export interface EvaluateInput {
  platform: RidePlatform;
  detectedAt: number;
  confidence: number;
  fare?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  category?: string;
  missingFields: MissingField[];
}

/** Hour-of-day window check; supports wrap-past-midnight (e.g. 22 → 6). */
export function hourInRange(hour: number, startHour: number, endHour: number): boolean {
  if (hour < 0 || hour > 23) return false;
  if (startHour === endHour) return true; // full 24h
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/**
 * Fare value 0 is treated as missing (a zero fare is not a usable value);
 * 0 km pickup is valid (passenger is at the driver's location).
 */
function presentValue(value: number | undefined, zeroCountsAsMissing: boolean): boolean {
  if (value === undefined || !Number.isFinite(value)) return false;
  return zeroCountsAsMissing ? value > 0 : value >= 0;
}

export function evaluateRide(
  input: EvaluateInput,
  settings: RuleSettings,
  platformConfigs: PlatformConfig[],
  now: number = Date.now(),
): RuleDecision {
  const checks: RuleCheck[] = [];
  const reasons: string[] = [];

  const push = (id: string, label: string, passed: boolean | null, detail: string) => {
    checks.push({ id, label, passed, detail });
    if (passed === false) reasons.push(detail);
  };

  // 1. Platform enabled.
  const platformConfig = platformConfigs.find((p) => p.platform === input.platform);
  const platformEnabled = settings.platformEnabled[input.platform] && !!platformConfig?.detectionEnabled;
  push(
    "platform_enabled",
    "Platform enabled",
    platformEnabled,
    platformEnabled
      ? "Platform detection is enabled"
      : `Detection for ${input.platform} is disabled in platform settings`,
  );

  // 2. Operating hours (evaluated against `now`).
  const hour = new Date(now).getHours();
  const hoursOk = hourInRange(hour, settings.startHour, settings.endHour);
  push(
    "operating_hours",
    "Operating hours",
    hoursOk,
    hoursOk
      ? `Current hour ${hour}:00 is inside ${String(settings.startHour).padStart(2, "0")}:00–${String(settings.endHour).padStart(2, "0")}:00`
      : `Current hour ${hour}:00 is outside allowed hours ${String(settings.startHour).padStart(2, "0")}:00–${String(settings.endHour).padStart(2, "0")}:00`,
  );

  // 3. Request age.
  const ageSec = Math.max(0, Math.round((now - input.detectedAt) / 1000));
  const ageOk = ageSec <= settings.maxRequestAgeSec;
  push(
    "request_age",
    "Request age",
    ageOk,
    ageOk
      ? `Request is ${ageSec}s old (limit ${settings.maxRequestAgeSec}s)`
      : `Request is ${ageSec}s old, older than the ${settings.maxRequestAgeSec}s limit`,
  );

  // 4. Required fields — a zero fare / zero trip is as useless as a missing one.
  const effectiveMissing = new Set<MissingField>(input.missingFields);
  if (!presentValue(input.fare, true)) effectiveMissing.add("fare");
  if (!presentValue(input.tripDistanceKm, true)) effectiveMissing.add("tripDistanceKm");
  const missingRequired = settings.requiredFields.filter((f) => effectiveMissing.has(f));
  const requiredOk = missingRequired.length === 0;
  push(
    "required_fields",
    "Required fields",
    requiredOk,
    requiredOk
      ? "All required fields are present"
      : `Missing required field(s): ${missingRequired.join(", ")}`,
  );

  // 5. Minimum fare (skipped when fare was not detected).
  const farePresent = presentValue(input.fare, true);
  push(
    "min_fare",
    "Minimum fare",
    !farePresent ? null : input.fare! >= settings.minFare,
    !farePresent
      ? "Fare not detected — check skipped"
      : input.fare! >= settings.minFare
        ? `Fare ${formatINR(input.fare!)} meets minimum ${formatINR(settings.minFare)}`
        : `Fare ${formatINR(input.fare!)} is below minimum ${formatINR(settings.minFare)}`,
  );

  // 6. Maximum pickup distance.
  const pickupPresent = presentValue(input.pickupDistanceKm, false);
  push(
    "max_pickup",
    "Max pickup distance",
    !pickupPresent ? null : input.pickupDistanceKm! <= settings.maxPickupKm,
    !pickupPresent
      ? "Pickup distance not detected — check skipped"
      : input.pickupDistanceKm! <= settings.maxPickupKm
        ? `Pickup ${input.pickupDistanceKm!.toFixed(1)} km is within ${settings.maxPickupKm.toFixed(1)} km`
        : `Pickup ${input.pickupDistanceKm!.toFixed(1)} km exceeds ${settings.maxPickupKm.toFixed(1)} km`,
  );

  // 7. Minimum trip distance.
  const tripPresent = presentValue(input.tripDistanceKm, true);
  push(
    "min_trip",
    "Min trip distance",
    !tripPresent ? null : input.tripDistanceKm! >= settings.minTripKm,
    !tripPresent
      ? "Trip distance not detected — check skipped"
      : input.tripDistanceKm! >= settings.minTripKm
        ? `Trip ${input.tripDistanceKm!.toFixed(1)} km meets minimum ${settings.minTripKm.toFixed(1)} km`
        : `Trip ${input.tripDistanceKm!.toFixed(1)} km is below minimum ${settings.minTripKm.toFixed(1)} km`,
  );

  // 8. Fare per km — only when both inputs are valid and trip > 0.
  const canComputeFarePerKm = farePresent && tripPresent && input.tripDistanceKm! > 0;
  const farePerKm = canComputeFarePerKm ? input.fare! / input.tripDistanceKm! : undefined;
  push(
    "fare_per_km",
    "Fare per km",
    !canComputeFarePerKm ? null : farePerKm! >= settings.minFarePerKm,
    !canComputeFarePerKm
      ? "Fare-per-km needs both fare and trip distance — check skipped"
      : farePerKm! >= settings.minFarePerKm
        ? `${formatINR(Math.round(farePerKm! * 100) / 100)}/km meets minimum ${formatINR(settings.minFarePerKm)}/km`
        : `${formatINR(Math.round(farePerKm! * 100) / 100)}/km is below minimum ${formatINR(settings.minFarePerKm)}/km`,
  );

  // 9. Ride category.
  const allowed = settings.allowedCategories[input.platform] ?? [];
  if (input.category === undefined || allowed.length === 0) {
    push("category", "Allowed category", null, "Category not identified or none allowed — check skipped");
  } else {
    const categoryOk = allowed.includes(input.category);
    push(
      "category",
      "Allowed category",
      categoryOk,
      categoryOk
        ? `Category "${input.category}" is allowed`
        : `Category "${input.category}" is not in the allowed list (${allowed.join(", ")})`,
    );
  }

  // 10. Data confidence.
  const confidenceOk = input.confidence >= settings.minConfidence;
  push(
    "confidence",
    "Data confidence",
    confidenceOk,
    confidenceOk
      ? `Confidence ${(input.confidence * 100).toFixed(0)}% meets threshold ${(settings.minConfidence * 100).toFixed(0)}%`
      : `Confidence ${(input.confidence * 100).toFixed(0)}% is below threshold ${(settings.minConfidence * 100).toFixed(0)}% — data is unreliable`,
  );

  const failed = checks.filter((c) => c.passed === false);
  return {
    eligible: failed.length === 0,
    checks,
    reasons: failed.map((c) => c.detail),
    evaluatedAt: now,
  };
}
