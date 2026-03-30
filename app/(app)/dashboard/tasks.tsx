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
import { Stack, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useTasksOverview } from "@/src/hooks/useTasksOverview";
import { useStoredUserState } from "@/src/session/user-cache";
import { isDoneStatus, isInstanceAssignedToUser, isTodoStatus, toPositiveInt } from "@/src/services/tasksService";

const BUTTON_TEXT_COLOR = "#FFFFFF";

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

  const {
    payload,
    tasksEnabled,
    currentUserRole,
    stats,
    isInitialLoading,
    error,
    refreshBoard,
  } = useTasksOverview({ householdId });

  const refreshTasksBoard = useCallback(async (_options?: { silent?: boolean }) => {
    await refreshBoard();
  }, [refreshBoard]);

  useRealtimeRefetch({
    householdId,
    module: "tasks",
    refresh: refreshTasksBoard,
  });

  useEffect(() => {
    if (!error) {
      return;
    }
    Alert.alert("Tâches", error.message || "Impossible de charger la vue tâches.");
  }, [error]);

  const currentUserId = toPositiveInt(payload?.current_user?.id);
  const visibleInstances = useMemo(() => {
    const instances = Array.isArray(payload?.instances) ? payload.instances : [];
    if (currentUserRole === "parent") {
      return instances;
    }
    if (currentUserId === null) {
      return [];
    }
    return instances.filter((instance) => isInstanceAssignedToUser(instance, currentUserId));
  }, [currentUserId, currentUserRole, payload?.instances]);
  const headerStyle = useMemo(
    () => [styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12) }],
    [insets.top, theme.icon]
  );
  const backButtonStyle = useMemo(() => [styles.backBtn, { borderColor: theme.icon }], [theme.icon]);
  const cardStyle = useMemo(
    () => [styles.card, { backgroundColor: theme.card, borderColor: theme.icon }],
    [theme.card, theme.icon]
  );
  const detailRowStyle = useMemo(() => [styles.detailRow, { borderColor: `${theme.icon}55` }], [theme.icon]);
  const onBackPress = useCallback(() => {
    router.replace("/dashboard");
  }, [router]);
  const onOpenTasksModule = useCallback(() => {
    router.push("/(app)/(tabs)/tasks");
  }, [router]);

  if (isInitialLoading && !payload) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}> 
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}> 
      <Stack.Screen options={{ headerShown: false }} />

      <View style={headerStyle}> 
        <TouchableOpacity onPress={onBackPress} style={backButtonStyle}> 
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Détail tâches</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!tasksEnabled ? (
          <View style={cardStyle}> 
            <Text style={[styles.text, { color: theme.textSecondary }]}>Module tâches désactivé.</Text>
          </View>
        ) : (
          <>
            <View style={cardStyle}> 
              <Text style={[styles.title, { color: theme.text }]}>Résumé semaine</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>À faire: {stats.todo}</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Réalisées: {stats.done}</Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>Validées: {stats.validated}</Text>
            </View>

            <View style={cardStyle}> 
              <Text style={[styles.title, { color: theme.text }]}>Tâches de la semaine</Text>
              {visibleInstances.length > 0 ? visibleInstances.map((instance) => {
                const assigneeNames = Array.isArray(instance.assignees) && instance.assignees.length > 0
                  ? instance.assignees.map((assignee) => assignee.name).join(", ")
                  : (instance.assignee?.name ?? "Membre");
                const taskId = Number.isInteger(instance.id) ? instance.id : `${instance.due_date}-${instance.title}`;
                const taskTitle = typeof instance.title === "string" && instance.title.trim().length > 0
                  ? instance.title
                  : "Tâche";
                const taskDueDate = typeof instance.due_date === "string" ? instance.due_date : "";

                return (
                  <View key={`task-${taskId}`} style={detailRowStyle}> 
                    <Text style={[styles.detailTitle, { color: theme.text }]}>{taskTitle}</Text>
                    <Text style={[styles.text, { color: theme.textSecondary }]}>Échéance: {formatDueDate(taskDueDate)}</Text>
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
          onPress={onOpenTasksModule}
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
  primaryButtonText: { color: BUTTON_TEXT_COLOR, fontWeight: "700", fontSize: 13 },
});
