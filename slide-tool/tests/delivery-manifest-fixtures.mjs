import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function createDeliveryManifestDeckFixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), options.prefix || 'delivery-manifest-fixture-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out, { recursive: true });

  const title = options.title || 'Report Status';
  const message = options.message || 'ready for Discord delivery';
  const basename = options.basename || 'deck';
  const artifactName = options.artifactName || 'deck deck';
  const pptx = path.join(out, `${basename}.editable.pptx`);
  const html = path.join(out, `${basename}.preview.html`);
  const outline = path.join(out, `${basename}.outline.json`);
  const prompts = path.join(out, `${basename}.image-prompts.md`);
  const manifestPath = path.join(out, `${basename}.acceptance.manifest.json`);
  const reportPath = path.join(out, 'discord-report.md');
  const deliveryMessagePath = path.join(out, 'delivery-message.md');

  fs.writeFileSync(pptx, 'pptx');
  fs.writeFileSync(html, 'html');
  if (options.includeAuxiliaryDeliverables) {
    fs.writeFileSync(outline, JSON.stringify({ title, slides: [{ title }] }));
    fs.writeFileSync(prompts, '# image prompts\n');
  }
  if (options.writeAuditFiles) {
    fs.writeFileSync(reportPath, 'discord report');
    fs.writeFileSync(deliveryMessagePath, 'delivery message');
  }

  const parsed = {
    schemaVersion: 1,
    title,
    artifactName,
    artifactType: 'deck',
    artifactDir: out,
    basename,
    readyHeader: `納品準備OK: ${title}`,
    verificationHeader: `検証: ${message}`,
    qaLines: [
      'delivery readiness: ready',
      'reasons: none',
      `manifest: ${manifestPath}`,
      'manifest verification scope: manifest-only',
      'checked artifacts: 1',
      'checked artifact types: deck',
      'identity checks: report ready / deliveryMessage ready / deliveryManifest ready',
      'visual QA: ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      'PPTX images: 0 (none)',
      'PPTX special elements: 0 (none)',
      'PPTX hidden text: 0',
    ],
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
      deliveryManifest: { matched: true, mismatches: [] },
    },
    deliverablePaths: options.includeAuxiliaryDeliverables ? [pptx, html, outline, prompts] : [pptx, html],
    auditPaths: [manifestPath, deliveryMessagePath],
    artifacts: [{
      name: artifactName,
      type: 'deck',
      dir: out,
      basename,
      auditFiles: [deliveryMessagePath],
    }],
  };
  fs.writeFileSync(manifestPath, JSON.stringify(parsed));

  const summary = {
    title,
    message,
    deliveryReadiness: {
      ok: true,
      line: 'delivery readiness: ready',
      reasonsLine: 'reasons: none',
      reasons: [],
    },
    acceptanceManifest: {
      line: `manifest: ${manifestPath}`,
      scopeLine: 'manifest verification scope: manifest-only',
      scope: 'manifest-only',
      verification: {
        ok: true,
        status: 0,
        checked: 1,
        checkedArtifactTypes: ['deck'],
        scope: 'manifest-only',
        error: '',
      },
    },
    reportArtifactIdentity: {
      name: artifactName,
      type: 'deck',
      dir: out,
      basename,
    },
    checkedArtifacts: 1,
    checkedArtifactTypes: {
      status: 'present',
      types: ['deck'],
      line: 'checked artifact types: deck',
    },
    attachments: {
      deliverablePaths: options.includeAuxiliaryDeliverables ? [pptx, html, outline, prompts] : [pptx, html],
      auditPaths: [manifestPath, deliveryMessagePath],
    },
    identityChecks: {
      report: { matched: true, mismatches: [] },
      deliveryMessage: { matched: true, mismatches: [] },
    },
    visualQa: {
      acceptance: {
        line: 'ready / source: fallback / 1280x900 / uniqueSampledColors: 42',
      },
    },
    pptxInternalQa: {
      acceptance: {
        images: { line: 'PPTX images: 0 (none)' },
        specialElements: { line: 'PPTX special elements: 0 (none)' },
        hiddenText: { line: 'PPTX hidden text: 0' },
      },
    },
  };

  return {
    dir,
    out,
    pptx,
    html,
    outline,
    prompts,
    manifestPath,
    reportPath,
    deliveryMessagePath,
    parsed,
    summary,
  };
}
