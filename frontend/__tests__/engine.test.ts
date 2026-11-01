import { describe, expect, it } from "@jest/globals";

import { evaluateRide, hourInRange, validateRuleSettings, type EvaluateInput } from "@/src/rules/engine";
import { DEFAULT_SETTINGS, defaultPlatformConfigs } from "@/src/rules/defaults";

// Local 12:00 — independent of the test runner's timezone.
const NOW = new Date(2026, 5, 1, 12, 0, 0).getTime();
const NIGHT = new Date(2026, 5, 1, 3, 0, 0).getTime();

const base: EvaluateInput = {
  platform: "rapido",
  detectedAt: NOW - 5000,
  confidence: 0.9,
  fare: 150,
  pickupDistanceKm: 2,
  tripDistanceKm: 8,
  category: "cab",
  missingFields: [],
};

function evaluate(overrides: Partial<EvaluateInput> = {}, settings = DEFAULT_SETTINGS, now = NOW) {
  return evaluateRide({ ...base, ...overrides }, settings, defaultPlatformConfigs(), now);
}

describe("rules engine", () => {
  it("marks a well-formed request eligible", () => {
    const decision = evaluate();
    expect(decision.eligible).toBe(true);
    expect(decision.checks.every((c) => c.passed !== false)).toBe(true);
  });

  it("rejects fares below the minimum", () => {
    const decision = evaluate({ fare: 38 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.toLowerCase().includes("below minimum"))).toBe(true);
  });

  it("treats a zero fare as missing when fare is required", () => {
    const decision = evaluate({ fare: 0 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Missing required field"))).toBe(true);
  });

  it("skips the fare check (and stays eligible) when fare is missing but not required", () => {
    const settings = { ...DEFAULT_SETTINGS, requiredFields: [] };
    const decision = evaluate({ fare: undefined, missingFields: ["fare"] }, settings);
    const fareCheck = decision.checks.find((c) => c.id === "min_fare");
    expect(fareCheck?.passed).toBeNull();
    expect(decision.eligible).toBe(true);
  });

  it("rejects pickups beyond the maximum", () => {
    const decision = evaluate({ pickupDistanceKm: 6.3 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.includes("exceeds"))).toBe(true);
  });

  it("accepts a zero pickup distance as valid (not missing)", () => {
    const decision = evaluate({ pickupDistanceKm: 0 });
    const pickup = decision.checks.find((c) => c.id === "max_pickup");
    expect(pickup?.passed).toBe(true);
    expect(decision.eligible).toBe(true);
  });

  it("rejects trips below the minimum", () => {
    const decision = evaluate({ tripDistanceKm: 2.4 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.includes("below minimum"))).toBe(true);
  });

  it("computes fare-per-km only when both inputs are valid", () => {
    const low = evaluate({ fare: 60, tripDistanceKm: 10 });
    expect(low.eligible).toBe(false);
    expect(low.reasons.some((r) => r.includes("/km"))).toBe(true);

    const noTrip = evaluate({ fare: 60, tripDistanceKm: undefined, missingFields: ["tripDistanceKm"] });
    const perKm = noTrip.checks.find((c) => c.id === "fare_per_km");
    expect(perKm?.passed).toBeNull();
  });

  it("enforces operating hours with an overnight wrap", () => {
    const dayDecision = evaluate({}, DEFAULT_SETTINGS, NIGHT);
    expect(dayDecision.eligible).toBe(false);
    expect(dayDecision.reasons.some((r) => r.includes("outside allowed hours"))).toBe(true);

    const overnightSettings = { ...DEFAULT_SETTINGS, startHour: 22, endHour: 6 };
    const wrapped = evaluate({}, overnightSettings, NIGHT);
    expect(wrapped.eligible).toBe(true);
  });

  it("hourInRange handles boundary conditions deterministically", () => {
    expect(hourInRange(6, 6, 23)).toBe(true);
    expect(hourInRange(23, 6, 23)).toBe(false); // end is exclusive
    expect(hourInRange(2, 22, 6)).toBe(true);
    expect(hourInRange(12, 22, 6)).toBe(false);
    expect(hourInRange(7, 7, 7)).toBe(true); // equal = 24h
    expect(hourInRange(24, 0, 23)).toBe(false);
  });

  it("rejects stale requests", () => {
    const decision = evaluate({ detectedAt: NOW - 120000 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.includes("older than"))).toBe(true);
  });

  it("rejects low-confidence data", () => {
    const decision = evaluate({ confidence: 0.4 });
    expect(decision.eligible).toBe(false);
    expect(decision.reasons.some((r) => r.includes("below threshold"))).toBe(true);
  });

  it("rejects disallowed categories and skips unknown ones", () => {
    const rejected = evaluate({ platform: "uber", category: "bike" });
    expect(rejected.eligible).toBe(false);
    expect(rejected.reasons.some((r) => r.includes("not in the allowed list"))).toBe(true);

    const unknown = evaluate({ category: undefined, missingFields: ["category"] });
    const categoryCheck = unknown.checks.find((c) => c.id === "category");
    expect(categoryCheck?.passed).toBeNull();
  });

  it("rejects when the platform is disabled", () => {
    const settings = { ...DEFAULT_SETTINGS, platformEnabled: { ...DEFAULT_SETTINGS.platformEnabled, rapido: false } };
    expect(evaluate({}, settings).eligible).toBe(false);
  });

  it("filters destinations against excludedDropKeywords when configured", () => {
    const settings = { ...DEFAULT_SETTINGS, excludedDropKeywords: ["airport", "toll"] };
    const rejected = evaluate({ dropLocation: "Kempegowda Airport Terminal 1" }, settings);
    expect(rejected.eligible).toBe(false);
    expect(rejected.reasons.some((r) => r.includes("excluded area"))).toBe(true);

    const allowed = evaluate({ dropLocation: "MG Road Metro" }, settings);
    expect(allowed.eligible).toBe(true);
  });

  it("validates rule settings inputs", () => {
    expect(validateRuleSettings(DEFAULT_SETTINGS)).toEqual([]);
    expect(validateRuleSettings({ ...DEFAULT_SETTINGS, minFare: -10 }).length).toBeGreaterThan(0);
    expect(validateRuleSettings({ ...DEFAULT_SETTINGS, maxPickupKm: 0.1 }).length).toBeGreaterThan(0);
    expect(validateRuleSettings({ ...DEFAULT_SETTINGS, minConfidence: 0.1 }).length).toBeGreaterThan(0);
  });

  it("is deterministic — identical inputs produce identical decisions", () => {
    const a = evaluate();
    const b = evaluate();
    expect(a).toEqual(b);
  });
});
