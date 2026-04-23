# UI/UX 优化计划 (Bahati Jackpots)

## 目标
- 提升管理员和司机两端的使用体验与视觉一致性
- 降低低端 Android 设备的渲染卡顿
- 确保可访问性 (WCAG 2.1 AA) 达标
- 使用已有的设计系统 (Tailwind + custom components) 统一风格

## 当前上下文 & 假设
- 项目已采用 TailwindCSS，组件化结构位于 `shared/`、`admin/`、`driver/` 目录。
- 司机端已做懒加载、图片压缩等性能优化。
- UI 主要在 `shared/layout/`、`driver/components/`、`admin/components/` 中实现。
- 项目已有 `README.md` 中的架构说明，可作为审计起点。

## 推荐的优化步骤
1. **用户调研 & 痛点收集**
   - 在本地运行 `npm run dev`，使用真实设备（2 GB RAM Android）记录关键交互的卡顿、可读性问题。
   - 收集司机与管理员的任务路径（如收款、结账审批）并绘制用户流程图。
2. **可访问性审计**
   - 使用 Chrome DevTools → Lighthouse → **Accessibility**，记录低分项。
   - 检查颜色对比、ARIA 标签、键盘焦点顺序、屏幕阅读器提示。
3. **视觉一致性检查**
   - 对比 `shared/layout` 中的全局布局与各页面的局部组件，用 `tailwindcss` 的 **design tokens**（颜色、间距）统一。
   - 更新 `tailwind.config.js`（若缺失）加入自定义颜色变量，确保所有组件使用同一色板。
4. **性能优化点**
   - 确认所有大图使用 `loading="lazy"` 并在 `driver/components/ReadingCapture.tsx` 中使用压缩后尺寸。
   - 在 `shared/layout/ShellMainContent.tsx` 中进一步使用 `will-change` 与 `transform: translateZ(0)` 提升滚动流畅度。
   - 对列表（如机器选择列表）启用 **虚拟滚动**（如 `react-virtualized`）以避免长列表渲染。
5. **交互微调**
   - 为主要按钮加入 **触感反馈**（ `active:scale-95`、`transition`），提升点击感。
   - 在表单输入（如 `ReadingCapture`）加入实时校验提示，避免提交后错误。
6. **国际化 & 文本排版**
   - 检查 `i18n/zh.ts` 与 `i18n/sw.ts` 是否在所有 UI 文案中完整覆盖。
   - 确保字体大小在不同语言下均可阅读（使用 `rem` 而非 `px`）。
7. **测试覆盖**
   - 为关键 UI 交互编写 **Storybook** 示例（如果项目已有 Storybook），并加入视觉回归测试（如 `chromatic`）。
   - 在 Jest 中加入 **Jest-DOM** 断言，验证关键可访问性属性。
8. **文档与规范**
   - 在 `docs/` 新增 `UIUX_GUIDELINES.md`，记录颜色、间距、按钮样式、表单布局等规范。
   - 将设计规范链接到 README 的 “本地开发” 部分，方便新成员遵循。

## 预计修改文件
- `shared/layout/*.tsx`（布局、间距）
- `driver/components/*.tsx`（阅读捕获、机器选择）
- `admin/components/*.tsx`（管理面板）
- `tailwind.config.js`（新增自定义主题 token）
- `i18n/*.ts`（文本补全）
- `scripts/verify.sh`（加入 Storybook 检查）
- 新增 `docs/UIUX_GUIDELINES.md`

## 验证方式
- **Lighthouse**: Accessibility ≥ 90、Performance ≥ 85。
- **手动设备测试**: 在低端 Android 实机上确保滚动流畅、无明显卡顿。
- **单元/视觉回归**: `npm run test:ci` + `npm run storybook:test`（若配置）。
- **代码质量**: `npm run lint`、`npm run typecheck` 均通过。

## 风险 & 注意事项
- 大幅修改布局可能影响已有的 Supabase RLS 权限页面，需要在测试环境完整回归。
- 引入虚拟滚动库会增加 bundle 大小，需在 `npm run build` 后检查体积增幅 < 5 KB。
- 国际化文本更改后需重新生成语言包，避免遗漏键值。

---
*此计划已保存至 `.hermes/plans/2026-04-23_0530-uiux-optimization.md`*