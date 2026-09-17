import type { Plugin } from "siyuan";
import { post } from "../api";
import { logging } from "../logger";
import { getCurrentMode, getCurrentTheme, WHISPER_THEME_NAME } from "./themeSwitch";
import { ThemeVersionManager } from "./themeVersionManager";

/** 思源内置默认主题名（禁用浅吟后恢复） */
const DEFAULT_THEME = { light: "daylight", dark: "midnight" } as const;

/** 集市主题包结构（/api/bazaar/getBazaarTheme 返回） */
type BazaarTheme = {
    name: string;
    repoURL: string;
    repoHash: string;
};

/**
 * 主题管理器：启用/禁用浅吟主题。
 * 统一供顶栏按钮菜单与命令面板使用。
 */
export class ThemeManager {
    private readonly themeVersionManager: ThemeVersionManager;

    constructor(private readonly plugin: Plugin) {
        this.themeVersionManager = new ThemeVersionManager(plugin);
    }

    /** 当前是否正在使用浅吟主题 */
    isWhisperTheme(): boolean {
        return getCurrentTheme() === WHISPER_THEME_NAME;
    }

    /** 浅吟主题是否已安装（明亮或暗黑列表任一包含） */
    isWhisperThemeInstalled(): boolean {
        const appearance = window.siyuan.config?.appearance;
        return !!appearance?.lightThemes?.some((theme) => theme.name === WHISPER_THEME_NAME) ||
            !!appearance?.darkThemes?.some((theme) => theme.name === WHISPER_THEME_NAME);
    }

    /** 切换使用/禁用浅吟主题：启用前校验版本并自动升级，未安装时先从集市安装 */
    async toggleTheme(): Promise<void> {
        if (this.isWhisperTheme()) {
            // 禁用：当前外观模式恢复为思源默认主题
            const mode = getCurrentMode();
            await this.setCurrentModeTheme(DEFAULT_THEME[mode]);
            return;
        }

        // 使用：未安装时先安装浅吟主题
        if (!this.isWhisperThemeInstalled()) {
            const installed = await this.installWhisperTheme();
            if (!installed) {
                return;
            }
        }
        // 启用前校验主题版本，不符合要求时升级；升级被取消或失败则不切换
        if (!await this.themeVersionManager.ensureReady()) {
            return;
        }
        await this.setCurrentModeTheme(WHISPER_THEME_NAME);
    }

    /** 设置当前外观模式使用的主题（明亮改 themeLight，暗黑改 themeDark） */
    private async setCurrentModeTheme(themeName: string): Promise<void> {
        const appearance = window.siyuan.config?.appearance;
        if (!appearance) {
            return;
        }

        const mode = getCurrentMode();
        const patch = mode === "light" ? { themeLight: themeName } : { themeDark: themeName };
        const result = await post("/api/setting/setAppearance", { ...appearance, ...patch });
        if (result.code !== 0) {
            logging.error(`Failed to set theme [${themeName}]: ${result.msg}`);
        }
    }

    /** 从集市安装浅吟主题（不传 mode/modeOS，安装后不自动切换主题） */
    private async installWhisperTheme(): Promise<boolean> {
        const bazaarResult = await post<{ packages: BazaarTheme[] }>("/api/bazaar/getBazaarTheme", {});
        if (bazaarResult.code !== 0) {
            logging.error(`Failed to get bazaar themes: ${bazaarResult.msg}`);
            return false;
        }

        const theme = bazaarResult.data?.packages?.find((pkg) => pkg.name === WHISPER_THEME_NAME);
        if (!theme?.repoURL || !theme.repoHash) {
            logging.error("Whisper theme is not available in the bazaar");
            return false;
        }

        const installResult = await post("/api/bazaar/installBazaarTheme", {
            repoURL: theme.repoURL,
            repoHash: theme.repoHash,
            packageName: WHISPER_THEME_NAME,
        });
        if (installResult.code !== 0) {
            logging.error(`Failed to install Whisper theme: ${installResult.msg}`);
            return false;
        }
        return true;
    }
}
