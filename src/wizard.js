import { createInterface } from 'node:readline/promises';

/**
 * Prompts the user through a short set of questions and assembles the
 * freeform brief text the agent expects — same shape as before, just built
 * from live answers instead of a hardcoded string. Any answer can be left
 * blank; blank sections are simply omitted from the assembled brief rather
 * than passed through as empty noise.
 */
const CATEGORIES = {
  1: { key: 'technical', label: 'Technical / SaaS feature', platforms: 'x, linkedin' },
  2: { key: 'retail', label: 'Retail / ecommerce product', platforms: 'instagram, pinterest, x' },
  3: { key: 'travel', label: 'Travel / trip package', platforms: 'instagram, pinterest, facebook' },
  4: { key: 'real-estate', label: 'Real estate listing', platforms: 'instagram, facebook' },
  5: { key: 'home-improvement', label: 'Home improvement / home goods', platforms: 'instagram, pinterest, facebook' },
};

const PLATFORM_OPTIONS = ['x', 'linkedin', 'instagram', 'pinterest', 'tiktok', 'facebook'];

const CHANNEL_OPTIONS = [
  { key: 'og_image', label: 'Link preview image (what people see when this page is shared, e.g. in Slack or social)' },
  { key: 'email_header', label: 'Email header banner' },
];

export async function runWizard() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question, { required = false } = {}) => {
    let answer = '';
    do {
      answer = (await rl.question(question)).trim();
      if (!answer && required) console.log('  (required — please enter something)');
    } while (!answer && required);
    return answer;
  };

  console.log("Let's set up your product launch.\n");

  console.log('What kind of launch is this?');
  for (const [num, c] of Object.entries(CATEGORIES)) {
    console.log(`  ${num}. ${c.label}`);
  }
  let categoryChoice;
  do {
    categoryChoice = (await ask('Enter a number (1-5): ')).trim();
  } while (!CATEGORIES[categoryChoice]);
  const category = CATEGORIES[categoryChoice];
  console.log('');

  const featureName = await ask('What are you launching? (feature/product name): ', { required: true });
  const launchSlug = await ask(
    'Launch slug — a short id for this launch, used to find its photos later (e.g. "feature-x"): ',
    { required: true }
  );
  const keyChanges = await ask('What changed / key benefits? (comma-separated is fine): ', { required: true });
  const audience = await ask("Who's this launch announcement for? (default: existing customers): ");
  const tone = await ask('Blog tone (default: confident, plain-spoken): ');
  const technicalDetails = await ask(
    `${category.key === 'technical' ? 'Technical details to cover in the docs' : 'Details to cover in the product/details sheet (specs, materials, policies, etc.)'}: `
  );

  let platforms = category.platforms;
  while (true) {
    const raw = await ask(
      `Which platforms should we post to? Choose from ${PLATFORM_OPTIONS.join(', ')} (comma-separated, default: ${category.platforms}): `
    );
    if (!raw) break;
    const values = raw.split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
    const invalid = values.filter((v) => !PLATFORM_OPTIONS.includes(v));
    if (invalid.length) {
      console.log(`  Not a supported platform: ${invalid.join(', ')}. Choose from: ${PLATFORM_OPTIONS.join(', ')}.`);
      continue;
    }
    platforms = values.join(', ');
    break;
  }

  console.log('\nAny extra images needed beyond your social posts?');
  CHANNEL_OPTIONS.forEach((c, i) => console.log(`  ${i + 1}. ${c.label}`));
  let channels = CHANNEL_OPTIONS.map((c) => c.key).join(', ');
  while (true) {
    const raw = await ask(`Enter numbers separated by commas (default: all): `);
    if (!raw) break;
    const nums = raw.split(',').map((v) => v.trim()).filter(Boolean);
    const invalid = nums.filter((n) => !CHANNEL_OPTIONS[Number(n) - 1]);
    if (invalid.length) {
      console.log(`  Not a valid option: ${invalid.join(', ')}. Enter numbers between 1 and ${CHANNEL_OPTIONS.length}.`);
      continue;
    }
    channels = nums.map((n) => CHANNEL_OPTIONS[Number(n) - 1].key).join(', ');
    break;
  }

  const targetCustomer = await ask(
    'Who are you hoping to reach as first customers? (role, company/context, where to find them — leave blank to skip outreach prep): '
  );

  console.log(
    '\nImagery/video for this launch — has it already been uploaded and tagged in Cloudinary\nwith this launch slug? If not, you can paste source URLs instead.'
  );
  const assetsTagged = (await ask('Already tagged in Cloudinary? (y/n, default n): ')).toLowerCase().startsWith('y');
  let assetUrls = '';
  if (!assetsTagged) {
    assetUrls = await ask('Paste source image/video URLs, comma-separated (or leave blank to skip imagery): ');
  }

  rl.close();

  const assetSection = assetsTagged
    ? `Launch imagery has already been uploaded and tagged in Cloudinary with the\n"${launchSlug}" tag — find it rather than asking me for URLs.`
    : assetUrls
    ? `Source assets for launch imagery (not yet tagged — upload and tag them with\n"${launchSlug}" as you go):\n${assetUrls
        .split(',')
        .map((u) => `- ${u.trim()}`)
        .join('\n')}`
    : 'No launch imagery/video is available yet — skip asset and image-embedding steps, text content only.';

  const brief = `
We're launching: ${featureName}
Launch category: ${category.key}
Launch slug: ${launchSlug}

Key changes / benefits:
${keyChanges}

${assetSection}

Audience: ${audience || 'existing customers'}.
Blog tone: ${tone || 'confident, plain-spoken'}.
Details to cover in the supporting doc/sheet: ${technicalDetails || '(use the key changes above)'}.
Social platforms: ${platforms}. Pair the social posts with a social-cropped
image if one is available.
Extra image types needed beyond social crops: ${channels}.

${
    targetCustomer
      ? `Target customer for outreach:\n${targetCustomer}`
      : 'No target customer described — skip outreach prep entirely.'
  }

Note: pass "${category.key}" as the \`category\` argument to generate_release_notes,
generate_blog_draft, generate_docs, and generate_outreach_plan, so each output uses
the right vocabulary and structure for this kind of launch.
`.trim();

  return { brief, launchSlug };
}
