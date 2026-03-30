import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  BudgetBoardPayload,
  BudgetTransaction,
  ChildBudget,
  computePaymentBreakdown,
  formatMoney,
} from "@/src/budget/common";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { queryKeys } from "@/src/query/query-keys";
import { useStoredUserState } from "@/src/session/user-cache";
import { fetchDashboardBudgetBoard } from "@/src/services/dashboardService";

type HistoryItem = {
  id: string;
  childName: string;
  typeLabel: string;
  statusLabel: string;
  amount: number;
  createdAt: string | null;
  justification: string | null;
};

const BUTTON_TEXT_COLOR = "#FFFFFF";

const toTimestamp = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatShortDate = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
};

const isAdvanceRequest = (transaction: BudgetTransaction): boolean => {
  return transaction.type === "advance" && (transaction.request_kind ?? "advance") === "advance";
};

const toTypeLabel = (transaction: BudgetTransaction): string => {
  if (transaction.type === "allocation") return "Paiement";
  if (transaction.type === "bonus") return "Bonus";
  if (transaction.type === "penalty") return "Pénalité";
  if (transaction.type === "advance" && transaction.request_kind === "reimbursement") return "Remboursement";
  return "Avance";
};

const toStatusLabel = (transaction: BudgetTransaction): string => {
  if (transaction.status === "pending") return "En attente";
  if (transaction.status === "approved") return "Acceptée";
  return "Refusée";
};

const toJustification = (transaction: BudgetTransaction): string | null => {
  const isTargetType =
    transaction.type === "bonus"
    || transaction.type === "penalty"
    || transaction.type === "advance";

  if (!isTargetType) {
    return null;
  }

  const value = String(transaction.comment ?? "").trim();
  return value === "" ? null : value;
};

const buildHistory = (children: ChildBudget[], limit: number): HistoryItem[] => {
  return children
    .flatMap((child) => child.transactions.map((transaction) => ({
      id: `${child.child.id}-${transaction.id}`,
      childName: child.child.name,
      typeLabel: toTypeLabel(transaction),
      statusLabel: toStatusLabel(transaction),
      amount: Number(transaction.signed_amount ?? transaction.amount ?? 0),
      createdAt: transaction.created_at,
      justification: toJustification(transaction),
    })))
    .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt))
    .slice(0, limit);
};

const countAdvanceStatuses = (transactions: BudgetTransaction[]) => {
  return transactions.reduce(
    (acc, transaction) => {
      if (transaction.status === "pending") acc.pending += 1;
      else if (transaction.status === "approved") acc.approved += 1;
      else if (transaction.status === "rejected") acc.rejected += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );
};

export default function DashboardBudgetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();
  const budgetBoardQuery = useQuery({
    queryKey: queryKeys.dashboard.budgetBoard(householdId),
    enabled: householdId !== null,
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchDashboardBudgetBoard(),
  });
  const refetchBudgetBoard = budgetBoardQuery.refetch;
  const budgetBoardError = budgetBoardQuery.error;

  const refreshBudgetBoard = useCallback(async () => {
    await refetchBudgetBoard();
  }, [refetchBudgetBoard]);

  useRealtimeRefetch({
    householdId,
    module: "budget",
    refresh: refreshBudgetBoard,
  });

  useEffect(() => {
    if (!budgetBoardError) {
      return;
    }

    const error = budgetBoardError as { message?: string } | null;
    Alert.alert("Budget", error?.message || "Impossible de charger la vue budget.");
  }, [budgetBoardError]);

  const board = (budgetBoardQuery.data ?? null) as BudgetBoardPayload | null;

  const isParent = role === "parent";
  const currency = (board?.currency || "EUR").toUpperCase();
  const budgetEnabled = Boolean(board?.budget_enabled);

  const totalToPay = useMemo(() => {
    return (board?.children ?? []).reduce((sum, child) => sum + computePaymentBreakdown(child).remainingToPay, 0);
  }, [board?.children]);

  const childBudget = board?.children?.[0] ?? null;
  const childBreakdown = useMemo(() => {
    return childBudget ? computePaymentBreakdown(childBudget) : null;
  }, [childBudget]);

  const parentDetails = useMemo(() => {
    return (board?.children ?? []).map((child) => {
      const advanceTransactions = child.transactions.filter((transaction) => isAdvanceRequest(transaction));
      const stats = countAdvanceStatuses(advanceTransactions);
      return {
        id: child.child.id,
        name: child.child.name,
        paidPeriod: Number(child.summary.allocation_total_period ?? 0),
        bonusPeriod: Number(child.summary.bonus_total_period ?? 0),
        penaltyPeriod: Math.abs(Number(child.summary.penalty_total_period ?? 0)),
        pendingAdvance: stats.pending,
        approvedAdvance: stats.approved,
        rejectedAdvance: stats.rejected,
      };
    });
  }, [board?.children]);

  const childAdvanceTransactions = useMemo(() => {
    if (!childBudget) return [] as BudgetTransaction[];
    return childBudget.transactions.filter((transaction) => isAdvanceRequest(transaction));
  }, [childBudget]);

  const childAdvanceStats = useMemo(() => {
    return countAdvanceStatuses(childAdvanceTransactions);
  }, [childAdvanceTransactions]);

  const history = useMemo(() => {
    return buildHistory(board?.children ?? [], 12);
  }, [board?.children]);
  const headerStyle = useMemo(
    () => [styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12) }],
    [insets.top, theme.icon]
  );
  const backButtonStyle = useMemo(() => [styles.backBtn, { borderColor: theme.icon }], [theme.icon]);
  const cardStyle = useMemo(
    () => [styles.card, { backgroundColor: theme.card, borderColor: theme.icon }],
    [theme.card, theme.icon]
  );
  const detailRowStyle = useMemo(() => [styles.detailRow, { borderColor: `${theme.icon}55` }], [theme.icon]);
  const onBackPress = useCallback(() => {
    router.replace("/dashboard");
  }, [router]);
  const onOpenBudgetModule = useCallback(() => {
    router.push("/(app)/(tabs)/budget");
  }, [router]);

  if (budgetBoardQuery.isPending && !board) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <View style={headerStyle}> 
        <TouchableOpacity onPress={onBackPress} style={backButtonStyle}> 
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Détail budget</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!budgetEnabled ? (
          <View style={cardStyle}> 
            <Text style={[styles.text, { color: theme.textSecondary }]}>Module budget désactivé.</Text>
          </View>
        ) : (
          <>
            <View style={cardStyle}> 
              <Text style={[styles.title, { color: theme.text }]}>Résumé</Text>
              {isParent ? (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>À payer: {formatMoney(totalToPay, currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Demandes en attente: {board?.pending_advance_requests?.length ?? 0}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>À recevoir: {formatMoney(childBreakdown?.remainingToPay ?? 0, currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Avances en attente: {childAdvanceStats.pending}</Text>
                </>
              )}
            </View>

            <View style={cardStyle}> 
              <Text style={[styles.title, { color: theme.text }]}>
                {isParent ? "Par enfant" : "Mes stats"}
              </Text>

              {isParent ? (
                parentDetails.map((item) => (
                  <View key={`child-${item.id}`} style={detailRowStyle}> 
                    <Text style={[styles.detailTitle, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Payé période: {formatMoney(item.paidPeriod, currency)}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Avances - attente {item.pendingAdvance} | acceptées {item.approvedAdvance} | refusées {item.rejectedAdvance}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Bonus {formatMoney(item.bonusPeriod, currency)} | Pénalités {formatMoney(item.penaltyPeriod, currency)}</Text>
                  </View>
                ))
              ) : childBudget ? (
                <View style={detailRowStyle}> 
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Payé période: {formatMoney(Number(childBudget.summary.allocation_total_period ?? 0), currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Avances - attente {childAdvanceStats.pending} | acceptées {childAdvanceStats.approved} | refusées {childAdvanceStats.rejected}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Bonus {formatMoney(Number(childBudget.summary.bonus_total_period ?? 0), currency)} | Pénalités {formatMoney(Math.abs(Number(childBudget.summary.penalty_total_period ?? 0)), currency)}</Text>
                </View>
              ) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucune donnée disponible.</Text>
              )}
            </View>

            <View style={cardStyle}> 
              <Text style={[styles.title, { color: theme.text }]}>Historique récent</Text>
              {history.length > 0 ? history.map((item) => (
                <View key={item.id} style={[styles.historyRow, { borderTopColor: `${theme.icon}55` }]}> 
                  <View style={styles.flexOne}>
                    <Text style={[styles.historyTitle, { color: theme.text }]}>
                      {isParent ? `${item.childName} - ${item.typeLabel}` : item.typeLabel}
                    </Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}> 
                      {item.statusLabel} | {formatShortDate(item.createdAt)}
                    </Text>
                    {item.justification ? (
                      <Text style={[styles.text, { color: theme.textSecondary }]}>Justification: {item.justification}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.historyAmount, { color: item.amount < 0 ? theme.accentWarm : theme.text }]}> 
                    {`${item.amount < 0 ? "-" : "+"}${formatMoney(Math.abs(item.amount), currency)}`}
                  </Text>
                </View>
              )) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucune transaction récente.</Text>
              )}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={onOpenBudgetModule}
        >
          <Text style={styles.primaryButtonText}>Ouvrir le module Budget</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    minHeight: 60,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  title: { fontSize: 15, fontWeight: "700" },
  text: { fontSize: 12, lineHeight: 17 },
  detailRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  detailTitle: { fontSize: 13, fontWeight: "700" },
  historyRow: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyTitle: { fontSize: 13, fontWeight: "700" },
  historyAmount: { fontSize: 12, fontWeight: "700" },
  primaryButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: BUTTON_TEXT_COLOR, fontWeight: "700", fontSize: 13 },
  flexOne: { flex: 1 },
});
