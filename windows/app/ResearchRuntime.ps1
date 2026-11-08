param([Parameter(Mandatory=$true)][ValidateSet('chrome','edge','brave')][string]$BrowserId,[Parameter(Mandatory=$true)][string]$ResultFile)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'Runtime.ps1')
try{
    $package=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $root=Join-Path $package ('research-runtimes\'+$BrowserId);Assert-LocalDirectory $root;[IO.Directory]::CreateDirectory($root)|Out-Null
    $root=Resolve-PhysicalDirectory $root;Assert-LocalDirectory $root
    $exe=Install-PortableRuntime $root (Join-Path $package ('payload\'+$BrowserId+'.zip')) '' $BrowserId
    $spec=Get-RuntimeSpec $BrowserId
    Write-JsonFile $ResultFile @{ok=$true;executable=$exe;version=$spec.version;root=$root}
}catch{Write-JsonFile $ResultFile @{ok=$false;error=$_.Exception.Message};exit 1}
