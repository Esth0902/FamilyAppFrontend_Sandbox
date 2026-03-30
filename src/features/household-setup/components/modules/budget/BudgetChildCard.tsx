import React from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, View } from "react-native";

import { AppButton } from "@/src/components/ui/AppButton";
import { AppTextInput } from "@/src/components/ui/AppTextInput";

type BudgetChildCardProps = {
  state: any;
  draft: any;
};

export function BudgetChildCard({ state, draft }: BudgetChildCardProps) {
  const { theme, asyncState, actions } = state;

  return (
    <View
      key={`budget-child-${draft.childId}`}
      style={[styles.budgetChildCard, { backgroundColor: theme.background, borderColor: theme.icon }]}
    >
      <Text style={[styles.memberName, { color: theme.text }]}>{draft.childName}</Text>
      <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Montant de base</Text>
      <AppTextInput
        style={styles.budgetCompactInput}
        keyboardType="decimal-pad"
        value={draft.baseAmountInput}
        onChangeText={(value) => actions.updateBudgetChildDraft(draft.childId, { baseAmountInput: value })}
        placeholder="Ex: 12,00"
        placeholderTextColor={theme.textSecondary}
      />
      <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Récurrence</Text>
      <View style={styles.budgetRecurrenceRow}>
        <AppButton
          onPress={() => actions.updateBudgetChildDraft(draft.childId, { recurrence: "weekly" })}
          style={[
            styles.budgetChoiceBtn,
            draft.recurrence === "weekly"
              ? { backgroundColor: theme.tint, borderColor: theme.tint }
              : { borderColor: theme.icon, backgroundColor: theme.card },
          ]}
        >
          <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "weekly" ? "#FFFFFF" : theme.text }]}>
            Hebdo
          </Text>
        </AppButton>
        <AppButton
          onPress={() => actions.updateBudgetChildDraft(draft.childId, { recurrence: "monthly" })}
          style={[
            styles.budgetChoiceBtn,
            draft.recurrence === "monthly"
              ? { backgroundColor: theme.tint, borderColor: theme.tint }
              : { borderColor: theme.icon, backgroundColor: theme.card },
          ]}
        >
          <Text style={[styles.budgetChoiceText, { color: draft.recurrence === "monthly" ? "#FFFFFF" : theme.text }]}>
            Mensuel
          </Text>
        </AppButton>
      </View>
      <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Jour de réinitialisation</Text>
      <AppTextInput
        style={styles.budgetCompactInput}
        keyboardType="number-pad"
        value={draft.resetDayInput}
        onChangeText={(value) => actions.updateBudgetChildDraft(draft.childId, { resetDayInput: value })}
        placeholder={draft.recurrence === "weekly" ? "1 à 7" : "1 à 31"}
        placeholderTextColor={theme.textSecondary}
      />
      <View style={styles.switchRow}>
        <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Autoriser les avances</Text>
        <Switch
          value={draft.allowAdvances}
          onValueChange={(value) => actions.updateBudgetChildDraft(draft.childId, { allowAdvances: value })}
          trackColor={{ false: theme.icon, true: theme.tint }}
        />
      </View>
      <Text style={[styles.label, { color: theme.text, marginBottom: 4 }]}>Plafond d&apos;avance</Text>
      <AppTextInput
        style={styles.budgetCompactInput}
        keyboardType="decimal-pad"
        value={draft.maxAdvanceInput}
        onChangeText={(value) => actions.updateBudgetChildDraft(draft.childId, { maxAdvanceInput: value })}
        placeholder="Ex: 20,00"
        placeholderTextColor={theme.textSecondary}
        editable={draft.allowAdvances}
      />
      <AppButton
        onPress={() => {
          void actions.saveBudgetChildDraft(draft);
        }}
        style={[
          styles.budgetSaveBtn,
          { backgroundColor: theme.tint, opacity: asyncState.savingBudgetChildId === draft.childId ? 0.8 : 1 },
        ]}
        disabled={asyncState.savingBudgetChildId === draft.childId}
      >
        {asyncState.savingBudgetChildId === draft.childId ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Text style={styles.budgetSaveBtnText}>Enregistrer</Text>
        )}
      </AppButton>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  budgetChildCard: { borderWidth: 1, borderRadius: 12, padding: 8 },
  memberName: { fontSize: 14, fontWeight: "700" },
  budgetCompactInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
    fontSize: 14,
  },
  budgetRecurrenceRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  budgetChoiceBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  budgetChoiceText: { fontSize: 12, fontWeight: "700" },
  budgetSaveBtn: { minHeight: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  budgetSaveBtnText: { color: "white", fontSize: 13, fontWeight: "700" },
});
