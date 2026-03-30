import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { AppCard } from "@/src/components/ui/AppCard";
import { ScreenHeader } from "@/src/components/ui/ScreenHeader";
import type {
  DashboardCardItem,
  DashboardTheme,
} from "@/src/features/dashboard/components/dashboard.types";

type DashboardCardsViewProps = {
  theme: DashboardTheme;
  cards: DashboardCardItem[];
  onBackPress: () => void;
  onOpenCard: (card: DashboardCardItem) => void;
};

export function DashboardCardsView({
  theme,
  cards,
  onBackPress,
  onOpenCard,
}: DashboardCardsViewProps) {
  const cardThemeStyle = useMemo(
    () => ({ backgroundColor: theme.card, borderColor: theme.icon }),
    [theme.card, theme.icon]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScreenHeader
        title="Dashboard"
        subtitle="Clique pour voir le détail"
        withBackButton
        onBackPress={onBackPress}
        safeTop
        showBorder
      />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {cards.map((card) => (
          <AppCard
            key={card.id}
            style={[styles.card, cardThemeStyle]}
            accentColor={card.accentColor}
            onPress={() => onOpenCard(card)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconContainer, { backgroundColor: card.iconBackgroundColor }]}>
              <MaterialCommunityIcons name={card.icon} size={24} color={card.accentColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>{card.title}</Text>
              <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                {card.description}
              </Text>
              {card.extraDescription ? (
                <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
                  {card.extraDescription}
                </Text>
              ) : null}
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.textSecondary} />
          </AppCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  card: {
    minHeight: 86,
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
});
