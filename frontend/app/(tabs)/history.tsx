// Event history & diagnostics: redacted structured log, latency stats,
// duplicate suppression, export and local-data deletion.
import { useMemo, useState } from "react";
import { FlatList, Platform, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, ChipRow, EmptyState, KeyValueRow, PrimaryButton, SectionCard, type IconName } from "@/src/components/ui";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { bottomChromeInset } from "@/src/navigation";
import { rideStore } from "@/src/services/rideStore";
import { useFilteredLogs, useRideAssistState, type LogFilter } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
import type { DiagnosticLevel } from "@/src/models/types";

const LEVEL_ICON: Record<DiagnosticLevel, { icon: IconName; key: string }> = {
  debug: { icon: "bug-outline", key: "debug" },
  info: { icon: "information-outline", key: "info" },
  warn: { icon: "alert", key: "warn" },
  error: { icon: "alert-octagon", key: "error" },
};

const LOG_FILTERS: { id: LogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "detection", label: "Detection" },
  { id: "parsing", label: "Parsing" },
  { id: "rules", label: "Rules" },
  { id: "acceptance", label: "Acceptance" },
  { id: "permission", label: "Permissions" },
  { id: "system", label: "System" },
];

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const state = useRideAssistState();
  const [filter, setFilter] = useState<LogFilter>("all");
  const [confirmClear, setConfirmClear] = useState(false);

  const logs = useFilteredLogs(filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute whenever rides change
  const stats = useMemo(() => rideStore.computeDailyStats(), [state.rides]);

  const handleExport = async () => {
    const json = rideStore.buildDiagnosticExport();
    try {
      if (Platform.OS === "web") {
        // Web preview: no native share sheet — copy the redacted JSON instead.
        const clipboard = (globalThis as { navigator?: { clipboard?: { writeText: (t: string) => Promise<void> } } })
          .navigator?.clipboard;
        if (!clipboard) throw new Error("clipboard unavailable");
        await clipboard.writeText(json);
        toast.show("Redacted diagnostics copied to clipboard", "success");
      } else {
        await Share.share({ message: json, title: "RideAssist diagnostics" });
      }
      rideStore.log("info", "system", "Diagnostics exported (redacted)");
    } catch {
      toast.show("Could not export diagnostics on this device", "error");
    }
  };

  return (
    <View style={styles.screen} testID="history-screen">
      <View style={[styles.headerBlock, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>History & Diagnostics</Text>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(entry) => entry.id}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <SectionCard title="Today" testID="history-stats-card">
              <KeyValueRow label="Detected" value={String(stats.detected)} testID="history-stat-detected" />
              <KeyValueRow label="Duplicates suppressed" value={String(stats.duplicateObservationsSuppressed)} />
              <KeyValueRow
                label="Avg detection latency"
                value={stats.avgDetectionMs !== null ? `${stats.avgDetectionMs} ms` : "—"}
              />
              <KeyValueRow
                label="Avg parse latency"
                value={stats.avgParsingMs !== null ? `${stats.avgParsingMs} ms` : "—"}
              />
              <KeyValueRow
                label="Avg rule evaluation"
                value={stats.avgEvaluationMs !== null ? `${stats.avgEvaluationMs} ms` : "—"}
              />
            </SectionCard>

            <View style={styles.exportRow}>
              <PrimaryButton label="Export redacted logs" onPress={() => void handleExport()} testID="history-export-button" />
              <PrimaryButton
                label="Delete local data"
                onPress={() => setConfirmClear(true)}
                testID="history-clear-data-button"
                tone="danger"
              />
            </View>
            <Text style={styles.privacyNote}>
              Logs never contain full notification content — OTPs, passwords, phone numbers and long digit runs are
              redacted. All data stays on this device.
            </Text>

            <Text style={styles.sectionLabel}>Event log</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={{
          paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
          flexGrow: 1,
        }}
        stickyHeaderIndices={[]}
        ListEmptyComponent={
          <EmptyState
            icon="text-box-check-outline"
            title="No historical events yet"
            message="Detections, rule decisions, permission changes and acceptance attempts will appear here."
          />
        }
        renderItem={({ item }) => (
          <View testID={`history-entry-${item.id}`} style={styles.logRow}>
            <MaterialCommunityIcons
              name={LEVEL_ICON[item.level].icon}
              size={16}
              color={
                item.level === "error"
                  ? colors.error
                  : item.level === "warn"
                    ? colors.warning
                    : item.level === "info"
                      ? colors.info
                      : colors.onSurfaceTertiary
              }
            />
            <View style={styles.logBody}>
              <Text style={styles.logMessage}>{item.message}</Text>
              <Text style={styles.logMeta}>
                {dayjs(item.ts).format("HH:mm:ss")} · {item.category}
                {item.meta
                  ? " · " +
                    Object.entries(item.meta)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(" · ")
                  : ""}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[styles.chipOverlay, { bottom: bottomChromeInset(insets.bottom) + spacing.sm }]}>
        <ChipRow testID="history-filter-row">
          {LOG_FILTERS.map((f) => (
            <Chip
              key={f.id}
              label={f.label}
              selected={filter === f.id}
              onPress={() => setFilter(f.id)}
              testID={`history-filter-chip-${f.id}`}
            />
          ))}
        </ChipRow>
      </View>

      <ConfirmSheet
        visible={confirmClear}
        title="Delete all local data?"
        message="Ride history, diagnostics logs, filter settings and platform configs will be deleted from this device. This cannot be undone."
        actions={[
          {
            label: "Delete everything",
            onPress: () => {
              rideStore.clearAllData();
              setConfirmClear(false);
              toast.show("All local data deleted", "success");
            },
            testID: "history-clear-data-confirm",
            tone: "danger",
          },
        ]}
        onDismiss={() => setConfirmClear(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerBlock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  headerContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  exportRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  exportRowButton: {
    flex: 1,
  },
  privacyNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: colors.onSurfaceTertiary,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
    paddingTop: spacing.xs,
  },
  separator: {
    height: spacing.sm,
  },
  logRow: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logMessage: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.onSurface,
    lineHeight: 17,
  },
  logMeta: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.onSurfaceTertiary,
  },
  chipOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
  },
}));
