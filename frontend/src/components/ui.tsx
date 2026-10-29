// Shared themed UI primitives for RideAssist.
import type { ComponentProps, ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from "react-native";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import {
  fonts,
  makeStyles,
  radius,
  spacing,
  useTheme,
  type ThemeColors,
} from "@/src/theme";
import type { RideStatus } from "@/src/models/types";

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type PillTone = "success" | "warning" | "error" | "info" | "muted" | "brand";

function toneColors(tone: PillTone, colors: ThemeColors): { bg: string; fg: string } {
  switch (tone) {
    case "success":
      return { bg: colors.success, fg: colors.onSuccess };
    case "warning":
      return { bg: colors.warning, fg: colors.onWarning };
    case "error":
      return { bg: colors.error, fg: colors.onError };
    case "info":
      return { bg: colors.info, fg: colors.onInfo };
    case "brand":
      return { bg: colors.brandPrimary, fg: colors.onBrandPrimary };
    default:
      return { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary };
  }
}

export function StatusPill({ label, tone, testID }: { label: string; tone: PillTone; testID: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toneStyle = toneColors(tone, colors);
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: toneStyle.bg }]}>
      <Text style={[styles.pillText, { color: toneStyle.fg }]}>{label}</Text>
    </View>
  );
}

const STATUS_META: Record<RideStatus, { label: string; tone: PillTone }> = {
  DETECTED: { label: "Detected", tone: "info" },
  PARSING: { label: "Parsing", tone: "info" },
  EVALUATING: { label: "Evaluating", tone: "info" },
  REJECTED: { label: "Rejected", tone: "muted" },
  AWAITING_CONFIRMATION: { label: "Awaiting approval", tone: "warning" },
  ACCEPT_REQUESTED: { label: "Accept requested", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  FAILED: { label: "Failed", tone: "error" },
  EXPIRED: { label: "Expired", tone: "muted" },
  UNKNOWN: { label: "Unknown — verify", tone: "warning" },
};

export function StatePill({ status, testID }: { status: RideStatus; testID: string }) {
  const meta = STATUS_META[status];
  return <StatusPill label={meta.label} tone={meta.tone} testID={testID} />;
}

export function MetricCard({
  label,
  value,
  tone = "brand",
  icon,
  testID,
}: {
  label: string;
  value: string | number;
  tone?: PillTone;
  icon?: IconName;
  testID: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const toneStyle = toneColors(tone, colors);
  return (
    <View testID={testID} style={styles.metricCard}>
      <View style={styles.metricTopRow}>
        {icon ? <MaterialCommunityIcons name={icon} size={14} color={toneStyle.bg} /> : null}
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: toneStyle.bg }]}>{value}</Text>
    </View>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  testID,
  style,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View testID={testID} style={[styles.sectionCard, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.toggleRow, disabled && { opacity: 0.5 }]}>
      <View style={styles.toggleTextBlock}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDescription}>{description}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.surfaceTertiary, true: colors.brandPrimary }}
        thumbColor={value ? colors.onBrandPrimary : colors.onSurfaceTertiary}
        ios_backgroundColor={colors.surfaceTertiary}
      />
    </View>
  );
}

/** Fixed-size filter chip (36pt tall — size never changes on selection). */
export function Chip({
  label,
  selected,
  onPress,
  testID,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      accessibilityRole="button"
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.brandPrimary : colors.surfaceTertiary,
          borderColor: selected ? colors.brandPrimary : colors.border,
        },
      ]}
    >
      <Text
        style={[styles.chipText, { color: selected ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Horizontal chip scroller — chrome, not content: never wraps, scrolls off-edge. */
export function ChipRow({ children, testID }: { children: ReactNode; testID?: string }) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.chipRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRowContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  actionTestID,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.emptyState} testID="empty-state">
      <View style={styles.emptyIconWrap}>
        <MaterialCommunityIcons name={icon} size={28} color={colors.onSurfaceTertiary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          testID={actionTestID}
          onPress={onAction}
          accessibilityRole="button"
          style={[styles.emptyAction, { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }]}
        >
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Data confidence meter. `null` renders explicitly as "no data". */
export function ConfidenceBar({ value, testID }: { value: number; testID: string }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const barColor = pct >= 70 ? colors.success : pct >= 45 ? colors.warning : colors.error;
  return (
    <View testID={testID} style={styles.confidenceWrap}>
      <View style={styles.confidenceTrack}>
        <View style={[styles.confidenceFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.confidenceLabel}>{pct}%</Text>
    </View>
  );
}

export function KeyValueRow({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  testID,
  tone = "primary",
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  tone?: "primary" | "danger" | "neutral" | "success";
  disabled?: boolean;
  small?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const bg =
    tone === "danger"
      ? colors.error
      : tone === "success"
        ? colors.success
        : tone === "neutral"
          ? colors.surfaceTertiary
          : colors.brandPrimary;
  const fg = tone === "neutral" ? colors.onSurface : colors.onBrandPrimary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.primaryButton,
        small && styles.primaryButtonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.primaryButtonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  pill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metricLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    flexShrink: 1,
  },
  metricValue: {
    fontFamily: fonts.display,
    fontSize: 30,
    lineHeight: 34,
  },
  sectionCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.onSurface,
  },
  sectionSubtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    marginTop: -spacing.xs,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 44,
  },
  toggleTextBlock: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  toggleDescription: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceTertiary,
    lineHeight: 17,
  },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  chipRow: {
    height: 56,
    justifyContent: "center",
  },
  chipRowContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.onSurface,
    textAlign: "center",
  },
  emptyMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyAction: {
    marginTop: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyActionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onBrandTertiary,
  },
  confidenceWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  confidenceTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  confidenceFill: {
    height: "100%",
    borderRadius: radius.pill,
  },
  confidenceLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
    minWidth: 34,
    textAlign: "right",
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 36,
  },
  kvLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.onSurfaceTertiary,
  },
  kvValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurface,
    textAlign: "right",
    flexShrink: 1,
  },
  primaryButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonSmall: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
}));
