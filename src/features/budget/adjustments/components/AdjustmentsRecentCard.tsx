import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { budgetAdjustmentsStyles as styles } from "@/src/features/budget/adjustments/budget-adjustments.styles";
import { formatDateTime, formatMoney } from "@/src/budget/common";

import type { Colors } from "@/constants/theme";
import type { BudgetTransaction, ChildBudget } from "@/src/budget/common";

type AdjustmentsRecentCardProps = {
  theme: typeof Colors.light;
  selectedChild: ChildBudget | null;
  selectedChildAdjustments: BudgetTransaction[];
  currency: string;
  saving: boolean;
  onEdit: (transaction: BudgetTransaction) => void;
  onDelete: (transaction: BudgetTransaction) => void;
};

type AdjustmentType = "bonus" | "penalty";

const adjustmentTypeLabel = (type: AdjustmentType): string => (
  type === "bonus" ? "Bonus" : "Pénalité"
);

export const AdjustmentsRecentCard = memo(function AdjustmentsRecentCard({
  theme,
  selectedChild,
  selectedChildAdjustments,
  currency,
  saving,
  onEdit,
  onDelete,
}: AdjustmentsRecentCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      <Text style={[styles.innerTitle, { color: theme.text }]}>
        Ajustements récents {selectedChild ? `de ${selectedChild.child.name}` : ""}
      </Text>
      {selectedChildAdjustments.length === 0 ? (
        <Text style={[styles.text, { color: theme.textSecondary }]}>Aucun ajustement récent.</Text>
      ) : (
        <View style={styles.listWrap}>
          {selectedChildAdjustments.map((transaction) => (
            <View key={`adjustment-${transaction.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
              <Text style={[styles.innerTitle, { color: theme.text }]}>
                {adjustmentTypeLabel(transaction.type === "penalty" ? "penalty" : "bonus")} • {formatMoney(transaction.amount, currency)}
              </Text>
              <Text style={[styles.text, { color: theme.textSecondary }]}>{formatDateTime(transaction.created_at)}</Text>
              {transaction.comment ? (
                <Text style={[styles.text, { color: theme.textSecondary }]}>{transaction.comment}</Text>
              ) : null}
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => onEdit(transaction)}
                  style={[styles.smallBtn, { backgroundColor: theme.tint }]}
                  disabled={saving}
                >
                  <Text style={styles.smallBtnText}>Modifier</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDelete(transaction)}
                  style={[styles.smallBtn, { backgroundColor: theme.accentWarm }]}
                  disabled={saving}
                >
                  <Text style={styles.smallBtnText}>Supprimer</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});
