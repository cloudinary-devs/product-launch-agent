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
    'Launch slug (short id used to tag/find Cloudinary assets, e.g. "feature-x"): ',
    { required: true }
  );
  const keyChanges = await ask('What changed / key benefits? (comma-separated is fine): ', { required: true });
  const audience = await ask('Audience for release notes (default: existing customers): ');
  const tone = await ask('Blog tone (default: confident, plain-spoken): ');
  const technicalDetails = await ask(
    `${category.key === 'technical' ? 'Technical details to cover in the docs' : 'Details to cover in the product/details sheet (specs, materials, policies, etc.)'}: `
  );
  const platformsRaw = await ask(`Social platforms, comma-separated (default: ${category.platforms}): `);
  const channelsRaw = await ask('Extra asset channels beyond social crops, comma-separated (default: og_image, email_header): ');

  console.log(
    '\nImagery/video for this launch — has it already been uploaded and tagged in Cloudinary\nwith this launch slug? If not, you can paste source URLs instead.'
  );
  const assetsTagged = (await ask('Already tagged in Cloudinary? (y/n, default n): ')).toLowerCase().startsWith('y');
  let assetUrls = '';
  if (!assetsTagged) {
    assetUrls = await ask('Paste source image/video URLs, comma-separated (or leave blank to skip imagery): ');
  }

  rl.close();

  const platforms = platformsRaw || category.platforms;
  const channels = channelsRaw || 'og_image, email_header';

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

Audience for release notes: ${audience || 'existing customers'}.
Blog tone: ${tone || 'confident, plain-spoken'}.
Details to cover in the supporting doc/sheet: ${technicalDetails || '(use the key changes above)'}.
Social platforms: ${platforms}. Pair the social posts with a social-cropped
image if one is available.
Asset channels needed beyond social crops: ${channels}.

Note: pass "${category.key}" as the \`category\` argument to generate_release_notes,
generate_blog_draft, and generate_docs, so each output uses the right vocabulary
and structure for this kind of launch.
`.trim();

  return { brief, launchSlug };
}
