import { useMemo } from 'react';

import type { Location, Transaction } from '../../types';

interface UseNextQueuedMachineInput {
  locations: Location[];
  transactions: Transaction[];
  currentDriverId: string | null;
  selectedLocationId: string;
  todayStr: string;
}

export function useNextQueuedMachine({
  locations,
  transactions,
  currentDriverId,
  selectedLocationId,
  todayStr,
}: UseNextQueuedMachineInput) {
  const assignedLocations = useMemo(() => {
    const mine = locations.filter((location) => location.assignedDriverId === currentDriverId);
    return mine.length > 0 ? mine : locations;
  }, [currentDriverId, locations]);

  const visitedLocationIds = useMemo(() => {
    return new Set(
      transactions
        .filter((tx) => tx.driverId === currentDriverId && tx.timestamp.startsWith(todayStr) && (tx.type === undefined || tx.type === 'collection'))
        .map((tx) => tx.locationId)
    );
  }, [transactions, currentDriverId, todayStr]);

  const nextQueuedMachine = useMemo(() => {
    return assignedLocations
      .filter((location) => location.id !== selectedLocationId)
      .map((location) => ({
        location,
        isPending: !visitedLocationIds.has(location.id),
        isUrgent:
          location.status !== 'active' ||
          location.resetLocked === true ||
          (location.lastScore ?? 0) >= 9000,
      }))
      .sort((a, b) => {
        if (Number(b.isPending) !== Number(a.isPending)) return Number(b.isPending) - Number(a.isPending);
        if (Number(b.isUrgent) !== Number(a.isUrgent)) return Number(b.isUrgent) - Number(a.isUrgent);
        return a.location.name.localeCompare(b.location.name);
      })[0]?.location ?? null;
  }, [assignedLocations, selectedLocationId, visitedLocationIds]);

  const remainingPendingStops = useMemo(() => {
    return assignedLocations.filter((location) => location.id !== selectedLocationId && !visitedLocationIds.has(location.id)).length;
  }, [assignedLocations, selectedLocationId, visitedLocationIds]);

  return { nextQueuedMachine, remainingPendingStops };
}
