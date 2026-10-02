# 在桌面创建「可视清单」快捷方式
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root '可视清单\可视清单.exe'
if (-not (Test-Path $exe)) { Write-Host "找不到 $exe" -ForegroundColor Red; exit 1 }
$desktop = [Environment]::GetFolderPath('Desktop')
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut((Join-Path $desktop '可视清单.lnk'))
$sc.TargetPath = $exe
$sc.WorkingDirectory = (Join-Path $root '可视清单')
$sc.IconLocation = (Join-Path $root 'build\icon.ico') + ',0'
$sc.Description = '可视清单 · 周视图任务日历'
$sc.Save()
Write-Host '已在桌面创建快捷方式：可视清单' -ForegroundColor Green