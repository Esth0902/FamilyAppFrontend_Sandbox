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
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import { fetchTasksBoardForRange } from "@/src/services/tasksService";
import { addDays, toIsoDate } from "@/src/utils/date";

type TaskStatus = "à faire" | "réalisée" | "annulée";

type TaskInstance = {
  id: number;
  title: string;
  due_date: string;
  status: TaskStatus | string;
  validated_by_parent: boolean;
  assignee?: {
    id: number;
    name: string;
  };
  assignees?: {
    id: number;
    name: string;
  }[];
};

type TaskBoardResponse = {
  tasks_enabled: boolean;
  range?: {
    from: string;
    to: string;
  };
  current_user?: {
    id: number;
    role: "parent" | "enfant";
  };
  instances: TaskInstance[];
};

const isoWeekDayFromDate = (date: Date): number => {
  const day = date.getDay();
  return day === 0 ? 7 : day;
};

const weekRange = () => {
  const now = new Date();
  const weekStart = addDays(now, 1 - isoWeekDayFromDate(now));
  const weekEnd = addDays(weekStart, 6);

  return {
    from: toIsoDate(weekStart),
    to: toIsoDate(weekEnd),
  };
};

const isInstanceAssignedToUser = (instance: TaskInstance, userId: number): boolean => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return false;
  }

  if (Array.isArray(instance.assignees) && instance.assignees.length > 0) {
    return instance.assignees.some((assignee) => Number(assignee?.id ?? 0) === userId);
  }

  return Number(instance.assignee?.id ?? 0) === userId;
};

const isTodoStatus = (status: string): boolean => {
  const normalized = status.toLowerCase();
  return normalized.includes("faire");
};

const isDoneStatus = (status: string): boolean => {
  const normalized = status.toLowerCase();
  return normalized.includes("réalis") || normalized.includes("realis");
};

const statusLabel = (status: string): string => {
  if (isTodoStatus(status)) return "À faire";
  if (isDoneStatus(status)) return "Réalisée";
  return "Annulée";
};

const formatDueDate = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
};

export default function DashboardTasksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const range = useMemo(() => weekRange(), []);

  const tasksBoardQuery = useQuery({
    queryKey: queryKeys.dashboard.tasksBoard(householdId, range.from, range.to),
    enabled: householdId !== null,
    staleTime: 15_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchTasksBoardForRange<TaskBoardResponse>(range.from, range.to),
  });
  const refetchTasksBoard = tasksBoardQuery.refetch;
  const tasksBoardError = tasksBoardQuery.error;
  const isTasksBoardPending = tasksBoardQuery.isPending;
  const board = (tasksBoardQuery.data ?? null) as TaskBoardResponse | null;

  useFocusEffect(
    useCallback(() => {
      void refetchTasksBoard();
    }, [refetchTasksBoard])
  );

  useEffect(() => {
    if (!tasksBoardError) {
      return;
    }

    const error = tasksBoardError as { message?: string } | null;
    Alert.alert("Tâches", error?.message || "Impossible de charger la vue tâches.");
  }, [tasksBoardError]);

  useEffect(() => {
    if (!householdId) {
      return;
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "tasks") return;
        void refetchTasksBoard();
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, refetchTasksBoard]);

  const isParent = board?.current_user?.role === "parent";
  const currentUserId = Number(board?.current_user?.id ?? 0);
  const visibleInstances = useMemo(() => {
    const instances = Array.isArray(board?.instances) ? board.instances : [];
    if (isParent) {
      return instances;
    }
    return instances.filter((instance) => isInstanceAssignedToUser(instance, currentUserId));
  }, [board?.instances, currentUserId, isParent]);

  const todoCount = visibleInstances.filter((instance) => isTodoStatus(String(instance.status ?? ""))).length;
  const doneCount = visibleInstances.filter((instance) => isDoneStatus(String(instance.status ?? ""))).length;
  const validatedCount = visibleInstances.filter((instance) => Boolean(instance.validated_by_parent)).length;

  if (isTasksBoardPending && !board) {
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
        <Text style={[styles.headerTitle, { color: theme.text }]}>Détail tâches</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!board?.tasks_enabled ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
            <Text style={[styles.text, { color: theme.textSecondary }]}>Module tâches désactivé.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Résumé semaine</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>À faire: {todoCount}</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Réalisées: {doneCount}</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Validées: {validatedCount}</Text>
            </View>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}> 
              <Text style={[styles.title, { color: theme.text }]}>Tâches de la semaine</Text>
              {visibleInstances.length > 0 ? visibleInstances.map((instance) => {
                const assigneeNames = Array.isArray(instance.assignees) && instance.assignees.length > 0
                  ? instance.assignees.map((assignee) => assignee.name).join(", ")
                  : (instance.assignee?.name ?? "Membre");

                return (
                  <View key={`task-${instance.id}`} style={[styles.detailRow, { borderColor: `${theme.icon}55` }]}> 
                    <Text style={[styles.detailTitle, { color: theme.text }]}>{instance.title}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Échéance: {formatDueDate(instance.due_date)}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Statut: {statusLabel(String(instance.status ?? ""))}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Assigné à: {assigneeNames}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Validation parent: {instance.validated_by_parent ? "Oui" : "Non"}</Text>
                  </View>
                );
              }) : (
                <Text style={[styles.text, { color: theme.textSecondary }]}>Aucune tâche sur la période.</Text>
              )}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.tint }]}
          onPress={() => router.push("/(tabs)/tasks")}
        >
          <Text style={styles.primaryButtonText}>Ouvrir le module Tâches</Text>
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
