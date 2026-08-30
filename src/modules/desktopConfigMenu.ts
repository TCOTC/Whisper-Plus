import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import { CONFIG_MENU_GROUPS, PluginConfig } from "../config";
import { buildConfigMenu } from "./menuBuilder";
import { ThemeManager } from "./themeManager";

/** 桌面端顶栏配置按钮：始终显示，点击弹出配置菜单 */
export class DesktopConfigMenu {
    private topBarButton: HTMLElement | null = null;
    private menu: Menu | null = null;

    constructor(
        private readonly plugin: Plugin,
        private readonly config: PluginConfig,
        private readonly themeManager: ThemeManager,
    ) {}

    init(): void {
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconWhisperFlower",
            title: this.plugin.i18n.whisper_theme_menu ?? "whisper_theme_menu",
            callback: (event) => this.openConfigMenu(event),
        });
    }

    destroy(): void {
        this.topBarButton?.remove();
        this.topBarButton = null;

        this.menu?.close();
        this.menu = null;
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

        buildConfigMenu(menu, {
            plugin: this.plugin,
            config: this.config,
            themeManager: this.themeManager,
            includeToolbarFusion: true,
            groups: CONFIG_MENU_GROUPS,
        });

        this.menu = menu;

        const button = event.currentTarget as HTMLElement;
        const rect = button.getBoundingClientRect();
        menu.open({ x: rect.left, y: rect.bottom });
    }
}
