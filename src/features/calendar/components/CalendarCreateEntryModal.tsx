import React from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type {
  CreateEntryType,
  DateWheelTarget,
  RecipeOption,
  TaskBoardPayload,
} from "@/src/features/calendar/calendar-tab.types";
import type { MealType } from "@/src/features/calendar/calendar-types";
import { CalendarEventFormFields } from "@/src/features/calendar/components/CalendarEventFormFields";
import { CalendarMealFormFields } from "@/src/features/calendar/components/CalendarMealFormFields";
import { CalendarTaskFormFields } from "@/src/features/calendar/components/CalendarTaskFormFields";

type CalendarCreateEntryModalProps = {
  visible: boolean;
  onClose: () => void;
  saving: boolean;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  editingEventId: number | null;
  createEntryType: CreateEntryType;
  onSelectCreateEntryType: (type: CreateEntryType) => void;
  canManageMealPlan: boolean;
  tasksEnabled: boolean;
  canManageTaskInstances: boolean;
  isEventFormMode: boolean;
  eventTitle: string;
  eventDescription: string;
  eventDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  dateWheelVisible: boolean;
  dateWheelTarget: DateWheelTarget;
  timeWheelVisible: boolean;
  onChangeEventTitle: (value: string) => void;
  onChangeEventDescription: (value: string) => void;
  onOpenDateWheel: (target: DateWheelTarget) => void;
  onOpenTimeWheel: (target: "start" | "end") => void;
  renderDateWheelPanel: () => React.ReactNode;
  renderTimeWheelPanel: () => React.ReactNode;
  shareWithOtherHousehold: boolean;
  onChangeShareWithOtherHousehold: (value: boolean) => void;
  sharedViewEnabled: boolean;
  canShareWithOtherHousehold: boolean;
  mealPlanDate: string;
  mealTypes: { label: string; value: MealType }[];
  mealPlanType: MealType;
  onSelectMealType: (value: MealType) => void;
  mealPlanSearch: string;
  onChangeMealPlanSearch: (value: string) => void;
  mealPlanRecipeSearchFetching: boolean;
  recipeOptions: RecipeOption[];
  filteredRecipeOptions: RecipeOption[];
  mealPlanRecipeId: number | null;
  onSelectRecipe: (recipeId: number) => void;
  selectedMealRecipeTitle: string | null;
  mealPlanCustomTitle: string;
  onChangeMealPlanCustomTitle: (value: string) => void;
  mealPlanServings: string;
  onChangeMealPlanServings: (value: string) => void;
  mealPlanNote: string;
  onChangeMealPlanNote: (value: string) => void;
  taskTitle: string;
  taskDescription: string;
  taskDueDate: string;
  taskEndDate: string;
  assignableTaskMembers: TaskBoardPayload["members"];
  taskAssigneeId: number | null;
  onChangeTaskTitle: (value: string) => void;
  onChangeTaskDescription: (value: string) => void;
  onSelectTaskAssignee: (memberId: number) => void;
  canSubmitCreateModal: boolean;
  onSave: () => void;
};

export function CalendarCreateEntryModal({
  visible,
  onClose,
  saving,
  styles,
  colors,
  editingEventId,
  createEntryType,
  onSelectCreateEntryType,
  canManageMealPlan,
  tasksEnabled,
  canManageTaskInstances,
  isEventFormMode,
  eventTitle,
  eventDescription,
  eventDate,
  eventStartTime,
  eventEndDate,
  eventEndTime,
  dateWheelVisible,
  dateWheelTarget,
  timeWheelVisible,
  onChangeEventTitle,
  onChangeEventDescription,
  onOpenDateWheel,
  onOpenTimeWheel,
  renderDateWheelPanel,
  renderTimeWheelPanel,
  shareWithOtherHousehold,
  onChangeShareWithOtherHousehold,
  sharedViewEnabled,
  canShareWithOtherHousehold,
  mealPlanDate,
  mealTypes,
  mealPlanType,
  onSelectMealType,
  mealPlanSearch,
  onChangeMealPlanSearch,
  mealPlanRecipeSearchFetching,
  recipeOptions,
  filteredRecipeOptions,
  mealPlanRecipeId,
  onSelectRecipe,
  selectedMealRecipeTitle,
  mealPlanCustomTitle,
  onChangeMealPlanCustomTitle,
  mealPlanServings,
  onChangeMealPlanServings,
  mealPlanNote,
  onChangeMealPlanNote,
  taskTitle,
  taskDescription,
  taskDueDate,
  taskEndDate,
  assignableTaskMembers,
  taskAssigneeId,
  onChangeTaskTitle,
  onChangeTaskDescription,
  onSelectTaskAssignee,
  canSubmitCreateModal,
  onSave,
}: CalendarCreateEntryModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>
              {editingEventId
                ? "Modifier l'événement"
                : createEntryType === "meal_plan"
                  ? "Nouveau repas"
                  : createEntryType === "task"
                    ? "Nouvelle tâche"
                    : "Nouvel événement"}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <MaterialCommunityIcons name="close" size={22} color={colors.tint} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            {editingEventId === null ? (
              <>
                <View style={styles.visibilityRow}>
                  <TouchableOpacity
                    onPress={() => onSelectCreateEntryType("event")}
                    style={[
                      styles.visibilityChip,
                      { borderColor: colors.icon, backgroundColor: colors.background },
                      createEntryType === "event" && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>Événement</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onSelectCreateEntryType("meal_plan")}
                    style={[
                      styles.visibilityChip,
                      { borderColor: colors.icon, backgroundColor: colors.background },
                      createEntryType === "meal_plan" && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
                      !canManageMealPlan && { opacity: 0.45 },
                    ]}
                    disabled={!canManageMealPlan}
                  >
                    <Text style={{ color: colors.text }}>Repas</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onSelectCreateEntryType("task")}
                    style={[
                      styles.visibilityChip,
                      { borderColor: colors.icon, backgroundColor: colors.background },
                      createEntryType === "task" && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
                      (!tasksEnabled || !canManageTaskInstances) && { opacity: 0.45 },
                    ]}
                    disabled={!tasksEnabled || !canManageTaskInstances}
                  >
                    <Text style={{ color: colors.text }}>Tâche</Text>
                  </TouchableOpacity>
                </View>
                {!canManageMealPlan ? (
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    La planification de repas est réservée à un parent.
                  </Text>
                ) : null}
                {!tasksEnabled ? (
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    Le module tâches est désactivé pour ce foyer.
                  </Text>
                ) : !canManageTaskInstances ? (
                  <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                    La création de tâches est réservée à un parent.
                  </Text>
                ) : null}
              </>
            ) : null}

            {isEventFormMode ? (
              <CalendarEventFormFields
                styles={styles}
                colors={{
                  icon: colors.icon,
                  background: colors.background,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  tint: colors.tint,
                }}
                saving={saving}
                eventTitle={eventTitle}
                eventDescription={eventDescription}
                eventDate={eventDate}
                eventStartTime={eventStartTime}
                eventEndDate={eventEndDate}
                eventEndTime={eventEndTime}
                dateWheelVisible={dateWheelVisible}
                timeWheelVisible={timeWheelVisible}
                onChangeEventTitle={onChangeEventTitle}
                onChangeEventDescription={onChangeEventDescription}
                onOpenDateWheel={onOpenDateWheel}
                onOpenTimeWheel={onOpenTimeWheel}
                renderDateWheelPanel={renderDateWheelPanel}
                renderTimeWheelPanel={renderTimeWheelPanel}
                shareWithOtherHousehold={shareWithOtherHousehold}
                onChangeShareWithOtherHousehold={onChangeShareWithOtherHousehold}
                sharedViewEnabled={sharedViewEnabled}
                canShareWithOtherHousehold={canShareWithOtherHousehold}
              />
            ) : createEntryType === "meal_plan" ? (
              <CalendarMealFormFields
                styles={styles}
                colors={{
                  icon: colors.icon,
                  background: colors.background,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  tint: colors.tint,
                }}
                saving={saving}
                mealPlanDate={mealPlanDate}
                dateWheelVisible={dateWheelVisible}
                dateWheelTarget={dateWheelTarget}
                onOpenDateWheel={onOpenDateWheel}
                renderDateWheelPanel={renderDateWheelPanel}
                mealTypes={mealTypes}
                mealPlanType={mealPlanType}
                onSelectMealType={onSelectMealType}
                mealPlanSearch={mealPlanSearch}
                onChangeMealPlanSearch={onChangeMealPlanSearch}
                mealPlanRecipeSearchFetching={mealPlanRecipeSearchFetching}
                recipeOptions={recipeOptions}
                filteredRecipeOptions={filteredRecipeOptions}
                mealPlanRecipeId={mealPlanRecipeId}
                onSelectRecipe={onSelectRecipe}
                selectedMealRecipeTitle={selectedMealRecipeTitle}
                mealPlanCustomTitle={mealPlanCustomTitle}
                onChangeMealPlanCustomTitle={onChangeMealPlanCustomTitle}
                mealPlanServings={mealPlanServings}
                onChangeMealPlanServings={onChangeMealPlanServings}
                mealPlanNote={mealPlanNote}
                onChangeMealPlanNote={onChangeMealPlanNote}
              />
            ) : (
              <CalendarTaskFormFields
                styles={styles}
                colors={{
                  icon: colors.icon,
                  background: colors.background,
                  text: colors.text,
                  textSecondary: colors.textSecondary,
                  tint: colors.tint,
                }}
                saving={saving}
                taskTitle={taskTitle}
                taskDescription={taskDescription}
                taskDueDate={taskDueDate}
                taskEndDate={taskEndDate}
                dateWheelVisible={dateWheelVisible}
                dateWheelTarget={dateWheelTarget}
                onOpenDateWheel={onOpenDateWheel}
                renderDateWheelPanel={renderDateWheelPanel}
                assignableTaskMembers={assignableTaskMembers}
                taskAssigneeId={taskAssigneeId}
                onChangeTaskTitle={onChangeTaskTitle}
                onChangeTaskDescription={onChangeTaskDescription}
                onSelectTaskAssignee={onSelectTaskAssignee}
              />
            )}
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.secondaryBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
              disabled={saving}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: colors.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving || !canSubmitCreateModal}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.primaryBtnText}>{editingEventId ? "Enregistrer" : "Ajouter"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
