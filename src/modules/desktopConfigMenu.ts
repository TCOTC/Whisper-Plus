import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import {
    flatMapMenuGroups,
    MenuConfigKey,
    MenuItemDef,
    CONFIG_MENU_GROUPS,
    PluginConfig,
    ConfigKey,
} from "../config";
import { SCHEME_MENU_DEFS, SchemeMenuDef } from "./schemeManager";
import { getHideToolbar, setHideToolbar, post } from "../api";
import { logging } from "../logger";
import { getCurrentTheme, getCurrentMode } from "./themeSwitch";
import { ThemeVersionManager } from "./themeVersionManager";

/** 思源设置开关：不写入插件配置，状态与思源保持一致 */
const SIYUAN_SETTING_HIDE_TOOLBAR = "hideToolbar";

/** 浅吟主题名（对应 theme.json 的 name） */
const WHISPER_THEME_NAME = "Whisper";

/** 思源内置默认主题名（禁用浅吟后恢复） */
const DEFAULT_THEME = { light: "daylight", dark: "midnight" } as const;

/** 顶栏按钮图标（lucide flower）；思源全局 svg { fill: currentColor } 会覆盖根 svg 的 fill 并继承给子元素，故子元素显式加 fill="none" */
const TOPBAR_BUTTON_ICON = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-flower-icon lucide-flower\"><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"none\"/><path d=\"M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5\" fill=\"none\"/><path d=\"M12 7.5V9\" fill=\"none\"/><path d=\"M7.5 12H9\" fill=\"none\"/><path d=\"M16.5 12H15\" fill=\"none\"/><path d=\"M12 16.5V15\" fill=\"none\"/><path d=\"m8 8 1.88 1.88\" fill=\"none\"/><path d=\"M14.12 9.88 16 8\" fill=\"none\"/><path d=\"m8 16 1.88-1.88\" fill=\"none\"/><path d=\"M14.12 14.12 16 16\" fill=\"none\"/></svg>";

/** 集市主题包结构（/api/bazaar/getBazaarTheme 返回） */
type BazaarTheme = {
    name: string;
    repoURL: string;
    repoHash: string;
};

function buildMenuSwitchInput(id: string, checked: boolean): string {
    return `<input class="b3-switch b3-switch--menu" id="${id}" type="checkbox"${checked ? " checked" : ""}>`;
}

function buildSchemeMenuItemHtml(def: SchemeMenuDef, config: PluginConfig, i18n: Record<string, string>): string {
    const current = config.get(def.key);
    const optionsHtml = def.options.map((option) => {
        const selected = current === option.value;
        return `<button type="button" class="b3-menu__item${selected ? " b3-menu__item--selected" : ""}" data-whisper-scheme-item="${def.key}" data-whisper-scheme-value="${option.value}">
            <span class="b3-menu__label">${i18n[option.labelKey] ?? option.labelKey}</span>
        </button>`;
    }).join("");

    return `<div class="b3-menu__item" data-whisper-scheme-submenu="${def.key}">
        <svg class="b3-menu__icon"><use xlink:href="#${def.icon}"></use></svg>
        <span class="b3-menu__label">${i18n[def.key] ?? def.key}</span>
        <svg class="b3-menu__icon b3-menu__icon--small"><use xlink:href="#iconRight"></use></svg>
        <div class="b3-menu__submenu"><div class="b3-menu__items">${optionsHtml}</div></div>
    </div>`;
}

function buildSchemeMenuHtml(config: PluginConfig, i18n: Record<string, string>): string {
    return SCHEME_MENU_DEFS.map((def) => buildSchemeMenuItemHtml(def, config, i18n)).join("");
}

function buildDesktopMenuItemHtml({ key, icon }: MenuItemDef, config: PluginConfig, i18n: Record<string, string>): string {
    return `<label class="b3-menu__item" data-whisper-config-item="${key}">
        <svg class="b3-menu__icon"><use xlink:href="#${icon}"></use></svg>
        <span class="fn__flex-center">${i18n[key] ?? key}</span>
        <span class="fn__space fn__flex-1"></span>
        ${buildMenuSwitchInput(key, config.get(key))}
    </label>`;
}

/** 顶栏融合：映射思源 appearance.hideToolbar，不参与插件配置持久化 */
function buildToolbarFusionMenuItemHtml(i18n: Record<string, string>): string {
    const id = "whisper_toolbar_fusion";
    return `<label class="b3-menu__item" data-whisper-siyuan-setting="${SIYUAN_SETTING_HIDE_TOOLBAR}">
        <svg class="b3-menu__icon"><use xlink:href="#iconLayout"></use></svg>
        <span class="fn__flex-center">${i18n.toolbar_fusion ?? "toolbar_fusion"}</span>
        <span class="fn__space fn__flex-1"></span>
        ${buildMenuSwitchInput(id, getHideToolbar())}
    </label>`;
}

/** 主题开关：使用/禁用浅吟主题（修改当前外观模式的主题） */
function buildThemeToggleMenuItemHtml(i18n: Record<string, string>, whisperActive: boolean): string {
    const label = whisperActive
        ? (i18n.disable_whisper_theme ?? "disable_whisper_theme")
        : (i18n.enable_whisper_theme ?? "enable_whisper_theme");
    const icon = whisperActive ? "iconClose" : "iconTheme";
    return `<button type="button" class="b3-menu__item" data-whisper-theme-toggle>
        <svg class="b3-menu__icon"><use xlink:href="#${icon}"></use></svg>
        <span class="b3-menu__label">${label}</span>
    </button>`;
}

function buildDesktopMenuHtml(config: PluginConfig, i18n: Record<string, string>, whisperActive: boolean): string {
    const separator = '<div class="b3-menu__separator" data-whisper-config-separator></div>';
    const schemeItems = buildSchemeMenuHtml(config, i18n);
    const switchItems = flatMapMenuGroups(CONFIG_MENU_GROUPS, {
        separator: () => separator,
        item: (item) => buildDesktopMenuItemHtml(item, config, i18n),
    }).join("");

    // 主题开关放在菜单开头，顶栏融合放在开关列表第一位
    return `${buildThemeToggleMenuItemHtml(i18n, whisperActive)}${separator}${schemeItems}${separator}${buildToolbarFusionMenuItemHtml(i18n)}${switchItems}`;
}

/** 桌面端顶栏配置按钮：始终显示，点击弹出配置菜单 */
export class DesktopConfigMenu {
    private topBarButton: HTMLElement | null = null;
    private menu: Menu | null = null;
    private readonly themeVersionManager: ThemeVersionManager;

    constructor(
        private readonly plugin: Plugin,
        private readonly config: PluginConfig,
    ) {
        this.themeVersionManager = new ThemeVersionManager(plugin);
    }

    init(): void {
        this.topBarButton = this.plugin.addTopBar({
            icon: TOPBAR_BUTTON_ICON,
            title: this.plugin.i18n.whisper_theme_menu ?? WHISPER_THEME_NAME,
            callback: (event) => this.openConfigMenu(event),
        });
    }

    destroy(): void {
        this.topBarButton?.remove();
        this.topBarButton = null;

        this.menu?.close();
        this.menu = null;
    }

    private isWhisperTheme(): boolean {
        return getCurrentTheme() === WHISPER_THEME_NAME;
    }

    /** 浅吟主题是否已安装（明亮或暗黑列表任一包含） */
    private isWhisperThemeInstalled(): boolean {
        const appearance = window.siyuan.config?.appearance;
        return !!appearance?.lightThemes?.some((theme) => theme.name === WHISPER_THEME_NAME) ||
            !!appearance?.darkThemes?.some((theme) => theme.name === WHISPER_THEME_NAME);
    }

    /** 打开配置菜单（主题开关、配色方案、特性开关、顶栏融合）；菜单已打开时点击按钮关闭 */
    private openConfigMenu(event: MouseEvent): void {
        // 菜单已打开时点击按钮关闭（关闭后 closeCB 会将 this.menu 置空）
        if (this.menu) {
            this.menu.close();
            return;
        }

        // 复用全局 commonMenu（插件 API Menu 的默认行为，与其他顶栏按钮菜单一致）
        const menu = new Menu("whisper-config-menu", () => {
            this.menu = null;
        });

        // 追加到 .b3-menu__items 容器：Menu 构造时思源已清空该容器（removeImmediately），
        // 关闭菜单时也会清空，因此每次打开都是干净菜单
        const menuItems = menu.element.lastElementChild;
        const template = document.createElement("template");
        template.innerHTML = buildDesktopMenuHtml(this.config, this.plugin.i18n, this.isWhisperTheme());
        Array.from(template.content.children).forEach((child) => {
            menuItems?.appendChild(child);
        });

        menu.element.addEventListener("change", this.handleSwitchChange, true);
        menu.element.addEventListener("click", this.handleSchemeClick, true);
        menu.element.addEventListener("click", this.handleThemeToggleClick, true);
        this.menu = menu;

        const button = event.currentTarget as HTMLElement;
        const rect = button.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom });
    }

    /** 使用/禁用浅吟主题：修改当前外观模式的主题，未安装时先从集市安装 */
    private handleThemeToggleClick = (event: MouseEvent): void => {
        const toggle = event.target instanceof Element ? event.target.closest("[data-whisper-theme-toggle]") : null;
        if (!toggle) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        void this.toggleTheme();
    };

    private async toggleTheme(): Promise<void> {
        if (this.isWhisperTheme()) {
            // 禁用：当前外观模式恢复为思源默认主题
            const mode = getCurrentMode();
            await this.setCurrentModeTheme(DEFAULT_THEME[mode]);
        } else {
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

        this.menu?.close();
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

    private handleSwitchChange = (event: Event): void => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || !input.classList.contains("b3-switch")) {
            return;
        }

        const siyuanSetting = input.closest("[data-whisper-siyuan-setting]")?.getAttribute("data-whisper-siyuan-setting");
        if (siyuanSetting === SIYUAN_SETTING_HIDE_TOOLBAR) {
            void setHideToolbar(input.checked).then((result) => {
                if (result.code !== 0) {
                    logging.error(`Failed to set hideToolbar: ${result.msg}`);
                    return;
                }
                if (result.data) {
                    input.checked = result.data.hideToolbar;
                }
            });
            event.stopPropagation();
            return;
        }

        const key = input.closest("[data-whisper-config-item]")?.getAttribute("data-whisper-config-item");
        if (!key) {
            return;
        }

        this.config.set(key as MenuConfigKey, input.checked);
        event.stopPropagation();
    };

    private handleSchemeClick = (event: MouseEvent): void => {
        const button = event.target instanceof Element
            ? event.target.closest("[data-whisper-scheme-value]")
            : null;
        const key = button?.getAttribute("data-whisper-scheme-item");
        if (button && key) {
            this.config.set(key as ConfigKey, button.getAttribute("data-whisper-scheme-value") ?? "");
            button.closest(".b3-menu__submenu")?.querySelectorAll("[data-whisper-scheme-value]").forEach((item) => {
                item.classList.toggle("b3-menu__item--selected", item === button);
            });
            event.preventDefault();
            event.stopPropagation();
        }
    };
}
