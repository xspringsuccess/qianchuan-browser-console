# 千川网页规则台（独立浏览器版）

这是与开放平台 API 版本完全隔离的“GitHub Pages 静态看板 + 本机网页执行器”。本机执行器只在电脑开机时运行，使用独立 Chrome 用户目录；千川 Cookie、密码、验证码、规则和执行记录均不上传云端。

当前阶段实现：静态看板、本机一次性会话、专用浏览器启动、在线状态和千川页面状态检测。真实预算与计划启停尚未开放。

## 隔离边界

- 独立目录：`E:\codex\千川网页执行器`
- 独立公开 GitHub Pages 仓库：`qianchuan-browser-console`
- 不使用 Cloudflare Worker、D1 或 GitHub OAuth App
- 独立本机数据库：`.local/`
- 独立浏览器用户目录：`%LOCALAPPDATA%\QianchuanBrowserConsole\`
- 不读取或修改 `E:\codex\千川`，不复用其数据库、授权或真实写入开关

## 本地验证

```powershell
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/static-dev.mjs
```

开发预览地址为 `http://127.0.0.1:8797`。日常使用双击根目录的 `启动千川网页执行器.cmd`；启动器会打开 GitHub Pages 看板和千川专用页面。不要直接从收藏夹打开看板：直接打开的页面没有本机会话令牌，无法连接执行器。

启动器使用软件渲染模式，以兼容 GPU 子进程受限的 Windows 环境。首次启动后，请只在启动器打开的专用浏览器窗口中登录千川。
