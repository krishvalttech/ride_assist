// Ride request state machine with validated, atomic transitions.
// A ride can never jump from e.g. DETECTED straight to ACCEPTED: every change
// goes through canTransition/assertTransition, and the store applies it
// atomically per ride (see rideStore).
import type { RideStatus } from "@/src/models/types";

export const TERMINAL_STATUSES: ReadonlySet<RideStatus> = new Set([
  "ACCEPTED",
  "REJECTED",
  "FAILED",
  "EXPIRED",
]);

export function isTerminal(status: RideStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export const RIDE_TRANSITIONS: Readonly<Record<RideStatus, readonly RideStatus[]>> = {
  DETECTED: ["PARSING", "EXPIRED", "UNKNOWN"],
  PARSING: ["EVALUATING", "FAILED", "EXPIRED", "UNKNOWN"],
  EVALUATING: ["AWAITING_CONFIRMATION", "REJECTED", "FAILED", "EXPIRED", "UNKNOWN"],
  AWAITING_CONFIRMATION: ["ACCEPT_REQUESTED", "REJECTED", "EXPIRED", "FAILED", "UNKNOWN"],
  ACCEPT_REQUESTED: ["ACCEPTED", "FAILED", "UNKNOWN"],
  ACCEPTED: [],
  REJECTED: [],
  FAILED: [],
  EXPIRED: [],
  UNKNOWN: ["ACCEPTED", "FAILED"], // only via explicit manual verification
};

export class RideTransitionError extends Error {
  constructor(from: RideStatus, to: RideStatus) {
    super(`Illegal ride state transition: ${from} → ${to}`);
    this.name = "RideTransitionError";
  }
}

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return RIDE_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransition(from, to)) {
    throw new RideTransitionError(from, to);
  }
}

/** Non-terminal, still-actionable statuses. */
export function isActionable(status: RideStatus): boolean {
  return !isTerminal(status);
}
