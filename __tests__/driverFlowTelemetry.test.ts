import {
  buildDriverFlowEvent,
  recordDriverFlowEvent,
} from '../services/driverFlowTelemetry';

describe('driverFlowTelemetry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sanitizes sensitive payload fields before building events', () => {
    const event = buildDriverFlowEvent({
      driverId: 'driver-1',
      flowId: 'flow-1',
      step: 'capture',
      eventName: 'photo_attached',
      onlineStatus: true,
      gpsPermission: 'granted',
      hasPhoto: true,
      payload: {
        scoreLength: 4,
        photoData: 'data:image/jpeg;base64,secret',
        gpsCoords: { lat: -6.8, lng: 39.2 },
        ownerPhone: '+255000',
      },
    });

    expect(event.payload).toEqual({ scoreLength: 4 });
  });

  it('queues offline events without throwing', () => {
    expect(() => recordDriverFlowEvent({
      driverId: 'driver-1',
      flowId: 'flow-1',
      step: 'selection',
      eventName: 'machine_selected',
      onlineStatus: false,
    })).not.toThrow();

    const queued = JSON.parse(localStorage.getItem('bahati_driver_flow_events_queue') || '[]');
    expect(queued).toHaveLength(1);
    expect(queued[0].eventName).toBe('machine_selected');
  });
});
