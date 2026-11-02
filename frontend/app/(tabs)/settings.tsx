import { useSubscription } from "@/src/services/subscriptionContext";
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
  const { hasAccess, activePlanName } = useSubscription();
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

        {/* Subscription & Passes */}
        <Group title="Subscription & Access" testID="settings-subscription-card">
          <Row
            icon="shield-check"
            label="Plan & Passes"
            testID="settings-subscription-row"
            onPress={() => router.push("/subscription")}
            right={
              <View style={styles.statusWrap}>
                <View style={[styles.dot, { backgroundColor: hasAccess ? colors.success : colors.warning }]} />
                <Text style={styles.statusText}>
                  {hasAccess ? (activePlanName ?? "Active") : "No Plan"}
                </Text>
              </View>
            }
          />
        </Group>

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