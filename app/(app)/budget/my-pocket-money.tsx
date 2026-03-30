import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
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
    router.replace("/(app)/(tabs)/budget");
  }, [router]);

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
    <ScrollView stickyHeaderIndices={[0]} style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 16, zIndex: 20, elevation: 20 }}>
        <ScreenHeader
          title="Mon argent de poche"
          subtitle="Résumé de ma période en cours"
          withBackButton
          onBackPress={onBackPress}
          showBorder
          safeTop
          bottomSpacing={2}
          containerStyle={{ paddingHorizontal: 0 }}
          contentStyle={{ minHeight: 0 }}
        />
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
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  text: { fontSize: 13, lineHeight: 18 },
  summaryGrid: { gap: 4, marginTop: 2 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  summaryLabel: { fontSize: 13, flex: 1 },
  summaryValue: { fontSize: 13, fontWeight: "600" },
  summaryValueStrong: { fontSize: 14, fontWeight: "700" },
});
