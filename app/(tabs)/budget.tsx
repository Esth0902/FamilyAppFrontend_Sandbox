import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";

type BudgetRecurrence = "weekly" | "monthly";
type BudgetRole = "parent" | "enfant";
type TransactionType = "allocation" | "bonus" | "penalty" | "advance";
type TransactionStatus = "pending" | "approved" | "rejected";

type BudgetSetting = {
  user_id: number;
  base_amount: number;
  recurrence: BudgetRecurrence;
  reset_day: number;
  allow_advances: boolean;
  max_advance_amount: number;
};

type BudgetTransaction = {
  id: number;
  amount: number;
  signed_amount: number;
  type: TransactionType;
  status: TransactionStatus;
  comment: string | null;
  created_at: string | null;
  user?: {
    id: number;
    name: string;
  };
};

type ChildBudget = {
  child: {
    id: number;
    name: string;
  };
  setting: BudgetSetting | null;
  period: {
    start: string;
    end: string;
    label: string;
  };
  summary: {
    approved_total_period: number;
    pending_advance_total_period: number;
    lifetime_balance: number;
  };
  transactions: BudgetTransaction[];
};

type BudgetBoardPayload = {
  budget_enabled: boolean;
  currency: string;
  current_user: {
    id: number;
    role: BudgetRole;
  };
  children: ChildBudget[];
  pending_advance_requests: BudgetTransaction[];
};

const WEEK_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const toNumber = (rawValue: string): number | null => {
  const normalized = rawValue.replace(",", ".").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("fr-BE", {
      style: "currency",
      currency: (currency || "EUR").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} EUR`;
  }
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("fr-BE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

const formatPeriod = (startIso: string, endIso: string): string => {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startIso} - ${endIso}`;
  const startLabel = start.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  const endLabel = end.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
  return `${startLabel} - ${endLabel}`;
};

const recurrenceLabel = (recurrence: BudgetRecurrence): string => (recurrence === "monthly" ? "Mensuel" : "Hebdomadaire");

const resetDayLabel = (recurrence: BudgetRecurrence, resetDay: number): string => {
  if (recurrence === "monthly") return `Jour ${resetDay}`;
  return WEEK_LABELS[Math.max(0, Math.min(6, resetDay - 1))] ?? `Jour ${resetDay}`;
};

const transactionTypeLabel = (type: TransactionType): string => {
  if (type === "advance") return "Avance";
  if (type === "penalty") return "Pénalité";
  if (type === "bonus") return "Bonus";
  return "Allocation";
};

const transactionStatusLabel = (status: TransactionStatus): string => {
  if (status === "pending") return "En attente";
  if (status === "approved") return "Approuvé";
  return "Rejeté";
};

export default function BudgetTabScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);

  const [selectedSettingChildId, setSelectedSettingChildId] = useState<number | null>(null);
  const [baseAmountInput, setBaseAmountInput] = useState("");
  const [recurrenceInput, setRecurrenceInput] = useState<BudgetRecurrence>("weekly");
  const [resetDayInput, setResetDayInput] = useState("");
  const [allowAdvancesInput, setAllowAdvancesInput] = useState(false);
  const [maxAdvanceInput, setMaxAdvanceInput] = useState("");

  const [selectedPaymentChildId, setSelectedPaymentChildId] = useState<number | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentCommentInput, setPaymentCommentInput] = useState("");

  const [advanceAmountInput, setAdvanceAmountInput] = useState("");
  const [advanceCommentInput, setAdvanceCommentInput] = useState("");

  const [reviewAmounts, setReviewAmounts] = useState<Record<number, string>>({});
  const [reviewComments, setReviewComments] = useState<Record<number, string>>({});

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger le budget.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBoard();
    }, [loadBoard])
  );

  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);
  const isParent = board?.current_user.role === "parent";
  const myBudget = board?.children[0] ?? null;
  const settingChild = board?.children.find((child) => child.child.id === selectedSettingChildId) ?? null;
  const paymentChild = board?.children.find((child) => child.child.id === selectedPaymentChildId) ?? null;

  const selectChildForSettings = (child: ChildBudget) => {
    if (selectedSettingChildId === child.child.id) {
      setSelectedSettingChildId(null);
      setBaseAmountInput("");
      setRecurrenceInput("weekly");
      setResetDayInput("");
      setAllowAdvancesInput(false);
      setMaxAdvanceInput("");
      return;
    }

    setSelectedSettingChildId(child.child.id);
    setBaseAmountInput("");
    setRecurrenceInput(child.setting?.recurrence ?? "weekly");
    setResetDayInput("");
    setAllowAdvancesInput(Boolean(child.setting?.allow_advances ?? false));
    setMaxAdvanceInput("");
  };

  const selectChildForPayment = (child: ChildBudget) => {
    if (selectedPaymentChildId === child.child.id) {
      setSelectedPaymentChildId(null);
      setPaymentAmountInput("");
      setPaymentCommentInput("");
      return;
    }

    setSelectedPaymentChildId(child.child.id);
    setPaymentAmountInput("");
    setPaymentCommentInput("");
  };

  const handleSaveSettings = async () => {
    if (!settingChild) return;

    const baseAmount = toNumber(baseAmountInput);
    const resetDay = toNumber(resetDayInput);
    const maxAdvance = toNumber(maxAdvanceInput);

    if (baseAmount === null || baseAmount < 0) {
      Alert.alert("Budget", "Le montant de base doit être positif.");
      return;
    }
    if (resetDay === null || !Number.isInteger(resetDay)) {
      Alert.alert("Budget", "Le jour de réinitialisation doit être un entier.");
      return;
    }
    if (recurrenceInput === "weekly" && (resetDay < 1 || resetDay > 7)) {
      Alert.alert("Budget", "En hebdo, le jour de réinitialisation doit être entre 1 et 7.");
      return;
    }
    if (recurrenceInput === "monthly" && (resetDay < 1 || resetDay > 31)) {
      Alert.alert("Budget", "En mensuel, le jour de réinitialisation doit être entre 1 et 31.");
      return;
    }
    if (maxAdvance === null || maxAdvance < 0) {
      Alert.alert("Budget", "Le plafond d'avance doit être positif.");
      return;
    }
    if (allowAdvancesInput && maxAdvance <= 0) {
      Alert.alert("Budget", "Le plafond d'avance doit être supérieur à 0 si les avances sont activées.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/budget/settings/${settingChild.child.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          base_amount: baseAmount,
          recurrence: recurrenceInput,
          reset_day: resetDay,
          allow_advances: allowAdvancesInput,
          max_advance_amount: allowAdvancesInput ? maxAdvance : 0,
        }),
      });
      await loadBoard();
      setSelectedSettingChildId(null);
      setBaseAmountInput("");
      setRecurrenceInput("weekly");
      setResetDayInput("");
      setAllowAdvancesInput(false);
      setMaxAdvanceInput("");
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'enregistrer le budget.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  const handleValidatePayment = async () => {
    if (!paymentChild) return;
    const amount = toNumber(paymentAmountInput);
    if (amount === null || amount <= 0) {
      Alert.alert("Budget", "Le montant validé doit être supérieur à 0.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/budget/payments", {
        method: "POST",
        body: JSON.stringify({
          user_id: paymentChild.child.id,
          amount,
          comment: paymentCommentInput.trim() === "" ? undefined : paymentCommentInput.trim(),
        }),
      });
      await loadBoard();
      setSelectedPaymentChildId(null);
      setPaymentAmountInput("");
      setPaymentCommentInput("");
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de valider le paiement.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  const handleRequestAdvance = async () => {
    const amount = toNumber(advanceAmountInput);
    if (amount === null || amount <= 0) {
      Alert.alert("Budget", "Le montant demandé doit être supérieur à 0.");
      return;
    }
    if (advanceCommentInput.trim().length < 4) {
      Alert.alert("Budget", "Ajoute une justification plus précise.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/budget/advances", {
        method: "POST",
        body: JSON.stringify({
          amount,
          comment: advanceCommentInput.trim(),
        }),
      });
      setAdvanceAmountInput("");
      setAdvanceCommentInput("");
      await loadBoard();
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'envoyer la demande d'avance.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  const handleReviewAdvance = async (request: BudgetTransaction, status: "approved" | "rejected") => {
    const amountText = reviewAmounts[request.id] ?? String(request.amount);
    const commentText = reviewComments[request.id] ?? "";
    const payload: { status: "approved" | "rejected"; amount?: number; comment?: string } = { status };

    if (status === "approved") {
      const amount = toNumber(amountText);
      if (amount === null || amount <= 0) {
        Alert.alert("Budget", "Le montant approuvé doit être supérieur à 0.");
        return;
      }
      payload.amount = amount;
    }

    if (commentText.trim() !== "") {
      payload.comment = commentText.trim();
    }

    setSaving(true);
    try {
      await apiFetch(`/budget/advances/${request.id}/review`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await loadBoard();
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de traiter la demande.";
      Alert.alert("Budget", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Argent de poche</Text>
          {isParent ? (
            <TouchableOpacity
              onPress={() => router.push("/householdSetup?mode=edit&scope=budget")}
              style={[styles.settingsBtn, { borderColor: theme.icon }]}
            >
              <MaterialCommunityIcons name="cog-outline" size={20} color={theme.tint} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
          {isParent ? "Configuration et validation des paiements." : "Suivi de ton argent de poche et demandes d'avance."}
        </Text>
      </View>

      {!board?.budget_enabled ? (
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Module désactivé</Text>
          <Text style={[styles.cardText, { color: theme.textSecondary }]}>Active le module budget dans la configuration du foyer.</Text>
        </View>
      ) : isParent ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Enfants du foyer</Text>
            {board.children.map((child) => {
              const isSettingOpen = selectedSettingChildId === child.child.id;
              const isPaymentOpen = selectedPaymentChildId === child.child.id;

              return (
                <View key={`child-${child.child.id}`} style={[styles.childRow, { borderColor: theme.icon + "55" }]}>
                  <View style={styles.childInfo}>
                    <Text style={[styles.childName, { color: theme.text }]}>{child.child.name}</Text>
                    <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                      {child.setting
                        ? `${formatMoney(child.setting.base_amount, currency)} · ${recurrenceLabel(child.setting.recurrence)} · réinitialisation ${resetDayLabel(child.setting.recurrence, child.setting.reset_day)}`
                        : "Configuration budget absente"}
                    </Text>
                    <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                      Période {formatPeriod(child.period.start, child.period.end)} · Reçu {formatMoney(child.summary.approved_total_period, currency)}
                    </Text>
                  </View>
                  <View style={styles.childButtons}>
                    <TouchableOpacity onPress={() => selectChildForSettings(child)} style={[styles.smallBtn, { backgroundColor: theme.tint }]}>
                      <Text style={styles.smallBtnText}>{isSettingOpen ? "Fermer" : "Paramètres"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => selectChildForPayment(child)} style={[styles.smallBtn, { backgroundColor: theme.accentCool }]}>
                      <Text style={styles.smallBtnText}>{isPaymentOpen ? "Fermer" : "Paiement"}</Text>
                    </TouchableOpacity>
                  </View>

                  {isSettingOpen ? (
                    <View style={[styles.inlineChildSettings, { borderColor: theme.icon + "55" }]}>
                      <Text style={[styles.fieldLabel, { color: theme.text }]}>Montant de base</Text>
                      <TextInput
                        value={baseAmountInput}
                        onChangeText={setBaseAmountInput}
                        keyboardType="decimal-pad"
                        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: 10,00"
                        placeholderTextColor={theme.textSecondary}
                      />

                      <Text style={[styles.fieldLabel, { color: theme.text }]}>Récurrence</Text>
                      <View style={styles.choiceRow}>
                        <TouchableOpacity
                          onPress={() => setRecurrenceInput("weekly")}
                          style={[styles.choiceBtn, recurrenceInput === "weekly" ? { backgroundColor: theme.tint } : { borderColor: theme.icon }]}
                        >
                          <Text style={[styles.choiceText, { color: recurrenceInput === "weekly" ? "#FFF" : theme.text }]}>Hebdo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setRecurrenceInput("monthly")}
                          style={[styles.choiceBtn, recurrenceInput === "monthly" ? { backgroundColor: theme.tint } : { borderColor: theme.icon }]}
                        >
                          <Text style={[styles.choiceText, { color: recurrenceInput === "monthly" ? "#FFF" : theme.text }]}>Mensuel</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.fieldLabel, { color: theme.text }]}>
                        {recurrenceInput === "weekly" ? "Jour de réinitialisation (1 à 7)" : "Jour de réinitialisation (1 à 31)"}
                      </Text>
                      <TextInput
                        value={resetDayInput}
                        onChangeText={setResetDayInput}
                        keyboardType="number-pad"
                        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                        placeholder={recurrenceInput === "weekly" ? "1 à 7" : "1 à 31"}
                        placeholderTextColor={theme.textSecondary}
                      />

                      <View style={styles.switchRow}>
                        <Text style={[styles.fieldLabel, { color: theme.text, marginBottom: 0 }]}>Autoriser les avances</Text>
                        <Switch value={allowAdvancesInput} onValueChange={setAllowAdvancesInput} trackColor={{ true: theme.tint }} />
                      </View>

                      <Text style={[styles.fieldLabel, { color: theme.text }]}>Plafond d&apos;avance</Text>
                      <TextInput
                        value={maxAdvanceInput}
                        onChangeText={setMaxAdvanceInput}
                        keyboardType="decimal-pad"
                        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: 15,00"
                        placeholderTextColor={theme.textSecondary}
                      />

                      <TouchableOpacity onPress={() => void handleSaveSettings()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
                        <Text style={styles.primaryBtnText}>{saving ? "En cours..." : "Enregistrer les paramètres"}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {isPaymentOpen ? (
                    <View style={[styles.inlineChildSettings, { borderColor: theme.icon + "55" }]}>
                      <Text style={[styles.fieldLabel, { color: theme.text }]}>Montant validé</Text>
                      <TextInput
                        value={paymentAmountInput}
                        onChangeText={setPaymentAmountInput}
                        keyboardType="decimal-pad"
                        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ex: 10,00"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <Text style={[styles.fieldLabel, { color: theme.text }]}>Commentaire (optionnel)</Text>
                      <TextInput
                        value={paymentCommentInput}
                        onChangeText={setPaymentCommentInput}
                        style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                        placeholder="Ajoute un commentaire"
                        placeholderTextColor={theme.textSecondary}
                      />
                      <TouchableOpacity onPress={() => void handleValidatePayment()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
                        <Text style={styles.primaryBtnText}>{saving ? "En cours..." : "Valider le paiement"}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Demandes d&apos;avance en attente</Text>
            {board.pending_advance_requests.length === 0 ? (
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>Aucune demande en attente.</Text>
            ) : (
              board.pending_advance_requests.map((request) => (
                <View key={`pending-${request.id}`} style={[styles.pendingRow, { borderColor: theme.icon + "55" }]}>
                  <Text style={[styles.childName, { color: theme.text }]}>
                    {request.user?.name ?? "Enfant"} · {formatMoney(request.amount, currency)}
                  </Text>
                  <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                    {request.comment || "Sans justification"} · {formatDateTime(request.created_at)}
                  </Text>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>Montant validé</Text>
                  <TextInput
                    value={reviewAmounts[request.id] ?? ""}
                    onChangeText={(value) => setReviewAmounts((prev) => ({ ...prev, [request.id]: value }))}
                    keyboardType="decimal-pad"
                    style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                    placeholder="Ex: 12,50"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>Commentaire parent (optionnel)</Text>
                  <TextInput
                    value={reviewComments[request.id] ?? ""}
                    onChangeText={(value) => setReviewComments((prev) => ({ ...prev, [request.id]: value }))}
                    style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                    placeholder="Ajoute un commentaire"
                    placeholderTextColor={theme.textSecondary}
                  />
                  <View style={styles.pendingActions}>
                    <TouchableOpacity
                      onPress={() => void handleReviewAdvance(request, "approved")}
                      style={[styles.smallBtn, { backgroundColor: theme.tint }]}
                      disabled={saving}
                    >
                      <Text style={styles.smallBtnText}>Approuver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void handleReviewAdvance(request, "rejected")}
                      style={[styles.smallBtn, { backgroundColor: theme.accentWarm }]}
                      disabled={saving}
                    >
                      <Text style={styles.smallBtnText}>Refuser</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>

        </>
      ) : myBudget ? (
        <>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Mon argent de poche</Text>
            {myBudget.setting ? (
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                {formatMoney(myBudget.setting.base_amount, currency)} · {recurrenceLabel(myBudget.setting.recurrence)} · réinitialisation {resetDayLabel(myBudget.setting.recurrence, myBudget.setting.reset_day)}
              </Text>
            ) : (
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>Ton budget n&apos;a pas encore été configuré.</Text>
            )}
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
              Période {formatPeriod(myBudget.period.start, myBudget.period.end)}
            </Text>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>
              Reçu: {formatMoney(myBudget.summary.approved_total_period, currency)} · En attente: {formatMoney(myBudget.summary.pending_advance_total_period, currency)}
            </Text>
            <Text style={[styles.cardText, { color: theme.textSecondary }]}>Solde cumulé: {formatMoney(myBudget.summary.lifetime_balance, currency)}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Demander une avance</Text>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Montant</Text>
            <TextInput
              value={advanceAmountInput}
              onChangeText={setAdvanceAmountInput}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
              placeholder="Ex: 15,00"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Justification</Text>
            <TextInput
              value={advanceCommentInput}
              onChangeText={setAdvanceCommentInput}
              style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.icon }]}
              placeholder="Explique pourquoi tu demandes une avance"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <TouchableOpacity onPress={() => void handleRequestAdvance()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? "En cours..." : "Envoyer la demande"}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Historique</Text>
            {myBudget.transactions.length === 0 ? (
              <Text style={[styles.cardText, { color: theme.textSecondary }]}>Aucune transaction.</Text>
            ) : (
              myBudget.transactions.map((transaction) => (
                <View key={`tx-${transaction.id}`} style={[styles.transactionRow, { borderColor: theme.icon + "55" }]}>
                  <Text style={[styles.childName, { color: theme.text }]}>{formatMoney(transaction.signed_amount, currency)}</Text>
                  <Text style={[styles.cardText, { color: theme.textSecondary }]}>
                    {transactionTypeLabel(transaction.type)} · {transactionStatusLabel(transaction.status)} · {formatDateTime(transaction.created_at)}
                  </Text>
                  {transaction.comment ? (
                    <Text style={[styles.cardText, { color: theme.textSecondary }]}>{transaction.comment}</Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    gap: 4,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardText: {
    fontSize: 13,
    lineHeight: 18,
  },
  childRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  childInfo: {
    gap: 2,
  },
  childName: {
    fontSize: 14,
    fontWeight: "700",
  },
  childButtons: {
    flexDirection: "row",
    gap: 8,
  },
  inlineChildSettings: {
    borderTopWidth: 1,
    marginTop: 2,
    paddingTop: 10,
    gap: 8,
  },
  pendingRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
  },
  smallBtn: {
    borderRadius: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  choiceRow: {
    flexDirection: "row",
    gap: 8,
  },
  choiceBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: {
    fontWeight: "700",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#FFF",
    fontWeight: "700",
  },
  transactionRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
});
