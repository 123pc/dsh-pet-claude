# 安装橙色 Claude 大肥鱼社区角色包（独立 id，可与蓝色包共存）
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$PetRoot = (Join-Path $env:USERPROFILE '.dsh\dsh-pet\pet'),
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$prefix = 'claude-dafeiyu-orange'
$srcCfg = Join-Path $PSScriptRoot "$prefix-config.json"
$srcAnim = Join-Path $PSScriptRoot 'animation'
$dstCfg = Join-Path $PetRoot "$prefix-config.json"
$dstAnim = Join-Path $PetRoot "$prefix-animation"

if (-not (Test-Path -LiteralPath $srcCfg -PathType Leaf)) { throw "缺少配置：$srcCfg" }
if (-not (Test-Path -LiteralPath $srcAnim -PathType Container)) { throw "缺少动画目录：$srcAnim" }
if (-not (Test-Path -LiteralPath $PetRoot -PathType Container)) { throw "dsh-pet 素材目录不存在：$PetRoot" }

$count = @(Get-ChildItem -LiteralPath $srcAnim -File -Filter '*.webm').Count
if ($count -eq 0) { throw "动画目录里没有 webm：$srcAnim" }
Write-Host "Orange Claude pack: $count clips. Destination: $PetRoot"
if ($CheckOnly) { return }

if (-not $PSCmdlet.ShouldProcess($PetRoot, "Install $prefix")) { return }

if (Test-Path -LiteralPath $dstAnim) {
    $bak = "$dstAnim.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Move-Item -LiteralPath $dstAnim -Destination $bak
    Write-Host "已备份旧动画：$bak"
}
if (Test-Path -LiteralPath $dstCfg) {
    Copy-Item -LiteralPath $dstCfg -Destination ($dstCfg + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')) -Force
}

Copy-Item -LiteralPath $srcCfg -Destination $dstCfg -Force
Copy-Item -LiteralPath $srcAnim -Destination $dstAnim -Recurse -Force
Write-Host "已安装：$dstCfg"
Write-Host "请刷新网页或右键宠物 →「重载配置」。"
