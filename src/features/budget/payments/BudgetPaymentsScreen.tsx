import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import {
  BudgetBoardPayload,
  ChildBudget,
  computePaymentBreakdown,
} from "@/src/budget/common";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { BudgetPaymentsChildCard, PaymentAction } from "@/src/features/budget/payments/components/BudgetPaymentsChildCard";
import { budgetPaymentsStyles as styles } from "@/src/features/budget/payments/budget-payments.styles";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";
import { invalidateBudgetAndDashboard } from "@/src/services/budgetService";

export default function BudgetPaymentsScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [expandedChildIds, setExpandedChildIds] = useState<Record<number, boolean>>({});

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les paiements.";
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
  const children = board?.children ?? [];

  const toggleChildExpansion = useCallback((childId: number) => {
    setExpandedChildIds((prev) => ({ ...prev, [childId]: !prev[childId] }));
  }, []);

  const handlePaymentAction = useCallback(async (child: ChildBudget, action: PaymentAction) => {
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
      await invalidateBudgetAndDashboard(queryClient, householdId);
      if (response?.message) {
        Alert.alert("Budget", response.message);
      }
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'enregistrer cette action.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  }, [householdId, loadBoard, queryClient]);

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
          title="Paiements"
          subtitle="Déroule un enfant pour voir le résumé détaillé"
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
        <View style={styles.listWrap}>
          {children.map((child) => {
            const breakdown = computePaymentBreakdown(child);
            const isOpen = expandedChildIds[child.child.id] === true;
            return (
              <BudgetPaymentsChildCard
                key={`payment-${child.child.id}`}
                theme={theme}
                child={child}
                breakdown={breakdown}
                currency={currency}
                isOpen={isOpen}
                saving={saving}
                onToggleOpen={() => toggleChildExpansion(child.child.id)}
                onConfirmAction={(action) => {
                  void handlePaymentAction(child, action);
                }}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
