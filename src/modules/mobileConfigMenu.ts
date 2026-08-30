import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import { CONFIG_MOBILE_MENU_GROUPS, PluginConfig } from "../config";
import { buildConfigMenu } from "./menuBuilder";
import { ThemeManager } from "./themeManager";

/** 移动端配置菜单：顶栏入口（渲染于全局菜单「扩展」分组），点击弹出底部 sheet */
export class MobileConfigMenu {
    private topBarButton: HTMLElement | null = null;
    private menu: Menu | null = null;

    constructor(
        private readonly plugin: Plugin,
        private readonly config: PluginConfig,
        private readonly themeManager: ThemeManager,
    ) {}

    init(): void {
        // 与桌面端统一使用 addTopBar 注册入口；移动端该按钮渲染在全局菜单「扩展」分组
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconWhisperFlower",
            title: this.plugin.i18n.whisper_theme_menu ?? "whisper_theme_menu",
            callback: () => this.openConfigMenu(),
        });
    }

    destroy(): void {
        this.topBarButton?.remove();
        this.topBarButton = null;

        this.menu?.close();
        this.menu = null;
    }

    /** 打开配置菜单（底部 sheet）；菜单已打开时再次点击关闭 */
    private openConfigMenu(): void {
        if (this.menu) {
            this.menu.close();
            return;
        }

        const menu = new Menu("whisper-config-menu", () => {
            this.menu = null;
        });

        buildConfigMenu(menu, {
            plugin: this.plugin,
            config: this.config,
            themeManager: this.themeManager,
            includeToolbarFusion: false,
            groups: CONFIG_MOBILE_MENU_GROUPS,
        });

        this.menu = menu;
        menu.fullscreen("bottom");
    }
}
