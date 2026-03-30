import React from "react";
import { ActivityIndicator, Animated, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Colors } from "@/constants/theme";

type PollOpenOption = {
  id: number;
  votes_count: number;
  recipe: {
    title: string;
  };
};

type PollOpenVoter = {
  user_id: number;
  name: string;
  votes_count: number;
};

type PollOpenData = {
  id: number;
  title?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  max_votes_per_user: number;
  options: PollOpenOption[];
  voters_summary: PollOpenVoter[];
};

type MealPollOpenViewProps = {
  theme: typeof Colors.light;
  styles: any;
  poll: PollOpenData;
  draftVoteOptionIds: number[];
  saving: boolean;
  canSubmitVotes: boolean;
  isParent: boolean;
  shakeAnim: Animated.Value;
  successAnim: Animated.Value;
  formatDateTime: (value?: string | null) => string;
  onToggleDraftVote: (optionId: number) => void;
  onSubmitVotes: () => void;
  onOpenPollBuilderForEdit: () => void;
  onConfirmClosePoll: () => void;
};

export function MealPollOpenView({
  theme,
  styles,
  poll,
  draftVoteOptionIds,
  saving,
  canSubmitVotes,
  isParent,
  shakeAnim,
  successAnim,
  formatDateTime,
  onToggleDraftVote,
  onSubmitVotes,
  onOpenPollBuilderForEdit,
  onConfirmClosePoll,
}: MealPollOpenViewProps) {
  const shakeStyle = {
    transform: [{ translateX: shakeAnim }],
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{poll.title || "Sondage de la semaine"}</Text>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>Ouvert le {formatDateTime(poll.starts_at)}</Text>
      <Text style={[styles.cardText, { color: theme.textSecondary }]}>Fin prévue le {formatDateTime(poll.ends_at)}</Text>

      <Animated.View style={[styles.voteCounterBox, { borderColor: theme.icon, backgroundColor: theme.background }, shakeStyle]}>
        <Text style={[styles.voteCounterTitle, { color: theme.text }]}>Choisis tes plats préférés :</Text>
        <Text style={[styles.voteCounterValue, { color: theme.tint }]}>{draftVoteOptionIds.length} / {poll.max_votes_per_user}</Text>
      </Animated.View>

      <View style={styles.voteGrid}>
        {poll.options.map((option) => {
          const selected = draftVoteOptionIds.includes(option.id);
          const disabled = !selected && draftVoteOptionIds.length >= poll.max_votes_per_user;

          return (
            <TouchableOpacity
              key={`option-${option.id}`}
              onPress={() => onToggleDraftVote(option.id)}
              disabled={saving}
              style={[
                styles.voteCard,
                { borderColor: theme.icon, backgroundColor: theme.background },
                selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                disabled && { opacity: 0.45 },
              ]}
            >
              <Text style={{ color: theme.text, fontWeight: "700" }} numberOfLines={2}>{option.recipe?.title || "Recette"}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{option.votes_count} vote(s)</Text>

              <View style={styles.voteCardFooter}>
                <Text style={{ color: selected ? theme.tint : theme.textSecondary, fontSize: 12, fontWeight: "700" }}>
                  {selected ? "Sélectionné" : "Choisir"}
                </Text>
                <MaterialCommunityIcons
                  name={selected ? "star" : "star-outline"}
                  size={22}
                  color={selected ? theme.tint : theme.textSecondary}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={onSubmitVotes}
        disabled={!canSubmitVotes || saving}
        style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: canSubmitVotes && !saving ? 1 : 0.5 }]}
      >
        {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.primaryBtnText}>Voter !</Text>}
      </TouchableOpacity>

      <Text style={[styles.helperText, { color: theme.textSecondary, textAlign: "center" }]}>Tu dois choisir exactement {poll.max_votes_per_user} plats.</Text>

      <View style={[styles.sectionBox, { borderColor: theme.icon, backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text, fontWeight: "700", marginBottom: 8 }}>Participation</Text>
        {Array.isArray(poll.voters_summary) && poll.voters_summary.length > 0 ? (
          poll.voters_summary.map((voter) => (
            <View key={`voter-${voter.user_id}`} style={styles.voterRow}>
              <Text style={{ color: theme.text }}>{voter.name}</Text>
              <Text style={{ color: theme.textSecondary, fontWeight: "600" }}>{voter.votes_count}/{poll.max_votes_per_user}</Text>
            </View>
          ))
        ) : (
          <Text style={{ color: theme.textSecondary }}>Personne n&apos;a voté pour le moment.</Text>
        )}
      </View>

      {isParent ? (
        <>
          <TouchableOpacity
            onPress={onOpenPollBuilderForEdit}
            style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving ? 0.6 : 1 }]}
            disabled={saving}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Modifier le sondage</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onConfirmClosePoll}
            style={[styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background, opacity: saving ? 0.6 : 1 }]}
            disabled={saving}
          >
            <Text style={{ color: theme.text, fontWeight: "700" }}>Clôturer le sondage</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.successBurst,
          {
            opacity: successAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
            transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] }) }],
          },
        ]}
      >
        <Text style={styles.successBurstText}>Vote enregistré</Text>
      </Animated.View>
    </View>
  );
}

