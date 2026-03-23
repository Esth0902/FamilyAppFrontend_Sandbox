import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { subscribeToAppAlerts } from "@/src/utils/app-alert";

type AlertButton = {
    text?: string;
    style?: "default" | "cancel" | "destructive";
    onPress?: (() => void) | undefined;
};

type AlertPayload = {
    title: string;
    message?: string;
    buttons: AlertButton[];
    options?: {
        cancelable?: boolean;
        onDismiss?: (() => void) | undefined;
    };
};

export function AppAlertHost() {
    const colorScheme = useColorScheme();
    const theme = Colors[colorScheme ?? "light"];
    const [queue, setQueue] = useState<AlertPayload[]>([]);
    const [current, setCurrent] = useState<AlertPayload | null>(null);

    useEffect(() => {
        return subscribeToAppAlerts((payload) => {
            const normalized: AlertPayload = {
                ...payload,
                buttons: Array.isArray(payload.buttons) && payload.buttons.length > 0
                    ? payload.buttons
                    : [{ text: "OK" }],
            };

            setQueue((prev) => [...prev, normalized]);
        });
    }, []);

    useEffect(() => {
        if (current || queue.length === 0) {
            return;
        }

        setCurrent(queue[0]);
        setQueue((prev) => prev.slice(1));
    }, [current, queue]);

    const buttonLayout = useMemo(
        () => (current?.buttons.length ?? 0) > 2 ? "column" : "row",
        [current?.buttons.length]
    );

    const closeAlert = (invokeDismiss: boolean) => {
        const previous = current;
        setCurrent(null);
        if (invokeDismiss) {
            previous?.options?.onDismiss?.();
        }
    };

    const handleBackdropPress = () => {
        if (!current?.options?.cancelable) {
            return;
        }
        closeAlert(true);
    };

    const handleRequestClose = () => {
        if (!current?.options?.cancelable) {
            return;
        }
        closeAlert(true);
    };

    const handleButtonPress = (button: AlertButton) => {
        closeAlert(false);
        button.onPress?.();
    };

    return (
        <Modal
            animationType="fade"
            transparent
            visible={current !== null}
            onRequestClose={handleRequestClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={handleBackdropPress} />
                <View style={[styles.dialog, { backgroundColor: theme.card, borderColor: theme.icon }]}>
                    <Text style={[styles.title, { color: theme.text }]}>
                        {current?.title || "Information"}
                    </Text>
                    {current?.message ? (
                        <Text style={[styles.message, { color: theme.textSecondary }]}>{current.message}</Text>
                    ) : null}
                    <View
                        style={[
                            styles.buttonsWrap,
                            buttonLayout === "row" ? styles.buttonsRow : styles.buttonsColumn,
                        ]}
                    >
                        {current?.buttons.map((button, index) => {
                            const isDestructive = button.style === "destructive";
                            const isCancel = button.style === "cancel";
                            return (
                                <Pressable
                                    key={`${button.text ?? "ok"}-${index}`}
                                    style={[
                                        styles.button,
                                        buttonLayout === "row" && styles.buttonRow,
                                        isCancel
                                            ? { borderColor: theme.icon, backgroundColor: theme.background }
                                            : { borderColor: theme.tint, backgroundColor: `${theme.tint}16` },
                                    ]}
                                    onPress={() => handleButtonPress(button)}
                                >
                                    <Text
                                        style={[
                                            styles.buttonText,
                                            isCancel
                                                ? { color: theme.text }
                                                : isDestructive
                                                    ? { color: "#C62828" }
                                                    : { color: theme.tint },
                                        ]}
                                    >
                                        {button.text || "OK"}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 20,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.45)",
    },
    dialog: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 16,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 14,
        gap: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: "700",
    },
    message: {
        fontSize: 14,
        lineHeight: 20,
    },
    buttonsWrap: {
        marginTop: 6,
        gap: 8,
    },
    buttonsRow: {
        flexDirection: "row",
    },
    buttonsColumn: {
        flexDirection: "column",
    },
    button: {
        minHeight: 40,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 12,
    },
    buttonRow: {
        flex: 1,
    },
    buttonText: {
        fontSize: 14,
        fontWeight: "700",
    },
});

