import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  BudgetBoardPayload,
  computePaymentBreakdown,
  formatMoney,
  formatPeriod,
  formatSignedMoney,
  recurrenceLabel,
  resetDayLabel,
} from "@/src/budget/common";

export default function BudgetMyPocketMoneyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger le budget.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBoard({ silent: false }); }, [loadBoard]));

  useEffect(() => {
    if (!householdId) return;
    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "budget") return;
        void loadBoard({ silent: true });
      });
    };
    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [householdId, loadBoard]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const myBudget = board?.children[0] ?? null;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (isParent) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 16 }]}>
        <Text style={{ color: theme.text }}>Accès réservé aux enfants.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Mon argent de poche</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Résumé de ma période en cours</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        {myBudget?.setting ? (
          <>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              {recurrenceLabel(myBudget.setting.recurrence)} • Réinitialisation {resetDayLabel(myBudget.setting.recurrence, myBudget.setting.reset_day)}
            </Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>Période {formatPeriod(myBudget.period.start, myBudget.period.end)}</Text>
            {(() => {
              const breakdown = computePaymentBreakdown(myBudget);
              return (
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
                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total que je devrais recevoir</Text>
                    <Text style={[styles.summaryValueStrong, { color: theme.text }]}>{formatMoney(breakdown.remainingToPay, currency)}</Text>
                  </View>
                </View>
              );
            })()}
          </>
        ) : (
          <Text style={[styles.text, { color: theme.textSecondary }]}>Ton budget n&apos;est pas encore configuré.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  text: { fontSize: 13, lineHeight: 18 },
  summaryGrid: { gap: 4, marginTop: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { fontSize: 13, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
  summaryValueStrong: { fontSize: 14, fontWeight: "700" },
});
