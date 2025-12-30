# install-service-nssm.ps1
# 使用 NSSM 将 Node.js 应用安装为 Windows 服务（推荐，避免 1053）
# 需要管理员权限运行

param(
    [string]$ServiceName = "LocalBackendServer",
    [string]$DisplayName = "本地轻量级后端自用服务器"
)

# 统一控制台编码为 UTF-8，减少中文乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 检查管理员权限
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "请以管理员权限运行此脚本。右键 PowerShell -> 以管理员身份运行。"
    exit 1
}

# 可靠的脚本目录解析（优先 PSScriptRoot，其次 PSCommandPath，再次 MyInvocation.Path，最后退回当前目录）
$scriptDir = $PSScriptRoot
if (-not $scriptDir -or [string]::IsNullOrWhiteSpace($scriptDir)) {
    if ($PSCommandPath) {
        $scriptDir = Split-Path -Parent $PSCommandPath
    }
    elseif ($MyInvocation -and $MyInvocation.MyCommand -and $MyInvocation.MyCommand.Path) {
        $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    else {
        $scriptDir = (Get-Location).Path
    }
}

$serverJs = Join-Path $scriptDir "server.js"
$nssmDir = Join-Path $scriptDir "nssm"
$nssmExe = Join-Path $nssmDir "nssm.exe"
${null} = New-Item -ItemType Directory -Force -Path (Join-Path $scriptDir "logs")

# 查找 node.exe
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) { $nodePath = $nodeCmd.Source }
if (-not $nodePath) {
    $possible = @("C:\\Program Files\\nodejs\\node.exe", "C:\\Program Files (x86)\\nodejs\\node.exe")
    $nodePath = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $nodePath) {
    Write-Error "找不到 node.exe，请先安装 Node.js，并确保 node 在 PATH 中。"
    exit 2
}

if (-not $serverJs -or -not (Test-Path $serverJs)) {
    Write-Error "无法找到 server.js: $serverJs"
    Write-Host "脚本目录: $scriptDir"
    Write-Host "当前目录: $((Get-Location).Path)"
    Write-Host "请确认 server.js 位于仓库根目录 (与此脚本同级)"
    exit 3
}

# 准备 NSSM
if (-not $nssmExe -or -not (Test-Path $nssmExe)) {
    Write-Host "未找到 nssm.exe，正在下载..."
    $zipUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath = Join-Path $scriptDir "nssm.zip"
    try {
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $scriptDir -Force
        # 选择 64 位版本，如果不存在再选 32 位
        $nssm64 = Get-ChildItem -Path $scriptDir -Recurse -Filter "nssm.exe" | Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
        if (-not $nssm64) { $nssm64 = Get-ChildItem -Path $scriptDir -Recurse -Filter "nssm.exe" | Select-Object -First 1 }
        if (-not $nssm64) { throw "未找到 nssm.exe" }
        New-Item -ItemType Directory -Force -Path $nssmDir | Out-Null
        Copy-Item $nssm64.FullName -Destination $nssmExe -Force
        Remove-Item $zipPath -Force
    }
    catch {
        Write-Error "下载或解压 NSSM 失败: $($_.Exception.Message)"
        exit 4
    }
}

# 如果服务已存在，先提示
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "服务 '$ServiceName' 已存在（状态：$($svc.Status)）。如果需要重新安装，请先运行 uninstall-service.ps1。"
    exit 0
}

Write-Host "使用 NSSM 安装服务 '$ServiceName'..."

# 安装
& $nssmExe install $ServiceName $nodePath $serverJs
if ($LASTEXITCODE -ne 0) {
    Write-Error "nssm install 失败，代码 $LASTEXITCODE"
    exit 5
}

# 设置工作目录与环境
& $nssmExe set $ServiceName AppDirectory $scriptDir
& $nssmExe set $ServiceName AppParameters ""
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppStdout (Join-Path $scriptDir "logs\\service-nssm.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $scriptDir "logs\\service-nssm.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateOnline 1
& $nssmExe set $ServiceName AppRotateSeconds 86400
& $nssmExe set $ServiceName AppRotateBytes 10485760

# 提示：PowerShell 历史监听需要在 config.json 中配置 historyPath
Write-Host "提示: 如需监听 PowerShell 命令历史，请在 config.json 中配置："
Write-Host '  "services": {'
Write-Host '    "powershellHistory": {'
Write-Host '      "historyPath": "C:\\Users\\您的用户名\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt"'
Write-Host '    }'
Write-Host '  }'
Write-Host ""

# 启动
Write-Host "启动服务..."
& $nssmExe start $ServiceName
if ($LASTEXITCODE -ne 0) {
    Write-Warning "启动失败，尝试查看日志或事件查看器"
    exit 6
}

Write-Host "✓ 服务已安装并启动: $ServiceName"
Write-Host "日志: logs\\service-nssm.log"
Write-Host "如需卸载，可运行 ./uninstall-service.ps1 （它会尝试删除同名服务）"
