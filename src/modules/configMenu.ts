import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import { CONFIG_MENU_GROUPS, CONFIG_MOBILE_MENU_GROUPS, PluginConfig } from "../config";
import { isMobile } from "../utils";
import { buildConfigMenu } from "./menuBuilder";
import { ThemeManager } from "./themeManager";

/**
 * 顶栏配置菜单：桌面端为按钮弹出的 popup 菜单（含顶栏融合开关），
 * 移动端渲染于全局菜单「扩展」分组并全屏底部弹出；菜单已打开时再次点击按钮关闭。
 * 打开方式与菜单项按设备类型（isMobile）自动选择。
 */
export class ConfigMenu {
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

    /** 打开配置菜单（菜单已打开时点击按钮关闭） */
    private openConfigMenu(event?: MouseEvent): void {
        // 菜单已打开时点击按钮关闭（关闭后 closeCB 会将 this.menu 置空）
        if (this.menu) {
            this.menu.close();
            return;
        }

        // 复用全局 commonMenu（插件 API Menu 的默认行为，与其他顶栏按钮菜单一致）
        const menu = new Menu("whisper-config-menu", () => {
            this.menu = null;
        });

        // 移动端底部 sheet，桌面端 popup 菜单（顶栏融合仅桌面端有意义）
        const mobile = isMobile();
        buildConfigMenu(menu, {
            plugin: this.plugin,
            config: this.config,
            themeManager: this.themeManager,
            includeToolbarFusion: !mobile,
            groups: mobile ? CONFIG_MOBILE_MENU_GROUPS : CONFIG_MENU_GROUPS,
        });

        this.menu = menu;

        if (mobile) {
            menu.fullscreen("bottom");
        } else if (event) {
            const button = event.currentTarget as HTMLElement;
            const rect = button.getBoundingClientRect();
            menu.open({ x: rect.left, y: rect.bottom });
        }
    }
}
