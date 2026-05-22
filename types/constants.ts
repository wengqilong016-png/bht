/** Application-wide constants. Import from here instead of hard-coding values. */

/** PostgREST error code returned when .single() finds no matching row. */
export const PGRST_NO_ROWS = 'PGRST116';

export const CONSTANTS = {
  COIN_VALUE_TZS: 200,
  DEFAULT_PROFIT_SHARE: 0.15,
  DEBT_RECOVERY_RATE: 0.10,
  ROLLOVER_THRESHOLD: 10000,
  OFFLINE_STORAGE_KEY: 'kiosk_offline_tx',
  STORAGE_LOCATIONS_KEY: 'kiosk_locations_data',
  STORAGE_DRIVERS_KEY: 'kiosk_drivers_data_v3',
  STORAGE_SETTLEMENTS_KEY: 'kiosk_daily_settlements',
  STORAGE_TRANSACTIONS_KEY: 'kiosk_transactions_data',
  STORAGE_AI_LOGS_KEY: 'kiosk_ai_logs',
  STORAGE_NOTIFICATIONS_KEY: 'kiosk_notifications',
  IMAGE_MAX_WIDTH: 800,
  IMAGE_QUALITY: 0.6,
  STAGNANT_DAYS_THRESHOLD: 7,
  /** Minimum absolute difference between user-entered score and AI-recognised score
   *  to flag a transaction as anomalous. Increase to reduce false-positives. */
  ANOMALY_SCORE_DIFF_THRESHOLD: 50,
  /**
   * Client-side auxiliary score cap.
   * 
   * ⚠️  This is a UI convenience clamp, NOT a security boundary.
   *     The SERVER (submit_collection_v2 RPC + DB CHECK constraints)
   *     is the authoritative defense line. This constant exists solely
   *     to give the user early feedback — the server will independently
   *     validate every submitted value and reject out-of-range amounts
   *     regardless of what the client sends.
   * 
   *     Server authoritative limit: 1,000,000 (see migration 20260522000000)
   */
  MAX_REASONABLE_SCORE: 100000,
} as const;
