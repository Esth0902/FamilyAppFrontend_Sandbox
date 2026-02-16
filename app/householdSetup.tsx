import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "@/src/api/client";

const MODULES = [
    { id: 'meals', label: 'Repas & Courses', desc: 'Menus et liste partagée.', icon: 'food-apple-outline' },
    { id: 'tasks', label: 'Tâches Ménagères', desc: 'Suivi des corvées.', icon: 'broom' },
    { id: 'budget', label: 'Budget & Argent', desc: 'Argent de poche, cagnottes.', icon: 'piggy-bank-outline' },
    { id: 'calendar', label: 'Agenda Familial', desc: 'Planning partagé.', icon: 'calendar-clock' },
];

const DAYS = [
    { label: 'Lun', value: 'Monday' },
    { label: 'Mar', value: 'Tuesday' },
    { label: 'Mer', value: 'Wednesday' },
    { label: 'Jeu', value: 'Thursday' },
    { label: 'Ven', value: 'Friday' },
    { label: 'Sam', value: 'Saturday' },
    { label: 'Dim', value: 'Sunday' },
];

export default function SetupHousehold() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    // États de chargement et d'édition
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [householdId, setHouseholdId] = useState<number | null>(null);

    // Champs du formulaire
    const [houseName, setHouseName] = useState("");
    const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
        meals: true, tasks: true, budget: true, calendar: true,
    });
    const [pollDay, setPollDay] = useState("Friday");
    const [pollTime, setPollTime] = useState("10:00");
    const [pollDuration, setPollDuration] = useState(24);

    // Gestion des enfants (création uniquement)
    const [childName, setChildName] = useState("");
    const [children, setChildren] = useState<string[]>([]);

    // 1. Charger les données existantes au montage
    useEffect(() => {
        loadExistingData();
    }, []);

    const loadExistingData = async () => {
        try {
            const userStr = await SecureStore.getItemAsync("user");
            if (userStr) {
                const user = JSON.parse(userStr);
                if (user.household_id) {
                    setIsEditing(true);
                    setHouseholdId(user.household_id);
                    await fetchHouseholdDetails(user.household_id);
                }
            }
        } catch (e) {
            console.error("Erreur lecture user", e);
        } finally {
            setInitialLoading(false);
        }
    };

    const fetchHouseholdDetails = async (id: number) => {
        try {
            const data = await apiFetch(`/households/${id}`);

            setHouseName(data.name);
            if (data.settings) setActiveModules(data.settings);

            // Pré-remplir les réglages sondage
            if (data.poll_day) setPollDay(data.poll_day);
            if (data.poll_time) setPollTime(data.poll_time.substring(0, 5)); // "10:00:00" -> "10:00"
            if (data.poll_duration) setPollDuration(data.poll_duration);

        } catch (error) {
            Alert.alert("Erreur", "Impossible de charger les infos du foyer.");
        }
    };

    const toggleModule = (id: string) => {
        setActiveModules(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const addChild = () => {
        if (childName.trim().length > 0) {
            setChildren([...children, childName.trim()]);
            setChildName("");
        }
    };

    const removeChild = (index: number) => {
        const newChildren = [...children];
        newChildren.splice(index, 1);
        setChildren(newChildren);
    };

    const handleSave = async () => {
        if (!houseName.trim()) {
            Alert.alert("Oups", "Le nom du foyer est obligatoire.");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                name: houseName,
                settings: activeModules,
                poll_day: pollDay,
                poll_time: pollTime,
                poll_duration: pollDuration,
                // On n'envoie les enfants qu'à la création pour éviter les conflits
                ...( !isEditing && { children_profiles: children } )
            };

            if (isEditing && householdId) {
                // UPDATE (PUT)
                await apiFetch(`/households/${householdId}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                Alert.alert("Succès", "Configuration mise à jour !");
            } else {
                // CREATE (POST)
                const response = await apiFetch(`/households`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                // Mettre à jour le user local
                const userStr = await SecureStore.getItemAsync("user");
                if (userStr) {
                    const userData = JSON.parse(userStr);
                    userData.household_id = response.household.id;
                    await SecureStore.setItemAsync("user", JSON.stringify(userData));
                }
                Alert.alert("Félicitations", "Foyer créé avec succès !");
            }

            router.replace('/(tabs)/home');

        } catch (error: any) {
            Alert.alert("Erreur", error.message || "Une erreur est survenue");
        } finally {
            setLoading(false);
        }
    };

    if (initialLoading) {
        return <View style={styles.centerContainer}><ActivityIndicator size="large" color={theme.tint} /></View>;
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: theme.background }}
        >
            <View style={[styles.headerBar, { borderBottomColor: theme.icon }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                    {isEditing ? "Modifier mon Foyer" : "Nouveau Foyer"}
                </Text>
            </View>

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Nom du foyer</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
                        value={houseName}
                        onChangeText={setHouseName}
                        placeholder="Ex: La Tribu..."
                        placeholderTextColor={theme.textSecondary}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Modules activés</Text>
                    {MODULES.map((module) => (
                        <View key={module.id} style={[styles.moduleCard, { backgroundColor: theme.card }]}>
                            <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}>
                                <MaterialCommunityIcons name={module.icon as any} size={24} color={theme.tint} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
                            </View>
                            <Switch
                                value={!!activeModules[module.id]}
                                onValueChange={() => toggleModule(module.id)}
                                trackColor={{ false: theme.icon, true: theme.tint }}
                            />
                        </View>
                    ))}
                </View>

                {/* CONFIGURATION REPAS (Visible si module activé) */}
                {activeModules['meals'] && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>
                            📅 Configuration des Repas
                        </Text>

                        <Text style={[styles.label, { color: theme.text }]}>Jour de création du sondage :</Text>
                        <View style={styles.daysContainer}>
                            {DAYS.map((day) => (
                                <TouchableOpacity
                                    key={day.value}
                                    onPress={() => setPollDay(day.value)}
                                    style={[
                                        styles.dayChip,
                                        { backgroundColor: theme.card, borderColor: theme.icon },
                                        pollDay === day.value && { backgroundColor: theme.tint, borderColor: theme.tint }
                                    ]}
                                >
                                    <Text style={[
                                        { color: theme.text, fontSize: 12 },
                                        pollDay === day.value && { color: 'white', fontWeight: 'bold' }
                                    ]}>
                                        {day.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={{ flexDirection: 'row', gap: 15, marginTop: 15 }}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.label, { color: theme.text }]}>Heure (HH:MM)</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: theme.card, color: theme.text, textAlign: 'center' }]}
                                    value={pollTime}
                                    onChangeText={setPollTime}
                                    placeholder="10:00"
                                    placeholderTextColor={theme.textSecondary}
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.label, { color: theme.text }]}>Durée (Heures)</Text>
                                <View style={{ flexDirection: 'row', gap: 5 }}>
                                    {[12, 24, 48].map((dur) => (
                                        <TouchableOpacity
                                            key={dur}
                                            onPress={() => setPollDuration(dur)}
                                            style={[
                                                styles.durationBtn,
                                                { backgroundColor: theme.card },
                                                pollDuration === dur && { backgroundColor: theme.tint }
                                            ]}
                                        >
                                            <Text style={[{ color: theme.text }, pollDuration === dur && { color: 'white' }]}>{dur}h</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* Section Enfants : Visible UNIQUEMENT si on crée un nouveau foyer */}
                {!isEditing && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: theme.text }]}>Enfants (Profils)</Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                            <TextInput
                                style={[styles.input, { flex: 1, marginBottom: 0, backgroundColor: theme.card, color: theme.text }]}
                                placeholder="Prénom"
                                placeholderTextColor={theme.textSecondary}
                                value={childName}
                                onChangeText={setChildName}
                            />
                            <TouchableOpacity onPress={addChild} style={[styles.addBtn, { backgroundColor: theme.card }]}>
                                <MaterialCommunityIcons name="plus" size={24} color={theme.tint} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.chipsContainer}>
                            {children.map((child, index) => (
                                <View key={index} style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.tint }]}>
                                    <Text style={{ color: theme.text }}>{child}</Text>
                                    <TouchableOpacity onPress={() => removeChild(index)}>
                                        <MaterialCommunityIcons name="close-circle" size={16} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1 }]}
                    onPress={handleSave}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.submitButtonText}>
                            {isEditing ? "Sauvegarder les modifications" : "Créer le foyer"}
                        </Text>
                    )}
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    headerBar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 30 : 0 },
    headerTitle: { fontSize: 18, fontWeight: '700', marginLeft: 16 },
    container: { padding: 20 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
    moduleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
    moduleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    moduleLabel: { fontSize: 15, fontWeight: '600' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    daysContainer: { flexDirection: 'row', justifyContent: 'space-between' },
    dayChip: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    durationBtn: { flex: 1, height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    addBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, gap: 6 },
    submitButton: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    submitButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});