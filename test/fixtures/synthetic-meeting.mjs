export function syntheticMeeting(overrides = {}) {
  const meeting = {
    id: "2026-08-12-synthetic-learning-session",
    sourceTitle: "合成测试：知识整理工作坊",
    title: "把一次讨论整理成可复用的知识资产",
    date: "2026-08-12",
    duration: "01:02:03",
    sourceType: "minutes",
    contentStatus: "complete",
    confidence: "high",
    abstract:
      "这是一份完全由测试文本构成的会议知识样例。它说明如何先识别讨论中的关键判断，再把判断改写为带适用边界的方法，最后补上行动条件、验证标准与来源时间锚点，让未参会者能够独立理解并安全复用。",
    forAbsentees: "缺席者应先理解结论的证据边界，再决定哪些方法可以迁移到自己的场景。",
    learningGoals: [
      "区分会议中的事实、经验判断与待验证假设",
      "把讨论结论改写成有条件、有边界的可迁移方法",
      "为后续行动设置可观察的成功标准"
    ],
    coreTopics: [
      {
        title: "从讨论提炼判断",
        explanation: "先按问题、证据、结论和限制重组信息，使读者不依赖现场语境也能理解推理链。",
        anchor: "00:05:10"
      },
      {
        title: "让方法能够迁移",
        explanation: "明确方法生效所需的前提、失败信号和复盘方式，避免把局部经验误当成普遍规律。",
        anchor: "00:21:40"
      }
    ],
    transferableKnowledge: [
      {
        principle: "先恢复推理链，再压缩表达",
        whyItMatters: "只有保留问题与证据之间的关系，摘要才不会变成脱离上下文的口号。",
        howToUse: "逐段标注问题、证据、判断和限制，再合并重复观点并为关键判断添加时间锚点。",
        boundary: "当原始材料无法支持因果关系时，只能标记为会议中的观点或待验证假设。"
      }
    ],
    discussion: [
      {
        heading: "为什么摘要必须面向缺席者",
        narrative:
          "参会者可以依赖语气、白板和前后对话补全含义，缺席者却没有这些线索。因此整理者需要补出问题背景、关键分歧、选择理由与适用限制，同时避免复制现场逐字表达。",
        anchors: ["00:05:10", "00:14:20"]
      },
      {
        heading: "怎样把认识转成行动",
        narrative:
          "行动项不仅要描述要做什么，还要说明由哪个角色推动、何时检查以及什么现象代表成功。这样读者才能把知识放入自己的工作流，并在新证据出现后修正原判断。",
        anchors: ["00:31:25"]
      }
    ],
    actions: [
      {
        action: "为每个关键判断补充证据类型与适用边界",
        owner: "内容整理角色",
        when: "页面进入发布检查前",
        success: "读者能够从页面中区分事实、观点和待验证假设"
      },
      {
        action: "邀请未参会读者按学习目标复述主要推理链",
        owner: "质量检查角色",
        when: "首版内容完成后",
        success: "复述不依赖现场背景且没有新增未经支持的事实"
      }
    ],
    daoFaShuQiShi: {
      dao: { label: "道", summary: "知识整理的根本目标是让判断脱离现场后仍然可理解、可检验并可修正。" },
      fa: { label: "法", summary: "按问题、证据、判断、边界和行动五个部分重建会议的知识结构。" },
      shu: { label: "术", summary: "使用主题聚类、时间锚点、反例检查和缺席者复述测试提升表达质量。" },
      qi: { label: "器", summary: "用结构化数据、静态页面和本地校验工具承载知识并阻断隐私泄露。" },
      shi: { label: "势", summary: "团队正从只服务参会者的记录转向可被个人知识库和智能工具复用的资产。" }
    },
    agentKit: {
      context:
        "你将处理一份去敏后的合成会议知识页。页面把讨论重组为问题、证据、判断、边界和行动，不包含真实人员或组织信息。",
      prompt:
        "请先复述页面中的核心推理链，再指出每条判断依赖的前提与可验证信号，最后结合我的场景给出一个最小行动方案；不得把会议观点改写成已核实事实。",
      questions: [
        "哪些结论有明确时间锚点支持？",
        "哪些方法依赖特定前提，迁移时需要调整？",
        "可以设计什么低成本实验来验证关键假设？"
      ],
      knowledgeCards: [
        {
          name: "可迁移判断卡",
          content: "记录问题、证据、判断、适用前提、失败信号和下一次复盘时间。"
        },
        {
          name: "缺席者理解测试",
          content: "让不了解现场背景的人复述推理链；无法复述的位置就是需要补充语境或证据的位置。"
        }
      ]
    },
    claimsToVerify: ["会议中的经验判断仍需在具体业务场景中通过小规模实验验证"],
    limitations: ["本样例只用于验证内容结构与质量门禁，不代表任何真实会议或真实组织的观点"],
    privacy: "所有人物、组织和业务场景均为合成描述，没有使用真实逐字稿或真实身份信息。",
    tags: ["知识整理", "缺席者学习", "合成测试"],
    sourceAnchors: [
      { time: "00:01:00", note: "合成对抗样例的通用检查位置" },
      { time: "00:05:10", note: "讨论知识页需要恢复推理链" },
      { time: "00:14:20", note: "讨论缺席者需要补足的语境" },
      { time: "00:21:40", note: "讨论方法迁移的适用边界" },
      { time: "00:31:25", note: "讨论行动项的检查条件与成功标准" }
    ]
  };

  return deepMerge(meeting, overrides);
}

function deepMerge(base, overrides) {
  if (Array.isArray(overrides)) return structuredClone(overrides);
  if (!overrides || typeof overrides !== "object") return overrides;

  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = structuredClone(value);
    }
  }
  return result;
}
