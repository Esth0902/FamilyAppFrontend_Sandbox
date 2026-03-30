import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import { useRealtimeRefetch } from "@/src/hooks/useRealtimeRefetch";
import { useStoredUserState } from "@/src/session/user-cache";
import {
  buildFavoriteRecipesFromPolls,
  fetchActiveMealPoll,
  fetchMealPollHistoryPage,
  type DashboardFavoriteRecipe,
  type DashboardPoll,
} from "@/src/services/dashboardService";

const EMPTY_POLLS: DashboardPoll[] = [];
const EMPTY_FAVORITE_RECIPES: DashboardFavoriteRecipe[] = [];
const INITIAL_ALL_POLLS_VISIBLE = 12;
const HISTORY_PAGE_SIZE = 20;

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
  if (status === "closed") return "Clôturé";
  return "Validé";
};

export default function DashboardPollsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const { householdId } = useStoredUserState();

  const [openOpenPoll, setOpenOpenPoll] = useState(true);
  const [openAllPolls, setOpenAllPolls] = useState(false);
  const [openFavoriteRecipes, setOpenFavoriteRecipes] = useState(false);
  const [allPollsVisibleCount, setAllPollsVisibleCount] = useState(INITIAL_ALL_POLLS_VISIBLE);
  const historyQueryEnabled = householdId !== null && (openAllPolls || openFavoriteRecipes);

  const activePollQueryKey = useMemo(
    () => ["dashboard", householdId ?? 0, "meal-poll", "active"] as const,
    [householdId]
  );
  const pollHistoryQueryKey = useMemo(
    () => ["dashboard", householdId ?? 0, "meal-poll", "history", HISTORY_PAGE_SIZE] as const,
    [householdId]
  );

  const activePollQuery = useQuery({
    queryKey: activePollQueryKey,
    enabled: householdId !== null,
    staleTime: 12_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: () => fetchActiveMealPoll(),
  });

  const pollHistoryQuery = useInfiniteQuery({
    queryKey: pollHistoryQueryKey,
    enabled: historyQueryEnabled,
    staleTime: 20_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchMealPollHistoryPage({
        page: Number(pageParam),
        limit: HISTORY_PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => {
      return lastPage.meta.has_more ? lastPage.meta.current_page + 1 : undefined;
    },
  });

  const refetchActivePoll = activePollQuery.refetch;
  const refetchPollHistory = pollHistoryQuery.refetch;
  const hasNextPollHistoryPage = Boolean(pollHistoryQuery.hasNextPage);
  const isFetchingNextPollHistoryPage = pollHistoryQuery.isFetchingNextPage;
  const fetchNextPollHistoryPage = pollHistoryQuery.fetchNextPage;

  const refreshPollsData = useCallback(async () => {
    await refetchActivePoll();
    if (historyQueryEnabled) {
      await refetchPollHistory();
    }
  }, [historyQueryEnabled, refetchActivePoll, refetchPollHistory]);

  useRealtimeRefetch({
    householdId,
    module: "meal_poll",
    refresh: refreshPollsData,
  });

  const activePoll = (activePollQuery.data ?? null) as DashboardPoll | null;
  const pollHistoryPages = useMemo(
    () => pollHistoryQuery.data?.pages ?? [],
    [pollHistoryQuery.data?.pages]
  );

  const historyPolls = useMemo(() => {
    return pollHistoryPages.flatMap((page) => page.data);
  }, [pollHistoryPages]);

  const openPolls = useMemo(() => {
    if (activePoll?.status === "open") {
      return [activePoll];
    }
    return EMPTY_POLLS;
  }, [activePoll]);

  const allPolls = useMemo(() => {
    const merged = [...historyPolls];
    if (activePoll) {
      const alreadyInHistory = merged.some((poll) => poll.id === activePoll.id);
      if (!alreadyInHistory) {
        merged.unshift(activePoll);
      }
    }
    return merged;
  }, [activePoll, historyPolls]);

  const visibleAllPolls = useMemo(
    () => allPolls.slice(0, allPollsVisibleCount),
    [allPolls, allPollsVisibleCount]
  );

  const favoriteRecipes = useMemo(() => {
    if (allPolls.length === 0) {
      return EMPTY_FAVORITE_RECIPES;
    }
    return buildFavoriteRecipesFromPolls(allPolls, 20);
  }, [allPolls]);

  const screenError = activePollQuery.error || pollHistoryQuery.error;

  useEffect(() => {
    if (!screenError) {
      return;
    }
    const error = screenError as { message?: string } | null;
    const message = error?.message || "Impossible de charger les sondages.";
    console.error("Dashboard sondages:", message);
  }, [screenError]);

  const compactCardBackground = colorScheme === "dark" ? `${theme.icon}22` : theme.background;
  const sectionCardStyle = useMemo(
    () => [styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.icon }],
    [theme.card, theme.icon]
  );
  const pollCardStyle = useMemo(
    () => [styles.pollCard, { borderColor: `${theme.icon}88`, backgroundColor: compactCardBackground }],
    [compactCardBackground, theme.icon]
  );
  const favoriteRowStyle = useMemo(
    () => [styles.favoriteRow, { borderColor: `${theme.icon}88`, backgroundColor: compactCardBackground }],
    [compactCardBackground, theme.icon]
  );

  const onBackPress = useCallback(() => {
    router.replace("/dashboard");
  }, [router]);
  const onToggleOpenPoll = useCallback(() => setOpenOpenPoll((prev) => !prev), []);
  const onToggleAllPolls = useCallback(() => {
    setOpenAllPolls((prev) => {
      const next = !prev;
      if (next) {
        setAllPollsVisibleCount(INITIAL_ALL_POLLS_VISIBLE);
      }
      return next;
    });
  }, []);
  const onToggleFavoriteRecipes = useCallback(() => setOpenFavoriteRecipes((prev) => !prev), []);

  const canLoadMoreAllPolls =
    allPollsVisibleCount < allPolls.length || hasNextPollHistoryPage;

  const onLoadMoreAllPolls = useCallback(() => {
    if (allPollsVisibleCount < allPolls.length) {
      setAllPollsVisibleCount((prev) => prev + INITIAL_ALL_POLLS_VISIBLE);
      return;
    }

    if (!hasNextPollHistoryPage || isFetchingNextPollHistoryPage) {
      return;
    }

    void fetchNextPollHistoryPage();
  }, [
    allPolls.length,
    allPollsVisibleCount,
    fetchNextPollHistoryPage,
    hasNextPollHistoryPage,
    isFetchingNextPollHistoryPage,
  ]);

  const renderSectionHeader = useCallback((
    title: string,
    opened: boolean,
    onToggle: () => void,
    expandable = true
  ) => {
    if (!expandable) {
      return <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>;
    }

    return (
      <TouchableOpacity style={styles.sectionHeaderRow} activeOpacity={0.7} onPress={onToggle}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <MaterialCommunityIcons
          name={opened ? "chevron-up" : "chevron-down"}
          size={20}
          color={theme.textSecondary}
        />
      </TouchableOpacity>
    );
  }, [theme.text, theme.textSecondary]);

  const renderPollCard = useCallback((poll: DashboardPoll) => (
    <View key={`poll-${poll.id}`} style={pollCardStyle}>
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

      <View style={styles.pollDetailsWrap}>
        {poll.options.length > 0 ? (
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

        <View style={[styles.votersWrap, { borderTopColor: `${theme.icon}88` }]}>
          <Text style={[styles.votersTitle, { color: theme.text }]}>Votes par membre</Text>
          {poll.voters_summary.length > 0 ? (
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
    </View>
  ), [pollCardStyle, theme.icon, theme.text, theme.textSecondary]);

  const openPollCards = useMemo(() => {
    if (!openOpenPoll) {
      return null;
    }
    return openPolls.map((poll) => renderPollCard(poll));
  }, [openOpenPoll, openPolls, renderPollCard]);

  const allPollCards = useMemo(() => {
    if (!openAllPolls) {
      return null;
    }
    return visibleAllPolls.map((poll) => renderPollCard(poll));
  }, [openAllPolls, renderPollCard, visibleAllPolls]);

  const favoriteRecipeCards = useMemo(() => {
    if (!openFavoriteRecipes) {
      return null;
    }

    return favoriteRecipes.map((recipe, index) => (
      <View key={`fav-${recipe.recipe_id}`} style={favoriteRowStyle}>
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
    ));
  }, [favoriteRecipes, favoriteRowStyle, openFavoriteRecipes, theme.text, theme.textSecondary, theme.tint]);

  if (activePollQuery.isPending && !activePoll) {
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
        title="Sondages"
        withBackButton
        onBackPress={onBackPress}
        safeTop
        showBorder
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={sectionCardStyle}>
          {renderSectionHeader("Sondage ouvert", openOpenPoll, onToggleOpenPoll, openPolls.length > 0)}
          {openPolls.length > 0 ? openPollCards : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun sondage ouvert.</Text>
          )}
        </View>

        <View style={sectionCardStyle}>
          {renderSectionHeader("Tous les sondages et votes", openAllPolls, onToggleAllPolls)}
          {allPolls.length > 0 ? allPollCards : openAllPolls && pollHistoryQuery.isPending ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={theme.tint} />
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>Aucun sondage.</Text>
          )}
          {openAllPolls && canLoadMoreAllPolls ? (
            <TouchableOpacity
              style={[styles.loadMoreButton, { borderColor: theme.icon }]}
              onPress={onLoadMoreAllPolls}
              activeOpacity={0.8}
              disabled={isFetchingNextPollHistoryPage}
            >
              {isFetchingNextPollHistoryPage ? (
                <ActivityIndicator size="small" color={theme.tint} />
              ) : (
                <Text style={[styles.loadMoreText, { color: theme.text }]}>Charger plus</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={sectionCardStyle}>
          {renderSectionHeader(
            "Recettes préférées des sondages",
            openFavoriteRecipes,
            onToggleFavoriteRecipes
          )}
          {favoriteRecipes.length > 0 ? favoriteRecipeCards : openFavoriteRecipes && pollHistoryQuery.isPending ? (
            <View style={styles.inlineLoader}>
              <ActivityIndicator size="small" color={theme.tint} />
            </View>
          ) : (
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
  votersWrap: { marginTop: 6, borderTopWidth: 1, paddingTop: 6 },
  votersTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  voterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  emptyText: { fontSize: 13 },
  loadMoreButton: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    fontSize: 13,
    fontWeight: "700",
  },
  inlineLoader: {
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
  },
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
