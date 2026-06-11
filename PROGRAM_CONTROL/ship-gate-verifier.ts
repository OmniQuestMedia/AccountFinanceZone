import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const REQUIRED_FILES = [
  'OQMI_GOVERNANCE.md',
  'OQMI_INFRASTRUCTURE_AND_SECURITY_POLICY.md',
  'CONTRIBUTING.md',
  'WEBHOOK_CONTRACTS.md',
  'PROGRAM_CONTROL/WORK-ORDER-v0.9.8.md',
  '.github/workflows/ci.yml',
  '.github/workflows/ship-gate.yml',
  '.github/workflows/super-linter.yml',
] as const;

const HUMAN_REVIEW_PATHS = ['src/ledger/', 'prisma/'] as const;

function runCommand(command: string): string {
  try {
    return execSync(command, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const result = error as { stdout?: string };
    return result.stdout?.trim() ?? '';
  }
}

function getChangedFiles(): string[] {
  const baseSha = process.env.SHIP_GATE_BASE_SHA?.trim();
  const headSha = (process.env.SHIP_GATE_HEAD_SHA ?? process.env.GITHUB_SHA ?? 'HEAD').trim();

  if (baseSha) {
    const diffOutput = runCommand(`git --no-pager diff --name-only ${baseSha} ${headSha}`);
    return diffOutput ? diffOutput.split('\n').filter(Boolean) : [];
  }

  const trackedFiles = runCommand('git --no-pager ls-files');
  return trackedFiles ? trackedFiles.split('\n').filter(Boolean) : [];
}

function collectMissingFiles(): string[] {
  return REQUIRED_FILES.filter((filePath) => !existsSync(filePath));
}

function findUnexpectedCyranoReferences(): string[] {
  const grepOutput = runCommand('git --no-pager grep -n -i cyrano -- src .github package.json prisma');

  return grepOutput ? grepOutput.split('\n').filter(Boolean) : [];
}

function buildSummary(lines: string[]): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    writeFileSync(summaryPath, `${lines.join('\n')}\n`, { encoding: 'utf8' });
  }
}

function setOutputs(outputs: Record<string, string>): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    return;
  }

  const serialized = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  writeFileSync(outputPath, `${serialized}\n`, { encoding: 'utf8' });
}

function main(): void {
  const missingFiles = collectMissingFiles();
  const changedFiles = getChangedFiles();
  const cyranoReferences = findUnexpectedCyranoReferences();
  const webhookContracts = existsSync('WEBHOOK_CONTRACTS.md')
    ? readFileSync('WEBHOOK_CONTRACTS.md', 'utf8')
    : '';

  const errors: string[] = [];

  if (missingFiles.length > 0) {
    errors.push(`Missing required cleanup files: ${missingFiles.join(', ')}`);
  }

  if (!webhookContracts.includes('Contract version: `1.1`') || !webhookContracts.includes('eCommsZone')) {
    errors.push('WEBHOOK_CONTRACTS.md must declare contract version 1.1 and eCommsZone delivery.');
  }

  if (cyranoReferences.length > 0) {
    errors.push(`Unexpected Cyrano references found:\n${cyranoReferences.join('\n')}`);
  }

  const humanReviewRequired = changedFiles.some((filePath) =>
    HUMAN_REVIEW_PATHS.some((prefix) => filePath.startsWith(prefix)),
  );

  const autoMergeEligible = errors.length === 0 && !humanReviewRequired;
  const summaryLines = [
    '# Ship Gate Summary',
    '',
    '- Rule applied: GOVERNANCE-EQ-v1',
    `- Changed files scanned: ${changedFiles.length}`,
    `- Human review required: ${humanReviewRequired ? 'yes' : 'no'}`,
    `- Auto-merge eligible: ${autoMergeEligible ? 'yes' : 'no'}`,
  ];

  if (errors.length > 0) {
    summaryLines.push('', '## Blocking Issues', ...errors.map((error) => `- ${error}`));
  } else {
    summaryLines.push('', '## Result', '- Ship gate passed.');
  }

  buildSummary(summaryLines);
  setOutputs({
    auto_merge_eligible: String(autoMergeEligible),
    human_review_required: String(humanReviewRequired),
  });

  console.log(summaryLines.join('\n'));

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main();
