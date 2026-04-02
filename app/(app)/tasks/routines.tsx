import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getApiErrorMessage } from "@/src/api/client";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { RoutineFormCard } from "@/src/features/tasks/components/RoutineFormCard";
import { RoutinesListCard } from "@/src/features/tasks/components/RoutinesListCard";
import { useRoutineForm } from "@/src/features/tasks/hooks/useRoutineForm";
import { useTasksBoard, type TaskTemplate } from "@/src/features/tasks/hooks/useTasksBoard";
import { tasksManageStyles as styles } from "@/src/features/tasks/tasks-manage.styles";
import { useStoredUserState } from "@/src/session/user-cache";
import { createTaskTemplate, deleteTaskTemplate, updateTaskTemplate } from "@/src/services/tasksService";

export default function RoutinesTasksScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const hasFocusedOnceRef = useRef(false);
  const [routinesListExpanded, setRoutinesListExpanded] = useState(true);
  const [routineFormExpanded, setRoutineFormExpanded] = useState(true);

  const {
    loading,
    error,
    refreshBoard,
    invalidateTaskCaches,
    tasksEnabled,
    canManageTemplates,
    members,
    templates,
    currentUserRole,
    plannedWeekStartDay,
  } = useTasksBoard({
    householdId,
    weekAnchor: new Date(),
    rangeMode: "standard",
  });

  useFocusEffect(useCallback(() => {
    if (!hasFocusedOnceRef.current) {
      hasFocusedOnceRef.current = true;
      return;
    }
    void refreshBoard();
  }, [refreshBoard]));

  useEffect(() => {
    if (!error) {
      return;
    }
    Alert.alert("Tâches", getApiErrorMessage(error, "Impossible de charger les tâches."));
  }, [error]);

  const {
    buildTemplatePayload,
    editingTemplateId,
    interHouseholdWeekLabel,
    interHouseholdWeekStartIso,
    resetTemplateForm,
    setTemplateDescription,
    setTemplateHasEndDate,
    setTemplateEndDate,
    setTemplateEndDateWheelVisible,
    setTemplateInterHouseholdAlternating,
    setTemplateInterHouseholdWeekStart,
    setTemplateInterHouseholdWeekStartWheelVisible,
    setTemplateName,
    setTemplateRecurrence,
    setTemplateRecurrenceDays,
    setTemplateRotation,
    setTemplateRotationCycleWeeks,
    setTemplateRotationUserIds,
    setTemplateAssigneeUserIds,
    setTemplateStartDate,
    setTemplateStartDateWheelVisible,
    startEditTemplate,
    templateDescription,
    templateHasEndDate,
    templateEndDate,
    templateEndDateWheelVisible,
    templateInterHouseholdAlternating,
    templateInterHouseholdWeekStart,
    templateInterHouseholdWeekStartWheelVisible,
    templateName,
    templateRecurrence,
    templateRecurrenceDays,
    templateRotation,
    templateRotationCycleWeeks,
    templateRotationUserIds,
    templateAssigneeUserIds,
    templateStartDate,
    templateStartDateWheelVisible,
  } = useRoutineForm({ plannedWeekStartDay });

  const routinesTemplates = useMemo(() => templates.filter((template) => template.recurrence !== "once"), [templates]);
  const memberNameById = useMemo(() => new Map(members.map((member) => [member.id, member.name])), [members]);

  const upsertTemplateMutation = useMutation({
    mutationFn: async (input: { templateId: number | null; payload: Record<string, unknown> }) => {
      if (input.templateId) {
        await updateTaskTemplate(input.templateId, input.payload);
      } else {
        await createTaskTemplate(input.payload);
      }
    },
    onSuccess: () => invalidateTaskCaches(),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await deleteTaskTemplate(templateId);
    },
    onSuccess: () => invalidateTaskCaches(),
  });

  const saving = upsertTemplateMutation.isPending || deleteTemplateMutation.isPending;

  const toggleRecurrenceDay = useCallback((day: number) => {
    setTemplateRecurrenceDays((prev) => {
      if (prev.includes(day)) {
        return prev.filter((value) => value !== day);
      }
      return [...prev, day].sort((a, b) => a - b);
    });
  }, [setTemplateRecurrenceDays]);

  const toggleHasEndDate = useCallback(() => {
    if (templateHasEndDate) {
      setTemplateHasEndDate(false);
      setTemplateEndDateWheelVisible(false);
      return;
    }
    setTemplateHasEndDate(true);
    setTemplateEndDate((prev) => (prev < templateStartDate ? templateStartDate : prev));
  }, [
    setTemplateEndDate,
    setTemplateEndDateWheelVisible,
    setTemplateHasEndDate,
    templateHasEndDate,
    templateStartDate,
  ]);

  const toggleAssignee = useCallback((memberId: number) => {
    setTemplateAssigneeUserIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, [setTemplateAssigneeUserIds]);

  const toggleRotationMember = useCallback((memberId: number) => {
    setTemplateRotationUserIds((prev) => {
      if (prev.includes(memberId)) {
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  }, [setTemplateRotationUserIds]);

  const moveRotationMember = useCallback((memberId: number, direction: "up" | "down") => {
    setTemplateRotationUserIds((prev) => {
      const index = prev.indexOf(memberId);
      if (index < 0) {
        return prev;
      }
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  }, [setTemplateRotationUserIds]);

  const toggleRotation = useCallback(() => {
    if (templateRotation) {
      setTemplateRotation(false);
      if (templateAssigneeUserIds.length === 0 && templateRotationUserIds.length > 0) {
        setTemplateAssigneeUserIds(templateRotationUserIds);
      }
      return;
    }
    setTemplateRotation(true);
    if (templateRotationUserIds.length > 0) {
      return;
    }
    if (templateAssigneeUserIds.length > 0) {
      setTemplateRotationUserIds(templateAssigneeUserIds);
      return;
    }
    if (members.length > 0) {
      setTemplateRotationUserIds([members[0].id]);
    }
  }, [
    members,
    setTemplateAssigneeUserIds,
    setTemplateRotation,
    setTemplateRotationUserIds,
    templateAssigneeUserIds,
    templateRotation,
    templateRotationUserIds,
  ]);

  const toggleInterHouseholdAlternating = useCallback(() => {
    if (templateInterHouseholdAlternating) {
      setTemplateInterHouseholdAlternating(false);
      setTemplateInterHouseholdWeekStartWheelVisible(false);
      return;
    }
    setTemplateInterHouseholdAlternating(true);
  }, [
    setTemplateInterHouseholdAlternating,
    setTemplateInterHouseholdWeekStartWheelVisible,
    templateInterHouseholdAlternating,
  ]);

  useEffect(() => {
    if (editingTemplateId !== null) {
      setRoutineFormExpanded(true);
    }
  }, [editingTemplateId]);

  const handleStartEditTemplate = useCallback((template: TaskTemplate) => {
    setRoutineFormExpanded(true);
    startEditTemplate(template);
  }, [startEditTemplate]);

  const saveTemplate = async () => {
    const built = buildTemplatePayload();
    if (!built.payload || built.error) {
      Alert.alert("Tâches", built.error ?? "Impossible de sauvegarder cette routine.");
      return;
    }

    try {
      await upsertTemplateMutation.mutateAsync({
        templateId: editingTemplateId,
        payload: built.payload,
      });
      resetTemplateForm();
      await refreshBoard();
    } catch (mutationError: any) {
      Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de sauvegarder cette routine."));
    }
  };

  const deleteTemplate = (template: TaskTemplate) => Alert.alert("Supprimer la routine", `Supprimer "${template.name}" ?`, [
    { text: "Annuler", style: "cancel" },
    {
      text: "Supprimer",
      style: "destructive",
      onPress: async () => {
        try {
          await deleteTemplateMutation.mutateAsync(template.id);
          if (editingTemplateId === template.id) {
            resetTemplateForm();
          }
          await refreshBoard();
        } catch (mutationError: any) {
          Alert.alert("Tâches", getApiErrorMessage(mutationError, "Impossible de supprimer cette routine."));
        }
      },
    },
  ]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={{ backgroundColor: theme.background, paddingHorizontal: 16 }}>
        <ScreenHeader
          title="Gérer les routines"
          subtitle="Crée et modifie les routines réutilisables du foyer."
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

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.content}
      >
        {!tasksEnabled ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Active le module tâches dans la configuration du foyer pour commencer.
            </Text>
          </View>
        ) : !canManageTemplates ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Gérer les routines</Text>
            <Text style={{ color: theme.textSecondary, lineHeight: 20 }}>
              Cette section est réservée aux parents du foyer.
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <TouchableOpacity
                onPress={() => setRoutinesListExpanded((prev) => !prev)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                activeOpacity={0.8}
              >
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>Gérer les routines</Text>
                <MaterialCommunityIcons
                  name={routinesListExpanded ? "chevron-down" : "chevron-right"}
                  size={22}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
              {routinesListExpanded ? (
                <View style={{ marginTop: 10 }}>
                  <RoutinesListCard
                    theme={theme}
                    templates={routinesTemplates}
                    memberNameById={memberNameById}
                    saving={saving}
                    onEdit={handleStartEditTemplate}
                    onDelete={deleteTemplate}
                  />
                </View>
              ) : null}
            </View>

            <View style={[styles.card, { backgroundColor: theme.card }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 0 }]}>
                  {editingTemplateId ? "Modifier la routine" : "Nouvelle routine"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {editingTemplateId !== null ? (
                    <TouchableOpacity
                      onPress={() => resetTemplateForm()}
                      style={[styles.templateIconBtn, { borderColor: theme.icon }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => setRoutineFormExpanded((prev) => !prev)}
                    style={[styles.templateIconBtn, { borderColor: theme.icon }]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={routineFormExpanded ? "chevron-down" : "chevron-right"}
                      size={18}
                      color={theme.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              </View>
              {routineFormExpanded ? (
                <View style={{ marginTop: 10 }}>
                  <RoutineFormCard
                    theme={theme}
                    saving={saving}
                    editingTemplateId={editingTemplateId}
                    members={members}
                    templateName={templateName}
                    templateDescription={templateDescription}
                    templateRecurrence={templateRecurrence}
                    templateRecurrenceDays={templateRecurrenceDays}
                    templateHasEndDate={templateHasEndDate}
                    templateStartDate={templateStartDate}
                    templateEndDate={templateEndDate}
                    templateStartDateWheelVisible={templateStartDateWheelVisible}
                    templateEndDateWheelVisible={templateEndDateWheelVisible}
                    templateEndMinDate={templateStartDate}
                    templateRotation={templateRotation}
                    templateRotationCycleWeeks={templateRotationCycleWeeks}
                    templateAssigneeUserIds={templateAssigneeUserIds}
                    templateRotationUserIds={templateRotationUserIds}
                    templateInterHouseholdAlternating={templateInterHouseholdAlternating}
                    templateInterHouseholdWeekStart={templateInterHouseholdWeekStart}
                    templateInterHouseholdWeekStartWheelVisible={templateInterHouseholdWeekStartWheelVisible}
                    interHouseholdWeekLabel={interHouseholdWeekLabel}
                    interHouseholdWeekStartIso={interHouseholdWeekStartIso}
                    onTemplateNameChange={setTemplateName}
                    onTemplateDescriptionChange={setTemplateDescription}
                    onRecurrenceSelect={setTemplateRecurrence}
                    onToggleRecurrenceDay={toggleRecurrenceDay}
                    onToggleHasEndDate={toggleHasEndDate}
                    onToggleStartDateWheel={() => {
                      setTemplateInterHouseholdWeekStartWheelVisible(false);
                      setTemplateEndDateWheelVisible(false);
                      setTemplateStartDateWheelVisible((prev) => !prev);
                    }}
                    onToggleEndDateWheel={() => {
                      if (!templateHasEndDate) {
                        return;
                      }
                      setTemplateInterHouseholdWeekStartWheelVisible(false);
                      setTemplateStartDateWheelVisible(false);
                      setTemplateEndDateWheelVisible((prev) => !prev);
                    }}
                    onStartDateChange={(nextIsoDate) => {
                      setTemplateStartDate(nextIsoDate);
                      setTemplateEndDate(nextIsoDate);
                    }}
                    onEndDateChange={(nextIsoDate) => setTemplateEndDate(nextIsoDate < templateStartDate ? templateStartDate : nextIsoDate)}
                    onToggleRotation={toggleRotation}
                    onSetRotationCycleWeeks={setTemplateRotationCycleWeeks}
                    onToggleAssignee={toggleAssignee}
                    onToggleRotationMember={toggleRotationMember}
                    onMoveRotationMember={moveRotationMember}
                    onToggleInterHouseholdAlternating={toggleInterHouseholdAlternating}
                    onToggleInterHouseholdWeekStartWheel={() => {
                      if (!templateInterHouseholdAlternating) {
                        return;
                      }
                      setTemplateStartDateWheelVisible(false);
                      setTemplateEndDateWheelVisible(false);
                      setTemplateInterHouseholdWeekStartWheelVisible((prev) => !prev);
                    }}
                    onInterHouseholdWeekStartChange={setTemplateInterHouseholdWeekStart}
                    onSave={() => {
                      void saveTemplate();
                    }}
                  />
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
