import React from "react";
import {
    View,
    Text,
    StyleSheet,
    useColorScheme, Platform,
    Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/theme";
import { AppButton } from "@/src/components/ui/AppButton";

export default function PublicHome() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? 'light'];
    const isDark = colorScheme === "dark";
    const logoContainerBackground = isDark ? "#D9DDE3" : theme.card;

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}> 

            <View style={styles.heroSection}>
                <View
                    style={[
                        styles.iconContainer,
                        {
                            backgroundColor: logoContainerBackground,
                            borderColor: isDark ? "rgba(255,255,255,0.24)" : "transparent",
                            borderWidth: isDark ? 1 : 0,
                        },
                    ]}
                >
                    <Image
                        source={require("../assets/images/logo.png")}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>

                <Text style={[styles.logoText, { color: theme.text }]}> 
                    FamilyFlow
                </Text>

                <Text style={[styles.subtitle, { color: theme.textSecondary }]}> 
                    Centralise la gestion de ton foyer : repas, tâches, budget, calendrier et garde alternée.
                </Text>
            </View>

            <View style={styles.buttonsContainer}>
                <AppButton
                    title="Se connecter"
                    variant="primary"
                    style={styles.buttonPrimary}
                    onPress={() => router.push("/login")}
                />

                <AppButton
                    title="Créer un compte"
                    variant="secondary"
                    style={styles.buttonSecondary}
                    onPress={() => router.push("/register")}
                />
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
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 5,
        padding: 12,
    },
    logoImage: {
        width: "100%",
        height: "100%",
        borderRadius: 12,
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
        minHeight: 54,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },

    buttonSecondary: {
        width: '100%',
        minHeight: 54,
        borderRadius: 16,
        borderWidth: 2,
    },
});
