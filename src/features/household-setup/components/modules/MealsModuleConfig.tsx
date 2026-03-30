import React from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppButton } from "@/src/components/ui/AppButton";
import { MealPollSection } from "@/src/features/household-setup/components/modules/meals/MealPollSection";
import { MealRecipesSection } from "@/src/features/household-setup/components/modules/meals/MealRecipesSection";

type MealsModuleConfigProps = {
  state: any;
};

export function MealsModuleConfig({ state }: MealsModuleConfigProps) {
  const { theme, ui, form, data, actions } = state;

  return (
    <View style={styles.subConfigBox}>
      <View style={styles.mealFeatureRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Recettes</Text>
        <View style={styles.mealFeatureControls}>
          <Switch
            value={form.mealOptions.recipes}
            onValueChange={(value) => actions.updateMealOption("recipes", value)}
            trackColor={{ false: theme.icon, true: theme.tint }}
          />
          {ui.showScopedModuleDetails ? (
            <AppButton
              onPress={() => actions.toggleMealSection("recipes")}
              style={{ marginLeft: 8, padding: 4 }}
              disabled={!form.mealOptions.recipes}
            >
              <MaterialCommunityIcons
                name={data.mealExpandedSections.recipes ? "chevron-up" : "chevron-down"}
                size={20}
                color={form.mealOptions.recipes ? theme.text : theme.icon}
              />
            </AppButton>
          ) : (
            <View style={styles.mealChevronSpacer} />
          )}
        </View>
      </View>

      {ui.showScopedModuleDetails &&
      form.mealOptions.recipes &&
      data.mealExpandedSections.recipes ? (
        <MealRecipesSection state={state} />
      ) : null}

      <View style={styles.mealFeatureRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Sondages</Text>
        <View style={styles.mealFeatureControls}>
          <Switch
            value={form.mealOptions.polls}
            onValueChange={(value) => actions.updateMealOption("polls", value)}
            trackColor={{ false: theme.icon, true: theme.tint }}
          />
          {ui.showScopedModuleDetails ? (
            <AppButton
              onPress={() => actions.toggleMealSection("polls")}
              style={{ marginLeft: 8, padding: 4 }}
              disabled={!form.mealOptions.polls}
            >
              <MaterialCommunityIcons
                name={data.mealExpandedSections.polls ? "chevron-up" : "chevron-down"}
                size={20}
                color={form.mealOptions.polls ? theme.text : theme.icon}
              />
            </AppButton>
          ) : (
            <View style={styles.mealChevronSpacer} />
          )}
        </View>
      </View>

      {ui.showScopedModuleDetails &&
      form.mealOptions.polls &&
      data.mealExpandedSections.polls ? (
        <MealPollSection state={state} />
      ) : null}

      <View style={styles.mealFeatureRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Liste de courses</Text>
        <View style={styles.mealFeatureControls}>
          <Switch
            value={form.mealOptions.shopping_list}
            onValueChange={(value) => actions.updateMealOption("shopping_list", value)}
            trackColor={{ false: theme.icon, true: theme.tint }}
          />
          <View style={styles.mealChevronSpacer} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  subConfigBox: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2 },
  mealFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  mealFeatureControls: { flexDirection: "row", alignItems: "center" },
  mealChevronSpacer: { width: 28, marginLeft: 8 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
});
