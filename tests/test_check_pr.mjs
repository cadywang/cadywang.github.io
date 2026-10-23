#!/usr/bin/env node
/*
 * 自测：tools/check-pr.mjs 的标题规则与清单校验。
 *
 * 只覆盖会真实出问题的形状：标题没有 subsystem、conventional-commit 标签、
 * 过去时/句号/超长，以及清单少勾、body 为空、机器人 PR。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checklistItems, normalize, main, tickedItems, titleErrors } from '../tools/check-pr.mjs';

// main() reads the real template, so the end-to-end cases must tick the
// real checklist, not the two-item fixture below.
const REAL_TEMPLATE = fileURLToPath(new URL('../.github/pull_request_template.md', import.meta.url));

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}   ${detail}`); }
}

const TEMPLATE = `## 变更内容

## 发布审查清单

- [ ] 文章标题、日期、标签、分类已填写完整
- [ ] 不含密钥、口令、内网地址等敏感信息

## 关联 Issue

- [ ] 这一条在别的小节里
`;

check('template section is read', (checklistItems(TEMPLATE) || []).length === 2);
check('normalize collapses whitespace', normalize(' A   b ') === 'a b');
check('ticked items are picked out',
  tickedItems('- [x] one\n- [ ] two\n- [X] three\n').size === 2);

check('kernel-style title passes', titleErrors('post: add the ruflo guide').length === 0);
check('missing subsystem fails', titleErrors('add the ruflo guide').length > 0);
check('conventional-commit tag fails', titleErrors('fix: add the guide').length > 0);
check('past tense fails', titleErrors('post: added the guide').length > 0);
check('trailing period fails', titleErrors('post: add the guide.').length > 0);
check('over-long title fails', titleErrors('post: ' + 'x'.repeat(80)).length > 0);

function run(title, author, body) {
  process.env.PR_TITLE = title;
  process.env.PR_AUTHOR = author;
  process.env.PR_BODY = body;
  return main();
}

const goodBody = checklistItems(readFileSync(REAL_TEMPLATE, 'utf8'))
  .map((i) => `- [x] ${i}`).join('\n');
check('a fully ticked body passes', run('post: add the ruflo guide', 'cadywang', goodBody) === 0);
check('one unticked item fails',
  run('post: add the ruflo guide', 'cadywang', goodBody.replace('- [x]', '- [ ]')) === 1);
check('empty body fails', run('post: add the ruflo guide', 'cadywang', '') === 1);
check('bot pull requests are skipped', run('whatever', 'dependabot[bot]', '') === 0);

console.log('');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
