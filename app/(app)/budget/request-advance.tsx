import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";
import { BudgetBoardPayload, formatMoney, toNumber } from "@/src/budget/common";

export default function BudgetRequestAdvanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<BudgetBoardPayload | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [commentInput, setCommentInput] = useState("");

  const loadBoard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const payload = await apiFetch("/budget/board") as BudgetBoardPayload;
      setBoard(payload);
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible de charger le budget.";
      Alert.alert("Budget", message);
      setBoard(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadBoard({ silent: false }); }, [loadBoard]));

  useEffect(() => {
    if (!householdId) return;
    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;
    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "budget") return;
        void loadBoard({ silent: true });
      });
    };
    void bindRealtime();
    return () => {
      active = false;
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [householdId, loadBoard]);

  const isParent = board?.current_user.role === "parent";
  const myBudget = board?.children[0] ?? null;
  const currency = useMemo(() => (board?.currency || "EUR").toUpperCase(), [board?.currency]);

  const handleSubmit = async () => {
    const amount = toNumber(amountInput);
    if (amount === null || amount <= 0) {
      Alert.alert("Budget", "Le montant demandé doit être supérieur à 0.");
      return;
    }
    if (commentInput.trim().length < 4) {
      Alert.alert("Budget", "Ajoute une justification plus précise.");
      return;
    }

    setSaving(true);
    try {
      await apiFetch("/budget/advances", {
        method: "POST",
        body: JSON.stringify({ amount, comment: commentInput.trim() }),
      });
      setAmountInput("");
      setCommentInput("");
      await loadBoard();
      Alert.alert("Budget", "Demande d'avance envoyée.");
    } catch (error: unknown) {
      const message = (error as { message?: string })?.message || "Impossible d'envoyer la demande.";
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

  if (isParent) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 16 }]}>
        <Text style={{ color: theme.text }}>Accès réservé aux enfants.</Text>
      </View>
    );
  }

  return (
    <ScrollView stickyHeaderIndices={[0]} style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.headerRow, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12), backgroundColor: theme.background }]}>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/budget")} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Demande d&apos;avance</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Montant + justification</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        {myBudget?.setting?.allow_advances ? (
          <>
            <Text style={[styles.text, { color: theme.textSecondary }]}>
              Plafond autorisé : {formatMoney(myBudget.setting.max_advance_amount, currency)}
            </Text>
            <Text style={[styles.label, { color: theme.text }]}>Montant</Text>
            <TextInput
              value={amountInput}
              onChangeText={setAmountInput}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
              placeholder="Ex: 8,00"
              placeholderTextColor={theme.textSecondary}
            />
            <Text style={[styles.label, { color: theme.text }]}>Justification</Text>
            <TextInput
              value={commentInput}
              onChangeText={setCommentInput}
              style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.icon }]}
              placeholder="Explique pourquoi tu demandes une avance"
              placeholderTextColor={theme.textSecondary}
              multiline
            />
            <TouchableOpacity onPress={() => void handleSubmit()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
              <Text style={styles.primaryBtnText}>{saving ? "En cours..." : "Envoyer la demande"}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.text, { color: theme.textSecondary }]}>
            Les avances ne sont pas autorisées pour ton budget.
          </Text>
        )}
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
  text: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  primaryBtn: {
    borderRadius: 10,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
});
