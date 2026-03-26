import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, TouchableOpacity, View } from "react-native";

import {
  eventParticipationLabel,
  formatMemberList,
  formatTimeRange,
} from "@/src/features/calendar/calendar-tab.helpers";
import type {
  CalendarEvent,
  EventParticipationStatus,
} from "@/src/features/calendar/calendar-tab.types";

type CalendarEventDayItemCardProps = {
  event: CalendarEvent;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  saving: boolean;
  onSubmitParticipation: (eventId: number, status: EventParticipationStatus, reason?: string | null) => void;
  onOpenReasonModal: (event: CalendarEvent) => void;
  onOpenEditor: (event: CalendarEvent) => void;
  onConfirmDelete: (event: CalendarEvent) => void;
};

export function CalendarEventDayItemCard({
  event,
  styles,
  colors,
  saving,
  onSubmitParticipation,
  onOpenReasonModal,
  onOpenEditor,
  onConfirmDelete,
}: CalendarEventDayItemCardProps) {
  return (
    <View style={[styles.itemCard, { borderColor: colors.icon, backgroundColor: colors.background }]}>
      <View style={styles.itemHeaderRow}>
        <Text style={[styles.itemTitle, { color: colors.text, flex: 1 }]}>{event.title}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: event.is_shared_with_other_household ? "#50BFA522" : `${colors.icon}20` },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: event.is_shared_with_other_household ? "#2E8B78" : colors.textSecondary },
            ]}
          >
            {event.is_shared_with_other_household ? "Partagé" : "Privé"}
          </Text>
        </View>
      </View>

      <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
        {formatTimeRange(event.start_at, event.end_at)}
      </Text>
      {event.description ? <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{event.description}</Text> : null}
      {event.created_by?.name ? (
        <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
          Créé par {event.created_by.name}
        </Text>
      ) : null}

      {event.permissions?.can_confirm_participation !== false ? (
        <>
          <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
            {event.my_participation
              ? `Votre réponse: ${eventParticipationLabel(event.my_participation.status)}`
              : "Votre participation n'est pas encore confirmée."}
          </Text>
          {event.my_participation?.reason ? (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              Justification: {event.my_participation.reason}
            </Text>
          ) : null}
          <View style={styles.itemActionsRow}>
            <TouchableOpacity
              style={[
                styles.inlineActionBtn,
                { borderColor: colors.icon },
                event.my_participation?.status === "participate" && {
                  borderColor: colors.tint,
                  backgroundColor: `${colors.tint}16`,
                },
              ]}
              onPress={() => onSubmitParticipation(event.id, "participate", null)}
              disabled={saving}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Je participe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.inlineActionBtn,
                { borderColor: colors.icon },
                event.my_participation?.status === "not_participate" && {
                  borderColor: colors.tint,
                  backgroundColor: `${colors.tint}16`,
                },
              ]}
              onPress={() => onOpenReasonModal(event)}
              disabled={saving}
            >
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Je ne participe pas</Text>
            </TouchableOpacity>
          </View>

          {event.participation_overview ? (
            <View style={styles.inlineSummaryBlock}>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Participe: {formatMemberList(event.participation_overview.participate)}
              </Text>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Ne participe pas: {formatMemberList(event.participation_overview.not_participate)}
              </Text>
              <Text style={[styles.itemMetaText, { color: colors.textSecondary }]}>
                Sans réponse: {formatMemberList(event.participation_overview.unanswered)}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      {event.permissions?.can_update || event.permissions?.can_delete ? (
        <View style={styles.itemActionsRow}>
          {event.permissions?.can_update ? (
            <TouchableOpacity
              style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
              onPress={() => onOpenEditor(event)}
              disabled={saving}
            >
              <MaterialCommunityIcons name="pencil-outline" size={16} color={colors.tint} />
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Modifier</Text>
            </TouchableOpacity>
          ) : null}
          {event.permissions?.can_delete ? (
            <TouchableOpacity
              style={[styles.inlineActionBtn, { borderColor: colors.icon }]}
              onPress={() => onConfirmDelete(event)}
              disabled={saving}
            >
              <MaterialCommunityIcons name="delete-outline" size={16} color="#D96C6C" />
              <Text style={[styles.inlineActionText, { color: colors.text }]}>Supprimer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
