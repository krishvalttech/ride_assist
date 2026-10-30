// Platform registry. Package identifiers are PRE-FILLED BUT UNVERIFIED: they
// are common package names, not proof of an integration. Real formats vary per
// app version, so each id is user-editable and clearly flagged in the UI until
// the user confirms it on their own device.
import type { RidePlatform } from "@/src/models/types";

export interface PlatformMeta {
  platform: RidePlatform;
  displayName: string;
  defaultPackageName: string;
  /** True only when the package id has been verified against a real app version. */
  packageVerified: false;
}

export const PLATFORM_META: Record<RidePlatform, PlatformMeta> = {
  rapido: {
    platform: "rapido",
    displayName: "Rapido Captain",
    defaultPackageName: "com.rapido.captain",
    packageVerified: false,
  },
  uber: {
    platform: "uber",
    displayName: "Uber Driver",
    defaultPackageName: "com.ubercab.driver",
    packageVerified: false,
  },
  ola: {
    platform: "ola",
    displayName: "Ola Driver",
    defaultPackageName: "com.olacabs.oladriver",
    packageVerified: false,
  },
};

export const PLATFORM_ORDER: RidePlatform[] = ["rapido", "uber", "ola"];

export function platformDisplayName(platform: RidePlatform): string {
  return PLATFORM_META[platform].displayName;
}

/** Format a rupee amount. Distances are always km (user choice). */
export function formatINR(amount: number): string {
  return `₹${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}
