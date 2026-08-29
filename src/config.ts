import type { Plugin } from "siyuan";
import { getLocalStorageVal, removeLocalStorageVal } from "./api";
import { logging } from "./logger";
import { isReadOnly } from "./utils";

/** 配置存储文件名 */
export const CONFIG_FILE_NAME = "config.json";

/** 旧版主题（Whisper）LocalStorage 配置键，用于一次性迁移 */
const LEGACY_CONFIG_STORAGE_KEY = "whisper-theme-config-v2";

/** 配置值类型 */
export type ConfigValue = string | number | boolean | null;

/** 配置对象类型（单层键值） */
export interface ConfigObject {
    [key: string]: ConfigValue;
}

type ConfigFieldDef =
    | { type: "boolean"; default: boolean; menu?: { icon: string; group: string; mobile?: boolean } }
    | { type: "number"; default: number | (() => number) }
    | { type: "string"; default: string | (() => string) };

/** 插件配置声明（单一数据源：键名、类型、默认值、菜单元数据） */
export const CONFIG_SCHEMA = {
    /** 明亮模式界面配色（对应 data-whisper-appearance；空字符串表示原生，不写属性） */
    appearance_light: {
        type: "string",
        default: "blush",
    },
    /** 暗黑模式界面配色（对应 data-whisper-appearance；空字符串表示原生，不写属性） */
    appearance_dark: {
        type: "string",
        default: "graphite",
    },
    /** 文本配色方案（对应 data-whisper-text；空字符串表示原生，不写属性、不附加样式） */
    text: {
        type: "string",
        default: "rainbow",
    },
    /** 首次安装时间戳（毫秒），用于首次安装一天内不发送统计信息 */
    install_timestamp: {
        type: "number",
        default: () => Date.now(),
    },
    /** 隐藏文档面包屑：叠层透明并隐藏路径栏，保留右侧按钮（对应 data-whisper-hide-doc-breadcrumb；不影响嵌入块/反链；仅桌面端生效） */
    hide_doc_breadcrumb: {
        type: "boolean",
        default: false,
        menu: { icon: "iconFile", group: "feature", mobile: false },
    },
    /** 文本半高背景（对应 data-whisper-text-half-bg） */
    text_half_bg: {
        type: "boolean",
        default: true,
        menu: { icon: "iconFont", group: "feature" },
    },
    /** 上次发送统计信息的时间戳（毫秒） */
    analytics_last_sent_timestamp: {
        type: "number",
        default: 0,
    },
    /** 是否启用统计信息收集 */
    analytics_enable: {
        type: "boolean",
        default: true,
        menu: { icon: "iconCloud", group: "general" },
    },
    /** 是否在启动后显示设备类型等调试消息 */
    debug_show_message: {
        type: "boolean",
        default: false,
        menu: { icon: "iconInfo", group: "general" },
    },
} as const satisfies Record<string, ConfigFieldDef>;

export type ConfigKey = keyof typeof CONFIG_SCHEMA;

type ConfigFieldType<T extends ConfigFieldDef> =
    T extends { type: "boolean" } ? boolean :
    T extends { type: "number" } ? number :
    string;

export type ConfigSchema = {
    [K in ConfigKey]: ConfigFieldType<(typeof CONFIG_SCHEMA)[K]>;
};

/** 带 menu 的 boolean 配置键 */
export type MenuConfigKey = {
    [K in ConfigKey]: (typeof CONFIG_SCHEMA)[K] extends { type: "boolean"; menu: { icon: string } }
        ? K
        : never;
}[ConfigKey];

export type MenuItemDef = { key: MenuConfigKey; icon: string; mobile: boolean };

function collectMenuGroups(): Map<string, MenuItemDef[]> {
    const groups = new Map<string, MenuItemDef[]>();

    for (const key of Object.keys(CONFIG_SCHEMA) as ConfigKey[]) {
        const field = CONFIG_SCHEMA[key];
        if (field.type !== "boolean" || !("menu" in field)) {
            continue;
        }

        const group = field.menu.group;
        const items = groups.get(group);
        const item = {
            key: key as MenuConfigKey,
            icon: field.menu.icon,
            mobile: !("mobile" in field.menu) || field.menu.mobile !== false,
        };

        if (items) {
            items.push(item);
        } else {
            groups.set(group, [item]);
        }
    }

    return groups;
}

const MENU_GROUP_MAP = collectMenuGroups();

/** 按 group 分段的菜单项（顺序为 schema 中各 group 首次出现的顺序） */
export const CONFIG_MENU_GROUPS: readonly MenuItemDef[][] = [...MENU_GROUP_MAP.values()];

/** 移动端菜单项（排除 schema 中 menu.mobile === false 的项） */
export const CONFIG_MOBILE_MENU_GROUPS: readonly MenuItemDef[][] = CONFIG_MENU_GROUPS
    .map((items) => items.filter((item) => item.mobile))
    .filter((items) => items.length > 0);

/** 样式特性菜单项 */
export const CONFIG_FEATURE_MENU_ITEMS = MENU_GROUP_MAP.get("feature") ?? [];

/** 将分组菜单项映射为片段，组间自动插入 separator */
export function flatMapMenuGroups<T>(
    groups: readonly MenuItemDef[][],
    options: {
        leading?: () => T;
        separator?: () => T;
        item: (item: MenuItemDef) => T;
    },
): T[] {
    const parts: T[] = [];

    if (options.leading) {
        parts.push(options.leading());
    }

    groups.forEach((items, index) => {
        if (index > 0 && options.separator) {
            parts.push(options.separator());
        }
        for (const item of items) {
            parts.push(options.item(item));
        }
    });

    return parts;
}

/** 默认配置（由 schema 在模块加载时生成；install_timestamp 在此时记录） */
const DEFAULT_CONFIG = Object.fromEntries(
    (Object.keys(CONFIG_SCHEMA) as ConfigKey[]).map((key) => {
        const { default: defaultValue } = CONFIG_SCHEMA[key];
        return [key, typeof defaultValue === "function" ? defaultValue() : defaultValue];
    }),
) as ConfigObject;

/**
 * 合并默认配置：填充缺失键、纠正非法值、丢弃未知键
 */
function mergeDefaults(target: ConfigObject, defaults: ConfigObject): {
    config: ConfigObject;
    needsWriteBack: boolean;
} {
    const result: ConfigObject = {};

    for (const key in defaults) {
        const defaultValue = defaults[key];
        const rawValue = target[key];

        if (rawValue !== undefined && typeof rawValue === typeof defaultValue) {
            result[key] = rawValue;
            continue;
        }

        if (rawValue !== undefined) {
            logging.warn(`Invalid config value for "${key}", using default`);
        }
        result[key] = defaultValue;
    }

    const needsWriteBack =
        Object.keys(target).some((key) => !(key in defaults)) ||
        Object.keys(defaults).some((key) => target[key] !== result[key]);

    return { config: result, needsWriteBack };
}

/**
 * 插件配置：读写配置、变更通知
 *
 * 使用插件 data 目录下的 config.json 持久化；
 * 首次加载时若发现旧版主题（Whisper）的 LocalStorage 配置，则一次性迁移。
 */
export class PluginConfig {
    private _config: ConfigObject = {};
    private initialized = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;

    private configChangeListeners = new Map<string, Set<(value: ConfigValue) => void>>();

    constructor(private readonly plugin: Plugin) {}

    /**
     * 加载配置：优先读插件数据文件；不存在时尝试从旧版主题配置迁移
     */
    async init(): Promise<void> {
        let config: ConfigObject | undefined;
        try {
            config = await this.plugin.loadData(CONFIG_FILE_NAME) as ConfigObject | undefined;
        } catch (e) {
            logging.error(`Failed to load config: ${e instanceof Error ? e.message : String(e)}`);
        }

        if (typeof config === "object" && config !== null && !Array.isArray(config)) {
            const { config: merged, needsWriteBack } = mergeDefaults(config, DEFAULT_CONFIG);
            this._config = merged;
            this.initialized = true;
            if (needsWriteBack && !isReadOnly()) {
                this.scheduleSave();
            }
            return;
        }

        // 插件数据文件不存在或格式不对：尝试迁移旧版主题配置
        const migrated = await this.tryMigrateLegacyConfig();
        if (migrated) {
            this.initialized = true;
            return;
        }

        logging.warn("Plugin data file is not a config object, using defaults");
        this._config = { ...DEFAULT_CONFIG };
        this.initialized = true;
        if (!isReadOnly()) {
            this.scheduleSave();
        }
    }

    /**
     * 从旧版主题（Whisper）的 LocalStorage 配置迁移
     */
    private async tryMigrateLegacyConfig(): Promise<boolean> {
        const result = await getLocalStorageVal(LEGACY_CONFIG_STORAGE_KEY);
        if (result.code !== 0 || typeof result.data !== "object" || result.data === null || Array.isArray(result.data)) {
            return false;
        }

        const { config } = mergeDefaults(result.data as ConfigObject, DEFAULT_CONFIG);
        this._config = config;
        this.initialized = true;
        logging.log(`Migrated legacy theme config from localStorage [${LEGACY_CONFIG_STORAGE_KEY}]`);

        if (!isReadOnly()) {
            this.scheduleSave();
            const removeResult = await removeLocalStorageVal(LEGACY_CONFIG_STORAGE_KEY);
            if (removeResult.code !== 0) {
                logging.error(`Failed to remove legacy config: ${removeResult.msg}`);
            }
        }
        return true;
    }

    destroy(): void {
        this.configChangeListeners.clear();
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
    }

    /** 读取配置项，缺失时回退到默认配置 */
    get<K extends ConfigKey>(key: K): ConfigSchema[K] {
        const value = this._config[key as string];
        if (value !== undefined) {
            return value as ConfigSchema[K];
        }
        return DEFAULT_CONFIG[key] as ConfigSchema[K];
    }

    /** 写入配置项（非只读模式下自动保存） */
    set<K extends ConfigKey>(key: K, value: ConfigSchema[K]): void {
        if (!this.initialized) {
            logging.warn("Config not initialized, set() ignored.");
            return;
        }
        this._config[key as string] = value as ConfigValue;
        this.configChangeListeners.get(key as string)?.forEach(listener => {
            listener(value as ConfigValue);
        });
        if (!isReadOnly()) {
            this.scheduleSave();
        }
    }

    onConfigChanged<K extends ConfigKey>(
        key: K,
        listener: (value: ConfigSchema[K]) => void,
    ): void {
        if (!this.configChangeListeners.has(key)) {
            this.configChangeListeners.set(key, new Set());
        }
        this.configChangeListeners.get(key)!.add(listener as (value: ConfigValue) => void);
    }

    offConfigChanged<K extends ConfigKey>(
        key: K,
        listener: (value: ConfigSchema[K]) => void,
    ): void {
        this.configChangeListeners.get(key)?.delete(listener as (value: ConfigValue) => void);
    }

    /**
     * 防抖保存配置
     */
    private scheduleSave(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            void this.plugin.saveData(CONFIG_FILE_NAME, { ...this._config }).catch((e: unknown) => {
                logging.error(`Failed to save config: ${e instanceof Error ? e.message : String(e)}`);
            });
        }, 500);
    }
}
