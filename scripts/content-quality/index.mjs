import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

export const DEFAULT_MIN_DATE = "2026-08-01";
export const DEFAULT_MAX_DATE = "2026-08-24";

export const REQUIRED_TOP_LEVEL_FIELDS = Object.freeze([
  "id",
  "sourceTitle",
  "title",
  "date",
  "duration",
  "sourceType",
  "contentStatus",
  "confidence",
  "abstract",
  "forAbsentees",
  "learningGoals",
  "coreTopics",
  "transferableKnowledge",
  "discussion",
  "actions",
  "daoFaShuQiShi",
  "agentKit",
  "claimsToVerify",
  "limitations",
  "privacy",
  "tags",
  "sourceAnchors"
]);

export const REQUIRED_ARRAY_FIELDS = Object.freeze([
  "learningGoals",
  "coreTopics",
  "transferableKnowledge",
  "discussion",
  "actions",
  "claimsToVerify",
  "limitations",
  "tags",
  "sourceAnchors"
]);

const ENUMS = Object.freeze({
  sourceType: ["minutes"],
  contentStatus: ["complete", "partial", "insufficient"],
  confidence: ["high", "medium", "low"]
});

const ARRAY_ITEM_SHAPES = Object.freeze({
  coreTopics: { title: "string", explanation: "string", anchor: "time" },
  transferableKnowledge: {
    principle: "string",
    whyItMatters: "string",
    howToUse: "string",
    boundary: "string"
  },
  discussion: { heading: "string", narrative: "string", anchors: "time-array" },
  actions: { action: "string", owner: "string", when: "string", success: "string" },
  sourceAnchors: { time: "time", note: "string" }
});

const DAO_LEVELS = Object.freeze({ dao: "道", fa: "法", shu: "术", qi: "器", shi: "势" });
const MIN_CONTENT_CHARACTERS = Object.freeze({ complete: 650, partial: 450, insufficient: 180 });
const TIME_PATTERN = /^(?:\d{2,}):[0-5]\d:[0-5]\d$/u;
const DURATION_PATTERN = /^(?:\d{1,2}|[1-9]\d{2,}):[0-5]\d:[0-5]\d$/u;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLACEHOLDER_PATTERNS = Object.freeze([
  /\b(?:todo|tbd|fixme)\b/iu,
  /(?:待|稍后|后续)(?:补充|填写|完善|更新)/u,
  /(?:内容|文字)?占位(?:符|文本)?/u,
  /lorem\s+ipsum/iu,
  /(?:^|[^a-z0-9])[xｘ]{3,}(?:[^a-z0-9]|$)/iu
]);
const NO_USABLE_TRANSCRIPT_PATTERNS = Object.freeze([
  /(?:没有|无|未提供|不存在|未保留|缺少)(?:任何)?(?:可用|有效|完整)?的?(?:转写|逐字稿|发言记录|讲话记录|会议正文|文字记录)/u,
  /(?:转写|逐字稿|发言记录|讲话记录|会议正文|文字记录)(?:内容)?(?:为空|空白|缺失|不可用|未生成|未保留)/u
]);

const CONTENT_FIELDS = Object.freeze([
  "abstract",
  "forAbsentees",
  "learningGoals",
  "coreTopics",
  "transferableKnowledge",
  "discussion",
  "actions",
  "daoFaShuQiShi",
  "agentKit",
  "claimsToVerify",
  "limitations",
  "privacy"
]);

function makeIssue(code, message, options = {}) {
  return {
    severity: "error",
    code,
    message,
    filePath: options.filePath ?? null,
    path: options.path ?? "$",
    ...(options.details ? { details: options.details } : {})
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function visibleLength(value) {
  return Array.from(value.trim()).length;
}

function validateRequiredObjectField(object, key, basePath, issues, filePath) {
  const fieldPath = `${basePath}.${key}`;
  if (!hasOwn(object, key)) {
    issues.push(makeIssue("REQUIRED_FIELD", "缺少必填字段。", { filePath, path: fieldPath }));
    return false;
  }
  return true;
}

function validateString(value, fieldPath, issues, filePath) {
  if (typeof value !== "string") {
    issues.push(makeIssue("EXPECTED_STRING", "字段必须是字符串。", { filePath, path: fieldPath }));
    return false;
  }
  if (value.trim().length === 0) {
    issues.push(makeIssue("EMPTY_STRING", "必填字符串不得为空。", { filePath, path: fieldPath }));
    return false;
  }
  return true;
}

function validateTime(value, fieldPath, issues, filePath) {
  if (!validateString(value, fieldPath, issues, filePath)) return;
  if (!TIME_PATTERN.test(value)) {
    issues.push(
      makeIssue("INVALID_TIME_ANCHOR", "时间锚点必须使用 HH:MM:SS，分钟和秒需在 00—59 之间。", {
        filePath,
        path: fieldPath
      })
    );
  }
}

function timeToSeconds(value, pattern = TIME_PATTERN) {
  if (typeof value !== "string" || !pattern.test(value)) return null;
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
}

function listEvidenceAnchors(meeting) {
  const anchors = [];
  if (Array.isArray(meeting.coreTopics)) {
    meeting.coreTopics.forEach((topic, index) => {
      if (isPlainObject(topic)) anchors.push({ value: topic.anchor, path: `$.coreTopics[${index}].anchor` });
    });
  }
  if (Array.isArray(meeting.discussion)) {
    meeting.discussion.forEach((section, sectionIndex) => {
      if (!isPlainObject(section) || !Array.isArray(section.anchors)) return;
      section.anchors.forEach((anchor, anchorIndex) => {
        anchors.push({ value: anchor, path: `$.discussion[${sectionIndex}].anchors[${anchorIndex}]` });
      });
    });
  }
  if (Array.isArray(meeting.sourceAnchors)) {
    meeting.sourceAnchors.forEach((anchor, index) => {
      if (isPlainObject(anchor)) anchors.push({ value: anchor.time, path: `$.sourceAnchors[${index}].time` });
    });
  }
  return anchors;
}

function listReferencedAnchors(meeting) {
  const anchors = [];
  if (Array.isArray(meeting.coreTopics)) {
    meeting.coreTopics.forEach((topic, index) => {
      if (
        !isPlainObject(topic) ||
        typeof topic.anchor !== "string" ||
        topic.anchor.trim().length === 0
      ) {
        return;
      }
      anchors.push({ value: topic.anchor, path: `$.coreTopics[${index}].anchor` });
    });
  }
  if (Array.isArray(meeting.discussion)) {
    meeting.discussion.forEach((section, sectionIndex) => {
      if (!isPlainObject(section) || !Array.isArray(section.anchors)) return;
      section.anchors.forEach((anchor, anchorIndex) => {
        if (typeof anchor !== "string" || anchor.trim().length === 0) return;
        anchors.push({ value: anchor, path: `$.discussion[${sectionIndex}].anchors[${anchorIndex}]` });
      });
    });
  }
  return anchors;
}

function validateArray(value, fieldPath, issues, filePath) {
  if (!Array.isArray(value)) {
    issues.push(makeIssue("EXPECTED_ARRAY", "字段必须是数组。", { filePath, path: fieldPath }));
    return false;
  }
  return true;
}

function validateStringArray(value, fieldPath, issues, filePath) {
  if (!validateArray(value, fieldPath, issues, filePath)) return;
  value.forEach((item, index) => validateString(item, `${fieldPath}[${index}]`, issues, filePath));
}

function validateObjectArray(value, fieldName, issues, filePath) {
  const fieldPath = `$.${fieldName}`;
  if (!validateArray(value, fieldPath, issues, filePath)) return;
  const shape = ARRAY_ITEM_SHAPES[fieldName];

  value.forEach((item, index) => {
    const itemPath = `${fieldPath}[${index}]`;
    if (!isPlainObject(item)) {
      issues.push(makeIssue("EXPECTED_OBJECT", "数组成员必须是对象。", { filePath, path: itemPath }));
      return;
    }

    for (const [key, type] of Object.entries(shape)) {
      if (!validateRequiredObjectField(item, key, itemPath, issues, filePath)) continue;
      const childPath = `${itemPath}.${key}`;
      if (type === "string") validateString(item[key], childPath, issues, filePath);
      if (type === "time") validateTime(item[key], childPath, issues, filePath);
      if (type === "time-array") {
        if (!validateArray(item[key], childPath, issues, filePath)) continue;
        item[key].forEach((anchor, anchorIndex) =>
          validateTime(anchor, `${childPath}[${anchorIndex}]`, issues, filePath)
        );
      }
    }
  });
}

function validateDaoFaShuQiShi(value, issues, filePath) {
  const basePath = "$.daoFaShuQiShi";
  if (!isPlainObject(value)) {
    issues.push(makeIssue("EXPECTED_OBJECT", "道法术器势字段必须是对象。", { filePath, path: basePath }));
    return;
  }

  for (const [level, expectedLabel] of Object.entries(DAO_LEVELS)) {
    if (!validateRequiredObjectField(value, level, basePath, issues, filePath)) continue;
    const levelPath = `${basePath}.${level}`;
    if (!isPlainObject(value[level])) {
      issues.push(makeIssue("EXPECTED_OBJECT", "道法术器势的每一层必须是对象。", { filePath, path: levelPath }));
      continue;
    }
    for (const key of ["label", "summary"]) {
      if (!validateRequiredObjectField(value[level], key, levelPath, issues, filePath)) continue;
      validateString(value[level][key], `${levelPath}.${key}`, issues, filePath);
    }
    if (typeof value[level].label === "string" && value[level].label !== expectedLabel) {
      issues.push(
        makeIssue("INVALID_ENUM", `该层 label 必须是“${expectedLabel}”。`, {
          filePath,
          path: `${levelPath}.label`,
          details: { allowed: [expectedLabel] }
        })
      );
    }
  }
}

function validateAgentKit(value, issues, filePath) {
  const basePath = "$.agentKit";
  if (!isPlainObject(value)) {
    issues.push(makeIssue("EXPECTED_OBJECT", "agentKit 必须是对象。", { filePath, path: basePath }));
    return;
  }

  for (const key of ["context", "prompt", "questions", "knowledgeCards"]) {
    if (!validateRequiredObjectField(value, key, basePath, issues, filePath)) continue;
    if (["context", "prompt"].includes(key)) validateString(value[key], `${basePath}.${key}`, issues, filePath);
  }

  if (hasOwn(value, "questions")) {
    validateStringArray(value.questions, `${basePath}.questions`, issues, filePath);
  }
  if (hasOwn(value, "knowledgeCards")) {
    const cardsPath = `${basePath}.knowledgeCards`;
    if (validateArray(value.knowledgeCards, cardsPath, issues, filePath)) {
      value.knowledgeCards.forEach((card, index) => {
        const cardPath = `${cardsPath}[${index}]`;
        if (!isPlainObject(card)) {
          issues.push(makeIssue("EXPECTED_OBJECT", "知识卡必须是对象。", { filePath, path: cardPath }));
          return;
        }
        for (const key of ["name", "content"]) {
          if (!validateRequiredObjectField(card, key, cardPath, issues, filePath)) continue;
          validateString(card[key], `${cardPath}.${key}`, issues, filePath);
        }
      });
    }
  }
}

function parseCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function walkStrings(value, callback, currentPath = "$") {
  if (typeof value === "string") {
    callback(value, currentPath);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkStrings(item, callback, `${currentPath}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    callback(key, `${currentPath}.${key}`, { isKey: true });
    walkStrings(child, callback, `${currentPath}.${key}`);
  }
}

function containsIpv4(value) {
  const candidates = value.match(/(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)/gu) ?? [];
  return candidates.some((candidate) => candidate.split(".").every((part) => Number(part) <= 255));
}

function containsIpv6(value) {
  const candidates = value.match(/(?<![a-f0-9:])(?:[a-f0-9]{1,4}:){2,7}[a-f0-9:]{0,4}(?![a-f0-9:])/giu) ?? [];
  return candidates.some((candidate) => isIP(candidate) === 6);
}

function normalizedSensitiveText(value) {
  let normalized = value.normalize("NFKC").replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "");
  for (let round = 0; round < 2; round += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return normalized;
}

function sensitiveTypes(value, options = {}) {
  const types = new Set();
  const normalized = normalizedSensitiveText(value);
  if (
    /(?:minute|minutes|note)[._\-\s]*(?:token|id)/iu.test(normalized) ||
    /\b(?:obcn|doxcn|doccn|wikcn|bascn|fldcn|boxcn|nodcn)[a-z0-9_-]{12,}\b/iu.test(normalized)
  ) {
    types.add("PRIVATE_RESOURCE_IDENTIFIER");
  }
  const publicUrlRemoved = normalized.replace(
    /(?:(?:https?:)?\/\/)?(?:open\.(?:feishu\.cn|larksuite\.com)|www\.feishu\.cn)(?:[/:][^\s"'<>]*)?/giu,
    ""
  );
  if (/(?<![a-z0-9.-])(?:(?:https?:)?\/\/)?(?:[a-z0-9-]+\.)*(?:feishu\.cn|larksuite\.com|larkoffice\.com)(?:[/:][^\s"'<>]*)?/iu.test(publicUrlRemoved)) {
    types.add("PRIVATE_FEISHU_URL");
  }
  if (/(?<!\d)(?:\(?\+?86\)?[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}(?!\d)/u.test(normalized)) {
    types.add("PHONE_NUMBER");
  }
  if (/(?:电话|手机|联系电话|联系方式)\s*(?:=|:|：|是|为)?\s*\+\d{1,3}(?:[\s().-]?\d){7,14}(?!\d)/u.test(normalized)) {
    types.add("PHONE_NUMBER");
  }
  if (/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/iu.test(normalized)) {
    types.add("EMAIL_ADDRESS");
  }
  if (containsIpv4(normalized)) types.add("IPV4_ADDRESS");
  if (containsIpv6(normalized)) types.add("IPV6_ADDRESS");
  if (options.isKey) {
    const normalizedKey = normalized.replace(/[._\-\s]/gu, "").toLowerCase();
    if (
      /^(?:apikey|accesstoken|clientsecret|secret|password|passwd|pwd|verificationcode|otp|密钥|秘钥|密码|口令|验证码)$/u.test(
        normalizedKey
      )
    ) {
      types.add("SECRET_VALUE");
    }
    if (/^(?:openid|userid|unionid|accountid|wechatid|微信号|账号|帐号|账户|帐户)$/u.test(normalizedKey)) {
      types.add("ACCOUNT_IDENTIFIER");
    }
    if (
      /^(?:shippingaddress|homeaddress|streetaddress|detailedaddress|收货地址|家庭住址|详细地址|居住地址)$/u.test(
        normalizedKey
      )
    ) {
      types.add("DETAILED_LOCATION");
    }
    if (
      /^(?:customername|suppliername|vendorname|clientname|客户名称|供应商名称|合作方名称)$/u.test(
        normalizedKey
      )
    ) {
      types.add("PRIVATE_ENTITY_NAME");
    }
    if (
      /^(?:bankaccount|bankcard|accountbalance|salary|personalfinance|银行卡|银行账户|个人财务)$/u.test(
        normalizedKey
      )
    ) {
      types.add("PERSONAL_FINANCIAL_INFORMATION");
    }
  } else {
    if (/\b(?:sk|gh[pousr]|glpat)-?[a-z0-9_-]{16,}\b/iu.test(normalized)) types.add("SECRET_VALUE");
    if (/\bAKIA[A-Z0-9]{16,}\b/u.test(normalized)) types.add("SECRET_VALUE");
    if (/\bxox[baprs]-[a-z0-9-]{16,}\b/iu.test(normalized)) types.add("SECRET_VALUE");
    if (/\beyJ[a-z0-9_-]+\.eyJ[a-z0-9_-]+\.[a-z0-9_-]+\b/iu.test(normalized)) {
      types.add("SECRET_VALUE");
    }
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u.test(normalized)) types.add("SECRET_VALUE");
    if (/\b(?:authorization\s*:\s*)?bearer\s+[a-z0-9._~+/-]{12,}/iu.test(normalized)) {
      types.add("SECRET_VALUE");
    }
    if (
      /(?:api[._\-\s]?key|access[._\-\s]?token|client[._\-\s]?secret|secret|password|passwd|pwd|密钥|秘钥|密码|口令|验证码|verification\s*code|otp)\s*(?:为\s*)?(?:=|:|：|是|为)\s*["']?[\p{L}\p{N}_+/@.$!%*#?~-]{4,}/iu.test(
        normalized
      )
    ) {
      types.add("SECRET_VALUE");
    }
    if (
      /(?:账号|帐号|账户|帐户|微信号|企业微信|open[._\-\s]?id|user[._\-\s]?id|union[._\-\s]?id|account[._\-\s]?id)\s*(?:=|:|：|是|为)\s*[a-z0-9][a-z0-9._@-]{3,}/iu.test(
        normalized
      )
    ) {
      types.add("ACCOUNT_IDENTIFIER");
    }
    if (
      /(?:收货地址|家庭住址|详细地址|居住地址|地址)\s*(?:=|:|：|是|为)\s*[^\n,，;；]{4,}(?:\d+[号栋幢单元室楼]|路\d+|街\d+|道\d+)/u.test(
        normalized
      )
    ) {
      types.add("DETAILED_LOCATION");
    }
    if (
      /(?:办公点|办公地址|住在|位于|地址)?[^\n,，;；]{0,12}(?:省|市|自治区)[^\n,，;；]{0,12}(?:区|县)[^\n,，;；]{0,20}(?:路|街|道)\d+号/u.test(
        normalized
      )
    ) {
      types.add("DETAILED_LOCATION");
    }
    if (
      /(?:客户|供应商|合作方|合作伙伴|医院|学校|公司)(?:真实)?(?:名称|姓名|名字|全称|主体)\s*(?:=|:|：|是|为)\s*[^\n,，;；]{2,}/u.test(
        normalized
      )
    ) {
      types.add("PRIVATE_ENTITY_NAME");
    }
    if (
      /(?:客户|供应商|合作方|合作伙伴|医院|学校)\s*(?:是|为|叫)\s*[^\n,，;；]{2,}(?:公司|医院|学校|中心|工作室|机构|集团)/u.test(
        normalized
      )
    ) {
      types.add("PRIVATE_ENTITY_NAME");
    }
    if (
      /(?:我的|本人|个人|他(?:的)?|她(?:的)?)(?:银行卡|银行账户|账户|存款|余额|负债|欠款|月薪|年薪|收入|资产)\s*(?:余额)?\s*(?:=|:|：|是|为|有)?\s*(?:人民币|RMB|CNY|¥|￥)?\s*\d[\d,.]*(?:\s*(?:元|万|万元|块))?/iu.test(
        normalized
      )
    ) {
      types.add("PERSONAL_FINANCIAL_INFORMATION");
    }
    if (
      /(?:我|本人|个人|他|她)\s*(?:的)?\s*(?:月薪|年薪|收入|存款|负债|欠款|资产)\s*(?:=|:|：|是|为|有)?\s*(?:人民币|RMB|CNY|¥|￥)?\s*\d[\d,.]*(?:\s*(?:元|万|万元|块))?/iu.test(
        normalized
      )
    ) {
      types.add("PERSONAL_FINANCIAL_INFORMATION");
    }
    if (
      /(?:客户|供应商|合作方|合作伙伴)(?:的)?(?:合同金额|报价|底价|采购价|结算价|欠款|尾款|应收)\s*(?:=|:|：|是|为)?\s*(?:人民币|RMB|CNY|¥|￥)?\s*\d[\d,.]*(?:\s*(?:元|万|万元|块))?/iu.test(
        normalized
      )
    ) {
      types.add("PRIVATE_BUSINESS_INFORMATION");
    }
  }
  return types;
}

function redactSensitiveValue(value) {
  if (typeof value !== "string") return value ?? null;
  return sensitiveTypes(value).size > 0 ? "【已隐藏敏感值】" : value;
}

function scanSensitiveContent(meeting, filePath) {
  const issues = [];
  const seen = new Set();
  walkStrings(meeting, (value, fieldPath, options = {}) => {
    for (const type of sensitiveTypes(value, options)) {
      const identity = `${fieldPath}:${type}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      issues.push(
        makeIssue("SENSITIVE_CONTENT", "检测到疑似敏感信息；报告已隐藏原值，请在发布前删除或泛化。", {
          filePath,
          path: options.isKey ? "$.[【已隐藏敏感字段名】]" : fieldPath,
          details: { type }
        })
      );
    }
  });
  return issues;
}

function scanPlaceholders(meeting, filePath) {
  const issues = [];
  walkStrings(meeting, (value, fieldPath, options = {}) => {
    if (options.isKey) return;
    if (!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) return;
    issues.push(
      makeIssue("PLACEHOLDER_TEXT", "检测到占位文本，请用经过核对的内容替换。", {
        filePath,
        path: fieldPath
      })
    );
  });
  return issues;
}

function countSubstantiveCharacters(meeting) {
  let count = 0;
  for (const field of CONTENT_FIELDS) {
    if (!hasOwn(meeting, field)) continue;
    walkStrings(meeting[field], (value, _fieldPath, options = {}) => {
      if (!options.isKey) count += value.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    });
  }
  return count;
}

function explicitlyDocumentsMissingTranscript(value) {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKC").replace(/\s+/gu, "");
  return NO_USABLE_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function allowsEmptySourceAnchors(meeting) {
  if (meeting.contentStatus !== "insufficient") return false;
  if (!Array.isArray(meeting.coreTopics) || meeting.coreTopics.length !== 0) return false;
  if (!Array.isArray(meeting.discussion) || meeting.discussion.length !== 0) return false;
  if (!explicitlyDocumentsMissingTranscript(meeting.abstract)) return false;
  return (
    Array.isArray(meeting.limitations) &&
    meeting.limitations.some((item) => explicitlyDocumentsMissingTranscript(item))
  );
}

function validateSchema(meeting, filePath) {
  const issues = [];
  if (!isPlainObject(meeting)) {
    return [makeIssue("EXPECTED_OBJECT", "单场会议 JSON 的根节点必须是对象。", { filePath })];
  }

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    validateRequiredObjectField(meeting, field, "$", issues, filePath);
  }

  const stringFields = [
    "id",
    "sourceTitle",
    "title",
    "date",
    "duration",
    "sourceType",
    "contentStatus",
    "confidence",
    "abstract",
    "forAbsentees",
    "privacy"
  ];
  for (const field of stringFields) {
    if (hasOwn(meeting, field)) validateString(meeting[field], `$.${field}`, issues, filePath);
  }

  for (const field of ["learningGoals", "claimsToVerify", "limitations", "tags"]) {
    if (hasOwn(meeting, field)) validateStringArray(meeting[field], `$.${field}`, issues, filePath);
  }
  for (const field of Object.keys(ARRAY_ITEM_SHAPES)) {
    if (hasOwn(meeting, field)) validateObjectArray(meeting[field], field, issues, filePath);
  }
  if (hasOwn(meeting, "daoFaShuQiShi")) validateDaoFaShuQiShi(meeting.daoFaShuQiShi, issues, filePath);
  if (hasOwn(meeting, "agentKit")) validateAgentKit(meeting.agentKit, issues, filePath);

  for (const [field, allowed] of Object.entries(ENUMS)) {
    if (typeof meeting[field] !== "string" || allowed.includes(meeting[field])) continue;
    issues.push(
      makeIssue("INVALID_ENUM", `字段值不在允许范围内：${allowed.join(" | ")}。`, {
        filePath,
        path: `$.${field}`,
        details: { allowed }
      })
    );
  }
  return issues;
}

/**
 * Validate a single public meeting document. No external services or private files are accessed.
 */
export function validateMeeting(meeting, options = {}) {
  const filePath = options.filePath ?? null;
  const minDate = options.minDate ?? DEFAULT_MIN_DATE;
  const maxDate = options.maxDate ?? DEFAULT_MAX_DATE;
  const issues = validateSchema(meeting, filePath);

  if (!isPlainObject(meeting)) {
    return { ok: false, substantiveCharacters: 0, issues };
  }

  if (typeof meeting.id === "string" && !SLUG_PATTERN.test(meeting.id)) {
    issues.push(
      makeIssue("INVALID_SLUG", "id 必须是仅含小写字母、数字和连字符的公开 slug。", {
        filePath,
        path: "$.id"
      })
    );
  }
  if (filePath && typeof meeting.id === "string") {
    const fileName = path.basename(filePath);
    if (fileName.endsWith(".json") && fileName !== `${meeting.id}.json`) {
      issues.push(
        makeIssue("SLUG_FILENAME_MISMATCH", "文件名必须与公开 id 完全一致。", {
          filePath,
          path: "$.id"
        })
      );
    }
  }

  if (hasOwn(meeting, "date")) {
    const parsedDate = parseCalendarDate(meeting.date);
    if (!parsedDate) {
      issues.push(makeIssue("INVALID_DATE", "date 必须是有效的 YYYY-MM-DD 日历日期。", { filePath, path: "$.date" }));
    } else if (parsedDate < minDate || parsedDate > maxDate) {
      issues.push(
        makeIssue("DATE_OUT_OF_RANGE", `会议日期必须位于 ${minDate} 至 ${maxDate}（含首尾）。`, {
          filePath,
          path: "$.date",
          details: { minDate, maxDate }
        })
      );
    }
  }

  const durationSeconds = timeToSeconds(meeting.duration, DURATION_PATTERN);
  if (typeof meeting.duration === "string" && durationSeconds === null) {
    issues.push(
      makeIssue(
        "INVALID_DURATION",
        "duration 必须使用 H:MM:SS 或至少两位小时的 HH:MM:SS，分钟和秒需在 00—59 之间。",
        {
          filePath,
          path: "$.duration"
        }
      )
    );
  }
  if (durationSeconds !== null) {
    for (const anchor of listEvidenceAnchors(meeting)) {
      const anchorSeconds = timeToSeconds(anchor.value);
      if (anchorSeconds === null || anchorSeconds <= durationSeconds) continue;
      issues.push(
        makeIssue("ANCHOR_AFTER_DURATION", "证据时间锚点不得晚于会议 duration。", {
          filePath,
          path: anchor.path,
          details: { duration: meeting.duration }
        })
      );
    }
  }

  const documentedAnchors = new Set(
    Array.isArray(meeting.sourceAnchors)
      ? meeting.sourceAnchors
        .filter((anchor) => isPlainObject(anchor) && typeof anchor.time === "string")
        .map((anchor) => anchor.time)
      : []
  );
  for (const anchor of listReferencedAnchors(meeting)) {
    if (documentedAnchors.has(anchor.value)) continue;
    issues.push(
      makeIssue(
        "ANCHOR_NOT_DOCUMENTED",
        "内容引用的时间锚点必须在 sourceAnchors 中记录。",
        { filePath, path: anchor.path }
      )
    );
  }

  if (typeof meeting.abstract === "string") {
    const length = visibleLength(meeting.abstract);
    if (length < 80 || length > 160) {
      issues.push(
        makeIssue("ABSTRACT_LENGTH", "abstract 应为 80—160 个可见字符。", {
          filePath,
          path: "$.abstract",
          details: { actual: length, min: 80, max: 160 }
        })
      );
    }
  }

  if (
    Array.isArray(meeting.sourceAnchors) &&
    meeting.sourceAnchors.length === 0 &&
    !allowsEmptySourceAnchors(meeting)
  ) {
    issues.push(
      makeIssue(
        "MISSING_SOURCE_ANCHOR",
        "至少需要一个来源时间锚点；仅当 insufficient 页面没有可用转写、没有内容区块且在 abstract 与 limitations 中明确记录缺口时允许为空。",
        {
          filePath,
          path: "$.sourceAnchors"
        }
      )
    );
  }
  if (
    meeting.contentStatus === "insufficient" &&
    Array.isArray(meeting.limitations) &&
    meeting.limitations.filter((item) => typeof item === "string" && item.trim()).length === 0
  ) {
    issues.push(
      makeIssue("INSUFFICIENT_WITHOUT_REASON", "contentStatus=insufficient 时必须在 limitations 说明证据不足原因。", {
        filePath,
        path: "$.limitations"
      })
    );
  }

  const substantiveCharacters = countSubstantiveCharacters(meeting);
  const minimum = MIN_CONTENT_CHARACTERS[meeting.contentStatus];
  if (minimum && substantiveCharacters < minimum) {
    issues.push(
      makeIssue("CONTENT_TOO_SHORT", "正文信息量低于该内容状态的最低要求。", {
        filePath,
        path: "$",
        details: { actual: substantiveCharacters, minimum, contentStatus: meeting.contentStatus }
      })
    );
  }

  issues.push(...scanSensitiveContent(meeting, filePath));
  issues.push(...scanPlaceholders(meeting, filePath));
  return { ok: issues.length === 0, substantiveCharacters, issues };
}

function duplicateFingerprint(meeting) {
  const content = {
    abstract: meeting.abstract,
    forAbsentees: meeting.forAbsentees,
    learningGoals: meeting.learningGoals,
    coreTopics: meeting.coreTopics,
    transferableKnowledge: meeting.transferableKnowledge,
    discussion: meeting.discussion,
    actions: meeting.actions,
    daoFaShuQiShi: meeting.daoFaShuQiShi,
    agentKit: meeting.agentKit
  };
  return createHash("sha256").update(JSON.stringify(canonicalizeContent(content))).digest("hex");
}

function canonicalizeContent(value) {
  if (typeof value === "string") return value.normalize("NFKC").replace(/\s+/gu, "");
  if (Array.isArray(value)) return value.map(canonicalizeContent);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b, "en"))
      .map((key) => [key, canonicalizeContent(value[key])])
  );
}

function addDuplicateIssues(files, field, code, message, valueForMeeting) {
  const groups = new Map();
  for (const file of files) {
    if (!isPlainObject(file.meeting)) continue;
    const value = valueForMeeting(file.meeting);
    if (typeof value !== "string" || value.length === 0) continue;
    const group = groups.get(value) ?? [];
    group.push(file);
    groups.set(value, group);
  }

  const issues = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    for (const file of group) {
      const issue = makeIssue(code, message, { filePath: file.filePath, path: field });
      file.issues.push(issue);
      file.ok = false;
      issues.push(issue);
    }
  }
  return issues;
}

function isoTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}

function summarize(files, issues, filesDiscovered = files.length) {
  const statusCoverage = { complete: 0, partial: 0, insufficient: 0 };
  for (const file of files) {
    const status = file.meeting?.contentStatus;
    if (hasOwn(statusCoverage, status)) statusCoverage[status] += 1;
  }
  return {
    filesDiscovered,
    filesParsed: files.length,
    filesPassed: files.filter((file) => file.ok).length,
    filesFailed: filesDiscovered - files.filter((file) => file.ok).length,
    errors: issues.length,
    statusCoverage
  };
}

function sortIssues(issues) {
  return issues.sort((left, right) => {
    const leftKey = `${left.filePath ?? ""}\u0000${left.path ?? ""}\u0000${left.code}`;
    const rightKey = `${right.filePath ?? ""}\u0000${right.path ?? ""}\u0000${right.code}`;
    return leftKey.localeCompare(rightKey, "zh-CN");
  });
}

/** Audit already-loaded entries. This is convenient for build integrations and unit tests. */
export function auditMeetingEntries(entries, options = {}) {
  const files = entries.map((entry) => {
    const sensitivePathTypes = sensitiveTypes(entry.filePath);
    const safeFilePath = redactSensitiveValue(entry.filePath);
    const validation = validateMeeting(entry.meeting, {
      filePath: safeFilePath,
      minDate: options.minDate,
      maxDate: options.maxDate
    });
    if (sensitivePathTypes.size > 0) {
      validation.issues.push(
        makeIssue("SENSITIVE_FILE_PATH", "文件路径含疑似私有资源标识；报告已隐藏原路径，请重命名公开文件。", {
          filePath: safeFilePath,
          details: { types: [...sensitivePathTypes].sort() }
        })
      );
      validation.ok = false;
    }
    return {
      filePath: safeFilePath,
      meeting: entry.meeting,
      id: redactSensitiveValue(entry.meeting?.id),
      title: redactSensitiveValue(entry.meeting?.title),
      date: entry.meeting?.date ?? null,
      contentStatus: entry.meeting?.contentStatus ?? null,
      substantiveCharacters: validation.substantiveCharacters,
      ok: validation.ok,
      issues: validation.issues
    };
  });
  const issues = files.flatMap((file) => file.issues);
  issues.push(
    ...addDuplicateIssues(files, "$.id", "DUPLICATE_SLUG", "公开 slug 在目录中不唯一。", (meeting) => meeting.id),
    ...addDuplicateIssues(files, "$.title", "DUPLICATE_TITLE", "多个页面使用了相同的公开标题。", (meeting) =>
      typeof meeting.title === "string" ? meeting.title.trim() : null
    ),
    ...addDuplicateIssues(files, "$", "DUPLICATE_CONTENT", "检测到正文完全重复的页面。", duplicateFingerprint)
  );
  sortIssues(issues);
  files.forEach((file) => sortIssues(file.issues));

  const publicFiles = files.map(({ meeting: _meeting, ...file }) => file);
  return {
    schemaVersion: 1,
    generatedAt: isoTimestamp(options.now),
    ok: issues.length === 0,
    range: {
      minDate: options.minDate ?? DEFAULT_MIN_DATE,
      maxDate: options.maxDate ?? DEFAULT_MAX_DATE
    },
    summary: summarize(files, issues),
    issues,
    files: publicFiles
  };
}

async function findJsonFiles(directory) {
  const found = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const location = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(location);
      if (entry.isFile() && entry.name.endsWith(".json")) found.push(location);
    }
  }
  await visit(directory);
  return found.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function baseFailureReport(options, issue, filesDiscovered = 0, files = []) {
  return {
    schemaVersion: 1,
    generatedAt: isoTimestamp(options.now),
    ok: false,
    range: {
      minDate: options.minDate ?? DEFAULT_MIN_DATE,
      maxDate: options.maxDate ?? DEFAULT_MAX_DATE
    },
    summary: summarize(files, [issue], filesDiscovered),
    issues: [issue],
    files
  };
}

/** Read and audit all JSON files below a directory without calling external services. */
export async function auditDirectory(directory, options = {}) {
  let jsonFiles;
  try {
    jsonFiles = await findJsonFiles(directory);
  } catch (error) {
    return baseFailureReport(
      options,
      makeIssue("DIRECTORY_READ_FAILED", "无法读取内容目录。", {
        filePath: redactSensitiveValue(directory),
        details: { errorCode: error?.code ?? "UNKNOWN" }
      })
    );
  }

  if (jsonFiles.length === 0) {
    return baseFailureReport(
      options,
      makeIssue("NO_MEETING_FILES", "目录中没有可校验的 JSON 会议文件。", {
        filePath: redactSensitiveValue(directory)
      })
    );
  }

  const loaded = [];
  const parseFailures = [];
  for (const absolutePath of jsonFiles) {
    const rawFilePath = path.relative(directory, absolutePath) || path.basename(absolutePath);
    const filePath = redactSensitiveValue(rawFilePath);
    const sensitivePathTypes = sensitiveTypes(rawFilePath);
    try {
      const source = await readFile(absolutePath, "utf8");
      loaded.push({ filePath: rawFilePath, meeting: JSON.parse(source) });
    } catch (error) {
      const failureIssues = [
        makeIssue("INVALID_JSON", "文件不是有效的 UTF-8 JSON。", {
          filePath,
          details: { errorType: error?.name ?? "Error" }
        })
      ];
      if (sensitivePathTypes.size > 0) {
        failureIssues.push(
          makeIssue("SENSITIVE_FILE_PATH", "文件路径含疑似私有资源标识；报告已隐藏原路径，请重命名公开文件。", {
            filePath,
            details: { types: [...sensitivePathTypes].sort() }
          })
        );
      }
      parseFailures.push({
        filePath,
        id: null,
        title: null,
        date: null,
        contentStatus: null,
        substantiveCharacters: 0,
        ok: false,
        issues: failureIssues
      });
    }
  }

  const report = auditMeetingEntries(loaded, options);
  report.files.push(...parseFailures);
  report.files.sort((a, b) => a.filePath.localeCompare(b.filePath, "zh-CN"));
  report.issues.push(...parseFailures.flatMap((file) => file.issues));
  sortIssues(report.issues);
  report.files.forEach((file) => sortIssues(file.issues));
  report.ok = report.issues.length === 0;
  report.summary = summarize(
    loaded.map((entry) => ({
      ...report.files.find((file) => file.filePath === redactSensitiveValue(entry.filePath)),
      meeting: entry.meeting
    })),
    report.issues,
    jsonFiles.length
  );
  report.summary.filesParsed = loaded.length;
  report.summary.filesPassed = report.files.filter((file) => file.ok).length;
  report.summary.filesFailed = report.files.filter((file) => !file.ok).length;
  return report;
}

export function formatHumanReport(report) {
  const state = report.ok ? "通过" : "失败";
  const coverage = report.summary.statusCoverage;
  const lines = [
    `内容质量门禁：${state}`,
    `日期范围：${report.range.minDate} 至 ${report.range.maxDate}`,
    `文件：发现 ${report.summary.filesDiscovered}，通过 ${report.summary.filesPassed}，失败 ${report.summary.filesFailed}`,
    "内容状态覆盖：",
    `  complete     ${coverage.complete}`,
    `  partial      ${coverage.partial}`,
    `  insufficient ${coverage.insufficient}`,
    `错误：${report.summary.errors}`
  ];

  if (report.issues.length > 0) {
    lines.push("", "问题明细：");
    report.issues.forEach((issue, index) => {
      const location = [issue.filePath, issue.path].filter(Boolean).join(":");
      lines.push(`${index + 1}. [${issue.code}] ${location} — ${issue.message}`);
    });
  }
  return `${lines.join("\n")}\n`;
}

export function renderJsonReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}
