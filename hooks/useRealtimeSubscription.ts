/**
 * useRealtimeSubscription.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * Supabase Realtime hook that subscribes to INSERT/UPDATE/DELETE changes on
 * `transactions`, `drivers`, and `daily_settlements` tables via broadcast
 * channels backed by database triggers, invalidating the corresponding
 * React Query caches so the UI refreshes immediately.
 *
 * Uses dedicated private channels instead of `postgres_changes` for
 * better scalability. Database triggers call `realtime.broadcast_changes()`.
 *
 * Drivers subscribe to a per-driver topic `db:transactions:{driverId}` so they
 * only receive their own rows. Admins subscribe to global topics for all tables.
 *
 * Pass `userRole` and optionally `driverId` to select the correct channel set.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { createRealtimeInvalidator } from '../services/realtimeInvalidation';
import { supabase } from '../supabaseClient';

export type RealtimeStatus = 'connected' | 'disconnected' | 'reconnecting';

/** Broadcast event names matching TG_OP values emitted by notify_table_changes(). */
const BROADCAST_EVENTS = ['INSERT', 'UPDATE', 'DELETE'] as const;

/** All channels — used by admin accounts. */
const ADMIN_CHANNELS = [
  { topic: 'db:transactions',      table: 'transactions'      },
  { topic: 'db:drivers',           table: 'drivers'           },
  { topic: 'db:daily_settlements', table: 'daily_settlements' },
  { topic: 'db:locations',         table: 'locations'         },
] as const;

/** Per-driver channel — driver only receives their own transaction broadcasts. */
function getDriverChannels(driverId: string) {
  return [
    { topic: `db:transactions:${driverId}`, table: 'transactions' as const },
  ];
}

type RealtimeChannelConfig = { topic: string; table: 'transactions' | 'drivers' | 'daily_settlements' | 'locations' };

function getChannelConfigs(userRole: 'admin' | 'driver', driverId?: string): RealtimeChannelConfig[] {
  if (userRole === 'driver' && driverId) {
    return getDriverChannels(driverId);
  }
  return ADMIN_CHANNELS as readonly RealtimeChannelConfig[] as RealtimeChannelConfig[];
}

function createStatusHandler(
  subscribedTopics: Set<string>,
  expectedChannelCount: number,
  setRealtimeStatus: React.Dispatch<React.SetStateAction<RealtimeStatus>>,
) {
  return (topic: string) => (status: string) => {
    if (status === 'SUBSCRIBED') {
      subscribedTopics.add(topic);
      if (subscribedTopics.size === expectedChannelCount) {
        setRealtimeStatus('connected');
      }
      return;
    }

    if (status === 'CLOSED') {
      subscribedTopics.delete(topic);
      if (subscribedTopics.size === 0) {
        setRealtimeStatus('disconnected');
      }
      return;
    }

    setRealtimeStatus('reconnecting');
  };
}

function subscribeToRealtimeChannels(
  client: NonNullable<typeof supabase>,
  channelConfigs: RealtimeChannelConfig[],
  queue: (table: RealtimeChannelConfig['table']) => void,
  setRealtimeStatus: React.Dispatch<React.SetStateAction<RealtimeStatus>>,
) {
  const subscribedTopics = new Set<string>();
  const statusHandlerFactory = createStatusHandler(
    subscribedTopics,
    channelConfigs.length,
    setRealtimeStatus,
  );

  return channelConfigs.map(({ topic, table }) => {
    const channel = client.channel(topic, { config: { private: true } });

    for (const event of BROADCAST_EVENTS) {
      channel.on('broadcast', { event }, () => queue(table));
    }

    channel.subscribe(statusHandlerFactory(topic));
    return channel;
  });
}

export function useRealtimeSubscription(userRole?: 'admin' | 'driver', isOnline?: boolean, driverId?: string) {
  const queryClient = useQueryClient();
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('disconnected');

  // Main subscription setup — depends on userRole to pick channels.
  useEffect(() => {
    if (!supabase) return;
    // Do not subscribe until the user's role is known.  Subscribing before the
    // role is resolved would default to ADMIN_CHANNELS and expose admin-scoped
    // broadcast events to an unauthenticated or driver-role session.
    if (!userRole) return;

    const { queue, cleanup } = createRealtimeInvalidator(queryClient);

    // Set auth token so private channels pass RLS checks on realtime.messages.
    // Passing no argument automatically uses the current session token from the
    // Supabase client.
    const client = supabase;
    client.realtime.setAuth();

    const channelConfigs = getChannelConfigs(userRole, driverId);
    const channels = subscribeToRealtimeChannels(client, channelConfigs, queue, setRealtimeStatus);

    return () => {
      // ✅ 问题 7 修复：改进订阅清理逻辑
      // 1. 显式调用 unsubscribe() 卸载每个订阅的事件监听器
      // 2. 调用 removeChannel() 以释放 Channel 对象持有的资源
      // 3. 清理 realtime invalidation 的待处理队列
      // 
      // 这确保了：
      // - 事件监听器不会继续监听（即使 channel 被移除）
      // - Supabase 客户端内部的 channel 注册表被清空
      // - 缓冲的 invalidation 回调不会在卸载后触发
      // - 用户切换角色或登出时，不会泄露来自旧订阅的数据更新
      
      channels.forEach((ch) => {
        if (typeof ch.unsubscribe === 'function') {
          ch.unsubscribe();  // ← 显式卸载订阅
        }
        client.removeChannel(ch);  // ← 释放 channel 资源
      });
      cleanup();  // ← 清理 invalidation 队列的待处理计时器
    };
  }, [queryClient, userRole]);

  // Re-authenticate realtime when connectivity is restored.  The JWT may have
  // expired during the offline period; refreshing the auth session first ensures
  // the SDK's built-in reconnect uses a valid token instead of silently failing.
  useEffect(() => {
    if (!supabase || !userRole || !isOnline) return;
    const client = supabase;
    client.auth.getSession().then(() => {
      client.realtime.setAuth();
    }).catch((error) => {
      console.warn('Failed to refresh realtime auth session.', error);
    });
  }, [isOnline, userRole]);

  return { realtimeStatus };
}
