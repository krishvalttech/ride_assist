// Spoken ride alerts — on-device text-to-speech (expo-speech). Nothing is sent
// to a server. Announces only requests that passed every rule.
//
// Note: speech while the app is in the background / screen locked needs a
// standalone build and OS support; in Expo Go it speaks while the app is open.
import * as Speech from "expo-speech";

import { platformDisplayName } from "@/src/services/platformRegistry";
import { rideStore } from "@/src/services/rideStore";
import type { RideRequest } from "@/src/models/types";

const MIN_GAP_MS = 2500;

/** Pure: build the sentence spoken for a ride (unit-tested). */
export function buildAnnouncement(ride: Pick<RideRequest, "platform" | "fare" | "pickupDistanceKm" | "tripDistanceKm" | "simulated">): string {
  const parts: string[] = [];
  if (ride.simulated) parts.push("Simulated.");
  parts.push(`${platformDisplayName(ride.platform)} ride.`);
  parts.push(ride.fare !== undefined ? `${Math.round(ride.fare)} rupees.` : "Fare not detected.");
  parts.push(
    ride.pickupDistanceKm !== undefined
      ? `Pickup ${formatKm(ride.pickupDistanceKm)}.`
      : "Pickup distance not detected.",
  );
  if (ride.tripDistanceKm !== undefined) parts.push(`Trip ${formatKm(ride.tripDistanceKm)}.`);
  return parts.join(" ");
}

function formatKm(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return `${rounded} ${rounded === 1 ? "kilometre" : "kilometres"}`;
}

let lastSpokenAt = 0;
const spokenRideIds = new Set<string>();

export function speakRide(ride: RideRequest): void {
  if (spokenRideIds.has(ride.id)) return;
  spokenRideIds.add(ride.id);
  if (spokenRideIds.size > 200) {
    const first = spokenRideIds.values().next().value;
    if (first !== undefined) spokenRideIds.delete(first);
  }
  const now = Date.now();
  // Newest eligible request wins: cut off any announcement still playing.
  if (now - lastSpokenAt < MIN_GAP_MS) Speech.stop();
  lastSpokenAt = now;
  Speech.speak(buildAnnouncement(ride), { language: "en-IN", rate: 1.0, pitch: 1.0 });
}

export function speakTest(): void {
  Speech.stop();
  Speech.speak("RideAssist voice alerts are on. Rapido ride. 184 rupees. Pickup 1.2 kilometres.", {
    language: "en-IN",
  });
}

let unsubscribe: (() => void) | null = null;

/** Registered once at startup; speaks only when the user enabled alerts. */
export function registerVoiceAlerts(): void {
  if (unsubscribe) return;
  unsubscribe = rideStore.addEligibleListener((ride) => {
    if (!rideStore.getSnapshot().voiceAlertsOn) return;
    try {
      speakRide(ride);
    } catch {
      rideStore.log("warn", "system", "Speech engine unavailable — spoken alert skipped", undefined, ride.id);
    }
  });
}
