import React from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    useColorScheme, Platform
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export default function PublicHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>

            <View style={styles.heroSection}>
                <View style={[styles.iconContainer, { backgroundColor: theme.card }]}>
                    <MaterialCommunityIcons name="home-heart" size={64} color={theme.accentWarm} />
                </View>

                <Text style={[styles.logoText, { color: theme.text }]}>
                    FamilyFlow
                </Text>

                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                    Centralise la gestion de ton foyer : repas, tâches, budget et garde alternée.
                </Text>
            </View>

            <View style={styles.buttonsContainer}>

                <TouchableOpacity
                    style={[styles.buttonPrimary, { backgroundColor: theme.tint }]}
                    onPress={() => router.push("/login")}
                    activeOpacity={0.8}
                >
                    <Text style={styles.buttonPrimaryText}>Se connecter</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.buttonSecondary, { borderColor: theme.tint }]}
                    onPress={() => router.push("/register")}
                    activeOpacity={0.6}
                >
                    <Text style={[styles.buttonSecondaryText, { color: theme.tint }]}>
                        Créer un compte
                    </Text>
                </TouchableOpacity>

            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 24,
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 80,
    },
    heroSection: {
        alignItems: 'center',
        width: '100%',
        marginTop: 40,
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
    },
    logoText: {
        fontSize: 36,
        fontWeight: "800",
        marginBottom: 16,
        letterSpacing: 0.5,
        fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    },
    subtitle: {
        fontSize: 16,
        textAlign: "center",
        lineHeight: 24,
        maxWidth: '85%',
    },
    buttonsContainer: {
        width: "100%",
        gap: 16,
    },

    buttonPrimary: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    buttonPrimaryText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
    },

    buttonSecondary: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
    buttonSecondaryText: {
        fontSize: 18,
        fontWeight: '600',
    }
});