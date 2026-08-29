import { showMessage } from "siyuan";
import { PluginConfig } from "../config";
import { isIPad, isMobile, isTouchDevice } from "../utils";

const DEBUG_DELAY_MS = 5000;

/**
 * 调试信息：根据配置显示设备类型等调试消息
 */
export class DebugHandler {
    private scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
    private readonly onDebugShowMessageChange = (enabled: boolean): void => {
        if (enabled) {
            this.scheduleDebugInfo(0);
        } else {
            this.cancelScheduledDebugInfo();
        }
    };

    constructor(private readonly config: PluginConfig) {}

    init(): void {
        this.config.onConfigChanged("debug_show_message", this.onDebugShowMessageChange);

        if (this.config.get("debug_show_message")) {
            this.scheduleDebugInfo(DEBUG_DELAY_MS);
        }
    }

    destroy(): void {
        this.config.offConfigChanged("debug_show_message", this.onDebugShowMessageChange);
        this.cancelScheduledDebugInfo();
    }

    private scheduleDebugInfo(delayMs: number): void {
        this.cancelScheduledDebugInfo();
        this.scheduledTimeout = setTimeout(() => {
            this.scheduledTimeout = null;
            this.showDebugInfo();
        }, delayMs);
    }

    private cancelScheduledDebugInfo(): void {
        if (this.scheduledTimeout) {
            clearTimeout(this.scheduledTimeout);
            this.scheduledTimeout = null;
        }
    }

    private showDebugInfo(): void {
        if (!this.config.get("debug_show_message")) {
            return;
        }

        if (isMobile()) this.message("isMobile");
        if (isIPad()) this.message("isIPad");
        if (isTouchDevice()) this.message("isTouchDevice");
    }

    private message(text: string): void {
        showMessage(text, 10000);
    }
}
