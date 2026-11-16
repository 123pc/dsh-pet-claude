# 卸载橙色 Claude 大肥鱼社区角色包
param(
    [string]$PetRoot = (Join-Path $env:USERPROFILE '.dsh\dsh-pet\pet')
)
$ErrorActionPreference = 'Stop'
$prefix = 'claude-dafeiyu-orange'
$cfg = Join-Path $PetRoot "$prefix-config.json"
$anim = Join-Path $PetRoot "$prefix-animation"

foreach ($p in @($cfg, $anim)) {
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Recurse -Force
        Write-Host "已删除：$p"
    }
}
Write-Host "请刷新网页或右键宠物 →「重载配置」。"
