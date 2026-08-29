import { CONFIG_FEATURE_MENU_ITEMS, PluginConfig, ConfigKey } from "../config";
import { syncAttr } from "../utils";

const FEATURE_KEYS = CONFIG_FEATURE_MENU_ITEMS.map((item) => item.key) as readonly ConfigKey[];
type FeatureKey = (typeof FEATURE_KEYS)[number];

/** 特性键 → html 属性名，例如 text_half_bg → data-whisper-text-half-bg */
function featureAttrName(key: FeatureKey): string {
    return `data-whisper-${key.replace(/_/g, "-")}`;
}

/**
 * 写入显式布尔值（true / false），不再移除属性。
 * 主题 CSS 按属性值门控：默认开启的特性用 :not([attr="false"])，默认关闭的用 [attr="true"]，
 * 未安装插件（无属性）时即应用内置默认值。
 */
function applyFeatureAttributes(config: PluginConfig): void {
    const root = document.documentElement;

    for (const key of FEATURE_KEYS) {
        syncAttr(root, featureAttrName(key), config.get(key) ? "true" : "false");
    }
}

/**
 * 样式特性：从 PluginConfig 读取顶层布尔开关，写入 html 的 data-whisper-* 属性供主题 SCSS 消费。
 */
export class FeaturesManager {
    private readonly onFeatureConfigChanged: () => void;

    constructor(private readonly config: PluginConfig) {
        this.onFeatureConfigChanged = () => applyFeatureAttributes(config);
    }

    init(): void {
        applyFeatureAttributes(this.config);
        for (const key of FEATURE_KEYS) {
            this.config.onConfigChanged(key, this.onFeatureConfigChanged);
        }
    }

    destroy(): void {
        for (const key of FEATURE_KEYS) {
            this.config.offConfigChanged(key, this.onFeatureConfigChanged);
            document.documentElement.removeAttribute(featureAttrName(key));
        }
    }
}
