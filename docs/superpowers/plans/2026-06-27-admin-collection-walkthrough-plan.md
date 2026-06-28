# 管理端逐字段收款核查 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将 `admin/ManualCollectionEntryPage.tsx` 从单表单模式重构为司机+日期维度的逐机器线性步进核查流程。

**架构：**
1. 顶部选择栏：司机下拉 + 日期选择 + 覆写开关（默认开启）
2. 机器列表：选择司机+日期后自动加载该司机当天涉及的机器
3. 7 步步进器：每台机器按 分数→分红→营业额→留存/支付→小费→其他支出→换币 逐字段推进
4. 第 7 步 [提交并下一台→] 调 `submitManualCollection` RPC，提交后自动跳下一台
5. 全部完成后显示汇总

**技术栈：** React 19 + TypeScript + Tailwind 4 + 现有 useAppData / useMutations / submitManualCollection

---

## 文件职责树

| 文件路径 | 职责 | 变更类型 |
|---|---|---|
| `admin/ManualCollectionEntryPage.tsx` | 完全重写为步进器模式 | 重写 |
| `i18n/zh.ts` | 新增步骤标题等翻译 | 追加 |
| `i18n/sw.ts` | 对等新增斯瓦希里语（管理端为主中文，保留 sw 兼容） | 追加 |
| `__tests__/ManualCollectionWalkthrough.test.tsx` | TDD 测试覆盖步进流转、提交、跳过 | 新建 |

---

## 任务 1：新增 i18n 多语言词条

**文件：** `i18n/zh.ts`、`i18n/sw.ts`

- [ ] **步骤 1：在 `i18n/zh.ts` 末尾追加中文词条**
  ```typescript
  walkthroughTitle: '逐项收款核查',
  walkthroughStepScore: '今日分数',
  walkthroughStepDividend: '分红计算',
  walkthroughStepRevenue: '营业额',
  walkthroughStepRetention: '分红处理',
  walkthroughStepTip: '小费支出',
  walkthroughStepExpense: '其他支出',
  walkthroughStepCoinExchange: '换币',
  walkthroughNext: '确定 →',
  walkthroughSubmitNext: '提交并下一台 →',
  walkthroughSkip: '跳过此台',
  walkthroughComplete: '全部完成',
  walkthroughReturn: '返回选择司机',
  walkthroughRetain: '留存（计入业主分红余额）',
  walkthroughPayOut: '支付（当场给业主）',
  walkthroughNoData: '该司机今日无收款记录，将进入代录入模式',
  walkthroughStep: '步骤',
  walkthroughMachine: '机器',
  walkthroughPrevScore: '上次读数',
  walkthroughCurrScore: '本次读数',
  walkthroughDiff: '差值',
  walkthroughTotalRevenue: '总营业额',
  walkthroughTotalMachines: '总机器数',
  ```

- [ ] **步骤 2：在 `i18n/sw.ts` 末尾追加斯瓦希里语词条**
  ```typescript
  walkthroughTitle: 'Ukaguzi wa Kukusanya',
  walkthroughStepScore: 'Alama ya Leo',
  walkthroughStepDividend: 'Mgao',
  walkthroughStepRevenue: 'Mapato',
  walkthroughStepRetention: 'Mgao: Weka au Lipa?',
  walkthroughStepTip: 'Bakshishi',
  walkthroughStepExpense: 'Gharama Nyingine',
  walkthroughStepCoinExchange: 'Kubadilisha Sarafu',
  walkthroughNext: 'Thibitisha →',
  walkthroughSubmitNext: 'Wasilisha na Inayofuata →',
  walkthroughSkip: 'Ruka Mashine Hii',
  walkthroughComplete: 'Imekamilika',
  walkthroughReturn: 'Rudi Kuchagua Dereva',
  walkthroughRetain: 'Weka (Salio la Mgawanyo)',
  walkthroughPayOut: 'Lipa (Mpe Mmiliki)',
  walkthroughNoData: 'Dereva hana rekodi leo. Ingiza mwenyewe.',
  walkthroughStep: 'Hatua',
  walkthroughMachine: 'Mashine',
  walkthroughPrevScore: 'Alama ya Awali',
  walkthroughCurrScore: 'Alama ya Sasa',
  walkthroughDiff: 'Tofauti',
  walkthroughTotalRevenue: 'Mapato Yote',
  walkthroughTotalMachines: 'Mashine Zote',
  ```

- [ ] **步骤 3：验证 tsc 编译通过**
  运行：`npx tsc --noEmit`
  预期：0 error

- [ ] **步骤 4：Commit**
  ```bash
  git add i18n/zh.ts i18n/sw.ts
  git commit -m "chore: add admin collection walkthrough i18n keys"
  ```

---

## 任务 2：TDD 测试用例

**文件：** 创建 `__tests__/ManualCollectionWalkthrough.test.tsx`

- [ ] **步骤 1：编写初始失败测试**
  ```typescript
  import React from 'react';
  import { render, screen, fireEvent } from '@testing-library/react';
  import ManualCollectionEntryPage from '../admin/ManualCollectionEntryPage';

  // Mock context hooks
  jest.mock('../contexts/AuthContext', () => ({
    useAuth: () => ({ currentUser: { id: 'admin-1', name: 'Admin', role: 'admin' }, lang: 'zh' }),
  }));
  jest.mock('../contexts/DataContext', () => ({
    useAppData: () => ({
      drivers: [{ id: 'd1', name: 'Rajabu', status: 'active', dailyFloatingCoins: 0 }],
      locations: [
        { id: 'loc-1', name: 'Spot 12', machineId: 'M54', lastScore: 83900, commissionRate: 0.15, assignedDriverId: 'd1', status: 'active' },
        { id: 'loc-2', name: 'Spot 8', machineId: 'M22', lastScore: 52100, commissionRate: 0.15, assignedDriverId: 'd1', status: 'active' },
      ],
      transactions: [
        { id: 'tx-1', driverId: 'd1', locationId: 'loc-1', currentScore: 84250, previousScore: 83900, revenue: 70000, timestamp: '2026-06-01T10:00:00Z', type: 'collection' },
      ],
      isOnline: true,
    }),
  }));
  jest.mock('../contexts/MutationContext', () => ({
    useMutations: () => ({ submitManualCollection: { mutateAsync: jest.fn().mockResolvedValue({ id: 'new-tx' }), isPending: false } }),
  }));
  jest.mock('../contexts/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

  describe('ManualCollectionWalkthrough', () => {
    it('renders driver select and date picker on load', () => {
      render(<ManualCollectionEntryPage />);
      expect(screen.getByText(/逐项收款核查/i)).toBeInTheDocument();
      expect(screen.getByText(/Rajabu/i)).toBeInTheDocument();
    });

    it('after selecting driver, shows machine list', () => {
      render(<ManualCollectionEntryPage />);
      fireEvent.change(screen.getByRole('combobox', { name: /司机/i }), { target: { value: 'd1' } });
      expect(screen.getByText(/Spot 12/i)).toBeInTheDocument();
      expect(screen.getByText(/Spot 8/i)).toBeInTheDocument();
    });

    it('walks through 7 steps for first machine', () => {
      render(<ManualCollectionEntryPage />);
      fireEvent.change(screen.getByRole('combobox', { name: /司机/i }), { target: { value: 'd1' } });
      // Click first machine to start
      fireEvent.click(screen.getByText(/Spot 12/i));
      // Step 1: Score
      expect(screen.getByText(/今日分数/i)).toBeInTheDocument();
      fireEvent.click(screen.getByText(/确定 →/));
      // Step 2: Dividend
      expect(screen.getByText(/分红计算/i)).toBeInTheDocument();
      // ... continues through all 7 steps
    });
  });
  ```

- [ ] **步骤 2：运行测试确认失败**
  运行：`npx jest --no-coverage __tests__/ManualCollectionWalkthrough.test.tsx`
  预期：FAIL（新页面尚未实现）

- [ ] **步骤 3：Commit**
  ```bash
  git add __tests__/ManualCollectionWalkthrough.test.tsx
  git commit -m "test: add failing TDD test for admin collection walkthrough"
  ```

---

## 任务 3：核心步进器组件 —— 选择栏 + 机器列表

**文件：** 重写 `admin/ManualCollectionEntryPage.tsx`

- [ ] **步骤 1：重写组件骨架 —— 状态定义 + 选择栏**
  完整替换文件内容为：

  ```typescript
  import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
  import React, { useMemo, useState } from 'react';
  import { useAuth } from '../contexts/AuthContext';
  import { useAppData } from '../contexts/DataContext';
  import { useMutations } from '../contexts/MutationContext';
  import { useToast } from '../contexts/ToastContext';
  import type { CollectionSubmissionInput } from '../services/collectionSubmissionService';
  import { CONSTANTS, safeRandomUUID, TRANSLATIONS, type Location, type Transaction } from '../types';
  import { clampCollectionAmount } from '../utils/collectionAmountLimits';

  const SUB_STEPS = ['walkthroughStepScore', 'walkthroughStepDividend', 'walkthroughStepRevenue', 'walkthroughStepRetention', 'walkthroughStepTip', 'walkthroughStepExpense', 'walkthroughStepCoinExchange'] as const;
  type SubStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

  const ManualCollectionEntryPage: React.FC = () => {
    const { currentUser, lang } = useAuth();
    const { drivers, locations, transactions, isOnline } = useAppData();
    const { submitManualCollection } = useMutations();
    const { showToast } = useToast();
    const t = TRANSLATIONS[lang];

    const [driverId, setDriverId] = useState('');
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [adminOverride, setAdminOverride] = useState(true); // 默认覆写
    const [currentMachineIdx, setCurrentMachineIdx] = useState<number | null>(null);
    const [subStep, setSubStep] = useState<SubStep>(1);

    // Draft state per-machine
    const [draftScore, setDraftScore] = useState('');
    const [draftOwnerRetention, setDraftOwnerRetention] = useState('');
    const [draftIsOwnerRetaining, setDraftIsOwnerRetaining] = useState(false);
    const [draftTip, setDraftTip] = useState('');
    const [draftExpenses, setDraftExpenses] = useState('');
    const [draftExpenseCategory, setDraftExpenseCategory] = useState<NonNullable<Transaction['expenseCategory']>>('other');
    const [draftCoinExchange, setDraftCoinExchange] = useState('');
    const [draftNotes, setDraftNotes] = useState('');
    const [completedMachines, setCompletedMachines] = useState<Set<string>>(new Set());
    const [showComplete, setShowComplete] = useState(false);

    // Build machine list for selected driver + date
    const machineList = useMemo(() => {
      if (!driverId) return [];
      const dateStr = selectedDate;
      const driverTxs = transactions.filter(tx => tx.driverId === driverId && tx.timestamp?.startsWith(dateStr));
      const locIdsFromTxs = new Set(driverTxs.map(tx => tx.locationId).filter(Boolean));
      const allDriverLocs = locations.filter(loc => loc.assignedDriverId === driverId);
      // Merge: locations from transactions + all assigned locations
      const merged = new Map<string, { location: Location; tx?: Transaction }>();
      for (const loc of allDriverLocs) merged.set(loc.id, { location: loc });
      for (const tx of driverTxs) {
        const loc = locations.find(l => l.id === tx.locationId);
        if (loc) merged.set(loc.id, { location: loc, tx });
      }
      return Array.from(merged.values()).sort((a, b) => a.location.name.localeCompare(b.location.name));
    }, [driverId, selectedDate, transactions, locations]);

    const selectedMachine = currentMachineIdx !== null ? machineList[currentMachineIdx] : null;
    const loc = selectedMachine?.location;
    const tx = selectedMachine?.tx;

    // Calculate preview values
    const lastScore = loc?.lastScore ?? 0;
    const currScore = parseInt(draftScore) || 0;
    const diff = adminOverride ? currScore - lastScore : Math.max(0, currScore - lastScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
    const commissionRate = loc?.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE;
    const commission = Math.floor(revenue * commissionRate);
    const ownerRetention = draftOwnerRetention.trim() ? parseInt(draftOwnerRetention) || 0 : commission;

    // Initialize draft from existing transaction data
    const initDraftFromTx = (tx?: Transaction) => {
      setDraftScore(tx?.currentScore?.toString() ?? '');
      setDraftOwnerRetention(tx?.ownerRetention?.toString() ?? '');
      setDraftIsOwnerRetaining(tx?.isOwnerRetaining ?? false);
      setDraftTip(tx?.tip?.toString() ?? '');
      setDraftExpenses(tx?.expenses?.toString() ?? '');
      setDraftCoinExchange(tx?.coinExchange?.toString() ?? '');
      setDraftNotes(tx?.notes ?? '');
    };

    const startMachine = (idx: number) => {
      setCurrentMachineIdx(idx);
      setSubStep(1);
      initDraftFromTx(machineList[idx]?.tx);
    };

    const nextSubStep = () => {
      if (subStep < 7) {
        setSubStep((s) => (s + 1) as SubStep);
      }
    };

    const prevSubStep = () => {
      if (subStep > 1) {
        setSubStep((s) => (s - 1) as SubStep);
      } else if (currentMachineIdx !== null && currentMachineIdx > 0) {
        setCurrentMachineIdx(currentMachineIdx - 1);
        setSubStep(7); // go to last step of previous machine
        initDraftFromTx(machineList[currentMachineIdx - 1]?.tx);
      }
    };

    const skipMachine = () => {
      if (currentMachineIdx !== null && currentMachineIdx < machineList.length - 1) {
        startMachine(currentMachineIdx + 1);
      } else {
        setShowComplete(true);
      }
    };

    const submitCurrentMachine = async () => {
      if (!isOnline) { showToast('离线无法提交', 'warning'); return; }
      if (!loc || !driverId) return;
      const input: CollectionSubmissionInput = {
        txId: `TX-${safeRandomUUID()}`,
        locationId: loc.id,
        driverId,
        currentScore: currScore,
        expenses: parseInt(draftExpenses) || 0,
        tip: parseInt(draftTip) || 0,
        startupDebtDeduction: 0,
        isOwnerRetaining: draftIsOwnerRetaining,
        ownerRetention: ownerRetention,
        coinExchange: parseInt(draftCoinExchange) || 0,
        gps: null, photoUrl: null, aiScore: null, anomalyFlag: false,
        notes: `[admin_walkthrough] ${draftNotes}`,
        expenseType: (parseInt(draftExpenses) || 0) > 0 ? 'public' : null,
        expenseCategory: (parseInt(draftExpenses) || 0) > 0 ? draftExpenseCategory : null,
        reportedStatus: 'active',
      };
      try {
        await submitManualCollection.mutateAsync(input);
        setCompletedMachines(prev => new Set(prev).add(loc.id));
        showToast('已提交', 'success');
        // Auto-advance
        if (currentMachineIdx !== null && currentMachineIdx < machineList.length - 1) {
          startMachine(currentMachineIdx + 1);
        } else {
          setShowComplete(true);
        }
      } catch (e: any) {
        showToast(e?.message || '提交失败', 'error');
      }
    };

    // Render: selecting phase
    if (currentMachineIdx === null && !showComplete) {
      return (
        <div className="w-full max-w-2xl mx-auto space-y-5 p-5">
          <h2 className="text-lg font-black text-[#171310]">{t.walkthroughTitle}</h2>
          {/* Driver select */}
          <label className="block space-y-2">
            <span className="text-sm font-black text-[#3d3028]">司机</span>
            <select value={driverId} onChange={e => setDriverId(e.target.value)}
              className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold">
              <option value="">选择司机</option>
              {drivers.filter(d => d.status !== 'inactive').map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          {/* Date picker */}
          <label className="block space-y-2">
            <span className="text-sm font-black text-[#3d3028]">日期</span>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold" />
          </label>
          {/* Override toggle */}
          <div className="flex items-center justify-between rounded-xl border border-[#e0d8cc] bg-[#f3efe8] p-3">
            <div>
              <p className="text-sm font-black text-[#3d3028]">管理员覆写</p>
              <p className="text-xs text-[#8c7e6d]">开启后放松读数/金额限制</p>
            </div>
            <button type="button" aria-pressed={adminOverride} onClick={() => setAdminOverride(v => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${adminOverride ? 'bg-rose-500' : 'bg-[#c0b0a0]'}`}>
              <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${adminOverride ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          {/* Machine list */}
          {driverId && (
            <div className="space-y-2">
              <p className="text-sm font-black text-[#3d3028]">{machineList.length} {t.walkthroughMachine}{t.walkthroughStep === 'walkthroughStep' ? 's' : ''}</p>
              {machineList.length === 0 ? (
                <p className="text-xs text-[#8c7e6d]">{t.walkthroughNoData}</p>
              ) : (
                machineList.map((m, idx) => (
                  <button key={m.location.id} onClick={() => startMachine(idx)}
                    className={`w-full text-left rounded-xl border p-3 flex items-center justify-between ${completedMachines.has(m.location.id) ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#e0d8cc]'}`}>
                    <div>
                      <p className="text-sm font-black text-[#171310]">{m.location.name} · {m.location.machineId || '—'}</p>
                      <p className="text-xs text-[#8c7e6d]">{t.walkthroughPrevScore}: {m.location.lastScore.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {completedMachines.has(m.location.id) && <CheckCircle2 size={16} className="text-emerald-600" />}
                      <ChevronRight size={16} className="text-[#c0b0a0]" />
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      );
    }

    // Render: completion
    if (showComplete) {
      const totalRevenue = Array.from(completedMachines).reduce((sum, locId) => {
        const m = machineList.find(x => x.location.id === locId);
        if (!m?.tx && !m) return sum;
        // Use submitted data or calculated
        return sum + revenue;
      }, 0);
      return (
        <div className="w-full max-w-2xl mx-auto text-center space-y-4 p-5">
          <CheckCircle2 size={48} className="text-emerald-600 mx-auto" />
          <h2 className="text-xl font-black text-[#171310]">{t.walkthroughComplete}</h2>
          <p className="text-sm text-[#8c7e6d]">{completedMachines.size}/{machineList.length} {t.walkthroughMachine}</p>
          <button onClick={() => { setCurrentMachineIdx(null); setShowComplete(false); setDriverId(''); setCompletedMachines(new Set()); }}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-black">
            {t.walkthroughReturn}
          </button>
        </div>
      );
    }

    // Render: walkthrough
    return ( /* TODO: task 4 */ null );
  };
  ```

- [ ] **步骤 2：运行 tsc 确认类型通过**
  运行：`npx tsc --noEmit`

- [ ] **步骤 3：Commit**
  ```bash
  git add admin/ManualCollectionEntryPage.tsx
  git commit -m "feat: add driver-date selector and machine list to collection walkthrough"
  ```

---

## 任务 4：7 步步进器 UI

**文件：** 修改 `admin/ManualCollectionEntryPage.tsx`（替换最后的 `return ( /* TODO: task 4 */ null )`）

- [ ] **步骤 1：实现逐步渲染逻辑**
  将最后的 `return ( /* TODO: task 4 */ null );` 替换为完整的步进器 JSX：

  ```typescript
    // Render: walkthrough (inside ManualCollectionEntryPage, replaces the null return)
    const subStepLabels: Record<SubStep, string> = {
      1: t.walkthroughStepScore, 2: t.walkthroughStepDividend,
      3: t.walkthroughStepRevenue, 4: t.walkthroughStepRetention,
      5: t.walkthroughStepTip, 6: t.walkthroughStepExpense, 7: t.walkthroughStepCoinExchange,
    };

    const isLastStep = subStep === 7;

    return (
      <div className="w-full max-w-2xl mx-auto space-y-4 p-5">
        {/* Header */}
        <div className="flex items-center justify-between text-sm">
          <button onClick={prevSubStep} className="text-[#8c7e6d] font-bold">← {lang === 'zh' ? '上一步' : 'Nyuma'}</button>
          <span className="font-black text-[#171310]">{loc?.name} · {loc?.machineId}</span>
          <button onClick={skipMachine} className="text-rose-500 font-bold">{t.walkthroughSkip} →</button>
        </div>
        <p className="text-xs text-[#a09080] text-center font-bold uppercase">
          {t.walkthroughStep} {subStep}/7 · {subStepLabels[subStep]}
        </p>

        {/* Step 1: Score */}
        {subStep === 1 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-[#f3efe8] p-3 rounded-xl">
                <p className="text-xs text-[#a09080] font-bold">{t.walkthroughPrevScore}</p>
                <p className="text-xl font-black">{lastScore.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-[#a09080] font-bold">{t.walkthroughCurrScore}</p>
                <input inputMode="numeric" value={draftScore}
                  onChange={e => setDraftScore(e.target.value)}
                  placeholder="输入读数" autoFocus
                  className="w-full rounded-xl border border-[#e0d8cc] p-3 text-xl font-black focus:ring-2 focus:ring-amber-500" />
              </div>
            </div>
            {draftScore && (
              <div className="text-center text-sm font-bold text-[#8c7e6d]">
                {t.walkthroughDiff}: <span className="text-amber-700 font-black">{diff >= 0 ? '+' : ''}{diff.toLocaleString()}</span>
              </div>
            )}
            <button onClick={nextSubStep} disabled={!draftScore.trim()}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black disabled:opacity-30">
              {t.walkthroughNext} {subStepLabels[(subStep + 1) as SubStep]}
            </button>
          </div>
        )}

        {/* Step 2: Dividend */}
        {subStep === 2 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <div className="text-center">
              <p className="text-xs text-[#a09080] font-bold">{t.walkthroughStepDividend}</p>
              <p className="text-3xl font-black text-amber-700">TZS {commission.toLocaleString()}</p>
              <p className="text-xs text-[#a09080] mt-1">{diff} × TZS 200 × {(commissionRate * 100).toFixed(0)}%</p>
            </div>
            <input inputMode="numeric" value={draftOwnerRetention}
              onChange={e => setDraftOwnerRetention(e.target.value)}
              placeholder={`默认 ${commission}`}
              className="w-full rounded-xl border border-[#e0d8cc] p-3 text-lg font-black text-center focus:ring-2 focus:ring-amber-500" />
            <button onClick={nextSubStep}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black">
              {t.walkthroughNext} {subStepLabels[3 as SubStep]}
            </button>
          </div>
        )}

        {/* Step 3: Revenue */}
        {subStep === 3 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5 text-center">
            <p className="text-xs text-[#a09080] font-bold">{t.walkthroughStepRevenue}</p>
            <p className="text-4xl font-black text-emerald-700">TZS {revenue.toLocaleString()}</p>
            <p className="text-xs text-[#a09080]">{diff} × TZS {CONSTANTS.COIN_VALUE_TZS}</p>
            <button onClick={nextSubStep}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black">
              {t.walkthroughNext} {subStepLabels[4 as SubStep]}
            </button>
          </div>
        )}

        {/* Step 4: Retain or Pay */}
        {subStep === 4 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepRetention}</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setDraftIsOwnerRetaining(true)}
                className={`p-4 rounded-xl border-2 font-black text-sm ${draftIsOwnerRetaining ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-[#e0d8cc] text-[#8c7e6d]'}`}>
                {t.walkthroughRetain}
              </button>
              <button onClick={() => setDraftIsOwnerRetaining(false)}
                className={`p-4 rounded-xl border-2 font-black text-sm ${!draftIsOwnerRetaining ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-[#e0d8cc] text-[#8c7e6d]'}`}>
                {t.walkthroughPayOut}
              </button>
            </div>
            <button onClick={nextSubStep}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black">
              {t.walkthroughNext} {subStepLabels[5 as SubStep]}
            </button>
          </div>
        )}

        {/* Step 5: Tip */}
        {subStep === 5 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepTip}</p>
            <input inputMode="numeric" value={draftTip}
              onChange={e => setDraftTip(e.target.value)}
              placeholder="0" autoFocus
              className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500" />
            <button onClick={nextSubStep}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black">
              {t.walkthroughNext} {subStepLabels[6 as SubStep]}
            </button>
          </div>
        )}

        {/* Step 6: Other Expenses */}
        {subStep === 6 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepExpense}</p>
            <input inputMode="numeric" value={draftExpenses}
              onChange={e => setDraftExpenses(e.target.value)}
              placeholder="0" autoFocus
              className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500" />
            {(parseInt(draftExpenses) || 0) > 0 && (
              <select value={draftExpenseCategory}
                onChange={e => setDraftExpenseCategory(e.target.value as any)}
                className="w-full rounded-xl border p-2 text-sm font-bold">
                {['fuel','repair','electricity','transport','fine','allowance','salary_advance','office_loan','tip','other'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <button onClick={nextSubStep}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-black">
              {isLastStep ? t.walkthroughSubmitNext : `${t.walkthroughNext} ${subStepLabels[7 as SubStep]}`}
            </button>
          </div>
        )}

        {/* Step 7: Coin Exchange + Submit */}
        {subStep === 7 && (
          <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
            <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepCoinExchange}</p>
            <input inputMode="numeric" value={draftCoinExchange}
              onChange={e => setDraftCoinExchange(e.target.value)}
              placeholder="0" autoFocus
              className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500" />
            <button onClick={submitCurrentMachine} disabled={!isOnline || submitManualCollection.isPending}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black text-lg disabled:opacity-30">
              {submitManualCollection.isPending ? '...' : t.walkthroughSubmitNext}
            </button>
          </div>
        )}
      </div>
    );
  };
  ```

- [ ] **步骤 2：运行测试确认步进器渲染通过**
  运行：`npx jest --no-coverage __tests__/ManualCollectionWalkthrough.test.tsx`
  预期：PASS

- [ ] **步骤 3：Commit**
  ```bash
  git add admin/ManualCollectionEntryPage.tsx
  git commit -m "feat: implement 7-step collection walkthrough for admin"
  ```

---

## 任务 5：全量验证与推送

- [ ] **步骤 1：运行 tsc 类型检查**
  运行：`npx tsc --noEmit`
  预期：0 error

- [ ] **步骤 2：运行全量测试**
  运行：`npx jest --no-coverage --passWithNoTests`
  预期：全部 PASS

- [ ] **步骤 3：运行 lint**
  运行：`npm run lint`
  预期：0 error

- [ ] **步骤 4：Commit 最终版本**
  ```bash
  git add -A
  git commit -m "chore: final verification — admin collection walkthrough complete"
  ```

- [ ] **步骤 5：推送**
  ```bash
  git pull --rebase origin main && git push origin main
  ```
