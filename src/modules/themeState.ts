import { getAppearance, WHISPER_THEME_NAME } from "./themeSwitch";

/** 思源加载外观资源时会重写的 html 属性（app/src/util/assets.ts loadAssets） */
const WATCHED_ATTRIBUTES = ["data-theme-mode", "data-light-theme", "data-dark-theme"];

/** 当前外观状态 */
export interface IThemeState {
    /** 当前外观模式 */
    mode: "light" | "dark";
    /** 当前模式使用的主题包名 */
    theme: string;
    /** 当前模式是否正在使用浅吟主题 */
    isWhisper: boolean;
}

export const getThemeState = (): IThemeState => {
    const { isLight, lightTheme, darkTheme } = getAppearance();
    const theme = isLight ? lightTheme : darkTheme;
    return {
        mode: isLight ? "light" : "dark",
        theme,
        isWhisper: theme === WHISPER_THEME_NAME,
    };
};

export type ThemeStateListener = (state: IThemeState) => void;

const listeners = new Set<ThemeStateListener>();
let observer: MutationObserver | null = null;
let currentState: IThemeState | null = null;

const handleAttributeChanged = () => {
    const state = getThemeState();
    if (currentState && state.mode === currentState.mode && state.theme === currentState.theme) {
        return;
    }
    currentState = state;
    listeners.forEach((listener) => listener(state));
};

/**
 * 订阅外观状态变化（当前模式的主题或外观模式改变时回调）。
 *
 * 思源切换主题或外观模式既不发事件总线事件，也不重载插件，只能观察 loadAssets 写入 html 的上述属性；
 * 三个属性在同一轮内被连续改写，MutationObserver 的回调合并为一次，因此每次切换只通知一次。
 * 首个订阅者建立观察，最后一个订阅者取消观察。
 */
export const subscribeThemeState = (listener: ThemeStateListener): (() => void) => {
    listeners.add(listener);
    if (!observer) {
        currentState = getThemeState();
        observer = new MutationObserver(handleAttributeChanged);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: WATCHED_ATTRIBUTES,
        });
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            observer?.disconnect();
            observer = null;
            currentState = null;
        }
    };
};
