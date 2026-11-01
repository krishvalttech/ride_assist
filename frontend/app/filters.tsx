// // Ride filter editor: validated numeric fields with steppers, operating hours,
// // required fields, destination filter, platform toggles, acceptance mode, sticky Reset/Save bar.
// import { useMemo, useState } from "react";
// import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
// import { Pressable, Text, TextInput, View } from "react-native";
// import { useRouter } from "expo-router";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// import { Chip, PrimaryButton, SectionCard, ToggleRow } from "@/src/components/ui";
// import { ConfirmSheet } from "@/src/components/ConfirmSheet";
// import { useToast } from "@/src/components/Toast";
// import { rideStore } from "@/src/services/rideStore";
// import { DEFAULT_SETTINGS, REQUIRED_FIELD_OPTIONS } from "@/src/rules/defaults";
// import { validateRuleSettings } from "@/src/rules/engine";
// import { useRideAssistState } from "@/src/hooks/useRideEngine";
// import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
// import type { MissingField, RidePlatform, RuleSettings } from "@/src/models/types";
// import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";

// const REQUIRED_FIELD_LABELS: Record<(typeof REQUIRED_FIELD_OPTIONS)[number], string> = {
//   fare: "Fare",
//   pickupDistanceKm: "Pickup distance",
//   tripDistanceKm: "Trip distance",
// };

// interface NumericFieldSpec {
//   key: keyof Pick<
//     RuleSettings,
//     "minFare" | "maxPickupKm" | "minTripKm" | "minFarePerKm" | "maxRequestAgeSec"
//   >;
//   label: string;
//   hint: string;
//   step: number;
//   min: number;
//   max: number;
//   suffix?: string;
//   decimals?: number;
// }

// const NUMERIC_FIELDS: NumericFieldSpec[] = [
//   { key: "minFare", label: "Minimum fare", hint: "Requests below this fare are rejected", step: 10, min: 0, max: 10000, suffix: "₹" },
//   { key: "maxPickupKm", label: "Max pickup distance", hint: "Farther pickups are rejected", step: 0.5, min: 0.5, max: 50, suffix: "km", decimals: 1 },
//   { key: "minTripKm", label: "Min trip distance", hint: "Applied only when trip distance is detected", step: 1, min: 0, max: 200, suffix: "km" },
//   { key: "minFarePerKm", label: "Min fare per km", hint: "Needs fare AND trip distance to compute", step: 1, min: 0, max: 500, suffix: "₹/km" },
//   { key: "maxRequestAgeSec", label: "Max request age", hint: "Older requests expire automatically", step: 5, min: 10, max: 600, suffix: "sec" },
// ];

// export default function FiltersScreen() {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   const insets = useSafeAreaInsets();
//   const router = useRouter();
//   const toast = useToast();
//   const state = useRideAssistState();

//   const [draft, setDraft] = useState<RuleSettings>(state.settings);
//   const [excludedDropText, setExcludedDropText] = useState<string>(
//     (state.settings.excludedDropKeywords ?? []).join(", "),
//   );
//   const [errors, setErrors] = useState<string[]>([]);
//   const [confirmReset, setConfirmReset] = useState(false);

//   const patch = (partial: Partial<RuleSettings>) => setDraft((d) => ({ ...d, ...partial }));

//   const setNumber = (key: NumericFieldSpec["key"], raw: string) => {
//     const value = Number.parseFloat(raw);
//     patch({ [key]: Number.isFinite(value) ? value : 0 } as Partial<RuleSettings>);
//   };

//   const bump = (spec: NumericFieldSpec, direction: 1 | -1) => {
//     const current = draft[spec.key];
//     const next = Math.min(spec.max, Math.max(spec.min, Math.round((current + spec.step * direction) * 100) / 100));
//     patch({ [spec.key]: next } as Partial<RuleSettings>);
//   };

//   const toggleRequiredField = (field: MissingField) => {
//     const has = draft.requiredFields.includes(field);
//     patch({ requiredFields: has ? draft.requiredFields.filter((f) => f !== field) : [...draft.requiredFields, field] });
//   };

//   const toggleCategory = (platform: RidePlatform, category: string) => {
//     const current = draft.allowedCategories[platform] ?? [];
//     const next = current.includes(category) ? current.filter((c) => c !== category) : [...current, category];
//     patch({ allowedCategories: { ...draft.allowedCategories, [platform]: next } });
//   };

//   const summary = useMemo(() => {
//     const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
//     return [
//       `Fare ≥ ₹${draft.minFare}`,
//       `Pickup ≤ ${draft.maxPickupKm} km`,
//       draft.minTripKm > 0 ? `Trip ≥ ${draft.minTripKm} km` : null,
//       draft.minFarePerKm > 0 ? `≥ ₹${draft.minFarePerKm}/km` : null,
//       `${hour(draft.startHour)}–${hour(draft.endHour)}`,
//       `Max age ${draft.maxRequestAgeSec}s`,
//       `Confidence ≥ ${Math.round(draft.minConfidence * 100)}%`,
//     ]
//       .filter(Boolean)
//       .join(" · ");
//   }, [draft]);

//   const save = () => {
//     const excludedDropKeywords = excludedDropText
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     const nextSettings: RuleSettings = {
//       ...draft,
//       ...(excludedDropKeywords.length > 0 ? { excludedDropKeywords } : { excludedDropKeywords: undefined }),
//     };
//     const problems = validateRuleSettings(nextSettings);
//     setErrors(problems);
//     if (problems.length > 0) return;
//     rideStore.setSettings(nextSettings);
//     toast.show("Filter rules saved", "success");
//     if (router.canGoBack()) router.back();
//     else router.replace("/settings");
//   };

//   return (
//     <View style={styles.screen} testID="filters-screen">
//       <KeyboardAwareScrollView
//         bottomOffset={16}
//         contentContainerStyle={{
//           paddingTop: insets.top + spacing.md,
//           paddingBottom: insets.bottom + spacing.xxxl,
//           paddingHorizontal: spacing.lg,
//           gap: spacing.md,
//         }}
//         showsVerticalScrollIndicator={false}
//       >
//         <View style={styles.headerRow}>
//           <Text style={styles.title}>Ride Filters</Text>
//           <Text style={styles.link} onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))} testID="filters-close">
//             Done
//           </Text>
//         </View>

//         <SectionCard title="Active rules summary" testID="filters-summary-card">
//           <Text style={styles.summary}>{summary}</Text>
//         </SectionCard>

//         {/* Numeric rules */}
//         <SectionCard testID="filters-numeric-card">
//           {NUMERIC_FIELDS.map((spec) => (
//             <View key={spec.key} style={styles.fieldRow}>
//               <View style={styles.fieldTextBlock}>
//                 <Text style={styles.fieldLabel}>{spec.label}</Text>
//                 <Text style={styles.fieldHint}>{spec.hint}</Text>
//               </View>
//               <View style={styles.stepper}>
//                 <Pressable
//                   testID={`filters-dec-${spec.key}`}
//                   onPress={() => bump(spec, -1)}
//                   accessibilityRole="button"
//                   style={styles.stepperButton}
//                 >
//                   <Text style={styles.stepperText}>−</Text>
//                 </Pressable>
//                 <TextInput
//                   testID={`filters-input-${spec.key}`}
//                   style={styles.input}
//                   value={String(draft[spec.key])}
//                   onChangeText={(raw) => setNumber(spec.key, raw)}
//                   keyboardType="decimal-pad"
//                   selectTextOnFocus
//                 />
//                 <Pressable
//                   testID={`filters-inc-${spec.key}`}
//                   onPress={() => bump(spec, 1)}
//                   accessibilityRole="button"
//                   style={styles.stepperButton}
//                 >
//                   <Text style={styles.stepperText}>+</Text>
//                 </Pressable>
//               </View>
//             </View>
//           ))}

//           {/* Operating hours — independent start / end steppers */}
//           {(["startHour", "endHour"] as const).map((key) => (
//             <View key={key} style={styles.fieldRow}>
//               <View style={styles.fieldTextBlock}>
//                 <Text style={styles.fieldLabel}>{key === "startHour" ? "Operating hours — start" : "Operating hours — end"}</Text>
//                 <Text style={styles.fieldHint}>
//                   {key === "startHour" ? "Inclusive (0–23)" : "Exclusive; wraps past midnight; equal to start = 24 h"}
//                 </Text>
//               </View>
//               <View style={styles.stepper}>
//                 <Pressable
//                   testID={`filters-dec-${key}`}
//                   onPress={() => patch({ [key]: (draft[key] + 23) % 24 } as Partial<RuleSettings>)}
//                   accessibilityRole="button"
//                   style={styles.stepperButton}
//                 >
//                   <Text style={styles.stepperText}>−</Text>
//                 </Pressable>
//                 <Text style={styles.hourValue} testID={`filters-${key}-value`}>
//                   {String(draft[key]).padStart(2, "0")}:00
//                 </Text>
//                 <Pressable
//                   testID={`filters-inc-${key}`}
//                   onPress={() => patch({ [key]: (draft[key] + 1) % 24 } as Partial<RuleSettings>)}
//                   accessibilityRole="button"
//                   style={styles.stepperButton}
//                 >
//                   <Text style={styles.stepperText}>+</Text>
//                 </Pressable>
//               </View>
//             </View>
//           ))}

//           {/* Confidence */}
//           <View style={styles.fieldRow}>
//             <View style={styles.fieldTextBlock}>
//               <Text style={styles.fieldLabel}>Minimum data confidence</Text>
//               <Text style={styles.fieldHint}>Requests with weaker data fail safely</Text>
//             </View>
//             <View style={styles.stepper}>
//               <Pressable
//                 testID="filters-dec-minConfidence"
//                 onPress={() => patch({ minConfidence: Math.max(0.3, Math.round((draft.minConfidence - 0.05) * 100) / 100) })}
//                 accessibilityRole="button"
//                 style={styles.stepperButton}
//               >
//                 <Text style={styles.stepperText}>−</Text>
//               </Pressable>
//               <Text style={styles.hourValue} testID="filters-confidence-value">
//                 {Math.round(draft.minConfidence * 100)}%
//               </Text>
//               <Pressable
//                 testID="filters-inc-minConfidence"
//                 onPress={() => patch({ minConfidence: Math.min(0.95, Math.round((draft.minConfidence + 0.05) * 100) / 100) })}
//                 accessibilityRole="button"
//                 style={styles.stepperButton}
//               >
//                 <Text style={styles.stepperText}>+</Text>
//               </Pressable>
//             </View>
//           </View>
//         </SectionCard>

//         {/* Required fields */}
//         <SectionCard
//           title="Required fields"
//           subtitle="Requests missing these are never eligible (0 and missing are treated the same for fare)"
//           testID="filters-required-card"
//         >
//           <View style={styles.chipWrap}>
//             {REQUIRED_FIELD_OPTIONS.map((field) => (
//               <Chip
//                 key={field}
//                 label={REQUIRED_FIELD_LABELS[field]}
//                 selected={draft.requiredFields.includes(field)}
//                 onPress={() => toggleRequiredField(field)}
//                 testID={`filters-required-${field}`}
//               />
//             ))}
//           </View>
//         </SectionCard>

//         {/* Destination filter */}
//         <SectionCard
//           title="Destination filter (optional)"
//           subtitle="Comma-separated destination keywords to reject when drop location is detected"
//           testID="filters-destination-card"
//         >
//           <TextInput
//             testID="filters-excluded-drop-input"
//             style={styles.textField}
//             value={excludedDropText}
//             onChangeText={setExcludedDropText}
//             placeholder="e.g. airport, toll plaza"
//             placeholderTextColor={colors.onSurfaceTertiary}
//             autoCapitalize="none"
//             autoCorrect={false}
//           />
//         </SectionCard>

//         {/* Platforms */}
//         <SectionCard title="Platforms" subtitle="Master enable/disable per platform" testID="filters-platforms-card">
//           {PLATFORM_ORDER.map((platform) => (
//             <ToggleRow
//               key={platform}
//               label={platformDisplayName(platform)}
//               value={draft.platformEnabled[platform]}
//               onValueChange={(v) => patch({ platformEnabled: { ...draft.platformEnabled, [platform]: v } })}
//               testID={`filters-platform-${platform}`}
//             />
//           ))}
//           <View style={styles.chipWrap}>
//             {PLATFORM_ORDER.map((platform) =>
//               (draft.allowedCategories[platform] ?? []).map((category) => (
//                 <Chip
//                   key={`${platform}-${category}`}
//                   label={`${platform} · ${category}`}
//                   selected
//                   onPress={() => toggleCategory(platform, category)}
//                   testID={`filters-category-${platform}-${category}`}
//                 />
//               )),
//             )}
//           </View>
//           <Text style={styles.hint}>Tap an allowed category chip to remove it from that platform&apos;s allowed list.</Text>
//         </SectionCard>

//         {/* Acceptance mode */}
//         <SectionCard
//           title="Approval mode"
//           subtitle="Manual approval is always available. Automatic acceptance only activates where a permitted, verified interaction exists."
//           testID="filters-mode-card"
//         >
//           <View style={styles.chipWrap}>
//             <Chip
//               label="Manual approval"
//               selected={draft.acceptanceMode === "manual"}
//               onPress={() => patch({ acceptanceMode: "manual" })}
//               testID="filters-mode-manual"
//             />
//             <Chip
//               label="Auto (where permitted)"
//               selected={draft.acceptanceMode === "auto-permitted"}
//               onPress={() => {
//                 patch({ acceptanceMode: "auto-permitted" });
//                 toast.show("Auto-accept stays off until a permitted interaction adapter is verified on your device", "warning");
//               }}
//               testID="filters-mode-auto"
//             />
//           </View>
//         </SectionCard>
//       </KeyboardAwareScrollView>

//       {/* Sticky actions above the keyboard */}
//       <KeyboardStickyView style={{ paddingBottom: insets.bottom + spacing.sm }}>
//         <View style={styles.stickyBar}>
//           {errors.length > 0 ? (
//             <View style={styles.errors} testID="filters-errors">
//               {errors.map((error, i) => (
//                 <Text key={i} style={styles.errorText}>
//                   • {error}
//                 </Text>
//               ))}
//             </View>
//           ) : null}
//           <View style={styles.stickyButtons}>
//             <PrimaryButton label="Reset to defaults" onPress={() => setConfirmReset(true)} testID="filters-reset-button" tone="neutral" />
//             <PrimaryButton label="Save rules" onPress={save} testID="filters-save-button" />
//           </View>
//         </View>
//       </KeyboardStickyView>

//       <ConfirmSheet
//         visible={confirmReset}
//         title="Reset filter rules?"
//         message="All rules return to RideAssist's illustrative defaults. You can edit them again at any time."
//         actions={[
//           {
//             label: "Reset to defaults",
//             onPress: () => {
//               setDraft(DEFAULT_SETTINGS);
//               setExcludedDropText("");
//               setErrors([]);
//               rideStore.setSettings(DEFAULT_SETTINGS);
//               setConfirmReset(false);
//               toast.show("Filter rules reset to defaults", "info");
//             },
//             testID: "filters-reset-confirm",
//             tone: "danger",
//           },
//         ]}
//         onDismiss={() => setConfirmReset(false)}
//       />
//     </View>
//   );
// }

// const useStyles = makeStyles((colors) => ({
//   screen: {
//     flex: 1,
//     backgroundColor: colors.surface,
//   },
//   headerRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   title: {
//     fontFamily: fonts.display,
//     fontSize: 34,
//     lineHeight: 38,
//     color: colors.onSurface,
//   },
//   link: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onBrandTertiary,
//     minHeight: 44,
//     textAlignVertical: "center",
//     paddingHorizontal: spacing.sm,
//   },
//   summary: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 13,
//     color: colors.onSurfaceSecondary,
//     lineHeight: 18,
//   },
//   fieldRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     gap: spacing.md,
//     paddingVertical: spacing.xs,
//   },
//   fieldTextBlock: {
//     flex: 1,
//     gap: 2,
//   },
//   fieldLabel: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onSurface,
//   },
//   fieldHint: {
//     fontFamily: fonts.body,
//     fontSize: 11,
//     color: colors.onSurfaceTertiary,
//     lineHeight: 15,
//   },
//   stepper: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: spacing.xs,
//   },
//   stepperButton: {
//     width: 36,
//     height: 36,
//     borderRadius: radius.sm,
//     backgroundColor: colors.surfaceTertiary,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   stepperText: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 18,
//     color: colors.onSurface,
//   },
//   input: {
//     width: 76,
//     height: 36,
//     borderRadius: radius.sm,
//     backgroundColor: colors.surfaceTertiary,
//     color: colors.onSurface,
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     textAlign: "center",
//     paddingVertical: 0,
//   },
//   textField: {
//     height: 42,
//     borderRadius: radius.sm,
//     backgroundColor: colors.surfaceTertiary,
//     color: colors.onSurface,
//     fontFamily: fonts.body,
//     fontSize: 13,
//     paddingHorizontal: spacing.md,
//   },
//   hourValue: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 13,
//     color: colors.onSurface,
//     minWidth: 96,
//     textAlign: "center",
//   },
//   chipWrap: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: spacing.sm,
//   },
//   hint: {
//     fontFamily: fonts.body,
//     fontSize: 11,
//     color: colors.onSurfaceTertiary,
//   },
//   stickyBar: {
//     backgroundColor: colors.surfaceSecondary,
//     borderTopWidth: 1,
//     borderTopColor: colors.border,
//     paddingHorizontal: spacing.lg,
//     paddingTop: spacing.md,
//     gap: spacing.sm,
//   },
//   stickyButtons: {
//     flexDirection: "row",
//     gap: spacing.md,
//   },
//   errors: {
//     gap: 2,
//   },
//   errorText: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 12,
//     color: colors.error,
//   },
// }));

// NEW UI
// Ride filter editor: validated numeric fields with steppers, operating hours,
// required fields, destination filter, platform toggles, acceptance mode, sticky Reset/Save bar.
// import { Children, useMemo, useState, type ReactNode } from "react";
// import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
// import { Pressable, Switch, Text, TextInput, View } from "react-native";
// import { useRouter } from "expo-router";
// import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
// import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

// import { Chip, PrimaryButton, type IconName } from "@/src/components/ui";
// import { ConfirmSheet } from "@/src/components/ConfirmSheet";
// import { useToast } from "@/src/components/Toast";
// import { rideStore } from "@/src/services/rideStore";
// import { DEFAULT_SETTINGS, REQUIRED_FIELD_OPTIONS } from "@/src/rules/defaults";
// import { validateRuleSettings } from "@/src/rules/engine";
// import { useRideAssistState } from "@/src/hooks/useRideEngine";
// import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
// import type { MissingField, RidePlatform, RuleSettings } from "@/src/models/types";
// import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";

// const REQUIRED_FIELD_LABELS: Record<(typeof REQUIRED_FIELD_OPTIONS)[number], string> = {
//   fare: "Fare",
//   pickupDistanceKm: "Pickup distance",
//   tripDistanceKm: "Trip distance",
// };

// type NumericKey = keyof Pick<
//   RuleSettings,
//   "minFare" | "maxPickupKm" | "minTripKm" | "minFarePerKm" | "maxRequestAgeSec"
// >;

// interface NumericFieldSpec {
//   key: NumericKey;
//   label: string;
//   icon: IconName;
//   step: number;
//   min: number;
//   max: number;
//   suffix: string;
// }

// const NUMERIC: Record<NumericKey, NumericFieldSpec> = {
//   minFare: { key: "minFare", label: "Minimum fare", icon: "currency-inr", step: 10, min: 0, max: 10000, suffix: "₹" },
//   minFarePerKm: { key: "minFarePerKm", label: "Min fare per km", icon: "speedometer", step: 1, min: 0, max: 500, suffix: "₹/km" },
//   maxPickupKm: { key: "maxPickupKm", label: "Max pickup distance", icon: "map-marker-radius-outline", step: 0.5, min: 0.5, max: 50, suffix: "km" },
//   minTripKm: { key: "minTripKm", label: "Min trip distance", icon: "map-marker-distance", step: 1, min: 0, max: 200, suffix: "km" },
//   maxRequestAgeSec: { key: "maxRequestAgeSec", label: "Max request age", icon: "timer-sand", step: 5, min: 10, max: 600, suffix: "sec" },
// };

// export default function FiltersScreen() {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   const insets = useSafeAreaInsets();
//   const router = useRouter();
//   const toast = useToast();
//   const state = useRideAssistState();

//   const [draft, setDraft] = useState<RuleSettings>(state.settings);
//   const [excludedDropText, setExcludedDropText] = useState<string>(
//     (state.settings.excludedDropKeywords ?? []).join(", "),
//   );
//   const [errors, setErrors] = useState<string[]>([]);
//   const [confirmReset, setConfirmReset] = useState(false);

//   const patch = (partial: Partial<RuleSettings>) => setDraft((d) => ({ ...d, ...partial }));

//   const setNumber = (key: NumericKey, raw: string) => {
//     const value = Number.parseFloat(raw);
//     patch({ [key]: Number.isFinite(value) ? value : 0 } as Partial<RuleSettings>);
//   };

//   const bump = (spec: NumericFieldSpec, direction: 1 | -1) => {
//     const current = draft[spec.key];
//     const next = Math.min(spec.max, Math.max(spec.min, Math.round((current + spec.step * direction) * 100) / 100));
//     patch({ [spec.key]: next } as Partial<RuleSettings>);
//   };

//   const toggleRequiredField = (field: MissingField) => {
//     const has = draft.requiredFields.includes(field);
//     patch({ requiredFields: has ? draft.requiredFields.filter((f) => f !== field) : [...draft.requiredFields, field] });
//   };

//   const toggleCategory = (platform: RidePlatform, category: string) => {
//     const current = draft.allowedCategories[platform] ?? [];
//     const next = current.includes(category) ? current.filter((c) => c !== category) : [...current, category];
//     patch({ allowedCategories: { ...draft.allowedCategories, [platform]: next } });
//   };

//   const summary = useMemo(() => {
//     const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
//     return [
//       `Fare ≥ ₹${draft.minFare}`,
//       `Pickup ≤ ${draft.maxPickupKm} km`,
//       draft.minTripKm > 0 ? `Trip ≥ ${draft.minTripKm} km` : null,
//       draft.minFarePerKm > 0 ? `≥ ₹${draft.minFarePerKm}/km` : null,
//       `${hour(draft.startHour)}–${hour(draft.endHour)}`,
//       `Max age ${draft.maxRequestAgeSec}s`,
//       `Confidence ≥ ${Math.round(draft.minConfidence * 100)}%`,
//     ].filter((s): s is string => Boolean(s));
//   }, [draft]);

//   const save = () => {
//     const excludedDropKeywords = excludedDropText
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);
//     const nextSettings: RuleSettings = {
//       ...draft,
//       ...(excludedDropKeywords.length > 0 ? { excludedDropKeywords } : { excludedDropKeywords: undefined }),
//     };
//     const problems = validateRuleSettings(nextSettings);
//     setErrors(problems);
//     if (problems.length > 0) return;
//     rideStore.setSettings(nextSettings);
//     toast.show("Filter rules saved", "success");
//     if (router.canGoBack()) router.back();
//     else router.replace("/settings");
//   };

//   const numericRow = (key: NumericKey) => {
//     const spec = NUMERIC[key];
//     return (
//       <FieldRow icon={spec.icon} label={spec.label} sub={spec.suffix}>
//         <Stepper decTestID={`filters-dec-${key}`} incTestID={`filters-inc-${key}`} onDec={() => bump(spec, -1)} onInc={() => bump(spec, 1)}>
//           <TextInput
//             testID={`filters-input-${key}`}
//             style={styles.input}
//             value={String(draft[key])}
//             onChangeText={(raw) => setNumber(key, raw)}
//             keyboardType="decimal-pad"
//             selectTextOnFocus
//           />
//         </Stepper>
//       </FieldRow>
//     );
//   };

//   const hourRow = (key: "startHour" | "endHour") => (
//     <FieldRow icon={key === "startHour" ? "clock-start" : "clock-end"} label={key === "startHour" ? "Start hour" : "End hour"}>
//       <Stepper
//         decTestID={`filters-dec-${key}`}
//         incTestID={`filters-inc-${key}`}
//         onDec={() => patch({ [key]: (draft[key] + 23) % 24 } as Partial<RuleSettings>)}
//         onInc={() => patch({ [key]: (draft[key] + 1) % 24 } as Partial<RuleSettings>)}
//       >
//         <Text style={styles.value} testID={`filters-${key}-value`}>
//           {String(draft[key]).padStart(2, "0")}:00
//         </Text>
//       </Stepper>
//     </FieldRow>
//   );

//   const hasCategories = PLATFORM_ORDER.some((p) => (draft.allowedCategories[p] ?? []).length > 0);

//   return (
//     <SafeAreaView style={styles.screen} edges={["top"]} testID="filters-screen">
//       <KeyboardAwareScrollView
//         bottomOffset={16}
//         keyboardShouldPersistTaps="handled"
//         contentContainerStyle={{
//           paddingTop: spacing.md,
//           paddingBottom: spacing.xl,
//           paddingHorizontal: spacing.lg,
//           gap: spacing.lg,
//         }}
//         showsVerticalScrollIndicator={false}
//       >
//         {/* Header */}
//         <View style={styles.headerRow}>
//           <Text style={styles.title}>Ride filters</Text>
//           <Pressable
//             testID="filters-close"
//             accessibilityRole="button"
//             onPress={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
//             style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
//           >
//             <Text style={styles.doneText}>Done</Text>
//           </Pressable>
//         </View>

//         {/* Live summary */}
//         <View testID="filters-summary-card" style={styles.summaryCard}>
//           <View style={styles.pillWrap}>
//             {summary.map((s) => (
//               <View key={s} style={styles.pill}>
//                 <Text style={styles.pillText}>{s}</Text>
//               </View>
//             ))}
//           </View>
//         </View>

//         {/* Numeric rules, grouped */}
//         <View testID="filters-numeric-card" style={styles.stack}>
//           <Group title="Fare">
//             {numericRow("minFare")}
//             {numericRow("minFarePerKm")}
//           </Group>
//           <Group title="Distance">
//             {numericRow("maxPickupKm")}
//             {numericRow("minTripKm")}
//           </Group>
//           <Group title="Timing">
//             {hourRow("startHour")}
//             {hourRow("endHour")}
//             {numericRow("maxRequestAgeSec")}
//           </Group>
//           <Group title="Data quality">
//             <FieldRow icon="shield-check-outline" label="Min confidence" sub="%">
//               <Stepper
//                 decTestID="filters-dec-minConfidence"
//                 incTestID="filters-inc-minConfidence"
//                 onDec={() => patch({ minConfidence: Math.max(0.3, Math.round((draft.minConfidence - 0.05) * 100) / 100) })}
//                 onInc={() => patch({ minConfidence: Math.min(0.95, Math.round((draft.minConfidence + 0.05) * 100) / 100) })}
//               >
//                 <Text style={styles.value} testID="filters-confidence-value">
//                   {Math.round(draft.minConfidence * 100)}%
//                 </Text>
//               </Stepper>
//             </FieldRow>
//           </Group>
//         </View>

//         {/* Required fields */}
//         <Group title="Required fields" testID="filters-required-card">
//           <View style={styles.pad}>
//             <View style={styles.chipWrap}>
//               {REQUIRED_FIELD_OPTIONS.map((field) => (
//                 <Chip
//                   key={field}
//                   label={REQUIRED_FIELD_LABELS[field]}
//                   selected={draft.requiredFields.includes(field)}
//                   onPress={() => toggleRequiredField(field)}
//                   testID={`filters-required-${field}`}
//                 />
//               ))}
//             </View>
//           </View>
//         </Group>

//         {/* Destination filter */}
//         <Group title="Skip destinations" testID="filters-destination-card">
//           <View style={styles.pad}>
//             <TextInput
//               testID="filters-excluded-drop-input"
//               style={styles.textField}
//               value={excludedDropText}
//               onChangeText={setExcludedDropText}
//               placeholder="airport, toll plaza"
//               placeholderTextColor={colors.onSurfaceTertiary}
//               autoCapitalize="none"
//               autoCorrect={false}
//             />
//           </View>
//         </Group>

//         {/* Platforms */}
//         <Group title="Platforms" testID="filters-platforms-card">
//           {PLATFORM_ORDER.map((platform) => (
//             <FieldRow key={platform} icon="steering" label={platformDisplayName(platform)}>
//               <Switch
//                 testID={`filters-platform-${platform}`}
//                 value={draft.platformEnabled[platform]}
//                 onValueChange={(v) => patch({ platformEnabled: { ...draft.platformEnabled, [platform]: v } })}
//                 accessibilityLabel={platformDisplayName(platform)}
//                 trackColor={{ false: colors.border, true: colors.brandPrimary }}
//                 thumbColor="#FFFFFF"
//                 ios_backgroundColor={colors.border}
//               />
//             </FieldRow>
//           ))}
//           {hasCategories ? (
//             <View style={styles.pad}>
//               <View style={styles.chipWrap}>
//                 {PLATFORM_ORDER.map((platform) =>
//                   (draft.allowedCategories[platform] ?? []).map((category) => (
//                     <Chip
//                       key={`${platform}-${category}`}
//                       label={`${platform} · ${category}`}
//                       selected
//                       onPress={() => toggleCategory(platform, category)}
//                       testID={`filters-category-${platform}-${category}`}
//                     />
//                   )),
//                 )}
//               </View>
//             </View>
//           ) : null}
//         </Group>

//         {/* Acceptance mode */}
//         <Group title="Approval mode" testID="filters-mode-card">
//           <View style={styles.pad}>
//             <View style={styles.chipWrap}>
//               <Chip
//                 label="Manual approval"
//                 selected={draft.acceptanceMode === "manual"}
//                 onPress={() => patch({ acceptanceMode: "manual" })}
//                 testID="filters-mode-manual"
//               />
//               <Chip
//                 label="Auto (where permitted)"
//                 selected={draft.acceptanceMode === "auto-permitted"}
//                 onPress={() => {
//                   patch({ acceptanceMode: "auto-permitted" });
//                   toast.show("Auto-accept stays off until a permitted interaction adapter is verified on your device", "warning");
//                 }}
//                 testID="filters-mode-auto"
//               />
//             </View>
//           </View>
//         </Group>
//       </KeyboardAwareScrollView>

//       {/* Sticky actions above the keyboard */}
//       <KeyboardStickyView style={{ paddingBottom: insets.bottom + spacing.sm }}>
//         <View style={styles.stickyBar}>
//           {errors.length > 0 ? (
//             <View style={styles.errors} testID="filters-errors">
//               {errors.map((error, i) => (
//                 <Text key={i} style={styles.errorText}>
//                   • {error}
//                 </Text>
//               ))}
//             </View>
//           ) : null}
//           <View style={styles.stickyButtons}>
//             <View style={styles.flex}>
//               <PrimaryButton label="Reset" onPress={() => setConfirmReset(true)} testID="filters-reset-button" tone="neutral" />
//             </View>
//             <View style={styles.flex2}>
//               <PrimaryButton label="Save rules" onPress={save} testID="filters-save-button" />
//             </View>
//           </View>
//         </View>
//       </KeyboardStickyView>

//       <ConfirmSheet
//         visible={confirmReset}
//         title="Reset filter rules?"
//         message="All rules return to the defaults."
//         actions={[
//           {
//             label: "Reset to defaults",
//             onPress: () => {
//               setDraft(DEFAULT_SETTINGS);
//               setExcludedDropText("");
//               setErrors([]);
//               rideStore.setSettings(DEFAULT_SETTINGS);
//               setConfirmReset(false);
//               toast.show("Filter rules reset to defaults", "info");
//             },
//             testID: "filters-reset-confirm",
//             tone: "danger",
//           },
//         ]}
//         onDismiss={() => setConfirmReset(false)}
//       />
//     </SafeAreaView>
//   );
// }

// function Group({ title, testID, children }: { title: string; testID?: string; children: ReactNode }) {
//   const styles = useStyles();
//   return (
//     <View testID={testID} style={styles.groupWrap}>
//       <Text style={styles.groupTitle}>{title}</Text>
//       <View style={styles.group}>
//         {Children.toArray(children).map((child, i) => (
//           <View key={i} style={i > 0 ? styles.divider : undefined}>
//             {child}
//           </View>
//         ))}
//       </View>
//     </View>
//   );
// }

// function FieldRow({ icon, label, sub, children }: { icon: IconName; label: string; sub?: string; children: ReactNode }) {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   return (
//     <View style={styles.fieldRow}>
//       <View style={styles.iconTile}>
//         <MaterialCommunityIcons name={icon} size={18} color={colors.onBrandTertiary} />
//       </View>
//       <View style={styles.fieldText}>
//         <Text style={styles.fieldLabel}>{label}</Text>
//         {sub ? <Text style={styles.fieldSub}>{sub}</Text> : null}
//       </View>
//       {children}
//     </View>
//   );
// }

// function Stepper({
//   decTestID,
//   incTestID,
//   onDec,
//   onInc,
//   children,
// }: {
//   decTestID: string;
//   incTestID: string;
//   onDec: () => void;
//   onInc: () => void;
//   children: ReactNode;
// }) {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   return (
//     <View style={styles.stepper}>
//       <Pressable
//         testID={decTestID}
//         onPress={onDec}
//         accessibilityRole="button"
//         accessibilityLabel="Decrease"
//         style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
//       >
//         <MaterialCommunityIcons name="minus" size={18} color={colors.onSurface} />
//       </Pressable>
//       {children}
//       <Pressable
//         testID={incTestID}
//         onPress={onInc}
//         accessibilityRole="button"
//         accessibilityLabel="Increase"
//         style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
//       >
//         <MaterialCommunityIcons name="plus" size={18} color={colors.onSurface} />
//       </Pressable>
//     </View>
//   );
// }

// const useStyles = makeStyles((colors) => ({
//   screen: {
//     flex: 1,
//     backgroundColor: colors.surface,
//   },
//   flex: { flex: 1 },
//   flex2: { flex: 2 },
//   pressed: { opacity: 0.7 },
//   headerRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   title: {
//     fontFamily: fonts.display,
//     fontSize: 34,
//     lineHeight: 40,
//     color: colors.onSurface,
//   },
//   doneButton: {
//     minHeight: 40,
//     paddingHorizontal: spacing.lg,
//     borderRadius: 20,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: colors.brandPrimary,
//   },
//   doneText: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onBrandPrimary,
//   },

//   summaryCard: {
//     padding: spacing.md,
//     borderRadius: radius.md,
//     borderWidth: 1,
//     borderColor: colors.brandSecondary,
//     backgroundColor: colors.brandTertiary,
//   },
//   pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
//   pill: {
//     paddingHorizontal: spacing.md,
//     paddingVertical: spacing.xs,
//     borderRadius: 999,
//     backgroundColor: colors.surface,
//     borderWidth: 1,
//     borderColor: colors.border,
//   },
//   pillText: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 12,
//     color: colors.onSurfaceSecondary,
//   },

//   stack: { gap: spacing.lg },
//   groupWrap: { gap: spacing.sm },
//   groupTitle: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onSurfaceTertiary,
//     paddingHorizontal: spacing.xs,
//   },
//   group: {
//     borderRadius: radius.md,
//     borderWidth: 1,
//     borderColor: colors.border,
//     backgroundColor: colors.surfaceTertiary,
//     overflow: "hidden",
//   },
//   divider: {
//     borderTopWidth: 1,
//     borderTopColor: colors.border,
//   },
//   pad: { padding: spacing.lg },

//   fieldRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: spacing.md,
//     minHeight: 60,
//     paddingHorizontal: spacing.lg,
//     paddingVertical: spacing.sm,
//   },
//   iconTile: {
//     width: 32,
//     height: 32,
//     borderRadius: 10,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: colors.brandTertiary,
//   },
//   fieldText: { flex: 1, gap: 1 },
//   fieldLabel: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onSurface,
//   },
//   fieldSub: {
//     fontFamily: fonts.body,
//     fontSize: 12,
//     color: colors.onSurfaceTertiary,
//   },

//   stepper: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: spacing.xs,
//     padding: 3,
//     borderRadius: 999,
//     backgroundColor: colors.surface,
//     borderWidth: 1,
//     borderColor: colors.border,
//   },
//   stepperButton: {
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: colors.surfaceTertiary,
//   },
//   input: {
//     width: 64,
//     height: 32,
//     color: colors.onSurface,
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     textAlign: "center",
//     paddingVertical: 0,
//   },
//   value: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onSurface,
//     minWidth: 64,
//     textAlign: "center",
//   },
//   textField: {
//     height: 48,
//     borderRadius: radius.sm,
//     borderWidth: 1,
//     borderColor: colors.border,
//     backgroundColor: colors.surface,
//     color: colors.onSurface,
//     fontFamily: fonts.body,
//     fontSize: 14,
//     paddingHorizontal: spacing.md,
//   },
//   chipWrap: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: spacing.sm,
//   },

//   stickyBar: {
//     backgroundColor: colors.surfaceSecondary,
//     borderTopWidth: 1,
//     borderTopColor: colors.border,
//     paddingHorizontal: spacing.lg,
//     paddingTop: spacing.md,
//     gap: spacing.sm,
//   },
//   stickyButtons: {
//     flexDirection: "row",
//     gap: spacing.md,
//   },
//   errors: {
//     gap: 2,
//   },
//   errorText: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 12,
//     color: colors.error,
//   },
// }));

// UI 2
// Ride filter editor: validated numeric fields with steppers, operating hours,
// required fields, destination filter, platform toggles, acceptance mode, sticky Reset/Save bar.
import { useMemo, useState, type ReactNode } from "react";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, PrimaryButton, type IconName } from "@/src/components/ui";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { rideStore } from "@/src/services/rideStore";
import { DEFAULT_SETTINGS, REQUIRED_FIELD_OPTIONS } from "@/src/rules/defaults";
import { validateRuleSettings } from "@/src/rules/engine";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { MissingField, RidePlatform, RuleSettings } from "@/src/models/types";
import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";

const REQUIRED_FIELD_LABELS: Record<(typeof REQUIRED_FIELD_OPTIONS)[number], string> = {
  fare: "Fare",
  pickupDistanceKm: "Pickup distance",
  tripDistanceKm: "Trip distance",
};

type NumericKey = keyof Pick<
  RuleSettings,
  "minFare" | "maxPickupKm" | "minTripKm" | "minFarePerKm" | "maxRequestAgeSec"
>;

interface NumericFieldSpec {
  key: NumericKey;
  label: string;
  icon: IconName;
  step: number;
  min: number;
  max: number;
  suffix: string;
}

const NUMERIC: Record<NumericKey, NumericFieldSpec> = {
  minFare: { key: "minFare", label: "Min fare", icon: "currency-inr", step: 10, min: 0, max: 10000, suffix: "₹" },
  minFarePerKm: { key: "minFarePerKm", label: "Fare per km", icon: "speedometer", step: 1, min: 0, max: 500, suffix: "₹/km" },
  maxPickupKm: { key: "maxPickupKm", label: "Max pickup", icon: "map-marker-radius-outline", step: 0.5, min: 0.5, max: 50, suffix: "km" },
  minTripKm: { key: "minTripKm", label: "Min trip", icon: "map-marker-distance", step: 1, min: 0, max: 200, suffix: "km" },
  maxRequestAgeSec: { key: "maxRequestAgeSec", label: "Request age", icon: "timer-sand", step: 5, min: 10, max: 600, suffix: "sec" },
};

export default function FiltersScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();

  const [draft, setDraft] = useState<RuleSettings>(state.settings);
  const [excludedDropText, setExcludedDropText] = useState<string>(
    (state.settings.excludedDropKeywords ?? []).join(", "),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);

  const patch = (partial: Partial<RuleSettings>) => setDraft((d) => ({ ...d, ...partial }));

  const setNumber = (key: NumericKey, raw: string) => {
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
    ].filter((s): s is string => Boolean(s));
  }, [draft]);

  const save = () => {
    const excludedDropKeywords = excludedDropText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const nextSettings: RuleSettings = {
      ...draft,
      ...(excludedDropKeywords.length > 0 ? { excludedDropKeywords } : { excludedDropKeywords: undefined }),
    };
    const problems = validateRuleSettings(nextSettings);
    setErrors(problems);
    if (problems.length > 0) return;
    rideStore.setSettings(nextSettings);
    toast.show("Filter rules saved", "success");
    if (router.canGoBack()) router.back();
    else router.replace("/settings");
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  // 24h strip: which hours fall inside the operating window (wraps past midnight; equal = all day).
  const inWindow = (h: number) => {
    const { startHour: s, endHour: e } = draft;
    if (s === e) return true;
    return s < e ? h >= s && h < e : h >= s || h < e;
  };

  const numericTile = (key: NumericKey) => {
    const spec = NUMERIC[key];
    return (
      <Tile
        icon={spec.icon}
        label={spec.label}
        decTestID={`filters-dec-${key}`}
        incTestID={`filters-inc-${key}`}
        onDec={() => bump(spec, -1)}
        onInc={() => bump(spec, 1)}
      >
        <View style={styles.valueRow}>
          <TextInput
            testID={`filters-input-${key}`}
            style={styles.bigInput}
            value={String(draft[key])}
            onChangeText={(raw) => setNumber(key, raw)}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={styles.unit}>{spec.suffix}</Text>
        </View>
      </Tile>
    );
  };

  const hourColumn = (key: "startHour" | "endHour") => (
    <View style={styles.hourCol}>
      <Text style={styles.tileLabel}>{key === "startHour" ? "Start" : "End"}</Text>
      <Text style={styles.bigValue} testID={`filters-${key}-value`}>
        {String(draft[key]).padStart(2, "0")}:00
      </Text>
      <View style={styles.btnRow}>
        <RoundButton
          icon="minus"
          label="Decrease"
          testID={`filters-dec-${key}`}
          onPress={() => patch({ [key]: (draft[key] + 23) % 24 } as Partial<RuleSettings>)}
        />
        <RoundButton
          icon="plus"
          label="Increase"
          testID={`filters-inc-${key}`}
          onPress={() => patch({ [key]: (draft[key] + 1) % 24 } as Partial<RuleSettings>)}
        />
      </View>
    </View>
  );

  const hasCategories = PLATFORM_ORDER.some((p) => (draft.allowedCategories[p] ?? []).length > 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="filters-screen">
      <KeyboardAwareScrollView
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
          gap: spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.headerRow, styles.pad]}>
          <Text style={styles.title}>Filters</Text>
          <Pressable
            testID="filters-close"
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={close}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="close" size={20} color={colors.onSurface} />
          </Pressable>
        </View>

        {/* Live summary strip */}
        <View testID="filters-summary-card">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {summary.map((s) => (
              <View key={s} style={styles.pill}>
                <Text style={styles.pillText}>{s}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.pad, styles.stack]} testID="filters-numeric-card">
          {/* Operating hours with a 24h strip */}
          <View style={styles.hoursCard}>
            <View style={styles.hoursHeader}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={colors.onBrandTertiary} />
              <Text style={styles.tileLabel}>Active hours</Text>
            </View>
            <View style={styles.dayStrip}>
              {Array.from({ length: 24 }, (_, h) => (
                <View key={h} style={[styles.dayCell, inWindow(h) && styles.dayCellOn]} />
              ))}
            </View>
            <View style={styles.hourPair}>
              {hourColumn("startHour")}
              <View style={styles.hourDivider} />
              {hourColumn("endHour")}
            </View>
          </View>

          {/* Numeric tiles */}
          <View style={styles.grid}>
            {numericTile("minFare")}
            {numericTile("minFarePerKm")}
          </View>
          <View style={styles.grid}>
            {numericTile("maxPickupKm")}
            {numericTile("minTripKm")}
          </View>
          <View style={styles.grid}>
            {numericTile("maxRequestAgeSec")}
            <Tile
              icon="shield-check-outline"
              label="Confidence"
              decTestID="filters-dec-minConfidence"
              incTestID="filters-inc-minConfidence"
              onDec={() => patch({ minConfidence: Math.max(0.3, Math.round((draft.minConfidence - 0.05) * 100) / 100) })}
              onInc={() => patch({ minConfidence: Math.min(0.95, Math.round((draft.minConfidence + 0.05) * 100) / 100) })}
            >
              <Text style={styles.bigValue} testID="filters-confidence-value">
                {Math.round(draft.minConfidence * 100)}%
              </Text>
            </Tile>
          </View>
        </View>

        {/* Required fields */}
        <Section title="Required fields" testID="filters-required-card">
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
        </Section>

        {/* Destination filter */}
        <Section title="Skip destinations" testID="filters-destination-card">
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="map-marker-off-outline" size={18} color={colors.onSurfaceTertiary} />
            <TextInput
              testID="filters-excluded-drop-input"
              style={styles.searchInput}
              value={excludedDropText}
              onChangeText={setExcludedDropText}
              placeholder="airport, toll plaza"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </Section>

        {/* Platforms */}
        <Section title="Platforms" testID="filters-platforms-card">
          <View style={styles.platformCard}>
            {PLATFORM_ORDER.map((platform, i) => (
              <View key={platform} style={[styles.platformRow, i > 0 && styles.divider]}>
                <Text style={styles.platformName}>{platformDisplayName(platform)}</Text>
                <Switch
                  testID={`filters-platform-${platform}`}
                  value={draft.platformEnabled[platform]}
                  onValueChange={(v) => patch({ platformEnabled: { ...draft.platformEnabled, [platform]: v } })}
                  accessibilityLabel={platformDisplayName(platform)}
                  trackColor={{ false: colors.border, true: colors.brandPrimary }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={colors.border}
                />
              </View>
            ))}
          </View>
          {hasCategories ? (
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
          ) : null}
        </Section>

        {/* Approval mode: segmented control */}
        <Section title="Approval mode" testID="filters-mode-card">
          <View style={styles.segment}>
            <Pressable
              testID="filters-mode-manual"
              accessibilityRole="button"
              accessibilityState={{ selected: draft.acceptanceMode === "manual" }}
              onPress={() => patch({ acceptanceMode: "manual" })}
              style={[styles.segmentItem, draft.acceptanceMode === "manual" && styles.segmentItemOn]}
            >
              <MaterialCommunityIcons
                name="hand-pointing-right"
                size={18}
                color={draft.acceptanceMode === "manual" ? colors.onBrandPrimary : colors.onSurfaceTertiary}
              />
              <Text style={[styles.segmentText, draft.acceptanceMode === "manual" && styles.segmentTextOn]}>Manual</Text>
            </Pressable>
            <Pressable
              testID="filters-mode-auto"
              accessibilityRole="button"
              accessibilityState={{ selected: draft.acceptanceMode === "auto-permitted" }}
              onPress={() => {
                patch({ acceptanceMode: "auto-permitted" });
                toast.show("Auto-accept stays off until a permitted interaction adapter is verified on your device", "warning");
              }}
              style={[styles.segmentItem, draft.acceptanceMode === "auto-permitted" && styles.segmentItemOn]}
            >
              <MaterialCommunityIcons
                name="flash-outline"
                size={18}
                color={draft.acceptanceMode === "auto-permitted" ? colors.onBrandPrimary : colors.onSurfaceTertiary}
              />
              <Text style={[styles.segmentText, draft.acceptanceMode === "auto-permitted" && styles.segmentTextOn]}>
                Auto
              </Text>
            </Pressable>
          </View>
        </Section>
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
            <View style={styles.flex}>
              <PrimaryButton label="Reset" onPress={() => setConfirmReset(true)} testID="filters-reset-button" tone="neutral" />
            </View>
            <View style={styles.flex2}>
              <PrimaryButton label="Save rules" onPress={save} testID="filters-save-button" />
            </View>
          </View>
        </View>
      </KeyboardStickyView>

      <ConfirmSheet
        visible={confirmReset}
        title="Reset filter rules?"
        message="All rules return to the defaults."
        actions={[
          {
            label: "Reset to defaults",
            onPress: () => {
              setDraft(DEFAULT_SETTINGS);
              setExcludedDropText("");
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
    </SafeAreaView>
  );
}

function Section({ title, testID, children }: { title: string; testID?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.section, styles.pad]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function RoundButton({
  icon,
  label,
  testID,
  onPress,
}: {
  icon: IconName;
  label: string;
  testID: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.onSurface} />
    </Pressable>
  );
}

function Tile({
  icon,
  label,
  decTestID,
  incTestID,
  onDec,
  onInc,
  children,
}: {
  icon: IconName;
  label: string;
  decTestID: string;
  incTestID: string;
  onDec: () => void;
  onInc: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.tile}>
      <View style={styles.tileHeader}>
        <MaterialCommunityIcons name={icon} size={16} color={colors.onBrandTertiary} />
        <Text style={styles.tileLabel}>{label}</Text>
      </View>
      {children}
      <View style={styles.btnRow}>
        <RoundButton icon="minus" label={`Decrease ${label}`} testID={decTestID} onPress={onDec} />
        <RoundButton icon="plus" label={`Increase ${label}`} testID={incTestID} onPress={onInc} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  pressed: { opacity: 0.7 },
  pad: { paddingHorizontal: spacing.lg },
  stack: { gap: spacing.md },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onSurface,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },

  strip: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  pillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.onSurface,
  },

  hoursCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
  },
  hoursHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dayStrip: { flexDirection: "row", gap: 2 },
  dayCell: {
    flex: 1,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dayCellOn: { backgroundColor: colors.brandPrimary },
  hourPair: { flexDirection: "row", alignItems: "stretch" },
  hourCol: { flex: 1, alignItems: "center", gap: spacing.sm },
  hourDivider: { width: 1, backgroundColor: colors.brandSecondary },

  grid: { flexDirection: "row", gap: spacing.md },
  tile: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  tileLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
  },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.xs },
  bigInput: {
    flexShrink: 1,
    minWidth: 48,
    height: 40,
    padding: 0,
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.onSurface,
  },
  bigValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 40,
    color: colors.onSurface,
  },
  unit: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  btnRow: { flexDirection: "row", gap: spacing.sm },
  roundButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },

  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurfaceTertiary,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: colors.onSurface,
    fontFamily: fonts.body,
    fontSize: 14,
  },

  platformCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  platformName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  segment: {
    flexDirection: "row",
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  segmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 44,
    borderRadius: 10,
  },
  segmentItemOn: { backgroundColor: colors.brandPrimary },
  segmentText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurfaceTertiary,
  },
  segmentTextOn: { color: colors.onBrandPrimary },

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