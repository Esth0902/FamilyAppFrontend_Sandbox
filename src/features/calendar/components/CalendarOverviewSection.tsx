import React from "react";
import { Text, View } from "react-native";

import { CalendarMonthGrid } from "@/src/features/calendar/components/CalendarMonthGrid";
import { CalendarMonthNavigator } from "@/src/features/calendar/components/CalendarMonthNavigator";

type CalendarOverviewSectionProps = {
  styles: Record<string, any>;
  colors: {
    card: string;
    icon: string;
    background: string;
    tint: string;
    text: string;
    textSecondary: string;
    accentWarm: string;
  };
  stats: {
    events: number;
    shared: number;
    meals: number;
  };
  monthLabel: string;
  weekDays: string[];
  calendarDays: Date[];
  monthCursor: Date;
  selectedDate: string;
  todayIsoValue: string;
  eventCountByDay: Record<string, number>;
  mealCountByDay: Record<string, number>;
  taskCountByDay: Record<string, number>;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onDayPress: (isoDate: string) => void;
};

export function CalendarOverviewSection({
  styles,
  colors,
  stats,
  monthLabel,
  weekDays,
  calendarDays,
  monthCursor,
  selectedDate,
  todayIsoValue,
  eventCountByDay,
  mealCountByDay,
  taskCountByDay,
  onPreviousMonth,
  onNextMonth,
  onDayPress,
}: CalendarOverviewSectionProps) {
  return (
    <>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.events}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Événements</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.shared}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Partages</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{stats.meals}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Repas planifiés</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <CalendarMonthNavigator
          styles={styles}
          monthLabel={monthLabel}
          weekDays={weekDays}
          onPreviousMonth={onPreviousMonth}
          onNextMonth={onNextMonth}
          colors={{
            borderColor: colors.icon,
            backgroundColor: colors.background,
            tint: colors.tint,
            text: colors.text,
            textSecondary: colors.textSecondary,
          }}
        />

        <CalendarMonthGrid
          styles={styles}
          calendarDays={calendarDays}
          monthCursor={monthCursor}
          selectedDate={selectedDate}
          todayIsoValue={todayIsoValue}
          eventCountByDay={eventCountByDay}
          mealCountByDay={mealCountByDay}
          taskCountByDay={taskCountByDay}
          onDayPress={onDayPress}
          colors={{
            borderColor: colors.icon,
            backgroundColor: colors.background,
            tint: colors.tint,
            text: colors.text,
            accentWarm: colors.accentWarm,
          }}
        />
      </View>
    </>
  );
}
