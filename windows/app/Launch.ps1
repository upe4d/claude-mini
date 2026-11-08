param([string]$Browser='')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
try{
    . (Join-Path $PSScriptRoot 'Suite.ps1')
    if(Test-Path -LiteralPath (Join-Path $script:PackageRoot 'suite.json')){
        $suite=Read-Suite $script:PackageRoot
        if($Browser){Start-Workspace (Get-SuiteWorkspace $script:PackageRoot $Browser)}
        elseif(@($suite.installed).Count-eq1){Start-Workspace (Get-SuiteWorkspace $script:PackageRoot $suite.installed[0])}
        else{
            $form=New-Object Windows.Forms.Form;$form.Text='Claude mini — Выберите браузер';$form.StartPosition='CenterScreen';$form.ClientSize=New-Object Drawing.Size(450,280);$form.Font=New-Object Drawing.Font('Segoe UI',14)
            $flow=New-Object Windows.Forms.FlowLayoutPanel;$flow.Dock='Fill';$flow.Padding=New-Object Windows.Forms.Padding(24);$flow.FlowDirection='TopDown';$form.Controls.Add($flow)
            foreach($id in @($suite.installed)){$spec=Get-RuntimeSpec $id;$b=New-Object Windows.Forms.Button;$b.Text='Рабочее место — '+$spec.displayName;$b.Tag=$id;$b.Width=380;$b.Height=58;$b.Add_Click({try{Start-Workspace (Get-SuiteWorkspace $script:PackageRoot $this.Tag);$form.Close()}catch{[void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Claude mini')}});$flow.Controls.Add($b)}
            [void]$form.ShowDialog();$form.Dispose()
        }
    }else{Start-Workspace $script:PackageRoot}
}catch{[void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Claude mini — Ошибка запуска');exit 1}
