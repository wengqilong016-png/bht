export const SCAN_METER_ERROR_CODES = {
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  INVALID_JSON_BODY: 'INVALID_JSON_BODY',
  MISSING_IMAGE_BASE64: 'MISSING_IMAGE_BASE64',
  EMPTY_AI_RESPONSE: 'EMPTY_AI_RESPONSE',
  INVALID_AI_RESPONSE: 'INVALID_AI_RESPONSE',
  AI_UPSTREAM_ERROR: 'AI_UPSTREAM_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_API_RESPONSE: 'INVALID_API_RESPONSE',
} as const;

export type ScanMeterErrorCode =
  typeof SCAN_METER_ERROR_CODES[keyof typeof SCAN_METER_ERROR_CODES];

export type ScanMeterCondition = 'Normal' | 'Damaged' | 'Unclear' | string;

export interface ScanMeterSuccessPayload {
  score: string;
  condition: ScanMeterCondition;
  notes: string;
}

export interface ScanMeterErrorPayload {
  error: string;
  code: ScanMeterErrorCode | string;
}
