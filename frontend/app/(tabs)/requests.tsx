// Live Requests: incoming ride requests with confidence, rule results and
// manual actions. Filter chips are chrome (fixed 56pt row, never wrapping).
import { useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, ChipRow, EmptyState } from "@/src/components/ui";
import { RideRequestCard } from "@/src/components/RideRequestCard";
import { ConfirmSheet } from "@/src/components/ConfirmSheet";
import { useToast } from "@/src/components/Toast";
import { bottomChromeInset } from "@/src/navigation";
import { acceptanceManager } from "@/src/services/acceptance";
import { rideStore } from "@/src/services/rideStore";
import { useFilteredRides, useRideAssistState, type RideFilter } from "@/src/hooks/useRideEngine";
import { fonts, makeStyles, spacing } from "@/src/theme";
import type { RideRequest } from "@/src/models/types";

const FILTERS: { id: RideFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "eligible", label: "Eligible" },
  { id: "rejected", label: "Rejected" },
  { id: "accepted", label: "Accepted" },
];

export default function RequestsScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const state = useRideAssistState();
  const [filter, setFilter] = useState<RideFilter>("all");
  const [verifying, setVerifying] = useState<RideRequest | null>(null);

  const rides = useFilteredRides(filter);
  const data = useMemo(() => [...rides].reverse(), [rides]);

  const handleAccept = async (ride: RideRequest) => {
    if (ride.simulated) {
      toast.show("Requesting acceptance (simulated)…", "info");
      const result = await acceptanceManager.initiateAcceptance(ride.id);
      toast.show(result.message, result.ok ? "success" : "warning");
      return;
    }
    // Real requests in manual mode: guide the user through the driver app and
    // collect explicit confirmation — never mark accepted on a tap alone.
    setVerifying(ride);
  };

  const handleDismiss = (ride: RideRequest) => {
    const done = rideStore.dismissRide(ride.id);
    toast.show(done ? "Request dismissed" : "Request can no longer be dismissed", done ? "info" : "warning");
  };

  const handleManualConfirm = (accepted: boolean) => {
    if (!verifying) return;
    const result = acceptanceManager.confirmManualEvidence(verifying.id, accepted);
    toast.show(result.message, accepted ? "success" : "warning");
    setVerifying(null);
  };

  return (
    <View style={styles.screen} testID="requests-screen">
      <View style={[styles.headerBlock, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.title}>Live Requests</Text>
        {state.simulatorOn ? <Text style={styles.simNote}>Simulation Mode is feeding sample requests</Text> : null}
      </View>

      <ChipRow testID="requests-filter-row">
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={f.label}
            selected={filter === f.id}
            onPress={() => setFilter(f.id)}
            testID={`requests-filter-chip-${f.id}`}
          />
        ))}
      </ChipRow>

      <FlatList
        data={data}
        keyExtractor={(ride) => ride.id}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: bottomChromeInset(insets.bottom) + spacing.xl,
          gap: spacing.md,
          flexGrow: 1,
        }}
        ListEmptyComponent={
          <EmptyState
            icon="radar"
            title="No ride requests here yet"
            message={
              state.simulatorOn
                ? "Waiting for the next simulated notification…"
                : "Enable Simulation Mode on the Dashboard to feed sample ride requests through the pipeline, or run a standalone Android build with the native listener."
            }
            actionLabel={state.simulatorOn ? undefined : "Enable Simulation Mode"}
            onAction={() => rideStore.setSimulator(true)}
            actionTestID="requests-enable-simulation"
          />
        }
        renderItem={({ item }) => (
          <RideRequestCard
            ride={item}
            onAccept={(ride) => void handleAccept(ride)}
            onDismiss={handleDismiss}
            onVerify={setVerifying}
          />
        )}
      />

      <ConfirmSheet
        visible={verifying !== null}
        title="Manual acceptance"
        message={
          verifying
            ? `Open ${verifying.platform.charAt(0).toUpperCase() + verifying.platform.slice(1)} in your driver app and accept the request there. Come back and confirm what happened — RideAssist never assumes a tap or a disappearing notification means accepted.`
            : undefined
        }
        actions={[
          {
            label: "I accepted it in the app",
            onPress: () => handleManualConfirm(true),
            testID: "manual-confirm-accepted",
            tone: "success",
          },
          {
            label: "It was not accepted",
            onPress: () => handleManualConfirm(false),
            testID: "manual-confirm-not-accepted",
            tone: "danger",
          },
        ]}
        onDismiss={() => setVerifying(null)}
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
    gap: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.onSurface,
  },
  simNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.warning,
  },
}));
