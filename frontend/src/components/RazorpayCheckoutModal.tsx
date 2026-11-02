// Razorpay Checkout Modal
//
// Hosts Razorpay Standard Checkout in a secure WebView and communicates
// payment results back to the React Native app.
// Includes a built-in Test Mode fallback when running in development/simulator.
import { memo, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@react-native-vector-icons/material-design-icons";

import type { OrderDetails } from "@/src/services/subscription";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

interface Props {
  visible: boolean;
  order: OrderDetails | null;
  onSuccess: (paymentData: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onError: (errorMsg: string) => void;
  onDismiss: () => void;
}

export const RazorpayCheckoutModal = memo(function RazorpayCheckoutModal({
  visible,
  order,
  onSuccess,
  onError,
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const [, setLoading] = useState(true);

  const isMockMode = useMemo(() => {
    if (!order) return false;
    return (
      order.key_id.includes("mock") ||
      order.key_id.includes("dummy") ||
      order.razorpay_order_id.startsWith("order_test_")
    );
  }, [order]);

  const htmlContent = useMemo(() => {
    if (!order) return "";
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Razorpay Checkout</title>
  <style>
    body {
      background-color: #0d0f12;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
      text-align: center;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(255, 209, 102, 0.2);
      border-top-color: #FFD166;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 20px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    h2 { font-size: 18px; margin: 0 0 8px 0; color: #ffffff; }
    p { font-size: 14px; color: #8f9ca8; margin: 0; }
  </style>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
  <div class="spinner"></div>
  <h2>Connecting to Razorpay...</h2>
  <p>Securing checkout for ${order.plan_name}</p>

  <script>
    function post(payload) {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    try {
      var options = {
        key: "${order.key_id}",
        amount: ${order.amount_paise},
        currency: "${order.currency}",
        name: "Ride Assist",
        description: "${order.plan_name}",
        order_id: "${order.razorpay_order_id}",
        prefill: {
          email: "${order.user_email}"
        },
        theme: {
          color: "#FFD166",
          backdrop_color: "#0d0f12"
        },
        modal: {
          ondismiss: function() {
            post({ event: "dismiss" });
          }
        },
        handler: function(response) {
          post({
            event: "success",
            data: {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }
          });
        }
      };

      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function(resp) {
        post({
          event: "error",
          message: (resp.error && resp.error.description) || "Payment failed or was cancelled"
        });
      });
      rzp.open();
    } catch (err) {
      post({ event: "error", message: err.message || "Could not launch Razorpay" });
    }
  </script>
</body>
</html>
    `;
  }, [order]);

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.event === "success") {
        onSuccess(data.data);
      } else if (data.event === "error") {
        onError(data.message || "Payment unsuccessful");
      } else if (data.event === "dismiss") {
        onDismiss();
      }
    } catch {
      // ignore
    }
  };

  // Test mode simulation handler
  const handleSimulatePayment = (success: boolean) => {
    if (!order) return;
    if (success) {
      // In mock test mode, send dummy verification data
      onSuccess({
        razorpay_order_id: order.razorpay_order_id,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: "mock_test_signature",
      });
    } else {
      onError("Simulated payment cancellation by driver");
    }
  };

  if (!visible || !order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onDismiss}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.onSurface }]}>Checkout</Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceTertiary }]}>
              {order.plan_name} · ₹{order.price_inr}
            </Text>
          </View>
          <Pressable onPress={onDismiss} style={styles.closeBtn} accessibilityRole="button">
            <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
          </Pressable>
        </View>

        {isMockMode ? (
          <View style={styles.mockPanel}>
            <View style={[styles.mockBadge, { borderColor: colors.warning }]}>
              <MaterialCommunityIcons name="flask-outline" size={20} color={colors.warning} />
              <Text style={[styles.mockBadgeText, { color: colors.warning }]}>TEST MODE CHECKOUT</Text>
            </View>
            <Text style={[styles.mockTitle, { color: colors.onSurface }]}>
              Simulating Razorpay Payment Gateway
            </Text>
            <Text style={[styles.mockDesc, { color: colors.onSurfaceSecondary }]}>
              No real bank charges will be made. You can simulate a successful authorization or a failure to test the entitlement access control.
            </Text>
            <View style={styles.mockDetails}>
              <Text style={styles.mockDetailText}>Plan: {order.plan_name}</Text>
              <Text style={styles.mockDetailText}>Amount: ₹{order.price_inr} ({order.amount_paise} paise)</Text>
              <Text style={styles.mockDetailText}>Order ID: {order.razorpay_order_id}</Text>
            </View>

            <View style={styles.mockActions}>
              <Pressable
                onPress={() => handleSimulatePayment(true)}
                style={[styles.btn, { backgroundColor: colors.brandPrimary }]}
              >
                <Text style={styles.btnTextPrimary}>Simulate Successful Payment</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSimulatePayment(false)}
                style={[styles.btn, { backgroundColor: colors.surfaceTertiary }]}
              >
                <Text style={[styles.btnTextSecondary, { color: colors.error }]}>Simulate Failed / Cancelled</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <WebView
            originWhitelist={["*"]}
            source={{ html: htmlContent }}
            onMessage={handleMessage}
            onLoadEnd={() => setLoading(false)}
            style={styles.webview}
            javaScriptEnabled
            domStorageEnabled
          />
        )}
      </SafeAreaView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#1e222a",
  },
  title: { fontFamily: fonts.display, fontSize: 20 },
  subtitle: { fontFamily: fonts.bodyMedium, fontSize: 13, marginTop: 2 },
  closeBtn: { padding: spacing.xs },
  webview: { flex: 1, backgroundColor: "#0d0f12" },
  mockPanel: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
  },
  mockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  mockBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 12, letterSpacing: 1 },
  mockTitle: { fontFamily: fonts.display, fontSize: 24, textAlign: "center" },
  mockDesc: { fontFamily: fonts.body, fontSize: 14, textAlign: "center", lineHeight: 20, maxWidth: 320 },
  mockDetails: {
    backgroundColor: "#161920",
    padding: spacing.md,
    borderRadius: radius.md,
    width: "100%",
    gap: spacing.xs,
    marginVertical: spacing.md,
  },
  mockDetailText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: "#8f9ca8" },
  mockActions: { width: "100%", gap: spacing.md },
  btn: {
    height: 48,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  btnTextPrimary: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: "#121418" },
  btnTextSecondary: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
});
