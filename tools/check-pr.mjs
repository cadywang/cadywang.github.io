#!/usr/bin/env node
/*
 * 校验 PR 描述里的「发布审查清单」是否逐条勾选。
 *
 * 清单条目来自 .github/pull_request_template.md 的「发布审查清单」小节，
 * 「必须全部勾选」这件事由本脚本强制（CI job: pr-checklist）。
 * 要改清单就得改模板，而改模板本身也要走 PR 审查，所以无法绕过。
 */
import { readFileSync } from 'node:fs';

const TEMPLATE = '.github/pull_request_template.md';
const SECTION_RE = /^#{2,4}\s*发布审查清单\s*$/;
const HEADING_RE = /^#{2,4}\s+\S/;
const ITEM_RE = /^\s*[-*]\s*\[( |x|X)\]\s*(.+?)\s*$/;

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function checklistItems(template) {
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

function main() {
  const author = (process.env.PR_AUTHOR || '').trim();
  const body = process.env.PR_BODY || '';

  if (/\[bot\]$/i.test(author)) {
    console.log(`::notice::PR 作者是机器人（${author}），跳过清单校验。`);
    return 0;
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

  const checked = new Set();
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const m = ITEM_RE.exec(line);
    if (m && m[1].toLowerCase() === 'x') checked.add(normalize(m[2]));
  }

  const missing = expected.filter((item) => !checked.has(item));
  if (missing.length === 0) {
    console.log(`pr-checklist: 清单 ${expected.length} 项全部勾选。`);
    return 0;
  }

  console.log(`::error::「发布审查清单」还有 ${missing.length} 项没有勾选，不能合并：`);
  for (const item of missing) console.log(`::error::未勾选：${item}`);
  return 1;
}

process.exit(main());