import { createAIClient } from './_lib/aiClient.js';

const LANG_NAMES: Record<string, string> = {
  zh: 'Simplified Chinese',
  sw: 'Swahili',
  en: 'English',
};

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const aiConfig = createAIClient();
    if (!aiConfig) {
      return new Response(null, { status: 204 });
    }

    let body: { text?: string; target?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const text = body.text?.trim();
    if (!text) {
      return Response.json({ error: 'Missing text' }, { status: 400 });
    }

    const target = body.target?.trim() || 'zh';
    const targetName = LANG_NAMES[target] ?? target;

    try {
      const { client, model } = aiConfig;
      const response = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the user's text into ${targetName}. Return only the translated text, no explanations.`,
          },
          { role: 'user', content: text },
        ],
      });

      const translatedText = response.choices[0]?.message?.content?.trim() || text;
      return Response.json(
        { translatedText },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown translation error';
      return Response.json({ error: message }, { status: 502 });
    }
  },
};
