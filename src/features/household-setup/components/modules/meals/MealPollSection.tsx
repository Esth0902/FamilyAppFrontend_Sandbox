import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";

type MealPollSectionProps = {
  state: any;
};

export function MealPollSection({ state }: MealPollSectionProps) {
  const { theme, constants, form } = state;

  return (
    <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text, marginTop: 6 }]}>Jour du sondage</Text>
      <View style={styles.daysContainer}>
        {constants.DAYS.map((day: any) => (
          <AppButton
            key={day.value}
            onPress={() => form.setPollDay(day.value)}
            style={[
              styles.dayChip,
              { backgroundColor: theme.background, borderColor: theme.icon },
              form.pollDay === day.value && {
                backgroundColor: theme.tint,
                borderColor: theme.tint,
              },
            ]}
          >
            <Text style={{ color: form.pollDay === day.value ? "white" : theme.text, fontSize: 12 }}>
              {day.label}
            </Text>
          </AppButton>
        ))}
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>Heure</Text>
          <AppTextInput
            style={[styles.input, styles.inputCentered, styles.inputNoMargin]}
            value={form.pollTime}
            onChangeText={form.setPollTime}
            placeholder="10:00"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>Durée</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {constants.DURATION_CHOICES.map((value: any) => (
              <AppButton
                key={value}
                onPress={() => form.setPollDuration(value)}
                style={[
                  styles.durationBtn,
                  { backgroundColor: theme.card },
                  form.pollDuration === value && { backgroundColor: theme.tint },
                ]}
              >
                <Text style={{ color: form.pollDuration === value ? "white" : theme.text }}>
                  {value}h
                </Text>
              </AppButton>
            ))}
          </View>
        </View>
      </View>

      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>
        Max votes par utilisateur
      </Text>
      <AppTextInput
        style={[styles.input, styles.inputNoMargin]}
        value={form.maxVotesPerUser}
        onChangeText={form.setMaxVotesPerUser}
        keyboardType="numeric"
        placeholder="3"
        placeholderTextColor={theme.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mealSectionBox: { borderRadius: 12, padding: 10, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  daysContainer: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dayChip: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  input: { height: 40, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputNoMargin: { marginBottom: 0 },
  inputCentered: { textAlign: "center" },
  durationBtn: { flex: 1, height: 50, borderRadius: 10, justifyContent: "center", alignItems: "center" },
});
