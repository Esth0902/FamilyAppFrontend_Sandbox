import React, { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { computePaymentBreakdown, formatMoney } from "@/src/budget/common";
import { AppCard } from "@/src/components/ui/AppCard";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useDashboardData } from "@/src/hooks/useDashboardData";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

type DashboardRoute =
  | "/dashboard/sondages"
  | "/dashboard/budget"
  | "/dashboard/tasks"
  | "/dashboard/calendar";

type DashboardCard = {
  id: string;
  title: string;
  description: string;
  extraDescription?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accentColor: string;
  iconBackgroundColor: string;
  route: DashboardRoute;
};

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();
  const { dashboard, budgetBoard, calendarSummary, isInitialLoading, error, refreshDashboard } = useDashboardData({
    householdId,
  });

  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
    }, [refreshDashboard])
  );

  useEffect(() => {
    if (!error) return;
    Alert.alert("Dashboard", error.message || "Impossible de charger le dashboard.");
  }, [error]);

  useEffect(() => {
    if (!householdId) return;

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        const module = String(message?.module ?? "");
        if (module !== "tasks" && module !== "meal_poll" && module !== "budget" && module !== "calendar") return;
        void refreshDashboard();
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [householdId, refreshDashboard]);

  const isParent = role === "parent";

  const pollsOpenCount = dashboard?.polls_open_count ?? 0;
  const pollsClosedCount = dashboard?.polls_closed_count ?? 0;
  const pollsTotalCount = dashboard?.polls_total_count ?? pollsOpenCount + pollsClosedCount;

  const currency = (budgetBoard?.currency || "EUR").toUpperCase();
  const budgetEnabled = Boolean(budgetBoard?.budget_enabled);
  const pendingRequests = dashboard?.budget_pending_requests ?? budgetBoard?.pending_advance_requests?.length ?? 0;
  const totalToPay = useMemo(() => {
    return (budgetBoard?.children ?? []).reduce((sum, child) => {
      return sum + computePaymentBreakdown(child).remainingToPay;
    }, 0);
  }, [budgetBoard?.children]);
  const childBudget = budgetBoard?.children?.[0] ?? null;
  const childToReceive = childBudget ? computePaymentBreakdown(childBudget).remainingToPay : 0;

  const tasksTodoCount = dashboard?.tasks_todo_count ?? 0;
  const tasksDoneCount = dashboard?.tasks_done_count ?? 0;
  const tasksValidatedCount = dashboard?.tasks_validated_count ?? 0;

  const calendarEnabled = Boolean(calendarSummary?.calendar_enabled);
  const calendarEventsCount = calendarSummary?.events?.length ?? 0;
  const calendarMealsCount = calendarSummary?.meal_plan?.length ?? 0;

  const cardThemeStyle = useMemo(
    () => ({ backgroundColor: theme.card, borderColor: theme.icon }),
    [theme.card, theme.icon]
  );

  const cards = useMemo<DashboardCard[]>(
    () => [
      {
        id: "polls",
        title: "Sondages repas",
        description: `Ouverts ${pollsOpenCount} | Clôturés ${pollsClosedCount} | Total ${pollsTotalCount}`,
        icon: "vote",
        accentColor: theme.tint,
        iconBackgroundColor: `${theme.tint}15`,
        route: "/dashboard/sondages",
      },
      {
        id: "budget",
        title: "Budget",
        description: budgetEnabled
          ? isParent
            ? `À payer ${formatMoney(totalToPay, currency)} | En attente ${pendingRequests}`
            : `À recevoir ${formatMoney(childToReceive, currency)}`
          : "Module budget désactivé",
        icon: "piggy-bank-outline",
        accentColor: theme.tint,
        iconBackgroundColor: `${theme.tint}15`,
        route: "/dashboard/budget",
      },
      {
        id: "tasks",
        title: "Tâches",
        description: `À faire ${tasksTodoCount} | Réalisées ${tasksDoneCount} | Validées ${tasksValidatedCount}`,
        icon: "checkbox-marked-circle-outline",
        accentColor: theme.accentCool,
        iconBackgroundColor: `${theme.accentCool}18`,
        route: "/dashboard/tasks",
      },
      {
        id: "calendar",
        title: "Calendrier",
        description: calendarEnabled
          ? `Événements ${calendarEventsCount} | Repas planifiés ${calendarMealsCount}`
          : "Module calendrier désactivé",
        icon: "calendar-month-outline",
        accentColor: theme.accentWarm,
        iconBackgroundColor: `${theme.accentWarm}18`,
        route: "/dashboard/calendar",
      },
    ],
    [
      budgetEnabled,
      calendarEnabled,
      calendarEventsCount,
      calendarMealsCount,
      childToReceive,
      currency,
      isParent,
      pendingRequests,
      pollsClosedCount,
      pollsOpenCount,
      pollsTotalCount,
      tasksDoneCount,
      tasksTodoCount,
      tasksValidatedCount,
      theme.accentCool,
      theme.accentWarm,
      theme.tint,
      totalToPay,
    ]
  );

  if (isInitialLoading && !dashboard && !budgetBoard && !calendarSummary) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (error && !dashboard && !budgetBoard && !calendarSummary) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenHeader
          title="Dashboard"
          subtitle="Clique pour voir le détail"
          withBackButton
          onBackPress={() => router.replace("/(app)/(tabs)/home")}
          safeTop
          showBorder
        />
        <ScrollView contentContainerStyle={styles.content}>
          <EmptyState
            icon="cloud-alert-outline"
            title="Impossible de charger le dashboard"
            message={error.message || "Vérifie ta connexion puis réessaie."}
            actionLabel="Réessayer"
            onActionPress={() => {
              void refreshDashboard();
            }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader
        title="Dashboard"
        subtitle="Clique pour voir le détail"
        withBackButton
        onBackPress={() => router.replace("/(app)/(tabs)/home")}
        safeTop
        showBorder
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {cards.map((card) => (
          <AppCard
            key={card.id}
            style={[styles.card, cardThemeStyle]}
            accentColor={card.accentColor}
            onPress={() => router.push(card.route)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: card.iconBackgroundColor }]}>
              <MaterialCommunityIcons name={card.icon} size={24} color={card.accentColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{card.description}</Text>
              {card.extraDescription ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>{card.extraDescription}</Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </AppCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    minHeight: 86,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
});
