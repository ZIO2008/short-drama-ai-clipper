# 版本无关的基线治理（G8-1）

## 目的

用“不可变快照 + 可移动指针 + 哈希 + 分层测试”管理迭代。版本号只是快照的业务标签，不是测试边界，也不是唯一真相源。获明确授权的新快照继承旧快照时，只登记 `supersedes` 关系；不复制旧版本规则，不把旧版本重新纳入默认开发或验收。

## 控制面

- `baseline-registry.json`：追加式注册表。每条记录都有 `id`、`snapshotId`、`domain`、`path`、`sha256`、`status`、`supersedes`、`createdAt`、`allowedUse`。
- `current-*-baseline.json`：域级当前指针。设计、运行时、测试、发布、证据分别指向自己的当前对象，避免一个版本号统治所有生命周期。
- `tools/validate-baseline-registry.mjs`：只读门禁，检查指针唯一性、注册表引用、路径存在性、哈希一致性、状态与继承关系。

## 状态

`draft → candidate → current → superseded → legacy → archived` 是允许的生命周期方向。历史对象可以继续用于明确声明的对比或诊断，但不会因为名称相似而进入默认路径。

## 使用规则

1. 先创建新的不可变快照并计算 SHA-256，再移动对应域的 current 指针。
2. 不覆盖旧快照，不用 `testIgnore` 黑名单代替测试分层。
3. 默认测试只消费 current 集合；兼容测试和 legacy 测试必须显式选择（目录/Playwright project 的迁移在后续批次完成）。
4. 工作树很脏时，runtime 指针只能描述工具上下文，不能声称它是已发布版本。
5. 所有已登记快照均遵循同一规则：不写“禁止碰某版本”的特例。是否可用由 `status`、`domain`、`allowedUse` 和 current 指针共同决定；会话中的假设、举例或反事实名称不得据此登记为项目对象。

## 本批次边界

G8-1 只建立控制面和只读校验，不移动或删除现有文件，不修改业务代码，不改变 Playwright 执行集合。`tests/e2e/phase8-*`、`phase10-v48-*`、`phase14-*` 等历史命名文件被记录为后续“测试目录/项目边界落地”的对象；本批次不重跑该迁移。

## 外部实践依据

- SemVer：版本身份与可移动别名分离（https://semver.org/）。
- npm dist-tags：`latest` 是可移动指针，具体版本独立存在（https://docs.npmjs.com/cli/v10/commands/npm-dist-tag）。
- Kubernetes 镜像 tag/digest：tag 可移动，digest 提供不可变内容身份（https://kubernetes.io/docs/concepts/containers/images/）。
- Playwright Projects：按测试组和环境划分执行集合（https://playwright.dev/docs/test-projects）。
- SLSA：构建产物需要可追溯 provenance（https://slsa.dev/spec/v1.0/levels）。
