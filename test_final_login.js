import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MjU4NDgsImV4cCI6MjA4NzIwMTg0OH0.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U'

const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 最终登录测试 ===\n')

// 测试管理员登录
console.log('1. 测试管理员登录...')
const { data: adminData, error: adminError } = await supabase.auth.signInWithPassword({
  email: 'wengqilong016@gmail.com',
  password: '123456'
})

if (adminError) {
  console.log('❌ 管理员登录失败:', adminError.message)
} else {
  console.log('✅ 管理员登录成功!')
  console.log('   用户ID:', adminData.user?.id)
  console.log('   邮箱:', adminData.user?.email)
}

console.log('')

// 测试司机登录
console.log('2. 测试司机登录...')
const { data: driverData, error: driverError } = await supabase.auth.signInWithPassword({
  email: 'feilong@bahati.com',
  password: '123456'
})

if (driverError) {
  console.log('❌ 司机登录失败:', driverError.message)
} else {
  console.log('✅ 司机登录成功!')
  console.log('   用户ID:', driverData.user?.id)
  console.log('   邮箱:', driverData.user?.email)
}

console.log('\n=== 系统状态 ===')
if (!adminError && !driverError) {
  console.log('✅ 所有登录测试通过!')
  console.log('✅ API配置正确')
  console.log('✅ 现在可以启动应用并正常登录了')
} else {
  console.log('❌ 仍有登录问题需要解决')
}