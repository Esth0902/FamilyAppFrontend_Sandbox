import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  BudgetBoardPayload,
  ChildBudget,
  computePaymentBreakdown,
  formatMoney,
  formatPeriod,
  formatSignedMoney,
  recurrenceLabel,
  resetDayLabel,
} from "@/src/budget/common";

type PaymentAction = "pay" | "carry_negative";

export default function BudgetPaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [expandedChildIds, setExpandedChildIds] = useState<Record<number, boolean>>({});

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les paiements.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimeRefetch({
    householdId,
    module: "budget",
    refresh: loadBoard,
    focusOptions: { silent: false },
    realtimeOptions: { silent: true },
  });

  const onBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(tabs)/budget");
  }, [router]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";

  const toggleChildExpansion = (childId: number) => {
    setExpandedChildIds((prev) => ({ ...prev, [childId]: !prev[childId] }));
  };

  const handlePaymentAction = async (child: ChildBudget, action: PaymentAction) => {
    const breakdown = computePaymentBreakdown(child);
    if (action === "pay" && breakdown.remainingToPay <= 0) {
      Alert.alert("Budget", "Aucun paiement restant à valider pour cet enfant.");
      return;
    }
    if (action === "carry_negative" && breakdown.remainingRaw >= 0) {
      Alert.alert("Budget", "Aucun montant négatif à reporter pour cet enfant.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: child.child.id,
        action,
      };
      if (action === "pay") {
        payload.amount = Number(breakdown.remainingToPay.toFixed(2));
        payload.comment = "Paiement validé depuis l'onglet Budget.";
      }

      const response = await apiFetch("/budget/payments", {
        method: "POST",
        body: JSON.stringify(payload),
      }) as { message?: string };

      await loadBoard();
      if (response?.message) {
        Alert.alert("Budget", response.message);
      }
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'enregistrer cette action.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!isParent) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 16 }]}>
        <Text style={{ color: theme.text }}>Accès réservé aux parents.</Text>
      </View>
    );
  }

  return (
    <ScrollView stickyHeaderIndices={[0]} style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.headerRow, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={onBackPress} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Paiements</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Déroule un enfant pour voir le résumé détaillé
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {(board?.children ?? []).map((child) => {
          const breakdown = computePaymentBreakdown(child);
          const isOpen = expandedChildIds[child.child.id] === true;
          const hasNegativeToCarry = breakdown.remainingRaw < 0;

          let buttonText = "Aucun paiement à valider";
          let buttonStyle: { backgroundColor: string } = { backgroundColor: `${theme.icon}66` };
          let buttonAction: PaymentAction | null = null;

          if (breakdown.remainingToPay > 0) {
            buttonText = `Paiement effectué (${formatMoney(breakdown.remainingToPay, currency)})`;
            buttonStyle = { backgroundColor: theme.tint };
            buttonAction = "pay";
          } else if (hasNegativeToCarry) {
            buttonText = `Reporter le montant négatif (${formatMoney(Math.abs(breakdown.remainingRaw), currency)}) au prochain budget`;
            buttonStyle = { backgroundColor: "#2E8B57" };
            buttonAction = "carry_negative";
          }

          return (
            <View key={`payment-${child.child.id}`} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
              <TouchableOpacity onPress={() => toggleChildExpansion(child.child.id)} style={styles.childHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.innerTitle, { color: theme.text }]}>{child.child.name}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>
                    Total à payer : {formatMoney(breakdown.remainingToPay, currency)}
                  </Text>
                </View>
                <MaterialCommunityIcons name={isOpen ? "chevron-up" : "chevron-down"} size={22} color={theme.textSecondary} />
              </TouchableOpacity>

              {isOpen ? (
                <View style={styles.detailsWrap}>
                  {child.setting ? (
                    <Text style={[styles.text, { color: theme.textSecondary }]}>
                      {recurrenceLabel(child.setting.recurrence)} • Réinitialisation {resetDayLabel(child.setting.recurrence, child.setting.reset_day)}
                    </Text>
                  ) : (
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Paramètres budget non configurés.</Text>
                  )}
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Période {formatPeriod(child.period.start, child.period.end)}</Text>

                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Montant de base</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.baseAmount, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Bonus</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatSignedMoney(breakdown.bonusTotal, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Pénalités</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatSignedMoney(breakdown.penaltyTotal, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Avances à déduire</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>-{formatMoney(breakdown.approvedAdvanceToDeduct, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Avances en cours</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.pendingAdvance, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Déjà payé</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.alreadyPaid, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total prévu</Text>
                      <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.totalExpected, currency)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total à payer</Text>
                      <Text style={[styles.summaryValueStrong, { color: theme.text }]}>{formatMoney(breakdown.remainingToPay, currency)}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      if (!buttonAction) return;
                      void handlePaymentAction(child, buttonAction);
                    }}
                    style={[styles.primaryBtn, buttonStyle]}
                    disabled={saving || buttonAction === null}
                  >
                    <Text style={styles.primaryBtnText}>{buttonText}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  childHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailsWrap: { gap: 6 },
  innerTitle: { fontSize: 15, fontWeight: "700" },
  text: { fontSize: 13, lineHeight: 18 },
  summaryGrid: { gap: 4, marginTop: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { fontSize: 13, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
  summaryValueStrong: { fontSize: 14, fontWeight: "700" },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 8,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
});
