import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { tasksManageStyles as styles } from "@/src/features/tasks/tasks-manage.styles";
import { recurrenceDaysLabel, recurrenceLabel } from "@/src/features/tasks/tasks-manage.utils";

import type { Colors } from "@/constants/theme";
import type { TaskTemplate } from "@/src/features/tasks/hooks/useTasksBoard";

type RoutinesListCardProps = {
  theme: typeof Colors.light;
  templates: TaskTemplate[];
  memberNameById: Map<number, string>;
  saving: boolean;
  onEdit: (template: TaskTemplate) => void;
  onDelete: (template: TaskTemplate) => void;
};

export const RoutinesListCard = memo(function RoutinesListCard({
  theme,
  templates,
  memberNameById,
  saving,
  onEdit,
  onDelete,
}: RoutinesListCardProps) {
  return (
    <>
      {templates.map((template, index) => (
        <View
          key={`template-${template.id}`}
          style={[
            styles.templateRow,
            { borderColor: theme.icon, backgroundColor: theme.background },
            index < templates.length - 1 ? { marginBottom: 8 } : null,
          ]}
        >
          <View style={styles.templateHeaderRow}>
            <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }}>{template.name}</Text>
            <View style={styles.templateActionsRow}>
              <TouchableOpacity
                onPress={() => onEdit(template)}
                style={[styles.templateIconBtn, { borderColor: theme.icon }]}
                disabled={saving}
              >
                <MaterialCommunityIcons name="pencil-outline" size={18} color={theme.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDelete(template)}
                style={[styles.templateIconBtn, { borderColor: theme.icon }]}
                disabled={saving}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#CC4B4B" />
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>{recurrenceLabel(template.recurrence)}</Text>
            {recurrenceDaysLabel(template.recurrence, template.recurrence_days) ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {recurrenceDaysLabel(template.recurrence, template.recurrence_days)}
              </Text>
            ) : null}
            {template.is_rotation && Array.isArray(template.rotation_user_ids) && template.rotation_user_ids.length > 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {`Ordre: ${template.rotation_user_ids.map((id) => memberNameById.get(id) ?? `#${id}`).join("  ->  ")}`}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {templates.length === 0 ? (
        <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Aucune routine pour le moment.</Text>
      ) : null}
    </>
  );
});
