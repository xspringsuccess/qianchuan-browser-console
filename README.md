# 千川网页规则台（独立浏览器版）

这是与开放平台 API 版本完全隔离的“GitHub Pages 静态看板 + 本机网页执行器”。本机执行器只在电脑开机时运行，使用独立 Chrome 用户目录；千川 Cookie、密码、验证码、规则和执行记录均不上传云端。

当前阶段实现：静态看板、本机一次性会话、专用浏览器启动、在线状态和千川页面状态检测。真实预算与计划启停尚未开放。

## 隔离边界

- 独立目录：`E:\codex\千川网页执行器`
- 独立公开 GitHub Pages 仓库：`qianchuan-browser-console`
- 不使用 Cloudflare Worker、D1 或 GitHub OAuth App
- 独立本机配置与浏览器用户目录：`.local/`
- 不读取或修改 `E:\codex\千川`，不复用其数据库、授权或真实写入开关

## 本地验证

```powershell
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/static-dev.mjs
```

开发预览地址为 `http://127.0.0.1:8797`。日常使用双击根目录的 `启动千川网页执行器.cmd`；启动器会打开 GitHub Pages 看板和千川专用页面。
