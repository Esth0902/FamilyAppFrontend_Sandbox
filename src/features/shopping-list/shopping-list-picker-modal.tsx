import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { ShoppingListSummary } from "@/src/features/shopping-list/list-utils";

type ThemeLike = {
  card: string;
  background: string;
  text: string;
  textSecondary: string;
  icon: string;
  tint: string;
};

type ShoppingListPickerModalProps = {
  visible: boolean;
  title: string;
  confirmLabel?: string;
  theme: ThemeLike;
  saving?: boolean;
  lists: ShoppingListSummary[];
  selectedListId: number | null;
  useNewList: boolean;
  newListTitle: string;
  extraContent?: React.ReactNode;
  onClose: () => void;
  onSelectList: (listId: number) => void;
  onToggleUseNewList: (nextValue: boolean) => void;
  onChangeNewListTitle: (value: string) => void;
  onConfirm: () => void;
};

export function ShoppingListPickerModal({
  visible,
  title,
  confirmLabel = "Ajouter",
  theme,
  saving = false,
  lists,
  selectedListId,
  useNewList,
  newListTitle,
  extraContent,
  onClose,
  onSelectList,
  onToggleUseNewList,
  onChangeNewListTitle,
  onConfirm,
}: ShoppingListPickerModalProps) {
  const canConfirm = useNewList ? newListTitle.trim().length > 0 : selectedListId !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card, borderTopColor: theme.icon }]}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          >
            {lists.length > 0 ? (
              <View>
                <Text style={[styles.label, { color: theme.text }]}>Listes existantes</Text>
                <View style={{ gap: 8 }}>
                  {lists.map((list) => {
                    const selected = !useNewList && selectedListId === list.id;
                    return (
                      <TouchableOpacity
                        key={`shopping-list-option-${list.id}`}
                        onPress={() => {
                          onToggleUseNewList(false);
                          onSelectList(list.id);
                        }}
                        style={[
                          styles.optionRow,
                          { borderColor: theme.icon, backgroundColor: theme.background },
                          selected && { borderColor: theme.tint, backgroundColor: `${theme.tint}18` },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.text, fontWeight: "700" }}>{list.title}</Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            {list.status === "active" ? "Liste active" : "Liste inactive"}
                          </Text>
                        </View>
                        <MaterialCommunityIcons
                          name={selected ? "radiobox-marked" : "radiobox-blank"}
                          size={22}
                          color={selected ? theme.tint : theme.textSecondary}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => onToggleUseNewList(!useNewList)}
                style={[styles.optionRow, { borderColor: theme.icon, backgroundColor: theme.background }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: "700" }}>Créer une nouvelle liste</Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Donne un nom puis ajoute les ingrédients
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={useNewList ? "radiobox-marked" : "radiobox-blank"}
                  size={22}
                  color={useNewList ? theme.tint : theme.textSecondary}
                />
              </TouchableOpacity>

              {useNewList ? (
                <TextInput
                  style={[styles.input, { borderColor: theme.icon, backgroundColor: theme.background, color: theme.text }]}
                  value={newListTitle}
                  onChangeText={onChangeNewListTitle}
                  placeholder="Nom de la nouvelle liste"
                  placeholderTextColor={theme.textSecondary}
                />
              ) : null}
            </View>

            {extraContent ? <View style={{ marginTop: 14 }}>{extraContent}</View> : null}
          </ScrollView>

        <View style={styles.actionsRow}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.btn, styles.secondaryBtn, { borderColor: theme.icon, backgroundColor: theme.background }]}
              disabled={saving}
            >
              <Text style={[styles.btnText, { color: theme.text }]}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={[styles.btn, styles.primaryBtn, { backgroundColor: theme.tint, opacity: saving || !canConfirm ? 0.6 : 1 }]}
              disabled={saving || !canConfirm}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={[styles.btnText, { color: "white" }]}>{confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#999",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  content: {
    maxHeight: 420,
  },
  contentContainer: {
    paddingBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  optionRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtn: {
    borderWidth: 1,
  },
  primaryBtn: {},
  btnText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
