import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 修复缺失的用户 profile ===\n')

// 获取所有用户和现有profile
const { data: users } = await supabase.auth.admin.listUsers()
const { data: profiles } = await supabase.from('profiles').select('*')

if (!users || !profiles) {
  console.log('❌ 无法获取用户数据')
  process.exit(1)
}

// 找出缺失profile的用户
const userIdsWithProfiles = profiles.map(p => p.auth_user_id)
const usersWithoutProfiles = users.users.filter(u => !userIdsWithProfiles.includes(u.id))

console.log(`找到 ${usersWithoutProfiles.length} 个缺少profile的用户:\n`)

for (const user of usersWithoutProfiles) {
  console.log(`用户: ${user.email} (ID: ${user.id})`)

  // 判断角色 - 根据邮箱或其他信息
  let role = 'driver'
  let displayName = user.email?.split('@')[0] || 'Unknown'
  let driverId = null

  // 检查是否是管理员邮箱
  if (user.email === 'wengqilong016@gmail.com' || user.email === '673305245@qq.com') {
    role = 'admin'
    displayName = 'Administrator'
  } else {
    // 为司机生成driver_id
    const initials = user.email?.substring(0, 2).toUpperCase() || 'DR'
    driverId = `D-${initials}-${Date.now().toString().slice(-4)}`
  }

  // 创建profile
  const { data: newProfile, error: insertError } = await supabase.from('profiles').insert({
    auth_user_id: user.id,
    role: role,
    display_name: displayName,
    driver_id: driverId
  }).select()

  if (insertError) {
    console.log(`  ❌ 创建失败: ${insertError.message}`)
  } else {
    console.log(`  ✅ 创建成功: ${role} - ${displayName}`)
    if (driverId) {
      console.log(`     司机ID: ${driverId}`)
    }
  }
  console.log('')
}

// 检查wengqilong016@gmail.com是否已经设置为管理员
const wengUser = users.users.find(u => u.email === 'wengqilong016@gmail.com')
if (wengUser) {
  const wengProfile = profiles.find(p => p.auth_user_id === wengUser.id)
  if (wengProfile) {
    if (wengProfile.role !== 'admin') {
      console.log('将 wengqilong016@gmail.com 更新为管理员...')
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin', display_name: 'Administrator' })
        .eq('auth_user_id', wengUser.id)

      if (updateError) {
        console.log(`  ❌ 更新失败: ${updateError.message}`)
      } else {
        console.log('  ✅ 已设置为管理员')
      }
    } else {
      console.log('✅ wengqilong016@gmail.com 已经是管理员')
    }
  }
}

console.log('\n=== 验证结果 ===')
const { data: finalProfiles } = await supabase.from('profiles').select('*')
const admins = finalProfiles?.filter(p => p.role === 'admin') || []
const drivers = finalProfiles?.filter(p => p.role === 'driver') || []

console.log(`管理员账户: ${admins.length}`)
admins.forEach(admin => {
  const user = users.users.find(u => u.id === admin.auth_user_id)
  console.log(`  - ${user?.email} (${admin.display_name})`)
})

console.log(`\n司机账户: ${drivers.length}`)
drivers.forEach(driver => {
  const user = users.users.find(u => u.id === driver.auth_user_id)
  console.log(`  - ${user?.email} (${driver.display_name}) - ${driver.driver_id || '无司机ID'}`)
})