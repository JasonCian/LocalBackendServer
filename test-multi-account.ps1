# Telegram 多账号功能测试脚本
# 用于验证新增的多账号管理API

$baseUrl = "http://localhost"

Write-Host "🧪 Telegram 多账号功能测试" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# 1. 获取账号列表
Write-Host "1️⃣ 测试获取账号列表..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/accounts" -Method GET
    if ($response.success) {
        Write-Host "✅ 成功！当前账号数: $($response.accounts.Count)" -ForegroundColor Green
        $response.accounts | ForEach-Object {
            Write-Host "   📱 $($_.name) ($($_.phone)) - 活跃: $($_.active)" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ 失败: $($response.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ 错误: $_" -ForegroundColor Red
}

Write-Host ""

# 2. 添加测试账号
Write-Host "2️⃣ 测试添加新账号..." -ForegroundColor Yellow
$testAccount = @{
    phone = "+8613800138000"
    name = "测试账号"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/accounts" -Method POST -Body $testAccount -ContentType "application/json"
    if ($response.success) {
        $accountId = $response.account.id
        Write-Host "✅ 成功添加账号！ID: $accountId" -ForegroundColor Green
        
        Write-Host ""
        
        # 3. 更新账号名称
        Write-Host "3️⃣ 测试更新账号名称..." -ForegroundColor Yellow
        $updateData = @{ name = "测试账号(已修改)" } | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/accounts/$accountId" -Method PUT -Body $updateData -ContentType "application/json"
        if ($response.success) {
            Write-Host "✅ 成功更新！新名称: $($response.account.name)" -ForegroundColor Green
        }
        
        Write-Host ""
        
        # 4. 创建关联任务
        Write-Host "4️⃣ 测试创建关联任务..." -ForegroundColor Yellow
        $taskData = @{
            accountId = $accountId
            cron = "0 0 12 * * *"
            to = "@test_bot"
            message = "/test"
            enabled = $true
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/tasks" -Method POST -Body $taskData -ContentType "application/json"
        if ($response.success) {
            $taskId = $response.task.id
            Write-Host "✅ 成功创建任务！ID: $taskId" -ForegroundColor Green
            
            Write-Host ""
            
            # 5. 删除测试任务
            Write-Host "5️⃣ 测试删除任务..." -ForegroundColor Yellow
            $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/tasks/$taskId" -Method DELETE
            if ($response.success) {
                Write-Host "✅ 成功删除任务！" -ForegroundColor Green
            }
        }
        
        Write-Host ""
        
        # 6. 删除测试账号
        Write-Host "6️⃣ 测试删除账号..." -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri "$baseUrl/telegram/api/accounts/$accountId" -Method DELETE
        if ($response.success) {
            Write-Host "✅ 成功删除账号！" -ForegroundColor Green
        }
    } else {
        Write-Host "❌ 添加失败: $($response.message)" -ForegroundColor Red
        if ($response.message -like "*已存在*") {
            Write-Host "   💡 提示：测试账号已存在，请先手动删除" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ 错误: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✨ 测试完成！" -ForegroundColor Cyan
Write-Host ""
Write-Host "📖 完整文档: docs/TELEGRAM-MULTI-ACCOUNT.md" -ForegroundColor Gray
Write-Host "🌐 管理界面: $baseUrl/telegram" -ForegroundColor Gray
