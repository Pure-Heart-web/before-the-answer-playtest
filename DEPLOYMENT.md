# v0.7 GitHub Pages 发布说明

## 构建

```bash
npm test
npm run build
```

构建结果位于 `dist/`。发布目录结构已经调整为：

- `/` 或 `/index.html`：玩家测试邀请页。
- `/game.html`：游戏与匿名测试流程。
- `/privacy.html`：测试数据说明。
- `/research.html`：研究者观察台。

所有链接使用相对路径，可部署在域名根目录或子路径；不需要服务端程序和数据库。

## 本地检查发布产物

```bash
npm run preview
```

然后打开 `http://localhost:4180/`。这里提供的是构建后的发布目录，不是开发源码目录。

## 已准备好的自动发布

`.github/workflows/pages.yml` 会在每次推送到 `main` 时自动执行测试、构建并发布 `dist/`。构建时会把仓库地址写入页面，使“问题与删除请求”链接指向仓库 Issues。

本机首次发布需要先登录 GitHub：

```bash
gh auth login
```

登录完成后，在本项目目录创建公开仓库并推送：

```bash
gh repo create before-the-answer-playtest --public --source=. --remote=origin --push
```

然后进入仓库的 **Settings → Pages**，在 **Build and deployment** 中选择 **GitHub Actions**。工作流完成后，仓库首页的 Deployments 区域会显示公开地址。

仓库名 `before-the-answer-playtest` 是当前建议名；正式创建前可以替换。公开仓库会公开本原型源码、Issue 和提交历史。

## 公开发布范围

当前页面和反馈入口适用于小范围邀请测试：

- 游戏不会自动上传测试记录。
- 仓库 Issues 只用于公开反馈或凭匿名 `runId` 提出删除请求，禁止粘贴完整 JSON。
- 玩家是否把导出的 JSON 私下发送给维护者，仍由玩家决定。
- 如果以后开始大范围公开招募，必须再补充真实负责人、非公开联系方式、实际保存期限和删除执行流程。

这些信息取决于发布主体与平台，当前原型不能替发布者做决定。

## 发布后检查

- 根地址首先显示邀请页。
- “参加匿名测试”进入 `game.html?test=1` 并显示基线问题。
- “数据说明”可以从邀请页、游戏和观察台打开。
- 游戏完成后能导出匿名JSON。
- `research.html` 能载入演示记录。
- 手机或窄屏支持尚未完成，本轮测试应明确要求使用桌面浏览器。
- 仓库 Issues 能显示结构化的“试玩反馈或记录删除请求”表单。
