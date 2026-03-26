import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

import { mealTypeColor, mealTypeLabel } from "@/src/features/calendar/calendar-types";
import {
  formatMemberList,
  mealPresenceLabel,
} from "@/src/features/calendar/calendar-tab.helpers";
import type { MealPlanEntry, MealPresenceStatus } from "@/src/features/calendar/calendar-tab.types";

type CalendarMealDayItemCardProps = {
  entry: MealPlanEntry;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  absenceTrackingEnabled: boolean;
  canManageMealPlan: boolean;
  onSubmitPresence: (mealPlanId: number, status: MealPresenceStatus, reason?: string | null) => void;
  onOpenReasonModal: (entry: MealPlanEntry, status: Extract<MealPresenceStatus, "not_home" | "later">) => void;
  onOpenShoppingListPicker: (entry: MealPlanEntry) => void;
  onOpenEditor: (entry: MealPlanEntry) => void;
  onConfirmDelete: (entry: MealPlanEntry) => void;
};

export function CalendarMealDayItemCard({
  entry,
  styles,
  colors,
  saving,
  absenceTrackingEnabled,
  canManageMealPlan,
  onSubmitPresence,
  onOpenReasonModal,
  onOpenShoppingListPicker,
  onOpenEditor,
  onConfirmDelete,
}: CalendarMealDayItemCardProps) {
  return (
    <View style={[styles.itemCard, { borderColor: colors.icon, backgroundColor: colors.background }]}>
      <View style={styles.itemHeaderRow}>
        <View style={[styles.badge, { backgroundColor: `${mealTypeColor(entry.meal_type)}22` }]}>
          <Text style={[styles.badgeText, { color: mealTypeColor(entry.meal_type) }]}>{mealTypeLabel(entry.meal_type)}</Text>
        </View>
        <Text style={[styles.itemMetaText, { color: colors.textSecondary, flex: 1, textAlign: "right" }]}>
          {entry.custom_title?.trim()
            ? "Repas libre"
            : `${entry.recipes.length} recette${entry.recipes.length > 1 ? "s" : ""}`}
        </Text>
      </View>
      <Text style={[styles.itemTitle, { color: colors.text }]}>
        {entry.custom_title?.trim() || entry.recipes.map((recipe) => recipe.title).join(", ")}
      </Text>
      {entry.note ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{entry.note}</Text> : null}

      {absenceTrackingEnabled ? (
        <>
          <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
            {entry.my_presence
              ? `Votre présence: ${mealPresenceLabel(entry.my_presence.status)}`
              : "Votre présence n'est pas encore confirmée."}
          </Text>
          {entry.my_presence?.reason ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              Justification: {entry.my_presence.reason}
            </Text>
          ) : null}
          <View style={styles.itemActionsRow}>
            <TouchableOpacity
              style={[
                styles.inlineActionBtn,
                { borderColor: colors.icon },
                entry.my_presence?.status === "present" && {
                  borderColor: colors.tint,
                  backgroundColor: `${colors.tint}16`,
                },
              ]}
              onPress={() => onSubmitPresence(entry.id, "present", null)}
              disabled={saving}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Je participe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionBtn,
                { borderColor: colors.icon },
                entry.my_presence?.status === "not_home" && {
                  borderColor: colors.tint,
                  backgroundColor: `${colors.tint}16`,
                },
              ]}
              onPress={() => onOpenReasonModal(entry, "not_home")}
              disabled={saving}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Pas à la maison</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionBtn,
                { borderColor: colors.icon },
                entry.my_presence?.status === "later" && {
                  borderColor: colors.tint,
                  backgroundColor: `${colors.tint}16`,
                },
              ]}
              onPress={() => onOpenReasonModal(entry, "later")}
              disabled={saving}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Je mangerai plus tard</Text>
            </TouchableOpacity>
          </View>
          {entry.presence_overview ? (
            <View style={styles.inlineSummaryBlock}>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Présents: {formatMemberList(entry.presence_overview.present)}
              </Text>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Pas à la maison: {formatMemberList(entry.presence_overview.not_home)}
              </Text>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Plus tard: {formatMemberList(entry.presence_overview.later)}
              </Text>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Sans réponse: {formatMemberList(entry.presence_overview.unanswered)}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {canManageMealPlan ? (
        <View style={styles.itemActionsRow}>
          <TouchableOpacity
            style={[
              styles.inlineActionBtn,
              { borderColor: colors.icon, opacity: saving ? 0.45 : 1 },
            ]}
            onPress={() => onOpenShoppingListPicker(entry)}
            disabled={saving}
          >
            <MaterialCommunityIcons name="cart-plus" size={16} color={colors.tint} />
            <Text style={[styles.inlineActionText, { color: colors.text }]}>Courses</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
            onPress={() => onOpenEditor(entry)}
            disabled={saving}
          >
            <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.tint} />
            <Text style={[styles.inlineActionText, { color: colors.text }]}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
            onPress={() => onConfirmDelete(entry)}
            disabled={saving}
          >
            <MaterialCommunityIcons name="delete-outline" size={16} color="#D96C6C" />
            <Text style={[styles.inlineActionText, { color: colors.text }]}>Supprimer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
