import fs from 'node:fs/promises';
import path from 'node:path';
import { runProductLaunchAgent } from './agent.js';
import { runWizard } from './wizard.js';
import { buildHtmlReport } from './report.js';

/**
 * Two ways to supply the brief:
 *   npm start                     → interactive wizard (default)
 *   npm start -- --file brief.txt → reads a pre-written brief from a file,
 *                                    for scripting/automation without prompts
 */
async function getBriefAndSlug() {
  const fileFlagIndex = process.argv.indexOf('--file');
  if (fileFlagIndex !== -1 && process.argv[fileFlagIndex + 1]) {
    const filePath = process.argv[fileFlagIndex + 1];
    const brief = await fs.readFile(filePath, 'utf-8');
    const slugMatch = brief.match(/Launch slug:\s*(\S+)/i);
    const launchSlug = slugMatch ? slugMatch[1] : path.basename(filePath, path.extname(filePath));
    return { brief, launchSlug };
  }
  return runWizard();
}

async function main() {
  const { brief, launchSlug } = await getBriefAndSlug();

  // Each launch gets its own output folder so running this for a second,
  // unrelated launch doesn't overwrite the first one's files.
  const outputDir = path.join(process.cwd(), 'output', launchSlug);
  await fs.mkdir(outputDir, { recursive: true });

  console.log(`\nRunning Product Launch Agent for "${launchSlug}"...\n`);

  const { summary, results } = await runProductLaunchAgent(brief, {
    onToolCall: ({ tool, input }) => {
      console.log(`→ ${tool}(${JSON.stringify(input).slice(0, 120)}...)`);
    },
  });

  await fs.writeFile(
    path.join(outputDir, 'run-results.json'),
    JSON.stringify(results, null, 2)
  );

  const reportHtml = buildHtmlReport({ launchSlug, results, summary });
  const reportPath = path.join(outputDir, 'report.html');
  await fs.writeFile(reportPath, reportHtml);

  console.log('\n--- Agent summary ---');
  console.log(summary);
  console.log(`\nFull tool call log written to: ${path.join(outputDir, 'run-results.json')}`);
  console.log(`\n👉 Open this in your browser to see everything in one place:\n   ${reportPath}`);
}

main().catch((err) => {
  console.error('Agent run failed:', err);
  process.exit(1);
});
