import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('stage12c shell renderer boundary', () => {
  const adminRendererPath = path.join(process.cwd(), 'admin', 'renderAdminShellView.tsx');
  const driverRendererPath = path.join(process.cwd(), 'driver', 'renderDriverShellView.tsx');

  it('admin renderer centralizes dashboard-backed and standalone admin views', () => {
    const src = fs.readFileSync(adminRendererPath, 'utf8');
    expect(src).toContain('isDashboardBackedAdminView(view)');
    expect(src).toContain("case 'team'");
    expect(src).toContain("case 'support-cases'");
    expect(src).toContain('export default AdminShellViewRenderer');
  });

  it('driver renderer centralizes collect/settlement/history/requests/status views', () => {
    const src = fs.readFileSync(driverRendererPath, 'utf8');
    expect(src).toContain("case 'collect'");
    expect(src).toContain("case 'settlement'");
    expect(src).toContain("case 'history'");
    expect(src).toContain("case 'requests'");
    expect(src).toContain("case 'status'");
    expect(src).toContain('resolveCurrentDriver');
    expect(src).toContain('export default DriverShellViewRenderer');
  });
});
