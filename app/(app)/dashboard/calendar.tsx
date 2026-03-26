import React, { useCallback, useEffect, useMemo } from "react";
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
import { useQuery } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { queryKeys } from "@/src/query/query-keys";
import { addDays, toIsoDate } from "@/src/utils/date";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import { fetchCalendarBoardForRange } from "@/src/services/calendarService";

type CalendarEvent = {
  id: number;
  title: string;
  start_at: string;
  end_at: string;
  participation_overview?: {
    unanswered?: { id: number; name: string }[];
  } | null;
  my_participation?: {
    status: "participate" | "not_participate";
  } | null;
};

type MealPlanEntry = {
  id: number;
  date: string;
  meal_type: "matin" | "midi" | "soir";
  custom_title?: string | null;
  recipes?: { id: number; title: string; type?: string | null }[];
  presence_overview?: {
    unanswered?: { id: number; name: string }[];
  } | null;
  my_presence?: {
    status: "present" | "not_home" | "later";
  } | null;
};

type CalendarBoardResponse = {
  calendar_enabled: boolean;
  range?: {
    from: string;
    to: string;
  };
  events: CalendarEvent[];
  meal_plan: MealPlanEntry[];
};

const buildRange = () => {
  const today = new Date();
  return {
    from: toIsoDate(today),
    to: toIsoDate(addDays(today, 30)),
  };
};

const formatDate = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
};

const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const mealOrder = (mealType: string): number => {
  if (mealType === "matin") return 1;
  if (mealType === "midi") return 2;
  return 3;
};

const resolveMealTitle = (meal: MealPlanEntry): string => {
  const firstRecipeTitle = Array.isArray(meal.recipes)
    ? String(meal.recipes[0]?.title ?? "").trim()
    : "";
  if (firstRecipeTitle !== "") {
    return firstRecipeTitle;
  }

  const customTitle = String(meal.custom_title ?? "").trim();
  if (customTitle !== "") {
    return customTitle;
  }

  return "Repas à définir";
};

export default function DashboardCalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId, role } = useStoredUserState();
  const range = useMemo(() => buildRange(), []);

  const calendarBoardQuery = useQuery({
    queryKey: queryKeys.dashboard.calendarBoard(householdId, range.from, range.to),
    enabled: householdId !== null,
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchCalendarBoardForRange<CalendarBoardResponse>(range.from, range.to),
  });

  useFocusEffect(
    useCallback(() => {
      void calendarBoardQuery.refetch();
    }, [calendarBoardQuery.refetch])
  );

  useEffect(() => {
    if (!calendarBoardQuery.error) {
      return;
    }
    const error = calendarBoardQuery.error as { message?: string } | null;
    Alert.alert("Calendrier", error?.message || "Impossible de charger la vue calendrier.");
  }, [calendarBoardQuery.error]);

  useEffect(() => {
    if (!householdId) {
      return;
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "calendar") return;
        void calendarBoardQuery.refetch();
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [calendarBoardQuery.refetch, householdId]);

  const board = (calendarBoardQuery.data ?? null) as CalendarBoardResponse | null;

  const isParent = role === "parent";
  const events = useMemo(() => {
    return Array.isArray(board?.events) ? board.events : [];
  }, [board?.events]);

  const meals = useMemo(() => {
    return Array.isArray(board?.meal_plan) ? board.meal_plan : [];
  }, [board?.meal_plan]);

  const unansweredEvents = events.reduce((sum, event) => {
    return sum + (event.participation_overview?.unanswered?.length ?? 0);
  }, 0);

  const unansweredMeals = meals.reduce((sum, meal) => {
    return sum + (meal.presence_overview?.unanswered?.length ?? 0);
  }, 0);

  const childMissingEventResponses = events.filter((event) => !event.my_participation).length;
  const childMissingMealResponses = meals.filter((meal) => !meal.my_presence).length;

  const upcomingEvents = useMemo(() => {
    return [...events]
      .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())
      .slice(0, 8);
  }, [events]);

  const upcomingMeals = useMemo(() => {
    return [...meals]
      .sort((left, right) => {
        const byDate = left.date.localeCompare(right.date);
        if (byDate !== 0) return byDate;
        return mealOrder(left.meal_type) - mealOrder(right.meal_type);
      })
      .slice(0, 8);
  }, [meals]);
  const compactCardBackground = colorScheme === "dark" ? `${theme.icon}22` : theme.background;

  if (calendarBoardQuery.isPending && !board) {
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Détail calendrier</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!board?.calendar_enabled ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
            <Text style={[styles.text, { color: theme.textSecondary }]}>Module calendrier désactivé.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Résumé 30 jours</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Événements: {events.length}</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Repas planifiés: {meals.length}</Text>
              {isParent ? (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Réponses manquantes événements: {unansweredEvents}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Réponses manquantes repas: {unansweredMeals}</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Mes réponses manquantes événements: {childMissingEventResponses}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Mes réponses manquantes repas: {childMissingMealResponses}</Text>
                </>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Prochains événements</Text>
              {upcomingEvents.length > 0 ? upcomingEvents.map((event) => (
                <View
                  key={`event-${event.id}`}
                  style={[styles.detailRow, { borderColor: `${theme.icon}55`, backgroundColor: compactCardBackground }]}
                > 
                  <Text style={[styles.detailTitle, { color: theme.text }]}>{event.title}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Début: {formatDateTime(event.start_at)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Fin: {formatDateTime(event.end_at)}</Text>
                  {isParent ? (
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Sans réponse: {event.participation_overview?.unanswered?.length ?? 0}</Text>
                  ) : (
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Ma réponse: {event.my_participation?.status ? "Donnée" : "À faire"}</Text>
                  )}
                </View>
              )) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucun événement à venir.</Text>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Prochains repas</Text>
              {upcomingMeals.length > 0 ? upcomingMeals.map((meal) => (
                <View
                  key={`meal-${meal.id}`}
                  style={[styles.detailRow, { borderColor: `${theme.icon}55`, backgroundColor: compactCardBackground }]}
                > 
                  <Text style={[styles.detailTitle, { color: theme.text }]}>
                    {resolveMealTitle(meal)}
                  </Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Date: {formatDate(meal.date)}</Text>
                  <Text style={[styles.text, { color: theme.textSecondary }]}>Sans réponse: {meal.presence_overview?.unanswered?.length ?? 0}</Text>
                </View>
              )) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucun repas planifié.</Text>
              )}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={() => router.push("/(tabs)/calendar")}
        >
          <Text style={styles.primaryButtonText}>Ouvrir le module Calendrier</Text>
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
  primaryButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
});
