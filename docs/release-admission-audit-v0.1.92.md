# v0.1.92 发布准入审计（只读）

审计范围：当前 V49 设计指针、发布脚本实际读取的视觉门禁、verification-only 包身份，以及形成正式候选前的缺口。本审计不修改页面、业务逻辑、正式数据库、正式配置或发布目录。

## 结论

当前可以保留并复核 verification-only 证据；不能生成正式候选，也不能发布。阻断正式候选的直接原因不是“V49 页面迁移未完成”，而是当前发布脚本仍调用读取旧 V48 合同的 `audit:fidelity`，同时 V49 合同仍是 draft 且未激活。旧脚本输出的 `completed=0 / incomplete=94` 只能标记为门禁兼容性问题，不能直接解释为 94 个已确认的运行时页面缺陷。

## 证据核对

| 项目 | 当前证据 | 裁决 |
| --- | --- | --- |
| 当前设计源 | `docs/current-design-baseline.json` → V49 快照；V49 HTML SHA-256 为 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D` | current 设计指针明确，不等于全产品运行时已迁移 |
| V49 合同 | `docs/design-contract-v49.json`，`status=draft`、`activation.enabled=false` | 未达到可作为全产品发布门禁的状态 |
| 发布视觉脚本 | `tools/pack-current-candidate.mjs:52-55` 无条件调用 `audit:fidelity`；`tools/visual-fidelity-report.mjs:8` 读取 `docs/design-contract-v48.json` | 发布脚本与 current V49 设计治理不一致，属于工程门禁缺口 |
| verification 包 | `docs/release-evidence/v0.1.92-p1-internal-trial-visual-unverified.json`，包类型 `verification-only`、`visualFidelity=incomplete`、`notFormalCandidate=true`；快照 SHA-256 为 `194689A5EDF4D8C8B41318540B3CE62D31D9BBE0CAADDBDCFDC3FCC1DBE3850C` | 可用于内部验证，不是候选，不替换正式版 |
| 当前基线 | `docs/current-release-baseline.json` 仍指向不可变候选 `release-candidate-0.1.32-p1-internal-trial` | 当前工作树和 v0.1.92 verification 包都不能冒充最新版正式候选 |
| 功能证据 | Phase 29 P0 与视频 P1 v2 证据、验证器和独立审查已通过 | 功能验收与发布准入是两件事，不能互相替代 |

## 正式候选前缺口

1. **工程门禁**：先决定发布门禁是否切换到 V49。若切换，需要单独更新脚本、合同激活规则和 V49 证据覆盖；这会改变发布标准，不应偷偷通过改页面规避。
2. **证据覆盖**：V49 合同要求其它屏幕和状态完成运行时确认，并在 `docs/design-evidence/v49` 形成项目预览与 Electron 捕获证据。目前仅 `screen-clip` 有已接受的独立视觉证据。
3. **外部发布条件**：若要对外发布，还需在目标机器完成正式构建、安装/启动和签名或分发审计；本次没有执行，也没有推送或发布。
4. **用户决策**：候选池、完成报告、字幕等页面是否纳入 V49 视觉验收仍需逐项授权。Phase 30 的导出配置页面按用户决定保持不动，30.2–30.3 暂缓。

## 下一步决策包

- 可执行：继续生成新的 verification-only 包，前提是不把它登记为正式候选。
- 不可执行：正式候选、正式版替换、公开发布。
- 不涉及页面的优先事项：修正/替换旧 V48 视觉门禁的工程接线，并重新定义 V49 激活范围；实施前需先确认发布标准。
- 涉及页面的事项：逐屏 V49 运行时确认、候选池/报告/字幕等页面迁移，只能在用户明确授权后另立 Phase，不自动启动。

审计性质：只读；结论依据为当前仓库文件、脚本行号、哈希和已登记证据。
