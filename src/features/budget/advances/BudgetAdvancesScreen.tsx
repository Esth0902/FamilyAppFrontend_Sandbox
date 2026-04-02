import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import {
  BudgetBoardPayload,
  BudgetPayoutMode,
  BudgetTransaction,
  toNumber,
} from "@/src/budget/common";
import {
  AdvanceHistoryItem,
  BudgetAdvancesHistoryCard,
} from "@/src/features/budget/advances/components/BudgetAdvancesHistoryCard";
import { BudgetAdvancesPendingCard } from "@/src/features/budget/advances/components/BudgetAdvancesPendingCard";
import { budgetAdvancesStyles as styles } from "@/src/features/budget/advances/budget-advances.styles";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";
import { invalidateBudgetAndDashboard } from "@/src/services/budgetService";

export default function BudgetAdvancesScreen() {
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
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les demandes.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useRealtimeRefetch({
    householdId,
    module: "budget",
    refresh: loadBoard,
    focusOptions: { silent: false },
    realtimeOptions: { silent: true },
  });

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const pendingRequests = board?.pending_advance_requests ?? [];

  const reviewedHistory = useMemo<AdvanceHistoryItem[]>(() => {
    if (!board?.children) {
      return [];
    }
    const items: AdvanceHistoryItem[] = [];
    board.children.forEach((child) => {
      child.transactions.forEach((transaction) => {
        if (transaction.type !== "advance" || transaction.status === "pending") {
          return;
        }
        items.push({ childName: child.child.name, transaction });
      });
    });
    return items.sort((left, right) => {
      const leftDate = left.transaction.created_at ? new Date(left.transaction.created_at).getTime() : 0;
      const rightDate = right.transaction.created_at ? new Date(right.transaction.created_at).getTime() : 0;
      return rightDate - leftDate;
    });
  }, [board?.children]);

  const handleReviewRequest = useCallback(
    async (request: BudgetTransaction, status: "approved" | "rejected", payoutMode?: BudgetPayoutMode) => {
      const amountText = reviewAmounts[request.id] ?? String(request.amount);
      const commentText = reviewComments[request.id] ?? "";
      const payload: {
        status: "approved" | "rejected";
        amount?: number;
        comment?: string;
        payout_mode?: BudgetPayoutMode;
      } = { status };

      if (status === "approved") {
        const amount = toNumber(amountText);
        if (amount === null || amount <= 0) {
          Alert.alert("Budget", "Le montant approuvé doit être supérieur à 0.");
          return;
        }
        payload.amount = amount;
      }
      if (commentText.trim() !== "") {
        payload.comment = commentText.trim();
      }
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
        await invalidateBudgetAndDashboard(queryClient, householdId);
      } catch (error: unknown) {
        const message = (error as { message?: string })?.message || "Impossible de traiter la demande.";
        Alert.alert("Budget", message);
      } finally {
        setSaving(false);
      }
    },
    [householdId, loadBoard, queryClient, reviewAmounts, reviewComments]
  );

  const handleAmountChange = useCallback((requestId: number, value: string) => {
    setReviewAmounts((prev) => ({ ...prev, [requestId]: value }));
  }, []);

  const handleCommentChange = useCallback((requestId: number, value: string) => {
    setReviewComments((prev) => ({ ...prev, [requestId]: value }));
  }, []);

  const handleApprove = useCallback((request: BudgetTransaction, payoutMode?: BudgetPayoutMode) => {
    void handleReviewRequest(request, "approved", payoutMode);
  }, [handleReviewRequest]);

  const handleReject = useCallback((request: BudgetTransaction) => {
    void handleReviewRequest(request, "rejected");
  }, [handleReviewRequest]);

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Demandes d'avance"
          subtitle="Avances et remboursements enfants"
          withBackButton
          backHref="/(app)/(tabs)/budget"
          showBorder
          safeTop
          bottomSpacing={14}
          containerStyle={{ paddingHorizontal: 0 }}
          contentStyle={{ minHeight: 0 }}
        />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <BudgetAdvancesPendingCard
          theme={theme}
          pendingRequests={pendingRequests}
          currency={currency}
          reviewAmounts={reviewAmounts}
          reviewComments={reviewComments}
          saving={saving}
          onAmountChange={handleAmountChange}
          onCommentChange={handleCommentChange}
          onApprove={handleApprove}
          onReject={handleReject}
        />

        <BudgetAdvancesHistoryCard
          theme={theme}
          historyOpen={historyOpen}
          reviewedHistory={reviewedHistory}
          currency={currency}
          onToggleHistory={() => setHistoryOpen((prev) => !prev)}
        />
      </ScrollView>
    </View>
  );
}
