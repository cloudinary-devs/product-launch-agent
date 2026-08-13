import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { v2 as cloudinary } from 'cloudinary';

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return val;
}

export const anthropic = new Anthropic({
  apiKey: requireEnv('ANTHROPIC_API_KEY'),
});

cloudinary.config({
  cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
  api_key: requireEnv('CLOUDINARY_API_KEY'),
  api_secret: requireEnv('CLOUDINARY_API_SECRET'),
  secure: true,
});

export { cloudinary };

// The model that both the top-level orchestrator and the content
// sub-tasks use. Centralized here so it's easy to swap.
export const MODEL = 'claude-sonnet-4-6';
