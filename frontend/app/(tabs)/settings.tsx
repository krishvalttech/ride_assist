// // Settings hub: platform configs, ride filters entry, acceptance mode,
// // simulation, data & privacy.
// import { useMemo } from "react";
// import { Pressable, ScrollView, Text, View } from "react-native";
// import { useRouter } from "expo-router";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

// import { Chip, PrimaryButton, SectionCard, ToggleRow } from "@/src/components/ui";
// import { useAuth } from "@/src/services/auth";
// import { useToast } from "@/src/components/Toast";
// import { bottomChromeInset } from "@/src/navigation";
// import { nativeBridge } from "@/src/services/nativeBridge";
// import { rideStore } from "@/src/services/rideStore";
// import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";
// import { useRideAssistState } from "@/src/hooks/useRideEngine";
// import { speakTest } from "@/src/services/voiceAlerts";
// import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
// import type { AcceptanceMode, RidePlatform } from "@/src/models/types";

// export default function SettingsScreen() {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   const insets = useSafeAreaInsets();
//   const router = useRouter();
//   const toast = useToast();
//   const state = useRideAssistState();
//   const auth = useAuth();

//   const nativeAvailable = nativeBridge.isAvailable();
//   const rulesSummary = useMemo(() => {
//     const s = state.settings;
//     return `Min ₹${s.minFare} · Pickup ≤ ${s.maxPickupKm} km · Trip ≥ ${s.minTripKm} km · ₹${s.minFarePerKm}/km · ${String(s.startHour).padStart(2, "0")}:00–${String(s.endHour).padStart(2, "0")}:00`;
//   }, [state.settings]);

//   const setAcceptanceMode = (mode: AcceptanceMode) => {
//     rideStore.setSettings({ ...state.settings, acceptanceMode: mode });
//     if (mode === "auto-permitted") {
//       toast.show("Auto-tap works only for driver apps where you switched it on (Settings → driver app) and Accessibility is enabled", "warning");
//     }
//   };

//   return (
//     <View style={styles.screen} testID="settings-screen">
//       <ScrollView
//         showsVerticalScrollIndicator={false}
//         contentContainerStyle={{
//           paddingTop: insets.top + spacing.md,
//           paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
//           gap: spacing.md,
//           paddingHorizontal: spacing.lg,
//         }}
//       >
//         <Text style={styles.title}>Settings</Text>

//         {/* Platforms */}
//         <SectionCard
//           title="Driver apps"
//           subtitle={nativeAvailable ? undefined : "Install status and native permissions need a standalone Android build"}
//           testID="settings-platforms-card"
//         >
//           {PLATFORM_ORDER.map((platform) => {
//             const config = state.platformConfigs.find((p) => p.platform === platform);
//             return (
//               <PlatformRow
//                 key={platform}
//                 platform={platform}
//                 enabled={config?.detectionEnabled ?? false}
//                 onPress={() => router.push({ pathname: "/platform/[id]", params: { id: platform } })}
//               />
//             );
//           })}
//         </SectionCard>

//         {/* Filters */}
//         <SectionCard title="Ride filters" testID="settings-filters-card">
//           <Text style={styles.summary}>{rulesSummary}</Text>
//           <Pressable
//             testID="settings-edit-filters"
//             onPress={() => router.push("/filters")}
//             accessibilityRole="button"
//             style={styles.rowLink}
//           >
//             <Text style={styles.rowLinkText}>Edit filter rules</Text>
//             <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
//           </Pressable>
//         </SectionCard>

//         {/* Acceptance */}
//         <SectionCard
//           title="Acceptance assistance"
//           subtitle="Manual approval always works. Automatic acceptance activates only where a permitted, verified interaction exists."
//           testID="settings-acceptance-card"
//         >
//           <View style={styles.chipWrap}>
//             <Chip
//               label="Manual approval"
//               selected={state.settings.acceptanceMode === "manual"}
//               onPress={() => setAcceptanceMode("manual")}
//               testID="settings-mode-manual"
//             />
//             <Chip
//               label="Auto (where permitted)"
//               selected={state.settings.acceptanceMode === "auto-permitted"}
//               onPress={() => setAcceptanceMode("auto-permitted")}
//               testID="settings-mode-auto"
//             />
//           </View>
//           <Text style={styles.note}>
//             RideAssist never shows a ride as accepted without reliable confirmation, and never uses root, ADB, uinput
//             or security-bypass mechanisms.
//           </Text>
//         </SectionCard>

//         {/* Voice alerts */}
//         <SectionCard title="Spoken ride alerts" testID="settings-voice-card">
//           <ToggleRow
//             label="Read out eligible requests"
//             description="Speaks the platform, fare and pickup distance of requests that pass all your filters. Uses on-device speech — nothing leaves your phone."
//             value={state.voiceAlertsOn}
//             onValueChange={(v) => {
//               rideStore.setVoiceAlerts(v);
//               if (v) speakTest();
//             }}
//             testID="settings-voice-toggle"
//           />
//           <Pressable testID="settings-voice-test" onPress={speakTest} accessibilityRole="button" style={styles.rowLink}>
//             <Text style={styles.rowLinkText}>Play a test announcement</Text>
//             <MaterialCommunityIcons name="volume-high" size={18} color={colors.onSurfaceTertiary} />
//           </Pressable>
//           <Text style={styles.note}>
//             Alerts play while RideAssist is open. Speaking in the background or on the lock screen needs the
//             standalone build and may be limited by Android.
//           </Text>
//         </SectionCard>

//         {/* Capture tool */}
//         <SectionCard title="Parser tuning" testID="settings-capture-card">
//           <Pressable
//             testID="settings-open-capture"
//             onPress={() => router.push("/capture")}
//             accessibilityRole="button"
//             style={styles.rowLink}
//           >
//             <Text style={styles.rowLinkText}>
//               Notification Capture Tool{state.captureOn ? " · capturing" : ""} ({state.samples.length})
//             </Text>
//             <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
//           </Pressable>
//           <Text style={styles.note}>Save redacted notification samples, label them and export them to tune the parsers.</Text>
//         </SectionCard>

//         {/* Simulation */}
//         <SectionCard title="Testing" testID="settings-simulation-card">
//           <ToggleRow
//             label="Simulation Mode"
//             description="Runs sample notifications — good, bad, duplicate and unrelated — through the real detection pipeline."
//             value={state.simulatorOn}
//             onValueChange={(v) => rideStore.setSimulator(v)}
//             testID="settings-simulation-toggle"
//           />
//         </SectionCard>

//         {/* Account */}
//         <SectionCard title="Account" testID="settings-account-card">
//           <Text style={styles.summary} testID="settings-account-email">{auth.user?.email}</Text>
//           <PrimaryButton
//             label="Log out"
//             tone="neutral"
//             onPress={() => {
//               void auth.logout().then(() => router.replace("/login"));
//             }}
//             testID="settings-logout-button"
//           />
//         </SectionCard>

//         {/* Data & privacy */}
//         <SectionCard title="Data & privacy" testID="settings-privacy-card">
//           <Text style={styles.note}>
//             • Ride notifications are processed on-device only — nothing is uploaded to a server.{"\n"}• Logs are
//             redacted: no OTPs, passwords or payment data are stored.{"\n"}• No analytics, no tracking, no remote
//             commands.
//           </Text>
//         </SectionCard>

//         <Text style={styles.footer}>
//           RideAssist v1.0 · Filter defaults are illustrative starting points, not earnings advice. Integration status
//           depends on the driver app versions installed on your phone.
//         </Text>
//       </ScrollView>
//     </View>
//   );
// }

// function PlatformRow({
//   platform,
//   enabled,
//   onPress,
// }: {
//   platform: RidePlatform;
//   enabled: boolean;
//   onPress: () => void;
// }) {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   return (
//     <Pressable
//       testID={`settings-platform-${platform}`}
//       onPress={onPress}
//       accessibilityRole="button"
//       style={styles.platformRow}
//     >
//       <View
//         style={[styles.dot, { backgroundColor: enabled ? colors.success : colors.surfaceTertiary, borderColor: colors.borderStrong }]}
//       />
//       <Text style={styles.platformName}>{platformDisplayName(platform)}</Text>
//       <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
//     </Pressable>
//   );
// }

// const useStyles = makeStyles((colors) => ({
//   screen: {
//     flex: 1,
//     backgroundColor: colors.surface,
//   },
//   title: {
//     fontFamily: fonts.display,
//     fontSize: 34,
//     lineHeight: 38,
//     color: colors.onSurface,
//   },
//   summary: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 13,
//     color: colors.onSurfaceSecondary,
//     lineHeight: 18,
//   },
//   rowLink: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//     minHeight: 44,
//   },
//   rowLinkText: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onBrandTertiary,
//   },
//   chipWrap: {
//     flexDirection: "row",
//     gap: spacing.sm,
//     flexWrap: "wrap",
//   },
//   note: {
//     fontFamily: fonts.body,
//     fontSize: 12,
//     lineHeight: 17,
//     color: colors.onSurfaceTertiary,
//   },
//   footer: {
//     fontFamily: fonts.body,
//     fontSize: 11,
//     lineHeight: 15,
//     color: colors.muted,
//     textAlign: "center",
//     paddingBottom: spacing.sm,
//   },
//   platformRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     gap: spacing.md,
//     minHeight: 44,
//   },
//   dot: {
//     width: 10,
//     height: 10,
//     borderRadius: 5,
//     borderWidth: 1,
//   },
//   platformName: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 14,
//     color: colors.onSurface,
//     flex: 1,
//   },
// }));
//  New UI
// Settings hub: account, driver apps, ride filters, acceptance mode,
// voice alerts, capture tool, simulation.
import { Children, useMemo, type ReactNode } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, PrimaryButton } from "@/src/components/ui";
import { useAuth } from "@/src/services/auth";
import { useToast } from "@/src/components/Toast";
import { bottomChromeInset } from "@/src/navigation";
import { rideStore } from "@/src/services/rideStore";
import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { speakTest } from "@/src/services/voiceAlerts";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { AcceptanceMode } from "@/src/models/types";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();
  const auth = useAuth();

  const ruleChips = useMemo(() => {
    const s = state.settings;
    const hh = (n: number) => String(n).padStart(2, "0");
    return [
      `Min ₹${s.minFare}`,
      `Pickup ≤ ${s.maxPickupKm} km`,
      `Trip ≥ ${s.minTripKm} km`,
      `₹${s.minFarePerKm}/km`,
      `${hh(s.startHour)}:00–${hh(s.endHour)}:00`,
    ];
  }, [state.settings]);

  const setAcceptanceMode = (mode: AcceptanceMode) => {
    rideStore.setSettings({ ...state.settings, acceptanceMode: mode });
    if (mode === "auto-permitted") {
      toast.show("Auto-tap works only for driver apps where you switched it on (Settings → driver app) and Accessibility is enabled", "warning");
    }
  };

  const initial = (auth.user?.email?.[0] ?? "?").toUpperCase();

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="settings-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
          gap: spacing.lg,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text style={styles.title}>Settings</Text>

        {/* Account */}
        <View style={styles.account} testID="settings-account-card">
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.accountText}>
            <Text style={styles.accountEmail} numberOfLines={1} testID="settings-account-email">
              {auth.user?.email?.split("@")[0]}
            </Text>
          </View>
          <View style={styles.logoutWrap}>
            <PrimaryButton
              label="Log out"
              tone="neutral"
              onPress={() => {
                void auth.logout().then(() => router.replace("/login"));
              }}
              testID="settings-logout-button"
            />
          </View>
        </View>

        {/* Driver apps */}
        <Group title="Driver apps" testID="settings-platforms-card">
          {PLATFORM_ORDER.map((platform) => {
            const enabled = state.platformConfigs.find((p) => p.platform === platform)?.detectionEnabled ?? false;
            return (
              <Row
                key={platform}
                icon="steering"
                label={platformDisplayName(platform)}
                testID={`settings-platform-${platform}`}
                onPress={() => router.push({ pathname: "/platform/[id]", params: { id: platform } })}
                right={
                  <View style={styles.statusWrap}>
                    <View style={[styles.dot, { backgroundColor: enabled ? colors.success : colors.border }]} />
                    <Text style={styles.statusText}>{enabled ? "On" : "Off"}</Text>
                  </View>
                }
              />
            );
          })}
        </Group>

        {/* Filters */}
        <Group title="Ride filters" testID="settings-filters-card">
          <View style={styles.chipsPad}>
            <View style={styles.ruleWrap}>
              {ruleChips.map((c) => (
                <View key={c} style={styles.rulePill}>
                  <Text style={styles.rulePillText}>{c}</Text>
                </View>
              ))}
            </View>
          </View>
          <Row icon="tune-variant" label="Edit filters" testID="settings-edit-filters" onPress={() => router.push("/filters")} />
        </Group>

        {/* Acceptance */}
        <Group title="Accepting rides" testID="settings-acceptance-card">
          <View style={styles.chipsPad}>
            <View style={styles.chipWrap}>
              <Chip
                label="Manual approval"
                selected={state.settings.acceptanceMode === "manual"}
                onPress={() => setAcceptanceMode("manual")}
                testID="settings-mode-manual"
              />
              <Chip
                label="Auto (where permitted)"
                selected={state.settings.acceptanceMode === "auto-permitted"}
                onPress={() => setAcceptanceMode("auto-permitted")}
                testID="settings-mode-auto"
              />
            </View>
          </View>
        </Group>

        {/* Voice alerts */}
        <Group title="Voice alerts" testID="settings-voice-card">
          <Row
            icon="account-voice"
            label="Read out eligible rides"
            right={
              <Switch
                testID="settings-voice-toggle"
                value={state.voiceAlertsOn}
                onValueChange={(v) => {
                  rideStore.setVoiceAlerts(v);
                  if (v) speakTest();
                }}
                accessibilityLabel="Read out eligible rides"
                trackColor={{ false: colors.border, true: colors.brandPrimary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.border}
              />
            }
          />
          <Row icon="volume-high" label="Play test announcement" testID="settings-voice-test" onPress={speakTest} />
        </Group>

        {/* Tools */}
        <Group title="Tools" testID="settings-capture-card">
          <Row
            icon="text-box-search-outline"
            label="Notification capture"
            testID="settings-open-capture"
            onPress={() => router.push("/capture")}
            right={
              <View style={styles.statusWrap}>
                {state.captureOn ? <View style={[styles.dot, { backgroundColor: colors.error }]} /> : null}
                <Text style={styles.statusText}>{state.samples.length}</Text>
              </View>
            }
          />
          <Row
            icon="flask-outline"
            label="Simulation mode"
            testID="settings-simulation-card"
            right={
              <Switch
                testID="settings-simulation-toggle"
                value={state.simulatorOn}
                onValueChange={(v) => rideStore.setSimulator(v)}
                accessibilityLabel="Simulation mode"
                trackColor={{ false: colors.border, true: colors.brandPrimary }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.border}
              />
            }
          />
        </Group>

        {/* Privacy + version */}
        <View style={styles.privacy} testID="settings-privacy-card">
          <MaterialCommunityIcons name="shield-lock-outline" size={16} color={colors.onSurfaceTertiary} />
          <Text style={styles.privacyText}>Processed on your device. Nothing is uploaded.</Text>
        </View>
        <Text style={styles.footer}>RideAssist v1.0</Text>
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

function Row({
  icon,
  label,
  right,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <View style={styles.iconTile}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.onBrandTertiary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      {right}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={styles.row}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onSurface,
  },

  account: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandPrimary,
  },
  avatarText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.onBrandPrimary,
  },
  accountText: { flex: 1 },
  accountEmail: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  logoutWrap: { minWidth: 96 },

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

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
  },
  rowPressed: { opacity: 0.7 },
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
  statusWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  chipsPad: { padding: spacing.lg },
  ruleWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rulePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rulePillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  chipWrap: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },

  privacy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  privacyText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  footer: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    textAlign: "center",
  },
}));