import { describe, expect, it } from "@jest/globals";

import { RideTransitionError, assertTransition, canTransition, isActionable, isTerminal, RIDE_TRANSITIONS } from "@/src/state/machine";

describe("ride state machine", () => {
  it("allows the happy path", () => {
    expect(canTransition("DETECTED", "PARSING")).toBe(true);
    expect(canTransition("PARSING", "EVALUATING")).toBe(true);
    expect(canTransition("EVALUATING", "AWAITING_CONFIRMATION")).toBe(true);
    expect(canTransition("AWAITING_CONFIRMATION", "ACCEPT_REQUESTED")).toBe(true);
    expect(canTransition("ACCEPT_REQUESTED", "ACCEPTED")).toBe(true);
  });

  it("allows alternative outcomes", () => {
    expect(canTransition("EVALUATING", "REJECTED")).toBe(true);
    expect(canTransition("AWAITING_CONFIRMATION", "EXPIRED")).toBe(true);
    expect(canTransition("ACCEPT_REQUESTED", "FAILED")).toBe(true);
    expect(canTransition("ACCEPT_REQUESTED", "UNKNOWN")).toBe(true);
    expect(canTransition("UNKNOWN", "ACCEPTED")).toBe(true);
    expect(canTransition("UNKNOWN", "FAILED")).toBe(true);
  });

  it("blocks illegal jumps (never DETECTED → ACCEPTED)", () => {
    expect(canTransition("DETECTED", "ACCEPTED")).toBe(false);
    expect(canTransition("DETECTED", "ACCEPT_REQUESTED")).toBe(false);
    expect(canTransition("REJECTED", "ACCEPTED")).toBe(false);
    expect(canTransition("ACCEPTED", "ACCEPT_REQUESTED")).toBe(false);
    expect(canTransition("EXPIRED", "AWAITING_CONFIRMATION")).toBe(false);
  });

  it("never retries acceptance from a FAILED outcome", () => {
    expect(canTransition("FAILED", "ACCEPT_REQUESTED")).toBe(false);
    expect(canTransition("FAILED", "AWAITING_CONFIRMATION")).toBe(false);
  });

  it("throws on illegal transitions", () => {
    expect(() => assertTransition("DETECTED", "ACCEPTED")).toThrow(RideTransitionError);
  });

  it("terminal states have no outgoing transitions", () => {
    for (const terminal of ["ACCEPTED", "REJECTED", "FAILED", "EXPIRED"] as const) {
      expect(isTerminal(terminal)).toBe(true);
      expect(RIDE_TRANSITIONS[terminal]).toHaveLength(0);
      expect(isActionable(terminal)).toBe(false);
    }
  });

  it("UNKNOWN is resolvable only through manual verification transitions", () => {
    expect(RIDE_TRANSITIONS.UNKNOWN).toEqual(["ACCEPTED", "FAILED"]);
  });
});
