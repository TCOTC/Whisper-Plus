/** 同步元素属性：值相同时跳过；空字符串时移除属性 */
export function syncAttr(element: HTMLElement, name: string, value: string): void {
    const current = element.getAttribute(name) ?? "";
    if (current === value) {
        return;
    }
    if (value) {
        element.setAttribute(name, value);
    } else {
        element.removeAttribute(name);
    }
}

/**
 * 轮询等待 DOM 元素出现
 * @param selector 目标元素选择器
 * @param shouldAbort 每次重试前调用，若返回 true 则中止等待并返回 null（不计为超时）
 * @returns 找到的元素，超时或中止时返回 null
 */
export function waitForElement(
    selector: string,
    shouldAbort?: () => boolean,
): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
        let retryCount = 0;

        const tryFind = () => {
            if (shouldAbort?.()) {
                resolve(null);
                return;
            }

            const element = document.querySelector(selector);
            if (element instanceof HTMLElement) {
                resolve(element);
                return;
            }

            if (retryCount >= 50) { // 最大重试 50 次
                resolve(null);
                return;
            }

            retryCount++;
            setTimeout(tryFind, 100); // 间隔 100ms 重试
        };

        tryFind();
    });
}

/** 判断是否为内核只读模式 */
export function isReadOnly(): boolean {
    return !!window.siyuan.config?.readonly || !!window.siyuan.isPublish;
}

/** 判断是否为移动设备（手机） */
export const isMobile = (): boolean => {
    return !!window.siyuan.mobile;
};

/** 判断是否为 iPad */
export const isIPad = () => {
    return navigator.userAgent.indexOf("iPad") > -1;
};

/** 判断是否为触屏设备（安卓平板只能通过这个） */
export const isTouchDevice = () => {
    return ("ontouchstart" in window) && navigator.maxTouchPoints > 1;
};

/** 判断是否为 Windows 系统 */
export const isWindows = (): boolean => {
    return navigator.platform.toUpperCase().indexOf("WIN") > -1;
};

/** 判断是否为本地路径 */
export const isLocalPath = (link: string) => {
    if (!link) {
        return false;
    }

    link = link.trim();
    if (1 > link.length) {
        return false;
    }

    link = link.toLowerCase();
    if (link.startsWith("assets/") || link.startsWith("file://") || link.startsWith("\\\\") /* Windows 网络共享路径 */) {
        return true;
    }

    if (isWindows()) {
        const colonIdx = link.indexOf(":");
        return 1 === colonIdx; // 冒号前面只有一个字符认为是 Windows 盘符而不是网络协议
    }
    return link.startsWith("/");
};
