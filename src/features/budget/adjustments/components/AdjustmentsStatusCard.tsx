import React, { memo } from "react";
import { Text, View } from "react-native";

import { budgetAdjustmentsStyles as styles } from "@/src/features/budget/adjustments/budget-adjustments.styles";
import { formatMoney } from "@/src/budget/common";

import type { Colors } from "@/constants/theme";
import type { ChildBudget } from "@/src/budget/common";

type AdjustmentsStatusCardProps = {
  theme: typeof Colors.light;
  childrenBudgets: ChildBudget[];
  currency: string;
};

export const AdjustmentsStatusCard = memo(function AdjustmentsStatusCard({
  theme,
  childrenBudgets,
  currency,
}: AdjustmentsStatusCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      <Text style={[styles.innerTitle, { color: theme.text }]}>Statut actuel par enfant</Text>
      <View style={styles.listWrap}>
        {childrenBudgets.map((child) => (
          <View key={`status-${child.child.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
            <Text style={[styles.innerTitle, { color: theme.text }]}>{child.child.name}</Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Bonus: {formatMoney(child.summary.bonus_total_period, currency)}
            </Text>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Pénalités: {formatMoney(Math.abs(child.summary.penalty_total_period), currency)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});
