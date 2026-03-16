import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { addDays, toIsoDate } from "@/src/utils/date";

type TaskStatus = "à faire" | "réalisée" | "annulée";
type TaskModuleKey = "planned" | "schedule" | "routines";

type TaskModuleCard = {
  id: TaskModuleKey;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  enabled: boolean;
};

type BoardPayload = {
  tasks_enabled: boolean;
  can_manage_templates: boolean;
  can_manage_instances: boolean;
  current_user?: {
    id: number;
    role: "parent" | "enfant";
  };
  instances: {
    status: TaskStatus;
    validated_by_parent: boolean;
  }[];
};

export default function TasksTabScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [tasksEnabled, setTasksEnabled] = useState(false);
  const [canManageTemplates, setCanManageTemplates] = useState(false);
  const [canManageInstances, setCanManageInstances] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<"parent" | "enfant">("enfant");
  const [stats, setStats] = useState({ todo: 0, done: 0, validated: 0 });

  const rangeFrom = useMemo(() => toIsoDate(new Date()), []);
  const rangeTo = useMemo(() => toIsoDate(addDays(new Date(), 13)), []);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch(`/tasks/board?from=${rangeFrom}&to=${rangeTo}`) as BoardPayload;
      const instances = Array.isArray(payload?.instances) ? payload.instances : [];

      setTasksEnabled(Boolean(payload?.tasks_enabled));
      setCanManageTemplates(Boolean(payload?.can_manage_templates));
      setCanManageInstances(Boolean(payload?.can_manage_instances));
      setCurrentUserRole(payload?.current_user?.role === "parent" ? "parent" : "enfant");
      setStats({
        todo: instances.filter((instance) => instance.status === "à faire").length,
        done: instances.filter((instance) => instance.status === "réalisée").length,
        validated: instances.filter((instance) => instance.validated_by_parent).length,
      });
    } catch (error: any) {
      Alert.alert("Tâches", error?.message || "Impossible de charger les tâches.");
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard])
  );

  const menuOptions = useMemo<TaskModuleCard[]>(() => [
    {
      id: "planned",
      title: "Tâches planifiées",
      description: "Suivi des tâches prévues et de leurs statuts",
      icon: "calendar-check-outline",
      color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
      enabled: true,
    },
    {
      id: "schedule",
      title: "Planifier une tâche ponctuelle",
      description: "Créer une tâche ponctuelle et l'attribuer à un membre",
      icon: "calendar-plus",
      color: "#7ED321",
      enabled: canManageTemplates || canManageInstances,
    },
    {
      id: "routines",
      title: "Gérer les routines",
      description: "Créer et modifier des tâches réutilisables",
      icon: "playlist-edit",
      color: "#F5A623",
      enabled: canManageTemplates,
    },
  ], [canManageInstances, canManageTemplates, colorScheme, theme.tint]);

  const visibleOptions = useMemo(
    () => menuOptions.filter((option) => option.enabled),
    [menuOptions]
  );
  const canManageHouseholdConfig = currentUserRole === "parent";

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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tâches du foyer</Text>
          {canManageHouseholdConfig ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>Choisis un espace pour gérer les tâches</Text>
      </View>

      {!tasksEnabled ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Module désactivé</Text>
          <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
            Active le module tâches dans la configuration du foyer pour commencer.
          </Text>
          {canManageHouseholdConfig ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
            >
              <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.todo}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>À faire</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.done}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Réalisées</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.card }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.validated}</Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Validées</Text>
            </View>
          </View>

          <View style={styles.menuGrid}>
            {visibleOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.icon }]}
                onPress={() => router.push({ pathname: "/tasks/manage", params: { module: option.id } })}
                activeOpacity={0.8}
              >
                <View style={[styles.menuCardAccent, { backgroundColor: option.color }]} />
                <View style={styles.menuCardContent}>
                  <View style={[styles.iconContainer, { backgroundColor: `${option.color}15` }]}> 
                    <MaterialCommunityIcons name={option.icon} size={24} color={option.color} />
                  </View>
                  <View style={styles.textContainer}>
                    <Text style={[styles.menuTitle, { color: theme.text }]}>{option.title}</Text>
                    <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>{option.description}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 56,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginBottom: 4,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  menuGrid: {
    gap: 10,
  },
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
  menuCardAccent: {
    width: 6,
    height: "100%",
  },
  menuCardContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  emptyCard: {
    borderRadius: 14,
    padding: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  primaryBtn: {
    marginTop: 12,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
});
