import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScrollView, Text, TextInput, TouchableOpacity } from "react-native";

import type { DateWheelTarget, TaskBoardPayload } from "@/src/features/calendar/calendar-tab.types";

type CalendarTaskFormFieldsProps = {
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  taskTitle: string;
  taskDescription: string;
  taskDueDate: string;
  taskEndDate: string;
  dateWheelVisible: boolean;
  dateWheelTarget: DateWheelTarget;
  onOpenDateWheel: (target: DateWheelTarget) => void;
  renderDateWheelPanel: () => React.ReactNode;
  assignableTaskMembers: TaskBoardPayload["members"];
  taskAssigneeId: number | null;
  onChangeTaskTitle: (value: string) => void;
  onChangeTaskDescription: (value: string) => void;
  onSelectTaskAssignee: (memberId: number) => void;
};

export function CalendarTaskFormFields({
  styles,
  colors,
  saving,
  taskTitle,
  taskDescription,
  taskDueDate,
  taskEndDate,
  dateWheelVisible,
  dateWheelTarget,
  onOpenDateWheel,
  renderDateWheelPanel,
  assignableTaskMembers,
  taskAssigneeId,
  onChangeTaskTitle,
  onChangeTaskDescription,
  onSelectTaskAssignee,
}: CalendarTaskFormFieldsProps) {
  const members = assignableTaskMembers ?? [];

  return (
    <>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
        value={taskTitle}
        onChangeText={onChangeTaskTitle}
        placeholder="Titre de la tâche"
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[
          styles.input,
          styles.inputMultiline,
          { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon },
        ]}
        value={taskDescription}
        onChangeText={onChangeTaskDescription}
        placeholder="Description (optionnel)"
        placeholderTextColor={colors.textSecondary}
        multiline
      />

      <Text style={[styles.label, { color: colors.text }]}>Date de début</Text>
      <TouchableOpacity
        onPress={() => onOpenDateWheel("task_start")}
        style={[styles.pickerFieldBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
        disabled={saving}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.pickerFieldText, { color: colors.text }]}>{taskDueDate}</Text>
      </TouchableOpacity>
      {dateWheelVisible && dateWheelTarget === "task_start" ? renderDateWheelPanel() : null}

      <Text style={[styles.label, { color: colors.text }]}>Date de fin</Text>
      <TouchableOpacity
        onPress={() => onOpenDateWheel("task_end")}
        style={[styles.pickerFieldBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
        disabled={saving}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.pickerFieldText, { color: colors.text }]}>{taskEndDate}</Text>
      </TouchableOpacity>
      {dateWheelVisible && dateWheelTarget === "task_end" ? renderDateWheelPanel() : null}

      <Text style={[styles.helperText, { color: colors.textSecondary }]}>
        La date de fin est automatiquement ajustée si elle est avant la date de début.
      </Text>
      <Text style={[styles.label, { color: colors.text }]}>Attribuer à</Text>
      {members.length > 0 ? (
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
          {members.map((member) => (
            <TouchableOpacity
              key={`task-assignee-${member.id}`}
              onPress={() => onSelectTaskAssignee(member.id)}
              style={[
                styles.recipeChip,
                { borderColor: colors.icon, backgroundColor: colors.background },
                taskAssigneeId === member.id && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
              ]}
            >
              <Text style={[styles.recipeChipText, { color: colors.text }]}>{member.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Aucun membre disponible pour l&apos;attribution.
        </Text>
      )}
    </>
  );
}
