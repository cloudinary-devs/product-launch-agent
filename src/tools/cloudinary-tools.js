import { cloudinary } from '../config.js';

/**
 * Real Cloudinary calls. Cloudinary here plays one role in the agent:
 * asset storage + on-the-fly transformation. It has no opinion about
 * launches, copy, or channels — the agent supplies that context and
 * Cloudinary just does deterministic image/video work well.
 */

// Named crop presets per social/channel surface. Centralizing these means
// the agent (and anyone reading this file) can see every supported
// output at a glance, and adding a channel is a one-line change.
const CROP_PRESETS = {
  instagram_square: { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
  instagram_story: { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' },
  x_post: { width: 1600, height: 900, crop: 'fill', gravity: 'auto' },
  linkedin_post: { width: 1200, height: 627, crop: 'fill', gravity: 'auto' },
  og_image: { width: 1200, height: 630, crop: 'fill', gravity: 'auto' },
  email_header: { width: 600, height: 200, crop: 'fill', gravity: 'auto' },
};

/**
 * Upload a source image (local path or remote URL) into a launch-specific
 * folder so every asset for this launch is easy to find and clean up later.
 * Tags it with the launch slug and, if given, records a `role` (hero,
 * screenshot, video, etc.) as contextual metadata — this is what makes the
 * asset discoverable later via findLaunchAssets without anyone having to
 * remember or re-paste its URL.
 */
export async function uploadLaunchImage({ source, launchSlug, assetName, role }) {
  const publicId = `launches/${launchSlug}/${assetName}`;
  const result = await cloudinary.uploader.upload(source, {
    public_id: publicId,
    overwrite: true,
    resource_type: 'auto', // handles images and video
    tags: [launchSlug],
    context: role ? { role } : undefined,
  });
  return {
    publicId: result.public_id,
    url: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
    tag: launchSlug,
    role: role || null,
  };
}

// Cap how many tagged assets we hand the agent at once. A launch tag can
// realistically match a long tail of unrelated older assets that happen to
// share it; capping (and shuffling rather than always taking the first N)
// keeps the agent from anchoring on a single asset and reusing it everywhere.
const MAX_ASSETS_PER_LAUNCH = 3;

function sample(arr, n) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

/**
 * Find assets already uploaded and tagged for a launch, instead of requiring
 * the brief to contain explicit source URLs. This is the realistic version
 * of "getting" launch imagery: a designer or PM tags assets in Cloudinary
 * once (via the console, DAM UI, or an upload pipeline), and the agent
 * discovers them by tag whenever it runs. `role` context (hero, screenshot,
 * video) tells the agent what each asset is for, when it was set.
 */
export async function findLaunchAssets({ tag, resourceType }) {
  const options = { context: true, max_results: 30 };
  if (resourceType) options.resource_type = resourceType;
  const result = await cloudinary.api.resources_by_tag(tag, options);
  const assets = result.resources.map((r) => ({
    publicId: r.public_id,
    url: r.secure_url,
    resourceType: r.resource_type,
    format: r.format,
    role: r.context?.custom?.role || null,
  }));
  return assets.length > MAX_ASSETS_PER_LAUNCH ? sample(assets, MAX_ASSETS_PER_LAUNCH) : assets;
}

/**
 * Generate crop URLs for a set of social platforms from one uploaded asset.
 * No re-upload needed — Cloudinary derives each variant on request from the
 * same stored original.
 */
export function generateSocialCrops({ publicId, platforms }) {
  const crops = {};
  for (const platform of platforms) {
    const preset = CROP_PRESETS[platform];
    if (!preset) {
      crops[platform] = { error: `No crop preset defined for "${platform}"` };
      continue;
    }
    crops[platform] = cloudinary.url(publicId, {
      transformation: [preset],
      secure: true,
    });
  }
  return crops;
}

/**
 * Build an Open Graph image with a text overlay for link previews, using
 * Cloudinary's layered text transformations rather than a separate design tool.
 */
export function generateOgImage({ publicId, title }) {
  const safeTitle = encodeURIComponent(title.replace(/,/g, '')).slice(0, 300);
  return cloudinary.url(publicId, {
    transformation: [
      CROP_PRESETS.og_image,
      { effect: 'brightness:-30' }, // darken so overlaid text stays legible
      {
        overlay: {
          font_family: 'Arial',
          font_size: 64,
          font_weight: 'bold',
          text: safeTitle,
        },
        color: '#FFFFFF',
        gravity: 'south',
        y: 60,
        crop: 'fit',
        width: 1000,
      },
    ],
    secure: true,
  });
}

/**
 * Produce resized assets for arbitrary channels (e.g. landing page hero,
 * email header, docs thumbnail) beyond the social-crop presets above.
 */
export function generateChannelAssets({ publicId, channels }) {
  const assets = {};
  for (const channel of channels) {
    const preset = CROP_PRESETS[channel];
    if (!preset) {
      assets[channel] = { error: `No preset defined for "${channel}"` };
      continue;
    }
    assets[channel] = cloudinary.url(publicId, {
      transformation: [preset],
      secure: true,
    });
  }
  return assets;
}

export const SUPPORTED_PRESETS = Object.keys(CROP_PRESETS);
