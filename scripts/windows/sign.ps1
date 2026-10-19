# Authenticode-signs one file for the NOVA Windows build.
# Called by Tauri (bundle.windows.signCommand) for every binary it ships: the
# app exe, libmpv-2.dll, the NSIS plugins, the uninstaller and the installer.
# Credentials come only from the environment (CI secrets or
# the release machine); nothing secret is read from or written to the repo.
#
# Backends, first configured wins:
#   1. Azure Artifact Signing (formerly Trusted Signing):
#        NOVA_SIGN_ENDPOINT, NOVA_SIGN_ACCOUNT, NOVA_SIGN_PROFILE, plus
#        AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID (artifact-signing-cli).
#   2. A certificate in the Windows store or on a hardware token (OV/EV):
#        NOVA_SIGN_THUMBPRINT (SHA-1 thumbprint), signtool.exe on PATH or in the Windows SDK.
# Unconfigured: development builds pass unsigned with a warning; with
# NOVA_REQUIRE_SIGNING=1 (release builds) the build fails instead.
param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = 'Stop'
$timestamp = if ($env:NOVA_SIGN_TIMESTAMP) { $env:NOVA_SIGN_TIMESTAMP } else { 'http://timestamp.acs.microsoft.com' }

function Find-SignTool {
  $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $kits = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
  Get-ChildItem $kits -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}

if ($env:NOVA_SIGN_ENDPOINT -and $env:NOVA_SIGN_ACCOUNT -and $env:NOVA_SIGN_PROFILE) {
  & artifact-signing-cli -e $env:NOVA_SIGN_ENDPOINT -a $env:NOVA_SIGN_ACCOUNT -c $env:NOVA_SIGN_PROFILE -d 'NOVA by SNOWBROS' $File
} elseif ($env:NOVA_SIGN_THUMBPRINT) {
  $tool = Find-SignTool
  if (-not $tool) { throw 'signtool.exe not found (install the Windows SDK signing tools)' }
  & $tool sign /sha1 $env:NOVA_SIGN_THUMBPRINT /fd sha256 /tr $timestamp /td sha256 /d 'NOVA' /du 'https://nova.snowbros.me' $File
} elseif ($env:NOVA_REQUIRE_SIGNING -eq '1') {
  throw "NOVA_REQUIRE_SIGNING=1 but no signing backend is configured; refusing to produce an unsigned release ($File)"
} else {
  Write-Warning "Not signed (no signing backend configured): $File"
  exit 0
}
if ($LASTEXITCODE -ne 0) { throw "signing failed ($LASTEXITCODE): $File" }

$sig = Get-AuthenticodeSignature -FilePath $File
if ($sig.Status -ne 'Valid' -or -not $sig.TimeStamperCertificate) {
  throw "signature check failed for ${File}: $($sig.Status) $($sig.StatusMessage)"
}
Write-Host "Signed: $File ($($sig.SignerCertificate.Subject))"
