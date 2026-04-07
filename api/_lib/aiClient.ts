/**
 * Shared AI client factory for Vercel serverless API routes.
 * Supports both OpenAI and Gemini (via OpenAI-compatible endpoint).
 */
import OpenAI from 'openai';
import { readEnv } from './readEnv.js';

export interface AIClientConfig {
  client: OpenAI;
  model: string;
  provider: 'openai' | 'gemini';
}

/**
 * Create an OpenAI-compatible client from available API keys.
 * Priority: OPENAI_API_KEY → GEMINI_API_KEY
 * Gemini uses Google's OpenAI-compatible endpoint.
 */
export function createAIClient(): AIClientConfig | null {
  const openaiKey = readEnv('OPENAI_API_KEY', 'VITE_OPENAI_API_KEY');
  if (openaiKey) {
    return {
      client: new OpenAI({ apiKey: openaiKey }),
      model: 'gpt-4o-mini',
      provider: 'openai',
    };
  }

  const geminiKey = readEnv('GEMINI_API_KEY', 'VITE_GEMINI_API_KEY');
  if (geminiKey) {
    return {
      client: new OpenAI({
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      }),
      model: 'gemini-2.0-flash',
      provider: 'gemini',
    };
  }

  return null;
}

/** Vision-capable model for image analysis */
export function getVisionModel(config: AIClientConfig): string {
  return config.provider === 'gemini' ? 'gemini-2.0-flash' : 'gpt-4o-mini';
}
