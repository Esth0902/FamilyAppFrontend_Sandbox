const toTrimmedValue = (value: string | undefined): string | null => {
    if (!value) {
        return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const apiMode = toTrimmedValue(process.env.EXPO_PUBLIC_API_MODE)?.toLowerCase();

const resolveModeValue = (
    localValue: string | undefined,
    onlineValue: string | undefined,
    defaultValue: string | undefined
): string | null => {
    const local = toTrimmedValue(localValue);
    const online = toTrimmedValue(onlineValue);
    const fallback = toTrimmedValue(defaultValue);

    if (apiMode === "local") {
        return local ?? fallback;
    }

    if (apiMode === "online") {
        return online ?? fallback;
    }

    return fallback ?? local ?? online;
};

export const resolvePublicApiUrl = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_API_URL_LOCAL,
        process.env.EXPO_PUBLIC_API_URL_ONLINE,
        process.env.EXPO_PUBLIC_API_URL
    );

export const resolvePublicReverbHost = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_REVERB_HOST_LOCAL,
        process.env.EXPO_PUBLIC_REVERB_HOST_ONLINE,
        process.env.EXPO_PUBLIC_REVERB_HOST
    );

export const resolvePublicReverbPort = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_REVERB_PORT_LOCAL,
        process.env.EXPO_PUBLIC_REVERB_PORT_ONLINE,
        process.env.EXPO_PUBLIC_REVERB_PORT
    );

export const resolvePublicReverbScheme = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_REVERB_SCHEME_LOCAL,
        process.env.EXPO_PUBLIC_REVERB_SCHEME_ONLINE,
        process.env.EXPO_PUBLIC_REVERB_SCHEME
    );

export const resolvePublicReverbKey = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_REVERB_KEY_LOCAL,
        process.env.EXPO_PUBLIC_REVERB_KEY_ONLINE,
        process.env.EXPO_PUBLIC_REVERB_KEY
    );

export const resolvePublicPusherCluster = (): string | null =>
    resolveModeValue(
        process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER_LOCAL,
        process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER_ONLINE,
        process.env.EXPO_PUBLIC_PUSHER_APP_CLUSTER
    );

