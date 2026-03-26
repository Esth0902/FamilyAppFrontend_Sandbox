import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

import {
  TASK_STATUS_DONE,
  taskAssigneeNames,
  taskStatusColor,
  taskStatusLabel,
} from "@/src/features/calendar/calendar-tab.helpers";
import type { CalendarTaskInstance } from "@/src/features/calendar/calendar-tab.types";
import { isTaskStatus } from "@/src/features/calendar/calendar-utils";

type CalendarTaskDayItemCardProps = {
  task: CalendarTaskInstance;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  onToggle: (task: CalendarTaskInstance) => void;
  onValidate: (task: CalendarTaskInstance) => void;
};

export function CalendarTaskDayItemCard({
  task,
  styles,
  colors,
  saving,
  onToggle,
  onValidate,
}: CalendarTaskDayItemCardProps) {
  return (
    <View style={[styles.itemCard, { borderColor: colors.icon, backgroundColor: colors.background }]}>
      <View style={styles.itemHeaderRow}>
        <Text style={[styles.itemTitle, { color: colors.text, flex: 1 }]}>{task.title}</Text>
        <View style={[styles.badge, { backgroundColor: `${taskStatusColor(task.status)}22` }]}>
          <Text style={[styles.badgeText, { color: taskStatusColor(task.status) }]}>
            {taskStatusLabel(task.status)}
          </Text>
        </View>
      </View>
      <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>Assigné à : {taskAssigneeNames(task)}</Text>
      {task.description ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{task.description}</Text> : null}
      {task.validated_by_parent ? <Text style={[styles.itemMetaText, { color: "#2E8B78" }]}>Validée</Text> : null}

      {task.permissions.can_toggle || (task.permissions.can_validate && !task.validated_by_parent) ? (
        <View style={styles.itemActionsRow}>
          {task.permissions.can_toggle ? (
            <TouchableOpacity
              style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
              onPress={() => onToggle(task)}
              disabled={saving}
            >
              <MaterialCommunityIcons
                name={isTaskStatus(task.status, TASK_STATUS_DONE) ? "backup-restore" : "check-bold"}
                size={16}
                color={colors.tint}
              />
              <Text style={[styles.inlineActionText, { color: colors.text }]}>
                {isTaskStatus(task.status, TASK_STATUS_DONE) ? "Remettre à faire" : "Marquer faite"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {task.permissions.can_validate && !task.validated_by_parent ? (
            <TouchableOpacity
              style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
              onPress={() => onValidate(task)}
              disabled={saving}
            >
              <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#2E8B78" />
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Valider</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
