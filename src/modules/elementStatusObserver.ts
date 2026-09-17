import { logging } from "../logger";
import { waitForElement } from "../utils";

/** 检查配置 */
interface CheckConfig {
    datasetProp: string;
    attributeFilter: string;
    check: (el: HTMLElement) => boolean;
    stateMap: { [key: string]: string };
}

/** 目标配置 */
interface TargetConfig {
    selector: string;
    checks: CheckConfig[];
    found: boolean;
    timedOut: boolean;
    element: HTMLElement | null;
    exclude?: {
        /**
         * 排除配置，如果存在符合该选择器的元素，则忽略该目标
         */
        selector: string;
        /**
         * 可选的额外检查函数，如果返回 true，则忽略该目标
         * @param el 元素
         * @returns 是否忽略该目标
         */
        check?: (el: HTMLElement) => boolean;
    };
}

/**
 * 元素状态观察器：监听元素状态，通过给 html 添加属性来代替使用 :has 选择器
 */
export class ElementStatusObserver {
    private elementObserver: MutationObserver | null = null;
    private targets: TargetConfig[] = [];
    private destroyed = false;
    /** 初始化代次：每次 init 递增，销毁或重新初始化后旧一轮的等待随之中止 */
    private generation = 0;

    /**
     * 初始化元素状态观察器
     *
     * 主题切换会反复启停本模块（见 themeState.ts），因此每次初始化都需要重置销毁标记
     */
    public async init(): Promise<void> {
        this.destroyed = false;
        const generation = ++this.generation;
        this.setupTargets();
        await this.startObserving(generation);
    }

    /**
     * 销毁元素状态观察器
     */
    public destroy(): void {
        this.destroyed = true;
        this.generation++;

        if (this.elementObserver) {
            this.elementObserver.disconnect();
            this.elementObserver = null;
        }

        // 移除所有已添加的属性（从 found 为 true 的 targets 中获取）
        this.targets.forEach(target => {
            if (target.found) {
                target.checks.forEach(check => {
                    const attributeName = `data-${check.datasetProp.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
                    document.documentElement.removeAttribute(attributeName);
                });
            }
        });
    }

    /**
     * 创建基础目标配置
     * @param selector 目标元素选择器
     * @param checks 检查配置数组
     * @param exclude 排除配置，如果存在符合该选择器的元素，则忽略该目标
     */
    private createBaseTarget(
        selector: string,
        checks: TargetConfig["checks"],
        exclude?: TargetConfig["exclude"],
    ): TargetConfig {
        return {
            selector,
            checks,
            found: false,
            timedOut: false,
            element: null,
            exclude,
        };
    }

    /**
     * 设置目标元素配置
     */
    private setupTargets(): void {
        this.targets = [
            this.createBaseTarget("#status", [
                {
                    datasetProp: "whisperStatus",
                    attributeFilter: "class",
                    check: el => el.classList.contains("fn__none"),
                    stateMap: { true: "hide", false: "show" },
                },
            ]),
        ];
    }

    /**
     * 开始观察元素状态
     */
    private async startObserving(generation: number): Promise<void> {
        // 创建一个 MutationObserver 实例来观察所有目标节点的变化
        this.elementObserver = new MutationObserver(mutationsList => {
            for (const mutation of mutationsList) {
                const targetNode = mutation.target as HTMLElement;
                // 找出对应的目标节点配置
                const target = this.targets.find(t => t.element === targetNode);
                if (!target) continue;

                // 更新所有相关的 dataset 属性
                target.checks.forEach(check => {
                    if (check.attributeFilter === mutation.attributeName) {
                        const checkResult = check.check(targetNode);
                        document.documentElement.dataset[check.datasetProp] = check.stateMap[String(checkResult)];
                    }
                });
            }
        });

        await Promise.all(this.targets.map(target => this.waitForTarget(target, generation)));
    }

    /**
     * 等待并观察单个目标节点
     */
    private async waitForTarget(target: TargetConfig, generation: number): Promise<void> {
        const element = await waitForElement(
            target.selector,
            () => this.shouldAbortTarget(target, generation),
        );

        if (this.destroyed || generation !== this.generation) return;

        if (!element) {
            target.timedOut = true;
            if (!this.shouldAbortTarget(target, generation)) {
                logging.error(`failed to find target node: ${target.selector}`);
            }
            return;
        }

        target.element = element;
        target.found = true;
        this.setupObserver(target);
    }

    /**
     * 是否应中止等待：已销毁或已开始新一轮初始化时中止，避免遗留轮询定时器
     */
    private shouldAbortTarget(target: TargetConfig, generation: number): boolean {
        if (this.destroyed || generation !== this.generation) {
            return true;
        }
        return this.shouldExcludeTarget(target);
    }

    /**
     * 检查是否应排除该目标
     */
    private shouldExcludeTarget(target: TargetConfig): boolean {
        if (!target.exclude) return false;

        const excludeElement = document.querySelector(target.exclude.selector);
        if (!excludeElement) return false;

        return target.exclude.check
            ? target.exclude.check(excludeElement as HTMLElement)
            : true;
    }

    /**
     * 设置单个目标节点的观察
     */
    private setupObserver(target: TargetConfig): void {
        if (!target.element || !this.elementObserver) return;

        // 初始设置所有 dataset 状态
        target.checks.forEach(check => {
            const checkResult = check.check(target.element!);
            document.documentElement.dataset[check.datasetProp] = check.stateMap[String(checkResult)];
        });

        // 开始观察该节点的所有相关属性变化
        const attributesToObserve = Array.from(new Set(target.checks.map(check => check.attributeFilter)));
        this.elementObserver.observe(target.element, {
            attributes: true,
            attributeFilter: attributesToObserve,
        });
    }
}
