/**
 * 日志模块
 * 提供带自定义前缀的日志输出功能
 */
export class Logger {
    private prefix = "Whisper-Plus";

    /**
     * 创建一个日志记录器
     * @param prefix 日志前缀
     */
    constructor(prefix?: string) {
        if (prefix) {
            this.prefix = prefix;
        }
    }

    /**
     * 输出普通日志
     * @param args 要输出的内容
     */
    log(...args: unknown[]): void {
        console.log(`[${this.prefix}]`, ...args);
    }

    /**
     * 输出错误日志
     * @param args 要输出的内容
     */
    error(...args: unknown[]): void {
        console.error(`[${this.prefix}]`, ...args);
    }

    /**
     * 输出警告日志
     * @param args 要输出的内容
     */
    warn(...args: unknown[]): void {
        console.warn(`[${this.prefix}]`, ...args);
    }

    /**
     * 输出信息日志
     * @param args 要输出的内容
     */
    info(...args: unknown[]): void {
        console.info(`[${this.prefix}]`, ...args);
    }

    /**
     * 输出调试日志
     * @param args 要输出的内容
     */
    debug(...args: unknown[]): void {
        console.debug(`[${this.prefix}]`, ...args);
    }
}

/** 插件专用的日志实例 */
export const logging = new Logger();
