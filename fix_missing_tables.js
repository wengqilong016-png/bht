import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 修复缺失的数据库表 ===\n')

// 创建 notifications 表
console.log('1. 创建 notifications 表...')
const { error: createError } = await supabase.rpc('create_notifications_table')

if (createError) {
  console.log('❌ 创建表失败:', createError.message)
  console.log('尝试使用直接SQL...')

  // 尝试直接执行SQL
  const { error: sqlError } = await supabase.from('notifications').select('*').limit(1)
  if (sqlError && sqlError.message.includes('does not exist')) {
    console.log('⚠️  需要在 Supabase SQL Editor 中手动执行以下SQL:')
    console.log(`
-- 创建 notifications 表
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    type TEXT,
    title TEXT,
    message TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN DEFAULT false,
    "driverId" TEXT,
    "relatedTransactionId" TEXT
);

-- 启用 RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 创建策略
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
    OR "driverId" IS NULL
  );

CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (
    public.get_my_role() = 'admin'
    OR "driverId" = public.get_my_driver_id()
  );

CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (public.get_my_role() = 'admin');
    `)
  }
} else {
  console.log('✅ notifications 表创建成功')
}

console.log('\n=== 检查表状态 ===')
const tables = ['locations', 'drivers', 'profiles', 'transactions', 'daily_settlements', 'ai_logs', 'notifications']

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.log(`❌ ${table}: ${error.message}`)
  } else {
    console.log(`✅ ${table}: 正常`)
  }
}