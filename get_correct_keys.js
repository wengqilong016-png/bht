import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'

const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 测试不同的API密钥 ===\n')

// 从Supabase获取正确的配置信息
console.log('Supabase项目信息:')
console.log('URL:', url)
console.log('Service Role Key:', serviceRole.substring(0, 50) + '...')

console.log('\n=== 获取用户信息 ===')
const { data: users } = await supabase.auth.admin.listUsers()
if (users && users.users.length > 0) {
  console.log(`找到 ${users.users.length} 个用户`)
  console.log('\n管理员账户:')
  users.users.filter(u => u.email?.includes('admin') || u.email?.includes('wengqilong') || u.email?.includes('673305245')).forEach(u => {
    console.log(`- ${u.email} (ID: ${u.id})`)
  })
  console.log('\n司机账户:')
  users.users.filter(u => u.email?.includes('bahati.com') || u.email?.includes('driver')).forEach(u => {
    console.log(`- ${u.email} (ID: ${u.id})`)
  })
}

console.log('\n=== 需要从 Supabase Dashboard 获取正确的 Anon Key ===')
console.log('请按以下步骤操作:')
console.log('1. 打开 Supabase Dashboard: https://supabase.com/dashboard')
console.log('2. 选择你的项目: yctsiudhicztvppddbvk')
console.log('3. 进入 Settings → API')
console.log('4. 复制 "anon" 或 "public" key')
console.log('5. 确保key格式为: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')

console.log('\n=== 当前配置问题 ===')
console.log('当前的 anon key 可能过期或不正确')
console.log('需要更新 .env.local 文件中的 VITE_SUPABASE_ANON_KEY')