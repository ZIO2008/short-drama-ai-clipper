# 四个原型业务入口的切换闪烁修复

用户反馈：点击字幕资产、候选工作区、全部候选、完成报告，会闪一下再进入。该问题是本轮维护修复，不恢复其它需求。

## 诊断与分类

真实隔离Electron/IPC录制逐帧状态，原始baseline在test-results/transition-diagnosis/baseline.json。旧页面先卸载，新iframe结构准备期间不可见约80–140ms；候选工作区与候选池还可见约一帧“正在读取真实候选”。没有证据证明跳回旧版。原型其它隐藏节点文本不能被当作可见演示页面证据。

分类：继承已验收同源页面的宿主过渡交互修复。最终页面DOM、原型HTML/CSS、布局、数据资格及业务流程不变；只调整页面就绪时机与宿主切换。复用V49工作台/池/报告44位证据及字幕既有页面结构，不新造加载页、不新增控件。

## 实施顺序与完成标准

1. 初始真实数据读取成功或失败后发出一次就绪信号；刷新不重复隐藏页面。页面宿主最多额外等待250ms数据，慢读取仍显示原有真实加载状态，失败仍可见。
2. 四入口使用浏览器原生View Transition快照保持旧画面，待新iframe可呈现后直接交接，关闭这次交接的默认交叉淡化。单次等待有上限，无API时按原路径切换；取消、卸载、快速连续请求不让旧目标覆盖新目标。使用React flushSync仅在该浏览器集成边界提交新DOM。
3. 回归覆盖四入口、快速/慢速读取、读取失败、超时、连续切换及卸载；用真实Electron逐帧/成对截图证明旧画面保持、瞬时加载不再可见，最终布局无偏移。重验既有生成/导出/字幕入口与状态，fresh独立审查通过后才打包。
4. 新版本独立安装并验证后再替换默认入口，0.1.107保留回退。真实数据不用于测试；升级前一致备份。

## 定向结果与准备

0.1.107实际安装EXE的fast回归在真实hidden/not-ready帧断言失败，记录test-results/navigation-transition-107-red；不依赖新增协议字段判旧版失败。修复后3模式×四入口3 passed（33.1秒），24项renderer定向测试/typecheck/build通过。为明确中途捕获前提，再增加新iframe title正确、ready=false、transition=true断言及input/capture元数据，最新slow1 passed（15.5秒），见test-results/navigation-transition-held-proof；四对native图changedRatio均0，微小RGB误差不等同绝对逐字节一致。

slow为了在原生交接中段精确捕获使用programmatic click，快/失败模式用真实pointer click；截图由Electron.webContents.capturePage取得（Playwright常规screenshot会等下一可绘制帧，无法据它误判中段画面）。JSON明确区分这一前提。源码fresh独立两阶段审查通过，无本次HIGH/MEDIUM；既有超长桥只加就绪信号，不把旧债务另起计划。新候选准备为0.1.108，当前尚未打包或替换默认；接下来冻结同源完整测试、实际安装验证及备份更新。

参考：MDN Document.startViewTransition（更新回调Promise完成后才呈现新视图）及React flushSync浏览器集成说明。原生快照不落盘，不额外挂载第二套可操作业务页面。既有超长业务桥仅增加初次读取信号，新增过渡职责置于独立小模块，不借此开启其它重构计划。
