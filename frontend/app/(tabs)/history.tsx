// // Event history & diagnostics: redacted structured log, latency stats,
// // duplicate suppression, export and local-data deletion.
// import { useMemo, useState } from "react";
// import { FlatList, StyleSheet, Text, View } from "react-native";
// import { exportText } from "@/src/utils/exportText";
// import { useSafeAreaInsets } from "react-native-safe-area-context";
// import dayjs from "dayjs";
// import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

// import { Chip, ChipRow, EmptyState, KeyValueRow, PrimaryButton, SectionCard, type IconName } from "@/src/components/ui";
// import { ConfirmSheet } from "@/src/components/ConfirmSheet";
// import { useToast } from "@/src/components/Toast";
// import { bottomChromeInset } from "@/src/navigation";
// import { rideStore } from "@/src/services/rideStore";
// import { useFilteredLogs, useRideAssistState, type LogFilter } from "@/src/hooks/useRideEngine";
// import { fonts, makeStyles, spacing, useTheme } from "@/src/theme";
// import type { DiagnosticLevel } from "@/src/models/types";

// const LEVEL_ICON: Record<DiagnosticLevel, { icon: IconName; key: string }> = {
//   debug: { icon: "bug-outline", key: "debug" },
//   info: { icon: "information-outline", key: "info" },
//   warn: { icon: "alert", key: "warn" },
//   error: { icon: "alert-octagon", key: "error" },
// };

// const LOG_FILTERS: { id: LogFilter; label: string }[] = [
//   { id: "all", label: "All" },
//   { id: "detection", label: "Detection" },
//   { id: "parsing", label: "Parsing" },
//   { id: "rules", label: "Rules" },
//   { id: "acceptance", label: "Acceptance" },
//   { id: "permission", label: "Permissions" },
//   { id: "system", label: "System" },
// ];

// export default function HistoryScreen() {
//   const { colors } = useTheme();
//   const styles = useStyles();
//   const insets = useSafeAreaInsets();
//   const toast = useToast();
//   const state = useRideAssistState();
//   const [filter, setFilter] = useState<LogFilter>("all");
//   const [confirmClear, setConfirmClear] = useState(false);

//   const logs = useFilteredLogs(filter);
//   // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute whenever rides change
//   const stats = useMemo(() => rideStore.computeDailyStats(), [state.rides]);

//   const handleExport = async () => {
//     try {
//       const result = await exportText(rideStore.buildDiagnosticExport(), "RideAssist diagnostics");
//       if (result === "copied") toast.show("Redacted diagnostics copied to clipboard", "success");
//       rideStore.log("info", "system", "Diagnostics exported (redacted)");
//     } catch {
//       toast.show("Could not export diagnostics on this device", "error");
//     }
//   };

//   return (
//     <View style={styles.screen} testID="history-screen">
//       <View style={[styles.headerBlock, { paddingTop: insets.top + spacing.md }]}>
//         <Text style={styles.title}>History & Diagnostics</Text>
//       </View>

//       <FlatList
//         data={logs}
//         keyExtractor={(entry) => entry.id}
//         ListHeaderComponent={
//           <View style={styles.headerContent}>
//             <SectionCard title="Today" testID="history-stats-card">
//               <KeyValueRow label="Detected" value={String(stats.detected)} testID="history-stat-detected" />
//               <KeyValueRow label="Duplicates suppressed" value={String(stats.duplicateObservationsSuppressed)} />
//               <KeyValueRow
//                 label="Avg detection latency"
//                 value={stats.avgDetectionMs !== null ? `${stats.avgDetectionMs} ms` : "—"}
//               />
//               <KeyValueRow
//                 label="Avg parse latency"
//                 value={stats.avgParsingMs !== null ? `${stats.avgParsingMs} ms` : "—"}
//               />
//               <KeyValueRow
//                 label="Avg rule evaluation"
//                 value={stats.avgEvaluationMs !== null ? `${stats.avgEvaluationMs} ms` : "—"}
//               />
//             </SectionCard>

//             <View style={styles.exportRow}>
//               <PrimaryButton label="Export redacted logs" onPress={() => void handleExport()} testID="history-export-button" />
//               <PrimaryButton
//                 label="Delete local data"
//                 onPress={() => setConfirmClear(true)}
//                 testID="history-clear-data-button"
//                 tone="danger"
//               />
//             </View>
//             <Text style={styles.privacyNote}>
//               Logs never contain full notification content — OTPs, passwords, phone numbers and long digit runs are
//               redacted. All data stays on this device.
//             </Text>

//             <Text style={styles.sectionLabel}>Event log</Text>
//           </View>
//         }
//         ItemSeparatorComponent={() => <View style={styles.separator} />}
//         contentContainerStyle={{
//           paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
//           flexGrow: 1,
//         }}
//         stickyHeaderIndices={[]}
//         ListEmptyComponent={
//           <EmptyState
//             icon="text-box-check-outline"
//             title="No historical events yet"
//             message="Detections, rule decisions, permission changes and acceptance attempts will appear here."
//           />
//         }
//         renderItem={({ item }) => (
//           <View testID={`history-entry-${item.id}`} style={styles.logRow}>
//             <MaterialCommunityIcons
//               name={LEVEL_ICON[item.level].icon}
//               size={16}
//               color={
//                 item.level === "error"
//                   ? colors.error
//                   : item.level === "warn"
//                     ? colors.warning
//                     : item.level === "info"
//                       ? colors.info
//                       : colors.onSurfaceTertiary
//               }
//             />
//             <View style={styles.logBody}>
//               <Text style={styles.logMessage}>{item.message}</Text>
//               <Text style={styles.logMeta}>
//                 {dayjs(item.ts).format("HH:mm:ss")} · {item.category}
//                 {item.meta
//                   ? " · " +
//                     Object.entries(item.meta)
//                       .map(([k, v]) => `${k}=${String(v)}`)
//                       .join(" · ")
//                   : ""}
//               </Text>
//             </View>
//           </View>
//         )}
//       />

//       <View style={[styles.chipOverlay, { bottom: bottomChromeInset(insets.bottom) + spacing.sm }]}>
//         <ChipRow testID="history-filter-row">
//           {LOG_FILTERS.map((f) => (
//             <Chip
//               key={f.id}
//               label={f.label}
//               selected={filter === f.id}
//               onPress={() => setFilter(f.id)}
//               testID={`history-filter-chip-${f.id}`}
//             />
//           ))}
//         </ChipRow>
//       </View>

//       <ConfirmSheet
//         visible={confirmClear}
//         title="Delete all local data?"
//         message="Ride history, diagnostics logs, filter settings and platform configs will be deleted from this device. This cannot be undone."
//         actions={[
//           {
//             label: "Delete everything",
//             onPress: () => {
//               rideStore.clearAllData();
//               setConfirmClear(false);
//               toast.show("All local data deleted", "success");
//             },
//             testID: "history-clear-data-confirm",
//             tone: "danger",
//           },
//         ]}
//         onDismiss={() => setConfirmClear(false)}
//       />
//     </View>
//   );
// }

// const useStyles = makeStyles((colors) => ({
//   screen: {
//     flex: 1,
//     backgroundColor: colors.surface,
//   },
//   headerBlock: {
//     paddingHorizontal: spacing.lg,
//     paddingTop: spacing.md,
//   },
//   title: {
//     fontFamily: fonts.display,
//     fontSize: 34,
//     lineHeight: 38,
//     color: colors.onSurface,
//   },
//   headerContent: {
//     paddingHorizontal: spacing.lg,
//     gap: spacing.md,
//     paddingTop: spacing.md,
//   },
//   exportRow: {
//     flexDirection: "row",
//     gap: spacing.md,
//   },
//   exportRowButton: {
//     flex: 1,
//   },
//   privacyNote: {
//     fontFamily: fonts.body,
//     fontSize: 11,
//     lineHeight: 15,
//     color: colors.onSurfaceTertiary,
//   },
//   sectionLabel: {
//     fontFamily: fonts.bodySemiBold,
//     fontSize: 15,
//     color: colors.onSurface,
//     paddingTop: spacing.xs,
//   },
//   separator: {
//     height: spacing.sm,
//   },
//   logRow: {
//     flexDirection: "row",
//     gap: spacing.sm,
//     backgroundColor: colors.surfaceSecondary,
//     borderRadius: 8,
//     borderWidth: StyleSheet.hairlineWidth,
//     borderColor: colors.border,
//     padding: spacing.md,
//     marginHorizontal: spacing.lg,
//   },
//   logBody: {
//     flex: 1,
//     gap: 2,
//   },
//   logMessage: {
//     fontFamily: fonts.bodyMedium,
//     fontSize: 12.5,
//     color: colors.onSurface,
//     lineHeight: 17,
//   },
//   logMeta: {
//     fontFamily: fonts.body,
//     fontSize: 10.5,
//     color: colors.onSurfaceTertiary,
//   },
//   chipOverlay: {
//     position: "absolute",
//     left: 0,
//     right: 0,
//   },
// }));
//  NEW UI
// Event history & diagnostics: redacted structured log, latency stats,
// duplicate suppression, export and local-data deletion.
import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { exportText } from "@/src/utils/exportText";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { Chip, ChipRow, EmptyState, type IconName } from "@/src/components/ui";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { bottomChromeInset } from "@/src/navigation";
import { rideStore } from "@/src/services/rideStore";
import { useFilteredLogs, useRideAssistState, type LogFilter } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import type { DiagnosticLevel } from "@/src/models/types";

const LEVEL_ICON: Record<DiagnosticLevel, IconName> = {
  debug: "bug-outline",
  info: "information-outline",
  warn: "alert",
  error: "alert-octagon",
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

const ms = (v: number | null) => (v !== null ? `${v} ms` : "—");

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

  const levelColor = (level: DiagnosticLevel) =>
    level === "error"
      ? colors.error
      : level === "warn"
        ? colors.warning
        : level === "info"
          ? colors.info
          : colors.onSurfaceTertiary;

  const handleExport = async () => {
    try {
      const result = await exportText(rideStore.buildDiagnosticExport(), "RideAssist diagnostics");
      if (result === "copied") toast.show("Redacted diagnostics copied to clipboard", "success");
      rideStore.log("info", "system", "Diagnostics exported (redacted)");
    } catch {
      toast.show("Could not export diagnostics on this device", "error");
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="history-screen">
      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={styles.title}>History</Text>
        <View style={styles.headerActions}>
          <Pressable
            testID="history-export-button"
            onPress={() => void handleExport()}
            accessibilityRole="button"
            accessibilityLabel="Export redacted logs"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="export-variant" size={20} color={colors.onSurface} />
          </Pressable>
          <Pressable
            testID="history-clear-data-button"
            onPress={() => setConfirmClear(true)}
            accessibilityRole="button"
            accessibilityLabel="Delete local data"
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filters}>
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

      {/* Stats (fixed) */}
      <View testID="history-stats-card" style={styles.statsWrap}>
        <View style={styles.statRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue} testID="history-stat-detected">{stats.detected}</Text>
            <Text style={styles.statLabel}>Detected</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{stats.duplicateObservationsSuppressed}</Text>
            <Text style={styles.statLabel}>Duplicates</Text>
          </View>
        </View>
        <View style={styles.latencyCard}>
          <View style={styles.latencyCell}>
            <Text style={styles.latencyValue}>{ms(stats.avgDetectionMs)}</Text>
            <Text style={styles.statLabel}>Detect</Text>
          </View>
          <View style={styles.latencyDivider} />
          <View style={styles.latencyCell}>
            <Text style={styles.latencyValue}>{ms(stats.avgParsingMs)}</Text>
            <Text style={styles.statLabel}>Parse</Text>
          </View>
          <View style={styles.latencyDivider} />
          <View style={styles.latencyCell}>
            <Text style={styles.latencyValue}>{ms(stats.avgEvaluationMs)}</Text>
            <Text style={styles.statLabel}>Rules</Text>
          </View>
        </View>
      </View>

      {/* Event log: its own scrolling panel */}
      <View
        testID="history-log-panel"
        style={[styles.logPanel, { marginBottom: bottomChromeInset(insets.bottom) + spacing.md }]}
      >
        <View style={styles.logHeader}>
          <Text style={styles.sectionLabel}>Events</Text>
          <Text style={styles.count}>{logs.length}</Text>
        </View>
        <FlatList
          testID="history-log-list"
          style={styles.logList}
          data={logs}
          keyExtractor={(entry) => entry.id}
          showsVerticalScrollIndicator
          nestedScrollEnabled
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.logListContent}
          ListEmptyComponent={
            <EmptyState icon="text-box-check-outline" title="No events yet" message="They'll show up here." />
          }
          renderItem={({ item }) => (
            <View testID={`history-entry-${item.id}`} style={styles.logRow}>
              <View style={styles.levelTile}>
                <MaterialCommunityIcons name={LEVEL_ICON[item.level]} size={16} color={levelColor(item.level)} />
              </View>
              <View style={styles.logBody}>
                <Text style={styles.logMessage}>{item.message}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.logTime}>{dayjs(item.ts).format("HH:mm:ss")}</Text>
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                </View>
                {item.meta ? (
                  <Text style={styles.logMeta}>
                    {Object.entries(item.meta)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(" · ")}
                  </Text>
                ) : null}
              </View>
            </View>
          )}
        />
      </View>

      <ConfirmSheet
        visible={confirmClear}
        title="Delete all local data?"
        message="History, logs, filters and app settings will be removed from this device. This can't be undone."
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
    </SafeAreaView>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  headerBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: colors.onSurface,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  pressed: { opacity: 0.7 },
  filters: {
    paddingBottom: spacing.sm,
  },

  statsWrap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  statRow: { flexDirection: "row", gap: spacing.md },
  statTile: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    backgroundColor: colors.brandTertiary,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: colors.onSurface,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  latencyCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
  },
  latencyCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  latencyValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },
  latencyDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },

  logPanel: {
    flex: 1,
    marginHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  logList: { flex: 1 },
  logListContent: {
    flexGrow: 1,
    padding: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },
  count: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
  },
  separator: {
    height: spacing.sm,
  },
  logRow: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
  },
  levelTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  logBody: {
    flex: 1,
    gap: 4,
  },
  logMessage: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logTime: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  categoryPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10.5,
    color: colors.onSurfaceTertiary,
  },
  logMeta: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.onSurfaceTertiary,
  },
}));