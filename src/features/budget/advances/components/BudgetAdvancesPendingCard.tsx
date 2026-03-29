import React, { memo } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

import {
  BudgetPayoutMode,
  BudgetRequestKind,
  BudgetTransaction,
  formatDateTime,
  formatMoney,
} from "@/src/budget/common";
import { budgetAdvancesStyles as styles } from "@/src/features/budget/advances/budget-advances.styles";
import type { Colors } from "@/constants/theme";

type BudgetAdvancesPendingCardProps = {
  theme: typeof Colors.light;
  pendingRequests: BudgetTransaction[];
  currency: string;
  reviewAmounts: Record<number, string>;
  reviewComments: Record<number, string>;
  saving: boolean;
  onAmountChange: (requestId: number, value: string) => void;
  onCommentChange: (requestId: number, value: string) => void;
  onApprove: (request: BudgetTransaction, payoutMode?: BudgetPayoutMode) => void;
  onReject: (request: BudgetTransaction) => void;
};

const requestKindLabel = (requestKind: BudgetRequestKind | null | undefined): string =>
  requestKind === "reimbursement" ? "Demande de remboursement" : "Demande d'avance";

export const BudgetAdvancesPendingCard = memo(function BudgetAdvancesPendingCard({
  theme,
  pendingRequests,
  currency,
  reviewAmounts,
  reviewComments,
  saving,
  onAmountChange,
  onCommentChange,
  onApprove,
  onReject,
}: BudgetAdvancesPendingCardProps) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
      {pendingRequests.length === 0 ? (
        <Text style={[styles.text, { color: theme.textSecondary }]}>Pas de demandes en cours.</Text>
      ) : (
        <View style={styles.listWrap}>
          {pendingRequests.map((request) => {
            const kind = request.request_kind ?? "advance";

            return (
              <View key={`pending-${request.id}`} style={[styles.innerCard, { borderColor: `${theme.icon}55` }]}>
                <Text style={[styles.innerTitle, { color: theme.text }]}>
                  {request.user?.name ?? "Enfant"} • {formatMoney(request.amount, currency)}
                </Text>
                <Text style={[styles.text, { color: theme.textSecondary }]}>
                  {requestKindLabel(kind)} • {formatDateTime(request.created_at)}
                </Text>
                <Text style={[styles.text, { color: theme.textSecondary }]}>
                  {request.comment || "Sans justification"}
                </Text>
                <Text style={[styles.label, { color: theme.text }]}>Montant approuvé</Text>
                <TextInput
                  value={reviewAmounts[request.id] ?? ""}
                  onChangeText={(value) => onAmountChange(request.id, value)}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                  placeholder="Ex: 12,50"
                  placeholderTextColor={theme.textSecondary}
                />
                <Text style={[styles.label, { color: theme.text }]}>Commentaire parent (optionnel)</Text>
                <TextInput
                  value={reviewComments[request.id] ?? ""}
                  onChangeText={(value) => onCommentChange(request.id, value)}
                  style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                  placeholder="Ajouter un commentaire"
                  placeholderTextColor={theme.textSecondary}
                />
                {kind === "reimbursement" ? (
                  <View style={styles.actionsWrap}>
                    <TouchableOpacity
                      onPress={() => onApprove(request, "integrated")}
                      style={[styles.actionBtn, { backgroundColor: theme.tint }]}
                      disabled={saving}
                    >
                      <Text style={styles.actionBtnText}>Intégrer au paiement</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onApprove(request, "immediate")}
                      style={[styles.actionBtn, { backgroundColor: "#2E8B57" }]}
                      disabled={saving}
                    >
                      <Text style={styles.actionBtnText}>Payé tout de suite</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onReject(request)}
                      style={[styles.actionBtn, { backgroundColor: theme.accentWarm }]}
                      disabled={saving}
                    >
                      <Text style={styles.actionBtnText}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      onPress={() => onApprove(request)}
                      style={[styles.actionBtn, { backgroundColor: theme.tint }]}
                      disabled={saving}
                    >
                      <Text style={styles.actionBtnText}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onReject(request)}
                      style={[styles.actionBtn, { backgroundColor: theme.accentWarm }]}
                      disabled={saving}
                    >
                      <Text style={styles.actionBtnText}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
});
