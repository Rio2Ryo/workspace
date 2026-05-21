import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertStudioDiscordReadyOutputContext,
  assertVerifyDiscordReportOutputContext,
  assertVerifyDiscordReportContext,
  createCanonicalDiscordReportContext,
  createCanonicalDiscordReadyOutput,
  createCanonicalVerifyDiscordReportOutputContext,
  assertRootOnlyDiscordReportSummaryBundle,
  createCanonicalDiscordReportSummaryBundle,
  createCanonicalStudioDeliveryReadinessSnapshot,
  createCanonicalStudioDiscordReportContext,
} from './summary-contract-utils.mjs';
import * as summaryContractUtils from './summary-contract-utils.mjs';

test('summary contract helper asserts root-only report summaries', () => {
  const bundle = createCanonicalDiscordReportSummaryBundle();
  assert.doesNotThrow(() => assertRootOnlyDiscordReportSummaryBundle(bundle));
});

test('summary contract helper deep-merges canonical bundle overrides', () => {
  const bundle = createCanonicalDiscordReportSummaryBundle({
    deliveryReadiness: {
      visualQaUniqueSampledColors: 42,
    },
  });
  assert.equal(bundle.deliveryReadiness.status, 'ready');
  assert.equal(bundle.deliveryReadiness.visualQaUniqueSampledColors, 42);
});

test('summary contract helper clones array overrides before storing them in fixtures', () => {
  const checkedTypes = ['deck', 'onepager'];
  const bundle = createCanonicalDiscordReportSummaryBundle({
    checkedArtifactTypes: {
      types: checkedTypes,
    },
  });
  checkedTypes.push('stale');
  assert.deepEqual(bundle.checkedArtifactTypes.types, ['deck', 'onepager']);
  assert.notStrictEqual(bundle.checkedArtifactTypes.types, checkedTypes);

  const contextTypes = ['deck', 'onepager'];
  const reportContext = createCanonicalDiscordReportContext({
    reportSummaryBundle: {
      checkedArtifactTypes: {
        types: contextTypes,
      },
    },
  });
  contextTypes.push('stale');
  assert.deepEqual(reportContext.summary.checkedArtifactTypes.types, ['deck', 'onepager']);
  assert.notStrictEqual(reportContext.summary.checkedArtifactTypes.types, contextTypes);
});

test('summary contract helper rejects stale option keys for canonical builders', () => {
  assert.throws(
    () => createCanonicalDiscordReportContext({
      reportSummaryBundleOverrides: {
        checkedArtifactTypes: {
          types: ['deck'],
        },
      },
    }),
    /unexpected discord report context option keys: reportSummaryBundleOverrides/,
  );
  assert.doesNotThrow(() => createCanonicalVerifyDiscordReportOutputContext({
    reportSummaryBundle: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 42,
      },
    },
    reportSummaryContext: {
      acceptanceManifest: {
        verification: {
          checked: 2,
        },
      },
    },
  }));
  assert.throws(
    () => createCanonicalVerifyDiscordReportOutputContext({
      reportSummary: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 42,
        },
      },
    }),
    /unexpected verify-discord-report output option keys: reportSummary/,
  );
  assert.throws(
    () => createCanonicalDiscordReadyOutput({
      reportSummary: {
        reportSummaryBundleOverrides: {
          checkedArtifactTypes: {
            types: ['deck'],
          },
        },
      },
    }),
    /unexpected discord ready option keys: reportSummary/,
  );
});

test('summary contract helper accepts flat reportSummary bundle/context options and rejects legacy aliases', () => {
  assert.doesNotThrow(() => createCanonicalStudioDiscordReportContext({
    reportSummaryBundle: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 42,
      },
    },
    reportSummaryContext: {
      acceptanceManifest: {
        verification: {
          checked: 2,
        },
      },
    },
  }));
  assert.throws(
    () => createCanonicalStudioDiscordReportContext({
      summary: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 42,
        },
      },
    }),
    /unexpected discord ready report summary option keys: summary/,
  );
  assert.throws(
    () => createCanonicalStudioDiscordReportContext({
      context: {
        acceptanceManifest: {
          verification: {
            checked: 2,
          },
        },
      },
    }),
    /unexpected discord ready report summary option keys: context/,
  );
});

test('summary contract helper rejects unknown nested override keys for canonical builders', () => {
  assert.throws(
    () => createCanonicalDiscordReportContext({
      reportSummaryBundle: {
        deliveryReadiness: {
          typo: true,
        },
      },
    }),
    /unexpected discord report summary bundle key at discord report summary bundle\.deliveryReadiness\.typo/,
  );
  assert.throws(
    () => createCanonicalVerifyDiscordReportOutputContext({
      reportSummaryContext: {
        slides: {
          typo: true,
        },
      },
    }),
    /unexpected verify-discord-report context key at verify-discord-report context\.slides\.typo/,
  );
  assert.throws(
    () => createCanonicalDiscordReadyOutput({
      reportSummaryBundle: {
        checkedArtifacts: {
          typo: true,
        },
      },
    }),
    /unexpected discord report summary bundle key at discord report summary bundle\.checkedArtifacts\.typo/,
  );
});

test('summary contract helper rejects nested override type mismatches for canonical builders', () => {
  assert.throws(
    () => createCanonicalDiscordReportContext({
      reportSummaryBundle: [],
    }),
    /unexpected discord report summary bundle type at discord report summary bundle: expected plain object, got array/,
  );
  assert.throws(
    () => createCanonicalDiscordReadyOutput({
      deliveryReadiness: {
        reasons: {
          typo: true,
        },
      },
    }),
    /unexpected discord ready deliveryReadiness type at discord ready deliveryReadiness\.reasons: expected array, got object/,
  );
  assert.throws(
    () => createCanonicalVerifyDiscordReportOutputContext({
      reportSummaryBundle: {
        checkedArtifacts: [],
      },
    }),
    /unexpected discord report summary bundle type at discord report summary bundle\.checkedArtifacts: expected plain object, got array/,
  );
});

test('summary contract helper rejects nested self-copy fields', () => {
  assert.throws(
    () => assertRootOnlyDiscordReportSummaryBundle({
      ...createCanonicalDiscordReportSummaryBundle(),
      deliveryReadiness: { deliveryReadiness: {} },
    }),
    /nested self-copy detected for deliveryReadiness/,
  );
});

test('summary contract helper rejects deep nested self-copy fields', () => {
  assert.throws(
    () => assertRootOnlyDiscordReportSummaryBundle({
      ...createCanonicalDiscordReportSummaryBundle(),
      deliveryReadiness: {
        nested: {
          deliveryReadiness: {},
        },
      },
    }),
    /nested self-copy detected for deliveryReadiness at deliveryReadiness\.nested\.deliveryReadiness/,
  );
});

test('summary contract helper rejects nested self-copy on checkedArtifacts', () => {
  assert.throws(
    () => assertRootOnlyDiscordReportSummaryBundle({
      ...createCanonicalDiscordReportSummaryBundle(),
      checkedArtifacts: {
        checkedArtifacts: { count: 1 },
      },
    }),
    /nested self-copy detected for checkedArtifacts/,
  );
});

test('summary contract helper rejects deep nested self-copy on checkedArtifacts', () => {
  assert.throws(
    () => assertRootOnlyDiscordReportSummaryBundle({
      ...createCanonicalDiscordReportSummaryBundle(),
      checkedArtifacts: {
        nested: {
          checkedArtifacts: { count: 1 },
        },
      },
    }),
    /nested self-copy detected for checkedArtifacts at checkedArtifacts\.nested\.checkedArtifacts/,
  );
});

test('summary contract helper accepts a direct canonical bundle', () => {
  const bundle = createCanonicalDiscordReportSummaryBundle();
  assert.doesNotThrow(() => assertRootOnlyDiscordReportSummaryBundle(bundle));
});

test('summary contract helper creates a canonical full discord report context', () => {
  const context = createCanonicalDiscordReportContext();
  const bundle = createCanonicalDiscordReportSummaryBundle();
  assert.doesNotThrow(() => assertVerifyDiscordReportContext(context));
  assert.deepEqual(context.summary, bundle);
  assert.deepEqual({
    deliveryReadiness: context.deliveryReadiness,
    checkedArtifactTypes: context.checkedArtifactTypes,
    checkedArtifacts: context.checkedArtifacts,
  }, bundle);
  assert.notStrictEqual(context.summary.deliveryReadiness, context.deliveryReadiness);
  assert.notStrictEqual(context.summary.checkedArtifactTypes, context.checkedArtifactTypes);
  assert.notStrictEqual(context.summary.checkedArtifacts, context.checkedArtifacts);
  assert.notStrictEqual(context.summary, context.deliveryReadiness);
  assert.notStrictEqual(context.summary, context.checkedArtifactTypes);
  assert.notStrictEqual(context.summary, context.checkedArtifacts);
});

test('summary contract helper checks full discord report context plus canonical summary bundle', () => {
  const context = createCanonicalDiscordReportContext();
  assert.doesNotThrow(() => assertVerifyDiscordReportContext(context));
});

test('summary contract helper rejects root-only bundle as discord report context', () => {
  assert.throws(
    () => assertVerifyDiscordReportContext(createCanonicalDiscordReportSummaryBundle()),
    /unexpected verify-discord-report context keys:/,
  );
});

test('summary contract helper rejects extra top-level discord report context fields', () => {
  const context = createCanonicalDiscordReportContext();
  assert.throws(
    () => assertVerifyDiscordReportContext({
      ...context,
      extra: true,
    }),
    /unexpected verify-discord-report context keys: expected acceptanceManifest, artifactDetails, artifacts, artifactsByType, attachmentPolicy, attachments, checkedArtifactTypes, checkedArtifacts, deliveryReadiness, identityChecks, message, postable, pptxInternalQa, reportArtifactIdentity, slides, summary, title, visualQa, got acceptanceManifest, artifactDetails, artifacts, artifactsByType, attachmentPolicy, attachments, checkedArtifactTypes, checkedArtifacts, deliveryReadiness, extra, identityChecks, message, postable, pptxInternalQa, reportArtifactIdentity, slides, summary, title, visualQa/,
  );
});

test('summary contract helper checks discord report output summary context', () => {
  const output = createCanonicalVerifyDiscordReportOutputContext();
  assert.doesNotThrow(() => assertVerifyDiscordReportOutputContext(output));
  assert.deepEqual(Object.keys(output).sort(), ['errors', 'ok', 'report', 'sections', 'summary', 'warnings']);
  assert.deepEqual(output.sections, { verification: 'ready', acceptance: 'ready' });
  assert.equal(typeof output.report, 'string');
  assert.equal(typeof output.ok, 'boolean');
  assert.deepEqual(output.errors, []);
  assert.deepEqual(output.warnings, []);
  assert.notStrictEqual(output.summary.deliveryReadiness, output.summary.summary.deliveryReadiness);
  assert.notStrictEqual(output.summary.checkedArtifactTypes, output.summary.summary.checkedArtifactTypes);
  assert.notStrictEqual(output.summary.checkedArtifacts, output.summary.summary.checkedArtifacts);
});

test('summary contract helper rejects extra top-level discord report output fields', () => {
  const output = createCanonicalVerifyDiscordReportOutputContext({
    reportSummaryBundle: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 42,
      },
    },
    reportSummaryContext: {
      acceptanceManifest: {
        verification: {
          checked: 2,
        },
      },
    },
  });
  assert.throws(
    () => assertVerifyDiscordReportOutputContext({
      ...output,
      extra: true,
    }),
    /unexpected verify-discord-report output keys: expected errors, ok, report, sections, summary, warnings, got errors, extra, ok, report, sections, summary, warnings/,
  );
});

test('summary contract helper rejects discord report outputs with non-array diagnostics', () => {
  assert.throws(
    () => assertVerifyDiscordReportOutputContext({
      ...createCanonicalVerifyDiscordReportOutputContext(),
      errors: 'none',
    }),
    /verify-discord-report errors must be an array/,
  );
  assert.throws(
    () => assertVerifyDiscordReportOutputContext({
      ...createCanonicalVerifyDiscordReportOutputContext(),
      warnings: null,
    }),
    /verify-discord-report warnings must be an array/,
  );
});

test('summary contract helper no longer exports the stale discord report output summary alias', () => {
  assert.equal(
    Object.hasOwn(summaryContractUtils, 'assertDiscordReportOutputSummaryContext'),
    false,
  );
});

test('summary contract helper no longer exports the old discord report full-context alias', () => {
  assert.equal(
    Object.hasOwn(summaryContractUtils, 'assertDiscordReportFullContext'),
    false,
  );
});

test('summary contract helper rejects root-only bundle as discord report output summary context', () => {
  assert.throws(
    () => assertVerifyDiscordReportOutputContext(createCanonicalDiscordReportSummaryBundle()),
    /unexpected verify-discord-report output keys: expected errors, ok, report, sections, summary, warnings, got checkedArtifactTypes, checkedArtifacts, deliveryReadiness/,
  );
});

test('summary contract helper checks discord ready output context', () => {
  const output = createCanonicalDiscordReadyOutput();
  assert.doesNotThrow(() => assertStudioDiscordReadyOutputContext(output));
  assert.deepEqual(output.deliveryReadiness, createCanonicalStudioDeliveryReadinessSnapshot());
  assert.notStrictEqual(output.summary, output.reportSummaryContext.summary);
  assert.notStrictEqual(output.deliveryReadiness, output.summary.deliveryReadiness);
  assert.notStrictEqual(output.deliveryReadiness, output.reportSummaryContext.deliveryReadiness);
  assert.deepEqual(output.reportSummaryBundle, output.summary);
  assert.deepEqual(Object.keys(output).sort(), [
    'attachments',
    'deliveryManifest',
    'deliveryManifestPath',
    'deliveryManifestVerified',
    'deliveryMessage',
    'deliveryMessagePath',
    'deliveryMessageVerified',
    'deliveryReadiness',
    'identityChecks',
    'message',
    'ok',
    'reportSummaryBundle',
    'reportSummaryContext',
    'summary',
    'warnings',
  ]);
  assert.equal(typeof output.message, 'string');
  assert.equal(typeof output.deliveryMessageVerified, 'boolean');
  assert.equal(typeof output.deliveryManifestVerified, 'boolean');
  assert.equal(typeof output.identityChecks, 'object');
  assert.equal(Array.isArray(output.warnings), true);
  assert.equal(Array.isArray(output.attachments.required), true);
  assert.equal(Array.isArray(output.attachments.auditPaths), true);
  assert.equal(Array.isArray(output.attachments.deliverablePaths), true);
});

test('summary contract helper creates distinct ready context clones by default', () => {
  const output = createCanonicalDiscordReadyOutput();
  assert.notStrictEqual(output.summary, output.reportSummaryContext.summary);
  assert.notStrictEqual(output.summary.deliveryReadiness, output.reportSummaryContext.deliveryReadiness);
  assert.notStrictEqual(output.summary.checkedArtifactTypes, output.reportSummaryContext.checkedArtifactTypes);
  assert.notStrictEqual(output.summary.checkedArtifacts, output.reportSummaryContext.checkedArtifacts);
  assert.deepEqual(output.reportSummaryBundle, output.summary);
  assert.deepEqual(output.reportSummaryContext.summary, output.reportSummaryBundle);
});

test('summary contract helper keeps summary overrides isolated from delivery readiness overrides', () => {
  const output = createCanonicalDiscordReadyOutput({
    summary: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 7,
      },
    },
    deliveryReadiness: {
      visualQaUniqueSampledColors: 8,
    },
  });
  assert.equal(output.summary.deliveryReadiness.visualQaUniqueSampledColors, 7);
  assert.equal(output.reportSummaryContext.summary.deliveryReadiness.visualQaUniqueSampledColors, 4);
  assert.equal(output.deliveryReadiness.visualQaUniqueSampledColors, 8);
  assert.notStrictEqual(output.summary.deliveryReadiness, output.deliveryReadiness);
  assert.notStrictEqual(output.reportSummaryContext.deliveryReadiness, output.deliveryReadiness);
});

test('summary contract helper rejects legacy nested reportSummary input on canonical ready output', () => {
  assert.throws(
    () => createCanonicalDiscordReadyOutput({
      reportSummary: {
        summary: {
          checkedArtifactTypes: {
            types: ['deck', 'outline'],
          },
        },
      },
    }),
    /unexpected discord ready option keys: reportSummary/,
  );
});

test('summary contract helper lets reportSummaryContext overrides diverge from top-level summary overrides', () => {
  const output = createCanonicalDiscordReadyOutput({
    reportSummaryBundle: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 9,
      },
    },
    reportSummaryContext: createCanonicalStudioDiscordReportContext({
      reportSummaryBundle: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 9,
        },
      },
    }),
  });
  const expectedSummary = createCanonicalDiscordReportSummaryBundle();
  assert.doesNotThrow(() => assertStudioDiscordReadyOutputContext(output, {
    summary: expectedSummary,
    reportSummaryBundle: createCanonicalDiscordReportSummaryBundle({
      deliveryReadiness: {
        visualQaUniqueSampledColors: 9,
      },
    }),
    reportSummaryContext: createCanonicalStudioDiscordReportContext({
      reportSummaryBundle: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 9,
        },
      },
    }),
  }));
  assert.equal(output.summary.deliveryReadiness.visualQaUniqueSampledColors, 4);
  assert.equal(output.reportSummaryContext.summary.deliveryReadiness.visualQaUniqueSampledColors, 9);
  assert.notStrictEqual(output.summary.deliveryReadiness, output.reportSummaryContext.summary.deliveryReadiness);
});

test('summary contract helper accepts an explicit reportSummaryContext expectation', () => {
  const output = createCanonicalDiscordReadyOutput();
  assert.doesNotThrow(() => assertStudioDiscordReadyOutputContext(output, {
    reportSummaryContext: createCanonicalStudioDiscordReportContext(),
  }));
});

test('summary contract helper rejects legacy reportSummary expectation aliases', () => {
  const output = createCanonicalDiscordReadyOutput();
  assert.throws(
    () => assertStudioDiscordReadyOutputContext(output, {
      reportSummary: createCanonicalStudioDiscordReportContext(),
    }),
    /unexpected discord ready expected option keys: reportSummary/,
  );
});

test('summary contract helper accepts flat reportSummary bundle and context expectations', () => {
  const output = createCanonicalDiscordReadyOutput({
    reportSummaryBundle: {
      deliveryReadiness: {
        visualQaUniqueSampledColors: 9,
      },
    },
    reportSummaryContext: createCanonicalStudioDiscordReportContext({
      reportSummaryBundle: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 9,
        },
      },
    }),
  });
  assert.doesNotThrow(() => assertStudioDiscordReadyOutputContext(output, {
    reportSummaryBundle: createCanonicalDiscordReportSummaryBundle({
      deliveryReadiness: {
        visualQaUniqueSampledColors: 9,
      },
    }),
    reportSummaryContext: createCanonicalStudioDiscordReportContext({
      reportSummaryBundle: {
        deliveryReadiness: {
          visualQaUniqueSampledColors: 9,
        },
      },
    }),
  }));
  assert.equal(output.reportSummaryContext.summary.deliveryReadiness.visualQaUniqueSampledColors, 9);
});

test('summary contract helper rejects discord ready outputs that reuse the same summary clone', () => {
  const output = createCanonicalDiscordReadyOutput();
  output.reportSummaryContext.summary = output.summary;
  assert.throws(
    () => assertStudioDiscordReadyOutputContext(output),
    /expected discordReady summary and reportSummaryContext\.summary to be distinct clones/,
  );
});

test('summary contract helper rejects discord ready output without full report summary context', () => {
  const output = createCanonicalDiscordReadyOutput();
  output.reportSummaryContext = createCanonicalDiscordReportSummaryBundle();
  assert.throws(
    () => assertStudioDiscordReadyOutputContext(output),
    /unexpected summary bundle keys: expected checkedArtifactTypes, checkedArtifacts, deliveryReadiness, got \(none\)/,
  );
});

test('summary contract helper rejects extra top-level summary bundle fields', () => {
  const output = createCanonicalDiscordReadyOutput();
  assert.throws(
    () => assertStudioDiscordReadyOutputContext({
      ...output,
      summary: {
        ...output.summary,
        extra: true,
      },
    }),
    /unexpected summary bundle keys: expected checkedArtifactTypes, checkedArtifacts, deliveryReadiness, got checkedArtifactTypes, checkedArtifacts, deliveryReadiness, extra/,
  );
});

test('summary contract helper rejects reportSummary bundles missing full context fields', () => {
  const output = createCanonicalDiscordReadyOutput();
  delete output.reportSummaryContext.deliveryReadiness;
  assert.throws(
    () => assertStudioDiscordReadyOutputContext(output),
    /unexpected discord ready report summary keys:/,
  );
});

test('summary contract helper rejects nested override drift in report contexts', () => {
  assert.throws(
    () => createCanonicalDiscordReportContext({
      reportSummaryContext: {
        summary: {
          checkedArtifacts: {
            typo: true,
          },
        },
      },
    }),
    /unexpected discord report context key at discord report context\.summary\.checkedArtifacts\.typo/,
  );
});
