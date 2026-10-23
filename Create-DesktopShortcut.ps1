# Creates a desktop shortcut for Start-MissionControl.bat. Run once:
#   Right-click this file -> Run with PowerShell
#   or:  pwsh -File .\Create-DesktopShortcut.ps1

$repoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$target     = Join-Path $repoRoot 'Start-MissionControl.bat'
$desktop    = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'BC Mission Control.lnk'

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath       = $target
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description      = 'Start BC Mission Control'
$shortcut.IconLocation     = "$env:SystemRoot\System32\imageres.dll,68"  # globe icon
$shortcut.Save()

Write-Host "Shortcut created: $shortcutPath" -ForegroundColor Green
