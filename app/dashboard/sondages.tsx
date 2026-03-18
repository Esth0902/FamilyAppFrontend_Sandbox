import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { apiFetch } from "@/src/api/client";
import { subscribeToHouseholdRealtime } from "@/src/realtime/client";
import { useStoredUserState } from "@/src/session/user-cache";

type DashboardPollOption = {
  id: number;
  recipe_id: number;
  title: string;
  votes_count: number;
};

type DashboardVoterSummary = {
  user_id: number;
  name: string;
  votes_count: number;
};

type DashboardPoll = {
  id: number;
  title?: string | null;
  status: "open" | "closed" | "validated";
  starts_at?: string | null;
  ends_at?: string | null;
  planning_start_date?: string | null;
  planning_end_date?: string | null;
  max_votes_per_user: number;
  total_votes: number;
  options: DashboardPollOption[];
  voters_summary: DashboardVoterSummary[];
};

type FavoriteRecipe = {
  recipe_id: number;
  title: string;
  votes_count: number;
  polls_count: number;
};

type DashboardResponse = {
  polls_open?: DashboardPoll[];
  polls_closed?: DashboardPoll[];
  polls?: DashboardPoll[];
  favorite_recipes?: FavoriteRecipe[];
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "-";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const statusLabel = (status: DashboardPoll["status"]) => {
  if (status === "open") return "Ouvert";
  if (status === "closed") return "Cloturé";
  return "Valide";
};

export default function DashboardPollsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [openOpenPolls, setOpenOpenPolls] = useState(false);
  const [openClosedPolls, setOpenClosedPolls] = useState(false);
  const [openAllPolls, setOpenAllPolls] = useState(false);
  const [openFavoriteRecipes, setOpenFavoriteRecipes] = useState(false);

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const response = await apiFetch("/dashboard");
      setData(response ?? null);
    } catch (error: any) {
      Alert.alert("Dashboard", error?.message || "Impossible de charger le dashboard.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard({ silent: false });
    }, [loadDashboard])
  );

  useEffect(() => {
    if (!householdId) {
      return;
    }

    let unsubscribeRealtime: (() => void) | null = null;
    let active = true;

    const bindRealtime = async () => {
      unsubscribeRealtime = await subscribeToHouseholdRealtime(householdId, (message) => {
        if (!active) return;
        const module = String(message?.module ?? "");
        if (module !== "meal_poll" && module !== "tasks" && module !== "budget" && module !== "calendar") {
          return;
        }
        void loadDashboard({ silent: true });
      });
    };

    void bindRealtime();

    return () => {
      active = false;
      if (unsubscribeRealtime) {
        unsubscribeRealtime();
      }
    };
  }, [householdId, loadDashboard]);

  const pollsOpen = data?.polls_open ?? [];
  const pollsClosed = data?.polls_closed ?? [];
  const allPolls = data?.polls ?? [];
  const favoriteRecipes = data?.favorite_recipes ?? [];
  const compactCardBackground = colorScheme === "dark" ? `${theme.icon}22` : theme.background;

  const renderSectionHeader = (
    title: string,
    hasContent: boolean,
    opened: boolean,
    onToggle: () => void
  ) => {
    if (!hasContent) {
      return <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>;
    }

    return (
      <TouchableOpacity style={styles.sectionHeaderRow} onPress={onToggle} activeOpacity={0.8}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <MaterialCommunityIcons
          name={opened ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.textSecondary}
        />
      </TouchableOpacity>
    );
  };

  const renderPollCard = (poll: DashboardPoll, showOptions: boolean) => (
    <View key={`poll-${poll.id}`} style={[styles.pollCard, { borderColor: `${theme.icon}88`, backgroundColor: compactCardBackground }]}>
      <View style={styles.pollTitleRow}>
        <Text style={[styles.pollTitle, { color: theme.text }]} numberOfLines={2}>
          {poll.title || `Sondage #${poll.id}`}
        </Text>
        <Text style={[styles.pollStatus, { color: theme.textSecondary }]}>{statusLabel(poll.status)}</Text>
      </View>

      <Text style={[styles.pollMeta, { color: theme.textSecondary }]}>Ouvert le {formatDateTime(poll.starts_at)}</Text>
      <Text style={[styles.pollMeta, { color: theme.textSecondary }]}>Fin du vote le {formatDateTime(poll.ends_at)}</Text>
      <Text style={[styles.pollMeta, { color: theme.textSecondary }]}>
        Période planification {formatDate(poll.planning_start_date)} {"->"} {formatDate(poll.planning_end_date)}
      </Text>
      <Text style={[styles.pollMeta, { color: theme.textSecondary }]}>Votes totaux {poll.total_votes}</Text>

      {showOptions ? (
        <View style={styles.pollDetailsWrap}>
          {Array.isArray(poll.options) && poll.options.length > 0 ? (
            poll.options.map((option) => (
              <View key={`poll-${poll.id}-opt-${option.id}`} style={styles.optionRow}>
                <Text style={[styles.optionTitle, { color: theme.text }]} numberOfLines={1}>
                  {option.title}
                </Text>
                <Text style={[styles.optionVotes, { color: theme.textSecondary }]}>{option.votes_count} vote(s)</Text>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucune option.</Text>
          )}

          <View style={styles.votersWrap}>
            <Text style={[styles.votersTitle, { color: theme.text }]}>Votes par membre</Text>
            {Array.isArray(poll.voters_summary) && poll.voters_summary.length > 0 ? (
              poll.voters_summary.map((voter) => (
                <View key={`poll-${poll.id}-voter-${voter.user_id}`} style={styles.voterRow}>
                  <Text style={{ color: theme.text }}>{voter.name}</Text>
                  <Text style={{ color: theme.textSecondary }}>{voter.votes_count}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun vote.</Text>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );

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
        <TouchableOpacity onPress={() => router.replace("/dashboard")} style={[styles.backBtn, { borderColor: theme.icon }]}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={theme.tint} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Sondages</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
          {renderSectionHeader("Sondages ouverts", pollsOpen.length > 0, openOpenPolls, () =>
            setOpenOpenPolls((prev) => !prev)
          )}
          {pollsOpen.length > 0 ? openOpenPolls ? pollsOpen.map((poll) => renderPollCard(poll, false)) : null : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun sondage ouvert.</Text>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
          {renderSectionHeader("Sondages clôturés", pollsClosed.length > 0, openClosedPolls, () =>
            setOpenClosedPolls((prev) => !prev)
          )}
          {pollsClosed.length > 0 ? openClosedPolls ? pollsClosed.map((poll) => renderPollCard(poll, false)) : null : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun sondage cloturé.</Text>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
          {renderSectionHeader("Tous les sondages et votes", allPolls.length > 0, openAllPolls, () =>
            setOpenAllPolls((prev) => !prev)
          )}
          {allPolls.length > 0 ? openAllPolls ? allPolls.map((poll) => renderPollCard(poll, true)) : null : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun sondage.</Text>
          )}
        </View>

        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.icon }]}>
          {renderSectionHeader("Recettes preferées des sondages", favoriteRecipes.length > 0, openFavoriteRecipes, () =>
            setOpenFavoriteRecipes((prev) => !prev)
          )}
          {favoriteRecipes.length > 0 ? openFavoriteRecipes ? (
            favoriteRecipes.map((recipe, index) => (
              <View
                key={`fav-${recipe.recipe_id}`}
                style={[styles.favoriteRow, { borderColor: `${theme.icon}88`, backgroundColor: compactCardBackground }]}
              >
                <Text style={[styles.favoriteRank, { color: theme.tint }]}>{index + 1}.</Text>
                <View style={styles.favoriteTextWrap}>
                  <Text style={[styles.favoriteTitle, { color: theme.text }]} numberOfLines={1}>
                    {recipe.title}
                  </Text>
                  <Text style={[styles.favoriteMeta, { color: theme.textSecondary }]}>
                    {recipe.votes_count} vote(s) sur {recipe.polls_count} sondage(s)
                  </Text>
                </View>
              </View>
            ))
          ) : null : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucune recette n&apos;a reçu de vote.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: { flex: 1 },
  header: {
    minHeight: 60,
    paddingHorizontal: 20,
    paddingVertical: 8,
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
  headerTitle: { fontSize: 18, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  sectionCard: { borderRadius: 14, padding: 12, borderWidth: 1 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pollCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  pollTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  pollTitle: { flex: 1, fontWeight: "700", fontSize: 14 },
  pollStatus: { fontSize: 12, fontWeight: "700" },
  pollMeta: { fontSize: 12, marginTop: 3 },
  pollDetailsWrap: { marginTop: 8, gap: 6 },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  optionTitle: { flex: 1, fontSize: 13, fontWeight: "600" },
  optionVotes: { fontSize: 12, fontWeight: "600" },
  votersWrap: { marginTop: 6, borderTopWidth: 1, borderTopColor: "#D9D9D9", paddingTop: 6 },
  votersTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  voterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  emptyText: { fontSize: 13 },
  favoriteRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  favoriteRank: { width: 22, fontWeight: "800", fontSize: 15, textAlign: "right" },
  favoriteTextWrap: { flex: 1 },
  favoriteTitle: { fontWeight: "700", fontSize: 14 },
  favoriteMeta: { fontSize: 12, marginTop: 2 },
});
