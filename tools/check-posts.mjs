#!/usr/bin/env node
/*
 * 文章发布前校验：发布审查的第一道自动闸门。
 *
 * 校验内容：
 *   1. source/_posts/ 下的文章必须带合法 front-matter，且 title / date / tags 齐全；
 *   2. 文件名必须是全小写的 slug（可带 YYYY-MM-DD- 前缀）；
 *   3. 正文引用的本地图片/资源必须真实存在；
 *   4. draft: true、未来日期、TODO 占位等可疑情况给出告警。
 *
 * 用法：
 *   node tools/check-posts.mjs                 # 校验相对基线的本次改动（CI 默认）
 *   node tools/check-posts.mjs --base=<ref>    # 指定比较基线，如 origin/main
 *   node tools/check-posts.mjs --all           # 校验全部文章（本地自查）
 *
 * 退出码：0 = 通过（可能有告警），1 = 有错误。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const POSTS_DIR = 'source/_posts';
const SOURCE_DIR = 'source';
const REQUIRED_FIELDS = ['title', 'date', 'tags'];
const POST_FILE_RE = /^[a-z0-9][a-z0-9._-]*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/;
const TRIVIAL_RE = /\bTODO\b|\bFIXME\b|\bWIP\b|待补充|待完善|占位/;

const problems = [];
const notes = [];

function add(level, file, line, message) {
  problems.push({ level, file, line, message });
}

function stripQuotes(value) {
  const v = String(value || '').trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function asList(field) {
  const items = [];
  if (!field) return items;
  const raw = field.value;
  if (raw.startsWith('[') && raw.endsWith(']')) {
    for (const part of raw.slice(1, -1).split(',')) {
      const v = stripQuotes(part);
      if (v) items.push(v);
    }
  }
  for (const v of field.list) {
    if (v) items.push(v);
  }
  return items;
}

function parseFrontMatter(lines, file) {
  if (!lines.length || lines[0].trim() !== '---') {
    add('error', file, 1, '缺少 front-matter：文件第一行必须是 ---');
    return null;
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    add('error', file, 1, 'front-matter 缺少结束标记 ---');
    return null;
  }

  const fields = {};
  let currentKey = null;
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (raw.trim() === '' || /^\s*#/.test(raw)) continue;
    const pair = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(raw);
    if (pair) {
      currentKey = pair[1];
      fields[currentKey] = { value: pair[2].trim(), line: i + 1, list: [] };
      continue;
    }
    const item = /^\s*-\s+(.*)$/.exec(raw);
    if (item && currentKey) {
      const v = stripQuotes(item[1]);
      if (v) fields[currentKey].list.push(v);
    }
  }
  return { fields, bodyStart: end + 1 };
}

function checkLocalAssets(file, body) {
  const refs = [];
  const mdRe = /!\[[^\]]*\]\(\s*([^)\s]+)/g;
  const htmlRe = /<img[^>]*\ssrc=["']([^"']+)["']/gi;
  let m;
  while ((m = mdRe.exec(body)) !== null) refs.push(m[1]);
  while ((m = htmlRe.exec(body)) !== null) refs.push(m[1]);

  for (const ref of refs) {
    const target = ref.split(/[?#]/)[0];
    if (!target) continue;
    if (/^(?:https?:)?\/\//i.test(target) || /^(?:data|mailto|tel):/i.test(target)) continue;
    if (target.startsWith('#') || target.includes('{{') || target.includes('<%')) continue;
    let decoded = target;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      /* 保留原样 */
    }
    const candidates = decoded.startsWith('/')
      ? [path.join(SOURCE_DIR, decoded), path.join(SOURCE_DIR, decoded.replace(/^\/+/, ''))]
      : [path.join(path.dirname(file), decoded), path.join(SOURCE_DIR, decoded)];
    if (!candidates.some((p) => existsSync(p))) {
      add('error', file, null, `引用的本地资源不存在：${ref}`);
    }
  }
}

function checkPost(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);

  const base = path.basename(file);
  if (!POST_FILE_RE.test(base)) {
    add('error', file, 1, `文件名不规范：${base}（要求全小写 slug，如 my-new-post.md 或 2026-10-14-my-new-post.md）`);
  }

  const fm = parseFrontMatter(lines, file);
  if (!fm) return;
  const { fields, bodyStart } = fm;

  for (const key of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      add('error', file, 1, `front-matter 缺少必填字段：${key}`);
    }
  }

  if (fields.title) {
    const title = stripQuotes(fields.title.value);
    if (!title) add('error', file, fields.title.line, 'title 不能为空');
  }

  if (fields.date) {
    const value = stripQuotes(fields.date.value);
    if (!DATE_RE.test(value)) {
      add('error', file, fields.date.line, `date 格式不正确：${value}（建议 YYYY-MM-DD HH:mm:ss）`);
    } else {
      const parsed = new Date(value.replace(' ', 'T'));
      if (Number.isNaN(parsed.getTime())) {
        add('error', file, fields.date.line, `date 无法解析：${value}`);
      } else if (parsed.getTime() > Date.now() + 24 * 3600 * 1000) {
        add('warning', file, fields.date.line, `date 是未来时间（${value}）——Hexo 会在该时间之后才发布这篇文章，确认是有意为之吗？`);
      }
    }
  }

  if (fields.tags) {
    if (asList(fields.tags).length === 0) {
      add('error', file, fields.tags.line, 'tags 不能为空，至少写一个标签，如 tags: [随笔]');
    }
  }

  for (const key of ['draft', 'published']) {
    if (!fields[key]) continue;
    const value = stripQuotes(fields[key].value).toLowerCase();
    if ((key === 'draft' && value === 'true') || (key === 'published' && value === 'false')) {
      add('warning', file, fields[key].line, `${key}: ${value}——这篇文章不会被发布，如果本意是发布新文章请去掉该字段`);
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  if (body.length < 30) {
    add('error', file, bodyStart, '正文内容为空或过短（少于 30 个字符）');
  }
  if (TRIVIAL_RE.test(body)) {
    add('warning', file, null, '正文里出现 TODO/FIXME/待补充 等占位字样，确认不是未完成的草稿');
  }

  checkLocalAssets(file, body);
}

function walk(dir, out) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full.split(path.sep).join('/'));
    }
  }
  return out;
}

function listAllPosts() {
  return walk(POSTS_DIR, []);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function changedPosts(base) {
  const out = git(['diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD']);
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function resolveTargets(argv) {
  const all = argv.includes('--all');
  const baseArg = argv.find((a) => a.startsWith('--base='));
  const explicit = baseArg ? baseArg.slice('--base='.length) : null;

  if (all) return { files: listAllPosts(), scope: '全部文章' };

  const bases = [];
  if (explicit) bases.push(explicit);
  bases.push('origin/main', 'HEAD~1');

  let changed = null;
  let used = null;
  for (const b of bases) {
    try {
      changed = changedPosts(b);
      used = b;
      break;
    } catch {
      /* 基线不可用，换下一个 */
    }
  }
  if (changed === null) {
    notes.push('无法确定比较基线，改为校验全部文章');
    return { files: listAllPosts(), scope: '全部文章（降级）' };
  }

  const files = changed.filter((f) => f.startsWith(`${POSTS_DIR}/`) && f.endsWith('.md'));
  return { files, scope: `相对 ${used} 的改动（共 ${changed.length} 个文件，其中文章 ${files.length} 篇）` };
}

function main() {
  const { files, scope } = resolveTargets(process.argv.slice(2));
  console.log(`check-posts: ${scope}`);

  if (files.length === 0) {
    console.log('check-posts: 本次没有文章改动，跳过。');
    for (const n of notes) console.log(`::notice::${n}`);
    return 0;
  }

  for (const file of files) {
    const before = problems.length;
    checkPost(file);
    const found = problems.length - before;
    console.log(`  - ${file}${found ? `（${found} 条问题）` : '（通过）'}`);
  }

  console.log('');
  const errors = problems.filter((p) => p.level === 'error');
  for (const p of problems) {
    const where = p.line ? `file=${p.file},line=${p.line}` : `file=${p.file}`;
    console.log(`::${p.level} ${where}::${p.message}`);
  }
  for (const n of notes) console.log(`::notice::${n}`);

  const warnings = problems.filter((p) => p.level === 'warning');
  console.log('');
  console.log(`check-posts: 检查 ${files.length} 篇文章，错误 ${errors.length} 个，告警 ${warnings.length} 个。`);
  if (errors.length > 0) {
    console.log('check-posts: 校验失败——请先修好上面标出的错误，审查人不会批准带错误的文章。');
    return 1;
  }
  console.log('check-posts: 校验通过。');
  return 0;
}

process.exit(main());