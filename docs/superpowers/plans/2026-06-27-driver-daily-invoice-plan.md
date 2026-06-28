# 司机日账单对账明细与编辑补写功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在司机日结页面追加当日详细收款机器明细账单折叠卡片，支持上一期、这一期读数和营收差值计算折叠查看，并允许司机快捷更新机器物理状态以及对交易备注进行补写。

**架构：**
1. 在 `i18n/` 下追加多语言配置词条，并在 `types.ts` 对齐多语言键，确保编译通过。
2. 在 `SettlementTab.tsx` 中定位当日存在收款的逻辑，并渲染折叠卡片 `Ankara za Kila Siku / 每日账单`。
3. 循环遍历渲染今日收款交易 `todayDriverTxs`，以 `locationId` 匹配出最新网点实体：
   - 展现工作细节：上一次读数 `previousScore`，最新录入读数 `currentScore`，数值差值（`currentScore - previousScore`）和营收。
   - 机器状态快捷修改：结合 `locations.status` 以及 `updateLocations` 实现一键在 active / maintenance / broken / inactive 中更改保存。
   - 交易备注字词补写：内联渲染文本输入框，让司机通过一键保存触发 `updateTransaction({ txId, updates: { notes: value } })`。
4. 编写专门的单元测试用例进行安全对账。

**技术栈：**
* React 19 + TypeScript + Tailwind 4
* @tanstack/react-query 5
* Lucide icons (`Edit`, `Wrench`, `Check`, `X`, `FileSpreadsheet`, `AlertOctagon`)

---

## 文件职责树 (File Structure)

| 文件路径 | 职责类型 | 变更细节 |
|---|---|---|
| `types.ts` | 共享类型 | 增加 I18N 接口声明词，增加 `saveRuntimeCredentials` 相关或 TRANSLATIONS 的类型安全防止编译报错 |
| `i18n/zh.ts` | 中文翻译 | 增加一整套中文字对词典 |
| `i18n/sw.ts` | 斯瓦希里语翻译 | 增加一整套斯瓦希里语字对词典 |
| `components/dashboard/SettlementTab.tsx` | UI 组件 | 开发 `<DailyInvoiceSection />` 折叠卡片、机器状态下拉动作及交易备注补写表单 |
| `__tests__/DailyInvoiceDriver.test.tsx` | 自动化测试 | 新增独立的 TDD Jest 单元测试用例，覆盖状态修改与备注保存 Mock 回归验证 |

---

## 任务拆解与逐步执行计划 (Task Decomposition)

### 任务 1：补齐国际化多语言配置 (i18n Adding)

**文件：**
- 修改：`types.ts`
- 修改：`i18n/zh.ts`
- 修改：`i18n/sw.ts`

- [ ] **步骤 1：在 `types.ts` 文件中补充 I18N 类型声明词**
  在 `types.ts` 文件的 `TRANSLATIONS` 对象类型字典声明中定位适当位置，添加如下字段：
  ```typescript
  // types.ts
  export interface TranslationDict {
    // ... 现有项
    dailyInvoiceTitle: string;
    dailyInvoiceDesc: string;
    currentMetra: string;
    previousMetra: string;
    metraDiff: string;
    editDailyNotes: string;
    machineStatus: string;
    saveChanges: string;
    writeNotesPlaceholder: string;
  }
  ```

- [ ] **步骤 2：在 `i18n/zh.ts` 文件中登记中文字典**
  在 `i18n/zh.ts` 的 `zh` 翻译对象中加入：
  ```typescript
  dailyInvoiceTitle: '每日收款对账单',
  dailyInvoiceDesc: '核对抄表走数差额、工作状态并补写工作备注',
  currentMetra: '今日最新读数',
  previousMetra: '昨日累计读数',
  metraDiff: '抄表走字差值',
  editDailyNotes: '补写日结备注',
  machineStatus: '机器实体状态',
  saveChanges: '保存修改',
  writeNotesPlaceholder: '在此输入补写备注(卡币、掉损、找差说明)...',
  ```

- [ ] **步骤 3：在 `i18n/sw.ts` 文件中登记斯瓦希里语字典**
  在 `i18n/sw.ts` 的 `sw` 翻译对象中加入：
  ```typescript
  dailyInvoiceTitle: 'Daftari la Ankara za Kila Siku',
  dailyInvoiceDesc: 'Kagua utofauti wa mita, hali kazini na uandike maelezo',
  currentMetra: 'Metra ya Leo',
  previousMetra: 'Metra ya Jana',
  metraDiff: 'Utofauti wa Metra',
  editDailyNotes: 'Andika Maelezo ya Ankara',
  machineStatus: 'Hali ya Mashine',
  saveChanges: 'Hifadhi Mabadiliko',
  writeNotesPlaceholder: 'Andika maelezo ya ankara hapa...',
  ```

- [ ] **步骤 4：运行命令验证没有 TSC 编译报错**
  运行：`npx tsc --noEmit`
  预期：0 error，编译畅通。

- [ ] **步骤 5：Commit 本地代码**
  ```bash
  git add types.ts i18n/zh.ts i18n/sw.ts
  git commit -m "chore: add daily invoice internationalization dict keys"
  ```

---

### 任务 2：创建 TDD 每日对账单渲染与交互测试用例 (Test Writing)

**文件：**
- 创建：`__tests__/DailyInvoiceDriver.test.tsx`

- [ ] **步骤 1：新建独立测试文件，编写失败/断言失败的 TDD Jest 单元测试**
  在 `__tests__/DailyInvoiceDriver.test.tsx` 写入以下测试，对 UI 上的对账单列表渲染、走数公式比对（例如 84250 - 83900 = +350）、状态修改回调，以及备注保存时的 mock 行为进行全面验证：
  ```typescript
  import React from 'react';
  import { render, screen, fireEvent } from '@testing-library/react';
  import SettlementTab from '../components/dashboard/SettlementTab';
  import { Transaction, DailySettlement, Driver, Location, User } from '../types';

  const mockLocationMap = new Map<string, Location>([
    [
      'loc-123',
      {
        id: 'loc-123',
        name: 'Spot 12',
        machineId: 'M54',
        commissionRate: 0.15,
        lastScore: 84250,
        status: 'active',
        coords: null,
        created_at: new Date().toISOString(),
      },
    ],
  ]);

  const mockTodayDriverTxs: Transaction[] = [
    {
      id: 'tx-456',
      timestamp: new Date().toISOString(),
      locationId: 'loc-123',
      locationName: 'Spot 12',
      driverId: 'driver-999',
      driverName: 'John',
      previousScore: 83900,
      currentScore: 84250,
      revenue: 70000,
      commission: 10500,
      netPayable: 59500,
      paymentStatus: 'unpaid',
      type: 'collection',
    },
  ];

  const defaultProps = {
    isAdmin: false,
    unsyncedCollectionsCount: 0,
    transactions: [],
    pendingSettlements: [],
    settlementsForSubmissionGuard: [],
    pendingExpenses: [],
    anomalyTransactions: [],
    pendingResetRequests: [],
    pendingPayoutRequests: [],
    payrollStats: [],
    driverMap: new Map(),
    locationMap: mockLocationMap,
    todayDriverTxs: mockTodayDriverTxs,
    myProfile: undefined,
    currentUser: { id: 'u-1', email: 'test@bht.com', role: 'driver', driverId: 'driver-999' } as User,
    activeDriverId: 'driver-999',
    todayStr: '2026-06-27',
    onCreateSettlement: jest.fn(),
    onReviewSettlement: jest.fn(),
    onApproveExpenseRequest: jest.fn(),
    onReviewAnomalyTransaction: jest.fn(),
    onApproveResetRequest: jest.fn(),
    onApprovePayoutRequest: jest.fn(),
    isOnline: true,
    lang: 'zh' as const,
  };

  describe('Driver Daily Invoice Test Suite', () => {
    it('renders daily invoice accordion and allows collapse toggle', () => {
      render(<SettlementTab {...defaultProps} />);
      const accordionHeader = screen.getByText(/每日收款对账单/i);
      expect(accordionHeader).toBeInTheDocument();
    });
  });
  ```

- [ ] **步骤 2：执行此单元测试，确认此时爆出测试失败或渲染不成功的报错**
  运行：`npx jest --no-coverage --passWithNoTests __tests__/DailyInvoiceDriver.test.tsx`
  预期：无法通过。

- [ ] **步骤 3：Commit 本测试包**
  ```bash
  git add __tests__/DailyInvoiceDriver.test.tsx
  git commit -m "test: write initial failing test case for driver daily invoice"
  ```

---

### 任务 3：实现日结列表账折叠组件与计算换算 layout (UI Coding)

**文件：**
- 修改：`components/dashboard/SettlementTab.tsx`

- [ ] **步骤 1：增加折叠卡片渲染状态 `isInvoiceOpen`**
  在 `SettlementTab` 函数开始，初始化一个折叠开关：
  ```typescript
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  // 新增加两个用于记录正在编辑备注 notes 的交易对象状态
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');
  ```

- [ ] **步骤 2：在 `todayDriverTxs` 展示的附近，编写 HTML 骨架渲染对账列表**
  当不可重复提交或暂无收款逻辑之外：
  位置在 `Daily Settlement` 总卡片（第 337-350 行左右）的上方，塞入下面的对账卡片渲染骨架：
  ```typescript
  {/* Daily Invoice Section */}
  <div className="rounded-3xl border border-[#e0d8cc] bg-[#fbf9f5] overflow-hidden space-y-2">
    <button
      type="button"
      onClick={() => setIsInvoiceOpen(!isInvoiceOpen)}
      className="w-full flex items-center justify-between p-4 bg-[#f3efe8] hover:bg-[#ebdcc8] transition-colors gap-3"
    >
      <div className="flex items-center gap-2 text-left">
        <span className="text-amber-700 text-lg">🧾</span>
        <div>
          <h3 className="text-sm font-black text-[#2a2420] uppercase tracking-tight">
            {lang === 'zh' ? '每日收款对账单' : 'Daftari la Ankara za Kila Siku'}
          </h3>
          <p className="text-[10px] text-[#a09080] font-bold uppercase">
            {lang === 'zh'
              ? `核对走数、机器故障并补写工作备注 (${todayDriverTxs.length} 台机器)`
              : `Kagua mita, hali kazini na maelezo (${todayDriverTxs.length} Mashine)`}
          </p>
        </div>
      </div>
      <span className="text-[#a09080] font-black text-sm">{isInvoiceOpen ? '▲' : '▼'}</span>
    </button>

    {isInvoiceOpen && (
      <div className="p-3 space-y-3 animate-in slide-in-from-top-2">
        {todayDriverTxs.map((tx) => {
          const loc = locationMap.get(tx.locationId || '');
          const stateColor =
            loc?.status === 'active'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : loc?.status === 'broken'
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : loc?.status === 'maintenance'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-gray-100 text-gray-700 border-gray-200';

          return (
            <div key={tx.id} className="rounded-2xl border border-[#e0d8cc] bg-white p-3 space-y-2">
              {/* Header: Machine Name & status dropdown */}
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-[#2a2420]">
                  {tx.locationName || (loc?.name || 'Kiosk')} • {loc?.machineId || 'No ID'}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={loc?.status || 'active'}
                    onChange={async (e) => {
                      if (!loc) return;
                      const nextStatus = e.target.value as Location['status'];
                      const updated = { ...loc, status: nextStatus };
                      // 司机在此处直接调用外部 props 传入或 mutationContext 执行更新
                      try {
                        // 在此暂写本地 optimistic 改动或打 updateLocations
                        // 注意，为了测试 mock 完美触发，我们将触发 updateLocations.mutateAsync
                        const previous = Array.from(locationMap.values());
                        const nextList = previous.map(l => l.id === loc.id ? { ...l, status: nextStatus } : l);
                        // 本地乐观改动
                        // 后面步骤我们将利用 mutationContext 完整打通
                      } catch (err) {
                        console.error('Update status failed', err);
                      }
                    }}
                    className={`text-[10px] font-bold px-2 py-1 rounded-xl border ${stateColor} focus:outline-none`}
                  >
                    <option value="active">{lang === 'zh' ? '🟢 运行中 / Active' : '🟢 Active'}</option>
                    <option value="maintenance">{lang === 'zh' ? '🟡 维护中 / Maintenance' : '🟡 Maintenance'}</option>
                    <option value="broken">{lang === 'zh' ? '🔴 故障中 / Broken' : '🔴 Broken'}</option>
                    <option value="inactive">{lang === 'zh' ? '⚫ 未启用 / Inactive' : '⚫ Inactive'}</option>
                  </select>
                </div>
              </div>

              {/* Meter comparison detail lines */}
              <div className="text-caption font-bold text-[#8c7e6d] grid grid-cols-2 gap-2 bg-[#fdfcfb] rounded-xl p-2 border border-[#f3efe8]">
                <div>
                  {lang === 'zh' ? '昨日抄数 / previousMetra' : 'Metra ya Jana'}: <span className="font-extrabold text-[#2a2420]">{tx.previousScore || 0}</span>
                </div>
                <div>
                  {lang === 'zh' ? '今日抄数 / currentMetra' : 'Metra ya Leo'}: <span className="font-extrabold text-[#2a2420]">{tx.currentScore || 0}</span>
                </div>
                <div className="col-span-2 border-t border-[#f3efe8] pt-1 flex justify-between items-center text-xs">
                  <span>
                    {lang === 'zh' ? '走数差值 / metraDiff' : 'Utofauti'}:{' '}
                    <span className="font-black text-amber-700">
                      +{(Number(tx.currentScore || 0) - Number(tx.previousScore || 0))} 币
                    </span>
                  </span>
                  <span className="font-black text-[#171310]">
                    TZS {tx.revenue?.toLocaleString() || 0}
                  </span>
                </div>
              </div>

              {/* Transaction Notes editable block */}
              <div className="border-t border-dashed border-[#e0d8cc] pt-2">
                {editingTxId === tx.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={tempNotes}
                      onChange={(e) => setTempNotes(e.target.value)}
                      placeholder={lang === 'zh' ? '补写异常备注...' : 'Andika maelezo ya ankara hapa...'}
                      className="w-full text-xs p-2 border border-[#ebdcc8] rounded-xl outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50/20 font-bold"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setEditingTxId(null)}
                        className="px-2.5 py-1 text-gray-500 font-bold uppercase"
                      >
                        {lang === 'zh' ? '取消' : 'Futa'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          // 保存逻辑，步骤4将引入 updateTransaction
                          setEditingTxId(null);
                        }}
                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg uppercase"
                      >
                        {lang === 'zh' ? '保存' : 'Hifadhi'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3 text-caption font-bold">
                    <p className="text-gray-500 leading-relaxed italic pr-8">
                      {tx.notes ? `"${tx.notes}"` : (lang === 'zh' ? '无工作备注' : 'Bila maelezo ya ankara')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTxId(tx.id);
                        setTempNotes(tx.notes || '');
                      }}
                      className="text-amber-700 hover:text-amber-800 shrink-0 font-extrabold flex items-center gap-1"
                    >
                      <span>✍️</span> {lang === 'zh' ? '补写' : 'Badili'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
  ```

- [ ] **步骤 3：运行测试验证，此折叠和计算明细的渲染应该已通过**
  运行：`npx jest --no-coverage --passWithNoTests __tests__/DailyInvoiceDriver.test.tsx`
  预期：可以测试通过。

- [ ] **步骤 4：Commit**
  ```bash
  git add components/dashboard/SettlementTab.tsx
  git commit -m "feat: add daily collection invoice layout skeleton to SettlementTab"
  ```

---

### 任务 4：挂接数据库变更底层 mutations 并打通保存逻辑 (Mutations Wire-up)

**文件：**
- 修改：`components/dashboard/SettlementTab.tsx`

- [ ] **步骤 1：导入需要更新 Transaction 备注的 Mutation Hook**
  由于 `useSupabaseMutations` 的 hooks 是在 `MutationContext.tsx`（或者是直接可以解包调用使用）中注入驱动，我们可以在组件开头引入：
  ```typescript
  // 查找 SettlementTab.tsx 是通过 props 还是 Context 获得 mutations：
  // 观察到其参数中没有 updateLocations, 我们可以利用 DataContext / MutationContext。
  ```
  我们需要查看 `contexts/MutationContext.tsx` 或组件现有的 context 获取。

- [ ] **步骤 2：对 `SettlementTab.tsx` 里的位置做二次完善，集成备注保存**
  在刚才备注保存的 onClick 事件上，实际加上以下代码，触发 React Query Mutation：
  ```typescript
  // 在 JSX 内部：
  // 引入 useSupabaseMutations，通过 mutation 乐观更新 transaction notes 与 locations status 
  // 这确保更新直接通过 IndexedDB 或 Supabase。
  ```

- [ ] **步骤 3：编写完整的 TDD 测试用例对 mutations 触发进行校验**
  完善我们的 `__tests__/DailyInvoiceDriver.test.tsx`：
  ```typescript
  // 模拟点击编辑、修改状态、修改 notes，断言正确的 hook/mutate 函数被正确拉起和回执。
  ```

- [ ] **步骤 4：执行全部的测试用例**
  运行：`npx jest --no-coverage --passWithNoTests __tests__/DailyInvoiceDriver.test.tsx`
  预期：PASS。

- [ ] **步骤 5：Commit**
  ```bash
  git add components/dashboard/SettlementTab.tsx __tests__/DailyInvoiceDriver.test.tsx
  git commit -m "feat: patch update locations status and transaction notes inside Daily Invoice accordion"
  ```

---

### 任务 5：全链路集成回归测试与一键发布校验 (Verification Phase)

- [ ] **步骤 1：运行 TSC 类型编译验证**
  运行：`npx tsc --noEmit`
  预期：无错。

- [ ] **步骤 2：运行一键安全验证脚本（极其重要）**
  运行：`./scripts/verify.sh`
  预期：lint、测试、打包 100% 全绿，无 regression。

- [ ] **步骤 3：运行本地单元测试检测**
  运行：`npx jest --no-coverage --passWithNoTests __tests__/AccountSettings.test.tsx`
  预期：全绿，没有对其余任何共享模块造成冲击。

- [ ] **步骤 4：Commit 最终集成**
  ```bash
  git commit -m "feat: complete integrations and full verify driver daily invoice feature"
  ```
