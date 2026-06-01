import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let resolvedValue: { data: unknown[] | null; error: Error | null } = { data: null, error: null };

const mockQueryChain = {
  select: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  abortSignal: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockResolvedValue({ error: null } as never),
  then: (
    resolve: (v: typeof resolvedValue) => unknown,
    reject: (e: unknown) => unknown
  ) => Promise.resolve(resolvedValue).then(resolve, reject),
};

jest.mock('../supabaseClient', () => ({
  supabase: { from: () => mockQueryChain },
}));

import { fetchTransactions, upsertTransaction } from '../repositories/transactionRepository';

beforeEach(() => {
  resolvedValue = { data: null, error: null };
  jest.clearAllMocks();
  mockQueryChain.select.mockReturnThis();
  mockQueryChain.order.mockReturnThis();
  mockQueryChain.eq.mockReturnThis();
  mockQueryChain.limit.mockReturnThis();
  mockQueryChain.abortSignal.mockReturnThis();
  mockQueryChain.upsert.mockResolvedValue({ error: null } as never);
});

describe('fetchTransactions', () => {
  describe('正常场景', () => {
    it('driver 只获取自己的交易时应正常返回', async () => {
      resolvedValue = {
        data: [
          { id: 'tx-1', driverId: 'driver-A', currentScore: 100 },
          { id: 'tx-2', driverId: 'driver-A', currentScore: 200 },
        ],
        error: null,
      };

      const result = await fetchTransactions({
        isDriver: true,
        driverIdFilter: 'driver-A',
      });

      expect(result).toHaveLength(2);
      expect(result[0].driverId).toBe('driver-A');
    });

    it('admin 获取所有交易时不做 RLS 验证', async () => {
      resolvedValue = {
        data: [
          { id: 'tx-1', driverId: 'driver-A', currentScore: 100 },
          { id: 'tx-2', driverId: 'driver-B', currentScore: 200 },
        ],
        error: null,
      };

      const result = await fetchTransactions({ isDriver: false });

      expect(result).toHaveLength(2);
    });

    it('isDriver=true 但无 driverIdFilter 时不做 RLS 验证', async () => {
      resolvedValue = {
        data: [{ id: 'tx-1', driverId: 'driver-A', currentScore: 100 }],
        error: null,
      };

      const result = await fetchTransactions({ isDriver: true });

      expect(result).toHaveLength(1);
    });

    it('data 为 null 时返回空数组', async () => {
      resolvedValue = { data: null, error: null };

      const result = await fetchTransactions({ isDriver: false });

      expect(result).toEqual([]);
    });
  });

  describe('RLS 违规检测', () => {
    it('返回数据含其他司机交易时应抛出错误', async () => {
      resolvedValue = {
        data: [
          { id: 'tx-1', driverId: 'driver-A', currentScore: 100 },
          { id: 'tx-2', driverId: 'driver-B', currentScore: 200 },
        ],
        error: null,
      };

      await expect(
        fetchTransactions({ isDriver: true, driverIdFilter: 'driver-A' })
      ).rejects.toThrow('RLS violation');
    });

    it('所有返回数据均属于其他司机时应抛出错误', async () => {
      resolvedValue = {
        data: [
          { id: 'tx-1', driverId: 'driver-B', currentScore: 100 },
          { id: 'tx-2', driverId: 'driver-C', currentScore: 200 },
        ],
        error: null,
      };

      await expect(
        fetchTransactions({ isDriver: true, driverIdFilter: 'driver-A' })
      ).rejects.toThrow('RLS violation');
    });

    it('错误信息应包含违规记录数量', async () => {
      resolvedValue = {
        data: [
          { id: 'tx-1', driverId: 'driver-A', currentScore: 100 },
          { id: 'tx-2', driverId: 'driver-B', currentScore: 200 },
          { id: 'tx-3', driverId: 'driver-C', currentScore: 300 },
        ],
        error: null,
      };

      await expect(
        fetchTransactions({ isDriver: true, driverIdFilter: 'driver-A' })
      ).rejects.toThrow('2');
    });
  });

  describe('错误传播', () => {
    it('Supabase 返回错误时应向上抛出', async () => {
      resolvedValue = { data: null, error: new Error('network error') };

      await expect(fetchTransactions({ isDriver: false })).rejects.toThrow('network error');
    });
  });

  describe('查询参数', () => {
    it('有 driverIdFilter 时应调用 .eq()', async () => {
      resolvedValue = { data: [], error: null };

      await fetchTransactions({ isDriver: true, driverIdFilter: 'driver-A' });

      expect(mockQueryChain.eq).toHaveBeenCalledWith('driverId', 'driver-A');
    });

    it('有 limit 时应调用 .limit()', async () => {
      resolvedValue = { data: [], error: null };

      await fetchTransactions({ isDriver: true, driverIdFilter: 'driver-A', limit: 20 });

      expect(mockQueryChain.limit).toHaveBeenCalledWith(20);
    });

    it('无 driverIdFilter 时不应调用 .eq()', async () => {
      resolvedValue = { data: [], error: null };

      await fetchTransactions({ isDriver: false });

      expect(mockQueryChain.eq).not.toHaveBeenCalled();
    });
  });

  // 回归防护：数据库 transactions 表只有 isAnomaly 列，没有 anomalyFlag 列。
  // 误选/误写 anomalyFlag 会触发 PostgREST 400 (PG 42703 undefined_column)，
  // 导致司机交易历史完全加载失败。anomalyFlag 仅为模型层别名，由 isAnomaly 派生。
  describe('幽灵列 anomalyFlag 防护 (PG 42703)', () => {
    it('SELECT 列表不应包含 anomalyFlag，但应保留真实列 isAnomaly', async () => {
      resolvedValue = { data: [], error: null };

      await fetchTransactions({ isDriver: false });

      const selectArg = mockQueryChain.select.mock.calls[0][0] as string;
      expect(selectArg).not.toContain('anomalyFlag');
      expect(selectArg).toContain('isAnomaly');
    });

    it('upsert 载荷应剔除 anomalyFlag，但保留 isAnomaly', async () => {
      // anomalyFlag 是合法的可选模型字段（isAnomaly 的别名），但 DB 无此列，
      // 必须被 stripDisallowedFields 按白名单剔除，否则 upsert 会 PG 42703。
      await upsertTransaction({
        id: 'tx-1',
        driverId: 'driver-A',
        isAnomaly: true,
        anomalyFlag: true,
      });

      const payload = mockQueryChain.upsert.mock.calls[0][0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('anomalyFlag');
      expect(payload).toHaveProperty('isAnomaly', true);
    });
  });
});
