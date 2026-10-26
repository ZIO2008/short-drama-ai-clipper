# 1.0.0 GitHub正式发布完成

2026-10-26（Asia/Shanghai）。用户明确授权“发布到GitHub吧”，现已公开为正式Release并设为Latest。

- 发布页：https://github.com/ZIO2008/short-drama-ai-clipper/releases/tag/v1.0.0
- 仓库：ZIO2008/short-drama-ai-clipper（PUBLIC），release ID 424267750。
- 状态：draft=false、prerelease=false，GitHub releases/latest返回本release。
- 公开源码分支：release/material-studio-v1.0.0；标签v1.0.0指向公开快照提交0092fed9b91dd1b9265adab8aa93c3bd98554e11。原main及v8.x旧历史未重写。
- 公开快照439项同源映射与原1.0.0源码逐SHA一致，合计444文件，其余为公开README、LICENSE、来源映射及构建设计注册信息。未公开本机完整Git历史、用户数据、私有测试日志或会话文档。

## 下载附件与验收

| 附件 | 字节 | GitHub返回的SHA256 |
| --- | ---: | --- |
| ShortDramaMaterialStudio-1.0.0-Windows-x64.zip | 572321846 | 4d43ca54168d32e6769ff58e580087ba11638658a3d223db8f1080905f0467d6 |
| SHA256SUMS.txt | 114 | b426f7a8c4f2a58860236b023227ce430b03b0222dcb051eba6237a39096911c |
| Getting-Started.zh-CN.txt | 3462 | 8febcecf4a30294cec018500744bb37c4e7d2a7e71b5e085a498dddbe06f687a |

ZIP仅改英文下载名，未重新打包，字节等于本地已验收正式初版。三个附件均uploaded，大小及GitHub服务端digest均与本地一致；远端源码tree与本地公开快照tree一致，annotated tag解析到上述提交。

发布后匿名HTTP HEAD核验：发布页200、ZIP下载200、Content-Length=572321846。没有为了验证再重复下载整个546MiB附件；完整文件身份采用GitHub服务端SHA256与本地SHA256一致的证据。

## 本轮检查和边界

公开快照类型检查及构建实际退出0；fresh github_safety_review Stage1/Stage2 PASS。公开暂存文件中个人home路径、GitHub token、私钥无命中，未含node_modules/out/数据库/日志。发布说明保留未签名、跨电脑未验收、首启联网补全、用户自有云服务及原测试夹具/失败复验的边界。

本次GitHub发布不替换本机日常0.1.108安装或正式数据；跨电脑验收仍按用户决定暂缓，不自动启动其它开发。源码标记为新一代素材平台1.0.0，与旧v8.x工具分别编号。

精选证据：../release-evidence/v1.0.0-github-publication/manifest.json。原本机正式初版交付：2026-10-26-initial-release-result.md。
