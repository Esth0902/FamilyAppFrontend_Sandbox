import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import {
  BudgetBoardPayload,
  BudgetTransaction,
  ChildBudget,
  computePaymentBreakdown,
  formatMoney,
} from "@/src/budget/common";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

type ApiError = {
  status?: number;
  message?: string;
};

type HistoryItem = {
  id: string;
  childName: string;
  typeLabel: string;
  statusLabel: string;
  amount: number;
  createdAt: string | null;
  justification: string | null;
};

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

export default function DashboardBudgetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }

    try {
      const payload = await apiFetch("/budget/board");
      setBoard((payload ?? null) as BudgetBoardPayload | null);
    } catch (error: any) {
      const typedError = error as ApiError;
      if (typedError?.status === 403 || typedError?.status === 404) {
        setBoard(null);
      } else {
        Alert.alert("Budget", typedError?.message || "Impossible de charger la vue budget.");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBoard({ silent: false });
    }, [loadBoard])
  );

  useEffect(() => {
    if (!householdId) {
      return;
    }

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
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, loadBoard]);

  const isParent = role === "parent";
  const currency = (board?.currency || "EUR").toUpperCase();
  const budgetEnabled = Boolean(board?.budget_enabled);

  const totalToPay = useMemo(() => {
    return (board?.children ?? []).reduce((sum, child) => sum + computePaymentBreakdown(child).remainingToPay, 0);
  }, [board?.children]);

  const childBudget = board?.children?.[0] ?? null;
  const childBreakdown = childBudget ? computePaymentBreakdown(childBudget) : null;

  const parentDetails = useMemo(() => {
    return (board?.children ?? []).map((child) => {
      const advanceTransactions = child.transactions.filter((transaction) => isAdvanceRequest(transaction));
      return {
        id: child.child.id,
        name: child.child.name,
        paidPeriod: Number(child.summary.allocation_total_period ?? 0),
        bonusPeriod: Number(child.summary.bonus_total_period ?? 0),
        penaltyPeriod: Math.abs(Number(child.summary.penalty_total_period ?? 0)),
        pendingAdvance: advanceTransactions.filter((transaction) => transaction.status === "pending").length,
        approvedAdvance: advanceTransactions.filter((transaction) => transaction.status === "approved").length,
        rejectedAdvance: advanceTransactions.filter((transaction) => transaction.status === "rejected").length,
      };
    });
  }, [board?.children]);

  const childAdvanceTransactions = useMemo(() => {
    if (!childBudget) return [] as BudgetTransaction[];
    return childBudget.transactions.filter((transaction) => isAdvanceRequest(transaction));
  }, [childBudget]);

  const childPendingAdvance = childAdvanceTransactions.filter((transaction) => transaction.status === "pending").length;
  const childApprovedAdvance = childAdvanceTransactions.filter((transaction) => transaction.status === "approved").length;
  const childRejectedAdvance = childAdvanceTransactions.filter((transaction) => transaction.status === "rejected").length;

  const history = useMemo(() => {
    return buildHistory(board?.children ?? [], 12);
  }, [board?.children]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12) }]}> 
        <TouchableOpacity onPress={() => router.replace("/dashboard")} style={[styles.backBtn, { borderColor: theme.icon }]}> 
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Détail budget</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!budgetEnabled ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
            <Text style={[styles.text, { color: theme.textSecondary }]}>Module budget désactivé.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Résumé</Text>
              {isParent ? (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>À payer: {formatMoney(totalToPay, currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Demandes en attente: {board?.pending_advance_requests?.length ?? 0}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>À recevoir: {formatMoney(childBreakdown?.remainingToPay ?? 0, currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Avances en attente: {childPendingAdvance}</Text>
                </>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>
                {isParent ? "Par enfant" : "Mes stats"}
              </Text>

              {isParent ? (
                parentDetails.map((item) => (
                  <View key={`child-${item.id}`} style={[styles.detailRow, { borderColor: `${theme.icon}55` }]}> 
                    <Text style={[styles.detailTitle, { color: theme.text }]}>{item.name}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Payé période: {formatMoney(item.paidPeriod, currency)}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Avances - attente {item.pendingAdvance} | acceptées {item.approvedAdvance} | refusées {item.rejectedAdvance}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Bonus {formatMoney(item.bonusPeriod, currency)} | Pénalités {formatMoney(item.penaltyPeriod, currency)}</Text>
                  </View>
                ))
              ) : childBudget ? (
                <View style={[styles.detailRow, { borderColor: `${theme.icon}55` }]}> 
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Payé période: {formatMoney(Number(childBudget.summary.allocation_total_period ?? 0), currency)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Avances - attente {childPendingAdvance} | acceptées {childApprovedAdvance} | refusées {childRejectedAdvance}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Bonus {formatMoney(Number(childBudget.summary.bonus_total_period ?? 0), currency)} | Pénalités {formatMoney(Math.abs(Number(childBudget.summary.penalty_total_period ?? 0)), currency)}</Text>
                </View>
              ) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucune donnée disponible.</Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Historique récent</Text>
              {history.length > 0 ? history.map((item) => (
                <View key={item.id} style={[styles.historyRow, { borderTopColor: `${theme.icon}55` }]}> 
                  <View style={{ flex: 1 }}>
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
          onPress={() => router.push("/(tabs)/budget")}
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
  primaryButtonText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});
