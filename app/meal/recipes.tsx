import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    ScrollView,
    Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiFetch } from '@/src/api/client';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";

interface Recipe {
    id: number;
    title: string;
    description: string | null;
}
type IngredientForm = { name: string; quantity: string; unit: string };

export default function RecipesScreen() {
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? 'light'];

    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState<'choice' | 'manual' | 'ai' | 'preview'>('choice');
    const [aiPrompt, setAiPrompt] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
    const [previewRecipe, setPreviewRecipe] = useState<any | null>(null);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
    const [aiIntent, setAiIntent] = useState<'specific' | 'ideas'>('ideas');
    useEffect(() => {
        void fetchRecipes();
    }, []);

    const fetchRecipes = async () => {
        try {
            const data = await apiFetch('/recipes');
            setRecipes(data);
        } catch (error: any) {
            console.error("Erreur chargement recettes:", error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredRecipes = recipes.filter(r =>
        r.title.toLowerCase().includes(search.toLowerCase())
    );

    const openRecipeActions = (recipe: Recipe) => {
        Alert.alert(
            recipe.title,
            "Que veux-tu faire ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Modifier",
                    onPress: () => router.push({
                        pathname: "/meal/recipe-detail",
                        params: {id: recipe.id, autoEdit: 'true'}
                    }),
                },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => confirmDelete(recipe),
                },
            ]
        );
    };

    const renderRecipeItem = ({ item }: { item: Recipe }) => (
        <TouchableOpacity
            style={[styles.recipeCard, { backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#FFF' }]}
            onPress={() => router.push({ pathname: "/meal/recipe-detail", params: { id: item.id } })}
            activeOpacity={0.85}
        >
            <View style={styles.recipeInfo}>
                <Text style={[styles.recipeTitle, { color: themeColors.text }]}>{item.title}</Text>
                <Text style={[styles.recipeDesc, { color: themeColors.icon }]} numberOfLines={2}>
                    {item.description || "Aucune description"}
                </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <TouchableOpacity
                    onPress={() => openRecipeActions(item)}
                    style={{ padding: 6 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <MaterialCommunityIcons name="dots-vertical" size={22} color={themeColors.icon} />
                </TouchableOpacity>

                <MaterialCommunityIcons name="chevron-right" size={24} color={themeColors.icon} />
            </View>
        </TouchableOpacity>
    );

    const [newRecipe, setNewRecipe] = useState({
        title: '',
        description: '',
        instructions: [''],
        ingredients: [{ name: '', quantity: '', unit: 'g' } as IngredientForm],
    });
    const addInstructionStep = () => {
        setNewRecipe(prev => ({ ...prev, instructions: [...prev.instructions, ""] }));
    };

    const removeInstructionStep = (index: number) => {
        const newSteps = [...newRecipe.instructions];
        newSteps.splice(index, 1);
        setNewRecipe(prev => ({ ...prev, instructions: newSteps }));
    };

    const updateInstructionStep = (text: string, index: number) => {
        const newSteps = [...newRecipe.instructions];
        newSteps[index] = text;
        setNewRecipe(prev => ({ ...prev, instructions: newSteps }));
    };
    const handleManualSubmit = async () => {
        if (!newRecipe.title.trim()) return Alert.alert('Erreur', 'Le titre de la recette est obligatoire');

        setSubmitting(true);
        try {
            const userStr = await SecureStore.getItemAsync("user");
            const userData = JSON.parse(userStr || '{}');
            const householdId = userData.household_id || (userData.households && userData.households[0]?.id);

            const stepsArray = Array.isArray(newRecipe.instructions) ? newRecipe.instructions : [newRecipe.instructions];

            const formattedInstructions = stepsArray
                .map((s: string) => s.trim())
                .filter((s: string) => s.length > 0)
                .map((s: string, i: number) => `Étape ${i + 1} : ${s}`)
                .join("\n\n");

            const payload = {
                ...newRecipe,
                instructions: formattedInstructions, // On envoie le texte formaté
                household_id: householdId,
                ingredients: newRecipe.ingredients.map(ing => ({
                    name: ing.name.trim(),
                    unit: ing.unit.trim() || 'unité',
                    quantity: parseFloat(ing.quantity) || 0,
                })),
            };

            const isEdit = formMode === 'edit' && selectedRecipe?.id;

            const response = await apiFetch(isEdit ? `/recipes/${selectedRecipe!.id}` : '/recipes', {
                method: isEdit ? 'PUT' : 'POST',
                body: JSON.stringify(payload),
            });

            if (isEdit) {
                setRecipes(prev => prev.map(r => (r.id === response.id ? response : r)));
                Alert.alert("Succès", "Recette modifiée !");
            } else {
                setRecipes(prev => [response, ...prev]);
                Alert.alert("Succès", "Recette ajoutée !");
            }

            closeAndResetModal();
            resetForm();
            setSelectedRecipe(null);
            setFormMode('create');
        } catch {
            Alert.alert('Erreur', "Impossible d'enregistrer la recette.");
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = (recipe: Recipe) => {
        Alert.alert(
            "Supprimer la recette",
            `Confirmer la suppression de "${recipe.title}" ?`,
            [
                { text: "Annuler", style: "cancel" },
                { text: "Supprimer", style: "destructive", onPress: () => handleDelete(recipe.id) },
            ]
        );
    };

    const handleDelete = async (id: number) => {
        setSubmitting(true);
        try {
            await apiFetch(`/recipes/${id}`, { method: "DELETE" });
            setRecipes(prev => prev.filter(r => r.id !== id));
            Alert.alert("Succès", "Recette supprimée !");
        } catch {
            Alert.alert("Erreur", "Impossible de supprimer la recette.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleAiSubmit = async () => {
        const p = aiPrompt.trim().slice(0, 200);
        if (p.length < 3) return;
        setSubmitting(true);
        try {
            const response = await apiFetch('/recipes/suggest', {
                method: 'POST',
                body: JSON.stringify({ preferences: p, count: 3, intent: aiIntent })
            });

            if (response.type === 'single' && response.data) {
                setPreviewRecipe(response.data);
                setModalMode('preview');
            }
            else if (response.type === 'list' && Array.isArray(response.data)) {
                setAiSuggestions(response.data);
            }
            else {
                setAiSuggestions([]);
            }
        } catch {
            Alert.alert('Erreur', 'Impossible de trouver des idées.');
            setAiSuggestions([]);
        } finally {
            setSubmitting(false);
        }
    };

    const handlePreview = async (title: string) => {
        setSubmitting(true);
        try {
            const response = await apiFetch('/recipes/preview-ai', {
                method: 'POST',
                body: JSON.stringify({ title })
            });
            setPreviewRecipe(response);
            setModalMode('preview');
        } catch {
            Alert.alert("Erreur", "Impossible de charger les détails.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleFinalize = async () => {
        if (!previewRecipe) return;
        setSubmitting(true);
        try {
            const userStr = await SecureStore.getItemAsync("user");
            const userData = JSON.parse(userStr || '{}');
            const hId = userData.household_id || userData.households?.[0]?.id;

            const response = await apiFetch('/recipes/ai-store', {
                method: 'POST',
                body: JSON.stringify({
                    ...previewRecipe,
                    household_id: hId
                })
            });

            setRecipes(prev => [response, ...prev]);
            closeAndResetModal();
            Alert.alert("Succès", "Recette ajoutée !");
        } catch {
            Alert.alert("Erreur", "L'enregistrement a échoué.");
        } finally {
            setSubmitting(false);
        }
    };

    const addIngredientRow = () => {
        setNewRecipe(prev => ({
            ...prev,
            ingredients: [...prev.ingredients, { name: '', quantity: '', unit: 'g' }]
        }));
    };

    const closeAndResetModal = () => {
        setIsModalVisible(false);
        setModalMode('choice');
        setAiPrompt('');
        setAiSuggestions([]);
        setPreviewRecipe(null);
        resetForm();
    };

    const resetForm = () => {
        setNewRecipe({
            title: '',
            description: '',
            instructions: [''],
            ingredients: [{ name: '', quantity: '', unit: 'g' }]
        });
        setModalMode('choice');
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: themeColors.background }}>
                <ActivityIndicator size="large" color={themeColors.tint} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: themeColors.background, paddingTop: insets.top > 0 ? insets.top : 20 }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.headerBar, { borderBottomColor: themeColors.icon }]}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)/meal')} style={styles.backBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={themeColors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>Gestion des Recettes</Text>
            </View>

            <View style={[styles.searchContainer, { backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#EEE' }]}>
                <MaterialCommunityIcons name="magnify" size={20} color={themeColors.icon} />
                <TextInput
                    style={[styles.searchInput, { color: themeColors.text }]}
                    placeholder="Rechercher une recette..."
                    placeholderTextColor={themeColors.icon}
                    value={search}
                    onChangeText={setSearch}
                />
            </View>

            <FlatList
                data={filteredRecipes}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderRecipeItem}
                contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
            />

            {/* MODAL D'AJOUT */}
            <Modal visible={isModalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={[styles.modalContent, { backgroundColor: themeColors.card, paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                                {modalMode === 'choice' ? 'Ajouter une recette' :
                                    modalMode === 'ai' ? (aiIntent === 'specific' ? 'Quel plat ?' : 'Vos critères ?') :
                                        modalMode === 'preview' ? 'Aperçu de la recette' :
                                            'Nouvelle recette'}
                            </Text>
                            <TouchableOpacity onPress={closeAndResetModal}>
                                <MaterialCommunityIcons name="close" size={24} color={themeColors.text} />
                            </TouchableOpacity>
                        </View>

                        {/* MODE CHOIX */}
                        {modalMode === 'choice' && (
                            <View style={styles.choiceContainer}>
                                {/* Choix 1 : Recette précise */}
                                <TouchableOpacity
                                    style={[styles.choiceBtn, { backgroundColor: themeColors.tint }]}
                                    onPress={() => { setAiIntent('specific'); setPreviewRecipe(null); setModalMode('ai'); }}
                                >
                                    <MaterialCommunityIcons name="chef-hat" size={28} color="white" />
                                    <View>
                                        <Text style={styles.choiceBtnText}>Recette précise</Text>
                                        <Text style={{color:'rgba(255,255,255,0.8)', fontSize: 12}}>Générer un plat que je connais</Text>
                                    </View>
                                </TouchableOpacity>

                                {/* Choix 2 : Idées / Inspiration */}
                                <TouchableOpacity
                                    style={[styles.choiceBtn, { backgroundColor: '#8A2BE2' }]}
                                    onPress={() => { setAiIntent('ideas'); setPreviewRecipe(null); setModalMode('ai'); }}
                                >
                                    <MaterialCommunityIcons name="lightbulb-on" size={28} color="white" />
                                    <View>
                                        <Text style={styles.choiceBtnText}>Trouver l&apos;inspiration</Text>
                                        <Text style={{color:'rgba(255,255,255,0.8)', fontSize: 12}}>Suggestions selon mes goûts</Text>
                                    </View>
                                </TouchableOpacity>

                                {/* Choix 3 : Manuel */}
                                <TouchableOpacity
                                    style={[styles.choiceBtn, { backgroundColor: themeColors.background, borderWidth: 1, borderColor: themeColors.tint }]}
                                    onPress={() => setModalMode('manual')}
                                >
                                    <MaterialCommunityIcons name="pencil" size={28} color={themeColors.tint} />
                                    <Text style={[styles.choiceBtnText, { color: themeColors.tint }]}>Saisie manuelle</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {/* --- MODE IA (Saisie + Suggestions) --- */}
                        {modalMode === 'ai' && (
                            <View>
                                {(aiSuggestions || []).length === 0 ? (
                                    <View>
                                        <Text style={{color: themeColors.text, marginBottom: 10, fontWeight: '500'}}>
                                            {aiIntent === 'specific'
                                                ? "Entrez le nom du plat que vous souhaitez cuisiner :"
                                                : "Décrivez vos envies (ingrédients, régime, temps...) :"
                                            }
                                        </Text>

                                        <TextInput
                                            style={[styles.input, { height: 80, color: themeColors.text, textAlignVertical: 'top' }]}
                                            placeholder={aiIntent === 'specific'
                                                ? "Ex: Lasagnes à la bolognaise, Tarte au citron..."
                                                : "Ex: Plat végétarien, rapide, avec des courgettes, moins de 500 calories..."
                                            }
                                            placeholderTextColor={themeColors.icon}
                                            value={aiPrompt}
                                            onChangeText={setAiPrompt}
                                            multiline
                                        />
                                        <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColors.tint }]} onPress={handleAiSubmit} disabled={submitting}>
                                            {submitting ? <ActivityIndicator color="white" /> : (
                                                <Text style={{color:'white', fontWeight:'bold'}}>
                                                    {aiIntent === 'specific' ? "Générer la recette" : "Proposer des idées"}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ) : (

                                    <View>
                                        <Text style={{color: themeColors.icon, marginBottom: 15}}>
                                            {aiIntent === 'specific' ? "Voici ce que j'ai trouvé :" : "Voici quelques idées :"}
                                        </Text>
                                        {(aiSuggestions || []).map((suggestion, index) => (
                                            <TouchableOpacity
                                                key={index}
                                                style={[
                                                    styles.suggestionItem,
                                                    {
                                                        borderColor: themeColors.icon,
                                                        opacity: submitting ? 0.5 : 1
                                                    }
                                                ]}
                                                activeOpacity={0.7}
                                                onPress={() => !submitting && handlePreview(suggestion.title)}
                                            >
                                                <View style={{flex:1}}>
                                                    <Text style={{fontWeight:'bold', color: themeColors.text}}>{suggestion.title}</Text>
                                                    <Text style={{fontSize:12, color: themeColors.icon}} numberOfLines={1}>{suggestion.description}</Text>
                                                </View>
                                                <MaterialCommunityIcons name="eye-outline" size={20} color={submitting ? themeColors.icon : themeColors.tint} />
                                            </TouchableOpacity>
                                        ))}
                                        <TouchableOpacity onPress={() => setAiSuggestions([])} style={{marginTop: 15}}>
                                            <Text style={{color: themeColors.tint, textAlign:'center'}}>Nouvelle recherche</Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* MODE PREVIEW (Aperçu avant enregistrement) */}
                        {modalMode === 'preview' && previewRecipe && (
                            <View style={{maxHeight: 450}}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={[styles.previewTitle, { color: themeColors.text }]}>{previewRecipe.title}</Text>
                                    <Text style={{color: themeColors.icon, marginBottom: 15}}>{previewRecipe.description}</Text>

                                    <Text style={[styles.label, {color: themeColors.tint}]}>INGRÉDIENTS</Text>
                                    {previewRecipe.ingredients.map((ing: any, i: number) => (
                                        <Text key={i} style={{color: themeColors.text, marginBottom: 3}}>
                                            • {ing.quantity > 0 ? `${ing.quantity} ` : ''}{ing.unit} {ing.name}
                                        </Text>
                                    ))}

                                    <Text style={[styles.label, {color: themeColors.tint, marginTop: 15}]}>INSTRUCTIONS</Text>
                                    <Text style={{color: themeColors.text, lineHeight: 20}}>{previewRecipe.instructions}</Text>
                                </ScrollView>

                                <View style={{flexDirection:'row', gap: 10, marginTop: 20}}>
                                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColors.tint, flex: 2 }]} onPress={handleFinalize} disabled={submitting}>
                                        {submitting ? <ActivityIndicator color="white" /> : <Text style={{color:'white', fontWeight:'bold'}}>Enregistrer la recette</Text>}
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#DDD', flex: 1 }]} onPress={() => { setPreviewRecipe(null); setModalMode('ai'); }}>
                                        <Text style={{color: '#333'}}>Retour</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {/* MODE MANUEL */}
                        {modalMode === 'manual' && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <TextInput
                                    style={[styles.input, { color: themeColors.text }]}
                                    placeholder="Titre de la recette"
                                    placeholderTextColor={themeColors.icon}
                                    value={newRecipe.title}
                                    onChangeText={t => setNewRecipe({...newRecipe, title: t})}
                                />

                                <TextInput
                                    style={[styles.input, { color: themeColors.text, minHeight: 60 }]}
                                    placeholder="Description courte (optionnel)"
                                    placeholderTextColor={themeColors.icon}
                                    value={newRecipe.description}
                                    onChangeText={t => setNewRecipe({...newRecipe, description: t})}
                                    multiline
                                />

                                <Text style={[styles.label, { color: themeColors.text }]}>Ingrédients</Text>
                                {newRecipe.ingredients.map((ing, index) => (
                                    <View key={index} style={styles.ingRow}>
                                        <TextInput
                                            style={[styles.input, { flex: 2, marginBottom: 0, color: themeColors.text }]}
                                            placeholder="Nom"
                                            placeholderTextColor={themeColors.icon}
                                            value={ing.name}
                                            onChangeText={t => {
                                                const newIngs = [...newRecipe.ingredients];
                                                newIngs[index].name = t;
                                                setNewRecipe({ ...newRecipe, ingredients: newIngs });
                                            }}
                                        />

                                        <TextInput
                                            style={[styles.input, { flex: 1, marginBottom: 0, color: themeColors.text }]}
                                            placeholder="Qté"
                                            placeholderTextColor={themeColors.icon}
                                            keyboardType="numeric"
                                            value={ing.quantity}
                                            onChangeText={t => {
                                                const newIngs = [...newRecipe.ingredients];
                                                newIngs[index].quantity = t;
                                                setNewRecipe({ ...newRecipe, ingredients: newIngs });
                                            }}
                                        />

                                        <TextInput
                                            style={[styles.input, { flex: 1, marginBottom: 0, color: themeColors.text }]}
                                            placeholder="Unité"
                                            placeholderTextColor={themeColors.icon}
                                            value={ing.unit}
                                            onChangeText={t => {
                                                const newIngs = [...newRecipe.ingredients];
                                                newIngs[index].unit = t;
                                                setNewRecipe({ ...newRecipe, ingredients: newIngs });
                                            }}
                                        />
                                    </View>
                                ))}
                                <TouchableOpacity onPress={addIngredientRow} style={styles.addIngBtn}>
                                    <Text style={{ color: themeColors.tint }}>+ Ajouter un ingrédient</Text>
                                </TouchableOpacity>

                                <Text style={[styles.label, { color: themeColors.text, marginTop: 20 }]}>Instructions</Text>

                                {(Array.isArray(newRecipe.instructions) ? newRecipe.instructions : [""]).map((step, idx) => (
                                    <View key={idx} style={{marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 10}}>
                                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: themeColors.tint, justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
                                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>{idx + 1}</Text>
                                        </View>

                                        <TextInput
                                            style={[styles.input, { flex: 1, color: themeColors.text, marginBottom: 0, minHeight: 50 }]}
                                            placeholder={`Étape ${idx + 1}`}
                                            placeholderTextColor={themeColors.icon}
                                            value={step}
                                            onChangeText={(t) => updateInstructionStep(t, idx)}
                                            multiline
                                        />

                                        {newRecipe.instructions.length > 1 && (
                                            <TouchableOpacity onPress={() => removeInstructionStep(idx)} style={{marginTop: 12}}>
                                                <MaterialCommunityIcons name="trash-can-outline" size={24} color="#FF4444" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}

                                <TouchableOpacity onPress={addInstructionStep} style={{flexDirection:'row', alignItems:'center', marginTop: 5, marginBottom: 30}}>
                                    <MaterialCommunityIcons name="plus-circle" size={20} color={themeColors.tint} />
                                    <Text style={{color: themeColors.tint, fontWeight: 'bold', marginLeft: 5}}>Ajouter une étape</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.submitBtn, { backgroundColor: themeColors.tint }]}
                                    onPress={handleManualSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? <ActivityIndicator color="white" /> : (
                                        <Text style={styles.submitBtnText}>
                                            {formMode === 'edit' ? 'Modifier la recette' : 'Enregistrer la recette'}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <TouchableOpacity
                activeOpacity={0.8}
                style={[
                    styles.fab,
                    { backgroundColor: themeColors.tint, bottom: insets.bottom > 0 ? insets.bottom + 15 : 25 }
                ]}
                onPress={() => {
                    setFormMode('create');
                    setSelectedRecipe(null);
                    setIsModalVisible(true);
                }}
            >
                <MaterialCommunityIcons name="plus" size={30} color="white" />
            </TouchableOpacity>

        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerBar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1 },
    backBtn: { marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 15, marginVertical: 10, paddingHorizontal: 15, borderRadius: 12, height: 50, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3 },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
    listContent: { paddingHorizontal: 15, paddingTop: 5 },
    recipeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 15, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
    recipeInfo: { flex: 1 },
    recipeTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    recipeDesc: { fontSize: 14, lineHeight: 20 },
    fab: { position: 'absolute', right: 20, width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold' },
    choiceContainer: { gap: 15, paddingBottom: 20 },
    choiceBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, borderRadius: 15, gap: 15 },
    choiceBtnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    suggestionItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
    previewTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
    input: { borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#DDD', marginBottom: 15, fontSize: 16 },
    label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 },
    ingRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    addIngBtn: { padding: 10, marginBottom: 20 },
    submitBtn: { height: 55, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});