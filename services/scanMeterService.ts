import {
  SCAN_METER_ERROR_CODES,
  type ScanMeterCondition,
  type ScanMeterErrorCode,
  type ScanMeterErrorPayload,
  type ScanMeterSuccessPayload,
} from '../types/scanMeter';

export type ScanMeterResult =
  | { success: true; data: ScanMeterSuccessPayload }
  | { success: false; status: number; code: string; message: string };

const parseErrorPayload = async (response: Response): Promise<ScanMeterErrorPayload | null> => {
  try {
    const data = await response.json() as Partial<ScanMeterErrorPayload>;
    if (typeof data?.error === 'string') {
      return {
        error: data.error,
        code: typeof data.code === 'string' ? data.code : 'UNKNOWN',
      };
    }
  } catch {
    // Fall through to generic error handling.
  }

  return null;
};

export async function scanMeterFromBase64(imageBase64: string): Promise<ScanMeterResult> {
  try {
    const response = await fetch('/api/scan-meter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    });

    if (!response.ok) {
      const payload = await parseErrorPayload(response);
      return {
        success: false,
        status: response.status,
        code: payload?.code ?? 'UNKNOWN',
        message: payload?.error ?? `Scan API failed with status ${response.status}`,
      };
    }

    const data = await response.json() as Partial<ScanMeterSuccessPayload>;
    return {
      success: true,
      data: {
        score: typeof data.score === 'string' ? data.score : '',
        condition: (typeof data.condition === 'string' ? data.condition : 'Unclear') as ScanMeterCondition,
        notes: typeof data.notes === 'string' ? data.notes : '',
      },
    };
  } catch {
    return {
      success: false,
      status: 0,
      code: SCAN_METER_ERROR_CODES.NETWORK_ERROR,
      message: 'Failed to reach scan API',
    };
  }
}

export function getScanMeterErrorMessage(code: string, lang: 'zh' | 'sw'): string {
  switch (code as ScanMeterErrorCode) {
    case SCAN_METER_ERROR_CODES.AI_NOT_CONFIGURED:
      return lang === 'zh'
        ? 'AI 扫描未配置，请先在服务端设置 OPENAI_API_KEY 或 GEMINI_API_KEY。'
        : 'AI scan is not configured on the server. Set OPENAI_API_KEY or GEMINI_API_KEY first.';
    case SCAN_METER_ERROR_CODES.NETWORK_ERROR:
      return lang === 'zh'
        ? 'AI 扫描请求失败，请检查网络后重试。'
        : 'AI scan request failed. Check the network and try again.';
    case SCAN_METER_ERROR_CODES.INVALID_AI_RESPONSE:
    case SCAN_METER_ERROR_CODES.INVALID_API_RESPONSE:
      return lang === 'zh'
        ? 'AI 返回了无效结果，请稍后重试。'
        : 'AI returned an invalid result. Please try again later.';
    case SCAN_METER_ERROR_CODES.AI_UPSTREAM_ERROR:
      return lang === 'zh'
        ? 'AI 服务暂时不可用，请稍后重试。'
        : 'AI service is temporarily unavailable. Please try again later.';
    default:
      return lang === 'zh'
        ? `AI 扫描失败：${code}`
        : `AI scan failed: ${code}`;
  }
}
