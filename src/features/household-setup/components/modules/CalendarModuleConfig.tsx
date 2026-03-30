import React from "react";
import { StyleSheet, Switch, Text, View } from "react-native";

type CalendarModuleConfigProps = {
  state: any;
};

export function CalendarModuleConfig({ state }: CalendarModuleConfigProps) {
  const { theme, form } = state;

  return (
    <View style={styles.subConfigBox}>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.text }]}>Vue partagée</Text>
        <Switch
          value={form.calendarSettings.shared_view_enabled}
          onValueChange={(value) =>
            form.setCalendarSettings((prev: any) => ({ ...prev, shared_view_enabled: value }))
          }
          trackColor={{ false: theme.icon, true: theme.tint }}
        />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.text }]}>Suivi des absences</Text>
        <Switch
          value={form.calendarSettings.absence_tracking_enabled}
          onValueChange={(value) =>
            form.setCalendarSettings((prev: any) => ({
              ...prev,
              absence_tracking_enabled: value,
            }))
          }
          trackColor={{ false: theme.icon, true: theme.tint }}
        />
      </View>
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
});
