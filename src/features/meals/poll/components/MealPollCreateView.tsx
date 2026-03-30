import React from "react";
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";

import type { Colors } from "@/constants/theme";

type RecipeSummary = {
  id: number;
  title: string;
  type?: string;
};

type AiPreviewIngredient = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
};

type AiPreviewRecipe = {
  title: string;
  description: string;
  instructions: string;
  type: string;
  ingredients: AiPreviewIngredient[];
};

type MealPollCreateViewProps = {
  theme: typeof Colors.light;
  styles: any;
  isEditingOpenPoll: boolean;
  saving: boolean;
  aiLoading: boolean;
  pollTitle: string;
  durationHours: number;
  maxVotesPerUser: number;
  planningStartDate: string;
  planningEndDate: string;
  searchRecipe: string;
  manualTitle: string;
  aiPreview: AiPreviewRecipe | null;
  filteredCreationRecipes: RecipeSummary[];
  selectedRecipeIdsForCreation: number[];
  selectedCreationRecipes: RecipeSummary[];
  isCreationSearchFetching: boolean;
  onPollTitleChange: (value: string) => void;
  onDurationHoursChange: (updater: (previous: number) => number) => void;
  onMaxVotesPerUserChange: (updater: (previous: number) => number) => void;
  onOpenPlanningPicker: (target: "start" | "end") => void;
  onSearchRecipeChange: (value: string) => void;
  onToggleCreateRecipe: (recipeId: number) => void;
  onManualTitleChange: (value: string) => void;
  onSaveManualRecipeForCreation: () => void;
  onPreviewAiRecipe: () => void;
  onSaveAiRecipe: () => void;
  onRemoveCreateRecipe: (recipeId: number) => void;
  onSavePoll: () => void;
  onCancelEditOpenPoll: () => void;
};

export function MealPollCreateView({
  theme,
  styles,
  isEditingOpenPoll,
  saving,
  aiLoading,
  pollTitle,
  durationHours,
  maxVotesPerUser,
  planningStartDate,
  planningEndDate,
  searchRecipe,
  manualTitle,
  aiPreview,
  filteredCreationRecipes,
  selectedRecipeIdsForCreation,
  selectedCreationRecipes,
  isCreationSearchFetching,
  onPollTitleChange,
  onDurationHoursChange,
  onMaxVotesPerUserChange,
  onOpenPlanningPicker,
  onSearchRecipeChange,
  onToggleCreateRecipe,
  onManualTitleChange,
  onSaveManualRecipeForCreation,
  onPreviewAiRecipe,
  onSaveAiRecipe,
  onRemoveCreateRecipe,
  onSavePoll,
  onCancelEditOpenPoll,
}: MealPollCreateViewProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>
        {isEditingOpenPoll ? "Modifier le sondage ouvert" : "Créer le sondage de la semaine"}
      </Text>
      {isEditingOpenPoll ? (
        <Text style={[styles.helperText, { color: theme.textSecondary }]}>
          Corrige les paramètres puis enregistre les modifications.
        </Text>
      ) : null}

      <TextInput
        style={[styles.input, { backgroundColor: theme.background, color: theme.text, marginTop: 12 }]}
        value={pollTitle}
        onChangeText={onPollTitleChange}
        placeholder="Titre du sondage (optionnel)"
        placeholderTextColor={theme.textSecondary}
      />

      <View style={[styles.settingsGrid, { marginTop: 6 }]}>
        <View style={[styles.settingCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>Durée (heures)</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => onDurationHoursChange((prev) => Math.max(1, prev - 1))}
              style={[styles.stepperBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.stepperValue, { color: theme.text }]}>{durationHours}</Text>
            <TouchableOpacity
              onPress={() => onDurationHoursChange((prev) => Math.min(168, prev + 1))}
              style={[styles.stepperBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.settingCard, { borderColor: theme.icon, backgroundColor: theme.background }]}>
          <Text style={[styles.settingLabel, { color: theme.text }]}>Nombre de votes</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              onPress={() => onMaxVotesPerUserChange((prev) => Math.max(1, prev - 1))}
              style={[styles.stepperBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="minus" size={18} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.stepperValue, { color: theme.text }]}>{maxVotesPerUser}</Text>
            <TouchableOpacity
              onPress={() => onMaxVotesPerUserChange((prev) => Math.min(20, prev + 1))}
              style={[styles.stepperBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="plus" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Période de planification</Text>
      <View style={styles.planningDatesRow}>
        <TouchableOpacity
          onPress={() => onOpenPlanningPicker("start")}
          style={[styles.planningDateBtn, { backgroundColor: theme.background, borderColor: theme.icon }]}
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.textSecondary} />
          <Text style={[styles.planningDateBtnText, { color: theme.text }]} numberOfLines={1}>
            {planningStartDate}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onOpenPlanningPicker("end")}
          style={[styles.planningDateBtn, { backgroundColor: theme.background, borderColor: theme.icon }]}
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.textSecondary} />
          <Text style={[styles.planningDateBtnText, { color: theme.text }]} numberOfLines={1}>
            {planningEndDate}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Rechercher dans mon répertoire</Text>
      <View style={[styles.searchBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          value={searchRecipe}
          onChangeText={onSearchRecipeChange}
          placeholder="Chercher une recette..."
          placeholderTextColor={theme.textSecondary}
        />
      </View>

      {searchRecipe.trim().length > 0 ? (
        <>
          <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Résultats de recherche</Text>
          {isCreationSearchFetching ? (
            <ActivityIndicator size="small" color={theme.tint} />
          ) : filteredCreationRecipes.length > 0 ? (
            <View style={styles.recipeGrid}>
              {filteredCreationRecipes.slice(0, 12).map((recipe) => {
                const selected = selectedRecipeIdsForCreation.includes(recipe.id);
                return (
                  <TouchableOpacity
                    key={`grid-${recipe.id}`}
                    onPress={() => onToggleCreateRecipe(recipe.id)}
                    style={[
                      styles.recipeCard,
                      { borderColor: theme.icon, backgroundColor: theme.background },
                      selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}14` },
                    ]}
                  >
                    <View style={[styles.recipeIcon, { backgroundColor: `${theme.tint}1A` }]}>
                      <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={theme.tint} />
                    </View>
                    <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{recipe.type || "autre"}</Text>
                    <MaterialCommunityIcons
                      name={selected ? "check-circle" : "plus-circle-outline"}
                      size={20}
                      color={selected ? theme.tint : theme.textSecondary}
                      style={styles.recipePickIcon}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={[styles.suggestionsBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
              <Text style={{ color: theme.textSecondary, padding: 10 }}>Aucune recette trouvée.</Text>
            </View>
          )}
        </>
      ) : null}
      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Ajouter une recette</Text>
      <View style={styles.manualCreateBlock}>
        <View style={[styles.searchBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={20} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            value={manualTitle}
            onChangeText={onManualTitleChange}
            placeholder="Mon plat"
            placeholderTextColor={theme.textSecondary}
          />
        </View>
        <View style={styles.manualActionsRow}>
          <TouchableOpacity
            onPress={onSaveManualRecipeForCreation}
            style={[styles.smallActionBtn, styles.manualActionBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
            disabled={saving}
          >
            <Text style={styles.smallActionBtnText}>Ajouter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onPreviewAiRecipe}
            style={[
              styles.smallActionBtn,
              styles.manualActionBtn,
              { backgroundColor: theme.background, borderColor: theme.icon, borderWidth: 1, opacity: aiLoading ? 0.7 : 1 },
            ]}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator size="small" color={theme.tint} />
            ) : (
              <Text style={[styles.smallActionBtnText, { color: theme.text }]}>Demander à l&apos;IA</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {aiPreview ? (
        <View style={[styles.aiPreviewBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
          <Text style={{ color: theme.text, fontWeight: "700" }}>{String(aiPreview.title ?? manualTitle)}</Text>
          <Text style={{ color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>{String(aiPreview.description ?? "")}</Text>
          <TouchableOpacity
            onPress={onSaveAiRecipe}
            style={[styles.inlinePrimaryBtn, { backgroundColor: theme.tint }]}
            disabled={saving}
          >
            <Text style={styles.primaryBtnText}>Enregistrer la recette IA</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Plats sélectionnés</Text>
      <View style={styles.chipsRow}>
        {selectedCreationRecipes.length > 0 && (
          selectedCreationRecipes.map((recipe) => (
            <Swipeable
              key={`selected-${recipe.id}`}
              overshootRight={false}
              renderRightActions={() => (
                <TouchableOpacity
                  onPress={() => onRemoveCreateRecipe(recipe.id)}
                  style={[styles.swipeDeleteBtn, { backgroundColor: "#CC4B4B" }]}
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="white" />
                  <Text style={styles.swipeDeleteText}>Retirer</Text>
                </TouchableOpacity>
              )}
            >
              <View style={[styles.recipeChip, { borderColor: theme.tint, backgroundColor: `${theme.tint}1A` }]}>
                <Text style={{ color: theme.text, fontWeight: "600" }} numberOfLines={1}>{recipe.title}</Text>
              </View>
            </Swipeable>
          ))
        )}
      </View>
      <Text style={[styles.helperText, { color: theme.textSecondary }]}>Astuce: glisse une puce vers la gauche pour retirer un plat.</Text>

      <TouchableOpacity
        onPress={onSavePoll}
        style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {isEditingOpenPoll ? "Enregistrer les modifications" : "Ouvrir le sondage"}
          </Text>
        )}
      </TouchableOpacity>
      {isEditingOpenPoll ? (
        <TouchableOpacity
          onPress={onCancelEditOpenPoll}
          style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
          disabled={saving}
        >
          <Text style={{ color: theme.text, fontWeight: "700" }}>Retour au vote</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

