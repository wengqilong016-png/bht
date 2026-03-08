import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const newKey = 'sb_publishable_st2N9_7j2nRDMBaVLhunvg_IKY2u29X'

const supabase = createClient(url, newKey, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 测试新的 API Key ===\n')
console.log('URL:', url)
console.log('Key:', newKey)
console.log('')

// 测试管理员登录
console.log('1. 测试管理员登录...')
const { data: adminData, error: adminError } = await supabase.auth.signInWithPassword({
  email: 'wengqilong016@gmail.com',
  password: '123456'
})

if (adminError) {
  console.log('❌ 管理员登录失败:', adminError.message)
  console.log('   错误类型:', adminError.name)
  console.log('   状态码:', adminError.status)
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
  console.log('   错误类型:', driverError.name)
  console.log('   状态码:', driverError.status)
} else {
  console.log('✅ 司机登录成功!')
  console.log('   用户ID:', driverData.user?.id)
  console.log('   邮箱:', driverData.user?.email)
}

console.log('\n=== 结论 ===')
if (!adminError && !driverError) {
  console.log('✅ 新的 API Key 可以正常工作!')
  console.log('现在可以启动应用并登录了。')
} else {
  console.log('❌ 新的 API Key 仍然无法正常工作')
  console.log('可能需要获取正确的 Supabase Anon Key')
}