# 生成可以发给别人的「可视清单」分享包（只含软件本体，不含任何个人数据）
# 用法：pwsh -File dev\make-share.ps1            → 可视清单-分享版.zip
#       pwsh -File dev\make-share.ps1 -Out 可视清单.zip
param([string]$Out = '可视清单-分享版.zip')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root '可视清单'
$out = Join-Path $root $Out

if (-not (Test-Path -LiteralPath (Join-Path $src '可视清单.exe'))) {
  throw "找不到 $src\可视清单.exe，请先运行 node dev\build-portable.js"
}

# 需要排除的个人数据 / 使用痕迹
$skip = @(
  (Join-Path $src 'data'),
  (Join-Path $src 'resources\app\data')
)
function Test-Skipped([string]$full) {
  foreach ($s in $skip) {
    if ($full.StartsWith($s, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return $false
}

$files = Get-ChildItem -LiteralPath $src -Recurse -File -Force | Where-Object { -not (Test-Skipped $_.FullName) }

$tmp = $out + '.building'
if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }

$zip = [System.IO.Compression.ZipFile]::Open($tmp, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length + 1).Replace('\', '/')
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, '可视清单/' + $rel, [System.IO.Compression.CompressionLevel]::Optimal)
  }

  $guide = @"
「可视清单」使用说明

1. 免安装：双击 可视清单.exe 就能打开，不联网、不需要装任何东西。
2. 想放桌面：右键 可视清单.exe →「发送到」→「桌面快捷方式」。
3. 用法：在右边日历的空白处按住拖动 → 松手弹出小窗新建任务；
   单击空白不弹窗（防误触），按 N 也能新建任务。
4. 左侧「死亡线」用来放高考、deadline 这类重要的截止日，
   只显示剩余天数和标题，越近越红；点 + 添加，点条目可编辑/删除。
5. 你的数据保存在本文件夹里的 data 目录（纯文本，随时可备份）。
   换电脑时，把整个文件夹拷过去即可。
6. 快捷键：T 回到今天 · ←/→ 翻页 · N 新建任务 · / 搜索 · Ctrl+Z 撤销。
"@
  $entry = $zip.CreateEntry('可视清单/使用说明.txt')
  $stream = $entry.Open()
  $writer = New-Object System.IO.StreamWriter($stream, (New-Object System.Text.UTF8Encoding($true)))
  $writer.Write($guide)
  $writer.Dispose()
} finally {
  $zip.Dispose()
}

try {
  [System.IO.File]::Move($tmp, $out, $true)
} catch {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force }
  throw
}

$mb = [math]::Round((Get-Item -LiteralPath $out).Length / 1MB, 1)
Write-Output ("分享包已生成：" + $out + "（" + $mb + " MB）")
