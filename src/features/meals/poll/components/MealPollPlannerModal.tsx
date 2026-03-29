import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Colors } from "@/constants/theme";
import { MEAL_TYPES, type MealType } from "@/src/features/calendar/calendar-types";

type WeekSlot = {
  date: string;
  label: string;
};

type MealPollPlannerModalProps = {
  visible: boolean;
  theme: typeof Colors.light;
  styles: any;
  plannerRecipeTitle: string;
  weekSlots: WeekSlot[];
  plannerDate: string;
  plannerMealType: MealType;
  plannerServings: number;
  onRequestClose: () => void;
  onPlannerDateChange: (date: string) => void;
  onPlannerMealTypeChange: (mealType: MealType) => void;
  onDecreaseServings: () => void;
  onIncreaseServings: () => void;
  onAssignRecipeToSlot: () => void;
};

export function MealPollPlannerModal({
  visible,
  theme,
  styles,
  plannerRecipeTitle,
  weekSlots,
  plannerDate,
  plannerMealType,
  plannerServings,
  onRequestClose,
  onPlannerDateChange,
  onPlannerMealTypeChange,
  onDecreaseServings,
  onIncreaseServings,
  onAssignRecipeToSlot,
}: MealPollPlannerModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onRequestClose} />

        <View style={[styles.bottomSheet, { backgroundColor: theme.card, borderTopColor: theme.icon }]}>
          <View style={styles.bottomSheetHandle} />
          <Text style={[styles.cardTitle, { color: theme.text, marginBottom: 6 }]}>Planifier au menu de la semaine</Text>
          <Text style={{ color: theme.textSecondary, marginBottom: 10 }} numberOfLines={1}>
            {plannerRecipeTitle}
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>Jour</Text>
          <View style={styles.weekSlotsWrap}>
            {weekSlots.map((slot) => (
              <TouchableOpacity
                key={`slot-day-${slot.date}`}
                onPress={() => onPlannerDateChange(slot.date)}
                style={[
                  styles.weekSlotChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  plannerDate === slot.date && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                ]}
              >
                <Text style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>
                  {slot.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Repas</Text>
          <View style={styles.mealTypeRow}>
            {MEAL_TYPES.map((mealType) => (
              <TouchableOpacity
                key={`planner-meal-${mealType.value}`}
                onPress={() => onPlannerMealTypeChange(mealType.value)}
                style={[
                  styles.mealTypeChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  plannerMealType === mealType.value && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                ]}
              >
                <Text style={{ color: theme.text }}>{mealType.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Portions</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity onPress={onDecreaseServings} style={[styles.stepperBtn, { borderColor: theme.icon }]}>
              <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.stepperValue, { color: theme.text }]}>{plannerServings}</Text>
            <TouchableOpacity onPress={onIncreaseServings} style={[styles.stepperBtn, { borderColor: theme.icon }]}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onAssignRecipeToSlot} style={[styles.primaryBtn, { backgroundColor: theme.tint }]}>
            <Text style={styles.primaryBtnText}>Planifier ce repas</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

