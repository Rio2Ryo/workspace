import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  deliveryManifestPolicySuggestionOutput,
  deliveryManifestPolicySuggestionText,
} from './lib/delivery-manifest-utils.mjs';

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    source: 'suggest-manifest-policy',
    errors: [error.message],
  }, null, 2));
  process.exit(2);
}

function main() {
  const { outDir, basename, updateManifest, verifyManifest, requiredTerms, format } = parseArgs(process.argv.slice(2));
  if (!outDir) {
    throw new Error('Usage: node slide-tool/scripts/suggest-manifest-policy.mjs <out-dir> <basename> [--required-term <term>...] [--update-manifest <manifest-path>] [--verify-manifest] [--format json|markdown]');
  }

  const artifactType = detectArtifactType(outDir, basename);
  const suggestion = artifactType === 'onepager'
    ? suggestOnepagerArtifact(outDir, basename, requiredTerms)
    : suggestDeckArtifact(outDir, basename);
  const { artifact, diagnostics, warnings } = suggestion;

  const manifestUpdate = updateManifest ? updateManifestArtifact(updateManifest, artifact) : null;
  const manifestVerification = verifyManifest ? verifyUpdatedManifest(updateManifest) : null;
  const output = deliveryManifestPolicySuggestionOutput({
    artifact,
    manifestUpdate,
    manifestVerification,
    diagnostics,
    warnings,
  });

  console.log(deliveryManifestPolicySuggestionText(output, format));
  if (!output.ok) process.exit(1);
}

function parseArgs(args) {
  const positional = [];
  let updateManifest = null;
  let verifyManifest = false;
  let format = 'json';
  const requiredTerms = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--update-manifest') {
      if (!hasOptionValue(args, index)) throw new Error('--update-manifest requires a manifest path');
      updateManifest = args[index + 1];
      index += 1;
      continue;
    }
    if (value === '--verify-manifest') {
      verifyManifest = true;
      continue;
    }
    if (value === '--required-term') {
      if (!hasOptionValue(args, index)) throw new Error('--required-term requires a term');
      requiredTerms.push(args[index + 1]);
      index += 1;
      continue;
    }
    if (value === '--format') {
      if (!hasOptionValue(args, index)) throw new Error('--format requires json or markdown');
      format = args[index + 1];
      index += 1;
      continue;
    }
    positional.push(value);
  }
  if (updateManifest === '') updateManifest = null;
  if (!['json', 'markdown'].includes(format)) throw new Error(`unsupported --format: ${format}`);
  return {
    outDir: positional[0],
    basename: positional[1] || 'deck',
    updateManifest,
    verifyManifest,
    requiredTerms: requiredTerms.filter((term) => typeof term === 'string' && term.trim()),
    format,
  };
}

function hasOptionValue(args, index) {
  return typeof args[index + 1] === 'string' && args[index + 1] !== '' && !args[index + 1].startsWith('--');
}

function detectArtifactType(directory, name) {
  const outlinePath = path.join(directory, `${name}.outline.json`);
  const htmlPath = path.join(directory, `${name}.html`);
  const svgPath = path.join(directory, `${name}.svg`);
  if (fs.existsSync(outlinePath)) return 'deck';
  if (fs.existsSync(htmlPath) || fs.existsSync(svgPath)) return 'onepager';
  return 'deck';
}

function suggestDeckArtifact(directory, name) {
  const verifyScript = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'verify.mjs');
  const run = spawnSync(process.execPath, [verifyScript, directory, name], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SLIDE_TOOL_MAX_PPTX_IMAGES: '100000',
      SLIDE_TOOL_MAX_PPTX_SPECIAL_ELEMENTS: '100000',
    },
  });

  const report = parseVerifierOutput(run);
  if (run.status !== 0 || !report?.ok) failVerifier('verify.mjs', run, report);

  const artifact = {
    name: `${name} deck`,
    type: 'deck',
    dir: directory,
    basename: name,
    minSlides: report.outlineSlides,
    maxSlides: report.outlineSlides,
    requiredSlideTitles: report.slideTitles || [],
  };

  const imageSlides = slidesWithCount(report.slideDiagnostics, 'imageCount');
  if (report.imageCount > 0) {
    artifact.maxPptxImages = report.imageCount;
    artifact.allowedPptxImageSlides = imageSlides;
  }

  const specialElementSlides = slidesWithCount(report.slideDiagnostics, 'specialElementCount');
  const specialElementTypes = typesWithCount(report.specialElementBreakdown);
  if (report.specialElementCount > 0) {
    artifact.maxPptxSpecialElements = report.specialElementCount;
    artifact.allowedPptxSpecialElementSlides = specialElementSlides;
    artifact.allowedPptxSpecialElementTypes = specialElementTypes;
  }

  const templateImages = templatesWithCount(report.templateDiagnostics, 'imageCount');
  const templateSpecialElements = templatesWithCount(report.templateDiagnostics, 'specialElementCount');
  const warnings = [];
  if (templateImages.length) {
    warnings.push('PPTX images exist in slide layouts/masters; allowedPptxImageSlides cannot allow template-level images, so remove them before enforcing that policy.');
  }
  if (templateSpecialElements.length) {
    warnings.push('PPTX special elements exist in slide layouts/masters; allowedPptxSpecialElementSlides cannot allow template-level special elements, so remove them before enforcing that policy.');
  }

  return {
    artifact,
    diagnostics: {
      imageSlides,
      specialElementSlides,
      specialElementTypes,
      templateImages,
      templateSpecialElements,
    },
    warnings,
  };
}

function suggestOnepagerArtifact(directory, name, terms) {
  const verifyScript = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'verify-onepager.mjs');
  const run = spawnSync(process.execPath, [verifyScript, directory, name, ...terms], { encoding: 'utf8' });
  const report = parseVerifierOutput(run);
  if (run.status !== 0 || !report?.ok) failVerifier('verify-onepager.mjs', run, report);

  return {
    artifact: {
      name: `${name} onepager`,
      type: 'onepager',
      dir: directory,
      basename: name,
      requiredTerms: report.required || terms,
    },
    diagnostics: {
      requiredTerms: report.required || terms,
      htmlBytes: report.htmlBytes,
      svgBytes: report.svgBytes,
    },
    warnings: [],
  };
}

function failVerifier(source, run, report) {
  console.error(JSON.stringify({
    ok: false,
    source,
    status: run.status,
    errors: report?.errors || [run.stderr.trim() || `${source} failed`],
    result: report,
  }, null, 2));
  process.exit(1);
}

function updateManifestArtifact(manifestPath, artifact) {
  if (!manifestPath) throw new Error('--update-manifest requires a manifest path');
  const manifestExists = fs.existsSync(manifestPath);
  const manifest = manifestExists
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : { artifacts: [], ignoreDirs: defaultIgnoreDirsForNewManifest(artifact.dir) };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`manifest must be an object: ${manifestPath}`);
  }
  if (manifest.artifacts === undefined) manifest.artifacts = [];
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error(`manifest.artifacts must be an array: ${manifestPath}`);
  }

  const index = manifest.artifacts.findIndex((entry) => entry.dir === artifact.dir && entry.basename === artifact.basename);
  const action = index >= 0 ? 'replaced' : 'added';
  if (index >= 0) {
    manifest.artifacts[index] = artifact;
  } else {
    manifest.artifacts.push(artifact);
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    path: manifestPath,
    action,
    index: index >= 0 ? index : manifest.artifacts.length - 1,
  };
}

function defaultIgnoreDirsForNewManifest(artifactDir) {
  const outRoot = path.normalize('slide-tool/out');
  const normalizedArtifactDir = path.normalize(artifactDir);
  if (!fs.existsSync(outRoot)) return [];
  return fs.readdirSync(outRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(outRoot, entry.name))
    .filter((dir) => path.normalize(dir) !== normalizedArtifactDir)
    .filter((dir) => looksLikeVerifiableArtifactDir(dir));
}

function looksLikeVerifiableArtifactDir(dir) {
  try {
    return fs.readdirSync(dir).some((file) => file.endsWith('.outline.json') || file.endsWith('.editable.pptx') || file.endsWith('.preview.html') || file.endsWith('.svg'));
  } catch {
    return false;
  }
}

function verifyUpdatedManifest(manifestPath) {
  if (!manifestPath) throw new Error('--verify-manifest requires --update-manifest <manifest-path>');
  const verifyArtifactsScript = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'verify-artifacts.mjs');
  const run = spawnSync(process.execPath, [verifyArtifactsScript], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SLIDE_TOOL_ARTIFACT_SCOPE: 'manifest-only',
      SLIDE_TOOL_ARTIFACT_MANIFEST: manifestPath,
    },
  });
  const parsed = parseVerifierOutput(run);
  return {
    ok: run.status === 0 && Boolean(parsed?.ok),
    status: run.status,
    scope: 'manifest-only',
    result: parsed || run.stdout.trim(),
    error: manifestVerificationError(parsed, run),
  };
}

function manifestVerificationError(parsed, run) {
  const errors = [
    ...((parsed?.manifestErrors || []).filter(Boolean)),
    ...((parsed?.results || []).filter((result) => !result.ok).map((result) => result.error).filter(Boolean)),
  ];
  return errors.join('\n') || run.stderr.trim();
}

function parseVerifierOutput(run) {
  for (const source of [run.stdout, run.stderr]) {
    try {
      if (source && source.trim()) return JSON.parse(source);
    } catch {
      // Try the next stream; verify.mjs writes failures to stderr while verify-artifacts writes JSON to stdout.
    }
  }
  return null;
}

function slidesWithCount(slides = [], field) {
  return slides
    .filter((slide) => Number(slide[field] || 0) > 0)
    .map((slide) => Number(slide.slide));
}

function templatesWithCount(templates = [], field) {
  return templates
    .filter((template) => Number(template[field] || 0) > 0)
    .map((template) => template.path);
}

function typesWithCount(counts = {}) {
  return Object.entries(counts)
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([type]) => type);
}
