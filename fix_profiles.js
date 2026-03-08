import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 为缺失的用户创建 profiles 记录 ===\n')

// 为 feilong@bahati.com 创建 profile
const feilongUserId = '26821f24-d6de-4d22-8615-b24c1ca17ea5'
const feilongResult = await supabase.from('profiles').insert({
  auth_user_id: feilongUserId,
  role: 'driver',
  display_name: '飞龙',
  driver_id: 'D-FEILONG-' + Date.now()
}).select()

if (feilongResult.error) {
  console.error('❌ 创建 feilong@bahati.com 的 profile 失败:', feilongResult.error.message)
} else {
  console.log('✅ 成功创建 feilong@bahati.com 的 profile')
  console.log('   用户ID:', feilongResult.data[0].auth_user_id)
  console.log('   司机ID:', feilongResult.data[0].driver_id)
}

console.log('')

// 为 q@bahati.com 创建 profile
const qUserId = 'd27e6d9c-af44-4e7d-8016-4dc3b35ee5ed'
const qResult = await supabase.from('profiles').insert({
  auth_user_id: qUserId,
  role: 'driver',
  display_name: 'Q',
  driver_id: 'D-Q-' + Date.now()
}).select()

if (qResult.error) {
  console.error('❌ 创建 q@bahati.com 的 profile 失败:', qResult.error.message)
} else {
  console.log('✅ 成功创建 q@bahati.com 的 profile')
  console.log('   用户ID:', qResult.data[0].auth_user_id)
  console.log('   司机ID:', qResult.data[0].driver_id)
}

console.log('\n=== 完成！现在可以登录了 ===')
console.log('管理员账户: admin@bahati.local')
console.log('司机账户: feilong@bahati.com, q@bahati.com')