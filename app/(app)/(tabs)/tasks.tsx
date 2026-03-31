import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useTasksOverview } from "@/src/hooks/useTasksOverview";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import { AppButton } from "@/src/components/ui/AppButton";
import { AppCard } from "@/src/components/ui/AppCard";
import { Chip } from "@/src/components/ui/Chip";
import { EmptyState } from "@/src/components/ui/EmptyState";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";

type TaskModuleKey = "planned" | "schedule" | "routines";

type TaskModuleCard = {
  id: TaskModuleKey;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  enabled: boolean;
};

export default function TasksTabScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const {
    tasksEnabled,
    canManageTemplates,
    canManageInstances,
    currentUserRole,
    stats,
    isInitialLoading,
    error,
    refreshBoard,
  } = useTasksOverview({ householdId });
  const hasFocusedOnceRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      void refreshBoard();
    }, [refreshBoard])
  );

  useEffect(() => {
    if (!error) return;
    Alert.alert("Tâches", error.message || "Impossible de charger les tâches.");
  }, [error]);

  useEffect(() => {
    if (!householdId) return;

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "tasks") return;
        void refreshBoard();
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [householdId, refreshBoard]);

  const menuOptions = useMemo<TaskModuleCard[]>(
    () => [
      {
        id: "planned",
        title: "Tâches planifiées",
        description: "Suivi des tâches prévues et de leur statut",
        icon: "calendar-check-outline",
        color: colorScheme === "dark" ? "#4DABFF" : theme.tint,
        enabled: true,
      },
      {
        id: "schedule",
        title: "Planifier une tâche ponctuelle",
        description: "Créer une tâche ponctuelle et l'attribuer à un membre du foyer",
        icon: "calendar-plus",
        color: theme.accentCool,
        enabled: canManageTemplates || canManageInstances,
      },
      {
        id: "routines",
        title: "Gérer les routines",
        description: "Créer et modifier des tâches réutilisables",
        icon: "playlist-edit",
        color: theme.accentWarm,
        enabled: canManageTemplates,
      },
    ],
    [
      canManageInstances,
      canManageTemplates,
      colorScheme,
      theme.accentCool,
      theme.accentWarm,
      theme.tint,
    ]
  );

  const visibleOptions = useMemo(() => menuOptions.filter((option) => option.enabled), [menuOptions]);
  const routeByModule = useMemo(() => ({
    planned: "/tasks/planned",
    schedule: "/tasks/schedule",
    routines: "/tasks/routines",
  } as const), []);
  const canManageHouseholdConfig = currentUserRole === "parent";
  const cardThemeStyle = useMemo(
    () => ({ backgroundColor: theme.card, borderColor: theme.icon }),
    [theme.card, theme.icon]
  );
  const statCardStyle = useMemo(() => ({ backgroundColor: theme.card }), [theme.card]);

  if (isInitialLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <ScreenHeader
        title="Tâches du foyer"
        subtitle="Gère les tâches assignées aux membres du foyer."
        rightSlot={
          canManageHouseholdConfig ? (
            <AppButton
              variant="secondary"
              style={styles.settingsBtn}
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </AppButton>
          ) : null
        }
        containerStyle={styles.headerContainer}
        contentStyle={styles.headerContent}
      />

      {error ? (
        <EmptyState
          icon="cloud-alert-outline"
          title="Impossible de charger les tâches"
          message={error.message || "Vérifie ta connexion puis réessaie."}
          actionLabel="Réessayer"
          onActionPress={() => {
            void refreshBoard();
          }}
        />
      ) : !tasksEnabled ? (
        <EmptyState
          icon="checkbox-marked-circle-outline"
          title="Module désactivé"
          message="Active le module tâches dans la configuration du foyer pour commencer."
          actionLabel={canManageHouseholdConfig ? "Configurer le foyer" : undefined}
          onActionPress={canManageHouseholdConfig ? () => router.push("/householdSetup?mode=edit&scope=tasks") : undefined}
        />
      ) : (
        <>
          <View style={styles.statsRow}>
            <AppCard pressable={false} style={[styles.statCard, statCardStyle]} contentStyle={styles.statCardContent}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.todo}</Text>
              <Chip label="À faire" tone="warning" />
            </AppCard>
            <AppCard pressable={false} style={[styles.statCard, statCardStyle]} contentStyle={styles.statCardContent}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.done}</Text>
              <Chip label="Réalisées" tone="neutral"  />
            </AppCard>
            <AppCard pressable={false} style={[styles.statCard, statCardStyle]} contentStyle={styles.statCardContent}>
              <Text style={[styles.statValue, { color: theme.text }]}>{stats.validated}</Text>
              <Chip label="Validées" tone="info"  />
            </AppCard>
          </View>

          <View style={styles.menuGrid}>
            {visibleOptions.map((option) => (
              <AppCard
                key={option.id}
                style={[styles.menuCard, cardThemeStyle]}
                accentColor={option.color}
                onPress={() => router.push(routeByModule[option.id] as any)}
                activeOpacity={0.8}
              >
                <View style={[styles.iconContainer, { backgroundColor: `${option.color}15` }]}>
                  <MaterialCommunityIcons name={option.icon} size={24} color={option.color} />
                </View>
                <View style={styles.textContainer}>
                  <Text style={[styles.menuTitle, { color: theme.text }]}>{option.title}</Text>
                  <Text style={[styles.menuDescription, { color: theme.textSecondary }]}>{option.description}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
              </AppCard>
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
  headerContainer: { paddingHorizontal: 0, paddingBottom: 0 },
  headerContent: { minHeight: 0 },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    minHeight: 80,
  },
  statCardContent: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  menuGrid: {
    gap: 10,
  },
  menuCard: {
    minHeight: 88,
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
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});

