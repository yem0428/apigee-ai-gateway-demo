import test from 'node:test';
import assert from 'node:assert/strict';

// Test suite for Admin Console AI Products & Entitlements configuration logic

const DEFAULT_STANDARD_PRODUCT = {
  name: 'Standard AI Tier',
  displayName: 'Standard AI Tier',
  approvalType: 'auto',
  environments: ['dev', 'prod'],
  attributes: [
    { name: 'access', value: 'private' },
    { name: 'developer.budget.limit', value: '5000000' },
    { name: 'developer.budget.interval', value: '1' },
    { name: 'developer.budget.timeunit', value: 'month' },
    { name: 'routing.model.coding', value: 'gemini-3-flash-preview' },
    { name: 'routing.model.deep_reasoning', value: 'gemini-3-flash-preview' },
    { name: 'routing.model.simple', value: 'gemini-3.1-flash-lite' },
    { name: 'routing.model.general', value: 'gemini-3-flash-preview' },
  ],
  llmOperationGroup: {
    operationConfigs: [
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/auto', methods: ['POST'], model: 'auto' }],
        llmTokenQuota: { limit: '2000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/auto:*', methods: ['POST'], model: 'auto' }],
        llmTokenQuota: { limit: '2000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3.1-flash-lite:*', methods: ['POST'], model: 'gemini-3.1-flash-lite' }],
        llmTokenQuota: { limit: '2000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3-flash-preview:*', methods: ['POST'], model: 'gemini-3-flash-preview' }],
        llmTokenQuota: { limit: '2000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/claude-haiku-4-5@20251001:*', methods: ['POST'], model: 'claude-haiku-4-5@20251001' }],
        llmTokenQuota: { limit: '50', interval: '1', timeUnit: 'minute' },
      },
    ],
  },
};

const DEFAULT_ENTERPRISE_PRODUCT = {
  name: 'Enterprise AI Tier',
  displayName: 'Enterprise AI Tier',
  approvalType: 'auto',
  environments: ['dev', 'prod'],
  attributes: [
    { name: 'access', value: 'private' },
    { name: 'developer.budget.limit', value: '20000000' },
    { name: 'developer.budget.interval', value: '1' },
    { name: 'developer.budget.timeunit', value: 'month' },
    { name: 'routing.model.coding', value: 'gemini-3.1-pro-preview' },
    { name: 'routing.model.deep_reasoning', value: 'gemini-3.1-pro-preview' },
    { name: 'routing.model.simple', value: 'gemini-3.1-flash-lite' },
    { name: 'routing.model.general', value: 'gemini-3-flash-preview' },
  ],
  llmOperationGroup: {
    operationConfigs: [
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/auto', methods: ['POST'], model: 'auto' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/auto:*', methods: ['POST'], model: 'auto' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3.1-flash-lite:*', methods: ['POST'], model: 'gemini-3.1-flash-lite' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3-flash-preview:*', methods: ['POST'], model: 'gemini-3-flash-preview' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3.1-pro-preview:*', methods: ['POST'], model: 'gemini-3.1-pro-preview' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/claude-haiku-4-5@20251001:*', methods: ['POST'], model: 'claude-haiku-4-5@20251001' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/claude-opus-4-5@20251101:*', methods: ['POST'], model: 'claude-opus-4-5@20251101' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3.7-flash:*', methods: ['POST'], model: 'gemini-3.7-flash' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-3.8-flash:*', methods: ['POST'], model: 'gemini-3.8-flash' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-2.5-flash:*', methods: ['POST'], model: 'gemini-2.5-flash' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
      {
        apiSource: 'ai-gateway-v1',
        llmOperations: [{ resource: '/models/gemini-2.5-pro:*', methods: ['POST'], model: 'gemini-2.5-pro' }],
        llmTokenQuota: { limit: '50000', interval: '1', timeUnit: 'minute' },
      },
    ],
  },
};

test('Standard AI Tier canonical configuration has expected rate limit demo trigger', () => {
  const configs = DEFAULT_STANDARD_PRODUCT.llmOperationGroup.operationConfigs;
  const haikuConfig = configs.find((c) =>
    c.llmOperations?.some((op) => op.model === 'claude-haiku-4-5@20251001')
  );
  assert.ok(haikuConfig, 'Claude Haiku must be present in Standard AI Tier');
  assert.equal(haikuConfig.llmTokenQuota.limit, '50', 'Claude Haiku must have 50 tokens/min limit for 429 demo');
  assert.equal(haikuConfig.llmTokenQuota.interval, '1');
  assert.equal(haikuConfig.llmTokenQuota.timeUnit, 'minute');
});

test('Enterprise AI Tier canonical configuration includes full frontier models and higher quota', () => {
  const configs = DEFAULT_ENTERPRISE_PRODUCT.llmOperationGroup.operationConfigs;
  const models = configs.flatMap((c) => c.llmOperations.map((o) => o.model));

  assert.ok(models.includes('gemini-3.1-pro-preview'), 'Enterprise tier must include Gemini 3.1 Pro');
  assert.ok(models.includes('claude-opus-4-5@20251101'), 'Enterprise tier must include Claude Opus 4.5');
  assert.ok(models.includes('gemini-3.7-flash'), 'Enterprise tier must include Gemini 3.7 Flash');

  const opusConfig = configs.find((c) =>
    c.llmOperations?.some((op) => op.model === 'claude-opus-4-5@20251101')
  );
  assert.equal(opusConfig.llmTokenQuota.limit, '50000', 'Enterprise models have 50,000 token limit');
});

test('Budget limit conversions between micro-dollars and USD', () => {
  const standardMicros = DEFAULT_STANDARD_PRODUCT.attributes.find(
    (a) => a.name === 'developer.budget.limit'
  )?.value;
  const enterpriseMicros = DEFAULT_ENTERPRISE_PRODUCT.attributes.find(
    (a) => a.name === 'developer.budget.limit'
  )?.value;

  assert.equal(Number(standardMicros) / 1e6, 5.0, 'Standard budget is $5.00');
  assert.equal(Number(enterpriseMicros) / 1e6, 20.0, 'Enterprise budget is $20.00');

  // Reverse conversion
  const customUsd = 12.5;
  const convertedMicros = String(Math.round(customUsd * 1e6));
  assert.equal(convertedMicros, '12500000');
});

test('Router target model attribute mappings exist for all 4 intents', () => {
  const standardAttrs = new Map(
    DEFAULT_STANDARD_PRODUCT.attributes.map((a) => [a.name, a.value])
  );
  assert.equal(standardAttrs.get('routing.model.coding'), 'gemini-3-flash-preview');
  assert.equal(standardAttrs.get('routing.model.deep_reasoning'), 'gemini-3-flash-preview');
  assert.equal(standardAttrs.get('routing.model.simple'), 'gemini-3.1-flash-lite');
  assert.equal(standardAttrs.get('routing.model.general'), 'gemini-3-flash-preview');

  const enterpriseAttrs = new Map(
    DEFAULT_ENTERPRISE_PRODUCT.attributes.map((a) => [a.name, a.value])
  );
  assert.equal(enterpriseAttrs.get('routing.model.coding'), 'gemini-3.1-pro-preview');
  assert.equal(enterpriseAttrs.get('routing.model.deep_reasoning'), 'gemini-3.1-pro-preview');
});

test('Simulated product modifications: add model, update quota, remove model', () => {
  const clone = JSON.parse(JSON.stringify(DEFAULT_STANDARD_PRODUCT));
  
  // 1. Add model
  clone.llmOperationGroup.operationConfigs.push({
    apiSource: 'ai-gateway-v1',
    llmOperations: [{ resource: '/models/gemini-3.1-pro-preview:*', methods: ['POST'], model: 'gemini-3.1-pro-preview' }],
    llmTokenQuota: { limit: '5000', interval: '1', timeUnit: 'minute' },
  });
  assert.equal(clone.llmOperationGroup.operationConfigs.length, 6);

  // 2. Update quota for Claude Haiku from 50 to 5000
  const haiku = clone.llmOperationGroup.operationConfigs.find((c) =>
    c.llmOperations.some((op) => op.model === 'claude-haiku-4-5@20251001')
  );
  haiku.llmTokenQuota.limit = '5000';
  assert.equal(haiku.llmTokenQuota.limit, '5000');

  // 3. Remove model
  clone.llmOperationGroup.operationConfigs = clone.llmOperationGroup.operationConfigs.filter(
    (c) => !c.llmOperations.some((op) => op.model === 'gemini-3.1-flash-lite')
  );
  assert.equal(
    clone.llmOperationGroup.operationConfigs.some((c) =>
      c.llmOperations.some((op) => op.model === 'gemini-3.1-flash-lite')
    ),
    false
  );
});
