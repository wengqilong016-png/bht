import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 更新用户配置 ===\n')

// 1. 检查 wengqilong016@gmail.com 是否存在
console.log('1. 检查 wengqilong016@gmail.com...')
const { data: existingUser } = await supabase.auth.admin.listUsers()
const wengUser = existingUser.users.find(u => u.email === 'wengqilong016@gmail.com')

let adminUserId

if (wengUser) {
  console.log('✅ 找到现有用户:', wengUser.email)
  adminUserId = wengUser.id

  // 更新现有用户为管理员
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ role: 'admin', display_name: 'Administrator' })
    .eq('auth_user_id', adminUserId)

  if (updateError) {
    console.log('❌ 更新 profile 失败:', updateError.message)
  } else {
    console.log('✅ 已将用户设置为管理员')
  }
} else {
  console.log('⚠️  用户不存在，正在创建...')

  // 创建新的管理员用户
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'wengqilong016@gmail.com',
    password: '123456',
    email_confirm: true,
    user_metadata: { role: 'admin' }
  })

  if (error) {
    console.error('❌ 创建管理员用户失败:', error.message)
  } else {
    console.log('✅ 创建管理员用户成功:', data.user?.email)
    adminUserId = data.user?.id

    // 创建 profile
    const { error: profileError } = await supabase.from('profiles').insert({
      auth_user_id: adminUserId,
      role: 'admin',
      display_name: 'Administrator'
    })

    if (profileError) {
      console.error('❌ 创建 profile 失败:', profileError.message)
    } else {
      console.log('✅ 创建 profile 成功')
    }
  }
}

console.log('\n')

// 2. 将所有司机密码统一为 123456
console.log('2. 统一所有司机密码为 123456...')

const { data: profiles } = await supabase
  .from('profiles')
  .select('auth_user_id, display_name')
  .eq('role', 'driver')

if (!profiles || profiles.length === 0) {
  console.log('⚠️  没有找到司机账户')
} else {
  console.log(`找到 ${profiles.length} 个司机账户，正在更新密码...`)

  for (const profile of profiles) {
    try {
      await supabase.auth.admin.updateUserById(profile.auth_user_id, {
        password: '123456'
      })
      console.log(`✅ ${profile.display_name} (${profile.auth_user_id}) 密码已更新`)
    } catch (error) {
      console.log(`❌ ${profile.display_name} 更新失败:`, error.message)
    }
  }
}

console.log('\n=== 更新完成 ===')
console.log('\n🔑 管理员登录信息:')
console.log('📧 邮箱: wengqilong016@gmail.com')
console.log('🔑 密码: 123456')
console.log('🎭 角色: admin (管理员)')
console.log('\n🚗 所有司机账户密码统一为: 123456')