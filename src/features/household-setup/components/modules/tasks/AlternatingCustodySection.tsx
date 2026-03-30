import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";
import { normalizeCustodyWeekStartDate } from "@/src/features/household-setup/utils/householdSetup.helpers";
import { CustodyDateWheel } from "@/src/features/household-setup/components/modules/tasks/CustodyDateWheel";

type AlternatingCustodySectionProps = {
  state: any;
};

export function AlternatingCustodySection({ state }: AlternatingCustodySectionProps) {
  const { theme, constants, form, actions } = state;

  return (
    <>
      <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour de bascule</Text>
      <View style={styles.daysContainer}>
        {constants.DAYS.map((day: any) => (
          <AppButton
            key={`custody-day-${day.value}`}
            onPress={() =>
              form.setTasksSettings((prev: any) => ({
                ...prev,
                custody_change_day: day.value,
                custody_home_week_start: normalizeCustodyWeekStartDate(
                  prev.custody_home_week_start,
                  day.value
                ),
              }))
            }
            style={[
              styles.dayChip,
              { borderColor: theme.icon, backgroundColor: theme.card },
              form.tasksSettings.custody_change_day === day.value && {
                backgroundColor: theme.tint,
                borderColor: theme.tint,
              },
            ]}
          >
            <Text
              style={{
                color:
                  form.tasksSettings.custody_change_day === day.value
                    ? "white"
                    : theme.text,
                fontSize: 12,
              }}
            >
              {day.label}
            </Text>
          </AppButton>
        ))}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>
        Début d&apos;une semaine à la maison
      </Text>
      <AppButton
        onPress={actions.openCustodyDateWheel}
        style={[
          styles.pickerFieldBtn,
          { borderColor: theme.icon, backgroundColor: theme.background },
        ]}
      >
        <MaterialCommunityIcons
          name="calendar-month-outline"
          size={16}
          color={theme.textSecondary}
        />
        <Text style={[styles.pickerFieldText, { color: theme.text }]}>
          {form.tasksSettings.custody_home_week_start}
        </Text>
      </AppButton>

      <CustodyDateWheel state={state} />

      <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
        Les tâches récurrentes des enfants seront planifiées une semaine sur deux, à partir de
        cette semaine.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  daysContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  pickerFieldBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pickerFieldText: { fontSize: 14, fontWeight: "600" },
  memberMeta: { fontSize: 11, color: "gray" },
});
