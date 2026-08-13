import { anthropic, MODEL } from '../config.js';

/**
 * Each function here is a "specialist" — it calls Claude with a narrow,
 * purpose-built system prompt instead of asking one giant prompt to do
 * everything. The orchestrator agent (agent.js) decides *when* to call
 * these; this file only decides *how* each content type gets written.
 */

async function generateText(systemPrompt, userPrompt) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

const CATEGORY_LABELS = {
  technical: 'a developer-focused SaaS company',
  retail: 'a retail/ecommerce brand',
  travel: 'a travel company',
  'real-estate': 'a real estate agency',
  'home-improvement': 'a home improvement / home goods brand',
};

export async function generateReleaseNotes({ featureName, keyChanges, audience = 'existing customers', category = 'technical' }) {
  const system = `You write concise, factual launch/release notes for ${CATEGORY_LABELS[category] || CATEGORY_LABELS.technical}.
Format: a short heading, then 3-6 bullet points. No marketing fluff, no exclamation points.
Audience: ${audience}.`;
  const user = `Launching: ${featureName}\nKey changes:\n${keyChanges}`;
  return generateText(system, user);
}

export async function generateBlogDraft({ featureName, keyBenefits, tone = 'confident, plain-spoken', assets = [], category = 'technical' }) {
  const system = `You write launch announcement blog posts for ${CATEGORY_LABELS[category] || CATEGORY_LABELS.technical}.
Tone: ${tone}. Structure: a hook paragraph, 2-3 sections with subheadings covering the
problem/occasion and the solution/offering, and a short closing call-to-action. Around 400-600 words.

If asset URLs are provided, you MUST embed them inline at the point in the post
where they're most relevant — don't just list them at the end. Use markdown image
syntax ![label](url) for images, placed near the paragraph that describes what
they show. For videos, add a labeled link on its own line: [Watch: label](url).
Do not invent asset URLs that weren't provided, and do not omit ones that were.`;
  const assetList = assets.length
    ? assets.map((a) => `- ${a.type}: ${a.label} — ${a.url}`).join('\n')
    : '(none provided — write the post without embedded media)';
  const user = `Launching: ${featureName}\nKey benefits to cover:\n${keyBenefits}\n\nAvailable assets to embed:\n${assetList}`;
  return generateText(system, user);
}

const DOCS_STYLE_BY_CATEGORY = {
  technical: {
    label: 'developer documentation',
    system: `You write clear developer documentation. Include: a one-line summary,
a "How it works" section, and a minimal usage example if applicable. Use markdown headers.`,
  },
  retail: {
    label: 'a product info sheet',
    system: `You write a customer-facing product info sheet for a retail item. Include:
a one-line summary, a "Materials & care" section, a sizing/dimensions note if relevant,
and the return/exchange policy if provided. Use markdown headers. No developer jargon.`,
  },
  travel: {
    label: 'a trip/package details sheet',
    system: `You write a customer-facing trip or travel package details sheet. Include:
a one-line summary, what's included/excluded, key dates or booking terms, and any
restrictions or requirements provided. Use markdown headers. Plain, reassuring tone.`,
  },
  'real-estate': {
    label: 'a property details sheet',
    system: `You write a property listing details sheet. Include: a one-line summary,
key specs (size, rooms, lot, etc. — only what's provided, never invent figures),
notable features, and any disclosures provided. Use markdown headers. Factual tone.`,
  },
  'home-improvement': {
    label: 'a product/installation sheet',
    system: `You write a customer-facing product and installation sheet for a home
improvement item. Include: a one-line summary, materials, an installation or
setup note if relevant, and warranty terms if provided. Use markdown headers.`,
  },
};

export async function generateDocs({ featureName, technicalDetails, category = 'technical' }) {
  const style = DOCS_STYLE_BY_CATEGORY[category] || DOCS_STYLE_BY_CATEGORY.technical;
  const user = `Launching: ${featureName}\nDetails to cover:\n${technicalDetails}`;
  return generateText(style.system, user);
}

const PLATFORM_CONVENTIONS = {
  x: 'under 280 characters, punchy, at most one relevant hashtag',
  linkedin: '3-4 sentences, slightly more professional, no hashtag spam',
  instagram: '1-2 short sentences plus a line break, then 5-10 relevant hashtags on their own line, warm/visual tone',
  pinterest: 'a keyword-rich description (people search Pinterest with buying intent) under 500 characters, include the product type and key attributes naturally',
  tiktok: 'very short, casual, hook-first caption, 3-5 hashtags, written as if narrating a quick video',
  facebook: '2-4 sentences, conversational, can include a soft call-to-action link',
};

export async function generateSocialPosts({ featureName, keyBenefits, platforms = ['x', 'linkedin'], imageUrl }) {
  const conventions = platforms
    .map((p) => `- ${p}: ${PLATFORM_CONVENTIONS[p] || 'general short-form social copy'}`)
    .join('\n');
  const system = `You write short-form social copy for a launch.
For each requested platform, write one post matching that platform's norms:
${conventions}
Return the posts clearly labeled by platform. If an image URL is provided,
add one line after each post: "Attach: {url}" so the poster knows which
visual to upload alongside the text.`;
  const user = `Launching: ${featureName}\nPlatforms: ${platforms.join(', ')}\nKey benefits:\n${keyBenefits}${
    imageUrl ? `\nImage to attach: ${imageUrl}` : ''
  }`;
  return generateText(system, user);
}
