import { Plugin } from "siyuan";
import type zhCN from "./i18n/zh-CN.json";
import "./index.scss";

import { PluginConfig, CONFIG_FILE_NAME } from "./config";
import { SchemeManager } from "./modules/schemeManager";
import { FeaturesManager } from "./modules/featuresManager";
import { DebugHandler } from "./modules/debugHandler";
import { BlockFocusHandler } from "./modules/blockFocusHandler";
import { ElementStatusObserver } from "./modules/elementStatusObserver";
import { TooltipHandler } from "./modules/tooltipHandler";
import { MenuHandler } from "./modules/menuHandler";
import { DialogHandler } from "./modules/dialogHandler";
import { FileTreeClickHandler } from "./modules/fileTreeClickHandler";
import { DesktopConfigMenu } from "./modules/desktopConfigMenu";
import { MobileConfigMenu } from "./modules/mobileConfigMenu";
import { FoldedListItemHandler } from "./modules/foldedListItemHandler";
import { logging } from "./logger";
import { isMobile, isReadOnly } from "./utils";

/** 模块接口 */
interface ThemeModule {
    init?: () => void | Promise<void>;
    destroy?: () => void | Promise<void>;
}

export default class WhisperPlusPlugin extends Plugin {
    declare i18n: typeof zhCN;

    private config = new PluginConfig(this);
    private modules: ThemeModule[] = [];

    onload() {
        // 注册各功能模块（配置须先初始化）
        this.modules = [
            new SchemeManager(this, this.config),   // 配色方案：data-whisper-appearance / data-whisper-text
            new FeaturesManager(this.config),       // 样式特性：data-whisper-* 布尔开关
            new DebugHandler(this.config),          // 调试信息：按配置显示设备类型等消息
            new BlockFocusHandler(),                // 块焦点处理：给焦点所在块添加属性 data-whisper-block-focus
            new FoldedListItemHandler(this),        // 聚焦折叠的列表项时自动展开
        ];

        if (!isReadOnly()) {
            // 非只读模式
            if (isMobile()) {
                // 移动端
                this.modules.push(new MobileConfigMenu(this, this.config));  // 移动端配置菜单
            } else {
                this.modules.push(new DesktopConfigMenu(this, this.config)); // 桌面端配置菜单
                this.modules.push(new TooltipHandler(this));                 // 悬浮提示处理：通过事件总线给 tooltip 添加特定属性
                this.modules.push(new ElementStatusObserver());              // 元素状态观察：监听元素状态，通过给 html 添加属性来代替使用 :has 选择器
                this.modules.push(new FileTreeClickHandler());               // 文档树点击：点击空白处取消选中文档或笔记本
                this.modules.push(new DialogHandler());                      // 对话框处理：为搜索对话框(Dialog)添加 resize__move 类
                this.modules.push(new MenuHandler(this));                    // 菜单处理：外观模式菜单、页签菜单
            }
        }

        void this.initModules();
    }

    onLayoutReady() {
        logging.log("Layout ready");
    }

    onunload() {
        void this.destroyModules();
    }

    uninstall() {
        this.removeData(CONFIG_FILE_NAME).catch((e: unknown) => {
            const errorMessage = `${this.displayName}: failed to uninstall remove data [${CONFIG_FILE_NAME}]: ${e instanceof Error ? e.message : String(e)}`;
            console.error(errorMessage);
        });
    }

    /**
     * 初始化配置后按注册顺序初始化所有模块
     */
    private async initModules(): Promise<void> {
        await this.config.init();

        for (const instance of this.modules) {
            if (typeof instance.init === "function") {
                const result = instance.init();
                if (result instanceof Promise) {
                    await result;
                }
            }
        }

        logging.log("Loaded");
    }

    /**
     * 反向销毁所有模块
     */
    private async destroyModules(): Promise<void> {
        for (let i = this.modules.length - 1; i >= 0; i--) {
            const instance = this.modules[i];
            if (typeof instance.destroy === "function") {
                const result = instance.destroy();
                if (result instanceof Promise) {
                    await result;
                }
            }
        }
        this.modules = [];
        this.config.destroy();
        logging.log("Unloaded");
    }
}
