# 最终独立终审 2：全仓隐私与敏感信息

- 审查日期：2026-08-24
- 审查基线：`4879aa0`
- 审查范围：当前 106 个 Git 跟踪文件、`content/meetings` 30 份公开会议 JSON、`content/syntheses` 10 份综合 JSON、干净归档构建出的 54 个公开文件，以及本地全部 15 个可达 refs、69 个可达提交和 164 个可达 blob
- 审查边界：未打开、读取或摘录仓库外私有逐字稿正文；仅核对禁止目录及其文件未进入 Git。未检查尚不存在的 GitHub 远端、线上 Pages、外部缓存或历史 Actions artifact
- 记录原则：疑似敏感值只记录分类、位置、数量或截断 SHA-256，不在本报告回显原值

## 结论

**FAIL / BLOCKED：当前版本不得创建或推送公开 GitHub 仓库。**

公开站点构建产物本身未发现高置信秘密、联系方式、飞书私有资源标识或本机路径；但公开仓库仍会暴露两项仓库级信息：一条真实本机绝对私有路径，以及 Git 可达提交中的 `.local` 作者/提交者邮箱元数据。两项均须在首次公开推送前清除，并对全部 refs 与重写后的构建产物复扫。

## 发布阻断项

### P0：Git 历史仍含 `.local` 作者/提交者邮箱

- `main` 可达 58 个提交，其中 55 个提交的作者和/或提交者邮箱使用 `.local` 域。
- 全部本地 refs 可达 69 个提交，其中 66 个提交含该元数据；另有 3 个提交使用 GitHub noreply 邮箱。
- `.local` 邮箱不是凭证，但会在公开 Git 历史中永久披露本机生成的身份/主机线索，且简单修改当前 Git 配置无法清除既有提交。
- 修复要求：在移除或协调所有 worktree 后，统一重写所有准备公开的 refs，将作者与提交者身份改为批准的 noreply 身份；删除不准备发布的旧 refs；随后重新统计，要求公开可达集合中的 `.local` 邮箱提交为 0。

### P0：受跟踪规则文件含真实本机绝对私有路径

- 位置：`AGENTS.md:9`
- 类型：本机用户名 + 私有会议存储目录 + `raw` 子目录
- 命中值 SHA-256 前 12 位：`1b34d724ad55`
- 该文件不会进入 Pages 的 `dist`，但会随公开 GitHub 仓库直接公开；`.gitignore` 不能保护已写进受跟踪文件的路径文本。
- 修复要求：把规则改成不含用户名和私有目录名的占位表达或仓库外说明；完成历史重写后确认旧 blob 不再被任何准备公开的 ref 引用。

## 已通过检查

### 当前公开内容与受跟踪文件

- `npm run content:check`：30/30 会议 JSON 通过，0 个错误；状态为 0 complete、26 partial、4 insufficient。
- 对当前全部受跟踪文本扫描飞书 `note_id` / `meeting_id` / minute token、私有飞书 URL、资源 ID、Bearer/JWT、GitHub/GitLab/AWS/Slack token、PEM 私钥、密码/验证码、邮箱、手机号、IP、账号标识和 source map 标记。
- 高置信 token、私有 URL、邮箱、手机号、私钥和凭证形态的命中仅位于自动门禁的合成测试 fixture；公开飞书域名命中仅位于公开开发文档白名单测试。它们不是从会议来源获得的真实值，也未进入正式构建。
- 除阻断项 `AGENTS.md:9` 外，其他本机绝对路径命中均为脱敏门禁的合成攻击样例。
- 30 份会议 JSON 和 10 份综合 JSON 未发现高置信具名个人、联系方式、详细住址、账号、凭证或以显式字段披露的客户/供应商真实身份。角色词、公开平台名、产品类别和公开来源标题不按秘密处理。
- 未发现受跟踪的 `raw/`、`private/`、私有 source manifest、逐字稿文件、环境文件、符号链接或 Git submodule。

### Git 可达对象与引用

- `git rev-list --objects --all` 检查到 164 个可达 blob；未发现路径名落入 `raw`、`private`、transcript、minute、`.env`、source manifest、credential 或 secret 类目录/文件名。
- 历史 blob 中的资源 ID、私有 URL、电话、邮箱、私钥和 token 形态均来自同一批合成门禁测试；没有发现私有逐字稿或来源映射 blob。
- 15 个 ref 名均未包含 token、secret、meeting/note ID、private/raw/transcript、邮箱或本机绝对路径；无 tag、无 remote ref。
- 69 条提交消息未命中私有存储标记、meeting/note ID、minute token、绝对路径或邮箱。

### 构建产物、Actions 与 source map

- 从 `git archive 4879aa0` 得到的干净副本执行 `npm run check`：41 个文件，0 error、0 warning、0 hint。
- 使用正式 Pages 参数构建成功：46 pages；`dist` 共 54 个文件、2,374,030 bytes。
- 对 `dist` 的 HTML、JS、CSS、XML、TXT、SVG 扫描结果：本机绝对路径 0、私有存储标记 0、飞书私有 URL/资源 ID 0、凭证/私钥/JWT/Bearer 0、邮箱 0、手机号 0、source map 注释 0；`.map` 文件 0。
- 构建产物中的外部主机只属于 canonical 站点、Schema.org、W3C 与 sitemap 标准命名空间；未发现飞书租户或其他私有主机。
- `.github/workflows/deploy-pages.yml` 的发布 artifact 路径严格为 `dist`；未上传源码、coverage、Playwright 报告、测试 fixture、环境文件或工作区根目录。
- `.gitignore` 已覆盖 `.env*`、`private/`、`raw/`、`dist/`、coverage、Playwright 报告和测试结果。该保护只对未跟踪文件有效，不能替代 Git 历史清理。

## 语义隐私判断与剩余风险

- 当前内容以角色、流程和业务类型表述，未发现可直接使用的真实姓名或未公开客户/供应商名称；但日期、来源标题、活动品牌、城市、细分业务和事故类型组合后，仍可能让熟人完成身份拼图。自动扫描不能证明匿名性。
- 公开来源标题和少量公开品牌/城市信息属于有意保留的溯源语境，不是秘密；是否具备参会者或内容权利人的公开授权，超出本次纯仓库扫描能够证明的范围。
- `.gitignore` 只阻止未来误纳入；若重写历史时遗漏某个 branch/ref，旧 blob 与 `.local` 邮箱仍可能随推送公开。
- 当前没有远端，因此未核验 GitHub secret scanning、分支保护、Pages artifact、缓存、fork、release 或搜索引擎副本。首次推送后仍需独立线上对抗验收。

## 解锁发布的验收条件

1. 删除或泛化 `AGENTS.md:9` 的真实本机绝对私有路径。
2. 重写所有准备公开 refs 的作者与提交者邮箱，公开可达提交中 `.local` 命中必须为 0。
3. 删除不发布的旧分支/refs，并同时检查 reflog、备份 refs 与遗留 worktree；确认它们不会被推送。
4. 重新运行全部 refs/blob 扫描、`npm run content:check`、`npm run check` 和正式 Pages 构建；对新的 `dist` 复扫并要求本报告所列高置信类别全部为 0。
5. 创建远端后核对实际推送 refs 与 GitHub 提交元数据，再检查 Actions 上传清单和部署后的每个 sitemap URL。

在以上条件全部满足前，本终审结论保持 **FAIL / BLOCKED**。
