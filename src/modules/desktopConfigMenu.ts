import type { IEventBusMap, Plugin } from "siyuan";
import {
    flatMapMenuGroups,
    MenuConfigKey,
    MenuItemDef,
    CONFIG_MENU_GROUPS,
    PluginConfig,
    ConfigKey,
} from "../config";
import { SCHEME_MENU_DEFS, SchemeMenuDef } from "./schemeManager";
import { getHideToolbar, setHideToolbar } from "../api";
import { logging } from "../logger";

/** 思源设置开关：不写入插件配置，状态与思源保持一致 */
const SIYUAN_SETTING_HIDE_TOOLBAR = "hideToolbar";

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

function buildDesktopMenuHtml(config: PluginConfig, i18n: Record<string, string>): string {
    const separator = '<div class="b3-menu__separator" data-whisper-config-separator></div>';
    const schemeItems = buildSchemeMenuHtml(config, i18n);
    const switchItems = flatMapMenuGroups(CONFIG_MENU_GROUPS, {
        separator: () => separator,
        item: (item) => buildDesktopMenuItemHtml(item, config, i18n),
    }).join("");

    // 顶栏融合放在开关列表第一位
    return `${separator}${schemeItems}${separator}${buildToolbarFusionMenuItemHtml(i18n)}${switchItems}`;
}

function removeInjectedMenuElements(): void {
    document.querySelectorAll("[data-whisper-config-separator]").forEach((element) => element.remove());
    document.querySelectorAll("[data-whisper-config-item]").forEach((element) => element.remove());
    document.querySelectorAll("[data-whisper-siyuan-setting]").forEach((element) => element.remove());
    document.querySelectorAll("[data-whisper-scheme-submenu]").forEach((element) => element.remove());
}

/** 桌面端 barmode 配置子菜单 */
export class DesktopConfigMenu {
    private commonMenu: HTMLElement | null = null;

    constructor(
        private readonly plugin: Plugin,
        private readonly config: PluginConfig,
    ) {}

    init(): void {
        this.plugin.eventBus.on("common-menu-open", this.onCommonMenuOpen);
        this.plugin.eventBus.on("common-menu-closed", this.onCommonMenuClosed);
    }

    destroy(): void {
        this.plugin.eventBus.off("common-menu-open", this.onCommonMenuOpen);
        this.plugin.eventBus.off("common-menu-closed", this.onCommonMenuClosed);
        this.unbindMenuListeners();
        removeInjectedMenuElements();
        this.commonMenu = null;
    }

    private unbindMenuListeners(): void {
        if (!this.commonMenu) {
            return;
        }
        this.commonMenu.removeEventListener("change", this.handleSwitchChange, true);
        this.commonMenu.removeEventListener("click", this.handleSchemeClick, true);
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

    private onCommonMenuOpen = (event: CustomEvent<IEventBusMap["common-menu-open"]>): void => {
        const { menu, name } = event.detail ?? {};
        if (!(menu instanceof HTMLElement)) {
            return;
        }

        this.unbindMenuListeners();
        this.commonMenu = menu;

        if (name !== "barmode") {
            return;
        }

        this.mountMenu();
        menu.addEventListener("change", this.handleSwitchChange, true);
        menu.addEventListener("click", this.handleSchemeClick, true);
    };

    private onCommonMenuClosed = (event: CustomEvent<IEventBusMap["common-menu-closed"]>): void => {
        const { menu } = event.detail ?? {};
        if (menu instanceof HTMLElement) {
            this.commonMenu = menu;
        }
        this.unbindMenuListeners();
    };

    private mountMenu(): void {
        if (!this.commonMenu || this.commonMenu.querySelector("[data-whisper-config-separator]")) {
            return;
        }

        const menuItems = this.commonMenu.querySelector(".b3-menu__items");
        if (!menuItems) {
            return;
        }

        menuItems.insertAdjacentHTML("beforeend", buildDesktopMenuHtml(this.config, this.plugin.i18n));
    }
}
