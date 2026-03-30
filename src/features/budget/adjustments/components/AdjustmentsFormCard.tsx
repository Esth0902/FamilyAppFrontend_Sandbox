import React, { memo } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import { budgetAdjustmentsStyles as styles } from "@/src/features/budget/adjustments/budget-adjustments.styles";

import type { Colors } from "@/constants/theme";
import type { ChildBudget } from "@/src/budget/common";

type AdjustmentType = "bonus" | "penalty";

type AdjustmentsFormCardProps = {
  theme: typeof Colors.light;
  childrenBudgets: ChildBudget[];
  selectedChildId: number | null;
  adjustmentType: AdjustmentType;
  amountInput: string;
  commentInput: string;
  editingTransactionId: number | null;
  saving: boolean;
  onSelectChild: (childId: number) => void;
  onAdjustmentTypeChange: (value: AdjustmentType) => void;
  onAmountInputChange: (value: string) => void;
  onCommentInputChange: (value: string) => void;
  onSave: () => void;
  onCancelEdit: () => void;
};

export const AdjustmentsFormCard = memo(function AdjustmentsFormCard({
  theme,
  childrenBudgets,
  selectedChildId,
  adjustmentType,
  amountInput,
  commentInput,
  editingTransactionId,
  saving,
  onSelectChild,
  onAdjustmentTypeChange,
  onAmountInputChange,
  onCommentInputChange,
  onSave,
  onCancelEdit,
}: AdjustmentsFormCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
      <View style={styles.chipsWrap}>
        {childrenBudgets.map((child) => (
          <TouchableOpacity
            key={`child-${child.child.id}`}
            onPress={() => onSelectChild(child.child.id)}
            style={[
              styles.childChip,
              selectedChildId === child.child.id
                ? { backgroundColor: `${theme.tint}22`, borderColor: theme.tint }
                : { borderColor: theme.icon },
            ]}
          >
            <Text style={[styles.childChipText, { color: selectedChildId === child.child.id ? theme.tint : theme.text }]}>
              {child.child.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.typeRow}>
        <TouchableOpacity
          onPress={() => onAdjustmentTypeChange("bonus")}
          style={[
            styles.typeBtn,
            adjustmentType === "bonus" ? { backgroundColor: theme.tint, borderColor: theme.tint } : { borderColor: theme.icon },
          ]}
        >
          <Text style={[styles.typeBtnText, { color: adjustmentType === "bonus" ? "#FFFFFF" : theme.text }]}>Bonus</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onAdjustmentTypeChange("penalty")}
          style={[
            styles.typeBtn,
            adjustmentType === "penalty" ? { backgroundColor: theme.accentWarm, borderColor: theme.accentWarm } : { borderColor: theme.icon },
          ]}
        >
          <Text style={[styles.typeBtnText, { color: adjustmentType === "penalty" ? "#FFFFFF" : theme.text }]}>Pénalité</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>Montant</Text>
      <TextInput
        value={amountInput}
        onChangeText={onAmountInputChange}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
        placeholder="Ex: 2,50"
        placeholderTextColor={theme.textSecondary}
      />
      <Text style={[styles.label, { color: theme.text }]}>Commentaire (optionnel)</Text>
      <TextInput
        value={commentInput}
        onChangeText={onCommentInputChange}
        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
        placeholder="Pourquoi cet ajustement ?"
        placeholderTextColor={theme.textSecondary}
      />

      <TouchableOpacity onPress={onSave} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
        <Text style={styles.primaryBtnText}>
          {saving
            ? "En cours..."
            : (editingTransactionId !== null ? "Mettre à jour l'ajustement" : "Enregistrer l'ajustement")}
        </Text>
      </TouchableOpacity>
      {editingTransactionId !== null ? (
        <TouchableOpacity onPress={onCancelEdit} style={[styles.secondaryBtn, { borderColor: theme.icon }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuler la modification</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});
