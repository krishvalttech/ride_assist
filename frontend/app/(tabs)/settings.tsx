// Settings hub: platform configs, ride filters entry, acceptance mode,
// simulation, data & privacy.
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, SectionCard, ToggleRow } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { bottomChromeInset } from "@/src/navigation";
import { nativeBridge } from "@/src/services/nativeBridge";
import { rideStore } from "@/src/services/rideStore";
import { PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { AcceptanceMode, RidePlatform } from "@/src/models/types";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const state = useRideAssistState();

  const nativeAvailable = nativeBridge.isAvailable();
  const rulesSummary = useMemo(() => {
    const s = state.settings;
    return `Min ₹${s.minFare} · Pickup ≤ ${s.maxPickupKm} km · Trip ≥ ${s.minTripKm} km · ₹${s.minFarePerKm}/km · ${String(s.startHour).padStart(2, "0")}:00–${String(s.endHour).padStart(2, "0")}:00`;
  }, [state.settings]);

  const setAcceptanceMode = (mode: AcceptanceMode) => {
    rideStore.setSettings({ ...state.settings, acceptanceMode: mode });
    if (mode === "auto-permitted") {
      toast.show("Auto-accept stays off until a permitted interaction adapter is verified on your device", "warning");
    }
  };

  return (
    <View style={styles.screen} testID="settings-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text style={styles.title}>Settings</Text>

        {/* Platforms */}
        <SectionCard
          title="Driver apps"
          subtitle={nativeAvailable ? undefined : "Install status and native permissions need a standalone Android build"}
          testID="settings-platforms-card"
        >
          {PLATFORM_ORDER.map((platform) => {
            const config = state.platformConfigs.find((p) => p.platform === platform);
            return (
              <PlatformRow
                key={platform}
                platform={platform}
                enabled={config?.detectionEnabled ?? false}
                onPress={() => router.push({ pathname: "/platform/[id]", params: { id: platform } })}
              />
            );
          })}
        </SectionCard>

        {/* Filters */}
        <SectionCard title="Ride filters" testID="settings-filters-card">
          <Text style={styles.summary}>{rulesSummary}</Text>
          <Pressable
            testID="settings-edit-filters"
            onPress={() => router.push("/filters")}
            accessibilityRole="button"
            style={styles.rowLink}
          >
            <Text style={styles.rowLinkText}>Edit filter rules</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        </SectionCard>

        {/* Acceptance */}
        <SectionCard
          title="Acceptance assistance"
          subtitle="Manual approval always works. Automatic acceptance activates only where a permitted, verified interaction exists."
          testID="settings-acceptance-card"
        >
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
          <Text style={styles.note}>
            RideAssist never shows a ride as accepted without reliable confirmation, and never uses root, ADB, uinput
            or security-bypass mechanisms.
          </Text>
        </SectionCard>

        {/* Simulation */}
        <SectionCard title="Testing" testID="settings-simulation-card">
          <ToggleRow
            label="Simulation Mode"
            description="Runs sample notifications — good, bad, duplicate and unrelated — through the real detection pipeline."
            value={state.simulatorOn}
            onValueChange={(v) => rideStore.setSimulator(v)}
            testID="settings-simulation-toggle"
          />
        </SectionCard>

        {/* Data & privacy */}
        <SectionCard title="Data & privacy" testID="settings-privacy-card">
          <Text style={styles.note}>
            • Ride notifications are processed on-device only — nothing is uploaded to a server.{"\n"}• Logs are
            redacted: no OTPs, passwords or payment data are stored.{"\n"}• No analytics, no tracking, no remote
            commands.
          </Text>
        </SectionCard>

        <Text style={styles.footer}>
          RideAssist v1.0 · Filter defaults are illustrative starting points, not earnings advice. Integration status
          depends on the driver app versions installed on your phone.
        </Text>
      </ScrollView>
    </View>
  );
}

function PlatformRow({
  platform,
  enabled,
  onPress,
}: {
  platform: RidePlatform;
  enabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={`settings-platform-${platform}`}
      onPress={onPress}
      accessibilityRole="button"
      style={styles.platformRow}
    >
      <View
        style={[styles.dot, { backgroundColor: enabled ? colors.success : colors.surfaceTertiary, borderColor: colors.borderStrong }]}
      />
      <Text style={styles.platformName}>{platformDisplayName(platform)}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
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
    lineHeight: 38,
    color: colors.onSurface,
  },
  summary: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.onSurfaceSecondary,
    lineHeight: 18,
  },
  rowLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  rowLinkText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandTertiary,
  },
  chipWrap: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onSurfaceTertiary,
  },
  footer: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    textAlign: "center",
    paddingBottom: spacing.sm,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },
  platformName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
    flex: 1,
  },
}));
