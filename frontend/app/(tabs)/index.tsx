// Dashboard: service status, permission states, daily metrics, platform
// status list, last detected request, Start/Stop Monitoring.
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { MetricCard, PrimaryButton, SectionCard, StatusPill, ToggleRow } from "@/src/components/ui";
import { bottomChromeInset } from "@/src/navigation";
import { nativeBridge } from "@/src/services/nativeBridge";
import { rideStore } from "@/src/services/rideStore";
import { PLATFORM_ORDER, formatINR, platformDisplayName } from "@/src/services/platformRegistry";
import { computeEarnings } from "@/src/rules/earnings";
import { useMonitoringControls, useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { RidePlatform } from "@/src/models/types";

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useRideAssistState();
  const { toggleMonitoring, openNotificationAccessSettings, refreshPermissions } = useMonitoringControls();
  const [refreshing, setRefreshing] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute whenever rides change
  const stats = useMemo(() => rideStore.computeDailyStats(), [state.rides]);
  const earnings = useMemo(() => computeEarnings(state.rides, Date.now(), { includeSimulated: true }), [state.rides]);
  const nativeAvailable = nativeBridge.isAvailable();
  const notifState = state.nativePermission?.notificationListener ?? "unavailable";
  const permissionRequired = nativeAvailable && notifState !== "granted";

  const status = !nativeAvailable
    ? { label: "SIM PREVIEW", tone: "info" as const }
    : permissionRequired
      ? { label: "PERMISSION REQUIRED", tone: "error" as const }
      : state.monitoring
        ? { label: "RUNNING", tone: "success" as const }
        : { label: "PAUSED", tone: "warning" as const };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPermissions();
    rideStore.sweepExpiry();
    setRefreshing(false);
  }, [refreshPermissions]);

  const platformRows = PLATFORM_ORDER.map((platform) => {
    const config = state.platformConfigs.find((p) => p.platform === platform);
    const rightLabel = !config?.detectionEnabled
      ? "Detection off"
      : !state.settings.platformEnabled[platform]
        ? "Disabled in filters"
        : !nativeAvailable
          ? "Simulated preview"
          : notifState === "granted" && state.monitoring
            ? "Listening"
            : "Permission required";
    return { platform, rightLabel };
  });

  return (
    <View style={styles.screen} testID="dashboard-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.onSurfaceTertiary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextBlock}>
            <Text style={styles.title}>RideAssist</Text>
            <Text style={styles.subtitle}>Ride request monitor & filter assistant</Text>
          </View>
          <StatusPill label={status.label} tone={status.tone} testID="dashboard-status-pill" />
        </View>

        {/* Master control */}
        <SectionCard testID="dashboard-monitor-card" style={styles.card}>
          <Text style={styles.cardTitle}>Monitoring</Text>
          <Text style={styles.mutedText}>
            {!nativeAvailable
              ? "Native notification listening needs a standalone Android build (not Expo Go). Enable Simulation Mode below to test the full pipeline now."
              : permissionRequired
                ? "Grant notification access so RideAssist can see ride requests from your driver apps."
                : state.monitoring
                  ? "Listening for ride request notifications."
                  : "Monitoring is paused — no requests are being detected."}
          </Text>
          <Pressable
            testID="dashboard-monitor-toggle"
            onPress={() => void toggleMonitoring()}
            accessibilityRole="button"
            accessibilityState={{ selected: state.monitoring }}
            style={({ pressed }) => [
              styles.monitorButton,
              {
                backgroundColor: state.monitoring ? colors.error : colors.brandPrimary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.monitorButtonText}>
              {state.monitoring ? "Stop Monitoring" : "Start Monitoring"}
            </Text>
          </Pressable>
        </SectionCard>

        {/* Simulation */}
        <SectionCard testID="dashboard-simulation-card" style={styles.card}>
          <ToggleRow
            label="Simulation Mode"
            description="Feeds realistic sample ride requests — including duplicates, stale and low-confidence ones — through the real pipeline."
            value={state.simulatorOn}
            onValueChange={(v) => rideStore.setSimulator(v)}
            testID="dashboard-simulation-toggle"
          />
        </SectionCard>

        {/* Metrics */}
        <View style={styles.gridRow}>
          <MetricCard label="Detected today" value={stats.detected} tone="brand" icon="radio-tower" testID="metric-detected-today" />
          <MetricCard label="Matching rules" value={stats.matching} tone="success" icon="check-decagram" testID="metric-matching" />
        </View>
        <View style={styles.gridRow}>
          <MetricCard label="Accepted & confirmed" value={stats.acceptedConfirmed} tone="success" icon="shield-check" testID="metric-accepted" />
          <MetricCard label="Rejected by rules" value={stats.rejected} tone="error" icon="filter-remove" testID="metric-rejected" />
        </View>
        <View style={styles.gridRow}>
          <MetricCard label="Failed / unconfirmed" value={stats.failedOrUnconfirmed} tone="warning" icon="alert" testID="metric-failed" />
          <MetricCard label="Duplicates suppressed" value={stats.duplicateObservationsSuppressed} tone="muted" icon="content-duplicate" testID="metric-duplicates" />
        </View>

        {/* Earnings */}
        <Pressable
          testID="dashboard-earnings-card"
          onPress={() => router.push("/earnings")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.earningsCard, { opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={styles.earningsTextBlock}>
            <Text style={styles.cardTitle}>Earnings today</Text>
            <Text style={styles.earningsValue} testID="dashboard-earnings-today">
              {formatINR(earnings.today.total)}
            </Text>
            <Text style={styles.mutedText}>
              {earnings.today.count} confirmed ride(s) · 7 days {formatINR(earnings.last7Days.total)}
              {earnings.last7Days.avgPerKm !== null ? ` · ${formatINR(earnings.last7Days.avgPerKm)}/km` : ""}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.onSurfaceTertiary} />
        </Pressable>

        {/* Last detected */}
        <SectionCard title="Last detected request" testID="card-last-detected" style={styles.card}>
          {stats.lastDetectedAt ? (
            <>
              <Text style={styles.lastPreview}>{stats.lastDetectedPreview}</Text>
              <Text style={styles.mutedText}>{dayjs(stats.lastDetectedAt).format("DD MMM, HH:mm:ss")}</Text>
            </>
          ) : (
            <Text style={styles.mutedText} testID="last-detected-empty">
              No requests detected yet.
            </Text>
          )}
        </SectionCard>

        {/* Platforms */}
        <SectionCard
          title="Driver apps"
          subtitle="Tap a platform to configure detection and acceptance assistance"
          testID="dashboard-platforms-card"
          style={styles.card}
        >
          {platformRows.map(({ platform, rightLabel }) => (
            <PlatformRow
              key={platform}
              platform={platform}
              rightLabel={rightLabel}
              onPress={() => router.push({ pathname: "/platform/[id]", params: { id: platform } })}
            />
          ))}
        </SectionCard>

        {/* Permissions */}
        <SectionCard title="Permissions" testID="dashboard-permissions-card" style={styles.card}>
          <View style={styles.permRow}>
            <MaterialCommunityIcons
              name="bell-check"
              size={16}
              color={notifState === "granted" ? colors.success : colors.warning}
            />
            <Text style={styles.permLabel}>Notification access</Text>
            <Text style={styles.permValue}>
              {!nativeAvailable ? "Unavailable (Expo Go)" : notifState === "granted" ? "Granted" : "Not granted"}
            </Text>
          </View>
          <View style={styles.permRow}>
            <MaterialCommunityIcons
              name="human"
              size={16}
              color={state.nativePermission?.accessibility === "granted" ? colors.success : colors.onSurfaceTertiary}
            />
            <Text style={styles.permLabel}>Accessibility (optional)</Text>
            <Text style={styles.permValue}>
              {!nativeAvailable
                ? "Unavailable (Expo Go)"
                : state.nativePermission?.accessibility === "granted"
                  ? "Granted"
                  : "Not granted"}
            </Text>
          </View>
          {nativeAvailable && notifState !== "granted" ? (
            <PrimaryButton
              label="Open notification access settings"
              onPress={() => void openNotificationAccessSettings()}
              testID="dashboard-open-notification-settings"
              tone="neutral"
            />
          ) : null}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

function PlatformRow({
  platform,
  rightLabel,
  onPress,
}: {
  platform: RidePlatform;
  rightLabel: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={`platform-row-${platform}`}
      onPress={onPress}
      accessibilityRole="button"
      style={styles.platformRow}
    >
      <Text style={styles.platformRowName}>{platformDisplayName(platform)}</Text>
      <Text style={styles.platformRowValue}>{rightLabel}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerTextBlock: {
    flexShrink: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 42,
    color: colors.onSurface,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
  },
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  earningsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
  },
  earningsTextBlock: {
    flex: 1,
    gap: 2,
  },
  earningsValue: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  cardTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.onSurfaceTertiary,
  },
  monitorButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  monitorButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onBrandPrimary,
  },
  gridRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  lastPreview: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 44,
  },
  platformRowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
    flex: 1,
  },
  platformRowValue: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 32,
  },
  permLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurface,
    flex: 1,
  },
  permValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
}));
