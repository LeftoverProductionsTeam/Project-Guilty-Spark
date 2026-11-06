// Source modules are public interfaces; generated cache filenames and retired
// recovery trees are not. Parse code so negative-test strings and historical
// prose remain evidence rather than being mistaken for executable imports.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'vite';

export function dependencyIssue(specifier) {
  const value = specifier.replaceAll('\\', '/').split(/[?#]/, 1)[0];
  if (/(?:^|\/)(?:\.vite(?:-temp)?|vite-cache)(?:\/|$)/i.test(value))
    return 'Generated Vite cache is not a module interface; import a source entrypoint or package.';
  if (/(?:^|\/)\.local(?:\/|$)|(?:^|\/)preserved\/recovery-(?:archives|metadata)(?:\/|$)/i.test(value))
    return 'Retired local/recovery storage cannot supply an active module or build dependency.';
  if (/\/@fs\/.*(?:\/Temp\/|\/tmp\/|GuiltySpark-Development-)/i.test(value))
    return 'A disposable workspace URL cannot be a source-controlled module interface.';
  return null;
}

export function inspectEntrypoints(filename, text) {
  const source = parseSync(filename.endsWith('.md') ? filename + '.ts' : filename, text).program,
    issues = [];
  const report = (node) => {
    const value =
      node?.type === 'Literal' && typeof node.value === 'string'
        ? node.value
        : node?.type === 'TemplateLiteral' && node.expressions.length === 0
          ? node.quasis[0].value.cooked
          : null;
    if (value === null) return;
    const reason = dependencyIssue(value);
    if (reason)
      issues.push({
        file: filename,
        line: text.slice(0, node.start).split('\n').length,
        specifier: value,
        reason,
      });
  };
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].includes(
        node.type,
      )
    )
      report(node.source);
    if (node.type === 'TSExternalModuleReference') report(node.expression);
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'require'
    )
      report(node.arguments[0]);
    if (node.type === 'NewExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'URL')
      report(node.arguments[0]);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(source);
  return issues;
}

export async function checkSourceEntrypoints(root = fileURLToPath(new URL('..', import.meta.url))) {
  const issues = [],
    stack = ['src', 'tests', 'scripts', 'public', '.github', 'docs'];
  const files = ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'package.json', 'README.md'];
  while (stack.length) {
    const directory = stack.pop();
    for (const entry of await fs.readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw Error(`Linked source check path refused: ${relative}`);
      if (entry.isDirectory()) stack.push(relative);
      else if (/\.(?:[cm]?[jt]sx?|md|html|ya?ml)$/i.test(entry.name)) files.push(relative);
    }
  }
  for (const file of files) {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    if (/\.[cm]?[jt]sx?$/i.test(file)) issues.push(...inspectEntrypoints(file, text));
    else if (/\.md$/i.test(file)) {
      // Historical path inventories are preserved. Executable module examples
      // still need stable entrypoints, including examples in fenced snippets.
      for (const match of text.matchAll(/```(?:[cm]?[jt]sx?|javascript|typescript)\s*\r?\n([\s\S]*?)```/gi))
        issues.push(
          ...inspectEntrypoints(file, match[1]).map((row) => ({
            ...row,
            line: row.line + text.slice(0, match.index).split('\n').length,
          })),
        );
    } else if (/\.html$/i.test(file)) {
      for (const match of text.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
        const reason = dependencyIssue(match[1]);
        if (reason)
          issues.push({
            file,
            line: text.slice(0, match.index).split('\n').length,
            specifier: match[1],
            reason,
          });
      }
    }
    if (file === 'package.json') {
      const commands = Object.values(JSON.parse(text).scripts ?? {});
      for (const command of commands)
        for (const match of command.matchAll(
          /(?:^|\s)(["']?[^\s"']*(?:\.local|preserved[\\/]recovery-(?:archives|metadata))[^\s"']*)/g,
        )) {
          const reason = dependencyIssue(match[1].replace(/^["']/, ''));
          if (reason) issues.push({ file, line: 1, specifier: match[1], reason });
        }
    }
  }
  if (issues.length)
    throw Error(issues.map((row) => `${row.file}:${row.line}: ${row.reason} (${row.specifier})`).join('\n'));
  return { checkedFiles: files.length, issues: 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await checkSourceEntrypoints()));
