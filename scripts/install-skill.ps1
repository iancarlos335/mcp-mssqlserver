[CmdletBinding()]
param(
    [ValidateSet('all', 'claude', 'codex', 'antigravity', 'agentskills')]
    [string]$Target = 'all',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillSrc = Join-Path $ScriptDir '..\skill\mssql-cli'
$SkillName = 'mssql-cli'

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }

$providerDirs = @{
    claude      = Join-Path $HOME ".claude\skills\$SkillName"
    codex       = Join-Path $codexHome "skills\$SkillName"
    antigravity = Join-Path $HOME ".gemini\config\skills\$SkillName"
    agentskills = Join-Path $HOME ".agents\skills\$SkillName"
}

$targets = if ($Target -eq 'all') { $providerDirs.Keys } else { , $Target }

foreach ($t in $targets) {
    $dest = $providerDirs[$t]
    if ($Uninstall) {
        if (Test-Path $dest) {
            Remove-Item -Recurse -Force $dest
            Write-Host "Removed $dest"
        } else {
            Write-Host "Nothing to remove at $dest"
        }
    } else {
        New-Item -ItemType Directory -Force -Path $dest | Out-Null
        Copy-Item -Path (Join-Path $SkillSrc '*') -Destination $dest -Recurse -Force
        Write-Host "Installed skill to $dest"
    }
}
