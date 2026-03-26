import React from "react";
import { FlatList, Modal, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { formatFullDateLabel } from "@/src/features/calendar/calendar-tab.helpers";
import type {
  CalendarEvent,
  CalendarTaskInstance,
  EventParticipationStatus,
  MealPlanEntry,
  MealPresenceStatus,
} from "@/src/features/calendar/calendar-tab.types";
import { CalendarEventDayItemCard } from "@/src/features/calendar/components/CalendarEventDayItemCard";
import { CalendarMealDayItemCard } from "@/src/features/calendar/components/CalendarMealDayItemCard";
import { CalendarSectionBlock } from "@/src/features/calendar/components/CalendarSectionBlock";
import { CalendarTaskDayItemCard } from "@/src/features/calendar/components/CalendarTaskDayItemCard";

type CalendarDayProgramModalProps = {
  visible: boolean;
  onClose: () => void;
  onOpenCreateEntry: () => void;
  selectedDate: string;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  canCreateEvents: boolean;
  absenceTrackingEnabled: boolean;
  canManageMealPlan: boolean;
  tasksEnabled: boolean;
  dateWheelVisible: boolean;
  timeWheelVisible: boolean;
  selectedDayMeals: MealPlanEntry[];
  selectedDayTasks: CalendarTaskInstance[];
  selectedDayEvents: CalendarEvent[];
  onSubmitMealPresence: (mealPlanId: number, status: MealPresenceStatus, reason?: string | null) => void;
  onOpenMealReasonModal: (entry: MealPlanEntry, status: Extract<MealPresenceStatus, "not_home" | "later">) => void;
  onOpenMealShoppingListPicker: (entry: MealPlanEntry) => void;
  onOpenMealEditor: (entry: MealPlanEntry) => void;
  onConfirmDeleteMeal: (entry: MealPlanEntry) => void;
  onToggleTask: (task: CalendarTaskInstance) => void;
  onValidateTask: (task: CalendarTaskInstance) => void;
  onSubmitEventParticipation: (eventId: number, status: EventParticipationStatus, reason?: string | null) => void;
  onOpenEventReasonModal: (event: CalendarEvent) => void;
  onOpenEventEditor: (event: CalendarEvent) => void;
  onConfirmDeleteEvent: (event: CalendarEvent) => void;
};

export function CalendarDayProgramModal({
  visible,
  onClose,
  onOpenCreateEntry,
  selectedDate,
  styles,
  colors,
  saving,
  canCreateEvents,
  absenceTrackingEnabled,
  canManageMealPlan,
  tasksEnabled,
  dateWheelVisible,
  timeWheelVisible,
  selectedDayMeals,
  selectedDayTasks,
  selectedDayEvents,
  onSubmitMealPresence,
  onOpenMealReasonModal,
  onOpenMealShoppingListPicker,
  onOpenMealEditor,
  onConfirmDeleteMeal,
  onToggleTask,
  onValidateTask,
  onSubmitEventParticipation,
  onOpenEventReasonModal,
  onOpenEventEditor,
  onConfirmDeleteEvent,
}: CalendarDayProgramModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.dayProgramHeaderRow}>
            <Text
              style={[
                styles.cardTitle,
                styles.dayProgramHeaderTitle,
                { color: colors.text, marginBottom: 0 },
              ]}
            >
              Programme du {formatFullDateLabel(selectedDate)}
            </Text>
            <View style={styles.dayProgramHeaderActions}>
              <TouchableOpacity
                onPress={onOpenCreateEntry}
                style={[
                  styles.modalIconBtn,
                  {
                    borderColor: colors.icon,
                    backgroundColor: colors.background,
                    opacity: canCreateEvents ? 1 : 0.45,
                  },
                ]}
                disabled={saving || !canCreateEvents}
              >
                <MaterialCommunityIcons name="plus" size={18} color={colors.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.modalIconBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={colors.tint} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            scrollEnabled={Platform.OS === "ios" ? !dateWheelVisible && !timeWheelVisible : true}
          >
            <CalendarSectionBlock
              styles={styles}
              iconName="silverware-fork-knife"
              iconColor="#F5A623"
              title="Repas"
              titleColor={colors.text}
            >
              {selectedDayMeals.length > 0 ? (
                <FlatList
                  data={selectedDayMeals}
                  keyExtractor={(entry) => `meal-${entry.id}`}
                  renderItem={({ item: entry }) => (
                    <CalendarMealDayItemCard
                      entry={entry}
                      styles={styles}
                      colors={{
                        icon: colors.icon,
                        background: colors.background,
                        text: colors.text,
                        textSecondary: colors.textSecondary,
                        tint: colors.tint,
                      }}
                      saving={saving}
                      absenceTrackingEnabled={absenceTrackingEnabled}
                      canManageMealPlan={canManageMealPlan}
                      onSubmitPresence={(mealPlanId, status, reason) => onSubmitMealPresence(mealPlanId, status, reason)}
                      onOpenReasonModal={onOpenMealReasonModal}
                      onOpenShoppingListPicker={onOpenMealShoppingListPicker}
                      onOpenEditor={onOpenMealEditor}
                      onConfirmDelete={onConfirmDeleteMeal}
                    />
                  )}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
              ) : (
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  Aucun repas validé pour cette journée.
                </Text>
              )}
            </CalendarSectionBlock>

            <CalendarSectionBlock
              styles={styles}
              iconName="checkbox-marked-circle-outline"
              iconColor="#7C5CFA"
              title="Tâches"
              titleColor={colors.text}
            >
              {!tasksEnabled ? (
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  Le module tâches est désactivé pour ce foyer.
                </Text>
              ) : selectedDayTasks.length > 0 ? (
                <FlatList
                  data={selectedDayTasks}
                  keyExtractor={(task) => `task-${task.id}`}
                  renderItem={({ item: task }) => (
                    <CalendarTaskDayItemCard
                      task={task}
                      styles={styles}
                      colors={{
                        icon: colors.icon,
                        background: colors.background,
                        text: colors.text,
                        textSecondary: colors.textSecondary,
                        tint: colors.tint,
                      }}
                      saving={saving}
                      onToggle={onToggleTask}
                      onValidate={onValidateTask}
                    />
                  )}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
              ) : (
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  Aucune tâche prévue pour cette journée.
                </Text>
              )}
            </CalendarSectionBlock>

            <CalendarSectionBlock
              styles={styles}
              iconName="calendar-clock-outline"
              iconColor={colors.tint}
              title="Événements"
              titleColor={colors.text}
            >
              {selectedDayEvents.length > 0 ? (
                <FlatList
                  data={selectedDayEvents}
                  keyExtractor={(event) => `event-${event.id}`}
                  renderItem={({ item: event }) => (
                    <CalendarEventDayItemCard
                      event={event}
                      styles={styles}
                      colors={{
                        icon: colors.icon,
                        background: colors.background,
                        text: colors.text,
                        textSecondary: colors.textSecondary,
                        tint: colors.tint,
                      }}
                      saving={saving}
                      onSubmitParticipation={(eventId, status, reason) =>
                        onSubmitEventParticipation(eventId, status, reason)
                      }
                      onOpenReasonModal={onOpenEventReasonModal}
                      onOpenEditor={onOpenEventEditor}
                      onConfirmDelete={onConfirmDeleteEvent}
                    />
                  )}
                  scrollEnabled={false}
                  removeClippedSubviews
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                />
              ) : (
                <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
                  Aucun événement sur cette journée.
                </Text>
              )}
            </CalendarSectionBlock>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
