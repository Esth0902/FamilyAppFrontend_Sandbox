import React, { useEffect, useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { computePaymentBreakdown, formatMoney } from "@/src/budget/common";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppCard } from "@/src/components/ui/AppCard";
import { Chip } from "@/src/components/ui/Chip";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useBudgetBoard } from "@/src/hooks/useBudgetBoard";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";

type BudgetRoute =
  | "/budget/advances"
  | "/budget/adjustments"
  | "/budget/payments"
  | "/budget/my-pocket-money"
  | "/budget/request-advance"
  | "/budget/request-reimbursement";

type MenuCard = {
  id: string;
  title: string;
  description: string;
  chipLabel?: string;
  chipTone?: "neutral" | "info" | "success" | "warning";
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  route: BudgetRoute;
};

export default function BudgetTabScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const { board, isInitialLoading, error, refreshBoard } = useBudgetBoard({ householdId });

  useRealtimeRefetch({
    householdId,
    module: "budget",
    refresh: refreshBoard,
  });

  useEffect(() => {
    if (!error) return;
    Alert.alert("Budget", error.message || "Impossible de charger le budget.");
  }, [error]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const myBudget = board?.children[0] ?? null;

  const totalPendingRequests = useMemo(
    () => (board?.pending_advance_requests ?? []).length,
    [board?.pending_advance_requests]
  );
  const totalPendingPayments = useMemo(
    () => (board?.children ?? []).reduce((sum, child) => sum + computePaymentBreakdown(child).remainingToPay, 0),
    [board?.children]
  );
  const childAdvancePending = useMemo(
    () =>
      (myBudget?.transactions ?? []).filter(
        (tx) => tx.type === "advance" && tx.status === "pending" && (tx.request_kind ?? "advance") === "advance"
      ).length,
    [myBudget?.transactions]
  );
  const childReimbursementPending = useMemo(
    () =>
      (myBudget?.transactions ?? []).filter(
        (tx) => tx.type === "advance" && tx.status === "pending" && tx.request_kind === "reimbursement"
      ).length,
    [myBudget?.transactions]
  );
  const childExpectedAmount = useMemo(() => (myBudget ? computePaymentBreakdown(myBudget).remainingToPay : 0), [myBudget]);

  const cardThemeStyle = useMemo(
    () => ({ backgroundColor: theme.card, borderColor: theme.icon }),
    [theme.card, theme.icon]
  );

  const parentCards = useMemo<MenuCard[]>(
    () => [
      {
        id: "advances",
        title: "Demandes d'avance",
        description: totalPendingRequests > 0 ? `${totalPendingRequests} demande(s) en attente` : "Pas de demandes en cours",
        chipLabel: totalPendingRequests > 0 ? `${totalPendingRequests} en attente` : "À jour",
        chipTone: totalPendingRequests > 0 ? "warning" : "success",
        icon: "cash-clock",
        color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
        route: "/budget/advances",
      },
      {
        id: "adjustments",
        title: "Bonus et pénalités",
        description: "Attribuer des ajustements et suivre le statut par enfant",
        icon: "star-circle-outline",
        color: theme.accentWarm,
        route: "/budget/adjustments",
      },
      {
        id: "payments",
        title: "Paiements",
        description: `Total à payer actuellement : ${formatMoney(totalPendingPayments, currency)}`,
        chipLabel: formatMoney(totalPendingPayments, currency),
        chipTone: "info",
        icon: "cash-check",
        color: theme.accentCool,
        route: "/budget/payments",
      },
    ],
    [colorScheme, currency, theme.accentCool, theme.accentWarm, theme.tint, totalPendingPayments, totalPendingRequests]
  );

  const childCards = useMemo<MenuCard[]>(
    () => [
      {
        id: "child-overview",
        title: "Mon argent de poche",
        description: `À recevoir : ${formatMoney(childExpectedAmount, currency)}`,
        chipLabel: formatMoney(childExpectedAmount, currency),
        chipTone: "info",
        icon: "wallet-outline",
        color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
        route: "/budget/my-pocket-money",
      },
      {
        id: "child-advance",
        title: "Demande d'avance",
        description: childAdvancePending > 0 ? `${childAdvancePending} demande(s) en attente` : "Créer une nouvelle demande",
        chipLabel: childAdvancePending > 0 ? `${childAdvancePending} en attente` : "Nouvelle",
        chipTone: childAdvancePending > 0 ? "warning" : "success",
        icon: "cash-plus",
        color: theme.accentWarm,
        route: "/budget/request-advance",
      },
      {
        id: "child-reimbursement",
        title: "Demande de remboursement",
        description: childReimbursementPending > 0 ? `${childReimbursementPending} demande(s) en attente` : "Montant + justification",
        chipLabel: childReimbursementPending > 0 ? `${childReimbursementPending} en attente` : "Nouveau",
        chipTone: childReimbursementPending > 0 ? "warning" : "success",
        icon: "receipt-text-check-outline",
        color: theme.accentCool,
        route: "/budget/request-reimbursement",
      },
    ],
    [
      childAdvancePending,
      childExpectedAmount,
      childReimbursementPending,
      colorScheme,
      currency,
      theme.accentCool,
      theme.accentWarm,
      theme.tint,
    ]
  );

  if (isInitialLoading && !board) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Argent de poche"
        subtitle={
          isParent
            ? "Accède aux demandes, ajustements et paiements."
            : "Consulte ton solde et envoie tes demandes."
        }
        rightSlot={
          isParent ? (
            <AppButton
              variant="secondary"
              style={styles.settingsBtn}
              onPress={() => router.push("/householdSetup?mode=edit&scope=budget")}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </AppButton>
          ) : null
        }
        containerStyle={styles.headerContainer}
        contentStyle={styles.headerContent}
      />

      {error && !board ? (
        <EmptyState
          icon="cloud-alert-outline"
          title="Impossible de charger le budget"
          message={error.message || "Vérifie ta connexion puis réessaie."}
          actionLabel="Réessayer"
          onActionPress={() => {
            void refreshBoard();
          }}
        />
      ) : !board?.budget_enabled ? (
        <EmptyState
          icon="piggy-bank-outline"
          title="Module désactivé"
          message="Active le module budget dans la configuration du foyer."
          actionLabel={isParent ? "Ouvrir les paramètres Budget" : undefined}
          onActionPress={isParent ? () => router.push("/householdSetup?mode=edit&scope=budget") : undefined}
        />
      ) : (
        <View style={styles.menuGrid}>
          {(isParent ? parentCards : childCards).map((card) => (
            <AppCard
              key={card.id}
              style={[styles.menuCard, cardThemeStyle]}
              accentColor={card.color}
              onPress={() => router.push(card.route)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${card.color}15` }]}>
                <MaterialCommunityIcons name={card.icon} size={24} color={card.color} />
              </View>
              <View style={styles.textContainer}>
                <View style={styles.titleRow}>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>{card.title}</Text>
                  {card.chipLabel ? <Chip label={card.chipLabel} tone={card.chipTone ?? "neutral"} /> : null}
                </View>
                <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>{card.description}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
            </AppCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerContainer: { paddingHorizontal: 0, paddingBottom: 0 },
  headerContent: { minHeight: 0 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  menuGrid: { gap: 10 },
  menuCard: { minHeight: 88 },
  iconContainer: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textContainer: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 },
  menuTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  menuDescription: { fontSize: 12, lineHeight: 17 },
});
