# Product Launch Agent

An agent that coordinates everything needed to ship a feature launch:

**Content** (via Claude):
- Release notes
- Blog draft
- Developer docs
- Social posts (X, LinkedIn)

**Assets** (via Cloudinary):
- Upload launch imagery/video
- Generate social crops (Instagram, X, LinkedIn presets)
- Generate an Open Graph image with a text overlay
- Generate resized assets for other channels (email header, etc.)

**Outreach** (via Claude, when a target customer is described):
- A plan recommending outreach channels and sequencing for reaching first customers
- Ready-to-send messages per channel, each ending with an explicit call to action
- Drafts only — the agent never sends anything; a human reviews and deploys them

## Getting imagery to the agent

Two ways, and the first is the one worth building toward:

1. **Tag-based discovery (recommended).** Whoever preps launch materials tags
   them in Cloudinary with the launch slug ahead of time — via the console,
   your DAM UI, or an upload pipeline — optionally setting a `role` custom
   metadata field (`hero`, `screenshot`, `video`). The brief then just names
   the slug, and the agent calls `find_launch_assets` to discover everything
   itself. Nobody has to hunt down or paste a URL.
2. **URL-based (fallback).** The brief includes explicit source paths/URLs.
   The agent uploads and tags them via `upload_launch_image` — which means
   the *next* launch that reuses these assets can switch to option 1.

The agent's system prompt (`src/agent.js`) tells Claude to prefer (1) and
only fall back to (2) for anything `find_launch_assets` doesn't return. The
sample brief in `src/index.js` demonstrates the tag-based path.

## Why this shape

The interesting part isn't Cloudinary's API — it's the **agent loop**:
Claude is given a menu of tools (`src/tools/tool-definitions.js`) and a launch
brief, and it decides which tools to call, in what order, and with what
inputs. The orchestrator (`src/agent.js`) just executes whatever Claude asks
for and feeds results back until Claude is done. Content tools themselves
delegate to Claude with narrow, specialized prompts (`src/tools/content-tools.js`)
rather than one giant prompt trying to do everything — a "specialist sub-call"
pattern that scales better as you add more content types.

Cloudinary's role is intentionally narrow: store the source asset once, then
derive every crop/format/overlay on demand via URL-based transformations
(`src/tools/cloudinary-tools.js`). No re-uploading per channel.

## Setup

```bash
npm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY and your Cloudinary credentials in .env
```

Cloudinary credentials are in your [Cloudinary console](https://console.cloudinary.com)
under Dashboard → Product Environment Credentials.

## Run

```bash
npm start
```

You'll be walked through a short wizard: what kind of launch this is (technical,
retail, travel, real estate, or home improvement), what you're launching, key
changes/benefits, audience, tone, how to get imagery (already tagged in
Cloudinary, or paste source URLs), and who you're hoping to reach as first
customers (leave blank to skip outreach prep). Answering `--file brief.txt`
instead of the wizard is also supported, for scripting: `npm start -- --file brief.txt`.

This will:
1. Print each tool call as the agent makes it.
2. Write `output/<launch-slug>/report.html` — a single browser-viewable report
   with every generated content piece rendered (not raw markdown) and every
   Cloudinary asset shown as an actual thumbnail.
3. Write `output/<launch-slug>/run-results.json` — the raw tool-call log
   (every input/output, including every Cloudinary URL), for scripting or
   auditing.
4. Print a final summary from the agent, plus the exact path to `report.html`.

## Extending it

- **New content type** (e.g. an FAQ): add a specialist function in
  `content-tools.js`, add its schema to `TOOLS` and its case to `executeTool`
  in `tool-definitions.js`. No changes needed to `agent.js`.
- **New crop/channel preset**: add one line to `CROP_PRESETS` in
  `cloudinary-tools.js`.
- **Swap the model**: change `MODEL` in `config.js`.
- **Persist run history / support multiple launches at once**: the agent loop
  is stateless per call — wrap `runProductLaunchAgent` in whatever
  storage/queueing layer your app needs.

## File structure

```
src/
  config.js               Anthropic + Cloudinary client setup
  agent.js                The orchestrator tool-use loop
  index.js                CLI entry point
  tools/
    tool-definitions.js   Tool schemas Claude sees + dispatcher
    content-tools.js      Claude-backed content generators
    cloudinary-tools.js   Real Cloudinary upload/transform calls
```
