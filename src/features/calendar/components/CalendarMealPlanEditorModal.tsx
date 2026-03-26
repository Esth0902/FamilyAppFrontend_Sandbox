import React from "react";
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { MealType } from "@/src/features/calendar/calendar-types";
import type { RecipeOption } from "@/src/features/calendar/calendar-tab.types";

type CalendarMealPlanEditorModalProps = {
  visible: boolean;
  onClose: () => void;
  saving: boolean;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  mealTypes: { label: string; value: MealType }[];
  mealPlanDate: string;
  onChangeMealPlanDate: (value: string) => void;
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
  onSave: () => void;
};

export function CalendarMealPlanEditorModal({
  visible,
  onClose,
  saving,
  styles,
  colors,
  mealTypes,
  mealPlanDate,
  onChangeMealPlanDate,
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
  onSave,
}: CalendarMealPlanEditorModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Modifier le repas</Text>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <MaterialCommunityIcons name="close" size={22} color={colors.tint} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon }]}
              value={mealPlanDate}
              onChangeText={onChangeMealPlanDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, { color: colors.text }]}>Moment du repas</Text>
            <View style={styles.visibilityRow}>
              {mealTypes.map((mealType) => (
                <TouchableOpacity
                  key={mealType.value}
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
                    key={`recipe-${recipe.id}`}
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
                  : "Aucune recette disponible pour modifier ce repas."}
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
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.secondaryBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
              disabled={saving}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSave}
              style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: colors.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.primaryBtnText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
