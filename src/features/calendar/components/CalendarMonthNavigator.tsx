import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type CalendarMonthNavigatorProps = {
  styles: Record<string, any>;
  monthLabel: string;
  weekDays: readonly string[];
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  colors: {
    borderColor: string;
    backgroundColor: string;
    tint: string;
    text: string;
    textSecondary: string;
  };
};

export function CalendarMonthNavigator({
  styles,
  monthLabel,
  weekDays,
  onPreviousMonth,
  onNextMonth,
  colors,
}: CalendarMonthNavigatorProps) {
  return (
    <>
      <View style={styles.calendarHeaderRow}>
        <TouchableOpacity
          style={[styles.calendarNavBtn, { borderColor: colors.borderColor, backgroundColor: colors.backgroundColor }]}
          onPress={onPreviousMonth}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.tint} />
        </TouchableOpacity>
        <Text style={[styles.calendarMonthText, { color: colors.text }]}>{monthLabel}</Text>
        <TouchableOpacity
          style={[styles.calendarNavBtn, { borderColor: colors.borderColor, backgroundColor: colors.backgroundColor }]}
          onPress={onNextMonth}
        >
          <MaterialCommunityIcons name="chevron-right" size={22} color={colors.tint} />
        </TouchableOpacity>
      </View>

      <View style={styles.calendarWeekRow}>
        {weekDays.map((weekday) => (
          <Text key={weekday} style={[styles.calendarWeekdayText, { color: colors.textSecondary }]}>
            {weekday}
          </Text>
        ))}
      </View>
    </>
  );
}
