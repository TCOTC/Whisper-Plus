import type { Plugin } from "siyuan";
import { confirm, getFrontend, showMessage } from "siyuan";
import { post } from "../api";
import { logging } from "../logger";
import { compareVersions } from "../utils";

/** 浅吟主题包名（对应 theme.json 的 name） */
const WHISPER_THEME_NAME = "Whisper";

/** 本插件要求的浅吟主题版本范围（闭区间，含两端） */
const MIN_THEME_VERSION = "3.0.0";
const MAX_THEME_VERSION = "3.1.0";
const THEME_VERSION_RANGE = `${MIN_THEME_VERSION}~${MAX_THEME_VERSION}`;

/** 集市包结构（/api/bazaar/getBazaarTheme、getInstalledTheme、getBazaarPlugin 返回） */
type BazaarPackage = {
    name: string;
    version: string;
    outdated?: boolean;
};

/** 替换 i18n 文本中的 {占位符} */
function format(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

/** 版本号是否在要求的范围内 */
function isVersionInRange(version: string): boolean {
    return compareVersions(version, MIN_THEME_VERSION) >= 0 && compareVersions(version, MAX_THEME_VERSION) <= 0;
}

/**
 * 主题版本管理器：启用浅吟主题前校验已安装版本，
 * 不满足插件要求的版本范围时自动升级，无法升级时提示用户。
 */
export class ThemeVersionManager {
    constructor(private readonly plugin: Plugin) {}

    /**
     * 校验并确保主题版本满足插件要求。
     * @returns 主题可正常启用返回 true；升级被取消或无法升级返回 false
     */
    async ensureReady(): Promise<boolean> {
        const installedVersion = await this.getInstalledVersion();
        if (installedVersion === null) {
            logging.error(`Failed to read installed version of theme [${WHISPER_THEME_NAME}]`);
            showMessage(this.text("theme_version_check_failed"), 7000, "error");
            return false;
        }

        if (isVersionInRange(installedVersion)) {
            // 版本符合要求，直接启用
            return true;
        }

        // 版本不符合要求：查询集市最新版
        const latest = await this.getBazaarTheme();
        if (latest === null) {
            showMessage(this.text("theme_version_bazaar_unavailable"), 7000, "error");
            return false;
        }

        if (isVersionInRange(latest.version)) {
            // 最新版符合要求：确认后升级主题
            return await this.confirmAndUpgrade(installedVersion, latest.version);
        }

        // 最新版仍不符合要求：若插件本身有更新，提醒用户先更新插件
        if (await this.isPluginOutdated()) {
            confirm(
                this.text("theme_version_upgrade_title"),
                format(this.text("theme_version_update_plugin_first"), {
                    target: latest.version,
                    range: THEME_VERSION_RANGE,
                }),
            );
            return false;
        }

        // 插件已是最新但仍无法满足：提示用户联系主题作者
        confirm(
            this.text("theme_version_upgrade_title"),
            format(this.text("theme_version_latest_incompatible"), {
                target: latest.version,
                range: THEME_VERSION_RANGE,
            }),
        );
        return false;
    }

    /** 读取已安装主题版本；读取失败返回 null */
    private async getInstalledVersion(): Promise<string | null> {
        const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getInstalledTheme", {});
        if (result.code !== 0) {
            logging.error(`Failed to get installed themes: ${result.msg}`);
            return null;
        }
        return result.data?.packages?.find((pkg) => pkg.name === WHISPER_THEME_NAME)?.version ?? null;
    }

    /** 获取集市主题信息；集市不可用或主题不存在时返回 null */
    private async getBazaarTheme(): Promise<BazaarPackage | null> {
        const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getBazaarTheme", {
            frontend: getFrontend(),
        });
        if (result.code !== 0) {
            logging.error(`Failed to get bazaar themes: ${result.msg}`);
            return null;
        }
        return result.data?.packages?.find((pkg) => pkg.name === WHISPER_THEME_NAME) ?? null;
    }

    /** 确认后升级主题到最新版 */
    private async confirmAndUpgrade(current: string, target: string): Promise<boolean> {
        const confirmed = await new Promise<boolean>((resolve) => {
            confirm(
                this.text("theme_version_upgrade_title"),
                format(this.text("theme_version_upgrade_message"), {
                    current,
                    target,
                    range: THEME_VERSION_RANGE,
                }),
                () => resolve(true),
                () => resolve(false),
            );
        });
        if (!confirmed) {
            return false;
        }

        const result = await post("/api/bazaar/updateBazaarPackage", {
            packageType: "themes",
            packageName: WHISPER_THEME_NAME,
            frontend: getFrontend(),
        });
        if (result.code !== 0) {
            logging.error(`Failed to update theme [${WHISPER_THEME_NAME}]: ${result.msg}`);
            showMessage(this.text("theme_version_upgrade_failed"), 7000, "error");
            return false;
        }
        showMessage(format(this.text("theme_version_upgraded"), { target }));
        return true;
    }

    /** 插件本身是否有新版本可用 */
    private async isPluginOutdated(): Promise<boolean> {
        const result = await post<{ packages?: BazaarPackage[] }>("/api/bazaar/getBazaarPlugin", {
            frontend: getFrontend(),
        });
        if (result.code !== 0) {
            logging.error(`Failed to get bazaar plugins: ${result.msg}`);
            return false;
        }
        return !!result.data?.packages?.find((pkg) => pkg.name === this.plugin.name)?.outdated;
    }

    /** 读取插件 i18n 文本，缺失时回退为键名 */
    private text(key: string): string {
        return this.plugin.i18n[key] ?? key;
    }
}
