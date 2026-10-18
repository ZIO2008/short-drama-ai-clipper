# 候选池完整V49迁移卡

本轮输入为2026-10-18剩余收口排期。分类：全屏迁移，不能把旧宿主与裁剪区域当成最终画布。

## 来源与外壳

current指针docs/current-design-baseline.json，实体design-v49-clip-monitor-review；完整HTML design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html，SHA256 C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D。同目录artifact与v49-clip-monitor-review/handoff.md、reuse-matrix.md已读取。V49是完整快照，handoff的“未改变候选池”不表示可以回拼July30旧HTML。

目标入口：DramaWorkspacePage的clip-pool；外壳归原型.app/sidebar/workspace/topbar/content，React宿主只承载完整iframe。继承已验收screen-clip全壳策略，证据docs/design-evidence/v49/screen-clip/default-candidate-selected/1440x900/evidence.json；两页仍需独立验证。固定1440×900、1280×720，DPR1。

现状：prototypeSourceForScreen的pool仍取July30；isolatePrototypeScreen裁剪body，并重新注入尺寸覆盖、改写760px媒体查询为704px。新夹具直接使用完整V49，保留所有原型style、元素顺序和原始viewport，不沿用这套裁剪/修正。原型最后生成的screen-clip-pool是有效页面，已remove的旧screen-clip-export/r5ExportDrawer不恢复。

## DOM所有权与绑定矩阵

| 节点 | 结构所有者 | 允许的数据/行为 | 禁止 |
| --- | --- | --- | --- |
| .app/sidebar/topbar/content | V49 | 真实剧名、版本文字、全局真实导航回调 | React第二套侧栏/顶部、截取局部、旧高度CSS覆盖 |
| .clip-module-stage | V49 | 当前阶段、真实切换回调 | 页面内重造步骤或跳进演示页 |
| .clip-module-board/.clip-board-episodes | V49 | 当前分集和状态，内层列表 | 页面外滚动、跨集拼片序列 |
| #clipCandidateRows及.clip-candidate-list-row | V49行结构 | 永久编号、源时码、时长、状态、打开/显式选择/安全删除 | 无列语义地重画行、原型C编号覆盖永久号 |
| .clip-inspector-stat/#clipPoolWindowMeta | V49数据槽 | 真实全剧状态总数、当前窗口 | 120/500/486静态数字冒充事实 |
| #exportModal/#packagingModal | V49+已验收业务差异 | 目录、质量/FPS、包装、中文命名、显式选择与真实进度 | 三方式字幕控件、自动选择全部、旧英文模板、覆盖文件 |

静态夹具只跑原型交互，不访问desktopApi、不写数据库、不启用运行时桥。原始预览与真实Electron夹具各自加载完整HTML，通过原型原有按钮进入相同状态。原型构建完成前不显示中间剧目库。默认壳、样式、分栏和滚动同状态对比通过后才迁移真实绑定。

## 状态矩阵

| 状态 | 原型/数据前置 | 首轮夹具 | 真实业务验收 |
| --- | --- | --- | --- |
| 默认列表 | 原型默认第01集 | 双视口基线 | 真实候选/编号/统计 |
| 读取中 | 既有empty容器+独立读取文案 | 数据槽状态，后续绑定前单独固化 | 延迟读取不露演示数字 |
| 尚无候选 | 既有empty容器+无候选文案 | 同上 | 0项无旧行 |
| 无搜索匹配 | 原型搜索不匹配 | 双视口扩展 | 筛选不改选择身份 |
| 生成中 | 原型第03集按钮 | 双视口基线 | 真实generating状态 |
| 缺媒体 | 原型第06集按钮 | 双视口基线 | 真实missing_media |
| 已导出筛选 | 原型exported按钮 | 双视口基线 | exported可以显式重导 |
| 跨集多选 | 已批准checkbox，ID去重 | 受控差异，绑定前固化 | 不自动批量、切集不丢选择 |
| 5000条压力 | 100集×50，20行窗口、500可选 | 参考原型高容量内层滚动 | 限定DOM数量、键盘滚动 |

已有显式checkbox、中文命名、01/02编号、再次导出及安全删除均保留为批准差异；真实数量/剧名/路径替换原型示例。新增业务能力不在本卡范围。没有对应状态的原型结构只能复用已存在容器，不能自行添加布局。

## 完成记录

当前：卡片建立，静态夹具验证执行中；真实数据绑定、异步/失败与最终视觉尚未验收。原始测试输出及逐状态截图进入test-results；精选长期证据需manifest绑定源码、设计哈希、窗口/状态、命令和退出码，不能只数截图。

## 共同静态前置验收（2026-10-18）

6个原型原生状态×1440/1280共12对完整画面对照通过；逐对comparison JSON记录changedRatio=0、meanDelta=0。真实React组件与独立加载的原型原文全画面对照，不裁图或掩膜，kind明确为static-fixture。3文件30定向单测、typecheck/build退出0；fresh独立复审Stage1/2 PASS。301行问题已收敛到300行，测试窗口URL识别与异常清理已修复。仅共同静态前置完成，所有真实状态及Phase32/33完整视觉验收仍待后续实施。

