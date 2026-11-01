import { describe, expect, it } from "@jest/globals";

import { looksLikeRideNotification, parseRideNotification } from "@/src/parsers";
import type { RidePlatform } from "@/src/models/types";

const texts = (title: string, body: string, subText?: string) => ({ title, text: body, subText });

describe("platform parsers", () => {
  it("extracts all fields from a well-formed Rapido notification", () => {
    const parsed = parseRideNotification("rapido", texts("New ride request", "Ride request — ₹184 · Pickup 1.2 km · Trip 6.4 km · Cab"));
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.fare).toBe(184);
    expect(parsed.pickupDistanceKm).toBe(1.2);
    expect(parsed.tripDistanceKm).toBe(6.4);
    expect(parsed.category).toBe("cab");
    expect(parsed.missingFields).toHaveLength(0);
    expect(parsed.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("extracts fields from an Uber trip request", () => {
    const parsed = parseRideNotification("uber", texts("Trip request", "New trip request — ₹212 · Pickup 6.3 km away · Trip 8.5 km"));
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.fare).toBe(212);
    expect(parsed.pickupDistanceKm).toBe(6.3);
    expect(parsed.tripDistanceKm).toBe(8.5);
  });

  it("extracts Rs./INR fares, meter pickup distances, and pickup/drop locations when present", () => {
    const parsed = parseRideNotification(
      "ola",
      texts(
        "New ride request",
        "Booking request — Rs. 245 · Pickup 800 m away · Ride distance 9.2 km · Pickup: Indiranagar · Drop: Koramangala · Auto",
      ),
    );
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.fare).toBe(245);
    expect(parsed.pickupDistanceKm).toBe(0.8);
    expect(parsed.tripDistanceKm).toBe(9.2);
    expect(parsed.category).toBe("auto");
    expect(parsed.pickupLocation).toBe("Indiranagar");
    expect(parsed.dropLocation).toBe("Koramangala");
  });

  it("marks missing fields explicitly instead of inventing values", () => {
    const parsed = parseRideNotification("uber", texts("Trip request", "New trip request — Pickup 2.1 km · Trip 9.0 km"));
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.fare).toBeUndefined();
    expect(parsed.pickupLocation).toBeUndefined();
    expect(parsed.dropLocation).toBeUndefined();
    expect(parsed.missingFields).toContain("fare");
  });

  it("treats keyword-only notifications as low-confidence rides with all fields missing", () => {
    const parsed = parseRideNotification("uber", texts("Trip request", "Trip req… tap to view"));
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.confidence).toBeLessThan(0.7); // below the default threshold
    expect(parsed.missingFields).toEqual(expect.arrayContaining(["fare", "pickupDistanceKm", "tripDistanceKm"]));
  });

  it("ignores OTP notifications (never parsed as rides)", () => {
    const parsed = parseRideNotification("rapido", texts("Verification", "Your Rapido OTP is 482113. Never share this code."));
    expect(parsed.isRideRequest).toBe(false);
    expect(parsed.confidence).toBe(0);
  });

  it("ignores unrelated app notifications", () => {
    const parsed = parseRideNotification("uber", texts("Uber Driver", "Your weekly earnings summary is ready to view."));
    expect(parsed.isRideRequest).toBe(false);
  });

  it("redacts sensitive content from the raw preview", () => {
    const parsed = parseRideNotification("ola", texts("New ride", "Ride request — ₹95 · OTP 552199 · Bike"));
    expect(parsed.rawPreview).not.toContain("552199");
  });

  it("platform gates are independent — an Ola-shaped text under Uber keywords still parses", () => {
    const parsed = parseRideNotification("ola", texts("New ride request", "Ride request — ₹150 · Pickup 1.0 km · Trip 7.0 km"));
    expect(parsed.isRideRequest).toBe(true);
  });

  it("detects ride-ness per platform keywords", () => {
    expect(looksLikeRideNotification("rapido", texts("New ride request", "anything"))).toBe(true);
    expect(looksLikeRideNotification("ola", texts("Booking update", "completely unrelated"))).toBe(false);
  });

  it("never throws on empty or malformed content", () => {
    const parsed = parseRideNotification("rapido" as RidePlatform, texts("", ""));
    expect(parsed.isRideRequest).toBe(false);
    expect(parsed.fare).toBeUndefined();
  });
});
