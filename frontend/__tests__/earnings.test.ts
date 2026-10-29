import { describe, expect, it } from "@jest/globals";

import { computeEarnings, isConfirmedEarning } from "@/src/rules/earnings";
import type { RideRequest, RideStatus } from "@/src/models/types";

const NOW = new Date(2026, 5, 10, 18, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

let n = 0;
function ride(overrides: Partial<RideRequest> & { evidenceAt?: number; confirmed?: boolean } = {}): RideRequest {
  n += 1;
  const { evidenceAt = NOW - 1000, confirmed = true, ...rest } = overrides;
  return {
    id: `r${n}`,
    platform: "rapido",
    sourceEventId: `e${n}`,
    fare: 200,
    pickupDistanceKm: 1,
    tripDistanceKm: 10,
    category: "cab",
    detectedAt: evidenceAt - 5000,
    confidence: 0.9,
    status: "ACCEPTED" as RideStatus,
    missingFields: [],
    fingerprint: `fp${n}`,
    updatedAt: evidenceAt,
    expiresAt: evidenceAt + 45000,
    observationCount: 1,
    rawPreview: "",
    simulated: false,
    acceptance: {
      provider: "user-manual",
      attempts: [],
      evidence: { status: confirmed ? "CONFIRMED" : "NOT_CONFIRMED", source: "user-manual", at: evidenceAt },
    },
    ...rest,
  };
}

describe("earnings insights", () => {
  it("counts only ACCEPTED rides with CONFIRMED evidence and a positive fare", () => {
    expect(isConfirmedEarning(ride())).toBe(true);
    expect(isConfirmedEarning(ride({ confirmed: false }))).toBe(false);
    expect(isConfirmedEarning(ride({ status: "UNKNOWN" }))).toBe(false);
    expect(isConfirmedEarning(ride({ status: "AWAITING_CONFIRMATION" }))).toBe(false);
    expect(isConfirmedEarning(ride({ fare: undefined }))).toBe(false);
    expect(isConfirmedEarning(ride({ fare: 0 }))).toBe(false);
  });

  it("computes today and 7-day totals with a weighted ₹/km", () => {
    const rides = [
      ride({ fare: 200, tripDistanceKm: 10 }), // today
      ride({ fare: 100, tripDistanceKm: 2 }), // today
      ride({ fare: 300, tripDistanceKm: 20, evidenceAt: NOW - 3 * DAY }),
      ride({ fare: 999, evidenceAt: NOW - 9 * DAY }), // outside window
      ride({ fare: 500, confirmed: false }), // not confirmed
    ];
    const s = computeEarnings(rides, NOW, { includeSimulated: true });
    expect(s.today.total).toBe(300);
    expect(s.today.count).toBe(2);
    expect(s.today.avgPerKm).toBe(25); // 300 / 12
    expect(s.last7Days.total).toBe(600);
    expect(s.last7Days.count).toBe(3);
    expect(s.last7Days.avgPerKm).toBe(18.75); // 600 / 32
    expect(s.days).toHaveLength(7);
    expect(s.days[6].total).toBe(300);
    expect(s.days[3].total).toBe(300);
  });

  it("excludes rides without trip distance from ₹/km but keeps them in totals", () => {
    const s = computeEarnings([ride({ fare: 150, tripDistanceKm: undefined })], NOW, { includeSimulated: true });
    expect(s.today.total).toBe(150);
    expect(s.today.avgPerKm).toBeNull();
    expect(s.today.withoutTripDistance).toBe(1);
  });

  it("can exclude simulated rides", () => {
    const rides = [ride({ fare: 100, simulated: true }), ride({ fare: 50 })];
    expect(computeEarnings(rides, NOW, { includeSimulated: true }).today.total).toBe(150);
    const real = computeEarnings(rides, NOW, { includeSimulated: false });
    expect(real.today.total).toBe(50);
    expect(real.simulatedIncluded).toBe(0);
  });

  it("splits by platform", () => {
    const s = computeEarnings([ride({ platform: "uber", fare: 120 }), ride({ platform: "ola", fare: 80 })], NOW, {
      includeSimulated: true,
    });
    expect(s.byPlatform.uber.total).toBe(120);
    expect(s.byPlatform.ola.total).toBe(80);
    expect(s.byPlatform.rapido.count).toBe(0);
  });
});
