import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
import { BudgetBoardPayload, toNumber } from "@/src/budget/common";

export default function BudgetRequestReimbursementScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();
  const queryClient = useQueryClient();

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

  const isParent = board?.current_user.role === "parent";

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
      await apiFetch("/budget/reimbursements", {
        method: "POST",
        body: JSON.stringify({ amount, comment: commentInput.trim() }),
      });
      setAmountInput("");
      setCommentInput("");
      await loadBoard();
      await invalidateBudgetAndDashboard();
      Alert.alert("Budget", "Demande de remboursement envoyée.");
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
        <TouchableOpacity onPress={onBackPress} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Demande de remboursement</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Montant + justification</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.icon }]}>
        <Text style={[styles.text, { color: theme.textSecondary }]}>
          Exemple : tu as fait des courses et tu dois être remboursé.
        </Text>
        <Text style={[styles.label, { color: theme.text }]}>Montant</Text>
        <TextInput
          value={amountInput}
          onChangeText={setAmountInput}
          keyboardType="decimal-pad"
          style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
          placeholder="Ex: 12,50"
          placeholderTextColor={theme.textSecondary}
        />
        <Text style={[styles.label, { color: theme.text }]}>Justification</Text>
        <TextInput
          value={commentInput}
          onChangeText={setCommentInput}
          style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.icon }]}
          placeholder="Explique la dépense (courses, pharmacie, etc.)"
          placeholderTextColor={theme.textSecondary}
          multiline
        />
        <TouchableOpacity onPress={() => void handleSubmit()} style={[styles.primaryBtn, { backgroundColor: theme.tint }]} disabled={saving}>
          <Text style={styles.primaryBtnText}>{saving ? "En cours..." : "Envoyer la demande"}</Text>
        </TouchableOpacity>
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
