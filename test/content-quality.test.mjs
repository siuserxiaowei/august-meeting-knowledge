import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  REQUIRED_ARRAY_FIELDS,
  REQUIRED_TOP_LEVEL_FIELDS,
  auditDirectory,
  auditMeetingEntries,
  formatHumanReport,
  renderJsonReport,
  validateMeeting
} from "../scripts/content-quality/index.mjs";
import { syntheticMeeting } from "./fixtures/synthetic-meeting.mjs";

const DEFAULT_FILE = "2026-08-12-synthetic-learning-session.json";

function issueCodes(result) {
  return new Set(result.issues.map((issue) => issue.code));
}

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)])
  );
}

async function makeTempDirectory() {
  return mkdtemp(path.join(tmpdir(), "meeting-content-quality-"));
}

async function writeMeeting(directory, meeting, relativePath = `${meeting.id}.json`) {
  const destination = path.join(directory, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(meeting, null, 2)}\n`, "utf8");
  return destination;
}

test("用户旅程：结构完整、时间范围正确的合成会议可以通过门禁", () => {
  const result = validateMeeting(syntheticMeeting(), { filePath: DEFAULT_FILE });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.ok(result.substantiveCharacters >= 500);
});

test("逐一检查所有顶层必填字段", () => {
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    const meeting = syntheticMeeting();
    delete meeting[field];

    const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });

    assert.ok(
      result.issues.some((issue) => issue.code === "REQUIRED_FIELD" && issue.path === `$.${field}`),
      `expected REQUIRED_FIELD for ${field}`
    );
  }
});

test("数组字段存在但类型错误时逐一阻断", () => {
  for (const field of REQUIRED_ARRAY_FIELDS) {
    const meeting = syntheticMeeting({ [field]: "不是数组" });

    const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });

    assert.ok(
      result.issues.some((issue) => issue.code === "EXPECTED_ARRAY" && issue.path === `$.${field}`),
      `expected EXPECTED_ARRAY for ${field}`
    );
  }
});

test("校验枚举、摘要长度、公开 slug 与文件名", () => {
  const meeting = syntheticMeeting({
    id: "Private Token / 不合法",
    sourceType: "recording",
    contentStatus: "draft",
    confidence: "certain",
    abstract: "太短"
  });

  const result = validateMeeting(meeting, { filePath: "another-file.json" });
  const codes = issueCodes(result);

  assert.ok(codes.has("INVALID_SLUG"));
  assert.ok(codes.has("SLUG_FILENAME_MISMATCH"));
  assert.ok(codes.has("INVALID_ENUM"));
  assert.ok(codes.has("ABSTRACT_LENGTH"));
});

test("日期范围含首尾两天，范围外和无效日历日期被阻断", () => {
  for (const date of ["2026-08-01", "2026-08-24"]) {
    const result = validateMeeting(syntheticMeeting({ date }), { filePath: DEFAULT_FILE });
    assert.equal(issueCodes(result).has("DATE_OUT_OF_RANGE"), false);
  }

  const before = validateMeeting(syntheticMeeting({ date: "2026-07-31" }), { filePath: DEFAULT_FILE });
  const after = validateMeeting(syntheticMeeting({ date: "2026-08-25" }), { filePath: DEFAULT_FILE });
  const impossible = validateMeeting(syntheticMeeting({ date: "2026-02-30" }), { filePath: DEFAULT_FILE });

  assert.ok(issueCodes(before).has("DATE_OUT_OF_RANGE"));
  assert.ok(issueCodes(after).has("DATE_OUT_OF_RANGE"));
  assert.ok(issueCodes(impossible).has("INVALID_DATE"));
});

test("duration 接受 H:MM:SS 与 HH:MM:SS，并阻断非法时长", () => {
  for (const duration of ["1:02:03", "01:02:03", "125:02:03"]) {
    const result = validateMeeting(syntheticMeeting({ duration }), { filePath: DEFAULT_FILE });
    assert.equal(issueCodes(result).has("INVALID_DURATION"), false, `expected valid duration: ${duration}`);
  }

  for (const duration of ["未知", "01:02", "001:02:03", "1:60:00", "1:00:60", "-1:02:03"]) {
    const result = validateMeeting(syntheticMeeting({ duration }), { filePath: DEFAULT_FILE });
    assert.ok(issueCodes(result).has("INVALID_DURATION"), `expected invalid duration: ${duration}`);
  }
});

test("所有证据锚点不得超过会议 duration", () => {
  const meeting = syntheticMeeting({
    duration: "1:02:03",
    coreTopics: [
      {
        title: "越界核心主题",
        explanation: "这是完全合成的回归测试说明，用来验证核心主题锚点不能晚于会议原始时长。",
        anchor: "01:02:04"
      }
    ],
    discussion: [
      {
        heading: "越界讨论",
        narrative: "这是完全合成的回归测试说明，用来验证讨论数组中的每个时间锚点都需要落在原始时长之内。",
        anchors: ["01:02:03", "02:00:00"]
      }
    ],
    sourceAnchors: [
      { time: "01:02:03", note: "边界值允许" },
      { time: "99:00:00", note: "越界值阻断" }
    ]
  });

  const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
  const paths = result.issues
    .filter((issue) => issue.code === "ANCHOR_AFTER_DURATION")
    .map((issue) => issue.path)
    .sort();

  assert.deepEqual(paths, [
    "$.coreTopics[0].anchor",
    "$.discussion[0].anchors[1]",
    "$.sourceAnchors[1].time"
  ]);
});

test("核心主题与讨论引用的每个时码都必须由 sourceAnchors 记录", () => {
  const meeting = syntheticMeeting({
    coreTopics: [
      {
        title: "已记录的核心主题",
        explanation: "该主题使用来源清单中已有的合成时码，用于确认闭包校验不会误报已记录引用。",
        anchor: "00:05:10"
      },
      {
        title: "未记录的核心主题",
        explanation: "该主题使用来源清单中没有的合成时码，用于确认闭包校验能够定位核心主题引用。",
        anchor: "00:21:40"
      }
    ],
    discussion: [
      {
        heading: "混合引用的讨论",
        narrative: "本段同时使用已记录与未记录的合成时码，用于确认讨论数组中的每一个引用都被独立核对。",
        anchors: ["00:05:10", "00:14:20"]
      }
    ],
    sourceAnchors: [
      { time: "00:05:10", note: "已记录引用" },
      { time: "00:31:25", note: "允许存在的额外证据" }
    ]
  });

  const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
  const closureIssues = result.issues.filter((issue) => issue.code === "ANCHOR_NOT_DOCUMENTED");

  assert.deepEqual(
    closureIssues.map((issue) => issue.path),
    ["$.coreTopics[1].anchor", "$.discussion[0].anchors[1]"]
  );
  assert.ok(closureIssues.every((issue) => issue.details === undefined));
});

test("sourceAnchors 可以包含额外证据，一条记录可以覆盖重复引用", () => {
  const meeting = syntheticMeeting({
    coreTopics: [
      {
        title: "重复引用的核心主题",
        explanation: "核心主题与两个讨论位置复用同一条来源记录，以确认重复引用不要求复制来源清单成员。",
        anchor: "00:05:10"
      }
    ],
    discussion: [
      {
        heading: "重复引用",
        narrative: "同一时码可以在一个或多个知识区块中重复引用，只要来源清单至少记录一次即可。",
        anchors: ["00:05:10", "00:05:10"]
      }
    ],
    sourceAnchors: [
      { time: "00:05:10", note: "覆盖所有重复引用" },
      { time: "00:31:25", note: "未被内容区块引用的额外证据" }
    ]
  });

  const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });

  assert.equal(issueCodes(result).has("ANCHOR_NOT_DOCUMENTED"), false);
});

test("锚点闭包错误报告不回显未记录引用中的敏感内容", () => {
  const sensitiveAnchor = "note_id=fixture-private-anchor";
  const meeting = syntheticMeeting({
    coreTopics: [
      {
        title: "报告去敏回归",
        explanation: "完全合成的错误样例用于确认闭包报告仅定位字段，不复制存在风险的原始值。",
        anchor: sensitiveAnchor
      }
    ],
    discussion: [],
    sourceAnchors: [{ time: "00:31:25", note: "安全的合成来源记录" }]
  });
  const report = auditMeetingEntries([{ filePath: DEFAULT_FILE, meeting }], {
    now: "2026-08-24T00:00:00.000Z"
  });

  assert.ok(
    report.issues.some(
      (issue) => issue.code === "ANCHOR_NOT_DOCUMENTED" && issue.path === "$.coreTopics[0].anchor"
    )
  );
  assert.equal(formatHumanReport(report).includes(sensitiveAnchor), false);
  assert.equal(renderJsonReport(report).includes(sensitiveAnchor), false);
});

test("小时数相同但 duration 使用单数字小时也能正确比较锚点", () => {
  const result = validateMeeting(
    syntheticMeeting({ duration: "1:02:03", sourceAnchors: [{ time: "01:02:04", note: "合成越界值" }] }),
    { filePath: DEFAULT_FILE }
  );

  assert.ok(
    result.issues.some(
      (issue) => issue.code === "ANCHOR_AFTER_DURATION" && issue.path === "$.sourceAnchors[0].time"
    )
  );
});

test("duration 非法时不制造锚点越界的连带错误", () => {
  const result = validateMeeting(
    syntheticMeeting({ duration: "未知", sourceAnchors: [{ time: "99:00:00", note: "合成测试" }] }),
    { filePath: DEFAULT_FILE }
  );

  assert.ok(issueCodes(result).has("INVALID_DURATION"));
  assert.equal(issueCodes(result).has("ANCHOR_AFTER_DURATION"), false);
});

test("嵌套对象、数组成员和时间锚点均按契约校验", () => {
  const meeting = syntheticMeeting();
  delete meeting.agentKit.prompt;
  delete meeting.daoFaShuQiShi.fa.summary;
  delete meeting.coreTopics[0].explanation;
  meeting.discussion[0].anchors = ["5:10", "00:61:00"];
  meeting.sourceAnchors[0].time = "not-a-time";
  meeting.actions.push("不是对象");

  const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
  const codes = issueCodes(result);

  assert.ok(codes.has("REQUIRED_FIELD"));
  assert.ok(codes.has("INVALID_TIME_ANCHOR"));
  assert.ok(codes.has("EXPECTED_OBJECT"));
});

test("缺少来源时间锚点以及 insufficient 未解释原因时阻断", () => {
  const noAnchors = validateMeeting(syntheticMeeting({ sourceAnchors: [] }), { filePath: DEFAULT_FILE });
  const noReason = validateMeeting(
    syntheticMeeting({ contentStatus: "insufficient", limitations: [] }),
    { filePath: DEFAULT_FILE }
  );

  assert.ok(issueCodes(noAnchors).has("MISSING_SOURCE_ANCHOR"));
  assert.ok(issueCodes(noAnchors).has("ANCHOR_NOT_DOCUMENTED"));
  assert.ok(issueCodes(noReason).has("INSUFFICIENT_WITHOUT_REASON"));
});

test("仅无可用转写的 insufficient 页面允许 sourceAnchors 为空", () => {
  const noTranscript = validateMeeting(
    syntheticMeeting({
      contentStatus: "insufficient",
      confidence: "low",
      abstract:
        "现有来源没有任何可用转写，也没有任何发言记录或可核对的相对时间戳，因此无法识别议题、观点、决定与行动。本页不复原会议内容，只记录覆盖缺口、补取资料的顺序和重新开始提炼所需的最低证据门槛。",
      coreTopics: [],
      discussion: [],
      limitations: [
        "现有来源无可用转写且无任何发言记录，无法建立真实来源时间锚点。",
        "来源标题与总时长不能证明原会议讨论了哪些内容。"
      ],
      sourceAnchors: []
    }),
    { filePath: DEFAULT_FILE }
  );

  assert.equal(noTranscript.ok, true);
  assert.deepEqual(noTranscript.issues, []);
});

test("空锚点例外不适用于 complete、partial、泛泛证据不足或仍有讨论内容的页面", () => {
  const explicitAbstract =
    "现有来源没有任何可用转写，也没有任何发言记录或可核对的相对时间戳，因此无法识别议题、观点、决定与行动。本页不复原会议内容，只记录覆盖缺口、补取资料的顺序和重新开始提炼所需的最低证据门槛。";
  const explicitLimitations = ["现有来源无可用转写且无任何发言记录，无法建立真实来源时间锚点。"];

  const cases = [
    syntheticMeeting({
      contentStatus: "complete",
      abstract: explicitAbstract,
      coreTopics: [],
      discussion: [],
      limitations: explicitLimitations,
      sourceAnchors: []
    }),
    syntheticMeeting({
      contentStatus: "partial",
      abstract: explicitAbstract,
      coreTopics: [],
      discussion: [],
      limitations: explicitLimitations,
      sourceAnchors: []
    }),
    syntheticMeeting({
      contentStatus: "insufficient",
      abstract:
        "现有资料不足以形成可靠的会议结论，因此暂时不能识别议题、观点、决定与行动。本页只记录一般性的补证步骤，等待后续材料到位后再重新提炼并补充可核验的来源位置。",
      coreTopics: [],
      discussion: [],
      limitations: ["现有材料证据不足，需要补充后再重新提炼。"],
      sourceAnchors: []
    }),
    syntheticMeeting({
      contentStatus: "insufficient",
      abstract: explicitAbstract,
      coreTopics: [],
      discussion: [],
      limitations: ["现有材料证据不足，需要补充后再重新提炼。"],
      sourceAnchors: []
    }),
    syntheticMeeting({
      contentStatus: "insufficient",
      abstract:
        "现有资料不足以形成可靠的会议结论，因此暂时不能识别议题、观点、决定与行动。本页只记录一般性的补证步骤，等待后续材料到位后再重新提炼并补充可核验的来源位置。",
      coreTopics: [],
      discussion: [],
      limitations: explicitLimitations,
      sourceAnchors: []
    }),
    syntheticMeeting({
      contentStatus: "insufficient",
      abstract: explicitAbstract,
      limitations: explicitLimitations,
      sourceAnchors: []
    })
  ];

  for (const meeting of cases) {
    const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
    assert.ok(issueCodes(result).has("MISSING_SOURCE_ANCHOR"));
  }
});

test("按状态识别正文过短", () => {
  for (const status of ["complete", "partial", "insufficient"]) {
    const meeting = syntheticMeeting({
      contentStatus: status,
      abstract: "这是一段用于测试过短正文检测的合成摘要，内容没有引用任何真实会议材料，仅用于让摘要字段满足最小字符要求并触发正文总量门槛。为了保持测试确定性，这里继续补充无业务含义的合成说明文字直到达到规定长度。",
      forAbsentees: "内容很短。",
      learningGoals: [],
      coreTopics: [],
      transferableKnowledge: [],
      discussion: [],
      actions: [],
      daoFaShuQiShi: {
        dao: { label: "道", summary: "短" },
        fa: { label: "法", summary: "短" },
        shu: { label: "术", summary: "短" },
        qi: { label: "器", summary: "短" },
        shi: { label: "势", summary: "短" }
      },
      agentKit: { context: "短", prompt: "短", questions: [], knowledgeCards: [] },
      claimsToVerify: [],
      limitations: status === "insufficient" ? ["合成材料不足，无法形成进一步提炼。"] : [],
      tags: [],
      sourceAnchors: [{ time: "00:00:01", note: "短" }]
    });

    const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
    assert.ok(issueCodes(result).has("CONTENT_TOO_SHORT"), `expected short-content issue for ${status}`);
  }
});

test("占位词会阻断，正常的“待验证假设”不会被误判", () => {
  const placeholder = validateMeeting(
    syntheticMeeting({ discussion: [{ heading: "TODO", narrative: "稍后补充", anchors: ["00:01:00"] }] }),
    { filePath: DEFAULT_FILE }
  );
  const legitimate = validateMeeting(
    syntheticMeeting({ claimsToVerify: ["这是一条待验证假设，需要额外证据"] }),
    { filePath: DEFAULT_FILE }
  );

  assert.ok(issueCodes(placeholder).has("PLACEHOLDER_TEXT"));
  assert.equal(issueCodes(legitimate).has("PLACEHOLDER_TEXT"), false);
});

test("逐类阻断合成敏感内容并给出字段路径", () => {
  const samples = [
    ["minute_token=fake_fixture_token", "PRIVATE_RESOURCE_IDENTIFIER"],
    ["note_id: synthetic_fixture_id", "PRIVATE_RESOURCE_IDENTIFIER"],
    ["https://fixture.feishu.cn/minutes/fake-private-resource", "PRIVATE_FEISHU_URL"],
    ["测试号码 +86 138-0000-0000", "PHONE_NUMBER"],
    ["person@example.test", "EMAIL_ADDRESS"],
    ["保留地址 192.0.2.42", "IPV4_ADDRESS"],
    ["api_key=sk-fixture-not-real-1234567890", "SECRET_VALUE"],
    ["密钥：fixture-secret-123456", "SECRET_VALUE"],
    ["密码是 fixture-pass-948275", "SECRET_VALUE"],
    ["密码是 合成口令甲乙丙丁", "SECRET_VALUE"],
    ["验证码：839201", "SECRET_VALUE"]
  ];

  for (const [sample, expectedType] of samples) {
    const meeting = syntheticMeeting({
      discussion: [{ heading: "敏感检测合成样例", narrative: sample, anchors: ["00:01:00"] }]
    });

    const result = validateMeeting(meeting, { filePath: DEFAULT_FILE });
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "SENSITIVE_CONTENT" &&
          issue.details?.type === expectedType &&
          issue.path === "$.discussion[0].narrative"
      ),
      `expected ${expectedType} for ${sample}`
    );
  }
});

test("对 Unicode、零宽与 URL 编码的私有资源标识做规范化后阻断", () => {
  const samples = [
    "minutes_token=fake_fixture_resource",
    "minutesToken=fake_fixture_resource",
    "minute.token=fake_fixture_resource",
    "note.id=fake_fixture_resource",
    "ｍｉｎｕｔｅ＿ｔｏｋｅｎ＝fake_fixture_resource",
    "minute\u200b_token=fake_fixture_resource",
    "https%3A%2F%2Facme.feishu.cn%2Fminutes%2Ffake-private-resource",
    "obcnFixtureResourceToken1234567890",
    "doxcnFixtureDocumentToken1234567890"
  ];

  for (const sample of samples) {
    const result = validateMeeting(
      syntheticMeeting({ discussion: [{ heading: "资源标识对抗样例", narrative: sample, anchors: ["00:01:00"] }] }),
      { filePath: DEFAULT_FILE }
    );

    assert.ok(
      result.issues.some(
        (issue) =>
          issue.code === "SENSITIVE_CONTENT" &&
          ["PRIVATE_RESOURCE_IDENTIFIER", "PRIVATE_FEISHU_URL"].includes(issue.details?.type)
      ),
      `expected normalized private resource block for ${sample}`
    );
  }
});

test("阻断无协议与 protocol-relative 的飞书租户 URL，但允许公开开发文档", () => {
  for (const sample of [
    "acme.feishu.cn/minutes/fake-private-resource",
    "//acme.feishu.cn/minutes/fake-private-resource",
    "tenant.larksuite.com/wiki/fake-private-resource",
    "https://feishu.cn/minutes/fake-private-resource"
  ]) {
    const result = validateMeeting(
      syntheticMeeting({ discussion: [{ heading: "URL 对抗样例", narrative: sample, anchors: ["00:01:00"] }] }),
      { filePath: DEFAULT_FILE }
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === "PRIVATE_FEISHU_URL"
      ),
      `expected tenant URL block for ${sample}`
    );
  }

  for (const sample of [
    "公开说明见 open.feishu.cn/document/home/index。",
    "公开说明见 open.larksuite.com/document/home/index。",
    "产品首页是 www.feishu.cn。"
  ]) {
    const publicDocs = validateMeeting(syntheticMeeting({ agentKit: { context: sample } }), {
      filePath: DEFAULT_FILE
    });
    assert.equal(
      publicDocs.issues.some(
        (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === "PRIVATE_FEISHU_URL"
      ),
      false,
      `expected public URL allowlist for ${sample}`
    );
  }
});

test("对全角联系方式、IP 与显式账号语境做规范化后阻断", () => {
  const samples = [
    ["联系方式：＋８６ １３８００００００００", "PHONE_NUMBER"],
    ["邮箱：ｐｅｒｓｏｎ＠ｅｘａｍｐｌｅ．ｔｅｓｔ", "EMAIL_ADDRESS"],
    ["服务器：１９２．０．２．４２", "IPV4_ADDRESS"],
    ["IPv6：2001:db8::42", "IPV6_ADDRESS"],
    ["联系电话：+1 202-555-0147", "PHONE_NUMBER"],
    ["账号：seller_fixture_1234", "ACCOUNT_IDENTIFIER"],
    ["微信号：wx_fixture_1234", "ACCOUNT_IDENTIFIER"],
    ["open_id=ou_fixture_identifier", "ACCOUNT_IDENTIFIER"],
    ["user-id=fixture-user-identifier", "ACCOUNT_IDENTIFIER"]
  ];

  for (const [sample, expectedType] of samples) {
    const result = validateMeeting(
      syntheticMeeting({ discussion: [{ heading: "账号对抗样例", narrative: sample, anchors: ["00:01:00"] }] }),
      { filePath: DEFAULT_FILE }
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === expectedType
      ),
      `expected ${expectedType} for ${sample}`
    );
  }
});

test("阻断常见令牌、私钥与带标点的秘密语境", () => {
  const samples = [
    "密码为：fixture-pass-948275",
    "验证码为：８３９２０１",
    "Authorization: Bearer fixture-token-abcdefghijklmnopqrstuvwxyz",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.fixture-signature-value",
    "ghp_fixtureabcdefghijklmnopqrstuvwxyz123456",
    "AKIAFIXTUREABCDEFGHIJKLMNOP",
    "xoxb-fixture-token-abcdefghijklmnopqrstuvwxyz",
    "-----BEGIN PRIVATE KEY-----"
  ];

  for (const sample of samples) {
    const result = validateMeeting(
      syntheticMeeting({ discussion: [{ heading: "秘密对抗样例", narrative: sample, anchors: ["00:01:00"] }] }),
      { filePath: DEFAULT_FILE }
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === "SECRET_VALUE"
      ),
      `expected secret block for ${sample}`
    );
  }
});

test("阻断详细地址、具名外部主体与个人财务语境", () => {
  const samples = [
    ["收货地址：上海市浦东新区世纪大道100号8栋1201室", "DETAILED_LOCATION"],
    ["办公点在北京市朝阳区建国路88号。", "DETAILED_LOCATION"],
    ["客户名称：星河合成测试有限公司", "PRIVATE_ENTITY_NAME"],
    ["客户是星河合成测试有限公司", "PRIVATE_ENTITY_NAME"],
    ["供应商名称：远山合成测试有限公司", "PRIVATE_ENTITY_NAME"],
    ["我的银行卡余额为 123456.78 元", "PERSONAL_FINANCIAL_INFORMATION"],
    ["我月薪 30000 元", "PERSONAL_FINANCIAL_INFORMATION"],
    ["客户合同金额为 120000 元", "PRIVATE_BUSINESS_INFORMATION"],
    ["供应商底价是 88 元", "PRIVATE_BUSINESS_INFORMATION"]
  ];

  for (const [sample, expectedType] of samples) {
    const result = validateMeeting(
      syntheticMeeting({ discussion: [{ heading: "语义对抗样例", narrative: sample, anchors: ["00:01:00"] }] }),
      { filePath: DEFAULT_FILE }
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === expectedType
      ),
      `expected ${expectedType} for ${sample}`
    );
  }
});

test("泛化后的角色、地点、业务和财务治理措辞不会误报", () => {
  const result = validateMeeting(
    syntheticMeeting({
      privacy: "已删除客户、供应商、详细地点、账号与个人财务，只保留泛化后的角色和风险类型。",
      discussion: [
        {
          heading: "通用治理",
          narrative:
            "由客户系统所有者、供应商管理角色和财务负责人核对权限、付款凭证与利润口径；地点只保留为目标地区，不记录门牌。",
          anchors: ["00:01:00"]
        }
      ]
    }),
    { filePath: DEFAULT_FILE }
  );

  assert.equal(issueCodes(result).has("SENSITIVE_CONTENT"), false);
});

test("包含敏感值的未知字段名会阻断且报告不回显字段名", () => {
  const sensitiveKey = "person-sensitive-fixture@example.test";
  const meeting = syntheticMeeting({ [sensitiveKey]: "合成值" });
  const report = auditMeetingEntries([{ filePath: DEFAULT_FILE, meeting }], {
    now: "2026-08-24T00:00:00.000Z"
  });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "SENSITIVE_CONTENT"));
  assert.equal(formatHumanReport(report).includes(sensitiveKey), false);
  assert.equal(renderJsonReport(report).includes(sensitiveKey), false);
});

test("常见敏感字段键名会被阻断并在报告中隐藏", () => {
  const sensitiveKeys = [
    ["customerName", "PRIVATE_ENTITY_NAME"],
    ["supplier_name", "PRIVATE_ENTITY_NAME"],
    ["shippingAddress", "DETAILED_LOCATION"],
    ["bankAccount", "PERSONAL_FINANCIAL_INFORMATION"],
    ["openId", "ACCOUNT_IDENTIFIER"]
  ];

  for (const [key, expectedType] of sensitiveKeys) {
    const result = validateMeeting(syntheticMeeting({ [key]: "fixture-value" }), {
      filePath: DEFAULT_FILE
    });
    const issues = result.issues.filter(
      (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === expectedType
    );
    assert.equal(issues.length, 1, `expected sensitive key block for ${key}`);
    assert.equal(issues[0].path, "$.[【已隐藏敏感字段名】]");
  }
});

test("只包含敏感关键词但没有敏感值的标准字段名不会误报", () => {
  const result = validateMeeting(syntheticMeeting(), { filePath: DEFAULT_FILE });
  const sensitiveKeyIssues = result.issues.filter(
    (issue) => issue.code === "SENSITIVE_CONTENT" && issue.path === "$.[【已隐藏敏感字段名】]"
  );

  assert.deepEqual(sensitiveKeyIssues, []);
});

test("报告元数据会隐藏标题或 id 中的语义敏感值", () => {
  const sensitiveEntity = "客户名称：星河合成测试有限公司";
  const meeting = syntheticMeeting({ title: sensitiveEntity });
  const report = auditMeetingEntries([{ filePath: DEFAULT_FILE, meeting }], {
    now: "2026-08-24T00:00:00.000Z"
  });
  const rendered = renderJsonReport(report);

  assert.equal(report.ok, false);
  assert.equal(rendered.includes(sensitiveEntity), false);
  assert.equal(report.files[0].title, "【已隐藏敏感值】");
});

test("报告对多个敏感标题统一使用遮罩，不会因遮罩相同误报重复标题", () => {
  const first = syntheticMeeting({
    id: "2026-08-10-private-title-one",
    date: "2026-08-10",
    title: "客户名称：星河合成测试有限公司"
  });
  const second = syntheticMeeting({
    id: "2026-08-11-private-title-two",
    date: "2026-08-11",
    title: "客户名称：远山合成测试有限公司",
    abstract: `${syntheticMeeting().abstract}乙`,
    forAbsentees: `${syntheticMeeting().forAbsentees}乙`
  });

  const report = auditMeetingEntries(
    [
      { filePath: `${first.id}.json`, meeting: first },
      { filePath: `${second.id}.json`, meeting: second }
    ],
    { now: "2026-08-24T00:00:00.000Z" }
  );

  assert.equal(report.issues.some((issue) => issue.code === "DUPLICATE_TITLE"), false);
  assert.ok(report.files.every((file) => file.title === "【已隐藏敏感值】"));
});

test("脱敏说明可以提及已删除的信息类型而不会暴露值", () => {
  const result = validateMeeting(
    syntheticMeeting({ privacy: "已删除手机号、邮箱、密码、密钥和验证码，仅保留泛化后的角色信息。" }),
    { filePath: DEFAULT_FILE }
  );

  assert.equal(issueCodes(result).has("SENSITIVE_CONTENT"), false);
});

test("公开飞书开发文档 URL 不会被当作私有会议资源", () => {
  const result = validateMeeting(
    syntheticMeeting({
      agentKit: {
        context: "如需了解开放能力，可查看 https://open.feishu.cn/document/home/index 的公开开发文档。"
      }
    }),
    { filePath: DEFAULT_FILE }
  );

  assert.equal(
    result.issues.some(
      (issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === "PRIVATE_FEISHU_URL"
    ),
    false
  );
});

test("额外的敏感字段名也会阻断，避免未知字段绕过语境检测", () => {
  const result = validateMeeting(
    syntheticMeeting({ password: "fixture-secret-value", apiKey: "fixture-api-value" }),
    { filePath: DEFAULT_FILE }
  );

  const secretPaths = result.issues
    .filter((issue) => issue.code === "SENSITIVE_CONTENT" && issue.details?.type === "SECRET_VALUE")
    .map((issue) => issue.path);
  assert.equal(secretPaths.length, 2);
  assert.ok(secretPaths.every((fieldPath) => fieldPath === "$.[【已隐藏敏感字段名】]"));
});

test("人读与 JSON 报告不回显检测到的敏感值", () => {
  const sensitiveValue = "person-sensitive-fixture@example.test";
  const meeting = syntheticMeeting({
    title: `联系 ${sensitiveValue} 获取合成说明`,
    discussion: [{ heading: "报告去敏测试", narrative: sensitiveValue, anchors: ["00:01:00"] }]
  });
  const report = auditMeetingEntries([{ filePath: DEFAULT_FILE, meeting }], {
    now: "2026-08-24T00:00:00.000Z"
  });

  assert.equal(formatHumanReport(report).includes(sensitiveValue), false);
  assert.equal(renderJsonReport(report).includes(sensitiveValue), false);
});

test("含私有资源标识的文件名会阻断且不会出现在报告中", () => {
  const sensitiveFilePath = "fixtures/note_id=fixture-private-resource.json";
  const report = auditMeetingEntries(
    [{ filePath: sensitiveFilePath, meeting: syntheticMeeting() }],
    { now: "2026-08-24T00:00:00.000Z" }
  );
  const json = renderJsonReport(report);

  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "SENSITIVE_FILE_PATH"));
  assert.equal(json.includes(sensitiveFilePath), false);
  assert.equal(json.includes("fixture-private-resource"), false);
});

test("集合校验识别重复 slug、重复公开标题与重复正文", () => {
  const first = syntheticMeeting();
  const sameSlug = syntheticMeeting({ title: "另一个标题", abstract: `${first.abstract}甲` });
  const duplicatePage = syntheticMeeting({ id: "2026-08-13-copy", date: "2026-08-13" });
  const entries = [
    { filePath: `/fixtures/a/${first.id}.json`, meeting: first },
    { filePath: `/fixtures/b/${sameSlug.id}.json`, meeting: sameSlug },
    { filePath: `/fixtures/${duplicatePage.id}.json`, meeting: duplicatePage }
  ];

  const report = auditMeetingEntries(entries, { now: "2026-08-24T00:00:00.000Z" });
  const codes = new Set(report.issues.map((issue) => issue.code));

  assert.ok(codes.has("DUPLICATE_SLUG"));
  assert.ok(codes.has("DUPLICATE_TITLE"));
  assert.ok(codes.has("DUPLICATE_CONTENT"));
  assert.equal(report.ok, false);
});

test("重复页面指纹忽略对象键顺序、Unicode 宽度与空白差异", () => {
  const first = syntheticMeeting();
  const second = reverseObjectKeys(first);
  second.id = "2026-08-13-normalized-copy";
  second.date = "2026-08-13";
  second.title = "全角ＡＩ知识整理副本";
  first.title = "全角AI知识整理原页";
  second.abstract = second.abstract.replaceAll("，", "，  ");

  const report = auditMeetingEntries(
    [
      { filePath: `${first.id}.json`, meeting: first },
      { filePath: `${second.id}.json`, meeting: second }
    ],
    { now: "2026-08-24T00:00:00.000Z" }
  );

  assert.ok(report.issues.some((issue) => issue.code === "DUPLICATE_CONTENT"));
});

test("目录审计容忍坏 JSON，报告无文件目录并保留可读问题", async () => {
  const malformedDirectory = await makeTempDirectory();
  await writeFile(path.join(malformedDirectory, "broken.json"), "{not json", "utf8");
  const malformed = await auditDirectory(malformedDirectory, { now: "2026-08-24T00:00:00.000Z" });

  const emptyDirectory = await makeTempDirectory();
  const empty = await auditDirectory(emptyDirectory, { now: "2026-08-24T00:00:00.000Z" });

  assert.ok(malformed.issues.some((issue) => issue.code === "INVALID_JSON"));
  assert.ok(empty.issues.some((issue) => issue.code === "NO_MEETING_FILES"));
  assert.equal(malformed.summary.filesDiscovered, 1);
  assert.equal(malformed.ok, false);
});

test("坏 JSON 的敏感文件名也会被阻断和隐藏", async () => {
  const directory = await makeTempDirectory();
  const privateMarker = "fixture-private-resource";
  await writeFile(path.join(directory, `note_id=${privateMarker}.json`), "{not json", "utf8");

  const report = await auditDirectory(directory, { now: "2026-08-24T00:00:00.000Z" });
  const rendered = renderJsonReport(report);

  assert.ok(report.issues.some((issue) => issue.code === "INVALID_JSON"));
  assert.ok(report.issues.some((issue) => issue.code === "SENSITIVE_FILE_PATH"));
  assert.equal(rendered.includes(privateMarker), false);
});

test("覆盖报告统计 complete、partial、insufficient 并可输出稳定 JSON", async () => {
  const directory = await makeTempDirectory();
  const variants = [
    ["complete", "2026-08-10", "完整知识样例", "甲"],
    ["partial", "2026-08-11", "部分知识样例", "乙"],
    ["insufficient", "2026-08-12", "证据不足样例", "丙"]
  ];

  for (const [status, date, title, marker] of variants) {
    const id = `${date}-${status}-synthetic`;
    await writeMeeting(
      directory,
      syntheticMeeting({
        id,
        date,
        title,
        sourceTitle: `${title}的合成来源`,
        contentStatus: status,
        abstract: `${syntheticMeeting().abstract}${marker}`,
        forAbsentees: `${syntheticMeeting().forAbsentees}${marker}`,
        limitations: status === "insufficient" ? ["合成来源证据不足，只能保留有限结论。"] : syntheticMeeting().limitations
      })
    );
  }

  const report = await auditDirectory(directory, { now: "2026-08-24T00:00:00.000Z" });
  const human = formatHumanReport(report);
  const machine = JSON.parse(renderJsonReport(report));

  assert.equal(report.ok, true);
  assert.deepEqual(report.summary.statusCoverage, { complete: 1, partial: 1, insufficient: 1 });
  assert.match(human, /内容状态覆盖/);
  assert.match(human, /complete\s+1/);
  assert.equal(machine.schemaVersion, 1);
  assert.equal(machine.generatedAt, "2026-08-24T00:00:00.000Z");
  assert.deepEqual(machine.summary.statusCoverage, report.summary.statusCoverage);
  assert.equal(machine.files.length, 3);
});

test("自定义日期范围可用于后续月份", () => {
  const meeting = syntheticMeeting({ date: "2026-09-01" });

  const defaultResult = validateMeeting(meeting, { filePath: DEFAULT_FILE });
  const customResult = validateMeeting(meeting, {
    filePath: DEFAULT_FILE,
    minDate: "2026-09-01",
    maxDate: "2026-09-30"
  });

  assert.ok(issueCodes(defaultResult).has("DATE_OUT_OF_RANGE"));
  assert.equal(issueCodes(customResult).has("DATE_OUT_OF_RANGE"), false);
});

test("无法读取的目录返回结构化错误而不是抛出异常", async () => {
  const directory = path.join(await makeTempDirectory(), "does-not-exist");

  const report = await auditDirectory(directory, { now: "2026-08-24T00:00:00.000Z" });

  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "DIRECTORY_READ_FAILED"));
});
