# 最终独立终审 6：仓库安全与发布链

- 日期：2026-08-24
- 基线：`f78f08b`
- 结论：**PASS（仓库可公开；远端与线上检查仍须在部署后完成）**

## 发布门禁

- 先前 blocker 1（真实 `/Users/...` 私有绝对路径）：**0**。
- 先前 blocker 2（`.local` 作者/提交者邮箱）：**0**。
- 当前受跟踪树、全部 refs 与 Git 对象库未发现这两类残留。
- 未发现 raw/private transcript、source manifest、飞书资源 token、私有 URL、真实凭证或联系方式进入发布树。
- 合成测试中的攻击 marker 仅用于门禁测试，不是来源数据或真实泄漏。
- 未跟踪 `.env*`、`private/`、`raw/`、构建、覆盖率、Playwright 报告与测试结果；未跟踪 source map。

## Git 与对象证据

- 两个本地分支 ref 指向同一份压平后的提交；无 tag、remote ref 或已配置 remote。
- 当前提交作者与提交者均为批准的 GitHub noreply 身份。
- 对象库为单个 pack、139 个对象、0 个 loose object；严格 `fsck` 未报告坏对象或不可达对象。
- reflog 只引用当前压平提交，不保留旧历史。
- `count-objects` 提示的 64-byte worktree 管理项不属于 Git 对象或可推送 ref；回收本审计 worktree 时一并消失。

## Actions 与依赖

- workflow 仅由 `main` push 或手动触发，权限为 `contents: read`、`pages: write`、`id-token: write`。
- 链路为 `npm ci` → check/coverage/E2E → 正式 build → 仅上传 `dist` → Pages OIDC 部署。
- verify 通过后才 build，build 通过后才 deploy；artifact 路径未覆盖源码、fixture、环境文件或报告目录。
- lockfileVersion 3；`npm audit --package-lock-only --audit-level=low` 检查 413 个依赖，0 个已知漏洞。
- 本审计 worktree 未安装 `node_modules`，因此未把本地 `npm ls` 作为安装完整性证据；CI 的干净 `npm ci` 是最终证据。

## 非阻断剩余项

- GitHub Actions 使用官方 action 的 major tag，而非完整 commit SHA；可在后续供应链加固时固定 SHA。
- 当前尚无远端，无法在本审查中核验实际推送 refs、GitHub secret scanning、Pages 设置、Actions artifact 与线上响应。
- 首次推送后必须复核 workflow 全绿、artifact 清单、部署 URL、全部 sitemap URL，并对线上产物再次执行敏感信息扫描。
