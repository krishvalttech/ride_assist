import { describe, expect, it } from "@jest/globals";

import { buildFingerprint, isSameRequest, FINGERPRINT_MATCH_WINDOW_MS } from "@/src/state/fingerprint";

const parsedA = { fare: 184, pickupDistanceKm: 1.2, tripDistanceKm: 6.4, category: "cab" };

describe("request fingerprinting / dedup", () => {
  it("produces identical fingerprints for formatting jitter", () => {
    const a = buildFingerprint("rapido", parsedA);
    const b = buildFingerprint("rapido", { ...parsedA, fare: 184.3, pickupDistanceKm: 1.24 });
    expect(a).toBe(b);
  });

  it("differs across platforms and values", () => {
    const a = buildFingerprint("rapido", parsedA);
    expect(buildFingerprint("uber", parsedA)).not.toBe(a);
    expect(buildFingerprint("rapido", { ...parsedA, fare: 212 })).not.toBe(a);
    expect(buildFingerprint("rapido", { ...parsedA, category: undefined })).not.toBe(a);
  });

  it("treats missing values explicitly (never equal to zero)", () => {
    const withZero = buildFingerprint("rapido", { ...parsedA, tripDistanceKm: 0 });
    const withMissing = buildFingerprint("rapido", { ...parsedA, tripDistanceKm: undefined });
    expect(withZero).not.toBe(withMissing);
  });

  it("matches repeat observations only within the time window", () => {
    const fp = buildFingerprint("rapido", parsedA);
    const now = Date.now();
    expect(isSameRequest(fp, now, fp, now + FINGERPRINT_MATCH_WINDOW_MS - 1000)).toBe(true);
    expect(isSameRequest(fp, now, fp, now + FINGERPRINT_MATCH_WINDOW_MS + 1000)).toBe(false);
  });

  it("never matches different fingerprints regardless of time", () => {
    const a = buildFingerprint("rapido", parsedA);
    const b = buildFingerprint("rapido", { ...parsedA, fare: 310 });
    expect(isSameRequest(a, Date.now(), b, Date.now())).toBe(false);
  });
});
