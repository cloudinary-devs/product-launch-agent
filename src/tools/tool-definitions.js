import {
  generateReleaseNotes,
  generateBlogDraft,
  generateDocs,
  generateSocialPosts,
  generateOutreachPlan,
  generateOutreachMessages,
} from './content-tools.js';
import {
  uploadLaunchImage,
  findLaunchAssets,
  generateSocialCrops,
  generateOgImage,
  generateChannelAssets,
  SUPPORTED_PRESETS,
} from './cloudinary-tools.js';

/**
 * Tool schemas sent to Claude. This is the "menu" of things the agent is
 * allowed to do. Claude decides which to call and in what order based on
 * the launch brief — the orchestrator loop (agent.js) just executes
 * whatever Claude asks for and feeds the result back.
 */
export const TOOLS = [
  {
    name: 'generate_release_notes',
    description: 'Draft factual, concise release notes for the launch.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        keyChanges: { type: 'string', description: 'Bullet-list-ready summary of what changed' },
        audience: { type: 'string', description: 'Who reads this, e.g. "existing customers"' },
        category: {
          type: 'string',
          enum: ['technical', 'retail', 'travel', 'real-estate', 'home-improvement'],
          description: 'What kind of launch this is, shapes vocabulary and framing',
        },
      },
      required: ['featureName', 'keyChanges'],
    },
  },
  {
    name: 'generate_blog_draft',
    description:
      'Draft a launch announcement blog post. Call this AFTER uploading assets and generating any crops/OG image, so real Cloudinary URLs can be embedded inline rather than left out.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        keyBenefits: { type: 'string' },
        tone: { type: 'string' },
        category: {
          type: 'string',
          enum: ['technical', 'retail', 'travel', 'real-estate', 'home-improvement'],
          description: 'What kind of launch this is, shapes vocabulary and framing',
        },
        assets: {
          type: 'array',
          description:
            'Cloudinary URLs available to embed in the post, e.g. the hero image, a product screenshot, or a demo video. Pass whatever you already uploaded/generated for this launch.',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              type: { type: 'string', enum: ['image', 'video'] },
              label: { type: 'string', description: 'What this asset shows, e.g. "product screenshot" or "demo walkthrough"' },
            },
            required: ['url', 'type', 'label'],
          },
        },
      },
      required: ['featureName', 'keyBenefits'],
    },
  },
  {
    name: 'generate_docs',
    description:
      'Draft supporting details for the launch — developer docs for a technical launch, a product info sheet for retail, a trip details sheet for travel, a property details sheet for real estate, or a product/installation sheet for home improvement, depending on `category`.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        technicalDetails: { type: 'string', description: 'Whatever supporting details are available: specs, materials, care/installation notes, policies, etc.' },
        category: {
          type: 'string',
          enum: ['technical', 'retail', 'travel', 'real-estate', 'home-improvement'],
          description: 'What kind of launch this is — determines the shape and vocabulary of this document',
        },
      },
      required: ['featureName', 'technicalDetails'],
    },
  },
  {
    name: 'generate_social_posts',
    description: 'Draft short-form social posts for the launch, one per platform.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        keyBenefits: { type: 'string' },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['x', 'linkedin', 'instagram', 'pinterest', 'tiktok', 'facebook'] },
        },
        imageUrl: {
          type: 'string',
          description: 'Cloudinary URL of the crop to pair with these posts, e.g. from generate_social_crops. Noted alongside each post as the visual to attach.',
        },
      },
      required: ['featureName', 'keyBenefits'],
    },
  },
  {
    name: 'generate_outreach_plan',
    description:
      'Recommend outreach channels and sequencing for reaching this launch\'s first customers, tailored to the target customer described in the brief. Call this once the brief describes a target customer, before generate_outreach_messages, so messaging can be drafted for the recommended channels rather than a generic list.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        targetCustomer: { type: 'string', description: 'Who the first customers are: role, company/context, where to find them, pain points' },
        keyBenefits: { type: 'string' },
        category: {
          type: 'string',
          enum: ['technical', 'retail', 'travel', 'real-estate', 'home-improvement'],
        },
      },
      required: ['featureName', 'targetCustomer', 'keyBenefits'],
    },
  },
  {
    name: 'generate_outreach_messages',
    description:
      'Draft ready-to-send outreach messages for first customers, one per channel. Call this AFTER generate_outreach_plan so messages match its recommended channels. These are drafts for a human to review and deploy, not sent automatically — each message ends with an explicit call to action and a review reminder.',
    input_schema: {
      type: 'object',
      properties: {
        featureName: { type: 'string' },
        targetCustomer: { type: 'string' },
        keyBenefits: { type: 'string' },
        channels: {
          type: 'array',
          items: { type: 'string' },
          description: "Channels to draft messages for, e.g. generate_outreach_plan's recommended channels (cold email, LinkedIn DM, community post, etc.)",
        },
        tone: { type: 'string' },
        imageUrl: { type: 'string', description: 'Optional Cloudinary URL to reference alongside the message' },
      },
      required: ['featureName', 'targetCustomer', 'keyBenefits', 'channels'],
    },
  },
  {
    name: 'upload_launch_image',
    description:
      'Upload a source launch asset — image OR video, local path or URL — into Cloudinary under a launch-specific folder. Call this once per source asset (e.g. hero image, product screenshot, demo video) before requesting crops or embedding it in content. Tags it with the launch slug and an optional role so it can be found later via find_launch_assets.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Local file path or remote URL of the source asset (image or video)' },
        launchSlug: { type: 'string', description: 'Short slug identifying this launch, e.g. "feature-x"' },
        assetName: { type: 'string', description: 'Short name for this asset, e.g. "hero", "demo-screenshot", or "demo-video"' },
        role: {
          type: 'string',
          enum: ['hero', 'screenshot', 'video', 'other'],
          description: 'What this asset is for, recorded as Cloudinary contextual metadata for future discovery',
        },
      },
      required: ['source', 'launchSlug', 'assetName'],
    },
  },
  {
    name: 'find_launch_assets',
    description:
      'Discover assets already uploaded and tagged for this launch, instead of asking for source URLs. Call this FIRST if the brief says imagery has already been prepared/tagged rather than giving explicit URLs. Each result includes a `role` (hero, screenshot, video, other) if one was set at upload time, telling you what the asset is for.',
    input_schema: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'The launch slug/tag to search for, e.g. "feature-x"' },
        resourceType: { type: 'string', enum: ['image', 'video'], description: 'Optionally restrict to one resource type' },
      },
      required: ['tag'],
    },
  },
  {
    name: 'generate_social_crops',
    description: `Generate social-ready crop URLs from an already-uploaded asset. Supported platforms: ${SUPPORTED_PRESETS.filter((p) => p !== 'og_image').join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        publicId: { type: 'string', description: 'The Cloudinary public_id returned by upload_launch_image' },
        platforms: { type: 'array', items: { type: 'string' } },
      },
      required: ['publicId', 'platforms'],
    },
  },
  {
    name: 'generate_og_image',
    description: 'Generate an Open Graph link-preview image with a text overlay from an already-uploaded asset.',
    input_schema: {
      type: 'object',
      properties: {
        publicId: { type: 'string' },
        title: { type: 'string', description: 'Text to overlay, typically the blog/launch title' },
      },
      required: ['publicId', 'title'],
    },
  },
  {
    name: 'generate_channel_assets',
    description: `Generate resized asset URLs for non-social channels from an already-uploaded asset. Supported channels: ${SUPPORTED_PRESETS.join(', ')}.`,
    input_schema: {
      type: 'object',
      properties: {
        publicId: { type: 'string' },
        channels: { type: 'array', items: { type: 'string' } },
      },
      required: ['publicId', 'channels'],
    },
  },
];

/**
 * Executes a tool call by name. Kept separate from the schemas above so
 * the "what Claude sees" and "what actually runs" are easy to audit side
 * by side.
 */
export async function executeTool(name, input) {
  switch (name) {
    case 'generate_release_notes':
      return { content: await generateReleaseNotes(input) };
    case 'generate_blog_draft':
      return { content: await generateBlogDraft(input) };
    case 'generate_docs':
      return { content: await generateDocs(input) };
    case 'generate_social_posts':
      return { content: await generateSocialPosts(input) };
    case 'generate_outreach_plan':
      return { content: await generateOutreachPlan(input) };
    case 'generate_outreach_messages':
      return { content: await generateOutreachMessages(input) };
    case 'upload_launch_image':
      return await uploadLaunchImage(input);
    case 'find_launch_assets':
      return { assets: await findLaunchAssets(input) };
    case 'generate_social_crops':
      return generateSocialCrops(input);
    case 'generate_og_image':
      return { url: generateOgImage(input) };
    case 'generate_channel_assets':
      return generateChannelAssets(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
