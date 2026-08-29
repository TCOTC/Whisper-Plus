import type { IEventBusMap, Plugin } from "siyuan";

/**
 * 列表项展开处理：编辑器加载完成时，聚焦折叠的列表项自动展开
 *
 * 原理：只使用 CSS 覆盖的话，块标不会改变，因此要用 JS；
 * 移除列表项块的 fold="1" 属性之后，编辑内容只影响子块，所以不会保存列表项块的展开状态
 */
export class FoldedListItemHandler {
    constructor(private readonly plugin: Plugin) {}

    public init(): void {
        this.plugin.eventBus.on("loaded-protyle-static", this.onLoadedProtyleStatic);
    }

    public destroy(): void {
        this.plugin.eventBus.off("loaded-protyle-static", this.onLoadedProtyleStatic);
    }

    private onLoadedProtyleStatic = (event: CustomEvent<IEventBusMap["loaded-protyle-static"]>): void => {
        const wysiwyg = event.detail?.protyle?.wysiwyg?.element;

        if (wysiwyg?.dataset.docType === "NodeListItem") {
            // 移除首个块（列表项块）的折叠状态
            const firstListItem = wysiwyg.querySelector(":scope > [data-node-id].li");
            if (firstListItem instanceof HTMLElement) {
                firstListItem.removeAttribute("fold");
            }
        }
    };
}
