// Platform notification parsers (Rapido / Uber / Ola).
//
// HONESTY NOTE: real notification text varies by app version and is only fully
// verifiable on a physical device with the actual driver app installed. These
// parsers use conservative, clearly-scoped heuristics; anything they cannot
// extract is reported as a missing field — values are never invented. Data
// extracted from unrelated notifications is never merged in.
import { redactSensitive } from "@/src/services/redact";
import type { MissingField, ParsedRide, RidePlatform } from "@/src/models/types";

interface NotificationTexts {
  title: string;
  text: string;
  subText?: string;
}

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\bbike\b|\bmotorcycle\b|\bmoto\b/i, "bike"],
  [/\bauto\b|\brickshaw\b/i, "auto"],
  [/\bcab\b|\bsedan\b|\bhatchback\b|\bprime\b|\bmini\b|\bcar\b/i, "cab"],
];

const PLATFORM_RIDE_KEYWORDS: Record<RidePlatform, RegExp[]> = {
  rapido: [/ride\s*request/i, /new\s*ride/i, /\bcaptain\b/i],
  uber: [/trip\s*request/i, /new\s*trip/i, /ride\s*request/i, /\bdriver\s*app\b/i],
  ola: [/ride\s*request/i, /new\s*ride/i],
};

const FARE_PATTERNS: RegExp[] = [
  /₹\s*([0-9]+(?:\.[0-9]{1,2})?)/,
  /\bfare\b[^0-9\n]{0,10}([0-9]+(?:\.[0-9]{1,2})?)/i,
];

const PICKUP_PATTERNS: RegExp[] = [
  /\bpickup\b[^0-9\n]{0,14}([0-9]+(?:\.[0-9]+)?)\s*km/i,
  /\b([0-9]+(?:\.[0-9]+)?)\s*km\s*(?:away|to\s*pickup|pickup)/i,
];

const TRIP_PATTERNS: RegExp[] = [
  /\btrip\b[^0-9\n]{0,14}([0-9]+(?:\.[0-9]+)?)\s*km/i,
  /\b([0-9]+(?:\.[0-9]+)?)\s*km\s*trip/i,
];

function firstMatch(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number.parseFloat(match[1]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return undefined;
}

function detectCategory(text: string): string | undefined {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return undefined;
}

export function looksLikeRideNotification(platform: RidePlatform, { title, text }: NotificationTexts): boolean {
  const combined = `${title} ${text}`;
  return PLATFORM_RIDE_KEYWORDS[platform].some((pattern) => pattern.test(combined));
}

export interface ParseOptions {
  /** "screen" observations (accessibility) have no title and rarely ride keywords. */
  source?: "notification" | "screen";
}

const ACCEPT_LABEL_RE = /\b(accept|tap to accept|swipe to accept)\b/i;
const DROP_RE = /\bdrop(?:\s*location)?\b\s*[:\-–]?\s*([^·•|\n]{3,60})/i;

export function parseRideNotification(platform: RidePlatform, texts: NotificationTexts, options: ParseOptions = {}): ParsedRide {
  const title = (texts.title ?? "").slice(0, 300);
  const body = (texts.text ?? "").slice(0, 300);
  const subText = (texts.subText ?? "").slice(0, 300);
  const combined = `${title} ${subText} ${body}`;

  const fare = firstMatch(combined, FARE_PATTERNS);
  const pickupDistanceKm = firstMatch(combined, PICKUP_PATTERNS);
  const tripDistanceKm = firstMatch(combined, TRIP_PATTERNS);
  const category = detectCategory(combined);
  const dropMatch = combined.match(DROP_RE);
  const dropLocation = dropMatch ? redactSensitive(dropMatch[1].trim()).slice(0, 60) : undefined;

  // Ride requests shown on screen (Rapido/Ola full-screen cards) usually lack
  // the "ride request" keyword: an Accept control PLUS a fare or km value counts.
  const screenRide =
    options.source === "screen" &&
    ACCEPT_LABEL_RE.test(combined) &&
    (fare !== undefined || pickupDistanceKm !== undefined || tripDistanceKm !== undefined);
  const isRideRequest = screenRide || looksLikeRideNotification(platform, { title, text: `${subText} ${body}` });

  // Confidence reflects how much structured data could actually be extracted.
  // A keyword match alone is the weakest signal.
  let confidence = isRideRequest ? 0.55 : 0;
  if (fare !== undefined) confidence += 0.15;
  if (pickupDistanceKm !== undefined) confidence += 0.12;
  if (tripDistanceKm !== undefined) confidence += 0.1;
  if (category !== undefined) confidence += 0.05;
  confidence = Math.min(0.98, Math.max(0, Math.round(confidence * 100) / 100));

  const missingFields: MissingField[] = [];
  if (fare === undefined) missingFields.push("fare");
  if (pickupDistanceKm === undefined) missingFields.push("pickupDistanceKm");
  if (tripDistanceKm === undefined) missingFields.push("tripDistanceKm");
  if (category === undefined) missingFields.push("category");

  return {
    fare,
    pickupDistanceKm,
    tripDistanceKm,
    category,
    dropLocation,
    confidence,
    missingFields,
    isRideRequest,
    rawPreview: redactSensitive(`${title} — ${body}`.trim()).slice(0, 160),
  };
}
