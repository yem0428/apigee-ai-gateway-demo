import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GUARDRAIL_CONTROLS } from '../server/guardrailCatalog.js';
import {
  generateCatalogJson,
  parseGuardrailCatalogTs,
} from '../server/generateGuardrailCatalog.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalogSrc = readFileSync(join(here, '../src/data/guardrailPolicies.ts'), 'utf8');
const archSrc = readFileSync(
  join(here, '../src/components/ArchitectureBlueprintModal.tsx'),
  'utf8'
);

/** Pulls `id: 'x'` values out of the GUARDRAIL_CONTROLS array. */
function controlIds(src) {
  const body = src.slice(src.indexOf('GUARDRAIL_CONTROLS'));
  return [...body.matchAll(/^\s{4}id: '([^']+)',$/gm)].map((m) => m[1]);
}

/** Pulls `name: 'X'` values (policy names) out of the catalog. */
function policyNames(src) {
  return [...src.matchAll(/name: '([^']+)',\s*type: '/g)].map((m) => m[1]);
}

test('Guardrail catalog has unique control ids', () => {
  const ids = controlIds(catalogSrc);
  assert.ok(ids.length >= 10, `Expected the full catalog, got ${ids.length} controls`);
  assert.equal(new Set(ids).size, ids.length, `Duplicate control ids: ${ids.join(', ')}`);
});

test('Every guardrail control maps to an Architecture blueprint stage', () => {
  const archStageIds = new Set(
    [...archSrc.matchAll(/^\s{6}id: '([^']+)',$/gm)].map((m) => m[1])
  );
  for (const id of controlIds(catalogSrc)) {
    assert.ok(
      archStageIds.has(id),
      `Control "${id}" has no matching stage in ArchitectureBlueprintModal — the Admin Console and the blueprint would drift`
    );
  }
});

test('Catalog policy names match the policies documented in the blueprint', () => {
  const archPolicyNames = new Set(policyNames(archSrc));
  for (const name of policyNames(catalogSrc)) {
    assert.ok(
      archPolicyNames.has(name),
      `Policy "${name}" is listed in the Admin Console but not in the Architecture blueprint`
    );
  }
});

test('Every guardrail declares an enforcement point and a violation outcome', () => {
  const blocks = catalogSrc
    .slice(catalogSrc.indexOf('GUARDRAIL_CONTROLS'))
    .split(/^  \{$/m)
    .slice(1);
  assert.ok(blocks.length >= 10, `Expected >=10 control blocks, got ${blocks.length}`);
  for (const block of blocks) {
    const id = /id: '([^']+)'/.exec(block)?.[1] ?? '(unknown)';
    for (const field of ['attachPoint', 'onViolation', 'configSource', 'category', 'proxy']) {
      assert.ok(new RegExp(`${field}:`).test(block), `Control "${id}" is missing ${field}`);
    }
    assert.ok(/policies: \[/.test(block), `Control "${id}" has no policies array`);
  }
});

test('Guardrails are declared against the two deployed proxies only', () => {
  const proxies = [...catalogSrc.matchAll(/proxy: (AI_PROXY|MCP_PROXY),/g)].map((m) => m[1]);
  assert.ok(proxies.includes('AI_PROXY'), 'AI gateway guardrails must be present');
  assert.ok(proxies.includes('MCP_PROXY'), 'MCP gateway guardrails must be present');
  assert.equal(
    proxies.length,
    controlIds(catalogSrc).length,
    'Every control must name the proxy that enforces it'
  );
});

// The Admin Agent's `list_guardrails` tool answers from a server-side mirror
// (server/guardrailCatalog.json), because server.js is plain Node and cannot
// import this TypeScript module. These two tests are what stop the agent from
// describing a guardrail estate the console no longer shows.

test('The server-side guardrail mirror has the same controls, in the same order', () => {
  const parsed = parseGuardrailCatalogTs(catalogSrc);
  assert.equal(
    GUARDRAIL_CONTROLS.length,
    parsed.length,
    `Mirror has ${GUARDRAIL_CONTROLS.length} controls, catalog has ${parsed.length}. ` +
      'Re-run: node server/generateGuardrailCatalog.js'
  );
  assert.deepEqual(
    GUARDRAIL_CONTROLS.map((c) => c.id),
    parsed.map((c) => c.id),
    'Control ids drifted between guardrailPolicies.ts and server/guardrailCatalog.json. ' +
      'Re-run: node server/generateGuardrailCatalog.js'
  );
  assert.deepEqual(
    GUARDRAIL_CONTROLS.map((c) => c.id),
    controlIds(catalogSrc),
    'The mirror must match the ids declared in the TS source'
  );
});

test('The server-side guardrail mirror is byte-identical to a fresh generation', () => {
  assert.equal(
    readFileSync(join(here, '../server/guardrailCatalog.json'), 'utf8'),
    generateCatalogJson(),
    'server/guardrailCatalog.json is stale. Re-run: node server/generateGuardrailCatalog.js'
  );
});

test('Every mirrored control keeps the fields the agent answers with', () => {
  for (const control of GUARDRAIL_CONTROLS) {
    for (const field of ['gateway', 'proxy', 'title', 'category', 'summary', 'attachPoint', 'onViolation', 'configSource']) {
      assert.ok(control[field], `Mirrored control "${control.id}" is missing ${field}`);
    }
    assert.ok(Array.isArray(control.policies) && control.policies.length > 0);
    // Icons are React components; they must not survive into the server mirror.
    assert.equal(control.icon, undefined, `Mirrored control "${control.id}" should not carry an icon`);
  }
});

