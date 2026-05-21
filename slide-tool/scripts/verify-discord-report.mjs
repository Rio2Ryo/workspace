import fs from 'node:fs';
import path from 'node:path';
import {
  deliveryManifestDiscordReportVerificationPayload,
  deliveryManifestFinalizeDiscordReport,
  deliveryManifestValidateDiscordReport,
  deliveryManifestSectionStatus,
  deliveryManifestSummarizeDiscordReport,
  deliveryManifestValidateDiscordReportValidations,
} from './lib/delivery-manifest-utils.mjs';

const cli = parseArgs(process.argv.slice(2));
const reportPath = cli.reportPath;
if (!reportPath) {
  printVerificationPayload(false, ['Usage: node slide-tool/scripts/verify-discord-report.mjs <discord-report.md> [--delivery-message <delivery-message.md>]'], null);
  process.exit(2);
}
const reportDir = path.dirname(path.resolve(reportPath));

let text = '';
try {
  text = fs.readFileSync(reportPath, 'utf8');
} catch (error) {
  printVerificationPayload(false, [`report missing or unreadable: ${reportPath}`, error.message], null);
  process.exit(1);
}

const sections = {
  verification: deliveryManifestSectionStatus(text, '検証結果:'),
  acceptance: deliveryManifestSectionStatus(text, '納品前チェック:'),
};
let summary = deliveryManifestSummarizeDiscordReport(text, sections, reportDir);
const validation = deliveryManifestValidateDiscordReport(summary, sections, cli.errors);
let errors = validation.errors;
const warnings = validation.warnings;
summary = validation.summary;
const mergedValidations = deliveryManifestValidateDiscordReportValidations(summary, cli, errors);
summary = mergedValidations.summary;
errors = mergedValidations.errors;

const finalSummary = deliveryManifestFinalizeDiscordReport(summary, errors);
printVerificationPayload(errors.length === 0, errors, sections, finalSummary, warnings);
if (errors.length) process.exit(1);

function parseArgs(args) {
  const parsed = { reportPath: null, deliveryMessagePath: null, deliveryManifestPath: null, errors: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--delivery-message') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        parsed.errors.push('--delivery-message requires a path');
      } else {
        parsed.deliveryMessagePath = value;
        i += 1;
      }
      continue;
    }
    if (arg === '--delivery-manifest') {
      const value = args[i + 1];
      if (!value || value.startsWith('--')) {
        parsed.errors.push('--delivery-manifest requires a path');
      } else {
        parsed.deliveryManifestPath = value;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--')) {
      parsed.errors.push(`unknown option: ${arg}`);
      continue;
    }
    if (!parsed.reportPath) {
      parsed.reportPath = arg;
    } else {
      parsed.errors.push(`unexpected argument: ${arg}`);
    }
  }
  return parsed;
}

function printVerificationPayload(ok, errors, sections, summary = null, warnings = []) {
  console.log(JSON.stringify(deliveryManifestDiscordReportVerificationPayload({
    ok,
    reportPath,
    sections,
    summary,
    errors,
    warnings,
  })));
}
