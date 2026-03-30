import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";
import { invalidateBudgetAndDashboard } from "@/src/services/budgetService";
import {
  BudgetBoardPayload,
  BudgetTransaction,
  toNumber,
} from "@/src/budget/common";
import { AdjustmentsFormCard } from "@/src/features/budget/adjustments/components/AdjustmentsFormCard";
import { AdjustmentsRecentCard } from "@/src/features/budget/adjustments/components/AdjustmentsRecentCard";
import { AdjustmentsStatusCard } from "@/src/features/budget/adjustments/components/AdjustmentsStatusCard";
import { budgetAdjustmentsStyles as styles } from "@/src/features/budget/adjustments/budget-adjustments.styles";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

type AdjustmentType = "bonus" | "penalty";
const EMPTY_CHILDREN: BudgetBoardPayload["children"] = [];

export default function BudgetAdjustmentsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("bonus");
  const [amountInput, setAmountInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les ajustements.";
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

  useEffect(() => {
    if (!board?.children.length) {
      setSelectedChildId(null);
      return;
    }
    const stillExists = board.children.some((child) => child.child.id === selectedChildId);
    if (!stillExists) {
      setSelectedChildId(board.children[0].child.id);
    }
  }, [board?.children, selectedChildId]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const childrenBudgets = board?.children ?? EMPTY_CHILDREN;
  const selectedChild = board?.children.find((child) => child.child.id === selectedChildId) ?? null;

  const selectedChildAdjustments = useMemo(() => {
    if (!selectedChild) {
      return [] as BudgetTransaction[];
    }
    return selectedChild.transactions.filter((transaction) => (
      transaction.type === "bonus" || transaction.type === "penalty"
    ));
  }, [selectedChild]);

  const resetForm = useCallback(() => {
    setAdjustmentType("bonus");
    setAmountInput("");
    setCommentInput("");
    setEditingTransactionId(null);
  }, []);

  const handleSaveAdjustment = useCallback(async () => {
    if (!selectedChild) {
      Alert.alert("Budget", "Sélectionne d'abord un enfant.");
      return;
    }

    const amount = toNumber(amountInput);
    if (amount === null || amount <= 0) {
      Alert.alert("Budget", "Le montant doit être supérieur à 0.");
      return;
    }

    setSaving(true);
    try {
      if (editingTransactionId !== null) {
        await apiFetch(`/budget/adjustments/${editingTransactionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            type: adjustmentType,
            amount,
            comment: commentInput.trim() === "" ? null : commentInput.trim(),
          }),
        });
      } else {
        await apiFetch("/budget/adjustments", {
          method: "POST",
          body: JSON.stringify({
            user_id: selectedChild.child.id,
            type: adjustmentType,
            amount,
            comment: commentInput.trim() === "" ? undefined : commentInput.trim(),
          }),
        });
      }
      resetForm();
      await loadBoard();
      await invalidateBudgetAndDashboard(queryClient, householdId);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'enregistrer cet ajustement.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  }, [
    adjustmentType,
    amountInput,
    commentInput,
    editingTransactionId,
    householdId,
    loadBoard,
    queryClient,
    resetForm,
    selectedChild,
  ]);

  const handleStartEditAdjustment = useCallback((transaction: BudgetTransaction) => {
    const nextType: AdjustmentType = transaction.type === "penalty" ? "penalty" : "bonus";
    setAdjustmentType(nextType);
    setAmountInput(String(transaction.amount));
    setCommentInput(transaction.comment ?? "");
    setEditingTransactionId(transaction.id);
  }, []);

  const handleDeleteAdjustment = useCallback((transaction: BudgetTransaction) => {
    Alert.alert(
      "Supprimer l'ajustement",
      "Cet ajustement sera définitivement supprimé.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await apiFetch(`/budget/adjustments/${transaction.id}`, {
                  method: "DELETE",
                });
                if (editingTransactionId === transaction.id) {
                  resetForm();
                }
                await loadBoard();
                await invalidateBudgetAndDashboard(queryClient, householdId);
              } catch (error: unknown) {
                const message = (error as { message?: string })?.message || "Impossible de supprimer cet ajustement.";
                Alert.alert("Budget", message);
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  }, [editingTransactionId, householdId, loadBoard, queryClient, resetForm]);

  const handleSaveAdjustmentPress = useCallback(() => {
    void handleSaveAdjustment();
  }, [handleSaveAdjustment]);

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
          title="Bonus et pénalités"
          subtitle="Attribuer à un enfant puis suivre le statut actuel"
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
        <AdjustmentsFormCard
          theme={theme}
          childrenBudgets={childrenBudgets}
          selectedChildId={selectedChildId}
          adjustmentType={adjustmentType}
          amountInput={amountInput}
          commentInput={commentInput}
          editingTransactionId={editingTransactionId}
          saving={saving}
          onSelectChild={setSelectedChildId}
          onAdjustmentTypeChange={setAdjustmentType}
          onAmountInputChange={setAmountInput}
          onCommentInputChange={setCommentInput}
          onSave={handleSaveAdjustmentPress}
          onCancelEdit={resetForm}
        />

        <AdjustmentsRecentCard
          theme={theme}
          selectedChild={selectedChild}
          selectedChildAdjustments={selectedChildAdjustments}
          currency={currency}
          saving={saving}
          onEdit={handleStartEditAdjustment}
          onDelete={handleDeleteAdjustment}
        />

        <AdjustmentsStatusCard
          theme={theme}
          childrenBudgets={childrenBudgets}
          currency={currency}
        />
      </ScrollView>
    </View>
  );
}
