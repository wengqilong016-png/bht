import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'

const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 修复管理员账户密码 ===\n')

// 获取管理员用户信息
const { data: users } = await supabase.auth.admin.listUsers()
const adminUsers = users?.users.filter(u =>
  u.email === 'wengqilong016@gmail.com' ||
  u.email === '673305245@qq.com' ||
  u.email === 'admin@bahati.local'
) || []

console.log(`找到 ${adminUsers.length} 个管理员账户:\n`)

for (const admin of adminUsers) {
  console.log(`- ${admin.email} (ID: ${admin.id})`)
  console.log(`  邮箱确认: ${admin.email_confirmed_at ? '✅' : '❌'}`)

  // 重置密码为 123456
  const { error: updateError } = await supabase.auth.admin.updateUserById(admin.id, {
    password: '123456',
    email_confirm: true
  })

  if (updateError) {
    console.log(`  ❌ 密码重置失败: ${updateError.message}`)
  } else {
    console.log(`  ✅ 密码已重置为: 123456`)
  }
  console.log('')
}

// 确保所有管理员都有正确的profile
console.log('=== 检查管理员profile配置 ===')
const { data: profiles } = await supabase.from('profiles').select('*')

if (profiles) {
  const adminProfiles = profiles.filter(p => p.role === 'admin')
  console.log(`当前有 ${adminProfiles.length} 个管理员profile:\n`)

  adminProfiles.forEach(profile => {
    const user = users?.users.find(u => u.id === profile.auth_user_id)
    console.log(`- ${user?.email || profile.auth_user_id} (${profile.display_name})`)
  })
}

console.log('\n=== 测试管理员登录 ===')

// 测试wengqilong016@gmail.com登录
const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
  email: 'wengqilong016@gmail.com',
  password: '123456'
})

if (loginError) {
  console.log('❌ wengqilong016@gmail.com 登录失败:', loginError.message)
} else {
  console.log('✅ wengqilong016@gmail.com 登录成功!')
  console.log(`   用户ID: ${loginData.user?.id}`)
}