import path from 'node:path';

export function artifactManifestDuplicateIdentityErrors(artifacts, { manifestRootDir }) {
  const errors = [];
  if (!Array.isArray(artifacts)) return errors;

  for (const name of duplicateValues(artifacts.map((artifact) => artifact?.name).filter(isNonEmptyString))) {
    errors.push(`duplicate artifact name in manifest: ${name}`);
  }
  for (const dir of duplicateValues(artifacts.map((artifact) => artifact?.dir).filter(isNonEmptyString))) {
    errors.push(`duplicate artifact dir in manifest: ${dir}`);
  }
  for (const dir of duplicateValues(artifacts.map((artifact) => artifact?.dir).filter(isNonEmptyString).map((dir) => normalizeArtifactManifestDir(dir, manifestRootDir)))) {
    errors.push(`duplicate normalized artifact dir in manifest: ${dir}`);
  }

  return errors;
}

export function artifactManifestValidationErrors(manifest, { manifestRootDir }) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest must be an object'];
  if (!Array.isArray(manifest.artifacts)) errors.push('manifest.artifacts must be an array');
  if (manifest.ignoreDirs !== undefined && !Array.isArray(manifest.ignoreDirs)) errors.push('manifest.ignoreDirs must be an array when provided');
  if (!Array.isArray(manifest.artifacts)) return errors;

  errors.push(...artifactManifestDuplicateIdentityErrors(manifest.artifacts, { manifestRootDir }));

  manifest.artifacts.forEach((artifact, index) => {
    errors.push(...artifactManifestArtifactValidationErrors(artifact, `artifacts[${index}]`));
  });

  return errors;
}

export function artifactManifestArtifactValidationErrors(artifact, label) {
  const errors = [];
  if (!artifact || typeof artifact !== 'object') {
    return [`${label} must be an object`];
  }
  for (const field of ['name', 'type', 'dir', 'basename']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim() === '') {
      errors.push(`${label}.${field} must be a non-empty string`);
    }
  }
  if (artifact.type && !['deck', 'onepager'].includes(artifact.type)) {
    errors.push(`${label}.type must be one of: deck, onepager`);
  }
  if (artifact.requiredTerms !== undefined) {
    if (artifact.type !== 'onepager') errors.push(`${label}.requiredTerms is only supported for onepager artifacts`);
    if (!Array.isArray(artifact.requiredTerms) || artifact.requiredTerms.some((term) => !isNonEmptyString(term))) {
      errors.push(`${label}.requiredTerms must be an array of non-empty strings`);
    }
  }
  if (artifact.maxPptxImages !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.maxPptxImages is only supported for deck artifacts`);
    if (!isNonNegativeInteger(artifact.maxPptxImages)) {
      errors.push(`${label}.maxPptxImages must be a non-negative integer`);
    }
  }
  if (artifact.allowedPptxImageSlides !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.allowedPptxImageSlides is only supported for deck artifacts`);
    if (!isPositiveIntegerArray(artifact.allowedPptxImageSlides)) {
      errors.push(`${label}.allowedPptxImageSlides must be an array of positive integers`);
    }
  }
  if (artifact.maxPptxSpecialElements !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.maxPptxSpecialElements is only supported for deck artifacts`);
    if (!isNonNegativeInteger(artifact.maxPptxSpecialElements)) {
      errors.push(`${label}.maxPptxSpecialElements must be a non-negative integer`);
    }
  }
  if (artifact.allowedPptxSpecialElementSlides !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.allowedPptxSpecialElementSlides is only supported for deck artifacts`);
    if (!isPositiveIntegerArray(artifact.allowedPptxSpecialElementSlides)) {
      errors.push(`${label}.allowedPptxSpecialElementSlides must be an array of positive integers`);
    }
  }
  if (artifact.allowedPptxSpecialElementTypes !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.allowedPptxSpecialElementTypes is only supported for deck artifacts`);
    if (!isNonEmptyStringArray(artifact.allowedPptxSpecialElementTypes)) {
      errors.push(`${label}.allowedPptxSpecialElementTypes must be an array of non-empty strings`);
    }
  }
  for (const field of ['minSlides', 'maxSlides']) {
    if (artifact[field] !== undefined) {
      if (artifact.type !== 'deck') errors.push(`${label}.${field} is only supported for deck artifacts`);
      if (!Number.isInteger(artifact[field]) || artifact[field] < 1) errors.push(`${label}.${field} must be a positive integer`);
    }
  }
  if (Number.isInteger(artifact.minSlides) && Number.isInteger(artifact.maxSlides) && artifact.minSlides > artifact.maxSlides) {
    errors.push(`${label}.minSlides must be <= maxSlides`);
  }
  if (artifact.requiredSlideTitles !== undefined) {
    if (artifact.type !== 'deck') errors.push(`${label}.requiredSlideTitles is only supported for deck artifacts`);
    if (!isNonEmptyStringArray(artifact.requiredSlideTitles)) {
      errors.push(`${label}.requiredSlideTitles must be an array of non-empty strings`);
    }
  }
  if (artifact.auditFiles !== undefined) {
    if (!isNonEmptyStringArray(artifact.auditFiles)) {
      errors.push(`${label}.auditFiles must be an array of non-empty strings`);
    }
  }
  return errors;
}

export function artifactManifestVerificationPolicyErrors(artifact, parsedResult) {
  const errors = [];
  if (!parsedResult || artifact.type !== 'deck') return errors;

  const slideCount = Number(parsedResult.outlineSlides);
  if (Number.isInteger(artifact.minSlides) && slideCount < artifact.minSlides) {
    errors.push(`artifact policy failed: ${artifact.name} slide count ${slideCount} < minSlides ${artifact.minSlides}`);
  }
  if (Number.isInteger(artifact.maxSlides) && slideCount > artifact.maxSlides) {
    errors.push(`artifact policy failed: ${artifact.name} slide count ${slideCount} > maxSlides ${artifact.maxSlides}`);
  }

  const titles = parsedResult.slideTitles || [];
  for (const requiredTitle of artifact.requiredSlideTitles || []) {
    if (!titles.some((title) => normalizeComparable(title) === normalizeComparable(requiredTitle))) {
      errors.push(`artifact policy failed: ${artifact.name} missing required slide title: ${requiredTitle}`);
    }
  }

  if (artifact.allowedPptxImageSlides !== undefined) {
    const allowedSlides = new Set(artifact.allowedPptxImageSlides);
    for (const slide of parsedResult.slideDiagnostics || []) {
      if (Number(slide.imageCount || 0) > 0 && !allowedSlides.has(Number(slide.slide))) {
        errors.push(`artifact policy failed: ${artifact.name} PPTX image found on unallowed slide ${slide.slide} (${formatManifestPolicyBreakdown(slide.imageBreakdown)})`);
      }
    }
    for (const template of parsedResult.templateDiagnostics || []) {
      if (Number(template.imageCount || 0) > 0) {
        errors.push(`artifact policy failed: ${artifact.name} PPTX image found in template ${template.path} (${formatManifestPolicyBreakdown(template.imageBreakdown)})`);
      }
    }
  }

  if (artifact.allowedPptxSpecialElementSlides !== undefined) {
    const allowedSlides = new Set(artifact.allowedPptxSpecialElementSlides);
    for (const slide of parsedResult.slideDiagnostics || []) {
      if (Number(slide.specialElementCount || 0) > 0 && !allowedSlides.has(Number(slide.slide))) {
        errors.push(`artifact policy failed: ${artifact.name} PPTX special element found on unallowed slide ${slide.slide} (${formatManifestPolicyBreakdown(slide.specialElementBreakdown)})`);
      }
    }
    for (const template of parsedResult.templateDiagnostics || []) {
      if (Number(template.specialElementCount || 0) > 0) {
        errors.push(`artifact policy failed: ${artifact.name} PPTX special element found in template ${template.path} (${formatManifestPolicyBreakdown(template.specialElementBreakdown)})`);
      }
    }
  }

  if (artifact.allowedPptxSpecialElementTypes !== undefined) {
    const allowedTypes = new Set(artifact.allowedPptxSpecialElementTypes);
    for (const [type, count] of Object.entries(parsedResult.specialElementBreakdown || {})) {
      if (Number(count || 0) > 0 && !allowedTypes.has(type)) {
        errors.push(`artifact policy failed: ${artifact.name} PPTX special element type ${type} is not allowed (${type}:${count})`);
      }
    }
  }

  return errors;
}

export function formatManifestPolicyBreakdown(counts = {}) {
  const details = Object.entries(counts)
    .filter(([, count]) => Number(count) > 0)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
  return details || 'none';
}

export function normalizeArtifactManifestDir(dir, baseDir) {
  if (path.isAbsolute(dir)) return path.normalize(dir);
  const normalized = path.normalize(dir);
  if (path.basename(baseDir) === 'slide-tool' && (normalized === 'slide-tool' || normalized.startsWith(`slide-tool${path.sep}`))) {
    return path.normalize(path.resolve(baseDir, '..', normalized));
  }
  return path.normalize(path.resolve(baseDir, normalized));
}

function duplicateValues(values) {
  const seen = new Set();
  const found = new Set();
  for (const value of values) {
    if (seen.has(value)) found.add(value);
    seen.add(value);
  }
  return [...found];
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveIntegerArray(value) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 1);
}

function normalizeComparable(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
