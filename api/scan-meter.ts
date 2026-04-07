import { createAIClient, getVisionModel } from './_lib/aiClient.js';

const stripJsonFence = (value: string) =>
  value
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const aiConfig = createAIClient();
    if (!aiConfig) {
      return new Response(null, { status: 204 });
    }

    let body: { imageBase64?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.imageBase64) {
      return Response.json({ error: 'Missing imageBase64' }, { status: 400 });
    }

    try {
      const { client } = aiConfig;
      const visionModel = getVisionModel(aiConfig);
      const response = await client.chat.completions.create({
        model: visionModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${body.imageBase64}`, detail: 'low' },
              },
              {
                type: 'text',
                text: 'Analyze this vending machine counter image.\n1. Read the red 7-segment LED number.\n2. Check for screen damage or physical tampering.\nReturn JSON: {"score": "12345", "condition": "Normal" | "Damaged" | "Unclear", "notes": "Short observation"}',
              },
            ],
          },
        ],
      });

      const rawText = response.choices[0]?.message?.content?.trim();
      if (!rawText) {
        return Response.json({ error: 'Empty AI response' }, { status: 502 });
      }

      const parsed = JSON.parse(stripJsonFence(rawText));
      return Response.json(
        {
          score: typeof parsed.score === 'string' ? parsed.score.replace(/\D/g, '') : '',
          condition: parsed.condition || 'Unclear',
          notes: parsed.notes || '',
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      return Response.json({ error: message }, { status: 502 });
    }
  },
};
