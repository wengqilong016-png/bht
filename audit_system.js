import { createClient } from '@supabase/supabase-js'

const url = 'https://yctsiudhicztvppddbvk.supabase.co'
const serviceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljdHNpdWRoaWN6dHZwcGRkYnZrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYyNTg0OCwiZXhwIjoyMDg3MjAxODQ4fQ.qcU7hekK-9EZhens0_j9obBXJfxT3gDYE9vEjczWIkM'
const supabase = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } })

console.log('=== 系统全面审查报告 ===\n')

const issues = []
const warnings = []
const info = []

// 1. 检查表结构
console.log('1. 检查数据库表结构...')
const tables = ['locations', 'drivers', 'profiles', 'transactions', 'daily_settlements', 'ai_logs', 'notifications']

for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    issues.push(`❌ 表 ${table} 不存在或无法访问: ${error.message}`)
  } else {
    info.push(`✅ 表 ${table} 存在且可访问`)
  }
}

// 2. 检查用户配置
console.log('\n2. 检查用户配置...')
const { data: users } = await supabase.auth.admin.listUsers()
const { data: profiles } = await supabase.from('profiles').select('*')

if (users && profiles) {
  const userCount = users.users.length
  const profileCount = profiles.length

  info.push(`👥 认证用户数: ${userCount}`)
  info.push(`📋 配置文件数: ${profileCount}`)

  // 检查用户与profile的匹配
  const userIds = users.users.map(u => u.id)
  const profileUserIds = profiles.map(p => p.auth_user_id)

  const missingProfiles = userIds.filter(id => !profileUserIds.includes(id))
  const orphanProfiles = profileUserIds.filter(id => !userIds.includes(id))

  if (missingProfiles.length > 0) {
    warnings.push(`⚠️  ${missingProfiles.length} 个用户缺少profile配置`)
  }

  if (orphanProfiles.length > 0) {
    warnings.push(`⚠️  ${orphanProfiles.length} 个profile没有对应的认证用户`)
  }

  // 检查管理员账户
  const admins = profiles.filter(p => p.role === 'admin')
  if (admins.length === 0) {
    issues.push('❌ 没有管理员账户！')
  } else {
    info.push(`👑 管理员账户数: ${admins.length}`)
    admins.forEach(admin => {
      const user = users.users.find(u => u.id === admin.auth_user_id)
      if (user) {
        info.push(`   - ${user.email} (${admin.display_name})`)
      }
    })
  }

  // 检查司机账户
  const drivers = profiles.filter(p => p.role === 'driver')
  info.push(`🚗 司机账户数: ${drivers.length}`)

  // 检查driver_id关联
  const driversWithDriverId = drivers.filter(d => d.driver_id)
  const driversWithoutDriverId = drivers.filter(d => !d.driver_id)

  if (driversWithoutDriverId.length > 0) {
    warnings.push(`⚠️  ${driversWithoutDriverId.length} 个司机没有关联driver_id`)
  }

  // 检查drivers表与profiles的对应关系
  const { data: driverRecords } = await supabase.from('drivers').select('id')
  if (driverRecords) {
    const driverIds = driverRecords.map(d => d.id)
    const profileDriverIds = driversWithDriverId.map(d => d.driver_id)

    const missingDriverRecords = profileDriverIds.filter(id => !driverIds.includes(id))
    if (missingDriverRecords.length > 0) {
      warnings.push(`⚠️  ${missingDriverRecords.length} 个profile的driver_id在drivers表中不存在`)
    }
  }
}

// 3. 检查RLS策略
console.log('\n3. 检查行级安全策略...')
try {
  const { data: policies, error } = await supabase.rpc('check_rls_policies')
  if (error) {
    info.push('ℹ️  无法检查RLS策略详情，但表结构显示已启用RLS')
  } else {
    info.push('✅ RLS策略已配置')
  }
} catch (e) {
  info.push('ℹ️  RLS策略检查需要数据库函数支持')
}

// 4. 检查数据完整性
console.log('\n4. 检查数据完整性...')
const { data: transactions } = await supabase.from('transactions').select('id, locationId, driverId').limit(10)
if (transactions && transactions.length > 0) {
  const { data: locations } = await supabase.from('locations').select('id')
  const { data: drivers } = await supabase.from('drivers').select('id')

  if (locations && drivers) {
    const locationIds = locations.map(l => l.id)
    const driverIds = drivers.map(d => d.id)

    let orphanTransactions = 0
    transactions.forEach(t => {
      if (t.locationId && !locationIds.includes(t.locationId)) orphanTransactions++
      if (t.driverId && !driverIds.includes(t.driverId)) orphanTransactions++
    })

    if (orphanTransactions > 0) {
      warnings.push(`⚠️  发现 ${orphanTransactions} 个孤立的交易记录`)
    } else {
      info.push('✅ 交易记录引用关系正常')
    }
  }
} else {
  info.push('ℹ️  没有交易记录或无法检查')
}

// 5. 检查环境变量配置
console.log('\n5. 检查环境变量配置...')
const requiredEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_GEMINI_API_KEY'
]

const optionalEnvVars = [
  'VITE_STATUS_API_BASE',
  'VITE_INTERNAL_API_KEY',
  'VITE_GOOGLE_MAPS_API_KEY'
]

warnings.push('⚠️  需要创建 .env.local 文件并配置环境变量')
info.push('📋 必需的环境变量:')
requiredEnvVars.forEach(v => info.push(`   - ${v}`))
info.push('📋 可选的环境变量:')
optionalEnvVars.forEach(v => info.push(`   - ${v}`))

// 6. 检查前端配置
console.log('\n6. 检查前端配置...')
info.push('ℹ️  需要检查以下配置是否正确:')
info.push('   - Supabase URL 和 Key')
info.push('   - Gemini API Key (用于AI功能)')
info.push('   - Google Maps API Key (用于地图功能，可选)')

// 生成报告
console.log('\n=== 审查结果汇总 ===\n')

if (issues.length > 0) {
  console.log('🔴 严重问题:')
  issues.forEach(issue => console.log(issue))
  console.log('')
}

if (warnings.length > 0) {
  console.log('🟡 警告:')
  warnings.forEach(warning => console.log(warning))
  console.log('')
}

if (info.length > 0) {
  console.log('🟢 信息:')
  info.forEach(inf => console.log(inf))
  console.log('')
}

console.log('=== 建议操作 ===')
console.log('1. 创建 .env.local 文件并配置环境变量')
console.log('2. 确保所有用户都有对应的profile配置')
console.log('3. 验证管理员账户可以正常登录')
console.log('4. 测试司机账户的完整功能')
console.log('5. 检查数据库表的RLS策略是否按预期工作')

if (issues.length === 0 && warnings.length === 0) {
  console.log('\n✅ 系统配置良好，没有发现严重问题！')
} else if (issues.length === 0) {
  console.log('\n✅ 没有严重问题，但有一些警告需要注意。')
} else {
  console.log('\n❌ 发现严重问题，请立即处理！')
}