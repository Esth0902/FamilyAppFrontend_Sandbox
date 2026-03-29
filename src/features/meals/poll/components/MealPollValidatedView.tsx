import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

import type { Colors } from "@/constants/theme";
import type { MealType } from "@/src/features/calendar/calendar-types";

type RankingOption = {
  recipe_id: number;
  votes_count: number;
};

type Assignment = {
  slotKey: string;
  date: string;
  meal_type: MealType;
  recipe_id: number;
  servings: number;
};

type MealPollValidatedViewProps = {
  theme: typeof Colors.light;
  styles: any;
  selectedRecipeIdsForValidation: number[];
  closedRanking: RankingOption[];
  sortedAssignments: Assignment[];
  recipesById: Map<number, { title?: string }>;
  isParent: boolean;
  saving: boolean;
  formatMealPlanDate: (isoDate: string) => string;
  onOpenPollShoppingListPicker: () => void;
};

export function MealPollValidatedView({
  theme,
  styles,
  selectedRecipeIdsForValidation,
  closedRanking,
  sortedAssignments,
  recipesById,
  isParent,
  saving,
  formatMealPlanDate,
  onOpenPollShoppingListPicker,
}: MealPollValidatedViewProps) {
  const selectedIds = selectedRecipeIdsForValidation.length > 0
    ? selectedRecipeIdsForValidation
    : closedRanking.filter((option) => option.votes_count > 0).map((option) => option.recipe_id);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>Sondage validé</Text>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>Plats retenus</Text>

      {selectedIds.length > 0 ? (
        selectedIds.map((recipeId) => {
          const recipe = recipesById.get(recipeId);
          return (
            <View key={`validated-${recipeId}`} style={[styles.assignmentRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
              <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{recipe?.title || `Recette ${recipeId}`}</Text>
            </View>
          );
        })
      ) : (
        <Text style={{ color: theme.textSecondary }}>Aucune recette validée détectée.</Text>
      )}

      {sortedAssignments.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>Planification</Text>
          {sortedAssignments.map((assignment) => {
            const recipe = recipesById.get(assignment.recipe_id);
            return (
              <View key={`validated-plan-${assignment.slotKey}`} style={[styles.assignmentRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{recipe?.title || `Recette ${assignment.recipe_id}`}</Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                    {formatMealPlanDate(assignment.date)} - {assignment.meal_type} - {assignment.servings} portions
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {isParent && sortedAssignments.length > 0 ? (
        <TouchableOpacity
          onPress={onOpenPollShoppingListPicker}
          style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
          disabled={saving}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>Ajouter à la liste de courses</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

