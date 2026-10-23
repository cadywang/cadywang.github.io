#!/usr/bin/env node
/*
 * 校验 PR 标题是否遵循内核规范，以及 PR 描述里的「发布审查清单」是否逐条勾选。
 *
 * 标题规则与 serial-debug-bridge / skills 的 commit 门禁同源：PR 标题是检索入口，
 * 一旦有人改回 squash 合并，它就会变成 main 上的提交标题。
 *
 * 清单条目来自 .github/pull_request_template.md 的「发布审查清单」小节，
 * 「必须全部勾选」这件事由本脚本强制（CI job: pr-checklist）。
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TEMPLATE = '.github/pull_request_template.md';
const SECTION_RE = /^#{2,4}\s*发布审查清单\s*$/;
const HEADING_RE = /^#{2,4}\s+\S/;
const ITEM_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*$/;
const BOT_RE = /\[bot\]$/i;
const SCOPE_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/+-]*(\s*\[[^\]]+\])?:\s+\S/;
const CONVENTIONAL_RE = /^(?:feat|feature|fix|bugfix|chore|refactor|style|perf|build|hotfix|revert|wip|misc|various|deps|release)(?:\([^)]*\))?!?:\s/i;
const BAD_FIRST_WORDS = new Set([
  'added', 'adds', 'adding', 'fixed', 'fixes', 'fixing', 'updated', 'updates',
  'updating', 'removed', 'removes', 'removing', 'new', 'support', 'supported',
  'supports', 'changed', 'changes', 'implemented', 'implements', 'cleanup',
  'refactored', 'reverted', 'bump', 'bumped', 'initial', 'wip', 'misc', 'various',
]);

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function checklistItems(template) {
  const lines = template.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => SECTION_RE.test(l));
  if (start === -1) return null;
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) break;
    const m = ITEM_RE.exec(lines[i]);
    if (m) items.push(normalize(m[2]));
  }
  return items;
}

export function tickedItems(body) {
  const ticked = new Set();
  for (const line of String(body || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = ITEM_RE.exec(line);
    if (m && m[1].toLowerCase() === 'x') ticked.add(normalize(m[2]));
  }
  return ticked;
}

export function titleErrors(title) {
  const t = String(title || '').trim();
  if (!t) return ['PR 标题为空：请用 "<subsystem>: <祈使句摘要>"'];
  const errs = [];
  if (!SCOPE_RE.test(t)) {
    errs.push('标题必须以 "<subsystem>: " 开头（例如 "post: add the ruflo guide"）');
  }
  if (CONVENTIONAL_RE.test(t)) {
    errs.push('不要用 feat:/fix: 这类 conventional-commit 标签，改用 "<subsystem>: ..."');
  }
  if (t.endsWith('.')) errs.push('标题结尾不要加句号');
  if (t.length > 72) errs.push(`标题过长（${t.length} 字符，上限 72）`);
  const after = t.includes(':') ? t.split(':').slice(1).join(':').trim() : t;
  const first = (after.split(/[\s/]+/)[0] || '').toLowerCase();
  if (BAD_FIRST_WORDS.has(first)) {
    errs.push(`标题要用祈使语气，不要用 "${first}"`);
  }
  return errs;
}

export function main() {
  const author = (process.env.PR_AUTHOR || '').trim();
  const body = process.env.PR_BODY || '';
  const title = (process.env.PR_TITLE || '').trim();

  if (BOT_RE.test(author)) {
    console.log(`::notice::PR 作者是机器人（${author}），跳过校验。`);
    return 0;
  }

  let bad = 0;
  for (const e of titleErrors(title)) {
    console.log(`::error::title: ${e}`);
    bad = 1;
  }

  const expected = checklistItems(readFileSync(TEMPLATE, 'utf8'));
  if (!expected || expected.length === 0) {
    console.log('::error file=.github/pull_request_template.md::模板里找不到「发布审查清单」小节，无法校验。');
    return 1;
  }
  if (!normalize(body)) {
    console.log('::error::PR 描述是空的——请按模板填写说明并勾选「发布审查清单」。');
    return 1;
  }

  const ticked = tickedItems(body);
  const missing = expected.filter((item) => !ticked.has(item));
  if (missing.length) {
    console.log(`::error::「发布审查清单」还有 ${missing.length} 项没有勾选，不能合并：`);
    for (const item of missing) console.log(`::error::未勾选：${item}`);
    bad = 1;
  }
  if (!bad) console.log(`pr-checklist: 标题与清单都合规（${expected.length} 项全部勾选）。`);
  return bad ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
