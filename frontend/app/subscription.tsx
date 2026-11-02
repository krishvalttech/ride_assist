// Subscription Plans & Payment Hub
//
// Shows available subscription passes (Daily, Weekly, Monthly, Lifetime),
// current active entitlement, countdown timer, purchase history, and checkout.
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import { useToast } from "@/src/components/Toast";
import { RazorpayCheckoutModal } from "@/src/components/RazorpayCheckoutModal";
import {
  subscriptionService,
  type OrderDetails,
  type PurchaseHistoryItem,
  type SubscriptionPlan,
} from "@/src/services/subscription";
import { useSubscription } from "@/src/services/subscriptionContext";
import { useAuth } from "@/src/services/auth";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const {
    subscription,
    hasAccess,
    activePlanName,
    formattedExpiry,
    remainingTimeText,
    refresh,
  } = useSubscription();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [history, setHistory] = useState<PurchaseHistoryItem[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("monthly");
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState<OrderDetails | null>(null);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Load plans & history
  useEffect(() => {
    void (async () => {
      const fetchedPlans = await subscriptionService.getPlans();
      setPlans(fetchedPlans);
      if (user) {
        const hist = await subscriptionService.getHistory();
        setHistory(hist);
      }
    })();
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      if (user) {
        const hist = await subscriptionService.getHistory();
        setHistory(hist);
      }
      toast.show("Subscription status refreshed", "info");
    } catch {
      toast.show("Could not reach server to refresh subscription", "warning");
    } finally {
      setRefreshing(false);
    }
  };

  const handleStartCheckout = async (planId: string) => {
    if (!user) {
      toast.show("Please sign in first to purchase a pass", "warning");
      router.push("/login");
      return;
    }

    if (subscription?.entitlement_status === "lifetime_active") {
      toast.show("You already have Lifetime Access! No additional passes needed.", "info");
      return;
    }

    setLoadingOrder(true);
    try {
      const order = await subscriptionService.createOrder(planId);
      setActiveOrder(order);
      setCheckoutVisible(true);
    } catch (err: any) {
      const msg = err?.message || "Could not initialize checkout. Please try again.";
      toast.show(msg, "error");
    } finally {
      setLoadingOrder(false);
    }
  };

  const handlePaymentSuccess = async (paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => {
    setCheckoutVisible(false);
    toast.show("Payment successful! Activating subscription...", "info");
    try {
      const verification = await subscriptionService.verifyPayment(paymentData);
      if (verification.success) {
        toast.show("Subscription activated! Tracking access unlocked.", "success");
        await refresh();
        const hist = await subscriptionService.getHistory();
        setHistory(hist);
      } else {
        toast.show("Verification pending. Tap refresh in a few moments.", "warning");
      }
    } catch (err: any) {
      toast.show(err?.message || "Payment verification failed", "error");
    }
  };

  const handlePaymentError = (errorMsg: string) => {
    setCheckoutVisible(false);
    toast.show(errorMsg || "Payment cancelled or failed", "warning");
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.surface }]} edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: insets.bottom + spacing.xl,
          gap: spacing.lg,
        }}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.title, { color: colors.onSurface }]}>Subscription Passes</Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
              Unlock live ride detection & auto-accept
            </Text>
          </View>
          <Pressable onPress={handleRefresh} style={styles.refreshBtn} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.brandPrimary} />
            ) : (
              <MaterialCommunityIcons name="refresh" size={22} color={colors.onSurface} />
            )}
          </Pressable>
        </View>

        {/* Current Active Plan Status Banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: hasAccess ? colors.surfaceSecondary : colors.surfaceSecondary,
              borderColor: hasAccess ? colors.success : colors.warning,
            },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.statusIconWrap}>
              <MaterialCommunityIcons
                name={hasAccess ? "shield-check" : "shield-alert"}
                size={28}
                color={hasAccess ? colors.success : colors.warning}
              />
            </View>
            <View style={styles.statusTextWrap}>
              <Text style={[styles.statusLabel, { color: colors.onSurfaceTertiary }]}>
                {hasAccess ? "ACTIVE PASS" : "SUBSCRIPTION REQUIRED"}
              </Text>
              <Text style={[styles.statusTitle, { color: colors.onSurface }]}>
                {hasAccess ? activePlanName : "No Active Pass"}
              </Text>
              {hasAccess && (
                <Text style={[styles.statusExpiry, { color: colors.onSurfaceSecondary }]}>
                  {formattedExpiry} {remainingTimeText ? `(${remainingTimeText})` : ""}
                </Text>
              )}
              {!hasAccess && (
                <Text style={[styles.statusReason, { color: colors.onSurfaceSecondary }]}>
                  {subscription?.reason || "Purchase a pass below to start tracking rides."}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Plan Selection Cards */}
        <View style={styles.plansSection}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Choose a Pass</Text>
          <View style={styles.plansGrid}>
            {plans.map((p) => {
              const isSelected = selectedPlanId === p.plan_id;
              const isLifetime = p.plan_id === "lifetime";
              return (
                <Pressable
                  key={p.plan_id}
                  onPress={() => setSelectedPlanId(p.plan_id)}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: isSelected ? colors.surfaceSecondary : colors.surfaceSecondary,
                      borderColor: isSelected ? colors.brandPrimary : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.planHeader}>
                    <Text style={[styles.planName, { color: colors.onSurface }]}>{p.name}</Text>
                    {isLifetime && (
                      <View style={[styles.badge, { backgroundColor: colors.brandPrimary }]}>
                        <Text style={styles.badgeText}>BEST VALUE</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={[styles.currency, { color: colors.brandPrimary }]}>₹</Text>
                    <Text style={[styles.price, { color: colors.onSurface }]}>{p.price_inr}</Text>
                    <Text style={[styles.duration, { color: colors.onSurfaceTertiary }]}>
                      / {p.duration_type === "lifetime" ? "one-time" : p.name.split(" ")[0].toLowerCase()}
                    </Text>
                  </View>

                  <Text style={[styles.description, { color: colors.onSurfaceSecondary }]}>
                    {p.description}
                  </Text>

                  <View style={styles.featureList}>
                    {p.features.map((feat, idx) => (
                      <View key={idx} style={styles.featureItem}>
                        <MaterialCommunityIcons name="check" size={16} color={colors.success} />
                        <Text style={[styles.featureText, { color: colors.onSurfaceSecondary }]}>
                          {feat}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Checkout Action Button */}
        <View style={styles.checkoutBar}>
          <Pressable
            onPress={() => handleStartCheckout(selectedPlanId)}
            disabled={loadingOrder}
            style={[
              styles.checkoutBtn,
              { backgroundColor: colors.brandPrimary, opacity: loadingOrder ? 0.7 : 1 },
            ]}
          >
            {loadingOrder ? (
              <ActivityIndicator color="#121418" />
            ) : (
              <>
                <Text style={styles.checkoutBtnText}>
                  Continue with {plans.find((p) => p.plan_id === selectedPlanId)?.name || "Pass"}
                </Text>
                <MaterialCommunityIcons name="lock" size={18} color="#121418" />
              </>
            )}
          </Pressable>
          <Text style={[styles.secureNote, { color: colors.onSurfaceTertiary }]}>
            Secure 256-bit payment via Razorpay · Prepaid pass does not auto-renew
          </Text>
        </View>

        {/* Purchase History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Payment History</Text>
            <View style={styles.historyList}>
              {history.map((item) => (
                <View
                  key={item.payment_id}
                  style={[styles.historyItem, { borderColor: colors.border }]}
                >
                  <View>
                    <Text style={[styles.historyPlan, { color: colors.onSurface }]}>
                      {item.plan_name}
                    </Text>
                    <Text style={[styles.historyDate, { color: colors.onSurfaceTertiary }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                    </Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={[styles.historyPrice, { color: colors.onSurface }]}>
                      ₹{item.amount_inr}
                    </Text>
                    <View
                      style={[
                        styles.historyStatusPill,
                        {
                          backgroundColor:
                            item.payment_status === "captured"
                              ? colors.surface
                              : colors.surfaceTertiary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.historyStatusText,
                          {
                            color:
                              item.payment_status === "captured" ? colors.success : colors.warning,
                          },
                        ]}
                      >
                        {item.payment_status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Policy Links */}
        <View style={styles.legalSection}>
          <Text style={[styles.legalText, { color: colors.onSurfaceTertiary }]}>
            By proceeding, you agree to the Ride Assist{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://rideassist.app/terms").catch(() => {})}
            >
              Terms of Service
            </Text>
            ,{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://rideassist.app/privacy").catch(() => {})}
            >
              Privacy Policy
            </Text>
            , and{" "}
            <Text
              style={styles.legalLink}
              onPress={() => Linking.openURL("https://rideassist.app/refunds").catch(() => {})}
            >
              Refund Policy
            </Text>
            . Passes are non-transferable prepaid software licenses.
          </Text>
        </View>
      </ScrollView>

      {/* Embedded Razorpay Checkout Modal */}
      <RazorpayCheckoutModal
        visible={checkoutVisible}
        order={activeOrder}
        onSuccess={handlePaymentSuccess}
        onError={handlePaymentError}
        onDismiss={() => setCheckoutVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  backBtn: { padding: spacing.xs },
  refreshBtn: { padding: spacing.xs },
  headerTitleWrap: { flex: 1 },
  title: { fontFamily: fonts.display, fontSize: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  statusBanner: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  statusIconWrap: { width: 36, alignItems: "center" },
  statusTextWrap: { flex: 1 },
  statusLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  statusTitle: { fontFamily: fonts.display, fontSize: 18, marginTop: 2 },
  statusExpiry: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  statusReason: { fontFamily: fonts.body, fontSize: 12, marginTop: 2, lineHeight: 16 },
  plansSection: { gap: spacing.md },
  sectionTitle: { fontFamily: fonts.display, fontSize: 18 },
  plansGrid: { gap: spacing.md },
  planCard: {
    padding: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  planHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontFamily: fonts.display, fontSize: 18 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: "#121418" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  currency: { fontFamily: fonts.display, fontSize: 22 },
  price: { fontFamily: fonts.display, fontSize: 32 },
  duration: { fontFamily: fonts.body, fontSize: 13, marginLeft: 4 },
  description: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  featureList: { marginTop: spacing.xs, gap: 6 },
  featureItem: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  featureText: { fontFamily: fonts.body, fontSize: 13 },
  checkoutBar: { gap: spacing.sm, marginTop: spacing.xs },
  checkoutBtn: {
    height: 52,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  checkoutBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: "#121418" },
  secureNote: { fontFamily: fonts.body, fontSize: 12, textAlign: "center" },
  historySection: { gap: spacing.sm, marginTop: spacing.md },
  historyList: { gap: spacing.xs },
  historyItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  historyPlan: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  historyDate: { fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  historyRight: { alignItems: "flex-end", gap: 4 },
  historyPrice: { fontFamily: fonts.bodyMedium, fontSize: 14 },
  historyStatusPill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  historyStatusText: { fontFamily: fonts.bodySemiBold, fontSize: 10 },
  legalSection: { marginTop: spacing.md, paddingHorizontal: spacing.xs },
  legalText: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, textAlign: "center" },
  legalLink: { textDecorationLine: "underline" },
});
