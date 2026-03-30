import React from "react";
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Colors } from "@/constants/theme";
import type { MealType } from "@/src/features/calendar/calendar-types";

type RankingVoter = {
  user_id: number;
  name: string;
};

type RankingOption = {
  id: number;
  recipe_id: number;
  votes_count: number;
  voters?: RankingVoter[];
  recipe?: {
    title?: string;
  };
};

type RecipeSuggestion = {
  id: number;
  title: string;
};

type Assignment = {
  slotKey: string;
  date: string;
  meal_type: MealType;
  recipe_id: number;
  servings: number;
};

type MealPollClosedViewProps = {
  theme: typeof Colors.light;
  styles: any;
  closedRanking: RankingOption[];
  isParent: boolean;
  filteredValidationRecipes: RecipeSuggestion[];
  validationSearchRecipe: string;
  validationManualTitle: string;
  sortedAssignments: Assignment[];
  recipesById: Map<number, { title?: string }>;
  saving: boolean;
  isValidationSearchFetching: boolean;
  formatMealPlanDate: (isoDate: string) => string;
  onOpenPlanner: (recipeId: number) => void;
  onValidationSearchRecipeChange: (value: string) => void;
  onAddExistingRecipeToValidation: (recipeId: number) => void;
  onValidationManualTitleChange: (value: string) => void;
  onAddManualValidationRecipe: () => void;
  onRemoveAssignment: (slotKey: string) => void;
  onOpenPollShoppingListPicker: () => void;
  onValidatePoll: () => void;
};

export function MealPollClosedView({
  theme,
  styles,
  closedRanking,
  isParent,
  filteredValidationRecipes,
  validationSearchRecipe,
  validationManualTitle,
  sortedAssignments,
  recipesById,
  saving,
  isValidationSearchFetching,
  formatMealPlanDate,
  onOpenPlanner,
  onValidationSearchRecipeChange,
  onAddExistingRecipeToValidation,
  onValidationManualTitleChange,
  onAddManualValidationRecipe,
  onRemoveAssignment,
  onOpenPollShoppingListPicker,
  onValidatePoll,
}: MealPollClosedViewProps) {
  const maxVotes = Math.max(1, ...closedRanking.map((option) => option.votes_count));

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>Résultats du sondage</Text>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>Classement des plats</Text>

      {closedRanking.map((option, index) => {
        const percent = Math.round((option.votes_count / maxVotes) * 100);

        return (
          <View key={`result-${option.id}`} style={[styles.resultCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
            <View style={styles.resultHeaderRow}>
              <Text style={{ color: theme.text, fontWeight: "700", flex: 1 }} numberOfLines={1}>{index + 1}. {option.recipe?.title || "Recette"}</Text>
              <Text style={{ color: theme.textSecondary, fontWeight: "700" }}>{option.votes_count} vote(s)</Text>
            </View>

            <View style={[styles.resultBarBg, { backgroundColor: `${theme.icon}33` }]}>
              <View style={[styles.resultBarFill, { backgroundColor: theme.tint, width: `${percent}%` }]} />
            </View>

            <View style={styles.votersChipsRow}>
              {Array.isArray(option.voters) && option.voters.length > 0 ? (
                option.voters.slice(0, 6).map((voter) => (
                  <View key={`opt-${option.id}-voter-${voter.user_id}`} style={[styles.voterChip, { borderColor: theme.icon }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={1}>{voter.name}</Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Aucun vote sur ce plat</Text>
              )}
            </View>

            {isParent ? (
              <View style={styles.resultActionsRow}>
                <TouchableOpacity
                  onPress={() => onOpenPlanner(option.recipe_id)}
                  style={[styles.resultActionBtn, { borderColor: theme.icon, backgroundColor: theme.card }]}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>Planifier</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}

      {isParent ? (
        <>
          <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Ajouter une autre recette</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, color: theme.text, marginBottom: 8 }]}
              value={validationSearchRecipe}
              onChangeText={onValidationSearchRecipeChange}
              placeholder="Rechercher une recette du foyer"
              placeholderTextColor={theme.textSecondary}
            />
            {isValidationSearchFetching ? <ActivityIndicator size="small" color={theme.tint} /> : null}

            {validationSearchRecipe.trim().length > 0 ? (
              <View style={[styles.suggestionsBox, { borderColor: theme.icon, backgroundColor: theme.card }]}>
                {filteredValidationRecipes.slice(0, 6).map((recipe) => (
                  <TouchableOpacity
                    key={`validation-suggestion-${recipe.id}`}
                    onPress={() => onAddExistingRecipeToValidation(recipe.id)}
                    style={styles.suggestionRow}
                  >
                    <Text style={{ color: theme.text, flex: 1 }} numberOfLines={1}>{recipe.title}</Text>
                    <MaterialCommunityIcons name="plus-circle-outline" size={20} color={theme.tint} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <View style={styles.manualRow}>
              <TextInput
                style={[styles.input, styles.manualInput, { backgroundColor: theme.card, color: theme.text }]}
                value={validationManualTitle}
                onChangeText={onValidationManualTitleChange}
                placeholder="Repas hors sondage"
                placeholderTextColor={theme.textSecondary}
              />
              <TouchableOpacity
                onPress={onAddManualValidationRecipe}
                style={[styles.smallActionBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                <Text style={styles.smallActionBtnText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
            <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Menu de la semaine</Text>
            {sortedAssignments.length > 0 ? (
              sortedAssignments.map((assignment) => {
                const recipe = recipesById.get(assignment.recipe_id);
                return (
                  <View key={`assignment-${assignment.slotKey}`} style={[styles.assignmentRow, { borderColor: theme.icon }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>{recipe?.title || `Recette ${assignment.recipe_id}`}</Text>
                      <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                        {formatMealPlanDate(assignment.date)} - {assignment.meal_type} - {assignment.servings} portions
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => onRemoveAssignment(assignment.slotKey)}>
                      <MaterialCommunityIcons name="close-circle-outline" size={22} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: theme.textSecondary }}>Aucun repas planifié pour l&apos;instant.</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onOpenPollShoppingListPicker}
            style={[
              styles.secondaryBtn,
              { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving || sortedAssignments.length === 0 ? 0.5 : 1 },
            ]}
            disabled={saving || sortedAssignments.length === 0}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Ajouter à la liste de courses</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onValidatePoll}
            style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Valider le menu de la semaine</Text>}
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

