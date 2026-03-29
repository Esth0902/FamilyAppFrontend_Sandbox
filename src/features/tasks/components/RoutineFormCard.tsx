import React, { memo } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { WheelDatePicker } from "@/src/components/ui/WheelDatePicker";
import { tasksManageStyles as styles } from "@/src/features/tasks/tasks-manage.styles";
import { recurrenceLabel, WEEK_DAYS } from "@/src/features/tasks/tasks-manage.utils";

import type { TaskMember } from "@/src/features/tasks/hooks/useTasksBoard";

type RoutineFormCardProps = {
  theme: typeof Colors.light;
  saving: boolean;
  editingTemplateId: number | null;
  members: TaskMember[];
  templateName: string;
  templateDescription: string;
  templateRecurrence: "daily" | "weekly" | "monthly" | "once";
  templateRecurrenceDays: number[];
  templateHasEndDate: boolean;
  templateStartDate: string;
  templateEndDate: string;
  templateStartDateWheelVisible: boolean;
  templateEndDateWheelVisible: boolean;
  templateEndMinDate?: string;
  templateRotation: boolean;
  templateRotationCycleWeeks: 1 | 2;
  templateAssigneeUserIds: number[];
  templateRotationUserIds: number[];
  templateInterHouseholdAlternating: boolean;
  templateInterHouseholdWeekStart: string;
  templateInterHouseholdWeekStartWheelVisible: boolean;
  interHouseholdWeekLabel: string;
  interHouseholdWeekStartIso: string;
  onTemplateNameChange: (value: string) => void;
  onTemplateDescriptionChange: (value: string) => void;
  onRecurrenceSelect: (value: "daily" | "weekly" | "monthly") => void;
  onToggleRecurrenceDay: (value: number) => void;
  onToggleHasEndDate: () => void;
  onToggleStartDateWheel: () => void;
  onToggleEndDateWheel: () => void;
  onStartDateChange: (nextIsoDate: string) => void;
  onEndDateChange: (nextIsoDate: string) => void;
  onToggleRotation: () => void;
  onSetRotationCycleWeeks: (value: 1 | 2) => void;
  onToggleAssignee: (memberId: number) => void;
  onToggleRotationMember: (memberId: number) => void;
  onMoveRotationMember: (memberId: number, direction: "up" | "down") => void;
  onToggleInterHouseholdAlternating: () => void;
  onToggleInterHouseholdWeekStartWheel: () => void;
  onInterHouseholdWeekStartChange: (nextIsoDate: string) => void;
  onSave: () => void;
};

export const RoutineFormCard = memo(function RoutineFormCard({
  theme,
  saving,
  editingTemplateId,
  members,
  templateName,
  templateDescription,
  templateRecurrence,
  templateRecurrenceDays,
  templateHasEndDate,
  templateStartDate,
  templateEndDate,
  templateStartDateWheelVisible,
  templateEndDateWheelVisible,
  templateEndMinDate,
  templateRotation,
  templateRotationCycleWeeks,
  templateAssigneeUserIds,
  templateRotationUserIds,
  templateInterHouseholdAlternating,
  templateInterHouseholdWeekStart,
  templateInterHouseholdWeekStartWheelVisible,
  interHouseholdWeekLabel,
  interHouseholdWeekStartIso,
  onTemplateNameChange,
  onTemplateDescriptionChange,
  onRecurrenceSelect,
  onToggleRecurrenceDay,
  onToggleHasEndDate,
  onToggleStartDateWheel,
  onToggleEndDateWheel,
  onStartDateChange,
  onEndDateChange,
  onToggleRotation,
  onSetRotationCycleWeeks,
  onToggleAssignee,
  onToggleRotationMember,
  onMoveRotationMember,
  onToggleInterHouseholdAlternating,
  onToggleInterHouseholdWeekStartWheel,
  onInterHouseholdWeekStartChange,
  onSave,
}: RoutineFormCardProps) {
  return (
    <>
      <TextInput
        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
        value={templateName}
        onChangeText={onTemplateNameChange}
        placeholder="Nom de la routine"
        placeholderTextColor={theme.textSecondary}
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.icon }]}
        value={templateDescription}
        onChangeText={onTemplateDescriptionChange}
        placeholder="Description (optionnel)"
        placeholderTextColor={theme.textSecondary}
      />

      <View style={styles.recurrenceRow}>
        {(["daily", "weekly", "monthly"] as const).map((recurrence) => (
          <TouchableOpacity
            key={recurrence}
            onPress={() => onRecurrenceSelect(recurrence)}
            style={[
              styles.recurrenceChip,
              { borderColor: theme.icon, backgroundColor: theme.background },
              templateRecurrence === recurrence && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
            ]}
          >
            <Text style={{ color: theme.text, fontSize: 12 }}>{recurrenceLabel(recurrence)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {templateRecurrence === "weekly" ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Jour d'exécution</Text>
          <View style={styles.recurrenceRow}>
            {WEEK_DAYS.map((day) => (
              <TouchableOpacity
                key={`routine-day-${day.value}`}
                onPress={() => onToggleRecurrenceDay(day.value)}
                style={[
                  styles.recurrenceChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  templateRecurrenceDays.includes(day.value) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                ]}
              >
                <Text style={{ color: theme.text, fontSize: 12 }}>{day.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      <Text style={[styles.label, { color: theme.text }]}>Date de début</Text>
      <TouchableOpacity
        onPress={onToggleStartDateWheel}
        style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
        disabled={saving}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
        <Text style={[styles.pickerFieldText, { color: theme.text }]}>{templateStartDate}</Text>
      </TouchableOpacity>
      <WheelDatePicker
        visible={templateStartDateWheelVisible}
        title="Choisir la date de début"
        value={templateStartDate}
        onChange={onStartDateChange}
        theme={theme}
      />

      <View style={styles.toggleRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Date de fin</Text>
        <TouchableOpacity
          onPress={onToggleHasEndDate}
          style={[styles.switchPill, { borderColor: theme.icon, backgroundColor: templateHasEndDate ? `${theme.tint}20` : theme.background }]}
          disabled={saving}
        >
          <Text style={{ color: templateHasEndDate ? theme.tint : theme.textSecondary, fontSize: 12, fontWeight: "700" }}>
            {templateHasEndDate ? "Activée" : "Désactivée"}
          </Text>
        </TouchableOpacity>
      </View>

      {templateHasEndDate ? (
        <>
          <TouchableOpacity
            onPress={onToggleEndDateWheel}
            style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            disabled={saving}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.pickerFieldText, { color: theme.text }]}>{templateEndDate}</Text>
          </TouchableOpacity>
          <WheelDatePicker
            visible={templateEndDateWheelVisible}
            title="Choisir la date de fin"
            value={templateEndDate}
            minValue={templateEndMinDate}
            onChange={onEndDateChange}
            theme={theme}
          />
        </>
      ) : null}

      <View style={styles.toggleRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Rotation</Text>
        <TouchableOpacity
          onPress={onToggleRotation}
          style={[styles.switchPill, { borderColor: theme.icon, backgroundColor: templateRotation ? `${theme.tint}20` : theme.background }]}
          disabled={saving}
        >
          <Text style={{ color: templateRotation ? theme.tint : theme.textSecondary, fontSize: 12, fontWeight: "700" }}>
            {templateRotation ? "Activée" : "Désactivée"}
          </Text>
        </TouchableOpacity>
      </View>

      {templateRotation ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Cycle de rotation</Text>
          <View style={styles.recurrenceRow}>
            {[1, 2].map((cycle) => (
              <TouchableOpacity
                key={`cycle-${cycle}`}
                onPress={() => onSetRotationCycleWeeks(cycle as 1 | 2)}
                style={[
                  styles.recurrenceChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  templateRotationCycleWeeks === cycle && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                ]}
              >
                <Text style={{ color: theme.text, fontSize: 12 }}>{cycle === 1 ? "1 semaine" : "2 semaines"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Ordre de rotation</Text>
          <View style={styles.rotationOrderList}>
            {templateRotationUserIds.map((memberId, index) => {
              const member = members.find((item) => item.id === memberId);
              return (
                <View key={`rotation-order-${memberId}`} style={[styles.rotationOrderItem, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                  <Text style={[styles.rotationOrderName, { color: theme.text }]}>{`${index + 1}. ${member?.name ?? `#${memberId}`}`}</Text>
                  <View style={styles.rotationOrderActions}>
                    <TouchableOpacity
                      onPress={() => onMoveRotationMember(memberId, "up")}
                      style={[styles.iconBtn, { borderColor: theme.icon, opacity: index === 0 ? 0.35 : 1 }]}
                      disabled={saving || index === 0}
                    >
                      <MaterialCommunityIcons name="chevron-up" size={18} color={theme.tint} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onMoveRotationMember(memberId, "down")}
                      style={[styles.iconBtn, { borderColor: theme.icon, opacity: index === templateRotationUserIds.length - 1 ? 0.35 : 1 }]}
                      disabled={saving || index === templateRotationUserIds.length - 1}
                    >
                      <MaterialCommunityIcons name="chevron-down" size={18} color={theme.tint} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onToggleRotationMember(memberId)}
                      style={[styles.iconBtn, { borderColor: theme.icon }]}
                      disabled={saving}
                    >
                      <MaterialCommunityIcons name="close" size={18} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Membres concernés</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memberRow}
          >
            {members.map((member) => (
              <TouchableOpacity
                key={`rotation-member-${member.id}`}
                onPress={() => onToggleRotationMember(member.id)}
                style={[
                  styles.memberChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  templateRotationUserIds.includes(member.id) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                ]}
                disabled={saving}
              >
                <Text style={{ color: theme.text }}>{member.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      ) : (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.memberRow}
          >
            {members.map((member) => (
              <TouchableOpacity
                key={`assignee-member-${member.id}`}
                onPress={() => onToggleAssignee(member.id)}
                style={[
                  styles.memberChip,
                  { borderColor: theme.icon, backgroundColor: theme.background },
                  templateAssigneeUserIds.includes(member.id) && { borderColor: theme.tint, backgroundColor: `${theme.tint}20` },
                ]}
                disabled={saving}
              >
                <Text style={{ color: theme.text }}>{member.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <View style={styles.toggleRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Alternance inter-foyer</Text>
        <TouchableOpacity
          onPress={onToggleInterHouseholdAlternating}
          style={[styles.switchPill, { borderColor: theme.icon, backgroundColor: templateInterHouseholdAlternating ? `${theme.tint}20` : theme.background }]}
          disabled={saving}
        >
          <Text style={{ color: templateInterHouseholdAlternating ? theme.tint : theme.textSecondary, fontSize: 12, fontWeight: "700" }}>
            {templateInterHouseholdAlternating ? "Activée" : "Désactivée"}
          </Text>
        </TouchableOpacity>
      </View>

      {templateInterHouseholdAlternating ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Début de semaine à la maison</Text>
          <TouchableOpacity
            onPress={onToggleInterHouseholdWeekStartWheel}
            style={[styles.pickerFieldBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
            disabled={saving}
          >
            <MaterialCommunityIcons name="calendar-month-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.pickerFieldText, { color: theme.text }]}>{templateInterHouseholdWeekStart}</Text>
          </TouchableOpacity>
          <WheelDatePicker
            visible={templateInterHouseholdWeekStartWheelVisible}
            title="Choisir la semaine à la maison"
            value={templateInterHouseholdWeekStart}
            onChange={onInterHouseholdWeekStartChange}
            theme={theme}
          />

          <View style={[styles.weekCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
            <View style={styles.weekRow}>
              <View style={styles.weekCenter}>
                <Text style={[styles.weekTitle, { color: theme.text }]}>{interHouseholdWeekLabel}</Text>
                <Text style={[styles.weekRange, { color: theme.textSecondary }]}>{`Référence: ${interHouseholdWeekStartIso}`}</Text>
              </View>
            </View>
          </View>
        </>
      ) : null}

      <TouchableOpacity
        onPress={onSave}
        style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text style={styles.primaryBtnText}>{editingTemplateId ? "Enregistrer la routine" : "Ajouter la routine"}</Text>
        )}
      </TouchableOpacity>
    </>
  );
});
