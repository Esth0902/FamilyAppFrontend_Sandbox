import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { AppButton } from "@/src/components/ui/AppButton";
import {
    normalizeAiPreviewRecipe,
    normalizeAiSuggestion,
    type AiPreviewIngredient,
    type AiPreviewRecipe,
    type AiSuggestion,
} from "@/src/services/recipeService";
import { useRecipeForm } from "@/src/features/recipes/useRecipeForm";

type ModalMode = "choice" | "manual" | "ai" | "preview";
type AiIntent = "specific" | "ideas";

type FinalizeAiRecipePayload = {
    title: string;
    type: string;
    description: string;
    instructions: string;
    ingredients: {
        name: string;
        unit?: string | null;
        quantity: number;
        category?: string | null;
    }[];
};

type RecipeModalProps = {
    visible: boolean;
    onClose: () => void;
    householdId: number | null;
    householdDietaryTags: string[];
    isSubmitting: boolean;
    theme: typeof Colors.light;
    isDarkMode: boolean;
    upsertRecipe: (input: { payload: Record<string, unknown>; recipeId?: number }) => Promise<unknown>;
    suggestRecipes: (payload: {
        preferences: string;
        dietary_preferences?: string;
        count: number;
        intent: "specific" | "ideas";
    }) => Promise<unknown>;
    previewAiRecipe: (payload: { title: string; dietary_preferences?: string }) => Promise<unknown>;
    storeAiRecipe: (payload: FinalizeAiRecipePayload) => Promise<unknown>;
};

export function RecipeModal({
    visible,
    onClose,
    householdId,
    householdDietaryTags,
    isSubmitting,
    theme,
    isDarkMode,
    upsertRecipe,
    suggestRecipes,
    previewAiRecipe,
    storeAiRecipe,
}: RecipeModalProps) {
    const {
        form,
        setTitle,
        setDescription,
        setBaseServings,
        updateIngredient,
        addIngredient,
        removeIngredient,
        updateInstruction,
        addInstruction,
        removeInstruction,
        resetForm,
        buildPayload,
    } = useRecipeForm();

    const [modalMode, setModalMode] = useState<ModalMode>("choice");
    const [aiIntent, setAiIntent] = useState<AiIntent>("ideas");
    const [aiPrompt, setAiPrompt] = useState("");
    const [useDietaryTags, setUseDietaryTags] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
    const [previewRecipe, setPreviewRecipe] = useState<AiPreviewRecipe | null>(null);

    const resetModalState = useCallback(() => {
        setModalMode("choice");
        setAiIntent("ideas");
        setAiPrompt("");
        setUseDietaryTags(false);
        setAiSuggestions([]);
        setPreviewRecipe(null);
        resetForm();
    }, [resetForm]);

    useEffect(() => {
        if (!visible) {
            resetModalState();
        }
    }, [resetModalState, visible]);

    useEffect(() => {
        if (householdDietaryTags.length === 0 && useDietaryTags) {
            setUseDietaryTags(false);
        }
    }, [householdDietaryTags.length, useDietaryTags]);

    const dietaryPreferences = useMemo(() => {
        if (!useDietaryTags || householdDietaryTags.length === 0) {
            return "";
        }
        return `Tags alimentaires du foyer: ${householdDietaryTags.join(", ")}`;
    }, [householdDietaryTags, useDietaryTags]);

    const closeAndReset = useCallback(() => {
        resetModalState();
        onClose();
    }, [onClose, resetModalState]);

    const handleManualSubmit = useCallback(async () => {
        try {
            const payload = buildPayload({ householdId });
            await upsertRecipe({ payload });
            closeAndReset();
        } catch (error: any) {
            const message = error?.message || "Impossible d'enregistrer la recette.";
            Alert.alert("Recettes", message);
        }
    }, [buildPayload, closeAndReset, householdId, upsertRecipe]);

    const handleAiSubmit = useCallback(async () => {
        const prompt = aiPrompt.trim().slice(0, 200);
        if (prompt.length < 3) {
            return;
        }

        try {
            const response = await suggestRecipes({
                preferences: prompt,
                dietary_preferences: dietaryPreferences || undefined,
                count: 3,
                intent: aiIntent,
            }) as { type?: string; data?: unknown };

            if (response?.type === "single" && response.data) {
                const normalized = normalizeAiPreviewRecipe(response.data);
                if (!normalized) {
                    Alert.alert("Recettes", "La réponse IA est invalide.");
                    setAiSuggestions([]);
                    return;
                }
                setPreviewRecipe(normalized);
                setModalMode("preview");
                return;
            }

            if (response?.type === "list" && Array.isArray(response.data)) {
                const suggestions = response.data
                    .map((value) => normalizeAiSuggestion(value))
                    .filter((value): value is AiSuggestion => value !== null);
                setAiSuggestions(suggestions);
                return;
            }

            setAiSuggestions([]);
        } catch {
            Alert.alert("Recettes", "Impossible de trouver des idées.");
            setAiSuggestions([]);
        }
    }, [aiIntent, aiPrompt, dietaryPreferences, suggestRecipes]);

    const handlePreview = useCallback(async (title: string) => {
        try {
            const response = await previewAiRecipe({
                title,
                dietary_preferences: dietaryPreferences || undefined,
            });
            const normalized = normalizeAiPreviewRecipe(response);
            if (!normalized) {
                Alert.alert("Recettes", "La réponse IA est invalide.");
                return;
            }
            setPreviewRecipe(normalized);
            setModalMode("preview");
        } catch {
            Alert.alert("Recettes", "Impossible de charger les détails.");
        }
    }, [dietaryPreferences, previewAiRecipe]);

    const handleFinalize = useCallback(async () => {
        if (!previewRecipe) {
            return;
        }
        if (!householdId) {
            Alert.alert("Recettes", "Aucun foyer actif trouvé pour enregistrer la recette.");
            return;
        }

        try {
            await storeAiRecipe(previewRecipe);
            closeAndReset();
        } catch {
            Alert.alert("Recettes", "L'enregistrement a échoué.");
        }
    }, [closeAndReset, householdId, previewRecipe, storeAiRecipe]);

    const modalTitle = modalMode === "choice"
        ? "Ajouter une recette"
        : modalMode === "ai"
            ? aiIntent === "specific" ? "Quel plat ?" : "Vos critères"
            : modalMode === "preview"
                ? "Aperçu de la recette"
                : "Nouvelle recette";

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={closeAndReset}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.modalOverlay}
            >
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: theme.text }]}>{modalTitle}</Text>
                        <TouchableOpacity onPress={closeAndReset}>
                            <MaterialCommunityIcons name="close" size={24} color={theme.text} />
                        </TouchableOpacity>
                    </View>

                    {modalMode === "choice" ? (
                        <View style={styles.choiceContainer}>
                            <TouchableOpacity
                                style={[styles.choiceBtn, { backgroundColor: theme.tint }]}
                                onPress={() => {
                                    setAiIntent("specific");
                                    setPreviewRecipe(null);
                                    setModalMode("ai");
                                }}
                            >
                                <MaterialCommunityIcons name="chef-hat" size={28} color="white" />
                                <View>
                                    <Text style={styles.choiceBtnText}>Recette précise</Text>
                                    <Text style={styles.choiceBtnSubText}>Générer un plat que je connais</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.choiceBtn, { backgroundColor: "#2F7A8F" }]}
                                onPress={() => {
                                    setAiIntent("ideas");
                                    setPreviewRecipe(null);
                                    setModalMode("ai");
                                }}
                            >
                                <MaterialCommunityIcons name="lightbulb-on" size={28} color="white" />
                                <View>
                                    <Text style={styles.choiceBtnText}>Trouver l'inspiration</Text>
                                    <Text style={styles.choiceBtnSubText}>Suggestions selon mes goûts</Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.choiceBtn,
                                    { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.tint },
                                ]}
                                onPress={() => setModalMode("manual")}
                            >
                                <MaterialCommunityIcons name="pencil" size={28} color={theme.tint} />
                                <Text style={[styles.choiceBtnText, { color: theme.tint }]}>Saisie manuelle</Text>
                            </TouchableOpacity>
                        </View>
                    ) : null}

                    {modalMode === "ai" ? (
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {aiSuggestions.length === 0 ? (
                                <View>
                                    <Text style={[styles.sectionText, { color: theme.text }]}>
                                        {aiIntent === "specific"
                                            ? "Entrez le nom du plat que vous souhaitez cuisiner :"
                                            : "Décrivez vos envies (ingrédients, régime, temps...) :"}
                                    </Text>

                                    <View
                                        style={[
                                            styles.dietaryToggleRow,
                                            {
                                                borderColor: `${theme.icon}66`,
                                                backgroundColor: isDarkMode ? "#1E1E1E" : "#F4F6F8",
                                            },
                                        ]}
                                    >
                                        <View style={{ flex: 1, gap: 3 }}>
                                            <Text style={[styles.toggleTitle, { color: theme.text }]}>
                                                Utiliser les tags alimentaires
                                            </Text>
                                            <Text style={[styles.toggleDescription, { color: theme.icon }]}>
                                                {householdDietaryTags.length > 0
                                                    ? `${householdDietaryTags.length} tag(s) seront envoyés à l'IA.`
                                                    : "Aucun tag alimentaire configuré pour ce foyer."}
                                            </Text>
                                        </View>
                                        <Switch
                                            value={useDietaryTags && householdDietaryTags.length > 0}
                                            onValueChange={setUseDietaryTags}
                                            disabled={householdDietaryTags.length === 0 || isSubmitting}
                                            trackColor={{ false: "#9CA3AF", true: theme.tint }}
                                            thumbColor={useDietaryTags ? "#FFFFFF" : "#F3F4F6"}
                                        />
                                    </View>

                                    <TextInput
                                        style={[
                                            styles.input,
                                            { minHeight: 84, color: theme.text, textAlignVertical: "top", borderColor: theme.icon },
                                        ]}
                                        placeholder={aiIntent === "specific"
                                            ? "Ex: Lasagnes à la bolognaise, Tarte au citron..."
                                            : "Ex: Plat végétarien rapide avec courgettes..."}
                                        placeholderTextColor={theme.icon}
                                        value={aiPrompt}
                                        onChangeText={setAiPrompt}
                                        multiline
                                    />

                                    <AppButton
                                        variant="primary"
                                        loading={isSubmitting}
                                        disabled={isSubmitting}
                                        onPress={() => void handleAiSubmit()}
                                        style={[styles.submitBtn, { backgroundColor: theme.tint, borderColor: theme.tint }]}
                                        title={aiIntent === "specific" ? "Générer la recette" : "Proposer des idées"}
                                    />
                                </View>
                            ) : (
                                <View>
                                    <Text style={[styles.sectionText, { color: theme.icon }]}>
                                        {aiIntent === "specific" ? "Voici ce que j’ai trouvé :" : "Voici quelques idées :"}
                                    </Text>

                                    {aiSuggestions.map((suggestion) => (
                                        <TouchableOpacity
                                            key={suggestion.title}
                                            style={[
                                                styles.suggestionItem,
                                                { borderColor: theme.icon, opacity: isSubmitting ? 0.5 : 1 },
                                            ]}
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                if (!isSubmitting) {
                                                    void handlePreview(suggestion.title);
                                                }
                                            }}
                                        >
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontWeight: "700", color: theme.text }}>{suggestion.title}</Text>
                                                <Text style={{ fontSize: 12, color: theme.icon }} numberOfLines={1}>
                                                    {suggestion.description}
                                                </Text>
                                            </View>
                                            <MaterialCommunityIcons
                                                name="eye-outline"
                                                size={20}
                                                color={isSubmitting ? theme.icon : theme.tint}
                                            />
                                        </TouchableOpacity>
                                    ))}

                                    <TouchableOpacity onPress={() => setAiSuggestions([])} style={{ marginTop: 12 }}>
                                        <Text style={{ color: theme.tint, textAlign: "center", fontWeight: "700" }}>
                                            Nouvelle recherche
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </ScrollView>
                    ) : null}

                    {modalMode === "preview" && previewRecipe ? (
                        <View style={{ maxHeight: 470 }}>
                            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                <Text style={[styles.previewTitle, { color: theme.text }]}>{previewRecipe.title}</Text>
                                <Text style={{ color: theme.icon, marginBottom: 15 }}>{previewRecipe.description}</Text>

                                <Text style={[styles.label, { color: theme.tint }]}>INGRÉDIENTS</Text>
                                {previewRecipe.ingredients.map((ingredient: AiPreviewIngredient, index: number) => (
                                    <Text key={`${ingredient.name}-${index}`} style={{ color: theme.text, marginBottom: 3 }}>
                                        - {ingredient.quantity > 0 ? `${ingredient.quantity} ` : ""}{ingredient.unit} {ingredient.name}
                                    </Text>
                                ))}

                                <Text style={[styles.label, { color: theme.tint, marginTop: 15 }]}>INSTRUCTIONS</Text>
                                <Text style={{ color: theme.text, lineHeight: 20 }}>{previewRecipe.instructions}</Text>
                            </ScrollView>

                            <View style={styles.previewActionsRow}>
                                <AppButton
                                    variant="primary"
                                    loading={isSubmitting}
                                    disabled={isSubmitting}
                                    onPress={() => void handleFinalize()}
                                    style={[styles.submitBtn, styles.previewPrimaryBtn]}
                                    title="Enregistrer la recette"
                                />
                                <AppButton
                                    variant="secondary"
                                    disabled={isSubmitting}
                                    onPress={() => {
                                        setPreviewRecipe(null);
                                        setModalMode("ai");
                                    }}
                                    style={[styles.submitBtn, styles.previewSecondaryBtn]}
                                    title="Retour"
                                />
                            </View>
                        </View>
                    ) : null}

                    {modalMode === "manual" ? (
                        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <Text style={[styles.fieldLabel, { color: theme.text }]}>Titre</Text>
                            <TextInput
                                style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                                placeholder="Titre de la recette"
                                placeholderTextColor={theme.icon}
                                value={form.title}
                                onChangeText={setTitle}
                            />

                            <Text style={[styles.fieldLabel, { color: theme.text }]}>Description</Text>
                            <TextInput
                                style={[styles.input, { color: theme.text, minHeight: 60, borderColor: theme.icon }]}
                                placeholder="Description courte (optionnel)"
                                placeholderTextColor={theme.icon}
                                value={form.description}
                                onChangeText={setDescription}
                                multiline
                            />

                            <Text style={[styles.fieldLabel, { color: theme.text }]}>Portions de base</Text>
                            <TextInput
                                style={[styles.input, { color: theme.text, borderColor: theme.icon }]}
                                placeholder="Portions de base (1-30)"
                                placeholderTextColor={theme.icon}
                                keyboardType="number-pad"
                                value={form.baseServings}
                                onChangeText={setBaseServings}
                            />

                            <Text style={[styles.label, { color: theme.text }]}>Ingrédients</Text>
                            {form.ingredients.map((ingredient, index) => (
                                <View key={`ingredient-${index}`} style={styles.formRow}>
                                    <TextInput
                                        style={[styles.input, styles.inlineInputWide, { color: theme.text, borderColor: theme.icon }]}
                                        placeholder="Nom"
                                        placeholderTextColor={theme.icon}
                                        value={ingredient.name}
                                        onChangeText={(value) => updateIngredient(index, { name: value })}
                                    />
                                    <TextInput
                                        style={[styles.input, styles.inlineInput, { color: theme.text, borderColor: theme.icon }]}
                                        placeholder="Qté"
                                        placeholderTextColor={theme.icon}
                                        keyboardType="numeric"
                                        value={ingredient.quantity}
                                        onChangeText={(value) => updateIngredient(index, { quantity: value })}
                                    />
                                    <TextInput
                                        style={[styles.input, styles.inlineInput, { color: theme.text, borderColor: theme.icon }]}
                                        placeholder="Unité"
                                        placeholderTextColor={theme.icon}
                                        value={ingredient.unit}
                                        onChangeText={(value) => updateIngredient(index, { unit: value })}
                                    />
                                    {form.ingredients.length > 1 ? (
                                        <TouchableOpacity onPress={() => removeIngredient(index)} style={styles.removeBtn}>
                                            <MaterialCommunityIcons name="minus-circle-outline" size={22} color={theme.accentWarm} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}

                            <TouchableOpacity onPress={addIngredient} style={styles.addLineBtn}>
                                <Text style={{ color: theme.tint, fontWeight: "700" }}>+ Ajouter un ingrédient</Text>
                            </TouchableOpacity>

                            <Text style={[styles.label, { color: theme.text, marginTop: 10 }]}>Instructions</Text>
                            {form.instructions.map((step, index) => (
                                <View key={`instruction-${index}`} style={styles.instructionRow}>
                                    <View style={[styles.stepBadge, { backgroundColor: theme.tint }]}>
                                        <Text style={styles.stepBadgeText}>{index + 1}</Text>
                                    </View>

                                    <TextInput
                                        style={[styles.input, styles.instructionInput, { color: theme.text, borderColor: theme.icon }]}
                                        placeholder={`Étape ${index + 1}`}
                                        placeholderTextColor={theme.icon}
                                        value={step}
                                        onChangeText={(value) => updateInstruction(index, value)}
                                        multiline
                                    />

                                    {form.instructions.length > 1 ? (
                                        <TouchableOpacity onPress={() => removeInstruction(index)} style={styles.removeBtn}>
                                            <MaterialCommunityIcons name="trash-can-outline" size={22} color={theme.accentWarm} />
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}

                            <TouchableOpacity onPress={addInstruction} style={styles.addLineBtn}>
                                <Text style={{ color: theme.tint, fontWeight: "700" }}>+ Ajouter une étape</Text>
                            </TouchableOpacity>

                            <AppButton
                                variant="primary"
                                loading={isSubmitting}
                                disabled={isSubmitting}
                                onPress={() => void handleManualSubmit()}
                                style={[styles.submitBtn, { marginTop: 10 }]}
                                title="Enregistrer la recette"
                            />
                        </ScrollView>
                    ) : null}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "flex-end",
    },
    modalContent: {
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        padding: 20,
        maxHeight: "90%",
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
    },
    choiceContainer: {
        gap: 14,
        paddingBottom: 18,
    },
    choiceBtn: {
        flexDirection: "row",
        alignItems: "center",
        padding: 18,
        borderRadius: 14,
        gap: 12,
    },
    choiceBtnText: {
        color: "white",
        fontSize: 17,
        fontWeight: "700",
    },
    choiceBtnSubText: {
        color: "rgba(255,255,255,0.85)",
        fontSize: 12,
    },
    sectionText: {
        marginBottom: 10,
        fontWeight: "500",
    },
    dietaryToggleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 12,
    },
    toggleTitle: {
        fontWeight: "700",
        fontSize: 13,
    },
    toggleDescription: {
        fontSize: 12,
    },
    suggestionItem: {
        flexDirection: "row",
        alignItems: "center",
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 10,
    },
    previewTitle: {
        fontSize: 22,
        fontWeight: "700",
        marginBottom: 5,
    },
    previewActionsRow: {
        flexDirection: "row",
        gap: 10,
        marginTop: 20,
    },
    previewPrimaryBtn: {
        flex: 2,
    },
    previewSecondaryBtn: {
        flex: 1,
    },
    input: {
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        marginBottom: 12,
        fontSize: 16,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: "700",
        marginBottom: 4,
    },
    label: {
        fontSize: 14,
        fontWeight: "700",
        marginBottom: 8,
    },
    formRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
    },
    inlineInputWide: {
        flex: 2,
        marginBottom: 0,
    },
    inlineInput: {
        flex: 1,
        marginBottom: 0,
    },
    removeBtn: {
        padding: 4,
    },
    addLineBtn: {
        marginTop: 6,
        marginBottom: 10,
    },
    instructionRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        marginBottom: 10,
    },
    stepBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 10,
    },
    stepBadgeText: {
        color: "white",
        fontWeight: "700",
        fontSize: 12,
    },
    instructionInput: {
        flex: 1,
        minHeight: 50,
        marginBottom: 0,
    },
    submitBtn: {
        height: 52,
        borderRadius: 14,
    },
});
