import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

import { AlternatingCustodySection } from "@/src/features/household-setup/components/modules/tasks/AlternatingCustodySection";

type TasksModuleConfigProps = {
  state: any;
};

export function TasksModuleConfig({ state }: TasksModuleConfigProps) {
  const { theme, form } = state;

  return (
    <View style={styles.subConfigBox}>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.text }]}>Rappels actifs</Text>
        <Switch
          value={form.tasksSettings.reminders_enabled}
          onValueChange={(value) =>
            form.setTasksSettings((prev: any) => ({
              ...prev,
              reminders_enabled: value,
            }))
          }
          trackColor={{ false: theme.icon, true: theme.tint }}
        />
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Garde alternée</Text>
        <Switch
          value={form.tasksSettings.alternating_custody_enabled}
          onValueChange={(value) =>
            form.setTasksSettings((prev: any) => ({
              ...prev,
              alternating_custody_enabled: value,
            }))
          }
          trackColor={{ false: theme.icon, true: theme.tint }}
        />
      </View>

      {form.tasksSettings.alternating_custody_enabled ? (
        <AlternatingCustodySection state={state} />
      ) : (
        <Text style={[styles.memberMeta, { color: theme.textSecondary, marginTop: 4 }]}>
          Active la garde alternée pour limiter les routines enfants aux semaines à la maison.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subConfigBox: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  memberMeta: { fontSize: 11, color: "gray" },
});
