// Cautious, time-bounded fingerprinting of ride requests for duplicate
// suppression. Only non-sensitive attributes are used — never notification
// content hashes that could carry OTPs or personal data.
import type { ParsedRide, RidePlatform } from "@/src/models/types";

export const FINGERPRINT_MATCH_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

/** Distances round to the nearest 0.5 km, fares to the nearest ₹ — absorbs formatting jitter between updates. */
function bucket(value: number | undefined): string {
  if (value === undefined) return "x";
  return String(Math.round(value * 2) / 2);
}

function fareBucket(value: number | undefined): string {
  if (value === undefined) return "x";
  return String(Math.round(value));
}

export function buildFingerprint(
  platform: RidePlatform,
  parsed: Pick<ParsedRide, "fare" | "pickupDistanceKm" | "tripDistanceKm" | "category">,
): string {
  return [platform, fareBucket(parsed.fare), bucket(parsed.pickupDistanceKm), bucket(parsed.tripDistanceKm), parsed.category ?? "x"].join(
    ":",
  );
}

/**
 * Two observations are the same request when fingerprints match and they were
 * seen within the match window. Observation times drift apart across repeated
 * notifications, so both directions of the window are checked.
 */
export function isSameRequest(fingerprintA: string, detectedAtA: number, fingerprintB: string, detectedAtB: number): boolean {
  if (fingerprintA !== fingerprintB) return false;
  return Math.abs(detectedAtA - detectedAtB) <= FINGERPRINT_MATCH_WINDOW_MS;
}
