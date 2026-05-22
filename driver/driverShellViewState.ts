import type { Driver } from '../types';

export function resolveCurrentDriver(drivers: Driver[], activeDriverId?: string): Driver | undefined {
  if (activeDriverId) {
    const activeDriver = drivers.find(driver => driver.id === activeDriverId);
    if (activeDriver) {
      return activeDriver;
    }
    // Driver not found in list — refuse to fall back to an arbitrary driver
    return undefined;
  }
  // No activeDriverId provided — refuse to guess
  return undefined;
}
