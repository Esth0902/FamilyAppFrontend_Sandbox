import React, { useCallback, useEffect, useMemo } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { computePaymentBreakdown, formatMoney } from "@/src/budget/common";
import { DashboardCardsView } from "@/src/features/dashboard/components/DashboardCardsView";
import { DashboardErrorView } from "@/src/features/dashboard/components/DashboardErrorView";
import { DashboardLoadingView } from "@/src/features/dashboard/components/DashboardLoadingView";
import type { DashboardCardItem } from "@/src/features/dashboard/components/dashboard.types";
import { useDashboardData } from "@/src/hooks/useDashboardData";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";

export default function DashboardScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();
  const { dashboard, budgetBoard, calendarSummary, isInitialLoading, error, refreshDashboard } = useDashboardData({
    householdId,
  });
  const isParent = role === "parent";
  const realtimeModules = useMemo(() => ["tasks", "meal_poll", "budget", "calendar"], []);

  const refreshDashboardData = useCallback(async () => {
    await refreshDashboard();
  }, [refreshDashboard]);

  useRealtimeRefetch({
    householdId,
    module: realtimeModules,
    refresh: refreshDashboardData,
  });

  useEffect(() => {
    if (!error) return;
    Alert.alert("Dashboard", error.message || "Impossible de charger le dashboard.");
  }, [error]);

  const onBackPress = useCallback(() => {
    router.replace("/(app)/(tabs)/home");
  }, [router]);

  const onRetry = useCallback(() => {
    void refreshDashboard();
  }, [refreshDashboard]);

  const onOpenCard = useCallback(
    (card: DashboardCardItem) => {
      router.push(card.route);
    },
    [router]
  );

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

  const cards = useMemo<DashboardCardItem[]>(
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
    return <DashboardLoadingView theme={theme} />;
  }

  if (error && !dashboard && !budgetBoard && !calendarSummary) {
    return (
      <DashboardErrorView
        theme={theme}
        message={error.message || "Vérifie ta connexion puis réessaie."}
        onBackPress={onBackPress}
        onRetry={onRetry}
      />
    );
  }

  return (
    <DashboardCardsView
      theme={theme}
      cards={cards}
      onBackPress={onBackPress}
      onOpenCard={onOpenCard}
    />
  );
}
