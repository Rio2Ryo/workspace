import assert from 'node:assert/strict';

export function unusedNamedImports(source, fromPath) {
  const importBlock = [...source.matchAll(/import \{([\s\S]*?)\} from '([^']+)';/g)]
    .find((match) => match[2] === fromPath);
  assert.ok(importBlock, `${fromPath} named import block should exist`);
  const names = importBlock[1].split(',').map((name) => name.trim()).filter(Boolean);
  const body = source.replace(importBlock[0], '');
  return names.filter((name) => !new RegExp(`\\b${name}\\b`).test(body));
}
