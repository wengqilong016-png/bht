import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

const userIds = [
  '26821f24-d6de-4d22-8615-b24c1ca17ea5', // feilong
  'd27e6d9c-af44-4e7d-8016-4dc3b35ee5ed', // q
  'ba8270b5-8f60-48ef-ab1d-faaf841644a0'  // admin
]

console.log('=== 检查特定用户的完整配置 ===\n')

for (const userId of userIds) {
  console.log(`--- 用户ID: ${userId}`)

  // 获取认证用户信息
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)
  if (authError) {
    console.log('❌ 认证用户查询失败:', authError.message)
  } else if (authUser.user) {
    console.log(`📧 Email: ${authUser.user.email}`)
    console.log(`✅ Email确认: ${authUser.user.email_confirmed_at ? '是' : '否'}`)
    console.log(`📋 元数据:`, authUser.user.user_metadata)
  }

  // 获取 profile 信息
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', userId)
    .single()

  if (profileError) {
    console.log(`❌ Profile 查询失败: ${profileError.message}`)
  } else if (profile) {
    console.log(`🎭 角色: ${profile.role}`)
    console.log(`👤 显示名称: ${profile.display_name}`)
    console.log(`🚗 司机ID: ${profile.driver_id || '无'}`)
  } else {
    console.log('⚠️  没有找到 profile 记录')
  }

  console.log('')
}

console.log('=== 管理员登录信息 ===')
console.log('📧 管理员邮箱: admin@bahati.local')
console.log('🔑 管理员密码: 需要从 Supabase 获取或重置')
console.log('\n=== 司机登录信息 ===')
console.log('📧 feilong@bahati.com - 密码: 123456')
console.log('📧 q@bahati.com - 密码: 123456')