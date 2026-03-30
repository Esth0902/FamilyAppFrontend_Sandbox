import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useAuthStore } from "@/src/store/useAuthStore";

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
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const queryClient = useQueryClient();
  const householdId = useAuthStore((state) => {
    const candidate = Number(state.user?.household_id ?? 0);
    return Number.isFinite(candidate) && candidate > 0 ? Math.trunc(candidate) : 0;
  });

  const [newListTitle, setNewListTitle] = useState("");
  const shoppingListsQueryKey = useMemo(() => ["shoppingLists", householdId] as const, [householdId]);

  const shoppingListsQuery = useQuery({
    queryKey: shoppingListsQueryKey,
    queryFn: async () => {
      const response = (await apiFetch("/shopping-lists")) as ShoppingListHomePayload;
      return {
        can_manage: Boolean(response?.can_manage),
        lists: Array.isArray(response?.lists) ? response.lists : [],
      } as ShoppingListHomePayload;
    },
    refetchInterval: 12000,
    refetchIntervalInBackground: true,
  });

  const canManage = Boolean(shoppingListsQuery.data?.can_manage);
  const lists = useMemo(() => shoppingListsQuery.data?.lists ?? [], [shoppingListsQuery.data?.lists]);

  const sortedLists = useMemo(() => {
    return [...lists].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });
  }, [lists]);

  const invalidateShoppingLists = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: shoppingListsQueryKey });
  }, [queryClient, shoppingListsQueryKey]);

  useEffect(() => {
    if (!householdId) {
      return () => {};
    }

    let active = true;
    let unsubscribeRealtime: (() => void) | null = null;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        if (message?.module !== "shopping_list") return;
        void invalidateShoppingLists();
      }, (error) => {
        if (__DEV__) {
          console.warn("[shopping-list home] realtime invalidation unavailable", error);
        }
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, invalidateShoppingLists]);

  useEffect(() => {
    if (!shoppingListsQuery.error) {
      return;
    }
    const error = shoppingListsQuery.error as { message?: string } | null;
    Alert.alert("Listes de courses", error?.message || "Impossible de charger les listes.");
  }, [shoppingListsQuery.error]);

  const createListMutation = useMutation({
    mutationFn: async (title: string) => {
      return await apiFetch("/shopping-lists", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: () => {
      setNewListTitle("");
      void invalidateShoppingLists();
    },
    onError: (error: unknown) => {
      const err = error as { message?: string } | null;
      Alert.alert("Listes de courses", err?.message || "Impossible de créer la liste.");
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: number) => {
      await apiFetch(`/shopping-lists/${listId}`, { method: "DELETE" });
      return listId;
    },
    onSuccess: () => {
      void invalidateShoppingLists();
    },
    onError: (error: unknown) => {
      const err = error as { message?: string } | null;
      Alert.alert("Listes de courses", err?.message || "Impossible de supprimer la liste.");
    },
  });

  const saving = createListMutation.isPending || deleteListMutation.isPending;

  const createList = async () => {
    if (!canManage) return;

    const title = newListTitle.trim();
    if (!title) {
      Alert.alert("Listes de courses", "Le nom de la liste est obligatoire.");
      return;
    }

    try {
      await createListMutation.mutateAsync(title);
    } catch {}
  };

  const deleteList = useCallback(async (list: ShoppingListSummary) => {
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
            try {
              await deleteListMutation.mutateAsync(list.id);
            } catch {}
          },
        },
      ]
    );
  }, [canManage, deleteListMutation]);

  const renderShoppingListRow = useCallback(
    ({ item: list }: { item: ShoppingListSummary }) => (
      <View style={[styles.listRow, { borderColor: theme.icon, backgroundColor: theme.background }]}>
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
    ),
    [canManage, deleteList, router, saving, theme.background, theme.icon, theme.text, theme.textSecondary]
  );

  if (shoppingListsQuery.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader
        title="Listes de courses"
        withBackButton
        backHref="/(app)/(tabs)/meal"
        safeTop
        showBorder
      />

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

          <FlatList
            data={sortedLists}
            keyExtractor={(list) => String(list.id)}
            renderItem={renderShoppingListRow}
            scrollEnabled={false}
            initialNumToRender={8}
            removeClippedSubviews
            ListEmptyComponent={<Text style={{ color: theme.textSecondary }}>Aucune liste pour le moment.</Text>}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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


