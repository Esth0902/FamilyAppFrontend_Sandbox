import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";

import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";

type MealRecipesSectionProps = {
  state: any;
};

export function MealRecipesSection({ state }: MealRecipesSectionProps) {
  const { theme, constants, form, data, asyncState, actions } = state;

  return (
    <View style={[styles.mealSectionBox, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.text, marginTop: 4 }]}>
        Portions par défaut du foyer
      </Text>
      <AppTextInput
        style={[styles.input, styles.inputNoMargin]}
        value={form.defaultServings}
        onChangeText={form.setDefaultServings}
        keyboardType="numeric"
        placeholder="4"
        placeholderTextColor={theme.textSecondary}
      />

      <Text style={[styles.label, { color: theme.text, marginTop: 12 }]}>Tags alimentaires</Text>
      <View style={styles.categoryFilterWrap}>
        {Object.keys(constants.DIETARY_TYPE_LABELS).map((type) => {
          const typedType = type as keyof typeof constants.DIETARY_TYPE_LABELS;
          return (
            <AppButton
              key={String(typedType)}
              onPress={() => {
                if (form.selectedDietaryTypeFilter === typedType) return;
                form.setSelectedDietaryTypeFilter(typedType);
                form.setDietaryTagSearch("");
                void actions.loadDietaryTags(typedType);
              }}
              style={[
                styles.categoryFilterChip,
                { borderColor: theme.icon, backgroundColor: theme.background },
                form.selectedDietaryTypeFilter === typedType && {
                  borderColor: theme.tint,
                  backgroundColor: `${theme.tint}20`,
                },
              ]}
            >
              <Text
                style={{
                  color: form.selectedDietaryTypeFilter === typedType ? theme.tint : theme.text,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {constants.DIETARY_TYPE_LABELS[typedType]}
              </Text>
            </AppButton>
          );
        })}
      </View>

      {data.selectedTagsForCurrentType.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <Text style={[styles.selectedHint, { color: theme.textSecondary }]}>Sélection :</Text>
          <Text style={[styles.selectedValues, { color: theme.text }]}>
            {data.selectedTagsForCurrentType.map((tag: any) => tag.label).join(", ")}
          </Text>
        </View>
      )}

      <AppTextInput
        style={[styles.input, styles.inputWithSmallBottomSpacing]}
        value={form.dietaryTagSearch}
        onChangeText={form.setDietaryTagSearch}
        placeholder="Rechercher un tag..."
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
      />

      {asyncState.dietaryTagsLoading ? (
        <View style={styles.tagsLoadingRow}>
          <ActivityIndicator size="small" color={theme.tint} />
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Chargement...</Text>
        </View>
      ) : data.filteredDietaryTags.length === 0 ? (
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          Aucun tag ne correspond.
        </Text>
      ) : (
        <View style={styles.tagsWrap}>
          {data.filteredDietaryTags.map((tag: any) => {
            const isSelected = data.selectedMealDietaryTags.includes(tag.key);
            return (
              <AppButton
                key={tag.id}
                onPress={() => actions.toggleMealDietaryTag(tag.key)}
                style={[
                  styles.tagChip,
                  { borderColor: theme.icon, backgroundColor: theme.card },
                  isSelected && { borderColor: theme.tint, backgroundColor: `${theme.tint}25` },
                ]}
              >
                <Text
                  style={[
                    styles.tagChipText,
                    { color: theme.text },
                    isSelected && { color: theme.tint },
                  ]}
                >
                  {tag.label}
                </Text>
                <Text style={[styles.tagChipType, { color: theme.textSecondary }]}>
                  {constants.DIETARY_TYPE_LABELS[tag.type]}
                </Text>
              </AppButton>
            );
          })}
        </View>
      )}

      {data.canSuggestCreateDietaryTag && (
        <View
          style={[
            styles.createTagBox,
            { borderColor: theme.icon, backgroundColor: theme.card },
          ]}
        >
          <Text style={[styles.createTagTitle, { color: theme.text }]}>
            Ajouter &quot;{form.dietaryTagSearch.trim()}&quot; ?
          </Text>
          <AppButton
            onPress={actions.createDietaryTag}
            disabled={asyncState.creatingDietaryTag}
            style={[styles.createTagBtn, { backgroundColor: theme.tint }]}
          >
            {asyncState.creatingDietaryTag ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.createTagBtnText}>Ajouter ce tag</Text>
            )}
          </AppButton>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mealSectionBox: { borderRadius: 12, padding: 10, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
  inputNoMargin: { marginBottom: 0 },
  inputWithSmallBottomSpacing: { marginBottom: 10 },
  categoryFilterWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  categoryFilterChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  selectedHint: { fontSize: 12 },
  selectedValues: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  tagsLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 120 },
  tagChipText: { fontSize: 13, fontWeight: "700" },
  tagChipType: { fontSize: 11, marginTop: 2 },
  createTagBox: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 12 },
  createTagTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  createTagBtn: { height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  createTagBtnText: { color: "white", fontSize: 14, fontWeight: "700" },
});
