# 与开放平台 API 版的隔离约束

两个版本不得共享数据库、设备令牌、浏览器 Profile 或执行记录。网页执行器版没有 Worker、D1、GitHub OAuth Client 或 Actions Secret。

网页执行器版不导入 `OCEAN_APP_ID`、`OCEAN_APP_SECRET`、REST Access Token、Refresh Token 或 MCP API Key。GitHub Pages 只包含公开静态代码，不包含账户名称、规则、操作记录或任何凭证。以后即使增加网页写入，也只能由本机执行器完成，并保留独立的真实操作总开关。

发布前必须再次核对 GitHub 仓库名为 `qianchuan-browser-console`；任何仍指向 `qianchuan-console`、Cloudflare Worker 或 D1 的配置都应阻止发布。
