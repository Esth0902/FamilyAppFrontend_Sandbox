import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { getStoredHouseholdId } from "@/src/session/user-cache";

type ShoppingListSummary = {
  id: number;
  title: string;
  status: "active" | "inactive";
  items_count: number;
  created_at?: string | null;
};

type ShoppingListHomePayload = {
  can_manage: boolean;
  lists: ShoppingListSummary[];
};

const formatCreatedAt = (iso?: string | null) => {
  if (!iso) return "-";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function ShoppingListsHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [lists, setLists] = useState<ShoppingListSummary[]>([]);
  const [newListTitle, setNewListTitle] = useState("");

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [lists]);

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const response = (await apiFetch("/shopping-lists")) as ShoppingListHomePayload;
      setCanManage(Boolean(response?.can_manage));
      setLists(Array.isArray(response?.lists) ? response.lists : []);
    } catch (error: any) {
      Alert.alert("Listes de courses", error?.message || "Impossible de charger les listes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let unsubscribeRealtime: (() => void) | null = null;

      const bootstrapRealtime = async () => {
        await loadLists();

        if (!active) return;

        const householdId = await getStoredHouseholdId();
        if (!householdId || !active) return;

        unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
          if (message?.module !== "shopping_list") return;
          void loadLists();
        }, (error) => {
          if (__DEV__) {
            console.warn("[shopping-list home] realtime disabled, fallback polling active", error);
          }
        });
      };

      void bootstrapRealtime();

      const fallbackInterval = setInterval(() => {
        if (!active) return;
        void loadLists();
      }, 12000);

      return () => {
        active = false;
        if (unsubscribeRealtime) {
          unsubscribeRealtime();
        }
        clearInterval(fallbackInterval);
      };
    }, [loadLists])
  );

  const createList = async () => {
    if (!canManage) return;

    const title = newListTitle.trim();
    if (!title) {
      Alert.alert("Listes de courses", "Le nom de la liste est obligatoire.");
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch("/shopping-lists", {
        method: "POST",
        body: JSON.stringify({ title }),
      });

      const created = response?.list;
      if (created?.id) {
        setLists((prev) => [created, ...prev]);
        setNewListTitle("");
      } else {
        await loadLists();
      }
    } catch (error: any) {
      Alert.alert("Listes de courses", error?.message || "Impossible de créer la liste.");
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (list: ShoppingListSummary) => {
    if (!canManage) return;

    Alert.alert(
      "Supprimer la liste",
      `Supprimer "${list.title}" ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await apiFetch(`/shopping-lists/${list.id}`, { method: "DELETE" });
              setLists((prev) => prev.filter((item) => item.id !== list.id));
            } catch (error: any) {
              Alert.alert("Listes de courses", error?.message || "Impossible de supprimer la liste.");
            } finally {
              setSaving(false);
            }
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { borderBottomColor: theme.icon, paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity onPress={() => router.replace("/(tabs)/meal")} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Listes de courses</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {canManage ? (
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Nouvelle liste</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex, { backgroundColor: theme.background, color: theme.text }]}
                value={newListTitle}
                onChangeText={setNewListTitle}
                placeholder="Nom de la liste"
                placeholderTextColor={theme.textSecondary}
              />
              <TouchableOpacity
                onPress={() => void createList()}
                style={[styles.addBtn, { backgroundColor: theme.tint, opacity: saving ? 0.7 : 1 }]}
                disabled={saving}
              >
                <Text style={styles.addBtnText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Listes existantes</Text>

          {sortedLists.length > 0 ? (
            sortedLists.map((list) => (
              <View key={list.id} style={[styles.listRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => router.push(`/meal/shopping-list/${list.id}`)}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>{list.title}</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {list.items_count} élément(s) - créée le {formatCreatedAt(list.created_at)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push(`/meal/shopping-list/${list.id}`)} style={styles.iconBtn}>
                  <MaterialCommunityIcons name="chevron-right" size={22} color={theme.textSecondary} />
                </TouchableOpacity>

                {canManage ? (
                  <TouchableOpacity onPress={() => void deleteList(list)} disabled={saving} style={styles.iconBtn}>
                    <MaterialCommunityIcons name="trash-can-outline" size={20} color="#CC4B4B" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={{ color: theme.textSecondary }}>Aucune liste pour le moment.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    minHeight: 60,
    paddingHorizontal: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { borderRadius: 14, padding: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex: { flex: 1 },
  input: { borderRadius: 10, height: 42, paddingHorizontal: 12 },
  addBtn: {
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "white", fontWeight: "700" },
  listRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: { padding: 4 },
});
