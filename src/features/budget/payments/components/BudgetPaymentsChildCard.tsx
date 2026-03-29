import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  ChildBudget,
  PaymentBreakdown,
  formatMoney,
  formatPeriod,
  formatSignedMoney,
  recurrenceLabel,
  resetDayLabel,
} from "@/src/budget/common";
import { budgetPaymentsStyles as styles } from "@/src/features/budget/payments/budget-payments.styles";
import type { Colors } from "@/constants/theme";

export type PaymentAction = "pay" | "carry_negative";

type BudgetPaymentsChildCardProps = {
  theme: typeof Colors.light;
  child: ChildBudget;
  breakdown: PaymentBreakdown;
  currency: string;
  isOpen: boolean;
  saving: boolean;
  onToggleOpen: () => void;
  onConfirmAction: (action: PaymentAction) => void;
};

export const BudgetPaymentsChildCard = memo(function BudgetPaymentsChildCard({
  theme,
  child,
  breakdown,
  currency,
  isOpen,
  saving,
  onToggleOpen,
  onConfirmAction,
}: BudgetPaymentsChildCardProps) {
  const hasNegativeToCarry = breakdown.remainingRaw < 0;

  let buttonText = "Aucun paiement à valider";
  let buttonStyle: { backgroundColor: string } = { backgroundColor: `${theme.icon}66` };
  let buttonAction: PaymentAction | null = null;

  if (breakdown.remainingToPay > 0) {
    buttonText = `Paiement effectué (${formatMoney(breakdown.remainingToPay, currency)})`;
    buttonStyle = { backgroundColor: theme.tint };
    buttonAction = "pay";
  } else if (hasNegativeToCarry) {
    buttonText = `Reporter le montant négatif (${formatMoney(Math.abs(breakdown.remainingRaw), currency)}) au prochain budget`;
    buttonStyle = { backgroundColor: "#2E8B57" };
    buttonAction = "carry_negative";
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      <TouchableOpacity onPress={onToggleOpen} style={styles.childHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.innerTitle, { color: theme.text }]}>{child.child.name}</Text>
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            Total à payer : {formatMoney(breakdown.remainingToPay, currency)}
          </Text>
        </View>
        <MaterialCommunityIcons name={isOpen ? "chevron-up" : "chevron-down"} size={22} color={theme.textSecondary} />
      </TouchableOpacity>

      {isOpen ? (
        <View style={styles.detailsWrap}>
          {child.setting ? (
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              {recurrenceLabel(child.setting.recurrence)} • Réinitialisation {resetDayLabel(child.setting.recurrence, child.setting.reset_day)}
            </Text>
          ) : (
            <Text style={[styles.text, { color: theme.textSecondary }]}>Paramètres budget non configurés.</Text>
          )}
          <Text style={[styles.text, { color: theme.textSecondary }]}>Période {formatPeriod(child.period.start, child.period.end)}</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Montant de base</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.baseAmount, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Bonus</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatSignedMoney(breakdown.bonusTotal, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Pénalités</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatSignedMoney(breakdown.penaltyTotal, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Avances à déduire</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>-{formatMoney(breakdown.approvedAdvanceToDeduct, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Avances en cours</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.pendingAdvance, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Déjà payé</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.alreadyPaid, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total prévu</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{formatMoney(breakdown.totalExpected, currency)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Total à payer</Text>
              <Text style={[styles.summaryValueStrong, { color: theme.text }]}>{formatMoney(breakdown.remainingToPay, currency)}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => {
              if (!buttonAction) {
                return;
              }
              onConfirmAction(buttonAction);
            }}
            style={[styles.primaryBtn, buttonStyle]}
            disabled={saving || buttonAction === null}
          >
            <Text style={styles.primaryBtnText}>{buttonText}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});
