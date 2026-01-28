import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, Alert
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiFetch } from '@/src/api/client';

interface Ingredient {
    id: number;
    name: string;
    pivot: {
        quantity: number;
        unit?: string | null;
    };
}

interface Recipe {
    id: number;
    title: string;
    description: string | null;
    instructions: string | null;
    ingredients: Ingredient[];
}

export default function RecipeDetailScreen() {
    const { id, autoEdit } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? 'light'];

    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [loading, setLoading] = useState(true);

    const [isEditing, setIsEditing] = useState(false);
    type IngredientForm = { id?: number; name: string; quantity: string; unit: string };
    const [editForm, setEditForm] = useState<{
        title: string;
        description: string;
        instructions: string;
        ingredients: IngredientForm[];
    } | null>(null);

    useEffect(() => {
        if (id) fetchRecipeDetails();
    }, [id]);

    const formatIngredient = (ing: Ingredient) => {
        const name = ing.name.charAt(0).toUpperCase() + ing.name.slice(1);

        const quantity = Number(ing.pivot?.quantity ?? 0);
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
        if (!instructions) return <Text style={{color: themeColors.text}}>Aucune instruction.</Text>;

        let text = instructions.replace(/[\r\n]+/g, ' ');
        text = text.replace(/(?:Étape|Etape)\s*\d+\s*:/gi, '|||');
        const steps = text
            .split('|||')
            .map(step => step.trim())
            .filter(step => step.length > 0);

        if (steps.length === 0 && instructions.trim().length > 0) {
            steps.push(instructions);
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

    const fetchRecipeDetails = async () => {
        try {
            const data = await apiFetch(`/recipes/${id}`);
            setRecipe(data);

            let parsedInstructions: string[] = [""];

            if (data.instructions) {
                let text = data.instructions.replace(/[\r\n]+/g, ' ');
                text = text.replace(/(?:Étape|Etape)\s*\d+\s*:/gi, '|||');
                parsedInstructions = text
                    .split('|||')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
            }

            if (parsedInstructions.length === 0) {
                parsedInstructions = [data.instructions || ""];
            }

            setEditForm({
                title: data.title ?? '',
                description: data.description ?? '',
                instructions: parsedInstructions.length > 0 ? parsedInstructions : [""], // On force le type tableau
                ingredients: (data.ingredients ?? []).map((ing: any) => ({
                    id: ing.id,
                    name: ing.name ?? '',
                    quantity: String(ing.pivot?.quantity ?? 0),
                    unit: String(ing.pivot?.unit ?? 'unité'),
                })),
            });

            if (autoEdit === 'true') {
                setIsEditing(true);
            }
        } catch (error: any) {
            console.error("Erreur:", error.message);
        } finally {
            setLoading(false);
        }
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
        setEditForm({ ...editForm, ingredients: [...editForm.ingredients, { name: '', quantity: '', unit: '' }] });
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
        const instructionsArray = Array.isArray(editForm.instructions) ? editForm.instructions : [editForm.instructions];
        const formattedInstructions = instructionsArray
            .map((step: string) => step.trim())
            .filter((step: string) => step.length > 0)
            .map((step: string, i: number) => `Étape ${i + 1} : ${step}`)
            .join("\n\n");

        const payload = {
            title: editForm.title.trim(),
            description: editForm.description?.trim() || null,
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
                description: updated.description ?? '',
                instructions: updated.instructions ?? '',
                ingredients: (updated.ingredients ?? []).map((ing: any) => ({
                    id: ing.id,
                    name: ing.name ?? '',
                    quantity: String(ing.pivot?.quantity ?? 0),
                    unit: String(ing.pivot?.unit ?? 'unité'),
                })),
            });

            setIsEditing(false);
            Alert.alert("Succès", "Recette modifiée !");
        } catch (e) {
            Alert.alert("Erreur", "Impossible de modifier la recette.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.headerBar, { borderBottomColor: themeColors.icon }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {recipe.title}
                </Text>
                <TouchableOpacity
                    onPress={() => {
                        if (!editForm) return;
                        setIsEditing(prev => !prev);
                    }}
                    style={{ padding: 6 }}
                >
                    <MaterialCommunityIcons name={isEditing ? "close" : "pencil"} size={22} color={themeColors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
                {/* Section Description */}
                <View style={styles.section}>
                    {isEditing && editForm ? (
                        <View>
                        <TextInput
                            style={[styles.input, { color: themeColors.text, borderColor: themeColors.icon, marginBottom: 15 }]}
                            placeholder="Titre de la recette"
                            placeholderTextColor={themeColors.icon}
                            value={editForm.title}
                            onChangeText={(t) => setEditForm({ ...editForm, title: t })}
                        />

                        <TextInput
                            style={[styles.input, { color: themeColors.text, borderColor: themeColors.icon }]}
                            placeholder="Description"
                            placeholderTextColor={themeColors.icon}
                            value={editForm.description}
                            onChangeText={(t) => setEditForm({ ...editForm, description: t })}
                            multiline
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
                    <View style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#F9F9F9' }]}>
                        {isEditing && editForm ? (
                            <View>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerBar: {
        height: 60,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        borderBottomWidth: 1,
    },
    backBtn: { marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
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

    ingEditRow: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 10,
    },

    ingInput: {
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        fontSize: 14,
    },

    saveBtn: {
        height: 52,
        borderRadius: 15,
        justifyContent: "center",
        alignItems: "center",
    },
});