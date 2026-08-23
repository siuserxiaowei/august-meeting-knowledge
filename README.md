# 八月会议知识场

将 2026 年 8 月可访问的飞书会议妙记整理成适合缺席者学习、个人知识库复用与 AI Agent 对话的公开知识站。

原始逐字稿不进入仓库；公开页面只包含独立提炼、来源时间锚点和脱敏后的知识结构。

截至 2026-08-24，站点覆盖 30 条可访问妙记：30 条均有对应公开页，其中 26 条为部分提炼、4 条为证据不足、0 条被标为完整提炼。同一时间范围另有 2 场历史 VC 会议，但详情中没有可访问的智能纪要或妙记录制引用，因此不按标题伪造内容页。公开方法与状态口径见 `/coverage/`。

## 本地运行

需要 Node.js 22 或更新版本。

```bash
npm ci
npm run dev
```

站点默认读取 `content/meetings/*.json`，并将通过关联校验的 `content/syntheses/*.json` 生成为 `/insights/` 月度洞察。综合内容只能引用已公开会议 slug，断链会令构建失败；目录为空时页面显示可访问空态。测试数据只位于 `tests/fixtures/content` 与 `tests/fixtures/syntheses`，不会进入正式构建：

```bash
BASE_PATH=/meeting-knowledge npm run build:fixtures
BASE_PATH=/meeting-knowledge npm run preview:test
```

## 内容质量门禁

构建前会自动运行一个只依赖 Node.js 标准库的公开内容检查器。它不调用飞书，也不读取仓库外的私有逐字稿。检查范围包括：

- 必填字段、嵌套结构、枚举、日期、时长、时间锚点与锚点不晚于录音结束；每个主题/讨论引用时码必须在 `sourceAnchors` 留有记录，允许额外证据与重复引用；
- 文件名、公开 slug 与跨页面唯一性；
- 规范化 Unicode、零宽字符和 URL 编码后，检测疑似飞书资源标识/私有 URL、全角或国际联系方式、IPv4/IPv6、账号 ID、详细地址、具名外部主体与个人财务语境；
- 检测 Bearer/JWT、GitHub/GitLab/AWS/Slack token、PEM 私钥、密码、密钥与验证码，并防止标题、字段名、文件路径、CLI 参数和错误报告回显敏感值；
- 信息量、占位词、重复页面、来源锚点，以及 `complete` / `partial` / `insufficient` 状态覆盖；仅对明确记录“无可用转写/无发言记录”且不含主题或讨论的 `insufficient` 页面允许空锚点，禁止用录音起点制造伪锚点。

报告只显示敏感内容类型和字段路径，不回显命中的值。

锚点闭包缺口使用稳定错误码 `ANCHOR_NOT_DOCUMENTED`。修复时应回到已授权来源核对该时码，再为 `sourceAnchors` 补写去敏主题说明；不要为了让门禁通过而自动复制未经审计的时码或原文。

```bash
npm run content:check
npm run content:check:json
npm run content:check -- --json-out reports/content-quality.json
```

## 验证

```bash
npm run check
npm run test:coverage
npm run test:e2e
npm run build
```

- Node 测试覆盖 Schema、脱敏、重复度、状态统计与 CLI，行、函数和分支覆盖率均强制不低于 80%。
- Vitest 覆盖站点内容加载、统计、学习路径、搜索和子路径拼接，四项全局覆盖率门槛均为 80%。
- Playwright 分别以 fixture 与真实 `content/meetings` 构建站点，在桌面和移动 Chromium 验证首页统计、搜索筛选、每场详情的完整知识区块、复制 Agent Prompt、学习路径、404、键盘焦点、reduced-motion、Pages 子路径、浏览器错误和横向溢出。真实套件会自动读取当前全部公开 JSON，新会议加入后无需维护固定页面清单。
- `BASE_PATH` 控制 GitHub Pages 项目子路径；`SITE_URL` 控制 canonical 与 Open Graph 绝对地址。

## 发布到 GitHub Pages

`.github/workflows/deploy-pages.yml` 会在 `main` 更新时运行类型检查、两套覆盖率测试、浏览器旅程和内容门禁，再根据仓库名称计算 Pages 子路径并发布 `dist`。在 GitHub 仓库 Settings → Pages 中将 Source 设为 **GitHub Actions**。

部署只读取 `content/meetings`，不会发布测试 fixture、原始逐字稿、资源 token 或私有映射台账。
