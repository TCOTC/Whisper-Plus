/**
 * 全局注册的花形图标（lucide flower）。
 * 思源全局 svg { fill: currentColor } 会覆盖 symbol 根上的 fill 并继承给子元素，
 * 故每个子元素显式加 fill="none"。
 */
export const WHISPER_FLOWER_SYMBOL = `<symbol id="iconWhisperFlower" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3" fill="none"/>
    <path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5" fill="none"/>
    <path d="M12 7.5V9" fill="none"/>
    <path d="M7.5 12H9" fill="none"/>
    <path d="M16.5 12H15" fill="none"/>
    <path d="M12 16.5V15" fill="none"/>
    <path d="m8 8 1.88 1.88" fill="none"/>
    <path d="M14.12 9.88 16 8" fill="none"/>
    <path d="m8 16 1.88-1.88" fill="none"/>
    <path d="M14.12 14.12 16 16" fill="none"/>
</symbol>`;
