// // Per-platform configuration: detection toggle, editable (unverified) package
// // id, permission status, acceptance assistance, allowed categories.
// import { useEffect, useState } from "react";
// import { ScrollView, Text, TextInput, View } from "react-native";
// import { useLocalSearchParams, useRouter } from "expo-router";
// import { useSafeAreaInsets } from "react-native-safe-area-context";

// import { Chip, EmptyState, KeyValueRow, SectionCard, ToggleRow } from "@/src/components/ui";
// import { useToast } from "@/src/components/Toast";
// import { nativeBridge } from "@/src/services/nativeBridge";
// import { rideStore } from "@/src/services/rideStore";
// import { platformDisplayName } from "@/src/services/platformRegistry";
// import { CATEGORY_OPTIONS } from "@/src/rules/defaults";
// import { useRideAssistState } from "@/src/hooks/useRideEngine";
// import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

// export default function PlatformConfigScreen() {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   const insets = useSafeAreaInsets();
//   const router = useRouter();
//   const toast = useToast();
//   const state = useRideAssistState();
//   const params = useLocalSearchParams<{ id: string }>();

//   const validPlatform = (["rapido", "uber", "ola"] as const).find((p) => p === params.id);
//   const platform = validPlatform ?? "rapido";
//   const config = state.platformConfigs.find((p) => p.platform === platform)!;

//   const [packageName, setPackageName] = useState(config.packageName);
//   const [installed, setInstalled] = useState<boolean | null>(null);

//   useEffect(() => {
//     setPackageName(config.packageName);
//   }, [config.packageName]);

//   useEffect(() => {
//     let cancelled = false;
//     void nativeBridge.isPackageInstalled(config.packageName).then((result) => {
//       if (!cancelled) setInstalled(result);
//     });
//     return () => {
//       cancelled = true;
//     };
//   }, [config.packageName]);

//   const nativeAvailable = nativeBridge.isAvailable();
//   const notifState = state.nativePermission?.notificationListener ?? "unavailable";
//   const a11yState = state.nativePermission?.accessibility ?? "unavailable";
//   const [lastEventAt, setLastEventAt] = useState<number>(0);
//   const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
//   useEffect(() => {
//     const read = () => {
//       setLastEventAt(nativeBridge.getPlatformActivity()?.[platform] ?? 0);
//       setBatteryOk(nativeBridge.isIgnoringBatteryOptimizations());
//     };
//     read();
//     const timer = setInterval(read, 5000);
//     return () => clearInterval(timer);
//   }, [platform]);
//   // "Connected" only after a REAL event from this app was observed on this phone.
//   const detectionStatus = !nativeAvailable
//     ? "Needs APK build"
//     : notifState !== "granted"
//       ? "Permission required"
//       : lastEventAt > 0
//         ? `Connected · last event ${new Date(lastEventAt).toLocaleTimeString()}`
//         : "Not detected yet";
//   const categories = CATEGORY_OPTIONS[platform];

//   const commitPackageName = (): boolean => {
//     const trimmed = packageName.trim();
//     if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(trimmed)) {
//       toast.show("Package id looks invalid — expected e.g. com.example.app", "error");
//       return false;
//     }
//     if (trimmed !== config.packageName) {
//       rideStore.setPlatformConfig(platform, { packageName: trimmed });
//       toast.show(`Package id for ${platformDisplayName(platform)} updated (still unverified)`, "info");
//     }
//     return true;
//   };

//   const toggleCategory = (category: string) => {
//     const current = state.settings.allowedCategories[platform] ?? [];
//     const next = current.includes(category)
//       ? current.filter((c) => c !== category)
//       : [...current, category];
//     rideStore.setSettings({
//       ...state.settings,
//       allowedCategories: { ...state.settings.allowedCategories, [platform]: next },
//     });
//   };

//   if (!validPlatform) {
//     return (
//       <View style={[styles.screen, { paddingTop: insets.top }]} testID="platform-screen-unknown">
//         <EmptyState
//           icon="help-circle-outline"
//           title="Unknown platform"
//           message="RideAssist supports Rapido Captain, Uber Driver and Ola Driver."
//           actionLabel="Back to Settings"
//           onAction={() => router.replace("/settings")}
//           actionTestID="platform-unknown-back"
//         />
//       </View>
//     );
//   }

//   return (
//     <View style={styles.screen} testID={`platform-screen-${platform}`}>
//       <ScrollView
//         showsVerticalScrollIndicator={false}
//         contentContainerStyle={{
//           paddingTop: insets.top + spacing.md,
//           paddingBottom: insets.bottom + spacing.xl,
//           paddingHorizontal: spacing.lg,
//           gap: spacing.md,
//         }}
//       >
//         <View style={styles.headerRow}>
//           <Text style={styles.title}>{platformDisplayName(platform)}</Text>
//           <Text style={styles.link} onPress={() => {
//               if (!commitPackageName()) return;
//               if (router.canGoBack()) router.back();
//               else router.replace("/settings");
//             }}
//             testID="platform-close">
//             Done
//           </Text>
//         </View>

//         <SectionCard testID="platform-status-card">
//           <KeyValueRow
//             label="Installed"
//             value={installed === null ? "Unknown (needs APK build)" : installed ? "Yes" : "Not found"}
//             testID={`platform-installed-${platform}`}
//           />
//           <KeyValueRow
//             label="Notification access"
//             value={!nativeAvailable ? "Needs APK build" : notifState === "granted" ? "Granted" : "Not granted"}
//           />
//           <KeyValueRow
//             label="Detection status"
//             value={detectionStatus}
//             testID={`platform-detection-status-${platform}`}
//           />
//           <KeyValueRow
//             label="Accessibility (Accept tap)"
//             value={!nativeAvailable ? "Needs APK build" : a11yState === "granted" ? "Enabled" : "Off"}
//           />
//           {nativeAvailable && batteryOk === false && (
//             <Text style={styles.link} onPress={() => nativeBridge.openBatteryOptimizationSettings()} testID="platform-battery-fix">
//               Battery optimisation is ON — Android may stop detection. Tap to allow RideAssist.
//             </Text>
//           )}
//           <KeyValueRow label="Package id verified" value="No — editable below" />
//         </SectionCard>

//         <SectionCard title="Detection" testID="platform-detection-card">
//           <ToggleRow
//             label="Detect ride requests"
//             description="Only notifications from the package id below are considered."
//             value={config.detectionEnabled}
//             onValueChange={(v) => rideStore.setPlatformConfig(platform, { detectionEnabled: v })}
//             testID={`platform-detection-toggle-${platform}`}
//           />
//           <View style={styles.packageBlock}>
//             <Text style={styles.packageLabel}>Android package id</Text>
//             <TextInput
//               testID={`platform-package-input-${platform}`}
//               style={styles.packageInput}
//               value={packageName}
//               onChangeText={setPackageName}
//               onBlur={() => void commitPackageName()}
//               onSubmitEditing={() => void commitPackageName()}
//               returnKeyType="done"
//               autoCapitalize="none"
//               autoCorrect={false}
//               keyboardType="default"
//               placeholder="com.example.driverapp"
//               placeholderTextColor={colors.onSurfaceTertiary}
//             />
//             <Text style={styles.packageHint}>
//               Pre-filled from common package names and clearly marked UNVERIFIED. Correct it to match the driver app
//               installed on your phone — being installed alone never means fully integrated.
//             </Text>
//           </View>
//         </SectionCard>

//         <SectionCard testID="platform-acceptance-card">
//           <ToggleRow
//             label="Auto-tap Accept (Accessibility)"
//             description="Off by default. When on and Accessibility is enabled, RideAssist taps the single visible Accept button only if the on-screen fare matches the request that passed your filters. A tap is never counted as accepted until the driver app shows a confirmation."
//             value={config.acceptanceAssistEnabled}
//             onValueChange={(v) => {
//               rideStore.setPlatformConfig(platform, { acceptanceAssistEnabled: v });
//               if (v && nativeAvailable && a11yState !== "granted") {
//                 toast.show("Enable RideAssist in Accessibility settings to allow the tap", "info");
//                 void nativeBridge.openAccessibilitySettings();
//               }
//             }}
//             testID={`platform-acceptance-toggle-${platform}`}
//           />
//           <Text style={styles.note}>
//             Unverified on real {platformDisplayName(platform)} versions — swipe-only buttons cannot be tapped. RideAssist
//             never bypasses security prompts, CAPTCHAs or OTP checks, and does not use root, ADB or uinput injection. If
//             the tap is unavailable or fails, accept manually in the driver app.
//           </Text>
//         </SectionCard>

//         <SectionCard
//           title="Allowed request categories"
//           subtitle="Only used when a category is reliably identified in the notification"
//           testID="platform-categories-card"
//         >
//           <View style={styles.chipWrap}>
//             {categories.map((category) => (
//               <Chip
//                 key={category}
//                 label={category}
//                 selected={(state.settings.allowedCategories[platform] ?? []).includes(category)}
//                 onPress={() => toggleCategory(category)}
//                 testID={`platform-category-${platform}-${category}`}
//               />
//             ))}
//           </View>
//           <Text style={styles.note}>
//             Missing category data is listed under required-field checks — it is never guessed from unrelated
//             notifications.
//           </Text>
//         </SectionCard>

//         <SectionCard title="Why permissions matter" testID="platform-permissions-card">
//           <Text style={styles.note}>
//             • Notification access (special access): lets RideAssist read ride request notifications from this app
//             only.{"\n"}• Accessibility (optional, off by default): reads ride cards on screen, and — only if you switch on
//             Auto-tap Accept for this app — taps the single visible Accept button.{"\n"}• Every other app&apos;s notifications are ignored and redacted
//             from logs.
//           </Text>
//         </SectionCard>
//       </ScrollView>
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
//   packageBlock: {
//     gap: spacing.xs,
//     paddingTop: spacing.xs,
//   },
//   packageLabel: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 13,
//     color: colors.onSurface,
//   },
//   packageInput: {
//     height: 44,
//     borderRadius: radius.sm,
//     backgroundColor: colors.surfaceTertiary,
//     color: colors.onSurface,
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     paddingHorizontal: spacing.md,
//   },
//   packageHint: {
//     fontFamily: fonts.body,
//     fontSize: 11,
//     lineHeight: 15,
//     color: colors.onSurfaceTertiary,
//   },
//   note: {
//     fontFamily: fonts.body,
//     fontSize: 12,
//     lineHeight: 17,
//     color: colors.onSurfaceTertiary,
//   },
//   chipWrap: {
//     flexDirection: "row",
//     flexWrap: "wrap",
//     gap: spacing.sm,
//   },
// }));

// NEW UI
// Per-platform configuration: detection toggle, editable (unverified) package
// id, permission status, acceptance assistance, allowed categories.
import { Children, useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, EmptyState, type IconName } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { nativeBridge } from "@/src/services/nativeBridge";
import { rideStore } from "@/src/services/rideStore";
import { platformDisplayName } from "@/src/services/platformRegistry";
import { CATEGORY_OPTIONS } from "@/src/rules/defaults";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Tone = "ok" | "warn" | "muted";

export default function PlatformConfigScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();
  const params = useLocalSearchParams<{ id: string }>();

  const validPlatform = (["rapido", "uber", "ola"] as const).find((p) => p === params.id);
  const platform = validPlatform ?? "rapido";
  const config = state.platformConfigs.find((p) => p.platform === platform)!;

  const [packageName, setPackageName] = useState(config.packageName);
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    setPackageName(config.packageName);
  }, [config.packageName]);

  useEffect(() => {
    let cancelled = false;
    void nativeBridge.isPackageInstalled(config.packageName).then((result) => {
      if (!cancelled) setInstalled(result);
    });
    return () => {
      cancelled = true;
    };
  }, [config.packageName]);

  const nativeAvailable = nativeBridge.isAvailable();
  const notifState = state.nativePermission?.notificationListener ?? "unavailable";
  const a11yState = state.nativePermission?.accessibility ?? "unavailable";
  const [lastEventAt, setLastEventAt] = useState<number>(0);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => {
      setLastEventAt(nativeBridge.getPlatformActivity()?.[platform] ?? 0);
      setBatteryOk(nativeBridge.isIgnoringBatteryOptimizations());
    };
    read();
    const timer = setInterval(read, 5000);
    return () => clearInterval(timer);
  }, [platform]);
  // "Connected" only after a REAL event from this app was observed on this phone.
  const detectionStatus = !nativeAvailable
    ? "Needs APK build"
    : notifState !== "granted"
      ? "Permission required"
      : lastEventAt > 0
        ? `Connected · ${new Date(lastEventAt).toLocaleTimeString()}`
        : "Not detected yet";
  const detectionTone: Tone = detectionStatus.startsWith("Connected")
    ? "ok"
    : detectionStatus === "Permission required"
      ? "warn"
      : "muted";
  const categories = CATEGORY_OPTIONS[platform];

  const commitPackageName = (): boolean => {
    const trimmed = packageName.trim();
    if (!/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(trimmed)) {
      toast.show("Package id looks invalid — expected e.g. com.example.app", "error");
      return false;
    }
    if (trimmed !== config.packageName) {
      rideStore.setPlatformConfig(platform, { packageName: trimmed });
      toast.show(`Package id for ${platformDisplayName(platform)} updated (still unverified)`, "info");
    }
    return true;
  };

  const toggleCategory = (category: string) => {
    const current = state.settings.allowedCategories[platform] ?? [];
    const next = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    rideStore.setSettings({
      ...state.settings,
      allowedCategories: { ...state.settings.allowedCategories, [platform]: next },
    });
  };

  if (!validPlatform) {
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]} testID="platform-screen-unknown">
        <EmptyState
          icon="help-circle-outline"
          title="Unknown platform"
          message="RideAssist supports Rapido Captain, Uber Driver and Ola Driver."
          actionLabel="Back to Settings"
          onAction={() => router.replace("/settings")}
          actionTestID="platform-unknown-back"
        />
      </SafeAreaView>
    );
  }

  const toneColor = (t: Tone) => (t === "ok" ? colors.success : t === "warn" ? colors.warning : colors.onSurfaceTertiary);
  const switchProps = {
    trackColor: { false: colors.border, true: colors.brandPrimary },
    thumbColor: "#FFFFFF",
    ios_backgroundColor: colors.border,
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]} testID={`platform-screen-${platform}`}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.lg,
        }}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{platformDisplayName(platform)}</Text>
            <View style={styles.statePill}>
              <View style={[styles.dot, { backgroundColor: config.detectionEnabled ? colors.success : colors.border }]} />
              <Text style={styles.statePillText}>{config.detectionEnabled ? "Detection on" : "Detection off"}</Text>
            </View>
          </View>
          <Pressable
            testID="platform-close"
            accessibilityRole="button"
            onPress={() => {
              if (!commitPackageName()) return;
              if (router.canGoBack()) router.back();
              else router.replace("/settings");
            }}
            style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {/* Battery warning */}
        {nativeAvailable && batteryOk === false && (
          <Pressable
            testID="platform-battery-fix"
            accessibilityRole="button"
            onPress={() => nativeBridge.openBatteryOptimizationSettings()}
            style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="battery-alert-variant-outline" size={22} color={colors.warning} />
            <Text style={styles.bannerText}>Battery optimisation may stop detection. Tap to fix.</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        )}

        {/* Status */}
        <Group title="Status" testID="platform-status-card">
          <StatusRow
            icon="cellphone-check"
            label="Installed"
            value={installed === null ? "Unknown" : installed ? "Yes" : "Not found"}
            color={toneColor(installed ? "ok" : "muted")}
            valueTestID={`platform-installed-${platform}`}
          />
          <StatusRow
            icon="bell-check-outline"
            label="Notifications"
            value={!nativeAvailable ? "Needs APK build" : notifState === "granted" ? "Granted" : "Not granted"}
            color={toneColor(!nativeAvailable ? "muted" : notifState === "granted" ? "ok" : "warn")}
          />
          <StatusRow
            icon="radar"
            label="Detection"
            value={detectionStatus}
            color={toneColor(detectionTone)}
            valueTestID={`platform-detection-status-${platform}`}
          />
          <StatusRow
            icon="human"
            label="Accessibility"
            value={!nativeAvailable ? "Needs APK build" : a11yState === "granted" ? "Enabled" : "Off"}
            color={toneColor(!nativeAvailable ? "muted" : a11yState === "granted" ? "ok" : "muted")}
          />
        </Group>

        {/* Detection */}
        <Group title="Detection" testID="platform-detection-card">
          <View style={styles.switchRow}>
            <View style={styles.iconTile}>
              <MaterialCommunityIcons name="bell-ring-outline" size={18} color={colors.onBrandTertiary} />
            </View>
            <Text style={styles.rowLabel}>Detect ride requests</Text>
            <Switch
              testID={`platform-detection-toggle-${platform}`}
              value={config.detectionEnabled}
              onValueChange={(v) => rideStore.setPlatformConfig(platform, { detectionEnabled: v })}
              accessibilityLabel="Detect ride requests"
              {...switchProps}
            />
          </View>
          <View style={styles.packageBlock}>
            <View style={styles.packageHeader}>
              <Text style={styles.packageLabel}>Package id</Text>
              <View style={styles.unverified}>
                <Text style={styles.unverifiedText}>Unverified</Text>
              </View>
            </View>
            <TextInput
              testID={`platform-package-input-${platform}`}
              style={styles.packageInput}
              value={packageName}
              onChangeText={setPackageName}
              onBlur={() => void commitPackageName()}
              onSubmitEditing={() => void commitPackageName()}
              returnKeyType="done"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              placeholder="com.example.driverapp"
              placeholderTextColor={colors.onSurfaceTertiary}
            />
          </View>
        </Group>

        {/* Acceptance */}
        <Group title="Accepting" testID="platform-acceptance-card">
          <View style={styles.switchRow}>
            <View style={styles.iconTile}>
              <MaterialCommunityIcons name="gesture-tap-button" size={18} color={colors.onBrandTertiary} />
            </View>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabelPlain}>Auto-tap Accept</Text>
              <Text style={styles.rowSub}>Needs Accessibility</Text>
            </View>
            <Switch
              testID={`platform-acceptance-toggle-${platform}`}
              value={config.acceptanceAssistEnabled}
              onValueChange={(v) => {
                rideStore.setPlatformConfig(platform, { acceptanceAssistEnabled: v });
                if (v && nativeAvailable && a11yState !== "granted") {
                  toast.show("Enable RideAssist in Accessibility settings to allow the tap", "info");
                  void nativeBridge.openAccessibilitySettings();
                }
              }}
              accessibilityLabel="Auto-tap Accept"
              {...switchProps}
            />
          </View>
        </Group>

        {/* Categories */}
        <Group title="Request categories" testID="platform-categories-card">
          <View style={styles.chipPad}>
            <View style={styles.chipWrap}>
              {categories.map((category) => (
                <Chip
                  key={category}
                  label={category}
                  selected={(state.settings.allowedCategories[platform] ?? []).includes(category)}
                  onPress={() => toggleCategory(category)}
                  testID={`platform-category-${platform}-${category}`}
                />
              ))}
            </View>
          </View>
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ title, testID, children }: { title: string; testID?: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.groupWrap}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>
        {Children.toArray(children).map((child, i) => (
          <View key={i} style={i > 0 ? styles.divider : undefined}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

function StatusRow({
  icon,
  label,
  value,
  color,
  valueTestID,
}: {
  icon: IconName;
  label: string;
  value: string;
  color: string;
  valueTestID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.switchRow}>
      <View style={styles.iconTile}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.onBrandTertiary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]} testID={valueTestID} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: 0.7 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.sm },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onSurface,
  },
  statePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  statePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  doneButton: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  doneText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandPrimary,
  },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.surfaceTertiary,
  },
  bannerText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.onSurface,
  },

  groupWrap: { gap: spacing.sm },
  groupTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurfaceTertiary,
    paddingHorizontal: spacing.xs,
  },
  group: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandTertiary,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  rowTextBlock: { flex: 1, gap: 1 },
  rowLabelPlain: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  rowSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  statusValue: {
    flexShrink: 1,
    maxWidth: "55%",
    textAlign: "right",
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
  },

  packageBlock: {
    gap: spacing.sm,
    padding: spacing.lg,
  },
  packageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  packageLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  unverified: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  unverifiedText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.warning,
  },
  packageInput: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.onSurface,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    paddingHorizontal: spacing.md,
  },

  chipPad: { padding: spacing.lg },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
}));