param(
    [string]$ServiceName = "LocalBackendServer"
)

# 统一控制台编码为 UTF-8，减少中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 卸载之前安装的 Windows 服务（需要管理员权限）
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "请以管理员权限运行此脚本。"
    exit 1
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "服务 '$ServiceName' 未找到。"
    exit 0
}

if ($svc.Status -ne 'Stopped') {
    Write-Host "正在停止服务..."
    try {
        Stop-Service -Name $ServiceName -Force -ErrorAction Stop
        Start-Sleep -Seconds 1
    }
    catch {
        Write-Warning "停止服务失败：$($_.Exception.Message)"
    }
}

Write-Host "删除服务..."
& sc.exe delete $ServiceName
Start-Sleep -Seconds 1
Write-Host "服务已删除（如果没有错误）。"
