import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { queryKeys } from "@/src/query/query-keys";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  BudgetBoardPayload,
  BudgetPayoutMode,
  BudgetRequestKind,
  BudgetTransaction,
  formatDateTime,
  formatMoney,
  toNumber,
  transactionStatusLabel,
} from "@/src/budget/common";

type AdvanceHistoryItem = {
  childName: string;
  transaction: BudgetTransaction;
};

const requestKindLabel = (requestKind: BudgetRequestKind | null | undefined): string =>
  requestKind === "reimbursement" ? "Demande de remboursement" : "Demande d'avance";

const payoutModeLabel = (mode: BudgetPayoutMode | null | undefined): string => {
  if (mode === "immediate") return "Payé immédiatement";
  if (mode === "integrated") return "Intégré au paiement";
  return "Mode standard";
};

export default function BudgetAdvancesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [reviewAmounts, setReviewAmounts] = useState<Record<number, string>>({});
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les demandes.";
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

  const invalidateBudgetAndDashboard = useCallback(async () => {
    if (!householdId) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.budget.board(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) }),
    ]);
  }, [householdId, queryClient]);

  const onBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(app)/(tabs)/budget");
  }, [router]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";

  const reviewedHistory = useMemo<AdvanceHistoryItem[]>(() => {
    if (!board?.children) return [];
    const items: AdvanceHistoryItem[] = [];
    board.children.forEach((child) => {
      child.transactions.forEach((transaction) => {
        if (transaction.type !== "advance" || transaction.status === "pending") return;
        items.push({ childName: child.child.name, transaction });
      });
    });
    return items.sort((left, right) => {
      const leftDate = left.transaction.created_at ? new Date(left.transaction.created_at).getTime() : 0;
      const rightDate = right.transaction.created_at ? new Date(right.transaction.created_at).getTime() : 0;
      return rightDate - leftDate;
    });
  }, [board?.children]);

  const handleReviewRequest = async (
    request: BudgetTransaction,
    status: "approved" | "rejected",
    payoutMode?: BudgetPayoutMode
  ) => {
    const amountText = reviewAmounts[request.id] ?? String(request.amount);
    const commentText = reviewComments[request.id] ?? "";
    const payload: { status: "approved" | "rejected"; amount?: number; comment?: string; payout_mode?: BudgetPayoutMode } = { status };

    if (status === "approved") {
      const amount = toNumber(amountText);
      if (amount === null || amount <= 0) {
        Alert.alert("Budget", "Le montant approuvé doit être supérieur à 0.");
        return;
      }
      payload.amount = amount;
    }
    if (commentText.trim() !== "") payload.comment = commentText.trim();
    if (request.request_kind === "reimbursement" && status === "approved") {
      payload.payout_mode = payoutMode ?? "integrated";
    }

    setSaving(true);
    try {
      await apiFetch(`/budget/advances/${request.id}/review`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadBoard();
      await invalidateBudgetAndDashboard();
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de traiter la demande.";
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
          <Text style={[styles.title, { color: theme.text }]}>Demandes d&apos;avance</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Avances et remboursements enfants</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        {(board?.pending_advance_requests ?? []).length === 0 ? (
          <Text style={[styles.text, { color: theme.textSecondary }]}>Pas de demandes en cours.</Text>
        ) : (
          <View style={styles.listWrap}>
            {(board?.pending_advance_requests ?? []).map((request) => {
              const kind = request.request_kind ?? "advance";
              return (
                <View key={`pending-${request.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
                  <Text style={[styles.innerTitle, { color: theme.text }]}>
                    {request.user?.name ?? "Enfant"} • {formatMoney(request.amount, currency)}
                  </Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>
                    {requestKindLabel(kind)} • {formatDateTime(request.created_at)}
                  </Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>
                    {request.comment || "Sans justification"}
                  </Text>
                  <Text style={[styles.label, { color: theme.text }]}>Montant approuvé</Text>
                  <TextInput
                    value={reviewAmounts[request.id] ?? ""}
                    onChangeText={(value) => setReviewAmounts((prev) => ({ ...prev, [request.id]: value }))}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                    placeholder="Ex: 12,50"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <Text style={[styles.label, { color: theme.text }]}>Commentaire parent (optionnel)</Text>
                  <TextInput
                    value={reviewComments[request.id] ?? ""}
                    onChangeText={(value) => setReviewComments((prev) => ({ ...prev, [request.id]: value }))}
                    style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                    placeholder="Ajouter un commentaire"
                    placeholderTextColor={theme.textSecondary}
                  />
                  {kind === "reimbursement" ? (
                    <View style={styles.actionsWrap}>
                      <TouchableOpacity
                        onPress={() => void handleReviewRequest(request, "approved", "integrated")}
                        style={[styles.actionBtn, { backgroundColor: theme.tint }]}
                        disabled={saving}
                      >
                        <Text style={styles.actionBtnText}>Intégrer au paiement</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleReviewRequest(request, "approved", "immediate")}
                        style={[styles.actionBtn, { backgroundColor: "#2E8B57" }]}
                        disabled={saving}
                      >
                        <Text style={styles.actionBtnText}>Payé tout de suite</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleReviewRequest(request, "rejected")}
                        style={[styles.actionBtn, { backgroundColor: theme.accentWarm }]}
                        disabled={saving}
                      >
                        <Text style={styles.actionBtnText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        onPress={() => void handleReviewRequest(request, "approved")}
                        style={[styles.actionBtn, { backgroundColor: theme.tint }]}
                        disabled={saving}
                      >
                        <Text style={styles.actionBtnText}>Approuver</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => void handleReviewRequest(request, "rejected")}
                        style={[styles.actionBtn, { backgroundColor: theme.accentWarm }]}
                        disabled={saving}
                      >
                        <Text style={styles.actionBtnText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <TouchableOpacity onPress={() => setHistoryOpen((prev) => !prev)} style={styles.historyHeader}>
          <Text style={[styles.innerTitle, { color: theme.text }]}>Historique</Text>
          <MaterialCommunityIcons name={historyOpen ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
        </TouchableOpacity>
        {historyOpen ? (
          reviewedHistory.length === 0 ? (
            <Text style={[styles.text, { color: theme.textSecondary }]}>Aucun historique.</Text>
          ) : (
            <View style={styles.listWrap}>
              {reviewedHistory.map((item) => (
                <View key={`history-${item.transaction.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
                  <Text style={[styles.innerTitle, { color: theme.text }]}>
                    {item.childName} • {formatMoney(item.transaction.amount, currency)}
                  </Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>
                    {requestKindLabel(item.transaction.request_kind)} • {transactionStatusLabel(item.transaction.status)}
                  </Text>
                  {item.transaction.request_kind === "reimbursement" && item.transaction.status === "approved" ? (
                    <Text style={[styles.text, { color: theme.textSecondary }]}>{payoutModeLabel(item.transaction.payout_mode)}</Text>
                  ) : null}
                  <Text style={[styles.text, { color: theme.textSecondary }]}>{formatDateTime(item.transaction.created_at)}</Text>
                  {item.transaction.comment ? <Text style={[styles.text, { color: theme.textSecondary }]}>{item.transaction.comment}</Text> : null}
                </View>
              ))}
            </View>
          )
        ) : null}
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
  listWrap: { gap: 8 },
  innerCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  innerTitle: { fontSize: 14, fontWeight: "700" },
  text: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  actionsRow: { flexDirection: "row", gap: 8 },
  actionsWrap: { gap: 8 },
  actionBtn: {
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  actionBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12, textAlign: "center" },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
