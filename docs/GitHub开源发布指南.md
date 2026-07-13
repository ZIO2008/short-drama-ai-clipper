# GitHub 开源发布指南

## 结论

如果电脑已经安装 Git，推荐用 Git 命令发布；如果暂时没有 Git，也可以先把当前源码压缩包上传到 GitHub 新仓库。两种方式最终效果都可以进入公开仓库。

## 方式一：网页上传，适合第一次发布

1. 打开 GitHub。
2. 点击右上角 `+`，选择 `New repository`。
3. 仓库名建议：`short-drama-ai-clipper`。
4. 可见性选择 `Public`。
5. 不要勾选自动生成 README、LICENSE、.gitignore，因为本项目已经准备好了。
6. 创建仓库。
7. 在仓库页面选择 `uploading an existing file`。
8. 上传源码压缩包解压后的全部文件。
9. 提交说明填写：`Initial open source release`。

## 方式二：Git 命令发布，适合后续维护

在源码目录执行：

```powershell
git init
git add .
git commit -m "Initial open source release"
git branch -M main
git remote add origin https://github.com/你的用户名/short-drama-ai-clipper.git
git push -u origin main
```

## Release 发布

源码仓库建立后，Windows 运行包不要提交到代码目录。正确方式：

1. 进入 GitHub 仓库。
2. 点击 `Releases`。
3. 点击 `Draft a new release`。
4. Tag 建议：`v8.38.1`。
5. 标题建议：`短剧 AI 切片工具 v8.38.1`。
6. 附件上传 Windows 下载包：`short-drama-ai-clipper-windows-v8.38.1.zip`。
7. 附件上传源码包：`short-drama-ai-clipper-source-v8.38.1.zip`。
8. Release 说明参考 `docs/发布与演示指南.md`。

## 上传前最后检查

- 不能有 `.env`。
- 不能有真实视频、字幕、导出结果。
- 不能有 `review_state.json`、`settings.json`、`VERSION.json` 这类本机状态文件。
- 不能有 `node_modules/`。
- 不能有 `dist-desktop/`。
- 不能有旧 exe。
- README、LICENSE、CHANGELOG 必须存在。

## Windows 包说明

Windows 包为了让普通用户尽量双击即用，会把 Python 运行时和 `ffmpeg.exe` 一起放进 zip，因此体积会明显大于源码包。源码仓库不提交这些运行时二进制；它们只作为 Release 附件提供。

## 当前环境提示

当前源码目录已经可以使用 Git 管理。第一次公开发布前，仍应先完成本文的上传前检查。
