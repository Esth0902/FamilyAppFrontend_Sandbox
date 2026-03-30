import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, Alert, Modal
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ScreenHeader } from '@/src/components/ui/ScreenHeader';
import { apiFetch } from '@/src/api/client';
import { getStoredUser } from '@/src/session/user-cache';
import { useKeepAwake } from 'expo-keep-awake';

interface Ingredient {
    id: number;
    name: string;
    base_quantity?: number;
    scaled_quantity?: number;
    pivot: {
        quantity: number;
        unit?: string | null;
    };
}

interface Recipe {
    id: number;
    title: string;
    type: string;
    description: string | null;
    instructions: string | null;
    ingredients: Ingredient[];
    base_servings?: number;
    display_servings?: number;
    is_global?: boolean;
    is_owned_by_household?: boolean;
}

export default function RecipeDetailScreen() {
    useKeepAwake();
    const { id, autoEdit } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? 'light'];

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);
    const [displayServings, setDisplayServings] = useState(1);
    const [canManageRecipe, setCanManageRecipe] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    type IngredientForm = { id?: number; name: string; quantity: string; unit: string; category: string };
    const [editForm, setEditForm] = useState<{
        title: string;
        type: string;
        description: string;
        base_servings: string;
        instructions: string[];
        ingredients: IngredientForm[];
    } | null>(null);

    const RECIPE_TYPES = [
        'petit-déjeuner',
        'entrée',
        'plat principal',
        'dessert',
        'collation',
        'boisson',
        'autre',
    ] as const;

    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const parseServingsValue = (value: string) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
            return null;
        }
        return parsed;
    };

    function splitInstructions(instructions: string | null): string[] {
        if (!instructions) return [];

        let text = instructions.replace(/[\r\n]+/g, " ").trim();

        text = text.replace(/(?:^|\s)(?:Étape|Etape)\s*\d+\s*:/gi, "|||");

        text = text.replace(/(?:^|\s)(\d{1,2})\s*[\.\)\-:]\s+/g, "|||");

        const steps = text
            .split("|||")
            .map(s => s.trim())
            .filter(s => s.length > 0);

        return steps.length > 0 ? steps : [instructions.trim()];
    }
    const fetchRecipeDetails = useCallback(async () => {
        try {
            const user = await getStoredUser();
            const role = user?.households?.[0]?.pivot?.role ?? user?.role;

            const data = await apiFetch(`/recipes/${id}`);
            setRecipe(data);
            setDisplayServings(Number(data.display_servings ?? data.base_servings ?? 1));

            const canManage = role === 'parent' && data?.is_owned_by_household !== false;
            setCanManageRecipe(canManage);

            let parsedInstructions = splitInstructions(data.instructions);

            setEditForm({
                title: data.title ?? '',
                type: data.type ?? 'plat principal',
                description: data.description ?? '',
                base_servings: String(data.base_servings ?? 1),
                instructions: parsedInstructions.length > 0 ? parsedInstructions : [""],
                ingredients: (data.ingredients ?? []).map((ing: any) => ({
                    id: ing.id,
                    name: ing.name ?? '',
                    quantity: String(ing.pivot?.quantity ?? 0),
                    unit: String(ing.pivot?.unit ?? 'unité'),
                    category: String(ing.category ?? 'autre'),
                })),
            });

            if (autoEdit === 'true' && canManage) {
                setIsEditing(true);
            } else if (!canManage) {
                setIsEditing(false);
            }
        } catch (error: any) {
            console.error("Erreur:", error.message);
        } finally {
            setLoading(false);
        }
    }, [id, autoEdit]);

    useEffect(() => {
        if (id) {
            void fetchRecipeDetails();
        }
    }, [id, fetchRecipeDetails]);

    const formatIngredient = (ing: Ingredient) => {
        const name = ing.name.charAt(0).toUpperCase() + ing.name.slice(1);
        const baseServings = Math.max(1, Number(recipe?.base_servings ?? 1));
        const safeDisplayServings = Math.max(1, displayServings);
        const scaleFactor = safeDisplayServings / baseServings;

        const baseQuantity = Number(ing.base_quantity ?? ing.pivot?.quantity ?? 0);
        const quantity = Math.round(baseQuantity * scaleFactor * 100) / 100;
        const unit = String(ing.pivot?.unit ?? '').trim();

        if (quantity === 0 || unit.toLowerCase().includes('goût')) {
            return `${name} - au goût`;
        }

        if (!unit) {
            return `${name} - ${quantity}`;
        }

        return `${name} - ${quantity} ${unit}`;
    };

    const renderInstructions = (instructions: string | null) => {
        const steps = splitInstructions(instructions);

        if (steps.length === 0) {
            return <Text style={{ color: themeColors.text }}>Aucune instruction.</Text>;
        }

        return steps.map((step, index) => (
            <View key={index} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: themeColors.tint }]}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepText, { color: themeColors.text }]}>
                    {step}
                </Text>
            </View>
        ));
    };

    const decreaseDisplayServings = () => {
        setDisplayServings((prev) => Math.max(1, prev - 1));
    };

    const increaseDisplayServings = () => {
        setDisplayServings((prev) => Math.min(30, prev + 1));
    };



    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: themeColors.background }]}>
                <ActivityIndicator size="large" color={themeColors.tint} />
            </View>
        );
    }

    if (!recipe) return null;
    const addIngredientRow = () => {
        if (!editForm) return;
        setEditForm({ ...editForm, ingredients: [...editForm.ingredients, { name: '', quantity: '', unit: '', category:'autre' }] });
    };

    const removeIngredientRow = (index: number) => {
        if (!editForm) return;
        const newIngs = [...editForm.ingredients];
        newIngs.splice(index, 1);
        setEditForm({ ...editForm, ingredients: newIngs });
    };

    const addInstructionStep = () => {
        if (!editForm) return;
        setEditForm({ ...editForm, instructions: [...editForm.instructions, ""] });
    };

    const removeInstructionStep = (index: number) => {
        if (!editForm) return;
        const newSteps = [...editForm.instructions];
        newSteps.splice(index, 1);
        setEditForm({ ...editForm, instructions: newSteps });
    };

    const updateInstructionStep = (text: string, index: number) => {
        if (!editForm) return;
        const newSteps = [...editForm.instructions];
        newSteps[index] = text;
        setEditForm({ ...editForm, instructions: newSteps });
    };

    const saveRecipe = async () => {
        if (!recipe || !editForm) return;
        if (!canManageRecipe) return;
        const parsedBaseServings = parseServingsValue(editForm.base_servings);
        if (!parsedBaseServings) {
            return Alert.alert("Erreur", "Le nombre de portions doit être entre 1 et 30.");
        }

        const formattedInstructions = editForm.instructions
            .map((step: string) => step.trim())
            .filter((step: string) => step.length > 0)
            .map((step: string, i: number) => `Étape ${i + 1} : ${step}`)
            .join("\n\n");

        const payload = {
            title: editForm.title.trim(),
            type: editForm.type || 'plat principal',
            description: editForm.description?.trim() || null,
            base_servings: parsedBaseServings,
            instructions: formattedInstructions,
            ingredients: editForm.ingredients.map(i => ({
                name: i.name.trim(),
                unit: i.unit.trim() || 'unité',
                quantity: Number(i.quantity) || 0,
            })),
        };

        try {
            setLoading(true);
            const updated = await apiFetch(`/recipes/${recipe.id}`, {
                method: "PUT",
                body: JSON.stringify(payload),
            });

            setRecipe(updated);
            setEditForm({
                title: updated.title ?? '',
                type: updated.type ?? 'plat principal',
                description: updated.description ?? '',
                base_servings: String(updated.base_servings ?? parsedBaseServings),
                instructions: splitInstructions(updated.instructions),
                ingredients: (updated.ingredients ?? []).map((ing: any) => ({
                    id: ing.id,
                    name: ing.name ?? '',
                    quantity: String(ing.pivot?.quantity ?? 0),
                    unit: String(ing.pivot?.unit ?? 'unité'),
                    category: String(ing.category ?? 'autre'),
                })),
            });
            setDisplayServings(parsedBaseServings);

            setIsEditing(false);
            Alert.alert("Succès", "Recette modifiée !");
        } catch {
            Alert.alert("Erreur", "Impossible de modifier la recette.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title={recipe.title}
                withBackButton
                backHref="/meal/recipes"
                safeTop
                showBorder
                rightSlot={
                    canManageRecipe ? (
                        <TouchableOpacity
                            onPress={() => {
                                if (!editForm) return;
                                setIsEditing((prev) => !prev);
                            }}
                            style={{ padding: 6 }}
                        >
                            <MaterialCommunityIcons name={isEditing ? "close" : "pencil"} size={22} color={themeColors.text} />
                        </TouchableOpacity>
                    ) : null
                }
            />

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                {/* Section Description */}
                <View style={styles.section}>
                    {isEditing && editForm ? (
                        <View>
                        <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Titre</Text>
                        <TextInput
                            style={[styles.input, { color: themeColors.text, borderColor: themeColors.icon, marginBottom: 15 }]}
                            placeholder="Titre de la recette"
                            placeholderTextColor={themeColors.icon}
                            value={editForm.title}
                            onChangeText={(t) => setEditForm({ ...editForm, title: t })}
                        />

                            <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Type</Text>
                            <TouchableOpacity
                                onPress={() => setTypePickerOpen(true)}
                                style={[
                                    styles.input,
                                    {
                                        borderColor: themeColors.icon,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        marginBottom: 15,
                                    },
                                ]}
                            >
                                <Text style={{ color: themeColors.text }}>
                                    {editForm.type || 'plat principal'}
                                </Text>
                                <MaterialCommunityIcons name="chevron-down" size={20} color={themeColors.icon} />
                            </TouchableOpacity>

                        <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Description</Text>
                        <TextInput
                            style={[styles.input, { color: themeColors.text, borderColor: themeColors.icon }]}
                            placeholder="Description"
                            placeholderTextColor={themeColors.icon}
                            value={editForm.description}
                            onChangeText={(t) => setEditForm({ ...editForm, description: t })}
                            multiline
                        />

                        <Text style={[styles.fieldLabel, { color: themeColors.text }]}>Portions de base</Text>
                        <TextInput
                            style={[styles.input, { color: themeColors.text, borderColor: themeColors.icon }]}
                            placeholder="Portions de base (1-30)"
                            placeholderTextColor={themeColors.icon}
                            keyboardType="number-pad"
                            value={editForm.base_servings}
                            onChangeText={(t) => setEditForm({ ...editForm, base_servings: t.replace(/[^0-9]/g, '') })}
                        />
                        </View>
                    ) : (
                        <Text style={[styles.text, { color: themeColors.text }]}>
                            {recipe.description || "Aucune description disponible."}
                        </Text>
                    )}
                </View>

                {/* Section Ingrédients */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: themeColors.tint }]}>Ingrédients</Text>
                    {!isEditing && (
                        <View style={styles.servingsRow}>
                            <Text style={[styles.servingsLabel, { color: themeColors.text }]}>Portions</Text>
                            <View style={styles.servingsControls}>
                                <TouchableOpacity
                                    onPress={decreaseDisplayServings}
                                    style={[styles.servingButton, { borderColor: themeColors.icon }]}
                                >
                                    <MaterialCommunityIcons name="minus" size={18} color={themeColors.text} />
                                </TouchableOpacity>
                                <TextInput
                                    style={[styles.servingsInput, { color: themeColors.text, borderColor: themeColors.icon }]}
                                    keyboardType="number-pad"
                                    value={String(displayServings)}
                                    onChangeText={(value) => {
                                        const parsed = parseServingsValue(value);
                                        if (parsed) {
                                            setDisplayServings(parsed);
                                        }
                                    }}
                                />
                                <TouchableOpacity
                                    onPress={increaseDisplayServings}
                                    style={[styles.servingButton, { borderColor: themeColors.icon }]}
                                >
                                    <MaterialCommunityIcons name="plus" size={18} color={themeColors.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    <View style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#F9F9F9' }]}>
                        {isEditing && editForm ? (
                            <View>
                                <View style={styles.ingHeaderRow}>
                                    <Text style={[styles.ingHeaderCell, { flex: 2, color: themeColors.icon }]}>Nom</Text>
                                    <Text style={[styles.ingHeaderCell, { flex: 0.8, color: themeColors.icon }]}>Qte</Text>
                                    <Text style={[styles.ingHeaderCell, { flex: 0.8, color: themeColors.icon }]}>Unite</Text>
                                    <View style={{ width: 28 }} />
                                </View>
                                {editForm.ingredients.map((ing, idx) => (
                                    <View key={idx} style={styles.ingEditRow}>
                                        <TextInput
                                            style={[styles.ingInput, { flex: 2, color: themeColors.text, borderColor: themeColors.icon }]}
                                            value={ing.name}
                                            placeholder="Nom"
                                            placeholderTextColor={themeColors.icon}
                                            onChangeText={(t) => {
                                                const copy = [...editForm.ingredients];
                                                copy[idx].name = t;
                                                setEditForm({ ...editForm, ingredients: copy });
                                            }}
                                        />
                                        <TextInput
                                            style={[styles.ingInput, { flex: 0.8, color: themeColors.text, borderColor: themeColors.icon }]}
                                            value={ing.quantity}
                                            placeholder="Qté"
                                            keyboardType="numeric"
                                            placeholderTextColor={themeColors.icon}
                                            onChangeText={(t) => {
                                                const copy = [...editForm.ingredients];
                                                copy[idx].quantity = t;
                                                setEditForm({ ...editForm, ingredients: copy });
                                            }}
                                        />
                                        <TextInput
                                            style={[styles.ingInput, { flex: 0.8, color: themeColors.text, borderColor: themeColors.icon }]}
                                            value={ing.unit}
                                            placeholder="Unité"
                                            placeholderTextColor={themeColors.icon}
                                            onChangeText={(t) => {
                                                const copy = [...editForm.ingredients];
                                                copy[idx].unit = t;
                                                setEditForm({ ...editForm, ingredients: copy });
                                            }}
                                        />
                                        {/* BOUTON POUBELLE */}
                                        <TouchableOpacity onPress={() => removeIngredientRow(idx)} style={{justifyContent:'center', paddingLeft: 5}}>
                                            <MaterialCommunityIcons name="trash-can-outline" size={24} color="#FF4444" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {/* BOUTON AJOUTER */}
                                <TouchableOpacity onPress={addIngredientRow} style={{flexDirection:'row', alignItems:'center', marginTop: 10}}>
                                    <MaterialCommunityIcons name="plus-circle" size={20} color={themeColors.tint} />
                                    <Text style={{color: themeColors.tint, fontWeight: 'bold', marginLeft: 5}}>Ajouter un ingrédient</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            recipe.ingredients.map((ing) => (
                                <View key={ing.id} style={styles.ingredientRow}>
                                    <MaterialCommunityIcons
                                        name="checkbox-blank-circle"
                                        size={8}
                                        color={themeColors.tint}
                                        style={{ marginRight: 10 }}
                                    />
                                    <Text style={[styles.ingredientText, { color: themeColors.text }]}>
                                        {formatIngredient(ing)}
                                    </Text>
                                </View>
                            ))
                        )}
                    </View>
                </View>

                {/* Section Instructions */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: themeColors.tint }]}>Instructions</Text>

                    {isEditing && editForm && Array.isArray(editForm.instructions) ? (
                        <View>
                            {editForm.instructions.map((step, idx) => (
                                <View key={idx} style={{marginBottom: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 10}}>
                                    <View style={[styles.stepNumber, { backgroundColor: themeColors.tint, marginTop: 8 }]}>
                                        <Text style={styles.stepNumberText}>{idx + 1}</Text>
                                    </View>

                                    <TextInput
                                        style={[styles.input, { flex: 1, color: themeColors.text, borderColor: themeColors.icon, minHeight: 60 }]}
                                        placeholder={`Décrivez l'étape ${idx + 1}...`}
                                        placeholderTextColor={themeColors.icon}
                                        value={step}
                                        onChangeText={(t) => updateInstructionStep(t, idx)}
                                        multiline
                                    />

                                    {editForm.instructions.length > 1 && (
                                        <TouchableOpacity onPress={() => removeInstructionStep(idx)} style={{marginTop: 15}}>
                                            <MaterialCommunityIcons name="trash-can-outline" size={24} color="#FF4444" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}

                            <TouchableOpacity onPress={addInstructionStep} style={{flexDirection:'row', alignItems:'center', marginTop: 5, marginBottom: 20}}>
                                <MaterialCommunityIcons name="plus-circle" size={20} color={themeColors.tint} />
                                <Text style={{color: themeColors.tint, fontWeight: 'bold', marginLeft: 5}}>Ajouter une étape</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={styles.instructionsContainer}>
                            {renderInstructions(recipe.instructions)}
                        </View>
                    )}
                </View>
                {isEditing && (
                    <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: themeColors.tint }]}
                            onPress={saveRecipe}
                        >
                            <Text style={{ color: "white", fontWeight: "bold" }}>Enregistrer</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
            <Modal
                visible={typePickerOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setTypePickerOpen(false)}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => setTypePickerOpen(false)}
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
                >
                    <View style={{ backgroundColor: themeColors.card, padding: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                        <Text style={{ color: themeColors.text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>
                            Type de recette
                        </Text>

                        {RECIPE_TYPES.map((t) => (
                            <TouchableOpacity
                                key={t}
                                onPress={() => {
                                    if (!editForm) return;
                                    setEditForm({ ...editForm, type: t });
                                    setTypePickerOpen(false);
                                }}
                                style={{
                                    paddingVertical: 12,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    borderTopWidth: 1,
                                    borderTopColor: themeColors.icon,
                                }}
                            >
                                <Text style={{ color: themeColors.text }}>{t}</Text>
                                {editForm?.type === t && (
                                    <MaterialCommunityIcons name="check" size={20} color={themeColors.tint} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    section: { padding: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    text: { fontSize: 15, lineHeight: 22 },
    card: { padding: 15, borderRadius: 15 },
    ingredientRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    ingredientText: { fontSize: 15, marginLeft: 5 },
    instructionsText: { fontSize: 15, lineHeight: 24 },
    instructionsContainer: {
        marginTop: 5,
    },
    stepRow: {
        flexDirection: 'row',
        marginBottom: 20,
        alignItems: 'flex-start',
    },
    stepNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        marginTop: 2,
    },
    stepNumberText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    stepText: {
        flex: 1,
        fontSize: 16,
        lineHeight: 24,
    },

    input: {
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        marginTop: 8,
        fontSize: 15,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: "700",
        marginTop: 2,
        marginBottom: 2,
        letterSpacing: 0.3,
    },

    ingEditRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 10,
    },
    ingHeaderRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 8,
        paddingHorizontal: 2,
    },
    ingHeaderCell: {
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
    },

    ingInput: {
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        fontSize: 14,
    },

    servingsRow: {
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
    },
    servingsLabel: {
        fontSize: 14,
        fontWeight: "600",
    },
    servingsControls: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    servingButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    servingsInput: {
        width: 62,
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 6,
        paddingHorizontal: 10,
        textAlign: "center",
        fontSize: 15,
        fontWeight: "600",
    },

    saveBtn: {
        height: 52,
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
    },
});

