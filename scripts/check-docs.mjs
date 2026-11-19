#!/usr/bin/env node
// Checks that the docs agree with each other and with git. Rules: SDLC-GUIDE.md, section 7.
//
//   node scripts/check-docs.mjs            print findings; exit 1 when there are errors
//   node scripts/check-docs.mjs --session  print "In progress", the latest handover entry and findings; exit 0
//   node scripts/check-docs.mjs --hook     PreToolUse hook: block `git push` (exit 2) while there are errors
//
// No dependencies. When a check is wrong or no longer useful, change it in a pull request.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docs = path.join(root, 'docs');
const mode = process.argv.includes('--session') ? 'session' : process.argv.includes('--hook') ? 'hook' : 'check';

const errors = [];
const warnings = [];
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const err = (file, msg) => errors.push(`${rel(file)}: ${msg}`);
const warn = (file, msg) => warnings.push(`${rel(file)}: ${msg}`);

const exists = (p) => fs.existsSync(p);
const read = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : '');
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const stripCode = (s) => s.replace(/^(```|~~~)[\s\S]*?^\1.*$/gm, '').replace(/`[^`\n]*`/g, '');
const isTemplate = (p) => rel(p).split('/').some((part) => part.startsWith('_template'));

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- relative links

function checkLinks() {
  const files = [...walk(docs), ...['CLAUDE.md', 'REVIEW.md', 'SDLC-GUIDE.md'].map((f) => path.join(root, f))];
  for (const file of files) {
    if (!exists(file) || isTemplate(file)) continue;
    const text = stripCode(stripComments(read(file)));
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      let target = m[1].replace(/^<|>$/g, '');
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0];
      if (!target) continue;
      try {
        target = decodeURIComponent(target);
      } catch {}
      if (!exists(path.resolve(path.dirname(file), target))) err(file, `broken link: ${m[1]}`);
    }
  }
}

// ---------------------------------------------------------------- triage

const VERDICTS = ['bug', 'change', 'question', 'not a bug', 'duplicate'];
const STATE = /^(open|building|built \(.+\)|merged \(PR \d+\)|closed \(.+\))$/;

function readTriage() {
  const file = path.join(docs, 'triage.md');
  const rows = [];
  if (!exists(file)) {
    err(file, 'missing');
    return rows;
  }
  const seen = new Set();
  for (const line of stripComments(read(file)).split(/\r?\n/)) {
    if (!/^\|\s*TR-/.test(line)) continue;
    const cells = line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());
    const id = cells[0];
    if (cells.length !== 11) {
      err(file, `${id}: ${cells.length} columns, expected 11 (write a "|" inside a cell as "\\|")`);
      continue;
    }
    const [, date, , , , , verdict, , pathCol, change, state] = cells;
    if (!/^TR-\d{3,}$/.test(id)) err(file, `${id}: the ID must look like TR-001`);
    if (seen.has(id)) err(file, `${id}: used twice`);
    seen.add(id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) err(file, `${id}: the date must be YYYY-MM-DD`);
    if (!VERDICTS.some((v) => verdict.startsWith(v))) err(file, `${id}: verdict "${verdict}" is not one of ${VERDICTS.join(', ')}`);
    if (!/^(light|full|—|-)$/.test(pathCol)) err(file, `${id}: path "${pathCol}" must be light, full or —`);
    if (!STATE.test(state)) err(file, `${id}: state "${state}" must be open, building, built (branch), merged (PR n) or closed (reason)`);
    const folder = (change.match(/changes\/(\d{3}-[a-z0-9-]+)/) || [])[1] || null;
    if (/^(building|built|merged)/.test(state) && pathCol === 'full' && !folder) {
      err(file, `${id}: is "${state}" on the full path but links no change folder`);
    }
    if (/^(built|merged)/.test(state) && !folder) err(file, `${id}: is "${state}" but links no change folder (build.md is required)`);
    rows.push({ id, path: pathCol, state, folder, pr: (state.match(/^merged \(PR (\d+)\)/) || [])[1] || null });
  }
  return rows;
}

// ---------------------------------------------------------------- change folders

const STATUS = {
  'intent.md': ['Draft', 'Accepted', 'Rejected', 'Superseded'],
  'spec.md': ['Draft', 'Accepted', 'Superseded'],
  'plan.md': ['Draft', 'Agreed', 'Building', 'Built', 'Merged', 'Dropped'],
};

function statusOf(file) {
  if (!exists(file)) return null;
  const head = stripComments(read(file)).split(/\r?\n/).slice(0, 15).join('\n');
  const m = head.match(/^\*\*Status:\*\*\s*([A-Za-z]+)/m);
  const name = path.basename(file);
  if (!m) {
    err(file, 'no "**Status:** …" line in the first lines');
    return null;
  }
  if (!STATUS[name].includes(m[1])) err(file, `status "${m[1]}" must be one of ${STATUS[name].join(', ')}`);
  return m[1];
}

function checkChanges(triage) {
  const dir = path.join(docs, 'changes');
  if (!exists(dir)) return;
  const index = read(path.join(docs, 'README.md'));
  const numbers = new Set();
  const folders = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_'));

  for (const row of triage) {
    if (row.folder && !folders.some((f) => f.name === row.folder)) {
      err(path.join(docs, 'triage.md'), `${row.id}: change folder docs/changes/${row.folder}/ does not exist`);
    }
  }

  for (const { name } of folders) {
    const folder = path.join(dir, name);
    if (!/^\d{3}-[a-z0-9-]+$/.test(name)) {
      err(folder, 'a change folder is named NNN-short-name (digits, lower case, hyphens)');
      continue;
    }
    const n = name.slice(0, 3);
    if (numbers.has(n)) err(folder, `change number ${n} is used twice`);
    numbers.add(n);

    if (!index.includes(`changes/${name}`)) err(folder, 'not listed under "Changes" in docs/README.md');

    const rows = triage.filter((r) => r.folder === name);
    if (rows.length === 0) {
      err(folder, 'no line in docs/triage.md links this folder');
      continue;
    }
    const full = rows.some((r) => r.path === 'full');
    const has = (f) => exists(path.join(folder, f));
    const intent = statusOf(path.join(folder, 'intent.md'));
    const spec = statusOf(path.join(folder, 'spec.md'));
    const plan = statusOf(path.join(folder, 'plan.md'));

    // Gates in order: each document waits for the one before it.
    if (has('spec.md') && !has('intent.md')) err(folder, 'spec.md without intent.md');
    if (has('plan.md') && full && !has('spec.md')) err(folder, 'plan.md without spec.md on the full path');
    if (spec && spec !== 'Draft' && intent === 'Draft') err(folder, `spec.md is ${spec} while intent.md is still Draft`);
    if (plan && plan !== 'Draft' && plan !== 'Dropped' && spec === 'Draft') err(folder, `plan.md is ${plan} while spec.md is still Draft`);

    const building = rows.some((r) => /^(building|built|merged)/.test(r.state));
    const built = rows.some((r) => /^(built|merged)/.test(r.state));
    if (full && building) {
      for (const f of ['intent.md', 'spec.md', 'plan.md']) if (!has(f)) err(folder, `${f} is missing (full path, work has started)`);
      if (plan === 'Draft') err(folder, 'work has started but plan.md is still Draft');
    }
    if (built && !has('build.md')) err(folder, 'build.md is missing (the triage line says built or merged)');

    const build = read(path.join(folder, 'build.md'));
    for (const r of rows) {
      if (r.pr && build && !new RegExp(`(PR|pull request) #?${r.pr}\\b`, 'i').test(build)) {
        err(path.join(folder, 'build.md'), `${r.id} is merged (PR ${r.pr}) but the build note does not name PR ${r.pr}`);
      }
    }
    if (rows.every((r) => r.pr) && plan && !['Merged', 'Dropped'].includes(plan)) {
      warn(path.join(folder, 'plan.md'), `every triage line is merged but the plan's status is ${plan}`);
    }
  }
}

// ---------------------------------------------------------------- handover

function handoverParts() {
  const file = path.join(docs, 'handover.md');
  const text = stripComments(read(file));
  const sections = text.split(/^(?=## )/m);
  const inProgress = sections.find((s) => /^## In progress/.test(s)) || null;
  const entries = sections.filter((s) => /^## \d{4}-\d{2}-\d{2}/.test(s));
  return { file, text, inProgress, entries };
}

function checkHandover() {
  const { file, inProgress, entries } = handoverParts();
  if (!exists(file)) return err(file, 'missing');
  if (!inProgress) err(file, 'no "## In progress" section');
  if (entries.length > 5) err(file, `${entries.length} entries; keep the latest five and move the rest to handover-archive.md`);
  if (entries[0] && !/Slowed down by/i.test(entries[0])) err(file, 'the latest entry has no "Slowed down by:"');
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].slice(3, 13) > entries[i - 1].slice(3, 13)) err(file, 'entries are not newest first');
  }
  if (inProgress && git('rev-parse', '--git-dir') !== null) {
    for (const m of inProgress.matchAll(/^[-*]\s+`([^`]+)`/gm)) {
      const branch = m[1];
      const local = git('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`);
      const remote = git('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`);
      if (local === null && remote === null) warn(file, `"In progress" lists \`${branch}\`, which is not a branch here`);
    }
  }
}

// ---------------------------------------------------------------- lessons, runs, checklists

function checkLessons() {
  const file = path.join(docs, 'lessons.md');
  const claude = read(path.join(root, 'CLAUDE.md'));
  const seen = new Set();
  for (const m of stripComments(read(file)).matchAll(/^## (L-\d{3,})\b(.*)$/gm)) {
    const [, id, rest] = m;
    if (seen.has(id)) err(file, `${id}: used twice`);
    seen.add(id);
    const retired = /\(retired/i.test(rest);
    const cited = new RegExp(`\\b${id}\\b`).test(claude);
    if (!retired && !cited) err(file, `${id}: no rule in CLAUDE.md names it`);
    if (retired && cited) err(file, `${id}: is retired but CLAUDE.md still names it`);
  }
}

function checkRuns() {
  const dir = path.join(docs, 'runs');
  if (!exists(dir)) return;
  const index = read(path.join(docs, 'README.md'));
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'README.md' || name.startsWith('_')) continue;
    const file = path.join(dir, name);
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) err(file, 'a run log is named YYYY-MM-DD-name.md');
    if (!index.includes(`runs/${name}`)) err(file, 'not listed under "Runs" in docs/README.md');
  }
}

function checkChecklists() {
  const dir = path.join(docs, 'system-review', 'checklists');
  if (!exists(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'README.md' || name.startsWith('_')) continue;
    const file = path.join(dir, name);
    const seen = new Set();
    let inYou = false;
    for (const line of stripComments(read(file)).split(/\r?\n/)) {
      if (/^## /.test(line)) inYou = /^## YOU/.test(line);
      const m = !inYou && line.match(/^\|\s*(?:~~)?([A-Z]{1,3}-\d+)(?:~~)?\s*\|/);
      if (!m) continue;
      if (seen.has(m[1])) err(file, `row ${m[1]} appears twice`);
      seen.add(m[1]);
    }
  }
}

// ---------------------------------------------------------------- run

function runAll() {
  for (const f of ['CLAUDE.md', 'SDLC-GUIDE.md', 'docs/README.md']) {
    if (!exists(path.join(root, f))) err(path.join(root, f), 'missing');
  }
  for (const f of ['CLAUDE.md', 'docs/system-map.md']) {
    if (/<Project name>|<One sentence>/.test(read(path.join(root, f)))) {
      warn(path.join(root, f), 'still the starter template: run the setup-cycle skill (/setup-cycle) to fill it in from this repository');
    }
  }
  checkLinks();
  checkChanges(readTriage());
  checkHandover();
  checkLessons();
  checkRuns();
  checkChecklists();
}

function report(out) {
  for (const w of warnings) out(`warning  ${w}`);
  for (const e of errors) out(`error    ${e}`);
  if (!errors.length && !warnings.length) out('docs: no findings');
  else out(`docs: ${errors.length} error(s), ${warnings.length} warning(s)`);
}

if (mode === 'hook') {
  let command = '';
  try {
    command = JSON.parse(fs.readFileSync(0, 'utf8'))?.tool_input?.command || '';
  } catch {}
  if (!/\bgit\b[^|;&]*\bpush\b/.test(command)) process.exit(0);
  runAll();
  if (!errors.length) process.exit(0);
  console.error('git push is blocked: the docs have errors. Fix the docs (SDLC-GUIDE.md, section 7), then push again.');
  report((l) => console.error(l));
  process.exit(2);
}

runAll();

if (mode === 'session') {
  const { inProgress, entries } = handoverParts();
  if (inProgress) console.log(inProgress.trim() + '\n');
  if (entries[0]) console.log('Latest handover entry:\n\n' + entries[0].trim() + '\n');
  report((l) => console.log(l));
  process.exit(0);
}

report((l) => console.log(l));
process.exit(errors.length ? 1 : 0);
