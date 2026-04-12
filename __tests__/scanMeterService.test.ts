import { getScanMeterErrorMessage, scanMeterFromBase64 } from '../services/scanMeterService';
import { SCAN_METER_ERROR_CODES } from '../types/scanMeter';

describe('scanMeterService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('returns success payload for a valid scan-meter response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: '12345',
        condition: 'Normal',
        notes: 'Digits are clear',
      }),
    } as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: true,
      data: {
        score: '12345',
        condition: 'Normal',
        notes: 'Digits are clear',
      },
    });
  });

  it('normalizes missing or invalid success response fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        score: 12345,
        condition: undefined,
        notes: null,
      }),
    } as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: true,
      data: {
        score: '',
        condition: 'Unclear',
        notes: '',
      },
    });
  });

  it('surfaces AI_NOT_CONFIGURED diagnostics from a 503 response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: 'AI scan service is not configured',
        code: SCAN_METER_ERROR_CODES.AI_NOT_CONFIGURED,
      }),
    } as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: false,
      status: 503,
      code: SCAN_METER_ERROR_CODES.AI_NOT_CONFIGURED,
      message: 'AI scan service is not configured',
    });
    expect(getScanMeterErrorMessage(SCAN_METER_ERROR_CODES.AI_NOT_CONFIGURED, 'zh')).toContain('OPENAI_API_KEY');
  });

  it('falls back to UNKNOWN when an error payload has no code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Image was unreadable',
      }),
    } as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: false,
      status: 422,
      code: 'UNKNOWN',
      message: 'Image was unreadable',
    });
  });

  it('uses a generic API failure message when error JSON is invalid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('bad json');
      },
    } as unknown as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: false,
      status: 502,
      code: 'UNKNOWN',
      message: 'Scan API failed with status 502',
    });
  });

  it('uses a generic API failure message when error payload lacks an error string', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: null,
        code: SCAN_METER_ERROR_CODES.AI_UPSTREAM_ERROR,
      }),
    } as Response);

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: false,
      status: 500,
      code: 'UNKNOWN',
      message: 'Scan API failed with status 500',
    });
  });

  it('returns a network diagnostic when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const result = await scanMeterFromBase64('base64-image');

    expect(result).toEqual({
      success: false,
      status: 0,
      code: SCAN_METER_ERROR_CODES.NETWORK_ERROR,
      message: 'Failed to reach scan API',
    });
  });

  it('returns localized scan-meter error messages for known and unknown errors', () => {
    expect(getScanMeterErrorMessage(SCAN_METER_ERROR_CODES.NETWORK_ERROR, 'sw')).toBe(
      'AI scan request failed. Check the network and try again.',
    );
    expect(getScanMeterErrorMessage(SCAN_METER_ERROR_CODES.INVALID_AI_RESPONSE, 'zh')).toBe(
      'AI 返回了无效结果，请稍后重试。',
    );
    expect(getScanMeterErrorMessage(SCAN_METER_ERROR_CODES.INVALID_API_RESPONSE, 'sw')).toBe(
      'AI returned an invalid result. Please try again later.',
    );
    expect(getScanMeterErrorMessage(SCAN_METER_ERROR_CODES.AI_UPSTREAM_ERROR, 'zh')).toBe(
      'AI 服务暂时不可用，请稍后重试。',
    );
    expect(getScanMeterErrorMessage('SOMETHING_ELSE', 'zh')).toBe('AI 扫描失败：SOMETHING_ELSE');
    expect(getScanMeterErrorMessage('SOMETHING_ELSE', 'sw')).toBe('AI scan failed: SOMETHING_ELSE');
  });
});
