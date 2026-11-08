. (Join-Path $PSScriptRoot 'Workspace.ps1')
function Get-SuiteTarget([string]$Parent) {
    if([string]::IsNullOrWhiteSpace($Parent)){throw 'Выберите папку.'}
    $path=[IO.Path]::GetFullPath($Parent);Assert-LocalDirectory $path
    if((Test-Path -LiteralPath (Join-Path $path 'suite.json'))-or(Test-Path -LiteralPath (Join-Path $path 'workspace.json'))-or(Test-Path -LiteralPath (Join-Path $path '.portable-suite'))){return $path}
    return Join-Path $path 'Claude-mini-Browser'
}
function Read-Suite([string]$Root) {
    $file=Join-Path $Root 'suite.json';if(-not(Test-Path -LiteralPath $file)){throw 'Установите браузеры через Setup.cmd.'}
    $s=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
    if($s.schema-ne1-or-not@($s.installed).Count-or$s.default-notin@($s.installed)){throw 'Повреждено описание комплекта.'}
    foreach($id in @($s.installed)){if($id-notin@('chrome','edge','brave')){throw 'Неизвестный браузер в комплекте.'};$relative=$s.paths.$id;if($relative-ne('workspaces/'+$id)-and-not($id-eq'brave'-and$relative-eq'.')){throw 'Некорректный путь рабочего места.'}}
    return $s
}
function Get-SuiteWorkspace([string]$Root,[string]$Browser) {
    $Root=Resolve-PhysicalDirectory $Root
    $s=Read-Suite $Root;if($Browser-notin@($s.installed)){throw 'Этот браузер не установлен в комплекте.'}
    return [IO.Path]::GetFullPath((Join-Path $Root $s.paths.$Browser))
}
function Prepare-Suite([string]$Parent,[string[]]$Browsers,[string]$Locale='en-US,en',[string]$Timezone='UTC',[int]$Cores=0,[string]$ProgressFile,[string]$Default='chrome') {
    $selected=@($Browsers|Select-Object -Unique)
    if(-not$selected.Count-or@($selected|Where-Object {$_-notin@('chrome','edge','brave')}).Count){throw 'Выберите хотя бы один браузер.'}
    if($Locale-notin@('en-US,en','en-GB,en','ru-RU,ru','de-DE,de,en')-or$Timezone-notin@('UTC','Europe/Berlin','Europe/London','Europe/Paris','Europe/Stockholm','America/New_York','Asia/Dubai')-or$Cores-notin@(0,2,4,8,16)){throw 'Выберите язык, часовой пояс и CPU из списка.'}
    if($Default-notin$selected){$Default=$selected[0]}
    $root=Get-SuiteTarget $Parent
    foreach($name in @('app','extension','payload','browser','profile','workspaces')){$forbidden=(Join-Path $script:PackageRoot $name).TrimEnd('\');if($root.Equals($forbidden,[StringComparison]::OrdinalIgnoreCase)-or$root.StartsWith($forbidden+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Выберите рабочую папку вне служебных каталогов комплекта.'}}
    $suiteExists=Test-Path -LiteralPath (Join-Path $root 'suite.json');$legacyExists=Test-Path -LiteralPath (Join-Path $root 'workspace.json')
    $paths=@{};$installed=@()
    if($suiteExists){$old=Read-Suite $root;foreach($id in @($old.installed)){$installed+=,$id;$paths[$id]=$old.paths.$id};Assert-PortableClosed $root}
    elseif($legacyExists){$legacy=Read-Workspace $root;if($legacy.browser-ne'brave'){throw 'Прежний профиль не распознан как Brave.'};Assert-PortableClosed $root;$installed=@('brave');$paths['brave']='.'}
    elseif((Test-Path -LiteralPath $root)-and@(Get-ChildItem -LiteralPath $root -Force).Count-and-not(Test-Path -LiteralPath (Join-Path $root '.portable-suite'))){throw 'Папка занята другими файлами. Выберите другое место.'}
    [IO.Directory]::CreateDirectory($root)|Out-Null;$root=Resolve-PhysicalDirectory $root;Assert-LocalDirectory $root
    if($suiteExists-or$legacyExists){Assert-PortableClosed $root}
    [IO.File]::WriteAllText((Join-Path $root '.portable-suite'),'Claude mini suite')
    foreach($id in $selected){
        if(-not$paths.ContainsKey($id)){$paths[$id]='workspaces/'+$id}
        $target=[IO.Path]::GetFullPath((Join-Path $root $paths[$id]));[void](Prepare-Workspace $target $id $Locale $Timezone $Cores $ProgressFile)
        if($id-notin$installed){$installed+=,$id}
        # Commit each successful engine so retrying after a later failure is safe.
        $chosen=if($Default-in$installed){$Default}else{$installed[0]}
        Write-JsonFile (Join-Path $root 'suite.json') @{schema=1;version='0.14.1';installed=$installed;default=$chosen;paths=$paths}
    }
    Copy-ProgramFiles $root ($suiteExists-or$legacyExists)
    if($paths.ContainsKey('brave')-and$paths['brave']-eq'.'){
        $legacy=Read-Workspace $root
        Write-InstallPreset $root 'brave' $legacy.preset
        [void](Write-FirstRunGuide $root 'brave')
    }
    foreach($id in $installed){$cmd='@echo off'+"`r`n"+'cd /d "%~dp0"'+"`r`n"+'start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "%~dp0app\Launch.ps1" -Browser '+$id+"`r`n";[IO.File]::WriteAllText((Join-Path $root ('Launch-'+$id+'.cmd')),$cmd,[Text.Encoding]::ASCII)}
    foreach($id in $installed){if($paths[$id]-ne'.'){
        $nestedSetup=Join-Path (Join-Path $root $paths[$id]) 'Setup.cmd'
        [IO.File]::WriteAllText($nestedSetup,('@echo off'+"`r`n"+'call "%~dp0..\..\Setup.cmd"'+"`r`n"),[Text.Encoding]::ASCII)
    }}
    $marker=Join-Path $root '.portable-suite';if(Test-Path -LiteralPath $marker){Remove-Item -LiteralPath $marker}
    Set-InstallProgress $ProgressFile 'Готово. У каждого браузера свой профиль и настройки.' 100
    return $root
}
function New-SuiteShortcuts([string]$Root) {
    $s=Read-Suite $Root;$shell=New-Object -ComObject WScript.Shell
    $productName=if((Get-Content -LiteralPath (Join-Path $Root 'extension\config.js') -Raw -Encoding UTF8)-match"edition:\s*'pro'"){'Claude mini Pro'}else{'Claude mini'}
    try{foreach($id in @($s.installed)){$spec=Get-RuntimeSpec $id;$workspace=Get-SuiteWorkspace $Root $id;$link=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($productName+' - '+$spec.displayName+'.lnk')));$link.TargetPath=Join-Path $Root ('Launch-'+$id+'.cmd');$link.WorkingDirectory=$Root;$link.IconLocation=(Get-PortableExecutable $workspace $id)+',0';$link.Description='Рабочее место '+$productName+' — '+$spec.displayName;$link.Save()}}finally{[Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)|Out-Null}
}
