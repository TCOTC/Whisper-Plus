import { PluginConfig } from "../config";
import { logging } from "../logger";
import { getFile } from "../api";

const CHECK_INTERVAL = 1000 * 60;                   // 定时检查间隔：1 分钟
const SEND_INTERVAL = 1000 * 60 * 30;               // 发送间隔：30 分钟
const FIRST_INSTALL_GRACE_MS = 24 * 60 * 60 * 1000; // 首次安装保护期：1 天

// 扩展 Window 接口以包含 Google Analytics 相关属性
declare global {
    interface Window {
        dataLayer: unknown[] | undefined;
        whisper_plus_gtag: ((...args: unknown[]) => void) | undefined;
    }
}

/**
 * Google Analytics 模块：发送统计信息
 */
export class GoogleAnalytics {
    private scriptId = "whisper-plus-analytics";
    private gaId = "G-ZY75BR723S";
    private themeVersion = window.siyuan.config?.appearance?.themeVer;
    private lastSentTimestamp = 0;
    private dateISO = "";
    private checkIntervalId: number | null = null;
    private readonly onAnalyticsEnableChange = (enabled: boolean): void => {
        if (enabled) {
            void this.start();
        } else {
            this.stop();
        }
    };

    constructor(private readonly config: PluginConfig) {}

    private async fetchThemeVersion() {
        // 备用方案：从主题的 theme.json 获取主题版本号
        try {
            const content = await getFile("/conf/appearance/themes/Whisper/theme.json");
            if (typeof content === "string") {
                const data = JSON.parse(content);
                this.themeVersion = data.version;
                return;
            }
        } catch {
            logging.error("Failed to get theme version");
        }
        this.themeVersion = "unknown-version";
    }

    /**
     * 初始化 Google Analytics
     */
    init(): void {
        this.config.onConfigChanged("analytics_enable", this.onAnalyticsEnableChange);

        // 检查用户是否启用了 Google Analytics
        if (this.config.get("analytics_enable")) {
            void this.start();
        }
    }

    /**
     * 销毁 Google Analytics
     */
    destroy() {
        this.config.offConfigChanged("analytics_enable", this.onAnalyticsEnableChange);
        this.stop();
    }

    private async start(): Promise<void> {
        if (this.checkIntervalId !== null) {
            return;
        }

        // 插件启动时先发送一次数据
        await this.checkAndSend();
        // 设置定时检查，每 1 分钟检查一次是否满足发送条件
        this.checkIntervalId = window.setInterval(() => {
            this.checkAndSend().catch(err => {
                logging.error("Failed to check and send analytics data:", err);
            });
        }, CHECK_INTERVAL);
    }

    private stop(): void {
        // 清除定时器
        if (this.checkIntervalId !== null) {
            window.clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }

        // 移除 Google Analytics 脚本
        const script = document.getElementById(this.scriptId);
        if (script) {
            script.remove();
        }

        if (window.whisper_plus_gtag) {
            window.whisper_plus_gtag = undefined;
        }
    }

    private isWithinFirstInstallGrace(): boolean {
        const installTimestamp = this.config.get("install_timestamp");
        if (!installTimestamp) {
            return false;
        }
        return Date.now() - installTimestamp < FIRST_INSTALL_GRACE_MS;
    }

    /**
     * 检查时间并发送数据
     */
    private async checkAndSend() {
        if (!this.config.get("analytics_enable")) {
            return;
        }

        if (this.isWithinFirstInstallGrace()) {
            return; // 首次安装一天内不发送数据
        }

        const currentTimestamp = Date.now();

        // 获取今天的日期，格式为 YYYY-MM-DD
        this.dateISO = new Date().toISOString().split("T")[0];

        // 获取最后发送时间戳
        const lastSentTimestamp = this.config.get("analytics_last_sent_timestamp");

        // 如果距离上次发送时间不足 30 分钟，则不再发送
        if (currentTimestamp - lastSentTimestamp < SEND_INTERVAL) {
            return;
        }

        // 更新本地存储的时间戳
        this.lastSentTimestamp = currentTimestamp;
        this.config.set("analytics_last_sent_timestamp", this.lastSentTimestamp);

        // 加载 Google Analytics
        this.initGA();
    }

    /**
     * 加载 Google Analytics
     */
    private initGA() {
        // 检查是否已添加脚本，避免重复插入
        if (!document.getElementById(this.scriptId)) {
            // 创建 <script> 标签
            const script = document.createElement("script");
            script.id = this.scriptId;
            script.async = true;
            script.src = "https://www.googletagmanager.com/gtag/js?id=" + this.gaId;
            document.head.appendChild(script);
        }

        // 初始化 GA 配置（如果尚未初始化）
        if (!window.whisper_plus_gtag) {
            /* eslint-disable prefer-rest-params, @typescript-eslint/no-unused-vars */
            function gtag(..._args: unknown[]) {
                window.dataLayer = window.dataLayer || [];
                 
                window.dataLayer.push(arguments);
            }
            window.whisper_plus_gtag = gtag;

            gtag("js", new Date());
            gtag("config", this.gaId, {
                "send_page_view": false,               // 阻止 GA4 自动发送 page_view event
                "user_id": window.siyuan.user?.userId, // 已登录用户的 User-ID：用于将统计信息与实际的单个用户关联以避免重复统计
            });
        }

        logging.log("Whisper-Plus is sending Google Analytics data (can be disabled in the plugin settings menu)");

        // 收集并发送基本信息
        this.sendInfo();
    }

    /**
     * 收集并发送基本信息
     */
    private async sendInfo() {
        if (!this.themeVersion) {
            await this.fetchThemeVersion();
        }

        const params: Record<string, unknown> = {
            theme_version: this.themeVersion,  // 主题版本：用于统计一个时间段内的主题版本使用情况
            date_iso: this.dateISO,            // ISO日期：用于统计单日活跃用户数
            timestamp: this.lastSentTimestamp, // 最后发送时间戳
            language: navigator.language,
        };

        try {
            // 添加思源笔记相关信息（如果可用）
            const siyuan = window.siyuan;
            if (siyuan) {
                if (siyuan.config?.lang) {
                    params.app_language = siyuan.config.lang; // 界面语言
                }

                // 系统信息
                if (siyuan.config?.system) {
                    params.app_version = siyuan.config.system.kernelVersion; // 思源笔记版本
                    params.app_container = siyuan.config.system.container;   // 运行环境
                    params.app_os = siyuan.config.system.os;                 // 操作系统类型
                    params.app_platform = siyuan.config.system.osPlatform;   // 操作系统名称
                }

                // 同步信息
                if (siyuan.config?.sync) {
                    params.sync_enabled = siyuan.config.sync.enabled; // 同步状态
                }

                // 使用量信息
                if (siyuan.config?.stat) {
                    const user = siyuan.user as { userCreateTime?: string } | undefined;
                    params.user_create_time = user?.userCreateTime?.slice(0, 6); // 账号创建时间（截取年月）
                    params.tree_count = siyuan.config.stat.cTreeCount;            // 文档数量
                    params.block_count = siyuan.config.stat.cBlockCount;          // 内容块数量
                }
            }
        } catch (e) {
            logging.error("Error collecting SiYuan data for analytics:", e);
        }

        // 发送事件
        if (window.whisper_plus_gtag) {
            window.whisper_plus_gtag("event", "theme_init", params);
        }
    }

    /**
     * 跟踪自定义事件
     * @param eventName 事件名称
     * @param params 事件参数
     */
    trackEvent(eventName: string, params: Record<string, unknown> = {}) {
        if (!window.whisper_plus_gtag) return;

        // 添加主题版本信息
        params.theme_version = this.themeVersion;

        // 发送事件
        window.whisper_plus_gtag("event", eventName, params);
    }

    /**
     * 跟踪功能使用（预留用来统计配色方案使用情况）
     * @param featureName 功能名称
     * @param params 附加参数
     */
    trackFeatureUse(featureName: string, params: Record<string, unknown> = {}) {
        this.trackEvent("feature_use", { feature_name: featureName, ...params });
    }
}
