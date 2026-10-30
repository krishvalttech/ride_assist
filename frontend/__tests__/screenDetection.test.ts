import { describe, expect, it } from "@jest/globals";

import { parseRideNotification } from "@/src/parsers";

describe("screen (accessibility) ride detection", () => {
  it("treats an on-screen card with Accept + fare as a ride request", () => {
    const parsed = parseRideNotification(
      "rapido",
      { title: "", text: "Bike ₹86 2.1 km away Trip 6.4 km Drop: MG Road Accept" },
      { source: "screen" },
    );
    expect(parsed.isRideRequest).toBe(true);
    expect(parsed.fare).toBe(86);
    expect(parsed.dropLocation).toBeDefined();
  });

  it("does not treat a screen without an Accept control as a ride", () => {
    const parsed = parseRideNotification("ola", { title: "", text: "Earnings today ₹540 Trips 6" }, { source: "screen" });
    expect(parsed.isRideRequest).toBe(false);
  });

  it("does not apply the screen rule to notifications", () => {
    const parsed = parseRideNotification("uber", { title: "Promo", text: "Accept this offer ₹50" });
    expect(parsed.isRideRequest).toBe(false);
  });
});
