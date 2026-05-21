import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './tempdir-cleanup.mjs';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
export const slideToolRoot = path.resolve(testsDir, '..');
export const workspaceRoot = path.resolve(slideToolRoot, '..');
export const slideToolScript = (...parts) => path.join(slideToolRoot, 'scripts', ...parts);
export const slideToolExample = (...parts) => path.join(slideToolRoot, 'examples', ...parts);
export const slideToolOut = (...parts) => path.join(slideToolRoot, 'out', ...parts);
export const skillScript = (...parts) => path.join(workspaceRoot, 'skills', ...parts);
