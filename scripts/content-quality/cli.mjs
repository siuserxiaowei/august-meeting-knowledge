#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MAX_DATE,
  DEFAULT_MIN_DATE,
  auditDirectory,
  formatHumanReport,
  renderJsonReport
} from "./index.mjs";

const USAGE = `用法: node scripts/content-quality/cli.mjs [目录] [选项]

默认目录: content/meetings

选项:
  --format <human|json>  stdout 报告格式（默认 human）
  --json-out <路径>     额外写入 machine-readable JSON 报告
  --min-date <日期>     允许的最早日期（默认 ${DEFAULT_MIN_DATE}）
  --max-date <日期>     允许的最晚日期（默认 ${DEFAULT_MAX_DATE}）
  -h, --help            显示帮助
`;

function takeOptionValue(args, index, option) {
  const argument = args[index];
  const equalsIndex = argument.indexOf("=");
  if (equalsIndex !== -1) return { value: argument.slice(equalsIndex + 1), consumed: 0 };
  if (args[index + 1] === undefined || args[index + 1].startsWith("--")) {
    throw new Error(`${option} 缺少值。`);
  }
  return { value: args[index + 1], consumed: 1 };
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseArgs(args) {
  const parsed = {
    directory: "content/meetings",
    format: "human",
    jsonOut: null,
    minDate: DEFAULT_MIN_DATE,
    maxDate: DEFAULT_MAX_DATE,
    help: false
  };
  let positionalSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      parsed.help = true;
      continue;
    }
    if (!argument.startsWith("-")) {
      if (positionalSeen) throw new Error("只能指定一个内容目录。");
      parsed.directory = argument;
      positionalSeen = true;
      continue;
    }

    const option = argument.split("=", 1)[0];
    if (!["--format", "--json-out", "--min-date", "--max-date"].includes(option)) {
      throw new Error("存在未知参数。");
    }
    const { value, consumed } = takeOptionValue(args, index, option);
    if (value.length === 0) throw new Error(`${option} 缺少值。`);
    index += consumed;
    if (option === "--format") parsed.format = value;
    if (option === "--json-out") parsed.jsonOut = value;
    if (option === "--min-date") parsed.minDate = value;
    if (option === "--max-date") parsed.maxDate = value;
  }

  if (!["human", "json"].includes(parsed.format)) {
    throw new Error("--format 必须是 human 或 json。");
  }
  if (!isCalendarDate(parsed.minDate) || !isCalendarDate(parsed.maxDate)) {
    throw new Error("--min-date 和 --max-date 必须是有效的 YYYY-MM-DD 日历日期。");
  }
  if (parsed.minDate > parsed.maxDate) {
    throw new Error("--min-date 不得晚于 --max-date。");
  }
  return parsed;
}

function resolveCwd(io) {
  if (typeof io.cwd === "function") return io.cwd();
  if (typeof io.cwd === "string") return io.cwd;
  return process.cwd();
}

export async function runCli(args, io = process, overrides = {}) {
  let parsed;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    io.stderr.write(`参数错误：${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (parsed.help) {
    io.stdout.write(USAGE);
    return 0;
  }

  const cwd = resolveCwd(io);
  const directory = path.resolve(cwd, parsed.directory);
  const report = await auditDirectory(directory, {
    minDate: parsed.minDate,
    maxDate: parsed.maxDate,
    now: overrides.now
  });
  const displayDirectory = path.relative(cwd, directory) || ".";
  for (const issue of report.issues) {
    if (issue.filePath === directory) issue.filePath = displayDirectory;
  }
  for (const file of report.files) {
    if (file.filePath === directory) file.filePath = displayDirectory;
    for (const issue of file.issues ?? []) {
      if (issue.filePath === directory) issue.filePath = displayDirectory;
    }
  }
  const json = renderJsonReport(report);

  if (parsed.jsonOut) {
    try {
      const jsonPath = path.resolve(cwd, parsed.jsonOut);
      await mkdir(path.dirname(jsonPath), { recursive: true });
      await writeFile(jsonPath, json, "utf8");
    } catch {
      io.stderr.write("无法写入 JSON 报告；请检查输出目录是否存在、可写且不与文件冲突。\n");
      return 2;
    }
  }

  io.stdout.write(parsed.format === "json" ? json : formatHumanReport(report));
  return report.ok ? 0 : 1;
}

const isDirectInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectInvocation) {
  process.exitCode = await runCli(process.argv.slice(2));
}
