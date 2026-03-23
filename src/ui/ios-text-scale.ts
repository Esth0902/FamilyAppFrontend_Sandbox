import { Dimensions, PixelRatio, Platform, StyleSheet } from "react-native";

const IOS_VIEWPORT_MIN_WIDTH = 320;
const IOS_VIEWPORT_MAX_WIDTH = 430;
const IOS_TEXT_MIN_SCALE = 1.06;
const IOS_TEXT_MAX_SCALE = 1.15;

let isInstalled = false;

const clamp = (value: number, min: number, max: number): number => {
    return Math.min(Math.max(value, min), max);
};

const getIosTextScale = (): number => {
    const viewportWidth = Dimensions.get("window").width;
    const normalizedWidth = clamp(
        (viewportWidth - IOS_VIEWPORT_MIN_WIDTH) / (IOS_VIEWPORT_MAX_WIDTH - IOS_VIEWPORT_MIN_WIDTH),
        0,
        1
    );

    return IOS_TEXT_MIN_SCALE + (IOS_TEXT_MAX_SCALE - IOS_TEXT_MIN_SCALE) * normalizedWidth;
};

const scaleTextValue = (value: unknown): unknown => {
    if (Platform.OS !== "ios") {
        return value;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        return value;
    }

    return PixelRatio.roundToNearestPixel(value * getIosTextScale());
};

export const installIosTextScale = (): void => {
    if (isInstalled || Platform.OS !== "ios") {
        return;
    }

    StyleSheet.setStyleAttributePreprocessor("fontSize", scaleTextValue);
    StyleSheet.setStyleAttributePreprocessor("lineHeight", scaleTextValue);

    isInstalled = true;
};

