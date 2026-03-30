import React from "react";
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type CalendarReasonModalProps = {
  visible: boolean;
  onClose: () => void;
  saving: boolean;
  styles: Record<string, any>;
  colors: {
    icon: string;
    background: string;
    card: string;
    text: string;
    textSecondary: string;
    tint: string;
  };
  reasonContext: "meal" | "event" | null;
  reasonInput: string;
  onChangeReasonInput: (value: string) => void;
  onConfirm: () => void;
};

export function CalendarReasonModal({
  visible,
  onClose,
  saving,
  styles,
  colors,
  reasonContext,
  reasonInput,
  onChangeReasonInput,
  onConfirm,
}: CalendarReasonModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>
              Justification optionnelle
            </Text>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <MaterialCommunityIcons name="close" size={22} color={colors.tint} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.bodyText, { color: colors.textSecondary, marginBottom: 8 }]}>
            {reasonContext === "meal"
              ? "Ajoutez un motif si vous ne participez pas au repas à la maison."
              : "Ajoutez un motif si vous ne participez pas à l'événement."}
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.inputMultiline,
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.icon },
            ]}
            value={reasonInput}
            onChangeText={onChangeReasonInput}
            placeholder="Ex: activité extérieure, retour tardif..."
            placeholderTextColor={colors.textSecondary}
            multiline
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.secondaryBtn, { borderColor: colors.icon, backgroundColor: colors.background }]}
              disabled={saving}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={[styles.primaryBtn, styles.modalPrimaryBtn, { backgroundColor: colors.tint, opacity: saving ? 0.7 : 1 }]}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.primaryBtnText}>Confirmer</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
