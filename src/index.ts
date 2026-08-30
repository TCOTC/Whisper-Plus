import { Plugin } from "siyuan";
import type zhCN from "./i18n/zh-CN.json";

import { PluginConfig, CONFIG_FILE_NAME } from "./config";
import { WHISPER_FLOWER_SYMBOL } from "./icons";
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
import { CommandManager } from "./modules/commands";
import { ThemeManager } from "./modules/themeManager";
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
        // 注册全局图标（#iconWhisperFlower），供顶栏按钮与菜单引用
        this.addIcons(WHISPER_FLOWER_SYMBOL);

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
            // 主题管理：启用/禁用浅吟主题（顶栏按钮菜单与命令面板共用）
            const themeManager = new ThemeManager(this);
            if (isMobile()) {
                // 移动端
                this.modules.push(new MobileConfigMenu(this, this.config, themeManager));  // 移动端配置菜单
            } else {
                this.modules.push(new DesktopConfigMenu(this, this.config, themeManager)); // 桌面端顶栏配置按钮：始终显示，点击弹出配置菜单
                this.modules.push(new TooltipHandler(this));                 // 悬浮提示处理：通过事件总线给 tooltip 添加特定属性
                this.modules.push(new ElementStatusObserver());              // 元素状态观察：监听元素状态，通过给 html 添加属性来代替使用 :has 选择器
                this.modules.push(new FileTreeClickHandler());               // 文档树点击：点击空白处取消选中文档或笔记本
                this.modules.push(new DialogHandler());                      // 对话框处理：为搜索对话框(Dialog)添加 resize__move 类
                this.modules.push(new MenuHandler(this));                    // 菜单处理：外观模式菜单、页签菜单
            }
            // 命令面板命令：切换主题、切换特性开关、切换到特定配色
            this.modules.push(new CommandManager(this, this.config, themeManager));
        }

        void this.initModules();
    }

    /**
     * 插件数据变更时触发：从磁盘重新加载配置并更新状态。
     *
     * 思源检测到插件数据目录（data/storage/petal/）文件变化后调用本方法（含本插件自身的保存）；
     * 值发生变化的配置键会通过 PluginConfig 的变更监听通知各模块自动重放状态，无需重建模块。
     */
    async onDataChanged(): Promise<void> {
        await this.config.reload();
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
