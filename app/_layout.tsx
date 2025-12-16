import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/theme';

export default function RootLayout() {
    const [isMounted, setIsMounted] = useState(false);
    const router = useRouter();
    const segments = useSegments() as string[];

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted) return;

        const checkAuth = async () => {
            try {
                const token = await SecureStore.getItemAsync('authToken');
                const isPublicRoute = segments.length === 0 || segments[0] === 'login';

                console.log("🔍 Check Auth -> Token:", !!token, "| Segment:", segments[0]);

                if (token && isPublicRoute) {
                    router.replace('/(tabs)');
                } else if (!token && !isPublicRoute) {
                    router.replace('/');
                }
            } catch (e) {
                console.error("Erreur vérification auth:", e);
            }
        };

        checkAuth().catch((err) => {
            console.error("Erreur inattendue dans checkAuth:", err);
        });

    }, [isMounted, segments, router]);

    if (!isMounted) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
            </View>
        );
    }

    return <Slot />;
}