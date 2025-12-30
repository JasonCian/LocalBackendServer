param(
  [string]$ServiceName = "LocalBackendServer",
  [int]$StopTimeoutSec = 20,
  [int]$StartTimeoutSec = 20,
  [switch]$ShowStatus
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Warning $msg }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Wait-ServiceStatus {
  param(
    [string]$Name,
    [string]$DesiredStatus,
    [int]$TimeoutSec = 20
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $svc = Get-Service -Name $Name -ErrorAction Stop
      if ($svc.Status -eq $DesiredStatus) { return $true }
    } catch {
      Start-Sleep -Milliseconds 300
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

try {
  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $svc) {
    Write-Err "服务 '$ServiceName' 不存在。请先安装服务后再重试。"
    Write-Host "提示：可执行 ./install-service-nssm.ps1 -ServiceName $ServiceName -DisplayName \"本地轻量级后端自用服务器\"" -ForegroundColor Yellow
    exit 1
  }

  Write-Info "准备重启服务: $ServiceName"

  if ($svc.Status -in @('Running', 'StartPending', 'StopPending')) {
    Write-Info "停止服务..."
    try {
      Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    } catch {
      Write-Warn "Stop-Service 失败，尝试使用 sc.exe stop"
      sc.exe stop $ServiceName | Out-Null
    }
    if (-not (Wait-ServiceStatus -Name $ServiceName -DesiredStatus 'Stopped' -TimeoutSec $StopTimeoutSec)) {
      Write-Err "在 ${StopTimeoutSec}s 内未能停止服务"
      exit 2
    }
    Write-Info "服务已停止"
  } else {
    Write-Info "服务当前未运行（状态：$($svc.Status)）"
  }

  Write-Info "启动服务..."
  try {
    Start-Service -Name $ServiceName -ErrorAction Stop
  } catch {
    Write-Err "启动失败：$($_.Exception.Message)"
    exit 3
  }
  if (-not (Wait-ServiceStatus -Name $ServiceName -DesiredStatus 'Running' -TimeoutSec $StartTimeoutSec)) {
    Write-Err "在 ${StartTimeoutSec}s 内未能启动服务"
    exit 4
  }

  $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  Write-Host "[OK] 服务已重启：$ServiceName（状态：$($svc.Status)）" -ForegroundColor Green

  if ($ShowStatus) {
    Write-Info "服务详细信息："
    $svc | Format-List Name,DisplayName,Status,ServiceType,StartType | Out-String | Write-Host
  }
  exit 0
} catch {
  Write-Err "脚本异常：$($_.Exception.Message)"
  exit 9
}
