import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 检查用户配置 ===')

// 1. 查看所有用户
console.log('\n1. 获取所有认证用户:')
const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
if (usersError) {
  console.error('获取用户失败:', usersError.message)
} else {
  users.users.forEach(user => {
    console.log(`  Email: ${user.email}`)
    console.log(`  ID: ${user.id}`)
    console.log(`  Email确认: ${user.email_confirmed_at ? '是' : '否'}`)
    console.log(`  用户元数据:`, user.user_metadata)
    console.log('')
  })
}

// 2. 查看所有配置文件
console.log('\n2. 获取所有配置文件 (profiles):')
const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*')
if (profilesError) {
  console.error('获取配置文件失败:', profilesError.message)
} else {
  profiles.forEach(profile => {
    console.log(`  Auth用户ID: ${profile.auth_user_id}`)
    console.log(`  角色: ${profile.role}`)
    console.log(`  显示名称: ${profile.display_name}`)
    console.log(`  司机ID: ${profile.driver_id}`)
    console.log('')
  })
}

// 3. 检查是否有管理员
console.log('\n3. 检查管理员账户:')
const { data: admins, error: adminsError } = await supabase.from('profiles').select('*').eq('role', 'admin')
if (adminsError) {
  console.error('查询管理员失败:', adminsError.message)
} else {
  if (admins.length === 0) {
    console.log('  ⚠️  没有找到管理员账户！')
    console.log('  需要创建管理员账户才能登录管理界面。')
  } else {
    console.log(`  找到 ${admins.length} 个管理员账户:`)
    admins.forEach(admin => {
      console.log(`    - Auth用户ID: ${admin.auth_user_id}`)
      console.log(`    - 显示名称: ${admin.display_name}`)
    })
  }
}