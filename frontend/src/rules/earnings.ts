// Earnings insights — pure, deterministic aggregation over CONFIRMED rides.
//
// Honesty rules:
// - Only rides in ACCEPTED status with CONFIRMED evidence count.
// - Amounts are the fares DETECTED in the request notification — an estimate,
//   not the platform's final payout (tolls, surge changes, commission, tips).
// - ₹/km is a weighted average (Σfare / Σtrip km) over rides where both the
//   fare and a positive trip distance were detected; otherwise it is null.
import type { RidePlatform, RideRequest } from "@/src/models/types";

export interface EarningsBucket {
  total: number;
  count: number;
  /** Weighted ₹/km, null when no ride had both fare and trip distance. */
  avgPerKm: number | null;
  /** Rides counted but excluded from ₹/km because trip distance was missing. */
  withoutTripDistance: number;
}

export interface EarningsDay extends EarningsBucket {
  dayStart: number;
}

export interface EarningsSummary {
  today: EarningsBucket;
  last7Days: EarningsBucket;
  days: EarningsDay[];
  byPlatform: Record<RidePlatform, EarningsBucket>;
  simulatedIncluded: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayStartOf(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isConfirmedEarning(ride: RideRequest): boolean {
  return (
    ride.status === "ACCEPTED" &&
    ride.acceptance?.evidence?.status === "CONFIRMED" &&
    ride.fare !== undefined &&
    Number.isFinite(ride.fare) &&
    ride.fare > 0
  );
}

function bucketOf(rides: RideRequest[]): EarningsBucket {
  let total = 0;
  let perKmFare = 0;
  let perKmDistance = 0;
  let withoutTripDistance = 0;
  for (const ride of rides) {
    const fare = ride.fare as number;
    total += fare;
    if (ride.tripDistanceKm !== undefined && ride.tripDistanceKm > 0) {
      perKmFare += fare;
      perKmDistance += ride.tripDistanceKm;
    } else {
      withoutTripDistance += 1;
    }
  }
  return {
    total: Math.round(total * 100) / 100,
    count: rides.length,
    avgPerKm: perKmDistance > 0 ? Math.round((perKmFare / perKmDistance) * 100) / 100 : null,
    withoutTripDistance,
  };
}

export function computeEarnings(
  rides: RideRequest[],
  now: number | undefined = Date.now(),
  options: { includeSimulated?: boolean } = { includeSimulated: true },
): EarningsSummary {
  const confirmed = rides.filter(
    (r) => isConfirmedEarning(r) && (options.includeSimulated || !r.simulated),
  );
  // Date by the moment the ride was accepted (evidence time), falling back to detection.
  const when = (r: RideRequest) => r.acceptance?.evidence?.at ?? r.detectedAt;

  const todayStart = dayStartOf(now);
  const windowStart = todayStart - 6 * DAY_MS;

  const days: EarningsDay[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const start = dayStartOf(todayStart - i * DAY_MS + DAY_MS / 2); // DST-safe
    const end = i === 0 ? Number.POSITIVE_INFINITY : dayStartOf(start + DAY_MS + DAY_MS / 2);
    days.push({ dayStart: start, ...bucketOf(confirmed.filter((r) => when(r) >= start && when(r) < end)) });
  }

  const inWindow = confirmed.filter((r) => when(r) >= windowStart);
  const byPlatform = {
    rapido: bucketOf(inWindow.filter((r) => r.platform === "rapido")),
    uber: bucketOf(inWindow.filter((r) => r.platform === "uber")),
    ola: bucketOf(inWindow.filter((r) => r.platform === "ola")),
  };

  return {
    today: bucketOf(confirmed.filter((r) => when(r) >= todayStart)),
    last7Days: bucketOf(inWindow),
    days,
    byPlatform,
    simulatedIncluded: inWindow.filter((r) => r.simulated).length,
  };
}
