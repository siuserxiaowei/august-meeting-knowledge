# 30 篇会议知识页跨页去重终审

- 审查日期：2026-08-24
- 审查范围：`content/meetings` 当前 30 篇公开 JSON
- 审查字段：`title`、`abstract`、`forAbsentees`、`coreTopics`、`transferableKnowledge`、`daoFaShuQiShi`、`agentKit`
- 审查边界：只读公开 JSON；未读取私有逐字稿，未修改任何会议 JSON
- 结论：**PASS（带两项非阻断改进建议）**

## 结论

当前 30 篇页面没有跨页整字段完全重复，也没有逐条知识项完全重复；现有内容质量门禁也没有发现整页正文指纹重复。3-gram 相似度的高值主要集中在 4 篇 `insufficient` 页面使用的证据审计、停止推断和补证门槛语言。人工复核后，这些重叠属于同一治理协议在不同证据形态下的合理复用，而不是把同一场会议内容机械改写后分配到多页。

同一系列的分段页具有独立来源标题、时长或证据区间，并呈现不同的主题集合与可迁移知识。没有发现相邻分段重复总结同一段录音，或把上一分段结论不加依据地延续到下一分段。每页都有可辨认的独有价值，详见“系列分段核对”和附录。

本次没有修改重复检测工具。原因是现有样本没有足够明确的机械近重复可以作为低误报的阻断规则；若直接把当前人工审阅阈值升级为发布门禁，会错误阻断证据不足页必须共享的安全协议，也会把同一工程领域中的合理概念复用误判为抄写。现有门禁的局限仍需明确：它只能自动阻断整页规范化后的完全重复，近重复继续依赖离线相似度筛查与人工判断。

## 可复现方法与阈值

### 1. 规范化 exact

对每个候选字符串执行：

1. Unicode `NFKC` 规范化；
2. 转小写；
3. 删除所有非字母、非数字字符；
4. 比较规范化字符串是否相同。

整字段按 30 篇两两比较，共 `C(30,2)=435` 对。数组或对象字段按公开阅读顺序拼接后比较，同时将下列条目拆开做 item-level 比较：

- `coreTopics[]`：`title + explanation`
- `transferableKnowledge[]`：4 个文本字段
- `daoFaShuQiShi`：5 层 `summary`
- `agentKit`：`context`、`prompt`、每个 `question`、每张知识卡

结果：7 类整字段的 exact 均为 0；长度至少 12 个规范化字符的逐条知识项 exact 也为 0。仓库门禁的规范化整页 SHA-256 指纹同样为 0 组重复。

### 2. 3-gram Jaccard 与 containment

在同一规范化文本上建立重叠字符 3-gram 集合：

- `Jaccard = |A ∩ B| / |A ∪ B|`
- `containment = |A ∩ B| / min(|A|, |B|)`

本次使用的是**人工审阅阈值**，不是发布失败阈值：

- 整字段：`Jaccard >= 0.10` 或 `containment >= 0.30`
- 逐条知识项：较短文本至少 12 字，且 `Jaccard >= 0.20` 或 `containment >= 0.55`

阈值用于高召回地挑出候选；是否构成问题由人工检查输入证据、页面用途、关键主张、操作步骤、边界条件和来源锚点决定。字符 3-gram 对短标题和固定术语较敏感，因此数值不可直接当作语义重复率。

以下 Node 22 脚本可在仓库根目录复算整字段 top pair、exact 数量与逐条候选数量：

```bash
node --input-type=module <<'NODE'
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const directory = "content/meetings";
const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
const documents = await Promise.all(files.map(async (file) => ({
  id: file.slice(0, -5),
  meeting: JSON.parse(await readFile(path.join(directory, file), "utf8"))
})));
const normalize = (value = "") => value.normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "");
const grams = (value, size = 3) => {
  const text = normalize(value);
  const result = new Set();
  if (text.length < size) {
    if (text) result.add(text);
    return result;
  }
  for (let index = 0; index <= text.length - size; index += 1) {
    result.add(text.slice(index, index + size));
  }
  return result;
};
const similarity = (left, right) => {
  const a = grams(left);
  const b = grams(right);
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return {
    exact: normalize(left) !== "" && normalize(left) === normalize(right),
    jaccard: intersection / (a.size + b.size - intersection || 1),
    containment: intersection / (Math.min(a.size, b.size) || 1),
    minimumLength: Math.min(normalize(left).length, normalize(right).length)
  };
};
const units = (field, meeting) => {
  if (["title", "abstract", "forAbsentees"].includes(field)) return [meeting[field]];
  if (field === "coreTopics") {
    return meeting.coreTopics.map((item) => `${item.title}。${item.explanation}`);
  }
  if (field === "transferableKnowledge") {
    return meeting.transferableKnowledge.map((item) => Object.values(item).join("。"));
  }
  if (field === "daoFaShuQiShi") {
    return Object.values(meeting.daoFaShuQiShi).map((item) => item.summary);
  }
  return [
    meeting.agentKit.context,
    meeting.agentKit.prompt,
    ...meeting.agentKit.questions,
    ...meeting.agentKit.knowledgeCards.map((item) => `${item.name}。${item.content}`)
  ];
};

for (const field of [
  "title", "abstract", "forAbsentees", "coreTopics",
  "transferableKnowledge", "daoFaShuQiShi", "agentKit"
]) {
  const aggregatePairs = [];
  const itemPairs = [];
  for (let left = 0; left < documents.length; left += 1) {
    for (let right = left + 1; right < documents.length; right += 1) {
      const leftUnits = units(field, documents[left].meeting);
      const rightUnits = units(field, documents[right].meeting);
      aggregatePairs.push({
        ...similarity(leftUnits.join("；"), rightUnits.join("；")),
        pair: `${documents[left].id} <> ${documents[right].id}`
      });
      for (const leftItem of leftUnits) for (const rightItem of rightUnits) {
        itemPairs.push(similarity(leftItem, rightItem));
      }
    }
  }
  aggregatePairs.sort((a, b) => b.jaccard - a.jaccard || b.containment - a.containment);
  console.log(field, {
    aggregateExact: aggregatePairs.filter((item) => item.exact).length,
    maximum: aggregatePairs[0],
    itemExact: itemPairs.filter((item) => item.minimumLength >= 12 && item.exact).length,
    itemReviewCandidates: itemPairs.filter((item) => item.minimumLength >= 12 &&
      (item.jaccard >= 0.20 || item.containment >= 0.55)).length
  });
}
NODE
```

### 3. 最大整字段相似度

| 字段 | 最大 Jaccard | containment | 页面对 | 人工判断 |
|---|---:|---:|---|---|
| `title` | 0.296 | 0.471 | `2026-08-10-ai-project-daily-segment-4` ↔ `2026-08-13-ai-startup-project-segment-4` | 都以“证据不足：分段 4”提示状态，但一个是完全无发言，另一个是仅有末段两条敏感且不可归因记录；标题正确表达不同缺口 |
| `abstract` | 0.142 | 0.267 | `2026-08-10-ai-project-daily-segment-1` ↔ `2026-08-13-ai-project-daily-segment-1` | 同为六小时开放开发现场，开头结构相似；前者聚焦配置、数字人与小程序，后者聚焦数据覆盖、结算状态机、规格和跨端验收 |
| `forAbsentees` | 0.412 | 0.636 | `2026-08-10-ai-project-daily-segment-4` ↔ `2026-08-13-ai-startup-project-segment-4` | 共享“不从标题补写”的停止规则；前者针对零转写，后者还强调孤立敏感片段不得归因 |
| `coreTopics` | 0.026 | 0.050 | `2026-08-11-ai-agent-implementation-segment-3` ↔ `2026-08-13-ai-startup-project-segment-4` | 极低；前者的独有风险是疑似不当研究行为，后者是成人敏感/疑似违法语境的最小披露 |
| `transferableKnowledge` | 0.064 | 0.134 | 同上 | 同属证据审计，但边界、补证动作和敏感发布风险不同 |
| `daoFaShuQiShi` | 0.134 | 0.243 | 同上 | 共享“知识库对证据负责”的道层；法、术、器、势均依据各自材料缺口展开 |
| `agentKit` | 0.166 | 0.306 | 同上 | 两个都是证据审计 Agent；一个突出不当研究与声誉归因，一个突出成人敏感内容、产物对应和最小披露 |

## 高风险对人工复核

### 证据不足页：合理共享协议，不是重复内容

重点复核 4 页：

- `2026-08-08-poker-session-segment-3`
- `2026-08-10-ai-project-daily-segment-4`
- `2026-08-11-ai-agent-implementation-segment-3`
- `2026-08-13-ai-startup-project-segment-4`

三组相似语言反复出现：覆盖审计、禁止根据标题补写、补齐连续证据后才升级状态。这是项目协议要求的可信停止机制，不应为了“看起来不同”而改写。四页仍有清楚分工：

- 扑克分段 3 有 37 个稀疏时间块和多种背景媒体，独有价值是三态音源分类、扑克领域证据门槛与手牌事件台账。
- 8 月 10 日分段 4 完全没有可用发言，独有价值是空锚点处理、元数据与内容证据分离、取得材料后从零重审。
- 8 月 11 日分段 3 只有末段两条短发言，独有价值是疑似不当研究内容的声誉风险与不可归因规则。
- 8 月 13 日分段 4 只有末段两条不连续且敏感记录，独有价值是成人敏感/疑似违法风险的最小披露和独立隐私复核。

逐条筛查中，证据不足页在 Agent 问题、知识卡和“器”层出现最高 containment；它们表达相同的升级门槛或需要补取的原始产物，属于安全治理协议，不是会议知识的重复。真正要避免的是把这些补证模板伪装成会议本身的新知识；当前页面均明确标记 `insufficient`，没有这样做。

### 开放开发现场：结构套话偏多，但主题有实质差异

`2026-08-10-ai-project-daily-segment-1` 与 `2026-08-13-ai-project-daily-segment-1` 的摘要相似度是完整页中最高值。人工逐项比较后：

- 8 月 10 日页面独有配置快照与回滚、推理面逐跳鉴权、数字人感知基准、平台主体/角色/权威字段治理。
- 8 月 13 日页面独有数据覆盖矩阵、资格分发状态机与双账平衡、规格版本键、跨端旅程、语音链路打点、硬件接收与同口径网络验收。

共享的只是“长时开放现场—排除背景音—用证据验收”的编辑框架，以及故障要单变量取证的通用原则；没有同一段内容的机械复刻。摘要开头确有模板感，但不影响两页独有知识，列为非阻断编辑改进。

### 同领域近似知识卡：合理重叠

逐条相似度还挑出以下代表性候选：

- `2026-08-08-ai-business-tech-segment-1` 的“四层排障卡” ↔ `2026-08-10-ai-project-daily-segment-1` 的“六层排障卡”：前者是客户端部署矩阵，后者把配置、账号路由、上游和本机资源分开，层级与场景不同。
- `2026-08-10-ai-project-daily-segment-1` 的“音源归因卡” ↔ `2026-08-13-ai-project-daily-segment-2` 的“音源边界卡”：都是长录音治理，但来自不同日期，且分别服务于开发现场与数量级/项目比较页面；属于跨页通用协议。
- `2026-08-08-poker-session-segment-2` ↔ 分段 3 的“静音、识别失败、导出截断或产物错配”问题：两页都在核对同系列长录音覆盖，问题对象分别是约五小时后的缺失区与 1 小时 47 分钟空档，合理延续而非重复分段内容。

## 同系列分段核对

| 系列 | 分段边界与独有价值 | 结论 |
|---|---|---|
| 8 月 8 日 AI 业务技术（3 页） | 分段 1：Skill、垂直教育、跨境主体、定价与部署；分段 2：控制面/推理面、模型能力契约、容量与定制报价；分段 3：网关错误、受控重试、脚本化、研究产物和边缘硬件 | 主题相邻但无机械重复；每段 source anchor 位于各自相对时轴，独立成页合理 |
| 8 月 8 日扑克（3 页） | 分段 1：真实牌局规则、概率与过程复盘；分段 2：混合现场里的模型接入、学习、灾害数据与增长实验；分段 3：证据不足、音源分离和扑克事件台账 | 标题系列与实际内容不总一致，但页面已显式纠偏；没有依据系列标题强行重复扑克结论 |
| 8 月 10 日 AI 项目（4 页） | 分段 1：配置、鉴权、数字人、小程序上线；分段 2：CI、后端联调、应用类型与独立验收；分段 3：产品/商业六级证据链、语音、硬件、支付与 Agent 轨迹；分段 4：零转写停止页 | 同一项目的“验收/证据”术语合理延续，交付对象与检查方法不同；分段 4 没有挪用前三段结论 |
| 8 月 10 日工作事项（3 页） | 分段 1：模型评测、项目复用、流量路径与 Agent 并行；分段 2：硬件原型链路、模型部署干扰与持久会话；分段 3：语音场景验收、溯源、依赖图和完整用户旅程 | 三页覆盖明显不同，唯一较高领域重叠是“先定义验收再选模型”，属于合理方法复用 |
| 8 月 11 日 Agent 落地（3 页） | 分段 1：并发看板、环境契约、数据管线、模块 owner 与付款门；分段 2：任务范围、语音管线、线上访问、模型就绪、成本与可靠上传；分段 3：末段两条孤立发言的证据/声誉风险 | 前两段从交付协作和运行控制两个侧面互补；分段 3 明确停止，没有复刻前两段 Agent 结论 |
| 8 月 13 日 AI 项目（2 页） | 分段 1：数据覆盖、结算状态机、规格、跨端、语音/网络/硬件；分段 2：数量级核验、项目评分、调查质量、基础设施验收与标题实验 | “证据/验收”是共同编辑原则，具体方法与产物不同 |
| 8 月 13 日 AI 创业（4 页） | 分段 1：语音栈、企业流程、深科技、多 Agent DAG 与真实评测；分段 2：只读连接器、报价、多语言与限流；分段 3：业务评测、AI 硬件与流量证据；分段 4：末段两条孤立敏感记录的停止页 | 分段 1/2 都涉及 429 和排障，但前者是高并发工程证据，后者是客户系统集成控制；不存在相同结论的换写复制 |

## 套话与编辑风险

以下是风格层面的真实重复信号，但不构成当前发布失败：

- 23/30 篇摘要以“这段 / 这场 / 这份”开头。
- 11/30 篇 `forAbsentees` 以“缺席者最该 / 最值得”开头。
- 14/30 篇“道”层使用“本质 / 核心 / 价值”句式。
- 30/30 篇 Agent prompt 以“你是……”开头；这是可复制 prompt 的功能性约定。
- 共享短句中，较明显的有“这份分段不能说明会议讲了什么”“你是会议证据审计 Agent”“知识库首先对证据负责”。它们集中在 `insufficient` 页面，承担一致的安全语义。

这些模式让整站声音略显模板化，但各页随后的对象、决策变量、验证方法和边界足够具体，没有形成“换名词式”空洞内容。后续编辑可以优先减少摘要和缺席者结论的固定开头；不要改写 Agent 的安全停止规则，也不要为了差异度删除必要的证据边界。

## 门禁评估与返修清单

### 当前返修

**无阻断返修项。** 未发现应退回某个 slug/字段的真实机械重复。

### 非阻断改进

1. 后续内容批次可以将本报告的离线 3-gram 审阅做成独立报告工具，但默认只输出候选，不直接失败；积累经过人工标注的真阳性/假阳性后再决定门禁阈值。
2. 内容编辑可抽查 23 篇以“这段 / 这场 / 这份”开头的摘要，以及 11 篇以“缺席者最该 / 最值得”开头的结论，优先提升入口文案变化；不应为了差异而改动事实、锚点或安全协议。

## 验证证据

- `npm run content:check`：30/30 通过，0 错误；状态为 `partial=26`、`insufficient=4`。
- `npm test`：内容工具 53/53、站点单元测试 28/28 通过。
- `npm run test:coverage`：
  - 内容工具：lines 97.09%、branches 87.63%、functions 100%。
  - 站点：statements 98.5%、branches 90.32%、functions 100%、lines 98.16%。
- `npm run check`：33 个文件，0 errors、0 warnings、0 hints。

## 附录：30 页的主要独有价值

| slug | 主要独有价值 |
|---|---|
| `2026-08-02-gpt-5-6-self-optimization` | 模型服务全链路优化、负载路由、计算正确性、缓存协议与 Agent 请求乘数 |
| `2026-08-03-ai-startup-operations` | 融资/现金流路线、内容增长、开源采用、社群交付、单位经济与跨境验证 |
| `2026-08-08-ai-business-tech-segment-1` | Skill 契约、结果型教育市场、风险利润、跨境主体和客户端部署矩阵 |
| `2026-08-08-ai-business-tech-segment-2` | 控制面与推理面、能力契约、批处理容量、视觉评审和定制报价 |
| `2026-08-08-ai-business-tech-segment-3` | 网关类故障、受控重试、部分成功恢复、脚本验收和边缘硬件基准 |
| `2026-08-08-local-acquisition-short-video` | 本地标签获客、TAH 内容结构、持续在场、公私域承接和 AI 内容权利门 |
| `2026-08-08-poker-session-segment-1` | 规则冻结、有效补牌、行为线索降权、新手保护和过程复盘 |
| `2026-08-08-poker-session-segment-2` | 模型接入可信链、AI 学习对照实验、灾害数据许可、增长漏斗和站点组合实验 |
| `2026-08-08-poker-session-segment-3` | 混合音源三态分类、扑克证据门槛和匿名手牌事件台账 |
| `2026-08-08-wechat-developer-workshop-shenzhen` | 小程序真实种子用户、增长漏斗、AI 原型验收、服务角色与 Agent 原子服务 |
| `2026-08-10-ai-project-daily-segment-1` | 配置版本/回滚、逐跳鉴权、数字人感知基线和小程序主体资产治理 |
| `2026-08-10-ai-project-daily-segment-2` | CI 总成本、硬件证据门、服务目录、应用类型预审与双环测试 |
| `2026-08-10-ai-project-daily-segment-3` | 六级产品证据链、流量漏斗、语音/硬件基准、支付生命周期和 Agent 轨迹评测 |
| `2026-08-10-ai-project-daily-segment-4` | 零转写的停止推断、空锚点、元数据边界和从零重审 |
| `2026-08-10-work-matters-segment-1` | 主观模型体验转基准、复用项目筛选、流量路径和 Agent 并行任务图 |
| `2026-08-10-work-matters-segment-2` | 头戴硬件原型五层、模型部署隔离、持久终端会话和稀疏来源边界 |
| `2026-08-10-work-matters-segment-3` | 语音场景验收、音源分离目标、分层转写、延迟前沿、溯源与依赖图 |
| `2026-08-11-ai-agent-implementation-segment-1` | 状态源复用、客户环境契约、模块所有权、数据发布/陈旧度和付款门 |
| `2026-08-11-ai-agent-implementation-segment-2` | Agent 任务契约、可逆环境变更、语音管线、短时访问、就绪矩阵与可靠上传 |
| `2026-08-11-ai-agent-implementation-segment-3` | 极稀疏材料的覆盖审计，以及疑似不当研究内容的声誉风险与不可归因 |
| `2026-08-13-ai-project-daily-segment-1` | 覆盖矩阵、资格状态机、规格版本键、跨端旅程、硬件接收与网络测试协议 |
| `2026-08-13-ai-project-daily-segment-2` | 数量级核验、项目统一评分、调查质量、通知门槛、基础设施验收和标题实验 |
| `2026-08-13-ai-startup-project-segment-1` | 语音能力三表、企业流程机会、深科技尽调、多 Agent DAG、长上下文分治与真实评测 |
| `2026-08-13-ai-startup-project-segment-2` | 只读连接器、权限递进、工作分解报价、财务口径、多语言三层验收与限流排障 |
| `2026-08-13-ai-startup-project-segment-3` | 业务评测契约、单位合格结果、AI 硬件交付链、流量收入证据和凭证卫生 |
| `2026-08-13-ai-startup-project-segment-4` | 末段孤立敏感记录的覆盖审计、停止归因、最小披露与隐私复核 |
| `2026-08-15-ai-business-direction-review` | 外包现金门、六维方向矩阵、出海 SaaS 与自媒体主航道、基础设施来源尽调 |
| `2026-08-17-ai-fox-founder-dialogue` | 岗位反向学习、机会经营方程、客户会议知识卡、硬件协作和 PRD—SPEC—MVP 链 |
| `2026-08-17-ai-pet-business-operations` | 宠物鲜食投放/复购、供应链履约、客户工作台、Agent 运维风险、合伙与备份治理 |
| `2026-08-22-new-recording` | 商单净定价、低客单服务承诺、内容产品飞轮、职业安全垫和商业机会 No-go |
