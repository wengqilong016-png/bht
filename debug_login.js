import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpZGhpY3p0dnBwZGRidmsiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.MkLFBP9GIjY21tfWepQFyaCAC5KHCzUVcYOB43g4s4U'

const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 测试登录功能 ===\n')

// 测试管理员登录
console.log('1. 测试管理员登录...')
const adminEmail = 'wengqilong016@gmail.com'
const adminPassword = '123456'

const { data: adminData, error: adminError } = await supabase.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword
})

if (adminError) {
  console.log('❌ 管理员登录失败:', adminError.message)
  console.log('   错误详情:', adminError)
} else {
  console.log('✅ 管理员登录成功')
  console.log('   用户ID:', adminData.user?.id)
  console.log('   邮箱:', adminData.user?.email)
  console.log('   邮箱确认:', adminData.user?.email_confirmed_at ? '是' : '否')
}

console.log('')

// 测试司机登录
console.log('2. 测试司机登录...')
const driverEmail = 'feilong@bahati.com'
const driverPassword = '123456'

const { data: driverData, error: driverError } = await supabase.auth.signInWithPassword({
  email: driverEmail,
  password: driverPassword
})

if (driverError) {
  console.log('❌ 司机登录失败:', driverError.message)
  console.log('   错误详情:', driverError)
} else {
  console.log('✅ 司机登录成功')
  console.log('   用户ID:', driverData.user?.id)
  console.log('   邮箱:', driverData.user?.email)
  console.log('   邮箱确认:', driverData.user?.email_confirmed_at ? '是' : '否')
}

console.log('\n=== 检查用户状态 ===')

// 检查所有用户
const { data: users } = await supabase.auth.admin.listUsers()
if (users) {
  console.log('\n认证用户列表:')
  users.users.forEach(user => {
    console.log(`- ${user.email}`)
    console.log(`  ID: ${user.id}`)
    console.log(`  邮箱确认: ${user.email_confirmed_at ? '✅' : '❌'}`)
    console.log(`  最后登录: ${user.last_sign_in_at || '从未'}`)
    console.log('')
  })
}

console.log('=== 检查前端配置 ===')
console.log('\n请检查以下几点:')
console.log('1. 前端是否正确加载了 .env.local 文件？')
console.log('2. Supabase URL 和 Anon Key 是否正确？')
console.log('3. 浏览器控制台是否有错误信息？')
console.log('4. 网络连接是否正常？')