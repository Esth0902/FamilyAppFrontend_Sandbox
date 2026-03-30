import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SectionList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getApiErrorMessage } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useTasksBoard, type TaskInstance } from "@/src/features/tasks/hooks/useTasksBoard";
import { tasksManageStyles as styles } from "@/src/features/tasks/tasks-manage.styles";
import {
  STATUS_CANCELLED,
  STATUS_DONE,
  STATUS_TODO,
  formatDateLabel,
  isTaskInstanceAssignedToUser,
  recurrenceLabel,
  weekLabelFromStart,
  weekStartFromDateWithIsoDay,
} from "@/src/features/tasks/tasks-manage.utils";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  requestTaskInstanceReassignment,
  updateTaskInstance,
  validateTaskInstance,
} from "@/src/services/tasksService";
import { addDays, toIsoDate } from "@/src/utils/date";

export default function PlannedTasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const [weekStart, setWeekStart] = useState(() => new Date());
  const hasFocusedOnceRef = useRef(false);

  const {
    loading,
    error,
    refreshBoard,
    invalidateTaskCaches,
    tasksEnabled,
    members,
    instances,
    currentUserId,
    currentUserRole,
    plannedWeekStartDay,
    boardWeekStart,
  } = useTasksBoard({
    householdId,
    weekAnchor: weekStart,
    rangeMode: "planned",
  });

  const [localInstances, setLocalInstances] = useState<TaskInstance[]>(instances);
  useEffect(() => {
    setLocalInstances(instances);
  }, [instances]);

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
    if (!error) {
      return;
    }
    Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de charger les tâches."));
  }, [error]);

  const goToPreviousWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, -7));
  }, []);
  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => addDays(prev, 7));
  }, []);
  const goToCurrentWeek = useCallback(() => {
    setWeekStart(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay));
  }, [plannedWeekStartDay]);

  const activeWeekLabel = useMemo(() => weekLabelFromStart(boardWeekStart), [boardWeekStart]);
  const isCurrentWeek = useMemo(
    () => toIsoDate(boardWeekStart) === toIsoDate(weekStartFromDateWithIsoDay(new Date(), plannedWeekStartDay)),
    [boardWeekStart, plannedWeekStartDay]
  );

  const updateInstanceStatusMutation = useMutation({
    mutationFn: async (payload: { instanceId: number; status: string }) => {
      await updateTaskInstance(payload.instanceId, { status: payload.status });
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const validateInstanceMutation = useMutation({
    mutationFn: async (instanceId: number) => {
      await validateTaskInstance(instanceId);
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const reassignmentRequestMutation = useMutation({
    mutationFn: async (payload: { instanceId: number; invitedUserId: number }) => {
      await requestTaskInstanceReassignment(payload);
    },
    onSuccess: () => {
      invalidateTaskCaches();
    },
  });

  const saving = updateInstanceStatusMutation.isPending
    || validateInstanceMutation.isPending
    || reassignmentRequestMutation.isPending;

  const withOptimisticInstanceUpdate = useCallback(
    (instanceId: number, updater: (instance: TaskInstance) => TaskInstance) => {
      let rollbackSnapshot: TaskInstance[] | null = null;
      setLocalInstances((prev) => {
        rollbackSnapshot = prev;
        return prev.map((instance) => (
          instance.id === instanceId ? updater(instance) : instance
        ));
      });

      return () => {
        if (rollbackSnapshot) {
          setLocalInstances(rollbackSnapshot);
          return;
        }
        invalidateTaskCaches();
      };
    },
    [invalidateTaskCaches]
  );

  const toggleInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_toggle) {
      return;
    }

    const nextStatus = instance.status === STATUS_DONE ? STATUS_TODO : STATUS_DONE;
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      status: nextStatus,
      completed_at: nextStatus === STATUS_DONE ? new Date().toISOString() : null,
      validated_by_parent: nextStatus === STATUS_TODO ? false : current.validated_by_parent,
    }));

    try {
      await updateInstanceStatusMutation.mutateAsync({
        instanceId: instance.id,
        status: nextStatus,
      });
    } catch (mutationError: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de mettre à jour le statut."));
    }
  };

  const toggleCancelled = async (instance: TaskInstance) => {
    if (!instance.permissions.can_cancel) {
      return;
    }

    const nextStatus = instance.status === STATUS_CANCELLED ? STATUS_TODO : STATUS_CANCELLED;
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      status: nextStatus,
      completed_at: nextStatus === STATUS_CANCELLED ? null : current.completed_at,
      validated_by_parent: nextStatus === STATUS_CANCELLED ? false : current.validated_by_parent,
    }));

    try {
      await updateInstanceStatusMutation.mutateAsync({
        instanceId: instance.id,
        status: nextStatus,
      });
    } catch (mutationError: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de modifier cette tâche."));
    }
  };

  const validateInstance = async (instance: TaskInstance) => {
    if (!instance.permissions.can_validate || instance.validated_by_parent) {
      return;
    }
    const rollback = withOptimisticInstanceUpdate(instance.id, (current) => ({
      ...current,
      validated_by_parent: true,
    }));

    try {
      await validateInstanceMutation.mutateAsync(instance.id);
    } catch (mutationError: any) {
      rollback();
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de valider cette tâche."));
    }
  };

  const sendReassignmentRequest = async (instance: TaskInstance, invitedUserId: number) => {
    try {
      await reassignmentRequestMutation.mutateAsync({
        instanceId: instance.id,
        invitedUserId,
      });
      Alert.alert("Tâches", "Demande envoyée.");
      await refreshBoard();
    } catch (mutationError: any) {
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible d'envoyer la demande."));
    }
  };

  const requestInstanceReassignment = (instance: TaskInstance) => {
    if (currentUserId === null) {
      return;
    }

    const assigneeIds = Array.isArray(instance.assignees) && instance.assignees.length > 0
      ? instance.assignees.map((assignee) => Number(assignee.id))
      : [Number(instance.assignee.id)];
    if (!assigneeIds.includes(currentUserId)) {
      return;
    }

    const availableMembers = members.filter((member) => !assigneeIds.includes(member.id));
    if (availableMembers.length === 0) {
      Alert.alert("Tâches", "Aucun autre membre disponible pour une reprise.");
      return;
    }

    const options = availableMembers.slice(0, 6).map((member) => ({
      text: member.name,
      onPress: () => {
        void sendReassignmentRequest(instance, member.id);
      },
    }));

    Alert.alert(
      "Demander une reprise",
      "Qui peut reprendre cette tâche ?",
      [
        ...options,
        { text: "Annuler", style: "cancel" },
      ],
    );
  };

  const visibleInstances = useMemo(() => {
    if (currentUserRole === "parent") {
      return localInstances;
    }

    if (currentUserId === null) {
      return [];
    }

    return localInstances.filter((instance) => isTaskInstanceAssignedToUser(instance, currentUserId));
  }, [currentUserId, currentUserRole, localInstances]);

  const groupedInstances = useMemo(() => {
    const buckets: Record<string, TaskInstance[]> = {};
    const sorted = [...visibleInstances].sort((left, right) => {
      if (left.due_date !== right.due_date) {
        return left.due_date.localeCompare(right.due_date);
      }
      if (left.status !== right.status) {
        const order = [STATUS_TODO, STATUS_DONE, STATUS_CANCELLED];
        return order.indexOf(left.status) - order.indexOf(right.status);
      }
      return left.title.localeCompare(right.title);
    });

    sorted.forEach((instance) => {
      if (!buckets[instance.due_date]) {
        buckets[instance.due_date] = [];
      }
      buckets[instance.due_date].push(instance);
    });

    return Object.entries(buckets);
  }, [visibleInstances]);

  const groupedInstanceSections = useMemo(
    () =>
      groupedInstances.map(([date, dayInstances]) => ({
        title: date,
        data: dayInstances,
      })),
    [groupedInstances]
  );

  const renderGroupedInstanceHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <Text style={[styles.dateTitle, { color: theme.textSecondary }]}>{formatDateLabel(section.title)}</Text>
    ),
    [theme.textSecondary]
  );

  const renderGroupedInstanceItem = useCallback(
    ({ item: instance }: { item: TaskInstance }) => (
      <View style={[styles.instanceCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
        <View style={styles.instanceHeaderRow}>
          <Text numberOfLines={1} style={[styles.instanceTitle, { color: theme.text }]}>{instance.title}</Text>
          <View style={[
            styles.statusBadge,
            instance.status === STATUS_TODO && { backgroundColor: "#F5A62322" },
            instance.status === STATUS_DONE && { backgroundColor: "#2ECC7126" },
            instance.status === STATUS_CANCELLED && { backgroundColor: "#CC4B4B22" },
          ]}>
            <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{instance.status}</Text>
          </View>
        </View>

        <Text style={[styles.instanceMeta, { color: theme.textSecondary }]}>
          {(Array.isArray(instance.assignees) && instance.assignees.length > 0
            ? instance.assignees.map((assignee) => assignee.name).join(", ")
            : instance.assignee.name)}
          {instance.template.recurrence !== "once" ? ` - ${recurrenceLabel(instance.template.recurrence)}` : ""}
        </Text>
        {instance.description ? (
          <Text style={[styles.instanceDescription, { color: theme.textSecondary }]}>{instance.description}</Text>
        ) : null}

        <View style={styles.instanceActionsRow}>
          <TouchableOpacity
            onPress={() => void toggleInstance(instance)}
            disabled={!instance.permissions.can_toggle || saving}
            style={[styles.instanceActionBtn, { borderColor: theme.icon, opacity: instance.permissions.can_toggle ? 1 : 0.4 }]}
          >
            <MaterialCommunityIcons
              name={instance.status === STATUS_DONE ? "checkbox-marked-outline" : "checkbox-blank-outline"}
              size={18}
              color={theme.tint}
            />
          </TouchableOpacity>

          {(currentUserId !== null
            && (
              (Array.isArray(instance.assignees) && instance.assignees.some((assignee) => Number(assignee.id) === currentUserId))
              || (!Array.isArray(instance.assignees) && Number(instance.assignee.id) === currentUserId)
            )
            && members.some((member) => {
              if (Array.isArray(instance.assignees) && instance.assignees.length > 0) {
                return !instance.assignees.some((assignee) => Number(assignee.id) === Number(member.id));
              }
              return Number(member.id) !== Number(instance.assignee.id);
            })) ? (
            <TouchableOpacity
              onPress={() => requestInstanceReassignment(instance)}
              disabled={saving}
              style={[styles.instanceActionBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="account-switch-outline" size={18} color={theme.tint} />
            </TouchableOpacity>
          ) : null}

          {instance.permissions.can_validate ? (
            <TouchableOpacity
              onPress={() => void validateInstance(instance)}
              disabled={instance.validated_by_parent || saving}
              style={[styles.instanceActionBtn, { borderColor: theme.icon, opacity: instance.validated_by_parent ? 0.4 : 1 }]}
            >
              <MaterialCommunityIcons
                name={instance.validated_by_parent ? "check-decagram" : "check-decagram-outline"}
                size={18}
                color={instance.validated_by_parent ? "#2ECC71" : theme.tint}
              />
            </TouchableOpacity>
          ) : null}

          {instance.permissions.can_cancel ? (
            <TouchableOpacity
              onPress={() => void toggleCancelled(instance)}
              disabled={saving}
              style={[styles.instanceActionBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons
                name={instance.status === STATUS_CANCELLED ? "restore" : "cancel"}
                size={18}
                color={instance.status === STATUS_CANCELLED ? theme.tint : "#CC4B4B"}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    ),
    [currentUserId, members, saving, theme.background, theme.icon, theme.text, theme.textSecondary, theme.tint]
  );

  if (loading && localInstances.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Tâches planifiées"
          subtitle="Suivi des tâches prévues et de leurs statuts."
          withBackButton
          backHref="/(app)/(tabs)/tasks"
          showBorder
          safeTop
          bottomSpacing={14}
          containerStyle={{ paddingHorizontal: 0 }}
          contentStyle={{ minHeight: 0 }}
          rightSlot={currentUserRole === "parent" ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        />
      </View>

      {!tasksEnabled ? (
        <View style={styles.content}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Active le module tâches dans la configuration du foyer pour commencer.
            </Text>
            {currentUserRole === "parent" ? (
              <TouchableOpacity
                onPress={() => router.push("/householdSetup?mode=edit&scope=tasks")}
                style={[styles.primaryBtn, { backgroundColor: theme.tint }]}
              >
                <Text style={styles.primaryBtnText}>Configurer le foyer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : (
        <SectionList
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, { gap: 0 }]}
          sections={groupedInstanceSections}
          keyExtractor={(instance) => `instance-${instance.id}`}
          renderSectionHeader={renderGroupedInstanceHeader}
          renderItem={renderGroupedInstanceItem}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={(
            <View style={[styles.weekCard, { backgroundColor: theme.card, borderColor: theme.icon, marginBottom: 10 }]}>
              <View style={styles.weekRow}>
                <TouchableOpacity
                  onPress={goToPreviousWeek}
                  style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color={theme.tint} />
                </TouchableOpacity>

                <View style={styles.weekCenter}>
                  <Text style={[styles.weekTitle, { color: theme.text }]}>{activeWeekLabel}</Text>
                </View>

                <TouchableOpacity
                  onPress={goToNextWeek}
                  style={[styles.weekArrowBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
                >
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.tint} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={goToCurrentWeek}
                disabled={isCurrentWeek}
                style={[
                  styles.weekCurrentBtn,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  isCurrentWeek && { opacity: 0.55 },
                ]}
              >
                <Text style={[styles.weekCurrentBtnText, { color: isCurrentWeek ? theme.textSecondary : theme.tint }]}>
                  Revenir à cette semaine
                </Text>
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={(
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Tâches planifiées</Text>
              <Text style={{ color: theme.textSecondary }}>Aucune tâche sur cette semaine.</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 5 }} />}
          SectionSeparatorComponent={() => <View style={{ height: 7 }} />}
        />
      )}
    </View>
  );
}
