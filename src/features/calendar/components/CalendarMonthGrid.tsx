import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { isSameMonth, toIsoDate } from "@/src/utils/date";

type CalendarMonthGridProps = {
  styles: Record<string, any>;
  calendarDays: Date[];
  monthCursor: Date;
  selectedDate: string;
  todayIsoValue: string;
  eventCountByDay: Record<string, number>;
  mealCountByDay: Record<string, number>;
  taskCountByDay: Record<string, number>;
  onDayPress: (isoDate: string) => void;
  colors: {
    borderColor: string;
    backgroundColor: string;
    tint: string;
    text: string;
    accentWarm: string;
  };
};

export function CalendarMonthGrid({
  styles,
  calendarDays,
  monthCursor,
  selectedDate,
  todayIsoValue,
  eventCountByDay,
  mealCountByDay,
  taskCountByDay,
  onDayPress,
  colors,
}: CalendarMonthGridProps) {
  return (
    <View style={styles.calendarGrid}>
      {calendarDays.map((day) => {
        const iso = toIsoDate(day);
        const isSelected = iso === selectedDate;
        const inCurrentMonth = isSameMonth(day, monthCursor);
        const eventCount = eventCountByDay[iso] ?? 0;
        const mealCount = mealCountByDay[iso] ?? 0;
        const taskCount = taskCountByDay[iso] ?? 0;
        const isToday = iso === todayIsoValue;

        return (
          <View key={iso} style={styles.calendarCell}>
            <TouchableOpacity
              style={[
                styles.calendarDayBtn,
                { borderColor: colors.borderColor, backgroundColor: colors.backgroundColor },
                !inCurrentMonth && { opacity: 0.45 },
                isSelected && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
              ]}
              onPress={() => onDayPress(iso)}
            >
              <View style={styles.calendarDayInner}>
                <View
                  style={[
                    styles.calendarDayNumberBadge,
                    isToday && { backgroundColor: isSelected ? `${colors.tint}22` : `${colors.accentWarm}28` },
                  ]}
                >
                  <Text style={[styles.calendarDayText, { color: isSelected ? colors.tint : colors.text }]}>
                    {day.getDate()}
                  </Text>
                </View>
                <View style={styles.dayBadgesRow}>
                  {mealCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#F5A623" }]} /> : null}
                  {taskCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#7C5CFA" }]} /> : null}
                  {eventCount > 0 ? <View style={[styles.dayDot, { backgroundColor: "#4A90E2" }]} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
