param([switch]$NoShow,[switch]$RenderOnly,[string]$RenderPath,[int]$RenderStep=0)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
. (Join-Path $PSScriptRoot 'Suite.ps1')
[Windows.Forms.Application]::EnableVisualStyles()
$form=New-Object Windows.Forms.Form;$form.Text='Claude mini 0.13.1 — Chrome, Edge и Brave';$form.StartPosition='CenterScreen'
$form.ClientSize=New-Object Drawing.Size(900,740);$form.MinimumSize=New-Object Drawing.Size(820,680);$form.AutoScaleMode='Dpi'
$form.Font=New-Object Drawing.Font('Segoe UI',12);$form.BackColor=[Drawing.ColorTranslator]::FromHtml('#f5f2eb')
$script:Step=0;$script:Worker=$null;$script:Target=$null
function Label([string]$Text,[int]$Size=12){$c=New-Object Windows.Forms.Label;$c.Text=$Text;$c.AutoSize=$true;$c.MaximumSize=New-Object Drawing.Size(790,0);$c.Font=New-Object Drawing.Font('Segoe UI',$Size);$c.Margin=New-Object Windows.Forms.Padding(0,5,0,12);return $c}
function Button([string]$Text,[scriptblock]$Action,[string]$Color='#246590'){$b=New-Object Windows.Forms.Button;$b.Text=$Text;$b.AutoSize=$true;$b.MinimumSize=New-Object Drawing.Size(135,46);$b.Padding=New-Object Windows.Forms.Padding(14,8,14,8);$b.Margin=New-Object Windows.Forms.Padding(0,4,12,8);$b.FlatStyle='Flat';$b.FlatAppearance.BorderSize=0;$b.BackColor=[Drawing.ColorTranslator]::FromHtml($Color);$b.ForeColor=[Drawing.Color]::White;$b.Font=New-Object Drawing.Font('Segoe UI',12,[Drawing.FontStyle]::Bold);$b.Add_Click($Action);return $b}
function Combo($Items){$c=New-Object Windows.Forms.ComboBox;$c.DropDownStyle='DropDownList';$c.Width=510;$c.Items.AddRange([object[]]$Items);$c.SelectedIndex=0;$c.Margin=New-Object Windows.Forms.Padding(0,0,0,12);return $c}
function Choose-Folder{$d=New-Object Windows.Forms.FolderBrowserDialog;$d.Description='Место для ваших браузеров';if($d.ShowDialog()-eq'OK'){$folder.Text=$d.SelectedPath};$d.Dispose()}
$layout=New-Object Windows.Forms.TableLayoutPanel;$layout.Dock='Fill';$layout.Padding=New-Object Windows.Forms.Padding(24);$layout.ColumnCount=1;$layout.RowCount=5
foreach($height in @(36,70,0,52,62)){$style=if($height){New-Object Windows.Forms.RowStyle('Absolute',$height)}else{New-Object Windows.Forms.RowStyle('Percent',100)};[void]$layout.RowStyles.Add($style)};$form.Controls.Add($layout)
$layout.Controls.Add((Label 'Браузеры → Ваши настройки → Установка → Рабочее место' 11),0,0)
$title=Label '' 25;$title.Font=New-Object Drawing.Font('Segoe UI',25,[Drawing.FontStyle]::Bold);$layout.Controls.Add($title,0,1)
$container=New-Object Windows.Forms.Panel;$container.Dock='Fill';$layout.Controls.Add($container,0,2)
$status=Label '' 11;$status.Dock='Fill';$layout.Controls.Add($status,0,3)
$nav=New-Object Windows.Forms.FlowLayoutPanel;$nav.Dock='Fill';$layout.Controls.Add($nav,0,4)
$back=Button '← Назад' {Show-Step ($script:Step-1)} '#73695e';$next=Button 'Дальше →' {try{Next-Step}catch{$status.Text=$_.Exception.Message}};$nav.Controls.Add($back);$nav.Controls.Add($next)
$help=New-Object Windows.Forms.LinkLabel;$help.Text='Инструкция';$help.AutoSize=$true;$help.Margin=New-Object Windows.Forms.Padding(15,16,0,0);$help.Add_LinkClicked({Start-Process (Join-Path $script:PackageRoot 'Начните здесь.html')});$nav.Controls.Add($help)
$pages=@();0..3|ForEach-Object{$p=New-Object Windows.Forms.FlowLayoutPanel;$p.Dock='Fill';$p.AutoScroll=$true;$p.FlowDirection='TopDown';$p.WrapContents=$false;$p.Padding=New-Object Windows.Forms.Padding(12);$p.BackColor=[Drawing.Color]::White;$container.Controls.Add($p);$pages+=,$p}
$pages[0].Controls.Add((Label 'Можно установить один браузер, два или все три. У каждого будет свой профиль.' 15))
$checks=@{}
foreach($id in @('chrome','edge','brave')){$spec=Get-RuntimeSpec $id;$check=New-Object Windows.Forms.CheckBox;$check.Text=$spec.displayName;$check.Checked=$true;$check.AutoSize=$true;$check.Font=New-Object Drawing.Font('Segoe UI',16,[Drawing.FontStyle]::Bold);$check.Margin=New-Object Windows.Forms.Padding(0,0,0,12);$checks[$id]=$check;$pages[0].Controls.Add($check)}
$pages[0].Controls.Add((Label 'Где хранить браузеры и вашу работу' 12))
$folder=New-Object Windows.Forms.TextBox;$folder.Width=760;$folder.Text=[Environment]::GetFolderPath('LocalApplicationData');$pages[0].Controls.Add($folder)
$pages[0].Controls.Add((Button 'Выбрать папку…' {Choose-Folder} '#73695e'))
$shortcut=New-Object Windows.Forms.CheckBox;$shortcut.Text='Создать отдельный ярлык для каждого браузера';$shortcut.Checked=$true;$shortcut.AutoSize=$true;$shortcut.Margin=New-Object Windows.Forms.Padding(0,10,0,10);$pages[0].Controls.Add($shortcut)
$pages[0].Controls.Add((Label 'Обновление: выберите прежнюю рабочую папку с suite.json или workspace.json. Старый профиль Brave сохранится. Перед обновлением закройте его окна. Для трёх браузеров нужно 5 ГБ свободного места.' 11))
$pages[1].Controls.Add((Label 'Сейчас установим выбранные браузеры.' 18))
$pages[1].Controls.Add((Label 'После установки мастер в браузере покажет по одному действию:' 14))
foreach($line in @('1. Нажать Keep it, если браузер спросит.','2. Проверить и закрепить расширение.','3. Выбрать English, пояс региона подключения и CPU.','4. Проверить WebRTC и подключение.','5. Открыть Claude и сверить показания.')){$pages[1].Controls.Add((Label $line 15))}
$pages[1].Controls.Add((Label 'Если используете VPN, подберите пояс его выбранного региона: Германия — Berlin, Великобритания — London. Москву автоматически не подставляйте.' 12))
$pages[1].Controls.Add((Label 'Нажмите «Установить браузеры». Ваши обычные браузеры и их профили останутся отдельными.' 12))
$installLabel=Label 'Подготовка…' 17;$pages[2].Controls.Add($installLabel)
$bar=New-Object Windows.Forms.ProgressBar;$bar.Width=740;$bar.Height=26;$bar.Style='Marquee';$pages[2].Controls.Add($bar)
$pages[2].Controls.Add((Label 'Мастер проверяет архивы, распаковывает выбранные браузеры и автоматически подключает расширение. Дождитесь завершения.' 15))
$pages[3].Controls.Add((Label 'Выберите браузер и откройте рабочее место.' 18))
$launchButtons=@{}
foreach($id in @('chrome','edge','brave')){$spec=Get-RuntimeSpec $id;$b=Button ('Рабочее место — '+$spec.displayName+' →') {try{Start-Workspace (Get-SuiteWorkspace $script:Target $this.Tag);$status.Text='Открыт браузер '+$this.Tag}catch{$status.Text=$_.Exception.Message}} '#24745a';$b.Tag=$id;$launchButtons[$id]=$b;$pages[3].Controls.Add($b)}
$pages[3].Controls.Add((Label 'В следующий раз используйте ярлык нужного браузера или Launch.cmd из рабочей папки. Прямой запуск chrome.exe, msedge.exe или brave.exe не подключает наш профиль.' 13))
$pages[3].Controls.Add((Label 'Не открылось расширение? Откройте подсказку для своего браузера:' 12))
foreach($id in @('chrome','edge','brave')){$spec=Get-RuntimeSpec $id;$helpButton=Button ('Установить и закрепить — '+$spec.displayName) {try{Start-Workspace (Get-SuiteWorkspace $script:Target $this.Tag) -Guide}catch{$status.Text=$_.Exception.Message}} '#246590';$helpButton.Tag=$id;$pages[3].Controls.Add($helpButton)}
function Show-Step([int]$Index){
    $script:Step=[Math]::Max(0,[Math]::Min(3,$Index));foreach($p in $pages){$p.Visible=$false};$pages[$script:Step].Visible=$true;$pages[$script:Step].BringToFront()
    $titles=@('Выберите браузеры и папку','Установите и продолжите в браузере','Устанавливаем браузеры','Ваши браузеры готовы')
    $title.Text=($script:Step+1).ToString()+'. '+$titles[$script:Step];$back.Enabled=$script:Step-eq1;$next.Enabled=$script:Step-ne2
    $next.Text=if($script:Step-eq1){'Установить браузеры →'}elseif($script:Step-eq3){'Закрыть мастер'}else{'Дальше →'}
    if($script:Step-eq3-and$script:Target){$installed=@((Read-Suite $script:Target).installed);foreach($id in $launchButtons.Keys){$launchButtons[$id].Visible=$id-in$installed}}
}
function Begin-Install{
    $selected=@('chrome','edge','brave'|Where-Object {$checks[$_].Checked});if(-not$selected.Count){throw 'Выберите хотя бы один браузер.'}
    $session=Join-Path ([IO.Path]::GetTempPath()) ('claude-mini-setup-'+[Guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($session)|Out-Null
    $script:ProgressFile=Join-Path $session 'progress.json';$script:ResultFile=Join-Path $session 'result.json';$requestFile=Join-Path $session 'request.json'
    $request=@{parent=$folder.Text;browsers=$selected;default=$selected[0];locale='en-US,en';timezone='UTC';cores=0;shortcut=$shortcut.Checked;progress=$script:ProgressFile;result=$script:ResultFile}
    Write-JsonFile $requestFile $request
    $script:Worker=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'Install.ps1')+'"'),'-RequestFile',('"'+$requestFile+'"')) -WindowStyle Hidden -PassThru
    Show-Step 2;$status.Text='Установка выбранных браузеров…';$timer.Start()
}
function Next-Step{switch($script:Step){0{if(-not@('chrome','edge','brave'|Where-Object {$checks[$_].Checked}).Count){throw 'Выберите хотя бы один браузер.'};[void](Get-SuiteTarget $folder.Text);Show-Step 1}1{Begin-Install}3{$form.Close()}}}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=500
$timer.Add_Tick({
    try{if(Test-Path -LiteralPath $script:ProgressFile){$p=Get-Content -LiteralPath $script:ProgressFile -Raw -Encoding UTF8|ConvertFrom-Json;$installLabel.Text=$p.message;if($p.percent-ge0){$bar.Style='Continuous';$bar.Value=[Math]::Min(100,$p.percent)}else{$bar.Style='Marquee'}}}catch{}
    if($script:Worker.HasExited){$timer.Stop();try{$result=Get-Content -LiteralPath $script:ResultFile -Raw -Encoding UTF8|ConvertFrom-Json;if(-not$result.ok){throw $result.error};$script:Target=$result.root;Show-Step 3;$status.Text=$script:Target}catch{Show-Step 0;$status.Text='Установка остановлена: '+$_.Exception.Message}}
})
$form.Add_FormClosing({if($script:Worker-and-not$script:Worker.HasExited){$_.Cancel=$true;$status.Text='Дождитесь завершения установки.'}else{$timer.Stop()}})
foreach($p in $pages){$p.Add_SizeChanged({$width=[Math]::Max(260,$this.ClientSize.Width-35);foreach($c in $this.Controls){if($c-is[Windows.Forms.Label]){$c.MaximumSize=New-Object Drawing.Size($width,0)}elseif($c-is[Windows.Forms.TextBox]-or$c-is[Windows.Forms.ProgressBar]){$c.Width=$width}}})}
Show-Step $RenderStep
if($NoShow){return}
if($RenderOnly){$form.ShowInTaskbar=$false;$form.StartPosition='Manual';$form.Location=New-Object Drawing.Point(-32000,-32000);$form.Show();$form.PerformLayout();[Windows.Forms.Application]::DoEvents();$bmp=New-Object Drawing.Bitmap($form.Width,$form.Height);$form.DrawToBitmap($bmp,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bmp.Save($RenderPath);$bmp.Dispose();$form.Close()}else{[void]$form.ShowDialog()}
$timer.Dispose();$form.Dispose()
