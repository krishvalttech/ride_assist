// Illustrative, user-configurable defaults. These are starting points — NOT
// claims about optimal earnings, platform behaviour or guaranteed outcomes.
import type { PlatformConfig, RidePlatform, RuleSettings } from "@/src/models/types";
import { PLATFORM_META } from "@/src/services/platformRegistry";

export const CATEGORY_OPTIONS: Record<RidePlatform, string[]> = {
  rapido: ["bike", "auto", "cab"],
  uber: ["auto", "cab"],
  ola: ["auto", "cab"],
};

export const REQUIRED_FIELD_OPTIONS = ["fare", "pickupDistanceKm", "tripDistanceKm"] as const;

export const DEFAULT_SETTINGS: RuleSettings = {
  minFare: 60,
  maxPickupKm: 3,
  minTripKm: 5,
  minFarePerKm: 12,
  startHour: 6,
  endHour: 23,
  maxRequestAgeSec: 45,
  minConfidence: 0.7,
  requiredFields: ["fare", "pickupDistanceKm"],
  platformEnabled: { rapido: true, uber: true, ola: true },
  allowedCategories: {
    rapido: ["bike", "auto", "cab"],
    uber: ["auto", "cab"],
    ola: ["auto", "cab"],
  },
  acceptanceMode: "manual",
};

export function defaultPlatformConfigs(): PlatformConfig[] {
  return (Object.keys(PLATFORM_META) as RidePlatform[]).map((platform) => ({
    platform,
    packageName: PLATFORM_META[platform].defaultPackageName,
    detectionEnabled: true,
    acceptanceAssistEnabled: false,
  }));
}
