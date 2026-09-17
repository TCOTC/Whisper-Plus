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
import { ConfigMenu } from "./modules/configMenu";
import { CommandManager } from "./modules/commands";
import { ThemeManager } from "./modules/themeManager";
import { getThemeState, subscribeThemeState } from "./modules/themeState";
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
    /** 常驻模块：与当前是否使用浅吟主题无关（主题的启用入口必须始终可用） */
    private modules: ThemeModule[] = [];
    /** 主题配套模块：仅在当前外观模式使用浅吟主题时运行 */
    private themeModules: ThemeModule[] = [];
    private themeModulesActive = false;
    /** 待处理的最新目标状态；null 表示无排队请求（快速切换时中间态被覆盖，只保留最后一次） */
    private pendingThemeActive: boolean | null = null;
    /** 是否正在执行启停循环 */
    private themeModulesSyncing = false;
    /** 当前或最后一次启停循环的完成信号，同一时刻至多存在一个循环 */
    private themeModulesSyncingPromise: Promise<void> = Promise.resolve();
    private unsubscribeThemeState: (() => void) | null = null;

    onload() {
        // 注册全局图标（#iconWhisperFlower），供顶栏按钮与菜单引用
        this.addIcons(WHISPER_FLOWER_SYMBOL);

        // 注册常驻模块与主题配套模块（配置须先初始化）
        this.modules = [
            new DebugHandler(this.config),   // 调试信息：按配置显示设备类型等消息
        ];

        // 主题配套模块：写入供主题 SCSS 消费的属性，或提供依赖主题样式的交互，仅在当前模式使用浅吟主题时运行
        this.themeModules = [
            new SchemeManager(this, this.config),   // 配色方案：data-whisper-appearance / data-whisper-text
            new FeaturesManager(this.config),       // 样式特性：data-whisper-* 布尔开关
            new BlockFocusHandler(),                // 块焦点处理：给焦点所在块添加属性 data-whisper-block-focus
        ];

        if (!isReadOnly()) {
            // 非只读模式
            // 主题管理：启用/禁用浅吟主题（顶栏按钮菜单与命令面板共用）
            const themeManager = new ThemeManager(this);
            // 顶栏配置菜单：内部按设备类型（isMobile）决定 popup 菜单或底部 sheet
            this.modules.push(new ConfigMenu(this, this.config, themeManager));
            if (!isMobile()) {
                // 以下仅桌面端生效
                this.themeModules.push(new TooltipHandler(this));    // 悬浮提示处理：通过事件总线给 tooltip 添加特定属性
                this.themeModules.push(new ElementStatusObserver()); // 元素状态观察：监听元素状态，通过给 html 添加属性来代替使用 :has 选择器
                this.themeModules.push(new FileTreeClickHandler());  // 文档树点击：点击空白处取消选中文档或笔记本
                this.themeModules.push(new DialogHandler());         // 对话框处理：为搜索对话框(Dialog)添加 resize__move 类
                this.themeModules.push(new MenuHandler(this));       // 菜单处理：外观模式菜单、页签菜单
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
     * 初始化配置、常驻模块与主题配套模块
     */
    private async initModules(): Promise<void> {
        await this.config.init();

        for (const instance of this.modules) {
            await this.runModule(instance, "init");
        }

        // 思源切换主题或外观模式时不重载插件，需要自行观察并启停主题配套模块
        this.unsubscribeThemeState = subscribeThemeState((state) => this.requestThemeModulesSync(state.isWhisper));
        this.requestThemeModulesSync(getThemeState().isWhisper);
        await this.themeModulesSyncingPromise;

        logging.log("Loaded");
    }

    /**
     * 按主题启用状态启停主题配套模块：启用时按注册顺序 init，停止时反向 destroy
     */
    private async applyThemeModulesActive(active: boolean): Promise<void> {
        if (this.themeModulesActive === active) {
            return;
        }
        this.themeModulesActive = active;

        if (active) {
            for (const instance of this.themeModules) {
                await this.runModule(instance, "init");
            }
            return;
        }
        for (let i = this.themeModules.length - 1; i >= 0; i--) {
            await this.runModule(this.themeModules[i], "destroy");
        }
    }

    /**
     * 登记并串行执行主题启停。
     *
     * 快速切换主题时后到的请求只覆盖待处理状态，当前一轮结束后按最新状态再执行一次，
     * 因此最多多跑一轮，不会按切换次数堆积完整启停
     */
    private requestThemeModulesSync(active: boolean): void {
        this.pendingThemeActive = active;
        if (this.themeModulesSyncing) {
            return;
        }
        this.themeModulesSyncing = true;
        this.themeModulesSyncingPromise = this.flushThemeModulesSync();
    }

    /** 依次处理待处理状态，直到没有排队请求 */
    private async flushThemeModulesSync(): Promise<void> {
        try {
            while (this.pendingThemeActive !== null) {
                const active = this.pendingThemeActive;
                this.pendingThemeActive = null;
                await this.applyThemeModulesActive(active);
            }
        } catch (error) {
            logging.error("Failed to sync theme modules", error);
        } finally {
            this.themeModulesSyncing = false;
        }
    }

    /** 调用模块的 init 或 destroy（支持同步与异步） */
    private async runModule(instance: ThemeModule, method: "init" | "destroy"): Promise<void> {
        const fn = instance[method];
        if (typeof fn !== "function") {
            return;
        }
        const result = fn.call(instance);
        if (result instanceof Promise) {
            await result;
        }
    }

    /**
     * 停止观察主题，反向销毁所有模块
     */
    private async destroyModules(): Promise<void> {
        this.unsubscribeThemeState?.();
        this.unsubscribeThemeState = null;
        // 丢弃未处理的启停请求，再等待正在执行的一轮结束，避免与 destroy 交错
        this.pendingThemeActive = null;
        await this.themeModulesSyncingPromise;

        if (this.themeModulesActive) {
            this.themeModulesActive = false;
            for (let i = this.themeModules.length - 1; i >= 0; i--) {
                await this.runModule(this.themeModules[i], "destroy");
            }
        }
        this.themeModules = [];

        for (let i = this.modules.length - 1; i >= 0; i--) {
            await this.runModule(this.modules[i], "destroy");
        }
        this.modules = [];
        this.config.destroy();
        logging.log("Unloaded");
    }
}
