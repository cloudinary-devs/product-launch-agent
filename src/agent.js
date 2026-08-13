import { anthropic, MODEL } from './config.js';
import { TOOLS, executeTool } from './tools/tool-definitions.js';

const SYSTEM_PROMPT = `You are a Product Launch Agent. Given a launch brief, coordinate
everything needed to ship the launch:

- Content: release notes, a blog draft, developer docs, and social posts.
- Assets: upload the launch imagery/video to Cloudinary, then generate social crops,
  an Open Graph image, and any other resized assets the brief calls for.

Critical ordering rule: media-related content depends on assets, not the other
way around. Figure out where assets come from first:
- If the brief says imagery/video has ALREADY been prepared or tagged for this
  launch, call find_launch_assets with the launch slug as the tag BEFORE
  uploading anything, and before generating any content. Use each result's
  \`role\` (hero, screenshot, video) to know what it's for.
- If the brief gives explicit source URLs/paths instead, upload each with
  upload_launch_image, setting \`role\` so future runs can discover them by tag
  too instead of needing the URL pasted again.
- If find_launch_assets returns nothing AND the brief gives no explicit
  URL/path for an asset: STOP. Do not invent, guess, or substitute a source
  (including any URL, filename, or stock image you happen to know about from
  training data). Skip that asset, generate the text content only, and say
  explicitly in your final summary which asset is missing and that a human
  needs to either tag a real asset with this launch's slug in Cloudinary or
  supply a URL. A fabricated image is worse than no image.

Once real assets are uploaded or found:
1. You'll typically have up to a few relevant assets to work with (find_launch_assets
   caps and randomizes its results when a launch tag matches a lot of assets, so
   don't assume the first one returned is "the" hero image). Do NOT collapse
   everything to a single asset — when more than one is available, use more
   than one.
2. Generate whatever crops/OG image/channel assets the brief needs, calling
   generate_social_crops / generate_og_image / generate_channel_assets once
   per asset you're using, not just once total.
3. Only THEN call generate_blog_draft, passing URLs from more than one asset
   in its \`assets\` argument when you have them, and generate_social_posts,
   rotating which asset's crop you pass as \`imageUrl\` across platforms
   instead of reusing the same one for every platform — so the output
   actually embeds varied real media instead of describing it with no visual
   or reusing one image everywhere. A blog post or set of social posts that
   had multiple assets available but only embedded one image throughout is
   an incomplete result; treat it as a bug, not a valid output.

Other rules:
- If the brief specifies a launch category (technical, retail, travel,
  real-estate, home-improvement), pass it as the \`category\` argument to
  generate_release_notes, generate_blog_draft, and generate_docs every time —
  it changes what "docs" even means (developer docs vs. a product info sheet
  vs. a property listing sheet, etc.) and the vocabulary that fits.
- Use the tools available to you rather than writing content or asset URLs yourself.
- Once you've made all the tool calls you need, write a short final summary for a
  human reviewer: what was produced, and where to find it (mention that full text/
  URLs are in the structured results, not fully in your summary).
- Do not repeat a tool call you've already made with the same inputs.`;

/**
 * Runs the standard "agent loop": send messages + tool defs to Claude,
 * execute whatever tools Claude asks for, feed results back as tool_result
 * blocks, and repeat until Claude stops requesting tools.
 */
export async function runProductLaunchAgent(brief, { maxTurns = 14, onToolCall } = {}) {
  const messages = [{ role: 'user', content: brief }];
  const toolResultsLog = [];

  // Code-level guard: don't trust the prompt alone to enforce ordering.
  // Track whether the agent has attempted asset resolution (found or
  // uploaded something) before it's allowed to call tools that embed media.
  let assetStepAttempted = false;
  const ASSET_STEP_TOOLS = new Set(['find_launch_assets', 'upload_launch_image']);
  const MEDIA_DEPENDENT_TOOLS = new Set(['generate_blog_draft', 'generate_social_posts']);

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      const finalText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { summary: finalText, results: toolResultsLog };
    }

    const toolResultContent = [];
    for (const block of toolUseBlocks) {
      if (ASSET_STEP_TOOLS.has(block.name)) {
        assetStepAttempted = true;
      }

      let output;
      if (MEDIA_DEPENDENT_TOOLS.has(block.name) && !assetStepAttempted) {
        // Reject the call instead of executing it, and tell Claude why.
        output = {
          error:
            'Blocked: no asset resolution step (find_launch_assets or upload_launch_image) has been attempted yet. Call one of those first, even if it may return nothing, before generating media-dependent content.',
        };
      } else {
        try {
          output = await executeTool(block.name, block.input);
        } catch (err) {
          output = { error: err.message };
        }
      }

      toolResultsLog.push({ tool: block.name, input: block.input, output });
      if (onToolCall) onToolCall({ tool: block.name, input: block.input, output });

      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(output),
      });
    }

    messages.push({ role: 'user', content: toolResultContent });
  }

  return {
    summary: 'Reached max turns before Claude produced a final summary.',
    results: toolResultsLog,
  };
}
