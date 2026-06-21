import { MapPin, AlertTriangle } from 'lucide-react';
import React from 'react';


interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  /** Optional fallback override. Defaults to a generic "Map unavailable" card. */
  fallback?: React.ReactNode;
}

/**
 * Error boundary that catches Leaflet / map loading failures and renders a
 * graceful degraded UI instead of crashing the parent component tree.
 */
export class MapErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('[MapErrorBoundary] Map failed to load:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-[#ede6dc] border border-[#e0d8cc] p-8 text-center min-h-[200px]">
          <AlertTriangle size={32} className="text-amber-400" />
          <div>
            <p className="text-sm font-bold text-[#3d3028]">地图暂不可用</p>
            <p className="text-xs text-[#a09080] mt-1">Map temporarily unavailable</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs text-amber-500 underline hover:text-amber-700"
          >
            重试 / Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Skeleton placeholder shown while the map bundle loads. */
export function MapLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[#ede6dc] border border-[#e0d8cc] p-8 text-center min-h-[200px] animate-pulse">
      <MapPin size={28} className="text-[#c0b0a0]" />
      <p className="text-xs text-[#a09080]">Loading map…</p>
    </div>
  );
}
