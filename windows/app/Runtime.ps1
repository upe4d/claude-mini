$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
. (Join-Path $PSScriptRoot 'PhysicalPath.ps1')
function Get-RuntimeSpec([string]$Browser='chrome') {
    if($Browser -notin @('chrome','edge','brave')){throw 'Неизвестный браузер.'}
    $catalog=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtimes.json') -Raw -Encoding UTF8|ConvertFrom-Json
    $spec=@($catalog.browsers|Where-Object {$_.id-eq$Browser})
    if($catalog.schema-ne1 -or $spec.Count-ne1){throw 'Повреждено описание браузеров.'}
    $s=$spec[0]
    if($s.version-notmatch'^[0-9.]+$' -or $s.sha256-notmatch'^[a-f0-9]{64}$' -or $s.executableSHA256-notmatch'^[a-f0-9]{64}$' -or [long]$s.size-lt1MB -or [long]$s.size-gt800MB){throw 'Некорректные контрольные данные браузера.'}
    foreach($part in @($s.archiveRoot,$s.executable)){if(-not$part -or $part.Contains('..') -or $part.Contains(':') -or $part.StartsWith('/') -or $part.StartsWith('\')){throw 'Некорректный путь браузера.'}}
    return $s
}
function Write-JsonFile([string]$Path,$Value) {
    [IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
}
function Assert-LocalDirectory([string]$Path) {
    $current=[IO.Path]::GetFullPath($Path)
    if($current.StartsWith('\\')){throw 'Выберите локальный диск для браузеров.'}
    while($current){if(Test-Path -LiteralPath $current){if((Get-Item -LiteralPath $current -Force).Attributes-band[IO.FileAttributes]::ReparsePoint){throw 'Рабочая папка не должна проходить через ссылку или junction.'}};$current=[IO.Path]::GetDirectoryName($current)}
}
function Set-InstallProgress([string]$File,[string]$Message,[int]$Percent=-1) {
    if($File){$temporary=$File+'.tmp';Write-JsonFile $temporary @{message=$Message;percent=$Percent};Move-Item -LiteralPath $temporary -Destination $File -Force}
}
function Get-PortableExecutable([string]$Root,[string]$Browser='chrome') {
    $spec=Get-RuntimeSpec $Browser
    $exe=Join-Path $Root ('browser\'+$Browser+'\'+$spec.version+'\'+$spec.executable)
    # A 0.12 Brave workspace stays in place; its profile is never moved.
    if(-not(Test-Path -LiteralPath $exe)-and$Browser-eq'brave'){$legacy=Join-Path $Root ('browser\'+$spec.version+'\'+$spec.executable);if(Test-Path -LiteralPath $legacy){$exe=$legacy}}
    if(-not(Test-Path -LiteralPath $exe -PathType Leaf)){throw ($spec.displayName+': браузер ещё не установлен. Запустите Setup.cmd.')}
    if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()-ne$spec.executableSHA256){throw ($spec.displayName+': исполняемый файл не прошёл проверку. Повторите Setup.cmd.')}
    if([Diagnostics.FileVersionInfo]::GetVersionInfo($exe).FileVersion-ne$spec.executableVersion){throw ($spec.displayName+': версия файла не совпадает с комплектом.')}
    return Resolve-PhysicalFile $exe
}
function Remove-InstallTemporary([string]$Path,[string]$Root) {
    $full=[IO.Path]::GetFullPath($Path);$parent=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
    if(-not$full.StartsWith($parent,[StringComparison]::OrdinalIgnoreCase)-or-not([IO.Path]::GetFileName($full).StartsWith('.install-'))){throw 'Недопустимый путь временной папки.'}
    Assert-LocalDirectory $full
    if(Test-Path -LiteralPath $full){Remove-Item -LiteralPath $full -Recurse -Force}
}
function Initialize-RuntimeDirectory([string]$Directory,$Spec,[string]$ProgressFile) {
    if(-not$Spec.configureExecutable){return}
    $helper=[IO.Path]::GetFullPath((Join-Path $Directory $Spec.configureExecutable))
    if(-not$helper.StartsWith($Directory.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)-or-not(Test-Path -LiteralPath $helper)){throw 'Не найден штатный помощник подготовки Chrome.'}
    if((Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant()-ne$Spec.configureSHA256){throw 'Помощник подготовки Chrome не прошёл проверку.'}
    Set-InstallProgress $ProgressFile 'Chrome: подготавливаем права доступа песочницы в папке браузера…' -1
    $process=Start-Process -FilePath $helper -ArgumentList ('--configure-browser-in-directory="'+$Directory+'"') -WindowStyle Hidden -PassThru
    if(-not$process.WaitForExit(60000)){$process.Kill();throw 'Помощник подготовки Chrome не завершился за минуту.'}
    # Chrome's directory configuration may apply ACLs and still return 78.
    if($process.ExitCode-notin@(0,78)){throw ('Подготовка Chrome остановлена с кодом '+$process.ExitCode+'.')}
}
function Confirm-RuntimeStartup([string]$Directory,$Spec,[string]$ProgressFile) {
    if($Spec.id-ne'chrome'){return}
    $marker=Join-Path $Directory 'runtime-ready.json'
    if(Test-Path -LiteralPath $marker){try{$saved=Get-Content -LiteralPath $marker -Raw -Encoding UTF8|ConvertFrom-Json;if($saved.executableSHA256-eq$Spec.executableSHA256-and$saved.directory-eq$Directory){return}}catch{}}
    Initialize-RuntimeDirectory $Directory $Spec $ProgressFile
    Set-InstallProgress $ProgressFile 'Chrome: проверяем запуск в выбранной папке…' -1
    $root=Split-Path (Split-Path (Split-Path $Directory -Parent) -Parent) -Parent
    $probe=Join-Path $root ('.install-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($probe)|Out-Null
    try{
        $exe=Join-Path $Directory $Spec.executable;$output=Join-Path $probe 'result.html';$errorFile=Join-Path $probe 'error.log';$profile=Join-Path $probe 'profile'
        $info=New-Object Diagnostics.ProcessStartInfo;$info.FileName=$exe;$info.WorkingDirectory=$Directory;$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
        $info.Arguments='--headless=new --no-first-run --no-default-browser-check --user-data-dir="'+$profile+'" --dump-dom about:blank'
        $process=New-Object Diagnostics.Process;$process.StartInfo=$info
        try{
            [void]$process.Start();$outTask=$process.StandardOutput.ReadToEndAsync();$errorTask=$process.StandardError.ReadToEndAsync()
            if(-not$process.WaitForExit(20000)){$process.Kill();throw 'Chrome не завершил проверку запуска. Выберите другую рабочую папку и повторите установку.'}
            $html=$outTask.GetAwaiter().GetResult();$errorText=$errorTask.GetAwaiter().GetResult()
            if($process.ExitCode-ne0-or$html-notmatch'<html'){throw ('Windows не разрешила запуск Chrome в этой папке (код 0x'+$process.ExitCode.ToString('X8')+'). Выберите другую рабочую папку. Защиту Windows отключать не нужно.')}
        }finally{$process.Dispose()}
        Write-JsonFile $marker @{executableSHA256=$Spec.executableSHA256;directory=$Directory}
    }finally{Remove-InstallTemporary $probe $root}
}
function Install-PortableRuntime([string]$Root,[string]$Payload,[string]$ProgressFile,[string]$Browser='chrome') {
    if(-not[Environment]::Is64BitOperatingSystem){throw 'Нужна 64-разрядная Windows.'}
    $spec=Get-RuntimeSpec $Browser;Assert-LocalDirectory $Root
    $existing=$null;try{$existing=Get-PortableExecutable $Root $Browser}catch{}
    if($existing){Confirm-RuntimeStartup (Split-Path $existing -Parent) $spec $ProgressFile;return $existing}
    if(-not(Test-Path -LiteralPath $Payload -PathType Leaf)){throw ('В комплекте отсутствует payload/'+$Browser+'.zip. Распакуйте полный архив заново.')}
    Set-InstallProgress $ProgressFile ($spec.displayName+': проверяем архив…') -1
    if((Get-Item -LiteralPath $Payload).Length-ne[long]$spec.size-or(Get-FileHash -LiteralPath $Payload -Algorithm SHA256).Hash.ToLowerInvariant()-ne$spec.sha256){throw ($spec.displayName+': SHA-256 архива не совпал. Установка остановлена.')}
    $temporary=Join-Path $Root ('.install-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($temporary)|Out-Null
    try {
        $expanded=Join-Path $temporary 'expanded';[IO.Directory]::CreateDirectory($expanded)|Out-Null
        $zip=[IO.Compression.ZipFile]::OpenRead($Payload)
        try {$sum=0L;foreach($entry in $zip.Entries){$name=$entry.FullName.Replace('/','\');$destination=[IO.Path]::GetFullPath((Join-Path $expanded $name));if($name.Contains(':')-or-not$destination.StartsWith($expanded+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Небезопасный путь в архиве браузера.'};$sum+=$entry.Length;if($sum-gt4GB){throw 'Архив браузера слишком велик.'}}}finally{$zip.Dispose()}
        Set-InstallProgress $ProgressFile ($spec.displayName+': распаковываем в отдельную папку…') -1
        [IO.Compression.ZipFile]::ExtractToDirectory($Payload,$expanded)
        $content=if($spec.archiveRoot-eq'.'){$expanded}else{Join-Path $expanded $spec.archiveRoot}
        $exe=Join-Path $content $spec.executable
        if(-not(Test-Path -LiteralPath $exe)-or(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()-ne$spec.executableSHA256){throw 'Браузер повреждён после распаковки.'}
        if($spec.signatureSubject){$signature=Get-AuthenticodeSignature -LiteralPath $exe;if($signature.Status-ne'Valid'-or$signature.SignerCertificate.Subject-notlike('*'+$spec.signatureSubject+'*')){throw ('Подпись '+$spec.displayName+' не подтверждена.')}}
        $destination=Join-Path $Root ('browser\'+$Browser+'\'+$spec.version);[IO.Directory]::CreateDirectory((Split-Path $destination -Parent))|Out-Null
        if(Test-Path -LiteralPath $destination){Move-Item -LiteralPath $destination -Destination ($destination+'.previous-'+[Guid]::NewGuid().ToString('N'))}
        Move-Item -LiteralPath $content -Destination $destination
        Confirm-RuntimeStartup $destination $spec $ProgressFile
        return Get-PortableExecutable $Root $Browser
    }finally{Remove-InstallTemporary $temporary $Root}
}
