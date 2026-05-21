import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  outlineSchemaImagePromptErrors,
  outlineSchemaImagePromptSlideNumberErrors,
  outlineSchemaRawJsonErrors,
} from '../scripts/lib/outline-schema-utils.mjs';

test('outline schema utilities validate raw JSON outline contracts', () => {
  assert.deepEqual(outlineSchemaRawJsonErrors({
    title: '',
    theme: [],
    slides: [
      {
        type: 'unsupported',
        title: 'Valid title',
        bullets: ['ok', 1],
        columns: [{ title: '', bullets: ['ok', false] }],
      },
    ],
  }), [
    'title must be a non-empty string',
    'theme must be an object when provided',
    'slides[0].type is not supported: unsupported',
    'slides[0].bullets must be an array of strings',
    'slides[0].columns[0].title must be a non-empty string',
    'slides[0].columns[0].bullets must be an array of strings',
  ]);
});

test('outline schema utilities validate image prompt shape and slide numbers', () => {
  assert.deepEqual(outlineSchemaImagePromptErrors({ slide: 1, title: 'Not an array' }), [
    'image-prompts must be an array',
  ]);
  assert.deepEqual(outlineSchemaImagePromptErrors([{ slide: 1, title: 42 }, null]), [
    'image-prompts[0].title must be a string',
    'image-prompts[1] must be an object',
  ]);
  assert.deepEqual(outlineSchemaImagePromptSlideNumberErrors([
    { slide: 2, title: 'One' },
    { slide: 2, title: 'Two' },
    { title: 'Three' },
  ]), [
    'prompt slide number mismatch at slide 1: 2 != 1',
    'prompt slide number missing or invalid at slide 3: missing',
    'prompt slide number duplicate: 2',
  ]);
});
