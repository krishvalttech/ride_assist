// Live ride request card: honest data display — missing fields are shown as
// "not detected" (never as zero), confidence is explicit, and acceptance
// actions never imply confirmed acceptance.
import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import dayjs from "dayjs";

import { ConfidenceBar, PrimaryButton, StatePill } from "@/src/components/ui";
import { formatINR, platformDisplayName } from "@/src/services/platformRegistry";
import { makeStyles, fonts, radius, spacing, useTheme } from "@/src/theme";
import type { RideRequest } from "@/src/models/types";

const PLATFORM_DOT: Record<RideRequest["platform"], string> = {
  rapido: "#FFD166", // brand yellow
  uber: "#FFFFFF", // neutral white
  ola: "#7ED957", // brand green
};

const MISSING_FIELD_LABELS: Record<string, string> = {
  fare: "Fare not detected",
  pickupDistanceKm: "Pickup distance not detected",
  tripDistanceKm: "Trip distance not detected",
  category: "Category not identified",
};

interface Props {
  ride: RideRequest;
  onAccept: (ride: RideRequest) => void;
  onDismiss: (ride: RideRequest) => void;
  onVerify: (ride: RideRequest) => void;
}

export const RideRequestCard = memo(function RideRequestCard({ ride, onAccept, onDismiss, onVerify }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [expanded, setExpanded] = useState(false);

  const actionable = ride.status === "AWAITING_CONFIRMATION";
  const eligible = ride.ruleResult?.eligible === true;
  const canAccept = actionable && eligible;
  const canDismiss = actionable;
  const canVerify = ride.status === "UNKNOWN";
  const farePerKm =
    ride.fare !== undefined && ride.tripDistanceKm !== undefined && ride.tripDistanceKm > 0
      ? ride.fare / ride.tripDistanceKm
      : undefined;

  return (
    <View testID={`request-card-${ride.id}`} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.platformBlock}>
          <View style={[styles.platformDot, { backgroundColor: PLATFORM_DOT[ride.platform] }]} />
          <Text style={styles.platformName}>{platformDisplayName(ride.platform)}</Text>
          {ride.simulated ? (
            <View style={[styles.simBadge, { borderColor: colors.warning }]}>
              <Text style={[styles.simBadgeText, { color: colors.warning }]}>SIMULATED</Text>
            </View>
          ) : null}
        </View>
        <StatePill status={ride.status} testID={`request-state-${ride.id}`} />
      </View>

      <View style={styles.fareRow}>
        <Text testID={`request-fare-${ride.id}`} style={styles.fare}>
          {ride.fare !== undefined ? formatINR(ride.fare) : "Fare not detected"}
        </Text>
        <Text style={styles.time}>{dayjs(ride.detectedAt).format("HH:mm:ss")}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Pickup</Text>
          <Text testID={`request-pickup-${ride.id}`} style={styles.statValue}>
            {ride.pickupDistanceKm !== undefined ? `${ride.pickupDistanceKm.toFixed(1)} km` : "—"}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Trip</Text>
          <Text testID={`request-trip-${ride.id}`} style={styles.statValue}>
            {ride.tripDistanceKm !== undefined ? `${ride.tripDistanceKm.toFixed(1)} km` : "—"}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Fare/km</Text>
          <Text testID={`request-fare-per-km-${ride.id}`} style={styles.statValue}>
            {farePerKm !== undefined ? formatINR(Math.round(farePerKm * 100) / 100) : "—"}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Category</Text>
          <Text testID={`request-category-${ride.id}`} style={styles.statValue}>
            {ride.category ?? "—"}
          </Text>
        </View>
      </View>

      {ride.pickupLocation || ride.dropLocation ? (
        <View style={styles.locationsWrap}>
          {ride.pickupLocation ? (
            <Text style={styles.locationText} testID={`request-pickup-loc-${ride.id}`} numberOfLines={1}>
              Pickup: {ride.pickupLocation}
            </Text>
          ) : null}
          {ride.dropLocation ? (
            <Text style={styles.locationText} testID={`request-drop-loc-${ride.id}`} numberOfLines={1}>
              Drop: {ride.dropLocation}
            </Text>
          ) : null}
        </View>
      ) : null}

      <ConfidenceBar value={ride.confidence} testID={`request-confidence-${ride.id}`} />

      {ride.missingFields.length > 0 ? (
        <View style={styles.missingWrap}>
          {ride.missingFields.map((field) => (
            <Text key={field} style={styles.missingText}>
              • {MISSING_FIELD_LABELS[field] ?? field}
            </Text>
          ))}
        </View>
      ) : null}

      {ride.status === "REJECTED" && ride.ruleResult ? (
        <View style={[styles.reasonWrap, { borderColor: colors.border }]}>
          {ride.ruleResult.reasons.map((reason, i) => (
            <Text key={i} style={styles.reasonText} testID={`request-reason-${ride.id}-${i}`}>
              ✕ {reason}
            </Text>
          ))}
        </View>
      ) : null}

      {ride.status === "FAILED" && ride.acceptance?.evidence ? (
        <View style={[styles.reasonWrap, { borderColor: colors.error }]}>
          <Text style={[styles.reasonText, { color: colors.error }]} testID={`request-failed-reason-${ride.id}`}>
            Not accepted{ride.acceptance.evidence.reason ? ` — ${ride.acceptance.evidence.reason}` : ""} ({ride.acceptance.evidence.source})
          </Text>
        </View>
      ) : null}

      {ride.status === "UNKNOWN" ? (
        <View style={[styles.reasonWrap, { borderColor: colors.warning }]}>
          <Text style={[styles.reasonText, { color: colors.warning }]}>
            Acceptance outcome is unknown. Verify in the driver app before acting — do not assume success.
          </Text>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.detailsWrap} testID={`request-details-${ride.id}`}>
          {ride.ruleResult?.checks.map((check) => (
            <View key={check.id} style={styles.checkRow}>
              <Text
                style={[
                  styles.checkMark,
                  { color: check.passed === true ? colors.success : check.passed === false ? colors.error : colors.onSurfaceTertiary },
                ]}
              >
                {check.passed === true ? "✓" : check.passed === false ? "✕" : "–"}
              </Text>
              <Text style={styles.checkText}>
                {check.label}: {check.detail}
              </Text>
            </View>
          ))}
          {ride.acceptance ? (
            <Text style={styles.evidenceText}>
              Acceptance: {ride.acceptance.provider}
              {ride.acceptance.evidence
                ? ` · evidence ${ride.acceptance.evidence.status.toLowerCase()} (${ride.acceptance.evidence.source})`
                : " · no evidence yet"}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable
          testID={`request-details-toggle-${ride.id}`}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.detailsToggle}
        >
          <Text style={styles.detailsToggleText}>{expanded ? "Hide checks" : "Rule checks"}</Text>
        </Pressable>
        {canVerify ? (
          <PrimaryButton label="Verify" onPress={() => onVerify(ride)} testID={`request-verify-${ride.id}`} tone="neutral" small />
        ) : null}
        {canDismiss ? (
          <PrimaryButton label="Dismiss" onPress={() => onDismiss(ride)} testID={`request-dismiss-${ride.id}`} tone="neutral" small />
        ) : null}
        {canAccept ? (
          <PrimaryButton
            label={ride.simulated ? "Accept (simulated)" : "Accept"}
            onPress={() => onAccept(ride)}
            testID={`request-accept-${ride.id}`}
            small
          />
        ) : null}
      </View>
    </View>
  );
});

const useStyles = makeStyles((colors) => ({
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  platformBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
  },
  platformDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  platformName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.onSurface,
  },
  simBadge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  simBadgeText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  fareRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  fare: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  time: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: 2,
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.onSurfaceTertiary,
  },
  statValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.onSurface,
  },
  locationsWrap: {
    gap: 2,
  },
  locationText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
  },
  missingWrap: {
    gap: 2,
  },
  missingText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.warning,
  },
  reasonWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: 2,
  },
  reasonText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onSurfaceSecondary,
    lineHeight: 16,
  },
  detailsWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  checkRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  checkMark: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    width: 12,
  },
  checkText: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
    flex: 1,
    lineHeight: 15,
  },
  evidenceText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.onSurfaceTertiary,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  detailsToggle: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    marginRight: "auto",
  },
  detailsToggleText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.onBrandTertiary,
  },
}));
