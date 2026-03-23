import { Alert, Platform, type AlertButton, type AlertOptions } from "react-native";

type AlertPayload = {
    title: string;
    message?: string;
    buttons: AlertButton[];
    options?: AlertOptions;
};

type AlertListener = (payload: AlertPayload) => void;

const listeners = new Set<AlertListener>();
const defaultButton: AlertButton = { text: "OK" };
const originalAlert = Alert.alert.bind(Alert);
let isInstalled = false;

const normalizeButtons = (buttons?: AlertButton[]): AlertButton[] => {
    if (!Array.isArray(buttons) || buttons.length === 0) {
        return [defaultButton];
    }
    return buttons;
};

const notifyListeners = (payload: AlertPayload): boolean => {
    if (listeners.size === 0) {
        return false;
    }
    listeners.forEach((listener) => listener(payload));
    return true;
};

export const subscribeToAppAlerts = (listener: AlertListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const installAppAlertInterceptor = (): void => {
    if (isInstalled) {
        return;
    }
    isInstalled = true;

    Alert.alert = (title, message, buttons, options) => {
        if (Platform.OS !== "android") {
            originalAlert(title, message, buttons, options);
            return;
        }

        const hasRendered = notifyListeners({
            title: String(title ?? ""),
            message: typeof message === "string" ? message : undefined,
            buttons: normalizeButtons(buttons),
            options,
        });

        if (!hasRendered) {
            originalAlert(title, message, buttons, options);
        }
    };
};

