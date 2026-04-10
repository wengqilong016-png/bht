/**
 * api/send-sms.ts — Vercel Serverless Function
 *
 * Sends SMS messages via Africa's Talking gateway.
 * Requires: AT_API_KEY, AT_USERNAME (and optionally AT_SENDER_ID) env vars.
 *
 * POST /api/send-sms
 * Body: { phones: string[], message: string }
 * Response: { sent: number, failed: number, results: AT result array }
 */
import { readEnv } from './_lib/readEnv.js';

interface SendSMSBody {
  phones: string[];
  message: string;
}

interface ATRecipient {
  number: string;
  cost: string;
  status: string;
  statusCode: number;
  messageId: string;
}

interface ATResponse {
  SMSMessageData: {
    Message: string;
    Recipients: ATRecipient[];
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const apiKey = readEnv('AT_API_KEY');
    const username = readEnv('AT_USERNAME');
    const senderId = readEnv('AT_SENDER_ID');

    if (!apiKey || !username) {
      return new Response(
        JSON.stringify({
          error: '未配置 Africa\'s Talking API Key。请在 Vercel 环境变量中设置 AT_API_KEY 和 AT_USERNAME。',
          sent: 0,
          failed: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let body: SendSMSBody;
    try {
      body = (await request.json()) as SendSMSBody;
    } catch {
      return new Response(JSON.stringify({ error: 'Bad Request: invalid JSON', sent: 0, failed: 0 }), { status: 400 });
    }

    const { phones, message } = body;

    if (!phones?.length || !message?.trim()) {
      return new Response(
        JSON.stringify({ error: '缺少 phones 或 message 参数', sent: 0, failed: 0 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Deduplicate and normalise phone numbers
    const normalised = Array.from(
      new Set(phones.map(p => p.replace(/\s/g, '')).filter(Boolean)),
    );

    if (normalised.length === 0) {
      return new Response(
        JSON.stringify({ error: '没有有效的电话号码', sent: 0, failed: 0 }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const params = new URLSearchParams({
      username,
      to: normalised.join(','),
      message: message.trim(),
    });
    if (senderId) params.set('from', senderId);

    try {
      const atRes = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey,
        },
        body: params.toString(),
      });

      if (!atRes.ok) {
        const text = await atRes.text();
        return new Response(
          JSON.stringify({ error: `Africa's Talking 错误 ${atRes.status}: ${text}`, sent: 0, failed: normalised.length }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const atData = (await atRes.json()) as ATResponse;
      const recipients = atData.SMSMessageData?.Recipients ?? [];
      const sent = recipients.filter(r => r.statusCode === 101).length;
      const failed = recipients.length - sent;

      return new Response(
        JSON.stringify({ sent, failed, results: recipients }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: `网络请求失败：${msg}`, sent: 0, failed: normalised.length }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
};
