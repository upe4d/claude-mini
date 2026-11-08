$ErrorActionPreference='Stop'
$script:PackageRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'Runtime.ps1')
. (Join-Path $PSScriptRoot 'FirstRunGuide.ps1')
function Read-Workspace([string]$Root) {
    $file=Join-Path $Root 'workspace.json';if(-not(Test-Path -LiteralPath $file)){throw 'Рабочее место ещё не подготовлено.'}
    $config=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
    if($config.edition-ne'portable-browser'-or$config.schema-ne1){throw 'Это другая рабочая папка. Выберите новую папку или установку 0.12.0.'}
    if(-not$config.PSObject.Properties['browser']){$config|Add-Member -NotePropertyName browser -NotePropertyValue 'brave'}
    if($config.browser-notin@('chrome','edge','brave')-or$config.profileLocale-notin@('en-US','en-GB','ru-RU','de-DE')){throw 'Повреждены параметры рабочего места.'}
    return $config
}
function Assert-PortableClosed([string]$Root) {
    $absolute=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
    foreach($p in @(Get-CimInstance Win32_Process -Filter "Name = 'brave.exe' OR Name = 'chrome.exe' OR Name = 'msedge.exe'")){
        if(($p.ExecutablePath-and$p.ExecutablePath.StartsWith($absolute,[StringComparison]::OrdinalIgnoreCase))-or($p.CommandLine-and$p.CommandLine.IndexOf($absolute,[StringComparison]::OrdinalIgnoreCase)-ge0)){throw 'Закройте окна браузеров из этой рабочей папки перед обновлением.'}
    }
}
function Copy-ProgramFiles([string]$Root,[bool]$Backup) {
    $names=@('app','extension','Setup.cmd','Launch.cmd','Начните здесь.html','ПРОЧИТАЙТЕ.txt')
    if($Root.Equals($script:PackageRoot,[StringComparison]::OrdinalIgnoreCase)){return}
    $backupPath=$null
    if($Backup){$backupPath=Join-Path $Root ('backups\'+[DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff'));[IO.Directory]::CreateDirectory($backupPath)|Out-Null;foreach($name in $names){$source=Join-Path $Root $name;if(Test-Path -LiteralPath $source){Copy-Item -LiteralPath $source -Destination $backupPath -Recurse}}}
    try{foreach($name in $names){Copy-Item -LiteralPath (Join-Path $script:PackageRoot $name) -Destination $Root -Recurse -Force}}
    catch{if($backupPath){foreach($item in Get-ChildItem -LiteralPath $backupPath){Copy-Item -LiteralPath $item.FullName -Destination $Root -Recurse -Force}};throw}
}
function Prepare-Workspace([string]$Root,[string]$Browser,[string]$Locale,[string]$Timezone,[int]$Cores,[string]$ProgressFile) {
    Assert-LocalDirectory $Root
    $exists=Test-Path -LiteralPath (Join-Path $Root 'workspace.json')
    if($exists){$config=Read-Workspace $Root;if($config.browser-ne$Browser){throw 'Нельзя передавать один профиль разным браузерам.'};Assert-PortableClosed $Root}
    [IO.Directory]::CreateDirectory($Root)|Out-Null
    [void](Install-PortableRuntime $Root (Join-Path $script:PackageRoot ('payload\'+$Browser+'.zip')) $ProgressFile $Browser)
    Copy-ProgramFiles $Root $exists
    if(-not$exists){
        $profile=Join-Path $Root 'profile';$default=Join-Path $profile 'Default';[IO.Directory]::CreateDirectory($default)|Out-Null
        Write-JsonFile (Join-Path $default 'Preferences') @{intl=@{accept_languages=$Locale;selected_languages=$Locale};browser=@{check_default_browser=$false};distribution=@{skip_first_run_ui=$true}}
        Write-JsonFile (Join-Path $profile 'Local State') @{intl=@{app_locale=$Locale.Split(',')[0]}}
        $config=[pscustomobject]@{schema=1;edition='portable-browser';browser=$Browser;version='0.14.1';profileLocale=$Locale.Split(',')[0];preset=@{timezone=$Timezone;locale=$Locale;cores=$Cores;ui='ru'}}
    }
    $config.version='0.14.1';Write-JsonFile (Join-Path $Root 'workspace.json') $config
    Write-InstallPreset $Root $Browser $config.preset
    [void](Write-FirstRunGuide $Root $Browser)
    return $Root
}
function Write-InstallPreset([string]$Root,[string]$Browser,$Preset) {
    $stamp=@{id=$Browser;extensionPath=(Join-Path $Root 'extension')}
    $text='const InstallBrowser='+($stamp|ConvertTo-Json -Compress)+';'+[Environment]::NewLine+'const InstallPreset='+($Preset|ConvertTo-Json -Compress)+';'
    [IO.File]::WriteAllText((Join-Path $Root 'extension\preset.js'),$text,[Text.UTF8Encoding]::new($false))
}
function Test-WorkspaceRunning([string]$Profile,[string]$Executable) {
    $name=[IO.Path]::GetFileName($Executable).Replace("'","''")
    $escaped=[Regex]::Escape($Profile)
    $argument='--user-data-dir=(?:"'+$escaped+'"|'+$escaped+'(?=\s|$))'
    try {
        foreach($p in @(Get-CimInstance Win32_Process -Filter ("Name = '"+$name+"'"))){
            if($p.CommandLine-and$p.CommandLine-notmatch'(?:^|\s)--type='-and$p.CommandLine-match$argument){
                if($p.CreationDate-and([DateTime]::Now-[DateTime]$p.CreationDate).TotalSeconds-lt5){return $false}
                return $true
            }
        }
    }catch{}
    return $false
}
function Get-PortableLaunch([string]$Root,[switch]$Guide) {
    $Root=Resolve-PhysicalDirectory $Root
    $config=Read-Workspace $Root;$spec=Get-RuntimeSpec $config.browser;$exe=Get-PortableExecutable $Root $config.browser
    $profile=Join-Path ([IO.Path]::GetFullPath($Root)) 'profile';$extension=Join-Path ([IO.Path]::GetFullPath($Root)) 'extension'
    $entry=if($Guide){([Uri](Join-Path ([IO.Path]::GetFullPath($Root)) 'Начните работу.html')).AbsoluteUri}else{'chrome-extension://'+$spec.extensionId+'/onboarding.html?browser='+$config.browser+'&extensionPath='+[Uri]::EscapeDataString($extension)}
    $arguments=@(('--user-data-dir="'+$profile+'"'),'--no-first-run','--no-default-browser-check',('--lang='+$config.profileLocale),('--load-extension="'+$extension+'"'),$entry)
    return @{executable=$exe;arguments=$arguments;profile=$profile;extension=$extension;browser=$config.browser}
}
function Start-Workspace([string]$Root,[switch]$Guide) {
    $launch=Get-PortableLaunch $Root -Guide:$Guide
    $spec=Get-RuntimeSpec $launch.browser;Confirm-RuntimeStartup (Split-Path $launch.executable -Parent) $spec ''
    # A fresh process must not navigate to an extension before registration.
    # The extension's startup event opens its own page once initialization ends.
    if(-not$Guide-and-not(Test-WorkspaceRunning $launch.profile $launch.executable)){$launch=Get-PortableLaunch $Root -Guide}
    $process=Start-Process -FilePath $launch.executable -ArgumentList $launch.arguments -PassThru
    if($process.WaitForExit(2500)-and$process.ExitCode-ne0){throw ('Запуск '+$launch.browser+' завершился с кодом 0x'+$process.ExitCode.ToString('X8')+'. Откройте Setup.cmd для проверки файлов.')}
}
