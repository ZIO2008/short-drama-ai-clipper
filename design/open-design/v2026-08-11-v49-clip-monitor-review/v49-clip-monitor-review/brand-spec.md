# Version 48 视觉基线

```css
:root{
  --bg: oklch(17% 0.012 65);
  --surface: oklch(21% 0.012 65);
  --fg: oklch(93% 0.012 75);
  --muted: oklch(68% 0.012 70);
  --border: oklch(31% 0.012 65);
  --accent: oklch(70% 0.105 55);
}
```

- 显示字体：`"Segoe UI Variable Display", "Microsoft YaHei UI", sans-serif`
- 正文字体：`"Segoe UI Variable Text", "Microsoft YaHei UI", sans-serif`
- 等宽字体：`"Cascadia Mono", ui-monospace, monospace`

视觉语言：石墨深色的紧凑工作台，以 4px 间距、细线分隔和暖沙橙焦点组织信息；监视器优先，面板只服务当前编辑决策，圆角保持 6px / 9px，浮层仅用于按需操作。

观察规则：

1. 主监视器使用真实画幅 `contain`，控制栏不计入媒体画幅。
2. 细边框与相邻深浅表面优先于卡片堆叠或重阴影。
3. 暖沙橙只表达当前焦点和唯一主操作；状态色必须同时带文字。
4. 低频参数以检查器或贴近触发器的小浮层按需出现，不占据主画布。
5. 时间码、路径和候选编号使用等宽数字，保证快速扫读。
