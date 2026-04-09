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
});
