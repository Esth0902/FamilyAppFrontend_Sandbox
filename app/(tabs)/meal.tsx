import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function MealScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const themeColors = Colors[colorScheme ?? 'light'];
    const menuOptions = [
        {
            id: 'poll',
            title: 'Sondage de la semaine',
            description: 'Votez pour les prochains repas du foyer',
            icon: 'vote',
            color: colorScheme === 'dark' ? '#4dabff' : themeColors.tint,
            route: '/meal/poll'
        },
        {
            id: 'recipes',
            title: 'Gestion des recettes',
            description: 'Bibliothèque culinaire et création par IA',
            icon: 'silverware-fork-knife',
            color: '#F5A623',
            route: '/meal/recipes'
        },
        {
            id: 'shopping',
            title: 'Liste de Courses',
            description: 'Générez votre liste selon les menus choisis',
            icon: 'cart-outline',
            color: '#7ED321',
            route: '/meal/shopping-list'
        }
    ];

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: themeColors.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={[styles.header, { backgroundColor: themeColors.background }]}>
                <Text style={[styles.headerTitle, { color: themeColors.text }]}>Repas & Cuisine</Text>
                <Text style={[styles.headerSubtitle, { color: themeColors.icon }]}>
                    Gérez l&apos;alimentation de votre foyer
                </Text>
            </View>

            <View style={styles.menuGrid}>
                {menuOptions.map((option) => (
                    <TouchableOpacity
                        key={option.id}
                        style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#FFF' }]}
                        onPress={() => router.push(option.route as any)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.cardAccent, { backgroundColor: option.color }]} />
                        <View style={styles.cardContent}>
                            <View style={[styles.iconContainer, { backgroundColor: option.color + '15' }]}>
                                <MaterialCommunityIcons name={option.icon as any} size={28} color={option.color} />
                            </View>
                            <View style={styles.textContainer}>
                                <Text style={[styles.cardTitle, { color: themeColors.text }]}>{option.title}</Text>
                                <Text style={[styles.cardDescription, { color: themeColors.icon }]}>
                                    {option.description}
                                </Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={themeColors.icon} />
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        paddingBottom: 40,
    },
    header: {
        paddingHorizontal: 25,
        paddingTop: 60,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        fontSize: 15,
        marginTop: 4,
    },
    menuGrid: {
        padding: 20,
    },
    card: {
        borderRadius: 15,
        marginBottom: 16,
        overflow: 'hidden',
        flexDirection: 'row',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    cardAccent: {
        width: 6,
        height: '100%',
    },
    cardContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 18,
    },
    iconContainer: {
        width: 52,
        height: 52,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    textContainer: {
        flex: 1,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        marginBottom: 2,
    },
    cardDescription: {
        fontSize: 13,
        lineHeight: 18,
    },
});