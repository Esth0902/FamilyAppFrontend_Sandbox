import { Platform } from 'react-native';

const palette = {
    midnightBlue: '#2C3E50',
    cloudWhite: '#F4F6F7',
    pureWhite: '#FFFFFF',
    steelGrey: '#5D6D7E',
    softCoral: '#FFAB91',
    sageTeal: '#80CBC4',
    darkBg: '#1A202C',
    darkCard: '#2D3748',
    darkText: '#ECEDEE',
};

const tintColorLight = palette.midnightBlue;
const tintColorDark = palette.sageTeal;

export const Colors = {
    light: {
        text: palette.midnightBlue,
        textSecondary: palette.steelGrey,
        background: palette.cloudWhite,
        card: palette.pureWhite,
        accentWarm: palette.softCoral,
        accentCool: palette.sageTeal,
        tint: tintColorLight,
        icon: palette.steelGrey,
        tabIconDefault: palette.steelGrey,
        tabIconSelected: tintColorLight,
    },
    dark: {
        text: palette.darkText,
        textSecondary: '#A0AEC0',
        background: palette.darkBg,
        card: palette.darkCard,
        accentWarm: '#E69A83',
        accentCool: '#629E99',
        tint: tintColorDark,
        icon: '#718096',
        tabIconDefault: '#718096',
        tabIconSelected: tintColorDark,
    },
};

export const Fonts = Platform.select({
    ios: {
        sans: 'system-ui',
        serif: 'ui-serif',
        rounded: 'ui-rounded',
        mono: 'ui-monospace',
    },
    default: {
        sans: 'normal',
        serif: 'serif',
        rounded: 'normal',
        mono: 'monospace',
    },
    web: {
        sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        serif: "Georgia, 'Times New Roman', serif",
        rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
        mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    },
});