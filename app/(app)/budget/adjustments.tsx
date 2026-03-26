import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { queryKeys } from "@/src/query/query-keys";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  BudgetBoardPayload,
  BudgetTransaction,
  formatDateTime,
  formatMoney,
  toNumber,
} from "@/src/budget/common";

type AdjustmentType = "bonus" | "penalty";

const adjustmentTypeLabel = (type: AdjustmentType): string => (
  type === "bonus" ? "Bonus" : "Pénalité"
);

export default function BudgetAdjustmentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>("bonus");
  const [amountInput, setAmountInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger les ajustements.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useRealtimeRefetch({
    householdId,
    module: "budget",
    refresh: loadBoard,
    focusOptions: { silent: false },
    realtimeOptions: { silent: true },
  });

  const invalidateBudgetAndDashboard = useCallback(async () => {
    if (!householdId) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.budget.board(householdId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.root(householdId) }),
    ]);
  }, [householdId, queryClient]);

  const onBackPress = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(app)/(tabs)/budget");
  }, [router]);

  useEffect(() => {
    if (!board?.children.length) {
      setSelectedChildId(null);
      return;
    }
    const stillExists = board.children.some((child) => child.child.id === selectedChildId);
    if (!stillExists) {
      setSelectedChildId(board.children[0].child.id);
    }
  }, [board?.children, selectedChildId]);

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const selectedChild = board?.children.find((child) => child.child.id === selectedChildId) ?? null;

  const selectedChildAdjustments = useMemo(() => {
    if (!selectedChild) {
      return [] as BudgetTransaction[];
    }
    return selectedChild.transactions.filter((transaction) => (
      transaction.type === "bonus" || transaction.type === "penalty"
    ));
  }, [selectedChild]);

  const resetForm = () => {
    setAdjustmentType("bonus");
    setAmountInput("");
    setCommentInput("");
    setEditingTransactionId(null);
  };

  const handleSaveAdjustment = async () => {
    if (!selectedChild) {
      Alert.alert("Budget", "Sélectionne d'abord un enfant.");
      return;
    }

    const amount = toNumber(amountInput);
    if (amount === null || amount <= 0) {
      Alert.alert("Budget", "Le montant doit être supérieur à 0.");
      return;
    }

    setSaving(true);
    try {
      if (editingTransactionId !== null) {
        await apiFetch(`/budget/adjustments/${editingTransactionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            type: adjustmentType,
            amount,
            comment: commentInput.trim() === "" ? null : commentInput.trim(),
          }),
        });
      } else {
        await apiFetch("/budget/adjustments", {
          method: "POST",
          body: JSON.stringify({
            user_id: selectedChild.child.id,
            type: adjustmentType,
            amount,
            comment: commentInput.trim() === "" ? undefined : commentInput.trim(),
          }),
        });
      }
      resetForm();
      await loadBoard();
      await invalidateBudgetAndDashboard();
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'enregistrer cet ajustement.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditAdjustment = (transaction: BudgetTransaction) => {
    const nextType: AdjustmentType = transaction.type === "penalty" ? "penalty" : "bonus";
    setAdjustmentType(nextType);
    setAmountInput(String(transaction.amount));
    setCommentInput(transaction.comment ?? "");
    setEditingTransactionId(transaction.id);
  };

  const handleDeleteAdjustment = (transaction: BudgetTransaction) => {
    Alert.alert(
      "Supprimer l'ajustement",
      "Cet ajustement sera définitivement supprimé.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                await apiFetch(`/budget/adjustments/${transaction.id}`, {
                  method: "DELETE",
                });
                if (editingTransactionId === transaction.id) {
                  resetForm();
                }
                await loadBoard();
                await invalidateBudgetAndDashboard();
              } catch (error: unknown) {
                const message = (error as { message?: string })?.message || "Impossible de supprimer cet ajustement.";
                Alert.alert("Budget", message);
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  if (!isParent) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 16 }]}>
        <Text style={{ color: theme.text }}>Accès réservé aux parents.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.headerRow, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={onBackPress} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Bonus et pénalités</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Attribuer à un enfant puis suivre le statut actuel</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <Text style={[styles.label, { color: theme.text }]}>Attribuer à</Text>
        <View style={styles.chipsWrap}>
          {(board?.children ?? []).map((child) => (
            <TouchableOpacity
              key={`child-${child.child.id}`}
              onPress={() => setSelectedChildId(child.child.id)}
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
            onPress={() => setAdjustmentType("bonus")}
            style={[
              styles.typeBtn,
              adjustmentType === "bonus" ? { backgroundColor: theme.tint, borderColor: theme.tint } : { borderColor: theme.icon },
            ]}
          >
            <Text style={[styles.typeBtnText, { color: adjustmentType === "bonus" ? "#FFFFFF" : theme.text }]}>Bonus</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAdjustmentType("penalty")}
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
          onChangeText={setAmountInput}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
          placeholder="Ex: 2,50"
          placeholderTextColor={theme.textSecondary}
        />
        <Text style={[styles.label, { color: theme.text }]}>Commentaire (optionnel)</Text>
        <TextInput
          value={commentInput}
          onChangeText={setCommentInput}
          style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
          placeholder="Pourquoi cet ajustement ?"
          placeholderTextColor={theme.textSecondary}
        />

        <TouchableOpacity onPress={() => void handleSaveAdjustment()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
          <Text style={styles.primaryBtnText}>
            {saving
              ? "En cours..."
              : (editingTransactionId !== null ? "Mettre à jour l'ajustement" : "Enregistrer l'ajustement")}
          </Text>
        </TouchableOpacity>
        {editingTransactionId !== null ? (
          <TouchableOpacity onPress={resetForm} style={[styles.secondaryBtn, { borderColor: theme.icon }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Annuler la modification</Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
                    onPress={() => handleStartEditAdjustment(transaction)}
                    style={[styles.smallBtn, { backgroundColor: theme.tint }]}
                    disabled={saving}
                  >
                    <Text style={styles.smallBtnText}>Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteAdjustment(transaction)}
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

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <Text style={[styles.innerTitle, { color: theme.text }]}>Statut actuel par enfant</Text>
        <View style={styles.listWrap}>
          {(board?.children ?? []).map((child) => (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  title: { fontSize: 18, fontWeight: "700" },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  label: { fontSize: 13, fontWeight: "600" },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  childChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  childChipText: { fontSize: 12, fontWeight: "700" },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 2 },
  typeBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBtnText: { fontSize: 13, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  secondaryBtn: {
    minHeight: 36,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "600" },
  listWrap: { gap: 8 },
  innerCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  innerTitle: { fontSize: 14, fontWeight: "700" },
  text: { fontSize: 13, lineHeight: 18 },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  smallBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
});
