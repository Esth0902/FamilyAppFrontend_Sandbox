import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Colors } from "@/constants/theme";
import { toIsoDate } from "@/src/utils/date";

type MealPollPlanningDateModalProps = {
  visible: boolean;
  theme: typeof Colors.light;
  styles: any;
  planningPickerTarget: "start" | "end";
  planningPickerMonth: Date;
  planningMonthCells: (Date | null)[];
  selectedPlanningDateIso: string;
  weekdays: string[];
  monthLabel: (date: Date) => string;
  onRequestClose: () => void;
  onShiftPlanningPickerMonth: (offset: number) => void;
  onSelectPlanningDate: (date: Date) => void;
};

export function MealPollPlanningDateModal({
  visible,
  theme,
  styles,
  planningPickerTarget,
  planningPickerMonth,
  planningMonthCells,
  selectedPlanningDateIso,
  weekdays,
  monthLabel,
  onRequestClose,
  onShiftPlanningPickerMonth,
  onSelectPlanningDate,
}: MealPollPlanningDateModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onRequestClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onRequestClose} />
        <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.icon }]}>
          <View style={styles.bottomSheetHandle} />
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 10 }]}>
            {planningPickerTarget === "start" ? "Date de début" : "Date de fin"}
          </Text>

          <View style={styles.calendarHeaderRow}>
            <TouchableOpacity
              onPress={() => onShiftPlanningPickerMonth(-1)}
              style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            >
              <MaterialCommunityIcons name="chevron-left" size={18} color={theme.text} />
            </TouchableOpacity>

            <Text style={[styles.calendarMonthText, { color: theme.text }]}>{monthLabel(planningPickerMonth)}</Text>

            <TouchableOpacity
              onPress={() => onShiftPlanningPickerMonth(1)}
              style={[styles.calendarNavBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            >
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.calendarWeekRow}>
            {weekdays.map((weekday) => (
              <Text key={`weekday-${weekday}`} style={[styles.calendarWeekdayText, { color: theme.textSecondary }]}>
                {weekday}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {planningMonthCells.map((dayDate, index) => {
              if (!dayDate) {
                return <View key={`calendar-empty-${index}`} style={styles.calendarCell} />;
              }

              const iso = toIsoDate(dayDate);
              const isSelected = iso === selectedPlanningDateIso;

              return (
                <TouchableOpacity
                  key={`calendar-day-${iso}`}
                  onPress={() => onSelectPlanningDate(dayDate)}
                  style={[
                    styles.calendarDayBtn,
                    { borderColor: theme.icon, backgroundColor: theme.background },
                    isSelected && { borderColor: theme.tint, backgroundColor: `${theme.tint}1A` },
                  ]}
                >
                  <View style={styles.calendarDayInner}>
                    <Text style={[styles.calendarDayText, { color: isSelected ? theme.tint : theme.text }]}>
                      {dayDate.getDate()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

