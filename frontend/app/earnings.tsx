// Earnings Insights: today / last 7 days totals and weighted ₹/km from
// rides whose acceptance was CONFIRMED. Amounts are detected fares (estimates).
import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";

import { EmptyState, KeyValueRow, MetricCard, SectionCard, ToggleRow } from "@/src/components/ui";
import { computeEarnings } from "@/src/rules/earnings";
import { formatINR, PLATFORM_ORDER, platformDisplayName } from "@/src/services/platformRegistry";
import { useRideAssistState } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const perKm = (value: number | null) => (value === null ? "—" : `${formatINR(value)}/km`);

export default function EarningsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const state = useRideAssistState();
  const [includeSimulated, setIncludeSimulated] = useState(true);

  const summary = useMemo(
    () => computeEarnings(state.rides, Date.now(), { includeSimulated }),
    [state.rides, includeSimulated],
  );
  const maxDay = Math.max(1, ...summary.days.map((d) => d.total));

  return (
    <View style={styles.screen} testID="earnings-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          paddingHorizontal: spacing.lg,
          gap: spacing.md,
        }}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Earnings Insights</Text>
          <Text
            style={styles.link}
            testID="earnings-close"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          >
            Done
          </Text>
        </View>
        <Text style={styles.note}>
          Estimated from the fares detected in ride requests you accepted and confirmed. Final payouts can differ
          (commission, tolls, surge changes, tips).
        </Text>

        <SectionCard testID="earnings-simulated-card">
          <ToggleRow
            label="Include simulated rides"
            description="Simulated rides are only for testing the app — turn off to see real earnings only."
            value={includeSimulated}
            onValueChange={setIncludeSimulated}
            testID="earnings-include-simulated-toggle"
          />
        </SectionCard>

        <View style={styles.gridRow}>
          <MetricCard label="Today" value={formatINR(summary.today.total)} tone="success" icon="cash" testID="earnings-today-total" />
          <MetricCard label="Last 7 days" value={formatINR(summary.last7Days.total)} tone="brand" icon="calendar-week" testID="earnings-week-total" />
        </View>
        <View style={styles.gridRow}>
          <MetricCard label="Avg ₹/km today" value={perKm(summary.today.avgPerKm)} tone="info" icon="map-marker-distance" testID="earnings-today-per-km" />
          <MetricCard label="Avg ₹/km (7 days)" value={perKm(summary.last7Days.avgPerKm)} tone="info" icon="chart-line" testID="earnings-week-per-km" />
        </View>

        {summary.last7Days.count === 0 ? (
          <SectionCard testID="earnings-empty">
            <EmptyState
              icon="cash-remove"
              title="No confirmed rides yet"
              message={
                includeSimulated
                  ? "Earnings appear once a ride is accepted AND confirmed. Try Simulation Mode and accept an eligible request."
                  : "No real confirmed rides in the last 7 days."
              }
            />
          </SectionCard>
        ) : (
          <>
            <SectionCard title="Last 7 days" testID="earnings-daily-card">
              <View style={styles.chart}>
                {summary.days.map((day) => (
                  <View key={day.dayStart} style={styles.barCol} testID={`earnings-day-${dayjs(day.dayStart).format("YYYY-MM-DD")}`}>
                    <Text style={styles.barValue}>{day.total > 0 ? `₹${Math.round(day.total)}` : ""}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(day.total > 0 ? 6 : 0, (day.total / maxDay) * 100)}%`,
                            backgroundColor: colors.brandPrimary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{dayjs(day.dayStart).format("dd")}</Text>
                  </View>
                ))}
              </View>
            </SectionCard>

            <SectionCard title="Summary" testID="earnings-summary-card">
              <KeyValueRow label="Rides today" value={String(summary.today.count)} testID="earnings-today-count" />
              <KeyValueRow label="Rides (7 days)" value={String(summary.last7Days.count)} testID="earnings-week-count" />
              <KeyValueRow
                label="Avg fare (7 days)"
                value={formatINR(Math.round((summary.last7Days.total / summary.last7Days.count) * 100) / 100)}
              />
              {summary.last7Days.withoutTripDistance > 0 ? (
                <Text style={styles.note}>
                  {summary.last7Days.withoutTripDistance} ride(s) had no detected trip distance and are left out of
                  ₹/km.
                </Text>
              ) : null}
              {includeSimulated && summary.simulatedIncluded > 0 ? (
                <Text style={[styles.note, { color: colors.warning }]} testID="earnings-simulated-note">
                  Includes {summary.simulatedIncluded} simulated ride(s).
                </Text>
              ) : null}
            </SectionCard>

            <SectionCard title="By platform (7 days)" testID="earnings-platform-card">
              {PLATFORM_ORDER.map((platform) => {
                const bucket = summary.byPlatform[platform];
                return (
                  <KeyValueRow
                    key={platform}
                    label={`${platformDisplayName(platform)} · ${bucket.count} ride(s)`}
                    value={`${formatINR(bucket.total)} · ${perKm(bucket.avgPerKm)}`}
                    testID={`earnings-platform-${platform}`}
                  />
                );
              })}
            </SectionCard>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.onSurface },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onBrandTertiary,
    minHeight: 44,
    textAlignVertical: "center",
    paddingHorizontal: spacing.sm,
  },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.onSurfaceTertiary },
  gridRow: { flexDirection: "row", gap: spacing.md },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, height: 160, paddingTop: spacing.sm },
  barCol: { flex: 1, alignItems: "center", gap: spacing.xs, height: "100%" },
  barValue: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.onSurfaceTertiary, height: 14 },
  barTrack: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: { width: "100%", borderRadius: radius.sm },
  barLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.onSurfaceTertiary },
}));
