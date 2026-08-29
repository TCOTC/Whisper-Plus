# Whisper-Plus

[浅吟主题](https://github.com/TCOTC/Whisper) 的伴生插件，承载主题的 JS 功能：

- 配色方案（明亮/暗黑界面配色、文本配色）
- 样式特性开关（隐藏文档面包屑、文本半高背景）
- 桌面端 / 移动端配置菜单（含顶栏融合开关）

## 使用

1. 安装并启用 [浅吟主题](https://github.com/TCOTC/Whisper)
2. 在集市中安装本插件（或手动下载放入 `data/plugins/`）
3. 在思源「设置 - 集市 - 已下载」中启用插件

主题的配色与特性开关可通过以下入口调整：

- 桌面端：顶栏按钮（浅吟花朵图标），菜单内可一键使用/禁用浅吟主题（未安装时自动从集市安装）
- 移动端：侧栏菜单「浅吟主题」入口

## 开发

```bash
pnpm install
pnpm run dev    # 开发模式（watch）
pnpm run build  # 构建发布包
```
