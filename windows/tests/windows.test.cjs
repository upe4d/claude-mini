'use strict';
// Проверяем Windows-пути и подсказки без запуска установщика и без сети.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),base=path.join(root,'extension'),checks=[];
function check(name,task){task();checks.push(name);}
const code=fs.readFileSync(path.join(base,'browser-ui.js'),'utf8');
function browser(stamp,query=''){
 const sandbox={URLSearchParams,location:{search:query}};
 if(stamp!==undefined)sandbox.InstallBrowser=stamp;
 vm.createContext(sandbox);vm.runInContext(code+'\nglobalThis.result=WindowsBrowser;',sandbox);return sandbox.result;
}
for(const id of ['chrome','edge','brave'])check(id+' uses its own internal URL and exact profile folder',()=>{
 const result=browser({id,extensionPath:'C:\\Mini\\'+id+'\\extension'});
 assert.equal(result.id,id);assert.equal(result.extensionsURL,id+'://extensions/');assert.equal(result.extensionPath,'C:\\Mini\\'+id+'\\extension');
 assert.ok(result.pinHint.includes(id==='edge'?'Показать на панели инструментов':'булавку'));
 assert.ok(result.keepHint.includes(id==='edge'?'Keep changes':'Keep it'));
});
check('Installed stamp wins over query; query cannot redirect to arbitrary scheme',()=>{
 assert.equal(browser({id:'edge'},'?browser=brave').id,'edge');assert.equal(browser(undefined,'?browser=brave').id,'brave');
 assert.equal(browser({id:'https://evil.example'},'?browser=javascript:alert(1)').extensionsURL,'chrome://extensions/');
});
check('Onboarding loads browser helper after installer preset and displays all hints',()=>{
 const html=fs.readFileSync(path.join(base,'onboarding.html'),'utf8');
 assert.ok(html.indexOf('preset.js')<html.indexOf('browser-ui.js'));assert.ok(html.indexOf('browser-ui.js')<html.indexOf('onboarding.js'));
 for(const id of ['browser-name','pin-hint','keep-hint','developer-hint','extensions-address','extension-path'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(html.includes('Ctrl + T'));assert.ok(html.includes('Launch.cmd'));
});
check('Windows package is explicitly a free 0.14.1 prerelease for two services',()=>{
 const release=JSON.parse(fs.readFileSync(path.join(root,'Release.json'),'utf8'));
 assert.equal(release.version,'0.14.1');assert.equal(release.edition,'free');assert.equal(release.platform,'windows');assert.equal(release.channel,'prerelease');
 assert.deepEqual(release.services,['claude','gemini']);assert.equal(release.cpuSelection,true);assert.equal(release.proTools,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8')).version,'0.14.1');
});
check('Runtime versions and initial file-guide registration guard are preserved',()=>{
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base,'locale-runtime.js'))).digest('hex'),'fa6803d1135933e71234f4599e03ee047759f441741b54c1ad66b973d880b2a3');
 const runtimes=JSON.parse(fs.readFileSync(path.join(root,'app','runtimes.json'),'utf8'));
 const original=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','runtimes-0.13.1.json'),'utf8'));
 const clone=JSON.parse(JSON.stringify(runtimes));clone.productVersion=original.productVersion;assert.deepEqual(clone,original);
 const workspace=fs.readFileSync(path.join(root,'app','Workspace.ps1'),'utf8');assert.ok(workspace.includes('Test-WorkspaceRunning'));assert.ok(workspace.includes('$launch=Get-PortableLaunch $Root -Guide'));
 assert.ok(workspace.includes('Write-InstallPreset $Root $Browser $config.preset'));assert.ok(workspace.includes('if(-not$exists)'));
});
fs.writeFileSync(path.join(__dirname,'windows-tests.json'),JSON.stringify({passed:true,checks},null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length}));
