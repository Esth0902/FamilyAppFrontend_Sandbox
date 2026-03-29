import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { budgetAdvancesStyles as styles } from "@/src/features/budget/advances/budget-advances.styles";
import {
  BudgetPayoutMode,
  BudgetRequestKind,
  BudgetTransaction,
  formatDateTime,
  formatMoney,
  transactionStatusLabel,
} from "@/src/budget/common";
import type { Colors } from "@/constants/theme";

export type AdvanceHistoryItem = {
  childName: string;
  transaction: BudgetTransaction;
};

type BudgetAdvancesHistoryCardProps = {
  theme: typeof Colors.light;
  historyOpen: boolean;
  reviewedHistory: AdvanceHistoryItem[];
  currency: string;
  onToggleHistory: () => void;
};

const requestKindLabel = (requestKind: BudgetRequestKind | null | undefined): string =>
  requestKind === "reimbursement" ? "Demande de remboursement" : "Demande d'avance";

const payoutModeLabel = (mode: BudgetPayoutMode | null | undefined): string => {
  if (mode === "immediate") return "Payé immédiatement";
  if (mode === "integrated") return "Intégré au paiement";
  return "Mode standard";
};

export const BudgetAdvancesHistoryCard = memo(function BudgetAdvancesHistoryCard({
  theme,
  historyOpen,
  reviewedHistory,
  currency,
  onToggleHistory,
}: BudgetAdvancesHistoryCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      <TouchableOpacity onPress={onToggleHistory} style={styles.historyHeader}>
        <Text style={[styles.innerTitle, { color: theme.text }]}>Historique</Text>
        <MaterialCommunityIcons name={historyOpen ? "chevron-up" : "chevron-down"} size={20} color={theme.textSecondary} />
      </TouchableOpacity>
      {historyOpen ? (
        reviewedHistory.length === 0 ? (
          <Text style={[styles.text, { color: theme.textSecondary }]}>Aucun historique.</Text>
        ) : (
          <View style={styles.listWrap}>
            {reviewedHistory.map((item) => (
              <View key={`history-${item.transaction.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
                <Text style={[styles.innerTitle, { color: theme.text }]}>
                  {item.childName} • {formatMoney(item.transaction.amount, currency)}
                </Text>
                <Text style={[styles.text, { color: theme.textSecondary }]}>
                  {requestKindLabel(item.transaction.request_kind)} • {transactionStatusLabel(item.transaction.status)}
                </Text>
                {item.transaction.request_kind === "reimbursement" && item.transaction.status === "approved" ? (
                  <Text style={[styles.text, { color: theme.textSecondary }]}>
                    {payoutModeLabel(item.transaction.payout_mode)}
                  </Text>
                ) : null}
                <Text style={[styles.text, { color: theme.textSecondary }]}>{formatDateTime(item.transaction.created_at)}</Text>
                {item.transaction.comment ? (
                  <Text style={[styles.text, { color: theme.textSecondary }]}>{item.transaction.comment}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )
      ) : null}
    </View>
  );
});
