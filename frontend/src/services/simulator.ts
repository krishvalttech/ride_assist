// Built-in simulator: feeds realistic and adversarial notification payloads
// through the EXACT same ingest pipeline as the native listener, so every
// screen, rule, state transition and diagnostic is exercised in the preview.
//
// All payloads are clearly marked simulated=true and rendered with a SIMULATED
// badge in the UI — they are never presented as real platform activity.
import { rideStore } from "@/src/services/rideStore";
import type { NativeNotificationEvent, RidePlatform } from "@/src/models/types";

export interface SimulatorScenario {
  id: string;
  name: string;
  platform: RidePlatform;
  title: string;
  text: string;
  subText?: string;
  /** Seconds added to the notification post time (negative = older). */
  postedAtOffsetSec?: number;
}

export const SIMULATOR_SCENARIOS: SimulatorScenario[] = [
  {
    id: "good-cab",
    name: "Good cab request",
    platform: "rapido",
    title: "New ride request",
    text: "Ride request — ₹184 · Pickup 1.2 km · Trip 6.4 km · Cab",
  },
  {
    id: "low-fare",
    name: "Fare below minimum",
    platform: "rapido",
    title: "New ride request",
    text: "Ride request — ₹38 · Pickup 0.8 km · Trip 3.2 km · Bike",
  },
  {
    id: "missing-fare",
    name: "Fare missing",
    platform: "uber",
    title: "Trip request",
    text: "New trip request — Pickup 2.1 km · Trip 9.0 km",
  },
  {
    id: "far-pickup",
    name: "Pickup too far",
    platform: "uber",
    title: "Trip request",
    text: "New trip request — ₹212 · Pickup 6.3 km away · Trip 8.5 km",
  },
  {
    id: "short-trip",
    name: "Short trip",
    platform: "ola",
    title: "New ride",
    text: "Ride request — ₹65 · Pickup 1.0 km · Trip 2.4 km · Auto",
  },
  {
    id: "great-per-km",
    name: "High fare per km",
    platform: "ola",
    title: "New ride",
    text: "Ride request — ₹310 · Pickup 0.5 km · Trip 7.2 km · Cab",
  },
  {
    id: "low-confidence",
    name: "Garbled / low confidence",
    platform: "uber",
    title: "Trip request",
    text: "Trip req… tap to view",
  },
  {
    id: "stale",
    name: "Stale request (too old)",
    platform: "rapido",
    title: "New ride request",
    text: "Ride request — ₹150 · Pickup 1.0 km · Trip 7.0 km",
    postedAtOffsetSec: -90,
  },
  {
    id: "duplicate",
    name: "Duplicate delivery of last request",
    platform: "ola",
    title: "New ride",
    text: "Ride request — ₹310 · Pickup 0.5 km · Trip 7.2 km · Cab",
  },
  {
    id: "otp-noise",
    name: "Non-ride OTP notification (must be ignored)",
    platform: "rapido",
    title: "Verification",
    text: "Your Rapido OTP is 482113. Never share this code.",
  },
  {
    id: "app-noise",
    name: "Unrelated app notification (must be ignored)",
    platform: "uber",
    title: "Uber Driver",
    text: "Your weekly earnings summary is ready to view.",
  },
  {
    id: "bike-good",
    name: "Good bike request",
    platform: "rapido",
    title: "New ride request",
    text: "Ride request — ₹95 · Pickup 1.4 km · Trip 5.8 km · Bike",
  },
];

let intervalId: ReturnType<typeof setInterval> | null = null;
let cursor = 0;
let seq = 0;

function emitScenario(scenario: SimulatorScenario): void {
  seq += 1;
  const now = Date.now();
  const event: NativeNotificationEvent = {
    id: `sim_${seq}_${scenario.id}`,
    platform: scenario.platform,
    title: scenario.title,
    text: scenario.text,
    subText: scenario.subText,
    postedAt: now + (scenario.postedAtOffsetSec ?? 0) * 1000,
    source: "notification",
    removed: false,
    simulated: true,
  };
  rideStore.log("debug", "simulator", `Simulated notification: ${scenario.name}`);
  void rideStore.ingestNotification(event);
}

export function startSimulator(): void {
  if (intervalId) return;
  // Fire two scenarios immediately so the feed is never empty, then keep a
  // steady cadence. Bounded work per tick — no continuous polling loops.
  emitScenario(SIMULATOR_SCENARIOS[cursor % SIMULATOR_SCENARIOS.length]);
  cursor += 1;
  emitScenario(SIMULATOR_SCENARIOS[cursor % SIMULATOR_SCENARIOS.length]);
  cursor += 1;
  intervalId = setInterval(() => {
    emitScenario(SIMULATOR_SCENARIOS[cursor % SIMULATOR_SCENARIOS.length]);
    cursor += 1;
  }, 8000);
}

export function stopSimulator(): void {
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}
