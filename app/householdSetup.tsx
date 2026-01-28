import React, { useState } from "react";
import {
    View,
    Text,
    TextInput,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
    Alert,
    Share,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    useColorScheme,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import * as SecureStore from "expo-secure-store";
import { API_BASE_URL } from "@/src/api/client";

const MODULES = [
    { id: 'meals', label: 'Repas & Courses', desc: 'Menus et liste partagée.', icon: 'food-apple-outline' },
    { id: 'tasks', label: 'Tâches Ménagères', desc: 'Suivi des corvées.', icon: 'broom' },
    { id: 'budget', label: 'Budget & Argent', desc: 'Argent de poche, cagnottes.', icon: 'piggy-bank-outline' },
    { id: 'calendar', label: 'Agenda Familial', desc: 'Planning partagé.', icon: 'calendar-clock' },
];

export default function SetupHousehold() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    const [step, setStep] = useState<'form' | 'success'>('form');

    const [houseName, setHouseName] = useState("");
    const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
        meals: true, tasks: true, budget: true, calendar: true,
    });
    const [childName, setChildName] = useState("");
    const [children, setChildren] = useState<string[]>([]);
    const [createdHouseholdId, setCreatedHouseholdId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [inviteLoading, setInviteLoading] = useState(false);


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

    const createHousehold = async () => {
        if (!houseName.trim()) {
            Alert.alert("Oups", "Donne un nom à ton foyer !");
            return;
        }

        setLoading(true);

        try {
            const token = await SecureStore.getItemAsync("authToken");

            const response = await fetch(`${API_BASE_URL}/households`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: houseName,
                    modules: activeModules,
                    children_profiles: children
                })
            });

            const data = await response.json();

            if (response.ok) {
                setCreatedHouseholdId(data.household.id);

                const userStr = await SecureStore.getItemAsync("user");
                if (userStr) {
                    const userData = JSON.parse(userStr);
                    userData.household_id = data.household.id;
                    await SecureStore.setItemAsync("user", JSON.stringify(userData));
                }
                setStep('success');
            } else {
                Alert.alert("Erreur", data.message || "Impossible de créer le foyer.");
            }

        } catch (error) {
            console.error(error);
            Alert.alert("Erreur Réseau", "Vérifiez votre connexion.");
        } finally {
            setLoading(false);
        }
    };

    const invitePartner = async () => {
        if (!createdHouseholdId) return;
        setInviteLoading(true);

        try {
            const token = await SecureStore.getItemAsync("authToken");

            const response = await fetch(`${API_BASE_URL}/households/${createdHouseholdId}/invite`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });

            const data = await response.json();

            if (response.ok && data.link) {
                await Share.share({
                    message: `Salut ! J'ai créé notre foyer "${houseName}" sur l'app. Rejoins-nous pour gérer l'organisation :\n${data.link}`,
                });
            } else {
                Alert.alert("Erreur", "Impossible de générer le lien.");
            }
        } catch (error) {
            Alert.alert("Erreur", "Problème lors du partage.");
        } finally {
            setInviteLoading(false);
        }
    };

    const finishSetup = () => {
        router.replace('/(tabs)/home');
    };

    if (step === 'success') {
        return (
            <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
                <View style={[styles.iconContainer, { backgroundColor: theme.card }]}>
                    <MaterialCommunityIcons name="check-bold" size={60} color={theme.accentCool} />
                </View>

                <Text style={[styles.successTitle, { color: theme.text }]}>C'est tout bon !</Text>
                <Text style={[styles.successText, { color: theme.textSecondary }]}>
                    Le foyer <Text style={{fontWeight: 'bold', color: theme.tint}}>{houseName}</Text> est configuré.
                </Text>

                <View style={styles.spacer} />

                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#25D366' }]} // Vert WhatsApp
                    onPress={invitePartner}
                    disabled={inviteLoading}
                >
                    {inviteLoading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <MaterialCommunityIcons name="whatsapp" size={24} color="white" style={{ marginRight: 10 }} />
                            <Text style={styles.actionButtonText}>Inviter l'autre parent</Text>
                        </>
                    )}
                </TouchableOpacity>
                <Text style={[styles.hintText, { color: theme.textSecondary }]}>
                    Cela générera un lien unique à envoyer via WhatsApp ou SMS.
                </Text>

                <View style={styles.spacer} />

                {/* Bouton Terminer */}
                <TouchableOpacity onPress={finishSetup} style={styles.secondaryButton}>
                    <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                        Aller à l'accueil
                    </Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, backgroundColor: theme.background }}
        >
            <View style={[styles.headerBar, { borderBottomColor: theme.icon }]}>
                <TouchableOpacity onPress={() => {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/home');
                    }
                }}>
                    <MaterialCommunityIcons name="close" size={24} color={theme.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Nouveau Foyer</Text>
            </View>

            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Nom du foyer</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: theme.card, color: theme.text }]}
                        placeholder="Ex: La Tribu..."
                        placeholderTextColor={theme.textSecondary}
                        value={houseName}
                        onChangeText={setHouseName}
                    />
                </View>

                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Modules</Text>
                    {MODULES.map((module) => (
                        <View key={module.id} style={[styles.moduleCard, { backgroundColor: theme.card }]}>
                            <View style={[styles.moduleIcon, { backgroundColor: theme.background }]}>
                                <MaterialCommunityIcons name={module.icon as any} size={24} color={theme.tint} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.moduleLabel, { color: theme.text }]}>{module.label}</Text>
                            </View>
                            <Switch
                                trackColor={{ false: theme.icon, true: theme.tint }}
                                thumbColor={"white"}
                                value={activeModules[module.id]}
                                onValueChange={() => toggleModule(module.id)}
                            />
                        </View>
                    ))}
                </View>

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

                <View style={{ height: 20 }} />

                <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1 }]}
                    onPress={createHousehold}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text style={styles.submitButtonText}>Valider et continuer</Text>
                    )}
                </TouchableOpacity>
                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({

    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    successText: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 32,
    },
    spacer: { height: 20 },
    actionButton: {
        flexDirection: 'row',
        width: '100%',
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    actionButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    hintText: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 20,
    },
    secondaryButton: {
        padding: 16,
    },
    secondaryButtonText: {
        fontSize: 16,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },

    headerBar: { height: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: Platform.OS === 'android' ? 30 : 0 },
    backBtn: { marginRight: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700' },
    container: { padding: 20 },
    section: { marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
    input: { height: 50, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, marginBottom: 16 },
    moduleCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
    moduleIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    moduleLabel: { fontSize: 15, fontWeight: '600' },
    addBtn: { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, gap: 6 },
    submitButton: { height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    submitButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});