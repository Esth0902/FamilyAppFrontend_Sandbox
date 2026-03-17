import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import { BudgetBoardPayload, computePaymentBreakdown, formatMoney } from "@/src/budget/common";

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
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  route: BudgetRoute;
};

export default function BudgetTabScreen() {
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

  useFocusEffect(
    useCallback(() => {
      void loadBoard({ silent: false });
    }, [loadBoard])
  );

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

  const totalPendingRequests = useMemo(
    () => (board?.pending_advance_requests ?? []).length,
    [board?.pending_advance_requests]
  );

  const totalPendingPayments = useMemo(
    () => (board?.children ?? []).reduce((sum, child) => sum + computePaymentBreakdown(child).remainingToPay, 0),
    [board?.children]
  );

  const childAdvancePending = useMemo(
    () => (myBudget?.transactions ?? []).filter((tx) => tx.type === "advance" && tx.status === "pending" && (tx.request_kind ?? "advance") === "advance").length,
    [myBudget?.transactions]
  );

  const childReimbursementPending = useMemo(
    () => (myBudget?.transactions ?? []).filter((tx) => tx.type === "advance" && tx.status === "pending" && tx.request_kind === "reimbursement").length,
    [myBudget?.transactions]
  );

  const childExpectedAmount = useMemo(
    () => (myBudget ? computePaymentBreakdown(myBudget).remainingToPay : 0),
    [myBudget]
  );

  const parentCards = useMemo<MenuCard[]>(
    () => [
      {
        id: "advances",
        title: "Demandes d'avance",
        description: totalPendingRequests > 0 ? `${totalPendingRequests} demande(s) en attente` : "Pas de demandes en cours",
        icon: "cash-clock",
        color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
        route: "/budget/advances",
      },
      {
        id: "adjustments",
        title: "Bonus et pénalités",
        description: "Attribuer des ajustements et suivre le statut par enfant",
        icon: "star-circle-outline",
        color: "#F5A623",
        route: "/budget/adjustments",
      },
      {
        id: "payments",
        title: "Paiements",
        description: `Total à payer actuellement : ${formatMoney(totalPendingPayments, currency)}`,
        icon: "cash-check",
        color: "#7ED321",
        route: "/budget/payments",
      },
    ],
    [colorScheme, currency, theme.tint, totalPendingPayments, totalPendingRequests]
  );

  const childCards = useMemo<MenuCard[]>(
    () => [
      {
        id: "child-overview",
        title: "Mon argent de poche",
        description: `À recevoir : ${formatMoney(childExpectedAmount, currency)}`,
        icon: "wallet-outline",
        color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
        route: "/budget/my-pocket-money",
      },
      {
        id: "child-advance",
        title: "Demande d'avance",
        description: childAdvancePending > 0 ? `${childAdvancePending} demande(s) en attente` : "Créer une nouvelle demande",
        icon: "cash-plus",
        color: "#F5A623",
        route: "/budget/request-advance",
      },
      {
        id: "child-reimbursement",
        title: "Demande de remboursement",
        description: childReimbursementPending > 0 ? `${childReimbursementPending} demande(s) en attente` : "Montant + justification",
        icon: "receipt-text-check-outline",
        color: "#7ED321",
        route: "/budget/request-reimbursement",
      },
    ],
    [childAdvancePending, childExpectedAmount, childReimbursementPending, colorScheme, currency, theme.tint]
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Argent de poche</Text>
          {isParent ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=budget")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {isParent
            ? "Accède aux demandes, ajustements et paiements."
            : "Consulte ton solde et envoie tes demandes."}
        </Text>
      </View>

      {!board?.budget_enabled ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Module désactivé</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Active le module budget dans la configuration du foyer.
          </Text>
          {isParent ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=budget")}
              style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.primaryBtnText}>Ouvrir les paramètres Budget</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.menuGrid}>
          {(isParent ? parentCards : childCards).map((card) => (
            <TouchableOpacity
              key={card.id}
              style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.icon }]}
              onPress={() => router.push(card.route)}
              activeOpacity={0.85}
            >
              <View style={[styles.menuCardAccent, { backgroundColor: card.color }]} />
              <View style={styles.menuCardContent}>
                <View style={[styles.iconContainer, { backgroundColor: `${card.color}15` }]}>
                  <MaterialCommunityIcons name={card.icon} size={24} color={card.color} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>{card.title}</Text>
                  <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>{card.description}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </View>
            </TouchableOpacity>
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
  header: { marginBottom: 4 },
  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerTitle: { fontSize: 26, fontWeight: "700" },
  headerSubtitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  menuGrid: { gap: 10 },
  menuCard: {
    borderRadius: 15,
    overflow: "hidden",
    flexDirection: "row",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  menuCardAccent: { width: 6, height: "100%" },
  menuCardContent: { flex: 1, flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  iconContainer: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  textContainer: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  menuDescription: { fontSize: 12, lineHeight: 17 },
  emptyCard: { borderRadius: 14, padding: 12, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "700" },
  emptyText: { fontSize: 13, lineHeight: 18 },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    marginTop: 4,
  },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13, textAlign: "center" },
});
