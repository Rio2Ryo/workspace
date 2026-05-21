export function htmlSlideCount(source) {
  const matches = source.match(/class=(["'])[^"']*\bslide\b[^"']*\1/g) || [];
  return matches.length;
}

export function htmlVisibleText(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlSlideVisibilityErrors(source) {
  const errors = [];
  const styleBlocks = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
  for (const block of styleBlocks) {
    const css = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selectors = rule[1];
      const declarations = rule[2];
      if (selectorTargetsSlide(selectors) && hasHiddenDeclaration(declarations)) {
        errors.push('HTML slide visibility check failed: .slide CSS rule hides rendered slides');
      } else if (selectorTargetsCoreSlideText(selectors) && hasHiddenDeclaration(declarations)) {
        errors.push('HTML slide visibility check failed: CSS rule hides core slide text elements');
      }
    }
  }

  for (const tag of source.matchAll(/<[^>]+\bclass=(["'])[^"']*\bslide\b[^"']*\1[^>]*>/gi)) {
    const style = tag[0].match(/\bstyle=(["'])(.*?)\1/i)?.[2] || '';
    if (style && hasHiddenDeclaration(style)) {
      errors.push('HTML slide visibility check failed: inline style hides a rendered slide');
    }
  }

  for (const tag of source.matchAll(/<(h1|h2|h3|p|li)\b[^>]*>/gi)) {
    const style = tag[0].match(/\bstyle=(["'])(.*?)\1/i)?.[2] || '';
    if (style && hasHiddenDeclaration(style)) {
      errors.push('HTML slide visibility check failed: inline style hides core slide text elements');
    }
  }

  return [...new Set(errors)];
}

export function htmlSlideClippingRiskErrors(source) {
  const errors = [];
  if (!slideUsesOverflowHidden(source)) return errors;

  for (const tag of source.matchAll(/<(h1|h2|h3|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tagName = tag[1].toLowerCase();
    const text = htmlVisibleText(tag[2]);
    if (!text) continue;
    const limit = ['h1', 'h2', 'h3'].includes(tagName) ? 120 : 260;
    const longLatinToken = /[A-Za-z0-9][A-Za-z0-9._:/?#@!$&'()*+,;=%-]{64,}/.test(text);
    if (text.length > limit || longLatinToken) {
      errors.push(`HTML clipping risk: .slide uses overflow:hidden and <${tagName}> contains long text likely to be clipped`);
    }
  }

  return [...new Set(errors)];
}

function slideUsesOverflowHidden(source) {
  for (const block of [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1])) {
    const css = block.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (selectorTargetsSlide(rule[1]) && /(?:^|;)\s*overflow(?:-[xy])?\s*:\s*hidden\s*(?:;|$)/i.test(rule[2])) {
        return true;
      }
    }
  }

  for (const tag of source.matchAll(/<[^>]+\bclass=(["'])[^"']*\bslide\b[^"']*\1[^>]*>/gi)) {
    const style = tag[0].match(/\bstyle=(["'])(.*?)\1/i)?.[2] || '';
    if (/(?:^|;)\s*overflow(?:-[xy])?\s*:\s*hidden\s*(?:;|$)/i.test(style)) return true;
  }

  return false;
}

function selectorTargetsSlide(selectors) {
  return selectors
    .split(',')
    .some((selector) => /\.slide(?![\w-])/i.test(selector));
}

function selectorTargetsCoreSlideText(selectors) {
  const coreTextSelector = /(^|[\s,>+~])(?:h1|h2|h3|p|li)(?:$|[\s,>+~.#:[\)])/i;
  return selectors
    .split(',')
    .some((selector) => coreTextSelector.test(selector.trim()));
}

function hasHiddenDeclaration(declarations) {
  return /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/i.test(declarations)
    || /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:;|$)/i.test(declarations)
    || /(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/i.test(declarations)
    || /(?:^|;)\s*font-size\s*:\s*0(?:\.0+)?(?:px|rem|em|pt|%)?\s*(?:;|$)/i.test(declarations)
    || /(?:^|;)\s*color\s*:\s*transparent\s*(?:;|$)/i.test(declarations)
    || /(?:^|;)\s*-webkit-text-fill-color\s*:\s*transparent\s*(?:;|$)/i.test(declarations);
}
