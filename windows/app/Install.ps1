param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Suite.ps1')
$request=Get-Content -LiteralPath $RequestFile -Raw -Encoding UTF8|ConvertFrom-Json
try{
    $target=Prepare-Suite $request.parent @($request.browsers) $request.locale $request.timezone ([int]$request.cores) $request.progress $request.default
    if($request.shortcut){New-SuiteShortcuts $target}
    Write-JsonFile $request.result @{ok=$true;root=$target};exit 0
}catch{Write-JsonFile $request.result @{ok=$false;error=$_.Exception.Message};exit 1}
