const SUPPORTED_SLIDE_TYPES = new Set(['cover', 'section', 'process', 'comparison', 'matrix', 'visual', 'summary', 'appendix']);

export function outlineSchemaRawJsonErrors(outline) {
  const errors = [];
  if (!outline || typeof outline !== 'object' || Array.isArray(outline)) {
    return ['outline must be an object'];
  }
  if (!isNonEmptyString(outline.title)) errors.push('title must be a non-empty string');
  errors.push(...outlineSchemaDeckArtifactErrors(outline).map((error) => error.replace(/^outline /, '')));

  if (outline.theme !== undefined && (!outline.theme || typeof outline.theme !== 'object' || Array.isArray(outline.theme))) {
    errors.push('theme must be an object when provided');
  }

  if (Array.isArray(outline.slides)) {
    outline.slides.forEach((slide, i) => {
      if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return;
      if (slide.type !== undefined && !SUPPORTED_SLIDE_TYPES.has(slide.type)) {
        errors.push(`slides[${i}].type is not supported: ${slide.type}`);
      }
      if (slide.bullets !== undefined && !isStringArray(slide.bullets)) errors.push(`slides[${i}].bullets must be an array of strings`);
      if (slide.columns !== undefined && !Array.isArray(slide.columns)) {
        errors.push(`slides[${i}].columns must be an array`);
      } else if (Array.isArray(slide.columns)) {
        slide.columns.forEach((column, columnIndex) => {
          if (!column || typeof column !== 'object' || Array.isArray(column)) {
            errors.push(`slides[${i}].columns[${columnIndex}] must be an object`);
            return;
          }
          if (!isNonEmptyString(column.title)) errors.push(`slides[${i}].columns[${columnIndex}].title must be a non-empty string`);
          if (column.bullets !== undefined && !isStringArray(column.bullets)) errors.push(`slides[${i}].columns[${columnIndex}].bullets must be an array of strings`);
        });
      }
    });
  }

  return errors;
}

export function outlineSchemaInvalidJsonMessage(errors) {
  return `Invalid JSON outline:\n- ${errors.join('\n- ')}`;
}

export function outlineSchemaDeckArtifactErrors(outline) {
  const errors = [];
  if (!outline || typeof outline !== 'object' || Array.isArray(outline)) {
    return ['outline must be an object'];
  }
  if (!Array.isArray(outline.slides)) {
    errors.push('outline slides must be an array');
    return errors;
  }
  if (outline.slides.length === 0) errors.push('outline slides must contain at least one slide');
  outline.slides.forEach((slide, index) => {
    if (!slide || typeof slide !== 'object' || Array.isArray(slide)) {
      errors.push(`outline slides[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(slide.title)) {
      errors.push(`outline slides[${index}].title must be a non-empty string`);
    }
  });
  return errors;
}

export function outlineSchemaImagePromptErrors(prompts) {
  const errors = [];
  if (!Array.isArray(prompts)) return ['image-prompts must be an array'];
  prompts.forEach((prompt, index) => {
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) {
      errors.push(`image-prompts[${index}] must be an object`);
      return;
    }
    if (prompt.title !== undefined && typeof prompt.title !== 'string') {
      errors.push(`image-prompts[${index}].title must be a string`);
    }
  });
  return errors;
}

export function outlineSchemaImagePromptSlideNumberErrors(prompts) {
  const errors = [];
  const seen = new Set();
  const duplicates = new Set();
  for (const [index, prompt] of prompts.entries()) {
    const expectedSlide = index + 1;
    const actualSlide = prompt?.slide;
    if (!Number.isInteger(actualSlide)) {
      errors.push(`prompt slide number missing or invalid at slide ${expectedSlide}: ${actualSlide ?? 'missing'}`);
      continue;
    }
    if (actualSlide !== expectedSlide) {
      errors.push(`prompt slide number mismatch at slide ${expectedSlide}: ${actualSlide} != ${expectedSlide}`);
    }
    if (seen.has(actualSlide)) duplicates.add(actualSlide);
    seen.add(actualSlide);
  }
  for (const slideNumber of duplicates) {
    errors.push(`prompt slide number duplicate: ${slideNumber}`);
  }
  return errors;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
