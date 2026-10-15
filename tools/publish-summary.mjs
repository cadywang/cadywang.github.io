#!/usr/bin/env node
/*
 * 发布摘要：把「这次到底会发布什么」写进 GitHub Actions 的 Summary，
 * 让发布这个动作是「看着清单点下去的」，而不是盲点。
 *
 * 用法：node tools/publish-summary.mjs [commit-ish]（默认 HEAD）
 * 找不到上一个 publish-* 标签时，按「首次发布」处理。
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const POSTS_DIR = 'source/_posts';
const target = process.argv[2] || 'HEAD';
const MAX_COMMITS = 30;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function tryGit(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

if (!tryGit(['rev-parse', '--verify', 'HEAD'])) {
  console.log('::notice::读不到 git 信息（git 不在 PATH 或不是 git 仓库），跳过发布摘要。');
  process.exit(0);
}

const lines = [];
const emit = (line) => {
  lines.push(line);
};

emit('## 本次发布内容');
emit('');

const subject = tryGit(['log', '-1', '--pretty=%s', target]);
const when = tryGit(['log', '-1', '--pretty=%ad', '--date=iso', target]);
const who = tryGit(['log', '-1', '--pretty=%an', target]);
const sha = tryGit(['rev-parse', '--short', target]);

if (sha) {
  emit(`- 目标提交：\`${sha}\`（${when}，${who}）`);
  emit(`- 提交说明：${subject}`);
  emit('');
}

const tags = tryGit(['tag', '--list', 'publish-*', '--sort=-creatordate']);
const lastTag = tags ? tags.split('\n').map((s) => s.trim()).filter(Boolean)[0] : null;

function listPosts(ref) {
  const out = tryGit(['ls-tree', '-r', '--name-only', ref, POSTS_DIR]);
  if (!out) return [];
  return out.split('\n').map((s) => s.trim()).filter((f) => f.endsWith('.md'));
}

function postTitle(ref, file) {
  const body = tryGit(['show', `${ref}:${file}`]);
  if (!body) return null;
  const m = /^title:\s*(.+)$/m.exec(body);
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

if (!lastTag) {
  const posts = listPosts(target);
  emit('> ⚠️ 没有找到 `publish-*` 标签，按**首次发布**处理。');
  emit('');
  emit(`本次将发布全部 **${posts.length}** 篇文章：`);
  emit('');
  for (const file of posts) {
    const title = postTitle(target, file);
    emit(`- ${title ? `**${title}**` : file}  \`${file}\``);
  }
} else {
  emit(`> 与上次发布 \`${lastTag}\` 比较。`);
  emit('');
  const range = `${lastTag}..${target}`;
  const commits = tryGit(['log', '--pretty=format:%h %ad %s', '--date=short', range]);

  if (commits === null) {
    emit('- 无法比较历史（可能是浅克隆），请人工核对 diff。');
  } else if (commits === '') {
    emit('- 与上次发布相比**没有新提交**——如果这是预期行为（重新构建）可以继续。');
  } else {
    const list = commits.split('\n');
    emit(`本次包含 **${list.length}** 个提交：`);
    emit('');
    emit('```');
    for (const c of list.slice(0, MAX_COMMITS)) emit(c);
    if (list.length > MAX_COMMITS) emit(`...（还有 ${list.length - MAX_COMMITS} 个提交未列出）`);
    emit('```');

    const changed = tryGit(['diff', '--name-status', range]) || '';
    const posts = [];
    const others = [];
    for (const row of changed.split('\n').map((s) => s.trim()).filter(Boolean)) {
      const [status, ...rest] = row.split('\t');
      const file = rest.join('\t');
      if (file.startsWith(`${POSTS_DIR}/`) && file.endsWith('.md')) {
        posts.push({ status: status.charAt(0), file });
      } else if (file) {
        others.push(file);
      }
    }

    emit('');
    if (posts.length === 0) {
      emit('- 文章本身没有变化（可能只是改了主题/配置）。');
    } else {
      emit(`文章改动 **${posts.length}** 篇：`);
      emit('');
      for (const p of posts) {
        const label = p.status === 'D' ? '删除' : p.status === 'A' ? '新增' : '修改';
        const title = p.status === 'D' ? null : postTitle(target, p.file);
        emit(`- [${label}] ${title ? `**${title}**` : p.file}  \`${p.file}\``);
      }
    }
    if (others.length > 0) {
      emit('');
      emit(`其他文件改动 **${others.length}** 个（主题、配置、工作流等）。`);
    }
  }
}

emit('');
emit('---');
emit('');
emit('确认无误就继续走 `build` → `deploy`；发现问题可以直接取消这次运行，线上不会变。');

const markdown = `${lines.join('\n')}\n`;

console.log(markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  try {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown, 'utf8');
  } catch (err) {
    console.log(`::warning::写入 step summary 失败：${err.message}`);
  }
}