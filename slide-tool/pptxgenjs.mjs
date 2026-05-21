import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pptxgen = require('../node_modules/pptxgenjs/dist/pptxgen.cjs.js');

export default pptxgen?.default ?? pptxgen;
