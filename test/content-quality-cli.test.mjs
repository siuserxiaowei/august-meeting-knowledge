import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { parseArgs, runCli } from "../scripts/content-quality/cli.mjs";
import { syntheticMeeting } from "./fixtures/synthetic-meeting.mjs";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("scripts/content-quality/cli.mjs");

function captureIo(cwd) {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      cwd,
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) }
    },
    output: () => ({ stdout, stderr })
  };
}

async function fixtureDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "meeting-quality-cli-"));
  const meeting = syntheticMeeting();
  await writeFile(path.join(directory, `${meeting.id}.json`), JSON.stringify(meeting), "utf8");
  return directory;
}

test("CLI 参数解析支持报告格式、JSON 文件和自定义日期范围", () => {
  const parsed = parseArgs([
    "fixtures",
    "--format",
    "json",
    "--json-out",
    "reports/quality.json",
    "--min-date",
    "2026-08-02",
    "--max-date=2026-08-20"
  ]);

  assert.deepEqual(parsed, {
    directory: "fixtures",
    format: "json",
    jsonOut: "reports/quality.json",
    minDate: "2026-08-02",
    maxDate: "2026-08-20",
    help: false
  });
});

test("CLI 对未知参数和缺失参数值给出用法错误", () => {
  assert.throws(() => parseArgs(["--unknown"]), /未知参数/);
  assert.throws(() => parseArgs(["--format"]), /缺少值/);
  assert.throws(() => parseArgs(["--format", "yaml"]), /human 或 json/);
  assert.throws(() => parseArgs(["--min-date", "2026-02-30"]), /有效的 YYYY-MM-DD/);
  assert.throws(
    () => parseArgs(["--min-date", "2026-08-20", "--max-date", "2026-08-10"]),
    /不得晚于/
  );
});

test("CLI 参数错误不回显未知参数携带的疑似敏感值", async () => {
  const sensitiveArgument = "--note_id=fixture-private-resource";
  const captured = captureIo(process.cwd());

  const exitCode = await runCli([sensitiveArgument], captured.io);

  assert.equal(exitCode, 2);
  assert.match(captured.output().stderr, /未知参数/);
  assert.equal(captured.output().stderr.includes(sensitiveArgument), false);
  assert.equal(captured.output().stderr.includes("fixture-private-resource"), false);
});

test("JSON 报告写入错误不回显疑似敏感输出路径", async () => {
  const directory = await fixtureDirectory();
  const sensitiveSegment = "note_id=fixture-private-resource";
  const blockingFile = path.join(directory, sensitiveSegment);
  await writeFile(blockingFile, "fixture", "utf8");
  const captured = captureIo(directory);

  const exitCode = await runCli(
    [directory, `--json-out=${path.join(blockingFile, "quality.json")}`],
    captured.io,
    { now: "2026-08-24T00:00:00.000Z" }
  );

  assert.equal(exitCode, 2);
  assert.match(captured.output().stderr, /无法写入 JSON 报告/);
  assert.equal(captured.output().stderr.includes(sensitiveSegment), false);
  assert.equal(captured.output().stderr.includes("fixture-private-resource"), false);
});

test("CLI 默认输出人读报告，通过时返回 0", async () => {
  const directory = await fixtureDirectory();
  const captured = captureIo(directory);

  const exitCode = await runCli([directory], captured.io, { now: "2026-08-24T00:00:00.000Z" });
  const output = captured.output();

  assert.equal(exitCode, 0);
  assert.match(output.stdout, /内容质量门禁：通过/);
  assert.equal(output.stderr, "");
});

test("CLI 可同时输出 JSON 到 stdout 和指定文件", async () => {
  const directory = await fixtureDirectory();
  const outputPath = path.join(directory, "reports", "quality.json");
  const captured = captureIo(directory);

  const exitCode = await runCli(
    [directory, "--format=json", `--json-out=${outputPath}`],
    captured.io,
    { now: "2026-08-24T00:00:00.000Z" }
  );
  const stdoutReport = JSON.parse(captured.output().stdout);
  const fileReport = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(exitCode, 0);
  assert.equal(stdoutReport.ok, true);
  assert.deepEqual(fileReport, stdoutReport);
});

test("CLI 在门禁失败时返回 1，在参数错误时返回 2", async () => {
  const directory = await fixtureDirectory();
  const meetingPath = path.join(directory, "2026-08-12-synthetic-learning-session.json");
  const invalid = syntheticMeeting({ sourceAnchors: [] });
  await writeFile(meetingPath, JSON.stringify(invalid), "utf8");
  const failed = captureIo(directory);
  const usage = captureIo(directory);

  const failedCode = await runCli([directory], failed.io, { now: "2026-08-24T00:00:00.000Z" });
  const usageCode = await runCli(["--wat"], usage.io);

  assert.equal(failedCode, 1);
  assert.match(failed.output().stdout, /内容质量门禁：失败/);
  assert.equal(usageCode, 2);
  assert.match(usage.output().stderr, /未知参数/);
});

test("CLI help 不执行扫描且输出用法", async () => {
  const directory = await fixtureDirectory();
  const captured = captureIo(directory);

  const exitCode = await runCli(["--help"], captured.io);

  assert.equal(exitCode, 0);
  assert.match(captured.output().stdout, /用法:/);
});

test("端到端：真实 Node 子进程可扫描合成 JSON 并返回 machine-readable 报告", async () => {
  const directory = await fixtureDirectory();

  const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, directory, "--format=json"]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.summary.filesPassed, 1);
  assert.equal(stderr, "");
});

test("目录错误报告使用调用方给出的相对路径，不泄露当前机器绝对路径", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "meeting-quality-relative-"));
  const emptyDirectory = path.join(root, "empty-content");
  await mkdir(emptyDirectory);
  const captured = captureIo(root);

  const exitCode = await runCli(["empty-content"], captured.io, { now: "2026-08-24T00:00:00.000Z" });
  const output = captured.output().stdout;

  assert.equal(exitCode, 1);
  assert.match(output, /empty-content/);
  assert.equal(output.includes(root), false);
});

test("不存在的敏感目录名会被隐藏，不进入人读报告", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "meeting-quality-sensitive-directory-"));
  const sensitiveDirectory = "note_id=fixture-private-resource";
  const captured = captureIo(root);

  const exitCode = await runCli([sensitiveDirectory], captured.io, {
    now: "2026-08-24T00:00:00.000Z"
  });
  const output = captured.output().stdout;

  assert.equal(exitCode, 1);
  assert.equal(output.includes(sensitiveDirectory), false);
  assert.equal(output.includes("fixture-private-resource"), false);
  assert.match(output, /已隐藏敏感值/);
});
