import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BudgetChildCard } from "@/src/features/household-setup/components/modules/budget/BudgetChildCard";

type BudgetModuleConfigProps = {
  state: any;
};

export function BudgetModuleConfig({ state }: BudgetModuleConfigProps) {
  const { theme, ui, data, asyncState } = state;

  return (
    <View style={styles.subConfigBox}>
      {ui.isEditMode ? (
        <>
          <Text style={[styles.label, { color: theme.text }]}>Paramètres par enfant</Text>
          {asyncState.budgetSettingsError ? (
            <Text style={[styles.memberMeta, { color: theme.accentWarm, marginBottom: 8 }]}>
              {asyncState.budgetSettingsError}
            </Text>
          ) : null}
          {asyncState.budgetSettingsLoading ? (
            <ActivityIndicator size="small" color={theme.tint} />
          ) : data.budgetChildDrafts.length === 0 ? (
            <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
              Aucun enfant trouvé pour ce foyer.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {data.budgetChildDrafts.map((draft: any) => (
                <BudgetChildCard key={`budget-child-${draft.childId}`} state={state} draft={draft} />
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={[styles.memberMeta, { color: theme.textSecondary }]}>
          Les paramètres détaillés seront disponibles dès que le foyer sera créé.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subConfigBox: { paddingHorizontal: 12, paddingBottom: 5, paddingTop: 2 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  memberMeta: { fontSize: 11, color: "gray" },
});
