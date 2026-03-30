import React from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { DateWheelTarget, RecipeOption } from "@/src/features/calendar/calendar-tab.types";
import type { MealType } from "@/src/features/calendar/calendar-types";

type CalendarMealFormFieldsProps = {
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  mealPlanDate: string;
  dateWheelVisible: boolean;
  dateWheelTarget: DateWheelTarget;
  onOpenDateWheel: (target: DateWheelTarget) => void;
  renderDateWheelPanel: () => React.ReactNode;
  mealTypes: { label: string; value: MealType }[];
  mealPlanType: MealType;
  onSelectMealType: (value: MealType) => void;
  mealPlanSearch: string;
  onChangeMealPlanSearch: (value: string) => void;
  mealPlanRecipeSearchFetching: boolean;
  recipeOptions: RecipeOption[];
  filteredRecipeOptions: RecipeOption[];
  mealPlanRecipeId: number | null;
  onSelectRecipe: (recipeId: number) => void;
  selectedMealRecipeTitle: string | null;
  mealPlanCustomTitle: string;
  onChangeMealPlanCustomTitle: (value: string) => void;
  mealPlanServings: string;
  onChangeMealPlanServings: (value: string) => void;
  mealPlanNote: string;
  onChangeMealPlanNote: (value: string) => void;
};

export function CalendarMealFormFields({
  styles,
  colors,
  saving,
  mealPlanDate,
  dateWheelVisible,
  dateWheelTarget,
  onOpenDateWheel,
  renderDateWheelPanel,
  mealTypes,
  mealPlanType,
  onSelectMealType,
  mealPlanSearch,
  onChangeMealPlanSearch,
  mealPlanRecipeSearchFetching,
  recipeOptions,
  filteredRecipeOptions,
  mealPlanRecipeId,
  onSelectRecipe,
  selectedMealRecipeTitle,
  mealPlanCustomTitle,
  onChangeMealPlanCustomTitle,
  mealPlanServings,
  onChangeMealPlanServings,
  mealPlanNote,
  onChangeMealPlanNote,
}: CalendarMealFormFieldsProps) {
  return (
    <>
      <Text style={[styles.label, { color: colors.text }]}>Date</Text>
      <TouchableOpacity
        onPress={() => onOpenDateWheel("meal_date")}
        style={[styles.pickerFieldBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
        disabled={saving}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={16} color={colors.textSecondary} />
        <Text style={[styles.pickerFieldText, { color: colors.text }]}>{mealPlanDate}</Text>
      </TouchableOpacity>
      {dateWheelVisible && dateWheelTarget === "meal_date" ? renderDateWheelPanel() : null}

      <Text style={[styles.label, { color: colors.text }]}>Moment du repas</Text>
      <View style={styles.visibilityRow}>
        {mealTypes.map((mealType) => (
          <TouchableOpacity
            key={`new-meal-type-${mealType.value}`}
            onPress={() => onSelectMealType(mealType.value)}
            style={[
              styles.visibilityChip,
              { borderColor: colors.icon, backgroundColor: colors.background },
              mealPlanType === mealType.value && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
            ]}
          >
            <Text style={{ color: colors.text }}>{mealType.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Recette</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
        value={mealPlanSearch}
        onChangeText={onChangeMealPlanSearch}
        placeholder="Rechercher une recette"
        placeholderTextColor={colors.textSecondary}
      />
      {mealPlanRecipeSearchFetching ? <ActivityIndicator size="small" color={colors.tint} /> : null}
      {recipeOptions.length > 0 ? (
        <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipePickerRow}>
          {filteredRecipeOptions.map((recipe) => (
            <TouchableOpacity
              key={`new-recipe-${recipe.id}`}
              onPress={() => onSelectRecipe(recipe.id)}
              style={[
                styles.recipeChip,
                { borderColor: colors.icon, backgroundColor: colors.background },
                mealPlanRecipeId === recipe.id && { borderColor: colors.tint, backgroundColor: `${colors.tint}18` },
              ]}
            >
              <Text style={[styles.recipeChipText, { color: colors.text }]}>{recipe.title}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>
          {mealPlanSearch.trim().length > 0
            ? "Aucune recette ne correspond à cette recherche."
            : "Aucune recette disponible."}
        </Text>
      )}

      {selectedMealRecipeTitle ? (
        <Text style={[styles.helperText, { color: colors.textSecondary }]}>Recette choisie: {selectedMealRecipeTitle}</Text>
      ) : null}

      <Text style={[styles.label, { color: colors.text }]}>Ou repas libre</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
        value={mealPlanCustomTitle}
        onChangeText={onChangeMealPlanCustomTitle}
        placeholder="Ex: Resto, Sandwichs, Pique-nique"
        placeholderTextColor={colors.textSecondary}
      />

      <TextInput
        style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
        value={mealPlanServings}
        onChangeText={onChangeMealPlanServings}
        placeholder="Portions"
        placeholderTextColor={colors.textSecondary}
        keyboardType="numeric"
      />

      <TextInput
        style={[
          styles.input,
          styles.inputMultiline,
          { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon },
        ]}
        value={mealPlanNote}
        onChangeText={onChangeMealPlanNote}
        placeholder="Note (optionnel)"
        placeholderTextColor={colors.textSecondary}
        multiline
      />
    </>
  );
}
