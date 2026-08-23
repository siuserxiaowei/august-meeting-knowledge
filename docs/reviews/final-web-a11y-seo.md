# Web、可访问性与 SEO 最终独立终审

## 结论

**PASS（本地发布前门禁）**。

- 审计基线：`6de5e3c194538d1731a6bee006ab0a48aefe93fa`
- 审计日期：2026-08-24（Asia/Shanghai）
- Blocker：**0**
- 产品代码改动：**0**
- 发布决定：本地构建与自动化验收允许进入部署阶段；GitHub Pages 的真实 HTTP、最终域名元数据与线上交互仍须按本文末尾清单复验。

本结论只覆盖当前仓库在本地静态构建及 Chromium 桌面/移动设备模拟中的行为，不把尚未部署的网络状态包装成已验证事实。

## 验收范围与方法

终审读取了项目级 `AGENTS.md`，并按以下三类证据交叉判断：

1. 正式 GitHub Pages 子路径构建：`BASE_PATH=/august-meeting-knowledge SITE_URL=https://siuserxiaowei.github.io npm run build`。
2. 现有 Playwright 完整验收：fixture 与真实内容分别在 Desktop Chrome、Pixel 7 模拟环境执行。
3. 对共用布局、页面模板、导航、交互脚本、SEO 端点和全局样式做只读源码审阅；重点核对服务端生成元数据、语义结构、键盘焦点、reduced motion 和移动端布局。

未使用尚未部署的线上响应、CrUX 或 PageSpeed 数据；因此不对生产 HTTPS、安全响应头和真实 Core Web Vitals 作通过声明。

## 证据摘要

### 1. 正式子路径构建：PASS

执行：

```text
BASE_PATH=/august-meeting-knowledge \
SITE_URL=https://siuserxiaowei.github.io \
npm run build
```

结果：

- 内容质量门禁：30/30 文件通过，错误 0。
- Astro 静态构建成功：46 个 HTML 页面生成，构建错误 0。
- 页面集合由 1 个首页、4 个公共索引/说明页、30 个会议详情、10 个综合洞察详情和 1 个 noindex 404 构成；对应 45 个可索引 canonical URL。
- `robots.txt` 与 `sitemap.xml` 同步生成。
- Astro 配置使用 `output: static`、目录式 URL 与 `trailingSlash: always`，正式 base 与站点 origin 均由上述环境变量注入。

### 2. 桌面与移动端 E2E：PASS

执行 `npm run test:e2e`，结果：

- fixture：16/16 通过。
- 真实内容：18/18 通过。
- 总计：34/34 通过。
- 两套测试均覆盖 Desktop Chrome 与 Pixel 7 模拟环境。

真实内容套件逐页访问首页、目录、学习路径、覆盖页、洞察目录、10 个洞察详情与 30 个会议详情，并验证：

- 所有公开路由返回 200，始终停留在 Pages 子路径内；
- 全站未出现 viewport 级横向溢出；
- 内部根路径链接均携带 base 前缀，样式资源也位于 base 下；
- 页面控制台 error 与未捕获 page error 均为 0；
- 30 个单场页的主要学习区块、证据区和 Agent Prompt 均能渲染；
- 10 个综合页的来源卡片链接有效，Prompt 可复制；
- 全文搜索、精确标签筛选、结果计数和清空筛选可用；
- 复制按钮能写入剪贴板并给出 `aria-live` 状态反馈；
- 首页第一次 Tab 聚焦跳转链接；
- reduced-motion 模式把动画时长降为 `0s`；
- 未知路由返回 404，错误页包含 `noindex`，返回首页链接保留子路径。

### 3. Canonical、meta、OG 与 JSON-LD：PASS

共用 `BaseLayout` 在静态 HTML 初始响应中统一输出：

- 唯一 `<title>`、description、viewport 与 `lang="zh-CN"`；
- `index,follow`，404 改为 `noindex`；
- self-referencing canonical；
- Open Graph 的 type、locale、site name、title、description、URL、image；
- Twitter card、title、description、image；
- canonical 和社交图片均基于 `Astro.site` 与正式 base 生成绝对 URL，不依赖客户端 JavaScript 注入。

结构化数据按页面语义提供：

- 30 个会议详情：`Article`；
- 10 个综合洞察详情：`Article`，并以 `isBasedOn` 关联公开会议 URL；
- 月度洞察目录：`CollectionPage` + `ItemList`；
- 覆盖页：`Dataset`。

首页、会议目录和学习索引没有强行添加不匹配的结构化数据；这不是索引 blocker。JSON-LD 在构建时写入初始 HTML，综合页和集合页还对 `<` 做了转义。会议页内容来自受 Schema 门禁约束的 JSON；本地测试确认每个会议详情均存在 JSON-LD。

### 4. Sitemap、robots 与 404：PASS

- 真实内容 E2E 断言 sitemap 恰含 `5 + 30 + 10 = 45` 个唯一公开 URL。
- sitemap 排除 404，不输出无意义的 `priority` 或 `changefreq`。
- 每个会议与综合页均在 sitemap 中有对应 URL。
- robots 响应为 200，并引用同一站点下的 sitemap。
- 404 页由共用布局输出 `noindex`，现有预览服务器对未知路由返回 HTTP 404。

### 5. 内部链接与 fragment：PASS

- 真实 E2E 全页扫描未发现逃出 Pages base 的内部绝对路径。
- 会议和综合详情的侧栏目录 fragment 与页面内真实 `id` 一一对应。
- 面包屑、卡片、学习路径、来源回链和页脚导航使用统一 `withBase()` 生成路径。
- 主导航根据当前路径输出 `aria-current="page"`。

### 6. 可访问性与键盘：PASS（自动化范围内）

- 文档有 `lang`、唯一主内容区和“跳到主要内容”链接；目标 `main` 可程序化聚焦。
- 主导航、面包屑、目录、文章、section、heading、list、time、dl 等结构与页面语义一致。
- 搜索框有可见 label 与 accessible name；标签为原生 button，并维护 `aria-pressed`。
- 搜索结果计数和复制状态使用 `role="status"` / `aria-live="polite"`。
- 行动清单提供 table/row/columnheader/cell 角色。
- 全局 `:focus-visible` 使用 3px 高可见青色轮廓；跳转链接聚焦时进入视口。
- 所有关键交互均为原生 link、button、input，不依赖不可聚焦的自定义点击容器。
- `prefers-reduced-motion: reduce` 同时关闭动画、过渡和平滑滚动；自动测试验证关键标题动画时长为 0。
- 移动端长目录和行动表使用局部横向滚动，全页面不产生横向溢出。

### 7. 对比度合理自动检查：PASS（设计 token 静态判断）

终审检查了全局颜色 token 及关键交互状态：正文深墨色位于浅纸色背景，主按钮使用浅色文字配深墨色或深朱红背景，focus 使用独立青色轮廓；弱化色主要用于辅助元数据而非主正文。未发现明显的同色、透明到不可读或仅依赖颜色传达状态的实现。

本项不是专业测色仪或完整 axe/WCAG 逐节点证明。部署后仍应在最终字体渲染和浏览器环境下补一次自动对比度扫描与人工抽查。

## 非 blocker 观察

- 卡片标题与箭头同时链接到同一详情页，会形成重复的相邻链接，但箭头具备明确 `aria-label`，不影响任务完成；后续若做更严格的屏幕阅读器降噪，可只保留一个可访问链接入口。
- 行动清单在窄屏采用组件内部横向滚动。这是对四列数据的有意保真，不属于 viewport 溢出；建议线上触屏实机确认滚动手势与可发现性。
- 通用页面不全部拥有 JSON-LD，但均有完整 canonical/meta/OG；结构化数据只放在语义明确的 Article、CollectionPage、Dataset 页面，属于合理选择。

## 部署后必须复验

以下项目依赖真实 GitHub Pages，当前不能本地证明，不计入本地 blocker：

1. `https://siuserxiaowei.github.io/august-meeting-knowledge/` 及 sitemap 中全部 45 个 URL 实际返回 200；未知 URL 返回 404，而不是错误的 200 soft-404。
2. 线上 HTML 的 canonical、`og:url`、`og:image` 与 Twitter image 均以 `https://siuserxiaowei.github.io/august-meeting-knowledge/` 为根，且图片返回 200、Content-Type 正确。
3. `robots.txt` 在线引用最终 sitemap；sitemap XML 可解析、45 个 URL 唯一且全部可访问。
4. GitHub Pages 不出现 asset 404、重定向链、混合内容、CSP/缓存配置导致的脚本失败或控制台错误。
5. 桌面与真实手机抽查首页、目录、至少一页 partial、一页 insufficient、一个综合页和 404；复测搜索、标签、复制、Tab 顺序、fragment 跳转与横向溢出。
6. 运行 Lighthouse 或 axe 的 Accessibility/SEO 检查，并人工抽查文本对比度、触控目标、200% 缩放与屏幕阅读器 heading/landmark 顺序。
7. 真实 HTTPS、安全响应头、LCP/INP/CLS 与 CrUX 数据；无 CrUX 时明确标注为无现场数据，不能用本地构建速度替代。

## 最终判定

当前 HEAD 在 Web 功能、子路径兼容、自动化可访问性基础、静态 SEO 与错误边界上没有发现阻止部署的问题。**本地终审 PASS，blocker 0；部署后需完成上述线上复验，才可把“线上发布验收”标为 PASS。**
