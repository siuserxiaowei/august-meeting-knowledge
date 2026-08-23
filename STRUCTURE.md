# 站点索引结构

公开站点使用一个动态 XML sitemap。构建时从已通过内容校验的会议与综合洞察 JSON 生成 canonical URL，不扫描文件系统中的私有目录，也不把 404 页面加入索引。

## 路由

- 固定页面：`/`、`/meetings/`、`/insights/`、`/learning/`、`/coverage/`
- 单场会议：`/meetings/{公开 slug}/`
- 综合洞察：`/insights/{公开 slug}/`
- 发现文件：`/sitemap.xml`、`/robots.txt`

`BASE_PATH` 决定 GitHub Pages 项目子路径，`SITE_URL` 决定 HTTPS origin。sitemap URL 与页面 canonical 由同一 Astro `site` 配置生成，避免根路径与项目子路径不一致。

## 质量门禁

- 不包含 404、noindex、重定向、私有逐字稿、飞书资源标识或测试 fixture。
- 不输出无法准确维护的 `lastmod`，也不使用已被主流搜索引擎忽略的 `priority` 与 `changefreq`。
- E2E 会核对 URL 数量、唯一性、HTTPS origin、Pages 子路径、全部会议/综合详情覆盖和 robots 引用。
