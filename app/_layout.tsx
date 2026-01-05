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
                const userStr = await SecureStore.getItemAsync('user');
                const user = userStr ? JSON.parse(userStr) : null;

                const isPublicRoute = segments.length === 0 || segments[0] === 'login' || segments[0] === 'register';

                console.log("🔍 Check Auth -> Token:", !!token, "| Segment:", segments[0]);

                if (token) {
                    const hasHousehold = user?.household_id || (user?.households && user.households.length > 0);

                    if (!hasHousehold && segments[0] !== 'householdSetup') {
                        router.replace('/householdSetup');
                    } else if (hasHousehold && isPublicRoute) {
                        router.replace('/(tabs)/home');
                    }
                } else if (!isPublicRoute) {
                    router.replace('/');
                }
            } catch (err) {
                console.error("Erreur auth: ", err);
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