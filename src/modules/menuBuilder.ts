import type { Menu, Plugin } from "siyuan";
import { getHideToolbar, setHideToolbar } from "../api";
import { MenuItemDef, PluginConfig } from "../config";
import { SCHEME_MENU_DEFS } from "./schemeManager";
import { ThemeManager } from "./themeManager";

/**
 * 构建浅吟主题配置菜单（桌面端顶栏按钮菜单与移动端底部 sheet 共用）。
 * 全部通过插件 API Menu.addItem / addSeparator 构建，不手写 HTML。
 */
export function buildConfigMenu(menu: Menu, options: {
    plugin: Plugin;
    config: PluginConfig;
    themeManager: ThemeManager;
    /** 是否包含「顶栏融合」开关（仅桌面端有意义） */
    includeToolbarFusion: boolean;
    /** 特性开关分组（桌面端与移动端可配置项不同） */
    groups: readonly MenuItemDef[][];
}): void {
    const { plugin, config, themeManager, includeToolbarFusion, groups } = options;
    const i18n = plugin.i18n;
    const whisperActive = themeManager.isWhisperTheme();

    // 使用/禁用浅吟主题
    menu.addItem({
        id: "whisper-theme-toggle",
        icon: whisperActive ? "iconClose" : "iconTheme",
        label: i18n[whisperActive ? "disable_whisper_theme" : "enable_whisper_theme"] ?? (whisperActive ? "disable_whisper_theme" : "enable_whisper_theme"),
        click: () => {
            void themeManager.toggleTheme();
        },
    });
    menu.addSeparator();

    // 配色方案（子菜单）
    for (const def of SCHEME_MENU_DEFS) {
        menu.addItem({
            icon: def.icon,
            label: i18n[def.key] ?? def.key,
            type: "submenu",
            submenu: def.options.map((option) => {
                const selected = config.get(def.key) === option.value;
                return {
                    iconHTML: "",
                    label: i18n[option.labelKey] ?? option.labelKey,
                    checked: selected,
                    current: selected,
                    click: () => {
                        config.set(def.key, option.value);
                    },
                };
            }),
        });
    }

    if (includeToolbarFusion) {
        menu.addSeparator();
        // 顶栏融合：映射思源 appearance.hideToolbar，不参与插件配置持久化
        menu.addItem({
            id: "whisper-toolbar-fusion",
            icon: "iconLayout",
            label: i18n.toolbar_fusion ?? "toolbar_fusion",
            checked: getHideToolbar(),
            click: () => {
                void setHideToolbar(!getHideToolbar());
            },
        });
    }

    // 样式特性开关（分组间以分隔线隔开）
    menu.addSeparator();
    groups.forEach((group, index) => {
        if (index > 0) {
            menu.addSeparator();
        }
        for (const item of group) {
            menu.addItem({
                icon: item.icon,
                label: i18n[item.key] ?? item.key,
                checked: config.get(item.key) as boolean,
                click: () => {
                    config.set(item.key, !config.get(item.key));
                },
            });
        }
    });
}
