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
  computePaymentBreakdown,
  formatMoney,
} from "@/src/budget/common";
import { toIsoDate } from "@/src/utils/date";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

type DashboardVoterSummary = {
  user_id: number;
  votes_count: number;
};

type DashboardPoll = {
  id: number;
  status: "open" | "closed" | "validated";
  max_votes_per_user: number;
  total_votes: number;
  voters_summary?: DashboardVoterSummary[];
};

type DashboardTaskSummary = {
  enabled: boolean;
  todo_count?: number;
  done_count?: number;
  validated_count?: number;
};

type DashboardResponse = {
  polls_open?: DashboardPoll[];
  polls_closed?: DashboardPoll[];
  polls?: DashboardPoll[];
  active_poll?: DashboardPoll | null;
  tasks_summary?: DashboardTaskSummary;
  members?: { id: number }[];
};

type CalendarSummaryResponse = {
  calendar_enabled?: boolean;
  events?: unknown[];
  meal_plan?: unknown[];
};

type ApiError = {
  status?: number;
  message?: string;
};

const monthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: toIsoDate(start),
    to: toIsoDate(end),
  };
};

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role, user } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [budgetBoard, setBudgetBoard] = useState<BudgetBoardPayload | null>(null);
  const [calendarSummary, setCalendarSummary] = useState<CalendarSummaryResponse | null>(null);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }

    const range = monthRange();

    try {
      const [dashboardResponse, budgetResponse, calendarResponse] = await Promise.all([
        apiFetch("/dashboard"),
        apiFetch("/budget/board").catch((error: ApiError) => {
          if (error?.status === 403 || error?.status === 404) {
            return null;
          }
          throw error;
        }),
        apiFetch(`/calendar/board?from=${range.from}&to=${range.to}`).catch((error: ApiError) => {
          if (error?.status === 403 || error?.status === 404) {
            return null;
          }
          throw error;
        }),
      ]);

      setDashboard((dashboardResponse ?? null) as DashboardResponse | null);
      setBudgetBoard((budgetResponse ?? null) as BudgetBoardPayload | null);
      setCalendarSummary((calendarResponse ?? null) as CalendarSummaryResponse | null);
    } catch (error: any) {
      Alert.alert("Dashboard", error?.message || "Impossible de charger le dashboard.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard({ silent: false });
    }, [loadDashboard])
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
        const module = String(message?.module ?? "");
        if (
          module !== "tasks"
          && module !== "meal_poll"
          && module !== "budget"
          && module !== "calendar"
        ) {
          return;
        }
        void loadDashboard({ silent: true });
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, loadDashboard]);

  const isParent = role === "parent";
  const userId = Number(user?.id ?? 0);

  const pollsOpenCount = dashboard?.polls_open?.length ?? 0;
  const pollsClosedCount = dashboard?.polls_closed?.length ?? 0;
  const pollsTotalCount = dashboard?.polls?.length ?? 0;
  const activePoll = dashboard?.active_poll ?? dashboard?.polls_open?.[0] ?? null;
  const membersCount = dashboard?.members?.length ?? 0;
  const activePollParticipants = activePoll?.voters_summary?.length ?? 0;
  const myVotesCount = useMemo(() => {
    if (!activePoll || userId <= 0) return 0;
    return activePoll.voters_summary?.find((item) => item.user_id === userId)?.votes_count ?? 0;
  }, [activePoll, userId]);
  const remainingVotes = Math.max(0, (activePoll?.max_votes_per_user ?? 0) - myVotesCount);

  const currency = (budgetBoard?.currency || "EUR").toUpperCase();
  const budgetEnabled = Boolean(budgetBoard?.budget_enabled);
  const pendingRequests = budgetBoard?.pending_advance_requests?.length ?? 0;
  const totalToPay = useMemo(() => {
    return (budgetBoard?.children ?? []).reduce((sum, child) => {
      return sum + computePaymentBreakdown(child).remainingToPay;
    }, 0);
  }, [budgetBoard?.children]);
  const childBudget = budgetBoard?.children?.[0] ?? null;
  const childToReceive = childBudget ? computePaymentBreakdown(childBudget).remainingToPay : 0;

  const tasksSummary = dashboard?.tasks_summary;
  const tasksEnabled = Boolean(tasksSummary?.enabled);
  const tasksTodoCount = tasksSummary?.todo_count ?? 0;

  const calendarEnabled = Boolean(calendarSummary?.calendar_enabled);
  const calendarEventsCount = calendarSummary?.events?.length ?? 0;
  const calendarMealsCount = calendarSummary?.meal_plan?.length ?? 0;

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
        <TouchableOpacity onPress={() => router.replace("/(tabs)/home")} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Dashboard</Text>
          <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>Cliquer pour voir le détail</Text>
        </View>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}
          onPress={() => router.push("/dashboard/sondages")}
          activeOpacity={0.8}
        >
          <View style={[styles.cardAccent, { backgroundColor: theme.tint }]} />
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: `${theme.tint}15` }]}> 
              <MaterialCommunityIcons name="vote" size={26} color={theme.tint} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Sondages repas</Text>
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}> 
                Ouverts {pollsOpenCount} | Clôturés {pollsClosedCount} | Total {pollsTotalCount}
              </Text>
              {activePoll ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}> 
                  {isParent
                    ? `Participation ${activePollParticipants}/${membersCount || 0}`
                    : `Mes votes ${myVotesCount}/${activePoll.max_votes_per_user} | Restants ${remainingVotes}`}
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}
          onPress={() => router.push("/dashboard/budget")}
          activeOpacity={0.8}
        >
          <View style={[styles.cardAccent, { backgroundColor: "#4DABFF" }]} />
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: "rgba(77, 171, 255, 0.15)" }]}> 
              <MaterialCommunityIcons name="piggy-bank-outline" size={24} color="#4DABFF" />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Budget</Text>
              {budgetEnabled ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}> 
                  {isParent
                    ? `À payer ${formatMoney(totalToPay, currency)} | En attente ${pendingRequests}`
                    : `À recevoir ${formatMoney(childToReceive, currency)}`}
                </Text>
              ) : (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>Module budget désactivé</Text>
              )}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}
          onPress={() => router.push("/dashboard/tasks")}
          activeOpacity={0.8}
        >
          <View style={[styles.cardAccent, { backgroundColor: "#50BFA5" }]} />
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: "rgba(80, 191, 165, 0.15)" }]}> 
              <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={24} color="#50BFA5" />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tâches</Text>
              {tasksEnabled ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}> 
                  À faire {tasksTodoCount} | Réalisées {tasksSummary?.done_count ?? 0} | Validées {tasksSummary?.validated_count ?? 0}
                </Text>
              ) : (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>Module tâches désactivé</Text>
              )}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}
          onPress={() => router.push("/dashboard/calendar")}
          activeOpacity={0.8}
        >
          <View style={[styles.cardAccent, { backgroundColor: theme.accentWarm }]} />
          <View style={styles.cardContent}>
            <View style={[styles.iconContainer, { backgroundColor: `${theme.accentWarm}18` }]}> 
              <MaterialCommunityIcons name="calendar-month-outline" size={24} color={theme.accentWarm} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Calendrier</Text>
              {calendarEnabled ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}> 
                  Événements {calendarEventsCount} | Repas planifiés {calendarMealsCount}
                </Text>
              ) : (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>Module calendrier désactivé</Text>
              )}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </View>
        </TouchableOpacity>

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
    marginTop: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerSubtitle: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
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
  cardAccent: {
    width: 6,
    height: "100%",
  },
  cardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
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
