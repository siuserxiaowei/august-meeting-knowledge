# 单场会议内容 Schema

每个文件使用 UTF-8 JSON，文件名为不含飞书资源标识的公开 slug，例如 `2026-08-17-ai-fox-founder-dialogue.json`。`minute_token`、`note_id` 和可拼接回私有资源的 URL 只保留在仓库外的私有映射台账，禁止进入公开仓库。

```json
{
  "id": "不含私有 token 的公开 slug",
  "sourceTitle": "飞书妙记标题",
  "title": "面向读者的知识标题",
  "date": "2026-08-DD",
  "duration": "原始时长，H:MM:SS 或至少两位小时的 HH:MM:SS",
  "sourceType": "minutes",
  "contentStatus": "complete | partial | insufficient",
  "confidence": "high | medium | low",
  "abstract": "80—160 字独立摘要",
  "forAbsentees": "一句话说明缺席者应该知道什么",
  "learningGoals": ["..."],
  "coreTopics": [{"title": "...", "explanation": "...", "anchor": "HH:MM:SS"}],
  "transferableKnowledge": [{"principle": "...", "whyItMatters": "...", "howToUse": "...", "boundary": "..."}],
  "discussion": [{"heading": "...", "narrative": "...", "anchors": ["HH:MM:SS"]}],
  "actions": [{"action": "...", "owner": "角色或未指定", "when": "...", "success": "..."}],
  "daoFaShuQiShi": {
    "dao": {"label": "道", "summary": "..."},
    "fa": {"label": "法", "summary": "..."},
    "shu": {"label": "术", "summary": "..."},
    "qi": {"label": "器", "summary": "..."},
    "shi": {"label": "势", "summary": "..."}
  },
  "agentKit": {
    "context": "可复制给 Agent 的去敏背景",
    "prompt": "可直接复制的主提示词",
    "questions": ["..."],
    "knowledgeCards": [{"name": "...", "content": "..."}]
  },
  "claimsToVerify": ["..."],
  "limitations": ["..."],
  "privacy": "已删除或泛化哪些信息",
  "tags": ["..."],
  "sourceAnchors": [{"time": "HH:MM:SS", "note": "只写主题，不直接引用隐私发言"}]
}
```

数组允许为空，但字段不得缺失。`contentStatus=insufficient` 时应把“为什么无法提炼”写入 `limitations`。

`sourceAnchors` 默认至少包含一个可回到原始证据的位置。只有同时满足以下条件时才允许为空：

- `contentStatus=insufficient`；
- `coreTopics` 与 `discussion` 都为空，不声称存在可归因的会议内容；
- `abstract` 与至少一条 `limitations` 都明确说明没有可用转写、没有发言记录、逐字稿为空或同等可审计的覆盖缺口。

`complete`、`partial`、仍写有主题或讨论、或只泛称“证据不足”的页面仍必须提供真实锚点。不得用 `00:00:00`、录音起点或其他结构位置替代并不存在的发言锚点。

`coreTopics[].anchor` 与 `discussion[].anchors[]` 中的每个非空引用时码，都必须与至少一条 `sourceAnchors[].time` 完全一致。`sourceAnchors` 可以保留未被主题或讨论引用的额外证据；同一时码被多处重复引用时，只需在 `sourceAnchors` 记录一次。缺少对应记录时，内容门禁返回 `ANCHOR_NOT_DOCUMENTED`，报告只显示公开文件名与字段路径，不回显引用值。

`coreTopics[].anchor`、`discussion[].anchors[]` 与 `sourceAnchors[].time` 均不得晚于 `duration`。

## 月度综合洞察 Schema

`content/syntheses/*.json` 只承载跨会议的公开综合层，不保存日期、token、私有会议 ID、私有 URL 或原始逐字稿。文件名必须等于公开 `id`，例如 `august-agent-learning-loop.json`：

```json
{
  "id": "公开 slug",
  "title": "综合洞察标题",
  "abstract": "可独立阅读的综合摘要",
  "audience": ["适合谁读"],
  "sections": [
    {
      "heading": "章节标题",
      "summary": "章节正文",
      "takeaways": ["可带走的结论"]
    }
  ],
  "daoFaShuQiShi": {
    "dao": { "label": "道", "summary": "..." },
    "fa": { "label": "法", "summary": "..." },
    "shu": { "label": "术", "summary": "..." },
    "qi": { "label": "器", "summary": "..." },
    "shi": { "label": "势", "summary": "..." }
  },
  "agentKit": {
    "context": "可复制给 Agent 的综合背景",
    "prompt": "可直接复制的主提示词",
    "questions": ["继续追问的问题"],
    "knowledgeCards": [{ "name": "知识卡名", "content": "知识卡内容" }]
  },
  "relatedMeetings": ["现有 content/meetings 中的公开 slug"],
  "claimsToVerify": ["仍待验证的主张"],
  "limitations": ["综合内容的证据与适用边界"],
  "tags": ["公开标签"]
}
```

`audience`、`sections`、`relatedMeetings`、`limitations` 与 `tags` 至少各有一项。`relatedMeetings` 只能引用构建时存在的公开会议 slug，不能重复；任一断链都会阻止静态页面构建。所有对象使用文档列出的公开字段，包含飞书/Lark 私有标识字段或资源 URL 会被 loader 拦截，错误不会回显私有值。
