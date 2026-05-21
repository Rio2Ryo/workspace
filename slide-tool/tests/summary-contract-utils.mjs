import assert from 'node:assert/strict';

function isDiscordReportSummaryBundle(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Object.hasOwn(value, 'summary') &&
    Object.hasOwn(value, 'deliveryReadiness') &&
    Object.hasOwn(value, 'checkedArtifactTypes') &&
    Object.hasOwn(value, 'checkedArtifacts')
  );
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertAllowedOptionKeys(options, allowedKeys, label) {
  const actualKeys = Object.keys(options ?? {});
  const unknownKeys = actualKeys.filter((key) => allowedKeys.includes(key) === false);
  assert.equal(
    unknownKeys.length,
    0,
    `unexpected ${label} option keys: ${unknownKeys.sort().join(', ') || '(none)'}`,
  );
}

function assertOverridesMatchShape(base, overrides, label, path = label) {
  if (Array.isArray(base)) {
    assert.equal(
      Array.isArray(overrides),
      true,
      `unexpected ${label} type at ${path}: expected array, got ${describeValueType(overrides)}`,
    );
    return;
  }
  if (isPlainObject(base)) {
    assert.equal(
      isPlainObject(overrides),
      true,
      `unexpected ${label} type at ${path}: expected plain object, got ${describeValueType(overrides)}`,
    );
  } else if (base !== undefined) {
    assert.equal(
      isPlainObject(overrides) || Array.isArray(overrides),
      false,
      `unexpected ${label} type at ${path}: expected primitive override, got ${describeValueType(overrides)}`,
    );
    return;
  }
  if (!isPlainObject(overrides)) return;
  for (const [key, value] of Object.entries(overrides)) {
    assert.equal(
      Object.hasOwn(base ?? {}, key),
      true,
      `unexpected ${label} key at ${path}.${key}`,
    );
    const baseValue = base?.[key];
    if (Array.isArray(baseValue)) {
      assert.equal(
        Array.isArray(value),
        true,
        `unexpected ${label} type at ${path}.${key}: expected array, got ${describeValueType(value)}`,
      );
      continue;
    }
    if (isPlainObject(baseValue)) {
      assert.equal(
        isPlainObject(value),
        true,
        `unexpected ${label} type at ${path}.${key}: expected plain object, got ${describeValueType(value)}`,
      );
      assertOverridesMatchShape(baseValue, value, label, `${path}.${key}`);
      continue;
    }
    if (isPlainObject(value) || Array.isArray(value)) {
      throw new assert.AssertionError({
        message: `unexpected ${label} type at ${path}.${key}: expected primitive override, got ${describeValueType(value)}`,
      });
    }
  }
}

function describeValueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function mergePlainObject(base, overrides = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergePlainObject(base[key], value);
      continue;
    }
    merged[key] = cloneFixtureValue(value);
  }
  return merged;
}

function cloneFixtureValue(value) {
  if (Array.isArray(value) || isPlainObject(value)) {
    return structuredClone(value);
  }
  return value;
}

export function createCanonicalDiscordReportSummaryBundle(overrides = {}) {
  const base = {
    deliveryReadiness: {
      status: 'ready',
      ok: true,
      reasons: [],
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      visualQaSource: 'fallback',
      visualQaWidth: 1280,
      visualQaHeight: 900,
      visualQaUniqueSampledColors: 4,
    },
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
  };
  assertOverridesMatchShape(base, overrides, 'discord report summary bundle');
  return mergePlainObject(base, overrides);
}

export function createCanonicalDiscordReportContext(options = {}) {
  assertAllowedOptionKeys(options, ['reportSummaryBundle', 'reportSummaryContext'], 'discord report context');
  const {
    reportSummaryBundle: summaryOverrides = {},
    reportSummaryContext: contextOverrides = {},
  } = options;
  return createCanonicalReportContextCore(
    createCanonicalDiscordReportSummaryBundle(summaryOverrides),
    contextOverrides,
    'discord report context',
    false,
  );
}

export function createCanonicalDiscordReadyOutput(options = {}) {
  assertAllowedOptionKeys(options, ['summary', 'reportSummaryBundle', 'reportSummaryContext', 'deliveryReadiness', 'output'], 'discord ready');
  const {
    summary: summaryOverrides = {},
    reportSummaryBundle: reportSummaryBundleOverrides,
    reportSummaryContext: reportSummaryContextOverrides,
    deliveryReadiness: deliveryReadinessOverrides = {},
    output: outputOverrides = {},
  } = options;
  const reportSummaryBundle = reportSummaryBundleOverrides ?? {};
  const reportSummaryContext = reportSummaryContextOverrides ?? {};
  const reportSummaryBundleSnapshot = createCanonicalDiscordReportSummaryBundle(summaryOverrides);
  const reportSummaryContextSnapshot = createCanonicalStudioDiscordReportContext({
    reportSummaryBundle,
    reportSummaryContext,
  });
  const base = {
    ok: true,
    message: 'ready for Discord delivery',
    deliveryReadiness: createCanonicalStudioDeliveryReadinessSnapshot(deliveryReadinessOverrides),
    summary: reportSummaryBundleSnapshot,
    reportSummaryBundle: reportSummaryBundleSnapshot,
    reportSummaryContext: reportSummaryContextSnapshot,
    attachments: {
      required: [],
      optional: [],
      audit: [],
      auditPaths: [],
      deliverablePaths: [],
      postablePaths: [],
    },
    warnings: [],
    deliveryMessage: '納品準備OK:\n- status: ready\n- ok: true',
    deliveryMessagePath: '/tmp/delivery-message.md',
    deliveryMessageVerified: true,
    deliveryManifest: {},
    deliveryManifestPath: '/tmp/delivery-manifest.json',
    deliveryManifestVerified: true,
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
  };
  assertOverridesMatchShape(base, outputOverrides, 'discord ready output');
  return mergePlainObject(base, outputOverrides);
}

export function createCanonicalStudioDeliveryReadinessSnapshot(overrides = {}) {
  const base = {
    ok: true,
    verification: 'ready',
    acceptance: 'ready',
    visualQa: 'ready',
    visualQaSource: 'fallback',
    visualQaWidth: 1280,
    visualQaHeight: 900,
    visualQaUniqueSampledColors: 4,
    pptxImages: 0,
    pptxSpecialElements: 0,
    pptxHiddenText: 0,
    line: 'delivery readiness: ready',
    reasonsLine: 'reasons: none',
    reasons: [],
    message: 'ready for Discord delivery',
  };
  assertOverridesMatchShape(base, overrides, 'discord ready deliveryReadiness');
  return mergePlainObject(base, overrides);
}

export function createCanonicalVerifyDiscordReportContext(options = {}) {
  assertAllowedOptionKeys(options, ['reportSummaryBundle', 'reportSummaryContext'], 'verify-discord-report context');
  const {
    reportSummaryBundle: summaryOverrides = {},
    reportSummaryContext: contextOverrides = {},
  } = options;
  const summary = createCanonicalDiscordReportSummaryBundle(summaryOverrides);
  const base = {
    acceptanceManifest: {
      path: '/tmp/verify-discord-report.acceptance.manifest.json',
      scope: 'report',
      scopeLine: 'manifest verification scope: report',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'report',
        error: '',
      },
    },
    artifactDetails: {},
    artifacts: [],
    artifactsByType: {},
    attachmentPolicy: {
      required: ['pptx', 'html'],
      optional: ['outline', 'prompts'],
      audit: ['manifest'],
      requiredReady: true,
    },
    attachments: {
      required: [],
      optional: [],
      audit: [],
      auditPaths: [],
      deliverablePaths: [],
      postablePaths: [],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    deliveryReadiness: structuredClone(summary.deliveryReadiness),
    checkedArtifactTypes: structuredClone(summary.checkedArtifactTypes),
    checkedArtifacts: structuredClone(summary.checkedArtifacts),
    message: '投稿OK: slide deck / slides 1 / acceptance ready',
    postable: true,
    pptxInternalQa: {
      verification: {
        images: { count: 0, line: 'PPTX images: 0 (none)' },
        specialElements: { count: 0, line: 'PPTX special elements: 0 (none)' },
        hiddenText: { count: 0, line: 'PPTX hidden text: 0' },
      },
      acceptance: {
        images: { count: 0, line: 'PPTX images: 0 (none)' },
        specialElements: { count: 0, line: 'PPTX special elements: 0 (none)' },
        hiddenText: { count: 0, line: 'PPTX hidden text: 0' },
      },
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp',
      basename: 'deck',
    },
    slides: {
      outline: 1,
      html: 1,
      pptx: 1,
    },
    summary,
    title: 'Report Status',
    visualQa: {
      verification: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
      acceptance: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
    },
  };
  assertOverridesMatchShape(base, contextOverrides, 'verify-discord-report context');
  return mergePlainObject(base, contextOverrides);
}

export function createCanonicalStudioDiscordReportContext(options = {}) {
  assertAllowedOptionKeys(options, ['reportSummaryBundle', 'reportSummaryContext'], 'discord ready report summary');
  const {
    reportSummaryBundle: summaryOverrides = {},
    reportSummaryContext: contextOverrides = {},
  } = options;
  return createCanonicalReportContextCore(
    createCanonicalDiscordReportSummaryBundle(summaryOverrides),
    contextOverrides,
    'discord ready report summary',
    true,
  );
}

export function createCanonicalVerifyDiscordReportOutputContext(options = {}) {
  assertAllowedOptionKeys(options, ['reportSummaryBundle', 'reportSummaryContext', 'output'], 'verify-discord-report output');
  const {
    reportSummaryBundle: reportSummaryBundleOverrides,
    reportSummaryContext: reportSummaryContextOverrides,
    output: outputOverrides = {},
  } = options;
  const reportSummaryBundle = reportSummaryBundleOverrides ?? {};
  const reportSummaryContext = reportSummaryContextOverrides ?? {};
  const base = {
    ok: true,
    report: '/tmp/verify-discord-report.md',
    sections: {
      verification: 'ready',
      acceptance: 'ready',
    },
    summary: createCanonicalVerifyDiscordReportContext({
      reportSummaryBundle,
      reportSummaryContext,
    }),
    errors: [],
    warnings: [],
  };
  assertOverridesMatchShape(base, outputOverrides, 'verify-discord-report output');
  return mergePlainObject(base, outputOverrides);
}

function createCanonicalReportContextCore(summary, contextOverrides, label, includeDeliveryArtifacts) {
  const summaryDeliveryReadiness = structuredClone(summary.deliveryReadiness);
  const base = {
    acceptanceManifest: {
      path: '/tmp/discord-report.acceptance.manifest.json',
      scope: 'report',
      scopeLine: 'manifest verification scope: report',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'report',
        error: '',
      },
    },
    artifactDetails: {},
    artifacts: [],
    artifactsByType: {},
    attachmentPolicy: {
      required: ['pptx', 'html'],
      optional: ['outline', 'prompts'],
      audit: ['manifest'],
      requiredReady: true,
    },
    attachments: {
      required: [],
      optional: [],
      audit: [],
      auditPaths: [],
      deliverablePaths: [],
      postablePaths: [],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
    },
    deliveryReadiness: summaryDeliveryReadiness,
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    checkedArtifacts: {
      status: 'present',
      count: 1,
      line: 'checked artifacts: 1',
    },
    message: '投稿OK: slide deck / slides 1 / acceptance ready',
    postable: true,
    pptxInternalQa: {
      verification: {
        images: { count: 0, line: 'PPTX images: 0 (none)' },
        specialElements: { count: 0, line: 'PPTX special elements: 0 (none)' },
        hiddenText: { count: 0, line: 'PPTX hidden text: 0' },
      },
      acceptance: {
        images: { count: 0, line: 'PPTX images: 0 (none)' },
        specialElements: { count: 0, line: 'PPTX special elements: 0 (none)' },
        hiddenText: { count: 0, line: 'PPTX hidden text: 0' },
      },
    },
    reportArtifactIdentity: {
      name: 'deck deck',
      type: 'deck',
      dir: '/tmp',
      basename: 'deck',
    },
    slides: {
      outline: 1,
      html: 1,
      pptx: 1,
    },
    summary,
    title: 'Report Status',
    visualQa: {
      verification: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
      acceptance: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
        source: 'fallback',
        width: 1280,
        height: 900,
        uniqueSampledColors: 42,
      },
    },
  };
  if (includeDeliveryArtifacts) {
    base.deliveryMessage = {
      path: '/tmp/delivery-message.md',
      exists: true,
      bytes: 0,
      readyHeaderPresent: true,
      verificationHeaderPresent: true,
      artifactSectionPresent: true,
      artifactIdentity: {},
      expectedArtifact: {},
      attachmentSectionPresent: true,
      auditSectionPresent: true,
      attachmentsMatched: true,
      missingAttachments: [],
      missingDeliverableAttachments: [],
      missingAuditAttachments: [],
      wrongSectionAuditAttachments: [],
      qaSectionPresent: true,
      expectedQaLines: [],
      actualQaLines: [],
      qaDiff: {
        missingLines: [],
        actualLines: [],
        allowedUnexpectedLines: [],
        unexpectedLines: [],
        orderMatched: true,
        firstMismatch: null,
      },
      expectedIdentityQaLine: 'identity checks: report ready / deliveryMessage ready',
      qaOrderMatched: true,
      duplicateQaLines: [],
      qaMatched: true,
      missingQaLines: [],
    };
    base.deliveryManifest = {
      path: '/tmp/delivery-manifest.json',
      exists: true,
      artifacts: [],
      expectedArtifactPaths: [],
      bytes: 0,
      checks: {
        schemaVersionMatched: true,
        titleMatched: true,
        artifactNameMatched: true,
        artifactTypeMatched: true,
        artifactDirMatched: true,
        basenameMatched: true,
        readyHeaderMatched: true,
        verificationHeaderMatched: true,
        qaLinesMatched: true,
        qaLinesUnique: true,
        deliverablePathsUnique: true,
        auditPathsUnique: true,
        identityChecksRequired: true,
        identityChecksPresent: true,
        identityChecksMatched: true,
        deliverablePathsMatched: true,
        auditPathsMatched: true,
      },
      duplicateQaLines: [],
      duplicateDeliverablePaths: [],
      duplicateAuditPaths: [],
      expected: {},
      actual: {},
      error: null,
    };
    base.identityChecks = {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    };
  }
  assertOverridesMatchShape(base, contextOverrides, label);
  const context = mergePlainObject(base, contextOverrides);
  if (includeDeliveryArtifacts) {
    context.deliveryMessage = mergePlainObject(base.deliveryMessage, contextOverrides.deliveryMessage ?? {});
    context.deliveryManifest = mergePlainObject(base.deliveryManifest, contextOverrides.deliveryManifest ?? {});
  }
  return context;
}

export function assertRootOnlySnapshotBundle(bundle, keys) {
  assert.equal(bundle && typeof bundle, 'object');
  assert.equal(Array.isArray(bundle), false);
  for (const key of keys) {
    assert.equal(Object.hasOwn(bundle, key), true, `missing bundle key: ${key}`);
    assert.equal(Object.hasOwn(bundle[key], key), false, `nested self-copy detected for ${key}`);
    assertNoNestedSnapshotKey(bundle[key], keys, key);
    assertNoNestedSummaryKey(bundle[key], key);
  }
}

function assertNoNestedSnapshotKey(value, keys, ownerKey, path = ownerKey) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key)) {
      throw new assert.AssertionError({
        message: `nested self-copy detected for ${key} at ${path}.${key}`,
      });
    }
    assertNoNestedSnapshotKey(child, keys, ownerKey, `${path}.${key}`);
  }
}

function assertNoNestedSummaryKey(value, ownerKey) {
  const walk = (current, path) => {
    if (!current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current)) {
      if (key === 'summary') {
        throw new assert.AssertionError({
          message: `nested self-copy detected for ${ownerKey} at ${path}.summary`,
        });
      }
      walk(child, `${path}.${key}`);
    }
  };
  walk(value, ownerKey);
}

function assertExactOwnKeys(value, keys, label) {
  const actualKeys = Object.keys(value ?? {}).sort();
  const expectedKeys = [...keys].sort();
  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `unexpected ${label} keys: expected ${expectedKeys.join(', ') || '(none)'}, got ${actualKeys.join(', ') || '(none)'}`,
  );
}

function assertRequiredOwnKeys(value, keys) {
  for (const key of keys) {
    assert.equal(Object.hasOwn(value ?? {}, key), true, `missing bundle key: ${key}`);
  }
}

export function assertRootOnlyDiscordReportSummaryBundle(
  summary,
  expected = createCanonicalDiscordReportSummaryBundle(),
) {
  assertExactOwnKeys(summary, ['deliveryReadiness', 'checkedArtifactTypes', 'checkedArtifacts'], 'summary bundle');
  assertRootOnlySnapshotBundle(summary, ['deliveryReadiness', 'checkedArtifactTypes', 'checkedArtifacts']);
  assert.deepEqual(summary, expected);
}

export function assertVerifyDiscordReportContext(
  context,
  expectedSummary = createCanonicalDiscordReportSummaryBundle(),
) {
  assertDiscordReportContextCore(context, expectedSummary, 'verify-discord-report context', false);
}

export function assertStudioDiscordReportContext(
  context,
  expectedContext = null,
) {
  if (expectedContext !== null) {
    assert.deepEqual(context, expectedContext);
  }
  assertDiscordReportContextCore(context, context?.summary ?? createCanonicalDiscordReportSummaryBundle(), 'discord ready report summary', true);
}

function assertDiscordReportContextCore(
  context,
  expectedSummary,
  label,
  includeDeliveryArtifacts,
) {
  const expectedKeys = [
    'acceptanceManifest',
    'artifactDetails',
    'artifacts',
    'artifactsByType',
    'attachmentPolicy',
    'attachments',
    'identityChecks',
    'deliveryReadiness',
    'checkedArtifactTypes',
    'checkedArtifacts',
    'message',
    'postable',
    'pptxInternalQa',
    'reportArtifactIdentity',
    'slides',
    'summary',
    'title',
    'visualQa',
  ];
  if (includeDeliveryArtifacts) {
    expectedKeys.splice(8, 0, 'deliveryMessage', 'deliveryManifest');
  }
  assertExactOwnKeys(context, expectedKeys, label);
  assert.equal(
    isDiscordReportSummaryBundle(context),
    false,
    'expected report summary context, got root-only summary bundle',
  );
  assert.equal(
    isDiscordReportSummaryBundle(context?.summary),
    true,
    'missing root-only summary bundle',
  );
  assertRootOnlySnapshotBundle(context.summary, ['deliveryReadiness', 'checkedArtifactTypes', 'checkedArtifacts']);
  assert.deepEqual(context.summary, expectedSummary);
  assert.deepEqual({
    deliveryReadiness: context.deliveryReadiness,
    checkedArtifactTypes: context.checkedArtifactTypes,
    checkedArtifacts: context.checkedArtifacts,
  }, expectedSummary);
  if (includeDeliveryArtifacts) {
    assert.equal(isPlainObject(context.deliveryMessage), true, 'missing deliveryMessage summary');
    assert.equal(isPlainObject(context.deliveryManifest), true, 'missing deliveryManifest summary');
  }
}

export function assertVerifyDiscordReportOutputContext(
  output,
) {
  assertExactOwnKeys(output, ['ok', 'report', 'sections', 'summary', 'errors', 'warnings'], 'verify-discord-report output');
  assert.equal(typeof output.ok, 'boolean', 'verify-discord-report ok must be a boolean');
  assert.equal(typeof output.report, 'string', 'verify-discord-report report must be a string');
  assertExactOwnKeys(output.sections, ['verification', 'acceptance'], 'verify-discord-report sections');
  assert.equal(Array.isArray(output.errors), true, 'verify-discord-report errors must be an array');
  assert.equal(Array.isArray(output.warnings), true, 'verify-discord-report warnings must be an array');
  assertVerifyDiscordReportContext(output?.summary);
}

export function assertStudioDiscordReadyOutputContext(
  output,
  expected = {},
) {
  assertAllowedOptionKeys(expected ?? {}, ['summary', 'reportSummaryBundle', 'reportSummaryContext', 'deliveryReadiness'], 'discord ready expected');
  const {
    summary: expectedSummary = createCanonicalDiscordReportSummaryBundle(),
    reportSummaryBundle: expectedReportSummaryBundle = expectedSummary,
    reportSummaryContext: expectedReportSummaryContext = null,
    deliveryReadiness: expectedDeliveryReadiness = createCanonicalStudioDeliveryReadinessSnapshot(),
  } = expected ?? {};
  assertExactOwnKeys(output, [
    'ok',
    'message',
    'deliveryReadiness',
    'summary',
    'reportSummaryBundle',
    'reportSummaryContext',
    'attachments',
    'warnings',
    'deliveryMessage',
    'deliveryMessagePath',
    'deliveryMessageVerified',
    'deliveryManifest',
    'deliveryManifestPath',
    'deliveryManifestVerified',
    'identityChecks',
  ], 'discordReady output');
  assert.equal(typeof output.ok, 'boolean', 'discordReady ok must be a boolean');
  assert.equal(typeof output.message, 'string', 'discordReady message must be a string');
  assert.equal(Array.isArray(output.warnings), true, 'discordReady warnings must be an array');
  assert.equal(typeof output.deliveryMessage, 'string', 'discordReady deliveryMessage must be a string');
  assert.equal(typeof output.deliveryMessagePath, 'string', 'discordReady deliveryMessagePath must be a string');
  assert.equal(typeof output.deliveryMessageVerified, 'boolean', 'discordReady deliveryMessageVerified must be a boolean');
  assert.equal(typeof output.deliveryManifestPath, 'string', 'discordReady deliveryManifestPath must be a string');
  assert.equal(typeof output.deliveryManifestVerified, 'boolean', 'discordReady deliveryManifestVerified must be a boolean');
  assert.equal(typeof output.identityChecks, 'object', 'discordReady identityChecks must be an object');
  assertExactOwnKeys(output.attachments, ['required', 'optional', 'audit', 'auditPaths', 'deliverablePaths', 'postablePaths'], 'discordReady attachments');
  assert.ok(output?.reportSummaryBundle, 'missing reportSummaryBundle flat output');
  assert.ok(output?.reportSummaryContext, 'missing reportSummaryContext flat output');
  assert.deepEqual(output.deliveryReadiness, expectedDeliveryReadiness);
  assertRootOnlyDiscordReportSummaryBundle(output.summary, expectedSummary);
  assertRootOnlyDiscordReportSummaryBundle(output.reportSummaryBundle, expectedSummary);
  assertRootOnlyDiscordReportSummaryBundle(output.reportSummaryContext.summary, expectedReportSummaryBundle);
  assertStudioDiscordReportContext(output.reportSummaryContext);
  assert.deepEqual(output.reportSummaryBundle, output.summary);
  if (expectedReportSummaryContext !== null && expectedReportSummaryContext !== undefined) {
    assert.deepEqual(output.reportSummaryContext, expectedReportSummaryContext);
  }
  assert.notStrictEqual(
    output.deliveryReadiness,
    output.summary.deliveryReadiness,
    'expected discordReady deliveryReadiness and summary.deliveryReadiness to be distinct clones',
  );
  assert.notStrictEqual(
    output.deliveryReadiness,
    output.reportSummaryContext.deliveryReadiness,
    'expected discordReady deliveryReadiness and reportSummaryContext.deliveryReadiness to be distinct clones',
  );
  assert.notStrictEqual(
    output.summary,
    output.reportSummaryContext.summary,
    'expected discordReady summary and reportSummaryContext.summary to be distinct clones',
  );
}
