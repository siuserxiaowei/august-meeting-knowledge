# 部署后线上对抗终审

## 结论

**PASS。发布阻断项：0。**

本终审以最终部署提交 `aa8581d5e9aff0d39be9ce97777fb9208db6268f` 为唯一基线。GitHub Actions run [`32672013668`](https://github.com/siuserxiaowei/august-meeting-knowledge/actions/runs/32672013668) 的 `verify`、`build`、`deploy` 三个 job 均为 `success`；GitHub Deployments API 的 `github-pages` 记录也指向同一 SHA。正式站点为：

<https://siuserxiaowei.github.io/august-meeting-knowledge/>

## 验收范围与证据

验收于 2026-08-24 完成，直接请求正式站点并使用线上 JavaScript，没有以本地构建或 fixture 代替线上结果。

### 1. Pages、API 与 Actions：PASS

- 仓库为 public，默认分支为 `main`，`has_pages=true`。
- Pages `build_type=workflow`，正式 URL 与预期一致，并启用 HTTPS enforcement。
- 最终 deployment 记录：`github-pages`、`ref=main`、SHA 为 `aa8581d5e9aff0d39be9ce97777fb9208db6268f`。
- run `32672013668` 对同一 SHA 完成静态检查、覆盖率测试、两套 E2E、构建和部署，三项 job 全绿。

### 2. Sitemap 全量逐页请求：PASS

在线解析 `/sitemap.xml` 后得到 **45 个 `<loc>`、45 个 unique URL**，无重复，组成如下：

| 页面类型 | 数量 | HTTP 结果 |
|---|---:|---:|
| 首页 | 1 | 1/1 为 200 |
| 公共索引与边界页 | 4 | 4/4 为 200 |
| 单场会议页 | 30 | 30/30 为 200 |
| 综合洞察页 | 10 | 10/10 为 200 |
| 合计 | **45** | **45/45 为 200** |

逐页核对结果：

- 每页均有唯一且非空的 `<title>`、description、`lang=zh-CN`、viewport 和 `index,follow`。
- 45/45 canonical 与 `og:url` 都是当前页面的 HTTPS 绝对 URL；OG title/description 与页面 meta 一致。
- 结构化数据共 42 份且均可解析：30 个会议 `Article`、10 个综合 `Article`、1 个洞察目录 `CollectionPage`、1 个覆盖页 `Dataset`。首页、会议目录和学习索引不强加不匹配的 JSON-LD。
- 全部站内链接留在 `/august-meeting-knowledge/` base 下；站内目标均属于公开 canonical 集合，详情页目录 fragment 均能解析到真实元素。
- `/robots.txt` 返回 200、`text/plain`，允许抓取并准确引用线上 sitemap。

### 3. Asset、OG 图片与 404：PASS

- 从 45 页实际 HTML 汇总并请求 5 个唯一公开资源：公共 CSS、会议/综合交互脚本、默认 PNG OG 图和 SVG 图；全部返回 200，资源类型正确，无跳转。
- 线上不存在的随机路径返回真实 **HTTP 404**，不是 soft 404；页面含 `noindex`、中文错误说明和两个保留 base path 的恢复入口。
- 404 不进入 sitemap。GitHub Pages 对任意缺失路径复用静态 `404.html`，因此该错误页 canonical/`og:url` 指向 `/404/`；在 `noindex` 前提下不构成索引或内容阻断。

### 4. 桌面、移动与真实交互：PASS

使用 Playwright Chromium 直接访问正式站点，覆盖桌面 `1440×900` 和移动 `390×844`（DPR 3）两种上下文。两端均实际检查首页、会议目录、partial 详情、insufficient 详情、综合页、学习索引、策展学习地图和 404。

- 搜索“模型评测”得到 4 场；同名标签筛选得到 4 场，`aria-pressed` 正确；再次切换恢复 30 场。
- 无命中状态可见，清空后恢复 30 场；键盘触发清空后焦点返回搜索框。
- 学习索引实际渲染 30 个条目，“进入策展学习地图”正确到达对应综合页。
- partial 页面显示“部分提炼”，insufficient 页面显示“证据不足”，二者都有“证据与边界”；未把低覆盖内容包装成完整会议。
- 单场与综合页 Prompt 均能写入剪贴板；读取值与页面隐藏源文本逐字一致，成功状态可见。
- 单场 `#agent-kit` 与综合页 `#related-meetings` 的 fragment 更新正确并命中既有目标。
- 首次 Tab 聚焦“跳到主要内容”，焦点样式可见；Enter 后焦点进入 `#main-content`。主导航当前页状态唯一且正确。
- 所有抽查页面在两个视口的 `scrollWidth - innerWidth` 都为 0，无页面级横向溢出。
- 所有 200 页面旅程均无 console error/warning、`pageerror` 或失败请求。主动访问预期 404 时浏览器会记录该文档自身的 404 网络行，这是被测结果，不是页面运行时故障。

### 5. 公开面隐私与秘密扫描：PASS

对 sitemap、robots、45 份线上 HTML、公开文本资源和 404 共 **51 个公开表面**做对抗扫描，敏感命中为 **0**。覆盖类别包括：

- 本机绝对路径、私有来源目录名、`.local` 身份；
- 飞书/Lark 私有 URL、访问令牌、应用凭证与 webhook；
- GitHub/OpenAI token、JWT、私钥和常见 secret assignment。

扫描输出只记录命中类别与数量，不回显潜在秘密。线上页面也没有发现第三方外链 origin。

## 限制

- 这是对 2026-08-24 最终部署快照的验收；后续重新部署必须再次跑同等门禁。
- 浏览器交互覆盖 Chromium 的桌面与移动仿真，没有声明 Safari/Firefox 的完整兼容性。
- 自动秘密扫描用于发现可枚举泄漏，不替代已经完成的内容语义隐私审阅与 Git 历史审计。

## 最终判定

最终部署满足 45 个公开 canonical URL 全量可达、元数据和结构化数据闭合、交互可用、移动端无横向溢出、404 正确、公开面无已识别敏感泄漏的上线标准。**可交付，无 blocker。**
