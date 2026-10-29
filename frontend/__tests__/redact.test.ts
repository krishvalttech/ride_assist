import { describe, expect, it } from "@jest/globals";

import { previewOf, redactMeta, redactSensitive } from "@/src/services/redact";

describe("sensitive redaction", () => {
  it("removes labeled OTPs and codes", () => {
    expect(redactSensitive("Your OTP is 482113. Do not share")).not.toContain("482113");
    expect(redactSensitive("code 5521 for delivery")).not.toContain("5521");
    expect(redactSensitive("password: hunter2isthebest")).not.toContain("hunter2isthebest");
  });

  it("removes phone numbers and other long digit runs", () => {
    expect(redactSensitive("call me at 9876543210")).not.toContain("9876543210");
    expect(redactSensitive("ref 123456789012345678")).toBe("ref ••••••");
  });

  it("keeps fares and distances readable", () => {
    const out = redactSensitive("Ride request — ₹184 · Pickup 1.2 km · Trip 6.4 km");
    expect(out).toContain("184");
    expect(out).toContain("1.2");
    expect(out).toContain("6.4");
  });

  it("previewOf truncates and redacts", () => {
    const out = previewOf("A".repeat(300) + " OTP 123456", 120);
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out).not.toContain("123456");
  });

  it("redactMeta redacts string values and keeps primitives", () => {
    const out = redactMeta({ note: "otp 998877", count: 3, ok: true, nothing: null });
    expect(out?.note).not.toContain("998877");
    expect(out?.count).toBe(3);
    expect(out?.ok).toBe(true);
    expect(out?.nothing).toBeNull();
  });
});
