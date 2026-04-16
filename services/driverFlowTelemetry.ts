import { supabase } from '../supabaseClient';
import { safeRandomUUID } from '../types';

import type {
  DriverFlowEvent,
  DriverFlowEventName,
  DriverFlowStep,
} from '../types/models';

const STORAGE_KEY = 'bahati_driver_flow_events_queue';
const MAX_QUEUE_SIZE = 200;

type DriverFlowEventRow = {
  id: string;
  driver_id: string;
  flow_id: string;
  draft_tx_id: string | null;
  location_id: string | null;
  step: DriverFlowStep;
  event_name: DriverFlowEventName;
  online_status: boolean;
  gps_permission: DriverFlowEvent['gpsPermission'];
  has_photo: boolean;
  error_category: string | null;
  duration_ms: number | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export interface DriverFlowEventInput {
  driverId: string;
  flowId: string;
  draftTxId?: string | null;
  locationId?: string | null;
  step: DriverFlowStep;
  eventName: DriverFlowEventName;
  onlineStatus: boolean;
  gpsPermission?: DriverFlowEvent['gpsPermission'];
  hasPhoto?: boolean;
  errorCategory?: string | null;
  durationMs?: number | null;
  payload?: Record<string, unknown>;
}

function readQueuedEvents(): DriverFlowEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as DriverFlowEvent[] : [];
  } catch {
    return [];
  }
}

function writeQueuedEvents(events: DriverFlowEvent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_QUEUE_SIZE)));
  } catch {
    // Diagnostics must never break driver workflows.
  }
}

function enqueueEvent(event: DriverFlowEvent): void {
  writeQueuedEvents([...readQueuedEvents(), event]);
}

function sanitizePayload(payload?: Record<string, unknown>): Record<string, unknown> {
  if (!payload) return {};
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('photo') ||
      lowerKey.includes('image') ||
      lowerKey.includes('gps') ||
      lowerKey.includes('coord') ||
      lowerKey.includes('lat') ||
      lowerKey.includes('lng') ||
      lowerKey.includes('phone')
    ) {
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

export function buildDriverFlowEvent(input: DriverFlowEventInput): DriverFlowEvent {
  return {
    id: safeRandomUUID(),
    driverId: input.driverId,
    flowId: input.flowId,
    draftTxId: input.draftTxId ?? null,
    locationId: input.locationId ?? null,
    step: input.step,
    eventName: input.eventName,
    onlineStatus: input.onlineStatus,
    gpsPermission: input.gpsPermission ?? 'unknown',
    hasPhoto: input.hasPhoto ?? false,
    errorCategory: input.errorCategory ?? null,
    durationMs: input.durationMs ?? null,
    payload: sanitizePayload(input.payload),
    createdAt: new Date().toISOString(),
  };
}

function toRow(event: DriverFlowEvent): DriverFlowEventRow {
  return {
    id: event.id,
    driver_id: event.driverId,
    flow_id: event.flowId,
    draft_tx_id: event.draftTxId ?? null,
    location_id: event.locationId ?? null,
    step: event.step,
    event_name: event.eventName,
    online_status: event.onlineStatus,
    gps_permission: event.gpsPermission,
    has_photo: event.hasPhoto,
    error_category: event.errorCategory ?? null,
    duration_ms: event.durationMs ?? null,
    payload: event.payload ?? {},
    created_at: event.createdAt,
  };
}

async function insertEvents(events: DriverFlowEvent[]): Promise<boolean> {
  if (!supabase || events.length === 0) return false;
  try {
    const { error } = await supabase
      .from('driver_flow_events')
      .insert(events.map(toRow));
    if (error) {
      console.warn('[driverFlowTelemetry] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[driverFlowTelemetry] insert failed:', error);
    return false;
  }
}

export async function flushDriverFlowEvents(): Promise<void> {
  const queued = readQueuedEvents();
  if (queued.length === 0) return;
  const inserted = await insertEvents(queued);
  if (inserted) writeQueuedEvents([]);
}

export function recordDriverFlowEvent(input: DriverFlowEventInput): void {
  const event = buildDriverFlowEvent(input);
  if (!input.onlineStatus) {
    enqueueEvent(event);
    return;
  }
  void insertEvents([event]).then((inserted) => {
    if (!inserted) enqueueEvent(event);
    else void flushDriverFlowEvents();
  });
}

export async function fetchDriverFlowEvents(limit = 500): Promise<DriverFlowEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('driver_flow_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[driverFlowTelemetry] fetch failed:', error.message);
    return [];
  }
  return (data ?? []).map((row: DriverFlowEventRow) => ({
    id: row.id,
    driverId: row.driver_id,
    flowId: row.flow_id,
    draftTxId: row.draft_tx_id,
    locationId: row.location_id,
    step: row.step,
    eventName: row.event_name,
    onlineStatus: row.online_status,
    gpsPermission: row.gps_permission,
    hasPhoto: row.has_photo,
    errorCategory: row.error_category,
    durationMs: row.duration_ms,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  }));
}
