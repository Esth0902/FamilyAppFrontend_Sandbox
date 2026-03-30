import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import type { DateWheelTarget } from "@/src/features/calendar/calendar-tab.types";

type CalendarEventFormFieldsProps = {
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  eventTitle: string;
  eventDescription: string;
  eventDate: string;
  eventStartTime: string;
  eventEndDate: string;
  eventEndTime: string;
  dateWheelVisible: boolean;
  timeWheelVisible: boolean;
  onChangeEventTitle: (value: string) => void;
  onChangeEventDescription: (value: string) => void;
  onOpenDateWheel: (target: DateWheelTarget) => void;
  onOpenTimeWheel: (target: "start" | "end") => void;
  renderDateWheelPanel: () => React.ReactNode;
  renderTimeWheelPanel: () => React.ReactNode;
  shareWithOtherHousehold: boolean;
  onChangeShareWithOtherHousehold: (value: boolean) => void;
  sharedViewEnabled: boolean;
  canShareWithOtherHousehold: boolean;
};

export function CalendarEventFormFields({
  styles,
  colors,
  saving,
  eventTitle,
  eventDescription,
  eventDate,
  eventStartTime,
  eventEndDate,
  eventEndTime,
  dateWheelVisible,
  timeWheelVisible,
  onChangeEventTitle,
  onChangeEventDescription,
  onOpenDateWheel,
  onOpenTimeWheel,
  renderDateWheelPanel,
  renderTimeWheelPanel,
  shareWithOtherHousehold,
  onChangeShareWithOtherHousehold,
  sharedViewEnabled,
  canShareWithOtherHousehold,
}: CalendarEventFormFieldsProps) {
  return (
    <>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
        value={eventTitle}
        onChangeText={onChangeEventTitle}
        placeholder="Titre"
        placeholderTextColor={colors.textSecondary}
      />
      <TextInput
        style={[
          styles.input,
          styles.inputMultiline,
          { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon },
        ]}
        value={eventDescription}
        onChangeText={onChangeEventDescription}
        placeholder="Description (optionnel)"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
      <View style={styles.timeRow}>
        <TouchableOpacity
          onPress={() => onOpenDateWheel("event_start")}
          style={[styles.pickerFieldBtn, styles.dateInput, { borderColor: colors.icon, backgroundColor: colors.background }]}
          disabled={saving}
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.pickerFieldText, { color: colors.text }]}>{eventDate}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onOpenTimeWheel("start")}
          style={[styles.pickerFieldBtn, styles.timeInput, { borderColor: colors.icon, backgroundColor: colors.background }]}
          disabled={saving}
        >
          <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.pickerFieldText, { color: colors.text }]}>{eventStartTime}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.timeRow}>
        <TouchableOpacity
          onPress={() => onOpenDateWheel("event_end")}
          style={[styles.pickerFieldBtn, styles.dateInput, { borderColor: colors.icon, backgroundColor: colors.background }]}
          disabled={saving}
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.pickerFieldText, { color: colors.text }]}>{eventEndDate}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onOpenTimeWheel("end")}
          style={[styles.pickerFieldBtn, styles.timeInput, { borderColor: colors.icon, backgroundColor: colors.background }]}
          disabled={saving}
        >
          <MaterialCommunityIcons name="clock-time-four-outline" size={16} color={colors.textSecondary} />
          <Text style={[styles.pickerFieldText, { color: colors.text }]}>{eventEndTime}</Text>
        </TouchableOpacity>
      </View>

      {dateWheelVisible ? renderDateWheelPanel() : null}
      {timeWheelVisible ? renderTimeWheelPanel() : null}

      <Text style={[styles.label, { color: colors.text }]}>Visibilité inter-foyers</Text>
      <View style={styles.visibilityRow}>
        <TouchableOpacity
          onPress={() => onChangeShareWithOtherHousehold(false)}
          style={[
            styles.visibilityChip,
            { borderColor: colors.icon, backgroundColor: colors.background },
            !shareWithOtherHousehold && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
          ]}
        >
          <Text style={{ color: colors.text }}>Privé au foyer</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (canShareWithOtherHousehold) {
              onChangeShareWithOtherHousehold(true);
            }
          }}
          style={[
            styles.visibilityChip,
            { borderColor: colors.icon, backgroundColor: colors.background },
            shareWithOtherHousehold && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
            !canShareWithOtherHousehold && { opacity: 0.45 },
          ]}
        >
          <Text style={{ color: colors.text }}>Partager</Text>
        </TouchableOpacity>
      </View>

      {!sharedViewEnabled ? (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Le partage inter-foyers est désactivé dans la configuration du foyer.
        </Text>
      ) : !canShareWithOtherHousehold ? (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Le partage d&apos;un événement vers un autre foyer est réservé à un parent.
        </Text>
      ) : (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          Choisis si cet événement doit rester interne au foyer ou être visible dans l&apos;autre foyer.
        </Text>
      )}
    </>
  );
}
