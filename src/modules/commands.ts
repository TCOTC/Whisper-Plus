import type { Plugin } from "siyuan";
import { CONFIG_FEATURE_MENU_ITEMS, PluginConfig } from "../config";
import { SCHEME_MENU_DEFS } from "./schemeManager";
import { ThemeManager } from "./themeManager";

/**
 * 命令面板命令：切换主题、切换样式特性、切换到特定配色方案。
 * 注册后可在命令面板中调用，并可在「设置 - 快捷键」中自定义快捷键。
 */
export class CommandManager {
    constructor(
        private readonly plugin: Plugin,
        private readonly config: PluginConfig,
        private readonly themeManager: ThemeManager,
    ) {}

    init(): void {
        // 使用/禁用浅吟主题
        this.plugin.addCommand({
            langKey: "cmd_toggle_theme",
            hotkey: "⌥⇧W",
            callback: () => {
                void this.themeManager.toggleTheme();
            },
        });

        // 样式特性开关
        for (const item of CONFIG_FEATURE_MENU_ITEMS) {
            this.plugin.addCommand({
                langKey: `cmd_toggle_${item.key}`,
                callback: () => {
                    this.config.set(item.key, !this.config.get(item.key));
                },
            });
        }

        // 切换到特定配色方案
        for (const def of SCHEME_MENU_DEFS) {
            for (const option of def.options) {
                this.plugin.addCommand({
                    langKey: `cmd_scheme_${def.key}_${option.value}`,
                    callback: () => {
                        this.config.set(def.key, option.value);
                    },
                });
            }
        }
    }

    destroy(): void {
        // 命令由思源在插件卸载时统一移除，无需手动清理
    }
}
