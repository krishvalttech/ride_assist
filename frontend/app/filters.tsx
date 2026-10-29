// Ride filter editor: validated numeric fields with steppers, operating hours,
// required fields, platform toggles, acceptance mode, sticky Reset/Save bar.
import { useEffect, useMemo, useState } from "react";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, PrimaryButton, SectionCard, ToggleRow } from "@/src/components/ui";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { rideStore } from "@/src/services/rideStore";
import { DEFAULT_SETTINGS, REQUIRED_FIELD_OPTIONS } from "@/src/rules/defaults";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import type { MissingField, RidePlatform, RuleSettings } from "@/src/models/types";
import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";

const REQUIRED_FIELD_LABELS: Record<(typeof REQUIRED_FIELD_OPTIONS)[number], string> = {
  fare: "Fare",
  pickupDistanceKm: "Pickup distance",
  tripDistanceKm: "Trip distance",
};

interface NumericFieldSpec {
  key: keyof Pick<
    RuleSettings,
    "minFare" | "maxPickupKm" | "minTripKm" | "minFarePerKm" | "maxRequestAgeSec"
  >;
  label: string;
  hint: string;
  step: number;
  min: number;
  max: number;
  suffix?: string;
  decimals?: number;
}

const NUMERIC_FIELDS: NumericFieldSpec[] = [
  { key: "minFare", label: "Minimum fare", hint: "Requests below this fare are rejected", step: 10, min: 0, max: 10000, suffix: "₹" },
  { key: "maxPickupKm", label: "Max pickup distance", hint: "Farther pickups are rejected", step: 0.5, min: 0.5, max: 50, suffix: "km", decimals: 1 },
  { key: "minTripKm", label: "Min trip distance", hint: "Applied only when trip distance is detected", step: 1, min: 0, max: 200, suffix: "km" },
  { key: "minFarePerKm", label: "Min fare per km", hint: "Needs fare AND trip distance to compute", step: 1, min: 0, max: 500, suffix: "₹/km" },
  { key: "maxRequestAgeSec", label: "Max request age", hint: "Older requests expire automatically", step: 5, min: 10, max: 600, suffix: "sec" },
];

export default function FiltersScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();

  const [draft, setDraft] = useState<RuleSettings>(state.settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  // Re-seed the draft when re-entering the screen after settings changed.
  useEffect(() => {
    setDraft(state.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = (partial: Partial<RuleSettings>) => setDraft((d) => ({ ...d, ...partial }));

  const setNumber = (key: NumericFieldSpec["key"], raw: string) => {
    const value = Number.parseFloat(raw);
    patch({ [key]: Number.isFinite(value) ? value : 0 } as Partial<RuleSettings>);
  };

  const bump = (spec: NumericFieldSpec, direction: 1 | -1) => {
    const current = draft[spec.key];
    const next = Math.min(spec.max, Math.max(spec.min, Math.round((current + spec.step * direction) * 100) / 100));
    patch({ [spec.key]: next } as Partial<RuleSettings>);
  };

  const toggleRequiredField = (field: MissingField) => {
    const has = draft.requiredFields.includes(field);
    patch({ requiredFields: has ? draft.requiredFields.filter((f) => f !== field) : [...draft.requiredFields, field] });
  };

  const toggleCategory = (platform: RidePlatform, category: string) => {
    const current = draft.allowedCategories[platform] ?? [];
    const next = current.includes(category) ? current.filter((c) => c !== category) : [...current, category];
    patch({ allowedCategories: { ...draft.allowedCategories, [platform]: next } });
  };

  const summary = useMemo(() => {
    const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
    return [
      `Fare ≥ ₹${draft.minFare}`,
      `Pickup ≤ ${draft.maxPickupKm} km`,
      draft.minTripKm > 0 ? `Trip ≥ ${draft.minTripKm} km` : null,
      draft.minFarePerKm > 0 ? `≥ ₹${draft.minFarePerKm}/km` : null,
      `${hour(draft.startHour)}–${hour(draft.endHour)}`,
      `Max age ${draft.maxRequestAgeSec}s`,
      `Confidence ≥ ${Math.round(draft.minConfidence * 100)}%`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [draft]);

  const save = () => {
    const problems: string[] = [];
    for (const spec of NUMERIC_FIELDS) {
      const value = draft[spec.key];
      if (value < spec.min || value > spec.max) {
        problems.push(`${spec.label} must be between ${spec.min} and ${spec.max} ${spec.suffix ?? ""}`.trim());
      }
    }
    if (draft.startHour < 0 || draft.startHour > 23 || draft.endHour < 0 || draft.endHour > 23) {
      problems.push("Operating hours must be between 0 and 23");
    }
    if (draft.minConfidence < 0.3 || draft.minConfidence > 0.95) {
      problems.push("Confidence threshold must be between 30% and 95%");
    }
    setErrors(problems);
    if (problems.length > 0) return;
    rideStore.setSettings(draft);
    toast.show("Filter rules saved", "success");
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };

  return (
    <View style={styles.screen} testID="filters-screen">
      <KeyboardAwareScrollView
        bottomOffset={16}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xxxl,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Ride Filters</Text>
          <Text style={styles.link} onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))} testID="filters-close">
            Done
          </Text>
        </View>

        <SectionCard title="Active rules summary" testID="filters-summary-card">
          <Text style={styles.summary}>{summary}</Text>
        </SectionCard>

        {/* Numeric rules */}
        <SectionCard testID="filters-numeric-card">
          {NUMERIC_FIELDS.map((spec) => (
            <View key={spec.key} style={styles.fieldRow}>
              <View style={styles.fieldTextBlock}>
                <Text style={styles.fieldLabel}>{spec.label}</Text>
                <Text style={styles.fieldHint}>{spec.hint}</Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  testID={`filters-dec-${spec.key}`}
                  onPress={() => bump(spec, -1)}
                  accessibilityRole="button"
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <TextInput
                  testID={`filters-input-${spec.key}`}
                  style={styles.input}
                  value={String(draft[spec.key])}
                  onChangeText={(raw) => setNumber(spec.key, raw)}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                />
                <Pressable
                  testID={`filters-inc-${spec.key}`}
                  onPress={() => bump(spec, 1)}
                  accessibilityRole="button"
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {/* Operating hours — independent start / end steppers */}
          {(["startHour", "endHour"] as const).map((key) => (
            <View key={key} style={styles.fieldRow}>
              <View style={styles.fieldTextBlock}>
                <Text style={styles.fieldLabel}>{key === "startHour" ? "Operating hours — start" : "Operating hours — end"}</Text>
                <Text style={styles.fieldHint}>
                  {key === "startHour" ? "Inclusive (0–23)" : "Exclusive; wraps past midnight; equal to start = 24 h"}
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  testID={`filters-dec-${key}`}
                  onPress={() => patch({ [key]: (draft[key] + 23) % 24 } as Partial<RuleSettings>)}
                  accessibilityRole="button"
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>−</Text>
                </Pressable>
                <Text style={styles.hourValue} testID={`filters-${key}-value`}>
                  {String(draft[key]).padStart(2, "0")}:00
                </Text>
                <Pressable
                  testID={`filters-inc-${key}`}
                  onPress={() => patch({ [key]: (draft[key] + 1) % 24 } as Partial<RuleSettings>)}
                  accessibilityRole="button"
                  style={styles.stepperButton}
                >
                  <Text style={styles.stepperText}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {/* Confidence */}
          <View style={styles.fieldRow}>
            <View style={styles.fieldTextBlock}>
              <Text style={styles.fieldLabel}>Minimum data confidence</Text>
              <Text style={styles.fieldHint}>Requests with weaker data fail safely</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                testID="filters-dec-minConfidence"
                onPress={() => patch({ minConfidence: Math.max(0.3, Math.round((draft.minConfidence - 0.05) * 100) / 100) })}
                accessibilityRole="button"
                style={styles.stepperButton}
              >
                <Text style={styles.stepperText}>−</Text>
              </Pressable>
              <Text style={styles.hourValue} testID="filters-confidence-value">
                {Math.round(draft.minConfidence * 100)}%
              </Text>
              <Pressable
                testID="filters-inc-minConfidence"
                onPress={() => patch({ minConfidence: Math.min(0.95, Math.round((draft.minConfidence + 0.05) * 100) / 100) })}
                accessibilityRole="button"
                style={styles.stepperButton}
              >
                <Text style={styles.stepperText}>+</Text>
              </Pressable>
            </View>
          </View>
        </SectionCard>

        {/* Required fields */}
        <SectionCard
          title="Required fields"
          subtitle="Requests missing these are never eligible (0 and missing are treated the same for fare)"
          testID="filters-required-card"
        >
          <View style={styles.chipWrap}>
            {REQUIRED_FIELD_OPTIONS.map((field) => (
              <Chip
                key={field}
                label={REQUIRED_FIELD_LABELS[field]}
                selected={draft.requiredFields.includes(field)}
                onPress={() => toggleRequiredField(field)}
                testID={`filters-required-${field}`}
              />
            ))}
          </View>
        </SectionCard>

        {/* Platforms */}
        <SectionCard title="Platforms" subtitle="Master enable/disable per platform" testID="filters-platforms-card">
          {PLATFORM_ORDER.map((platform) => (
            <ToggleRow
              key={platform}
              label={platformDisplayName(platform)}
              value={draft.platformEnabled[platform]}
              onValueChange={(v) => patch({ platformEnabled: { ...draft.platformEnabled, [platform]: v } })}
              testID={`filters-platform-${platform}`}
            />
          ))}
          <View style={styles.chipWrap}>
            {PLATFORM_ORDER.map((platform) =>
              (draft.allowedCategories[platform] ?? []).map((category) => (
                <Chip
                  key={`${platform}-${category}`}
                  label={`${platform} · ${category}`}
                  selected
                  onPress={() => toggleCategory(platform, category)}
                  testID={`filters-category-${platform}-${category}`}
                />
              )),
            )}
          </View>
          <Text style={styles.hint}>Tap an allowed category chip to remove it from that platform&apos;s allowed list.</Text>
        </SectionCard>

        {/* Acceptance mode */}
        <SectionCard
          title="Approval mode"
          subtitle="Manual approval is always available. Automatic acceptance only activates where a permitted, verified interaction exists."
          testID="filters-mode-card"
        >
          <View style={styles.chipWrap}>
            <Chip
              label="Manual approval"
              selected={draft.acceptanceMode === "manual"}
              onPress={() => patch({ acceptanceMode: "manual" })}
              testID="filters-mode-manual"
            />
            <Chip
              label="Auto (where permitted)"
              selected={draft.acceptanceMode === "auto-permitted"}
              onPress={() => {
                patch({ acceptanceMode: "auto-permitted" });
                toast.show("Auto-accept stays off until a permitted interaction adapter is verified on your device", "warning");
              }}
              testID="filters-mode-auto"
            />
          </View>
        </SectionCard>
      </KeyboardAwareScrollView>

      {/* Sticky actions above the keyboard */}
      <KeyboardStickyView style={{ paddingBottom: insets.bottom + spacing.sm }}>
        <View style={styles.stickyBar}>
          {errors.length > 0 ? (
            <View style={styles.errors} testID="filters-errors">
              {errors.map((error, i) => (
                <Text key={i} style={styles.errorText}>
                  • {error}
                </Text>
              ))}
            </View>
          ) : null}
          <View style={styles.stickyButtons}>
            <PrimaryButton label="Reset to defaults" onPress={() => setConfirmReset(true)} testID="filters-reset-button" tone="neutral" />
            <PrimaryButton label="Save rules" onPress={save} testID="filters-save-button" />
          </View>
        </View>
      </KeyboardStickyView>

      <ConfirmSheet
        visible={confirmReset}
        title="Reset filter rules?"
        message="All rules return to RideAssist's illustrative defaults. You can edit them again at any time."
        actions={[
          {
            label: "Reset to defaults",
            onPress: () => {
              setDraft(DEFAULT_SETTINGS);
              setErrors([]);
              rideStore.setSettings(DEFAULT_SETTINGS);
              setConfirmReset(false);
              toast.show("Filter rules reset to defaults", "info");
            },
            testID: "filters-reset-confirm",
            tone: "danger",
          },
        ]}
        onDismiss={() => setConfirmReset(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandTertiary,
    minHeight: 44,
    textAlignVertical: "center",
    paddingHorizontal: spacing.sm,
  },
  summary: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  fieldTextBlock: {
    flex: 1,
    gap: 2,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  fieldHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
    lineHeight: 15,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    color: colors.onSurface,
  },
  input: {
    width: 76,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceTertiary,
    color: colors.onSurface,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 0,
  },
  hourValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurface,
    minWidth: 96,
    textAlign: "center",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  stickyBar: {
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  stickyButtons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  errors: {
    gap: 2,
  },
  errorText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.error,
  },
}));
