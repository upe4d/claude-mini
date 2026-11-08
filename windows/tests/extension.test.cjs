'use strict';
// Проверяем границы сервисов и отсутствие переходов в OAuth через запуск настроек.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.join(__dirname,'..','extension'),report={passed:false,checks:[],limitations:['Fixture tests do not confirm the current authenticated Gemini interface.']};
function check(name,task){task();report.checks.push(name);}
const sandbox={URL,console,module:{exports:{}}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(base,'services.js'),'utf8')+'\nglobalThis.services=MiniServices;',sandbox);
const services=sandbox.services;
check('Claude and Gemini use exact HTTPS hosts',()=>{assert.equal(services.fromUrl('https://claude.ai/chat/test').id,'claude');assert.equal(services.fromUrl('https://gemini.google.com/app/123').id,'gemini');});
check('OAuth, lookalike hosts, credentials, protocol and custom ports rejected',()=>{for(const url of ['https://accounts.google.com/','http://claude.ai/','https://claude.ai.evil.example/','https://user:pass@claude.ai/','https://gemini.google.com:444/','javascript:alert(1)','https://claude.ai@evil.example/','https://evil.example/claude.ai'])assert.equal(services.fromUrl(url),null,url);});
check('Export strips query and hash',()=>assert.equal(services.exportUrl('https://gemini.google.com/app/abc?auth=secret#private'),'https://gemini.google.com/app/abc'));
check('Service baselines have distinct keys',()=>assert.notEqual(services.comparisonKey('claude'),services.comparisonKey('gemini')));
vm.runInContext(fs.readFileSync(path.join(base,'preset.js'),'utf8')+fs.readFileSync(path.join(base,'config.js'),'utf8')+'\nglobalThis.product=Product;',sandbox);
const product=sandbox.product;
check('Old exported settings migrate to Claude without losing values',()=>{const value=product.validate({timezone:'Europe/London',locale:'en-GB,en',cores:8,ui:'ru'});assert.equal(value.service,'claude');assert.equal(value.cores,8);});
check('Saved Gemini settings route to Gemini only',()=>{const value=product.validate({...product.defaults,service:'gemini'});assert.equal(product.target(value),'https://gemini.google.com/app');});
check('Unknown or tampered service rejected',()=>{assert.throws(()=>product.validate({...product.defaults,service:'https://evil.example'}),/INVALID_SETTINGS/);assert.throws(()=>product.target({service:'google'}),/INVALID_SETTINGS/);});
check('CPU remains available free',()=>{assert.equal(product.cpu,true);assert.equal(product.edition,'free');assert.equal(product.validate({...product.defaults,cores:4}).cores,4);});
const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
check('No permanent Claude, Gemini, OAuth or wildcard host access requested',()=>{assert.deepEqual(manifest.host_permissions,['https://www.cloudflare.com/*']);assert.ok(!manifest.permissions.includes('cookies'));assert.ok(!manifest.permissions.includes('tabs'));assert.ok(!manifest.permissions.includes('webRequest'));});
check('Only local free scripts loaded',()=>{for(const name of ['workspace.html','popup.html','onboarding.html','preview.html','guide.html']){const html=fs.readFileSync(path.join(base,name),'utf8');for(const [,file]of html.matchAll(/<script\s+src="([^"]+)"/g)){assert.ok(!file.includes('://'));assert.ok(fs.existsSync(path.join(base,file)),file);}assert.ok(!/macOS|\bMac\b|⌘|\.command/.test(html));assert.ok(!html.includes('pro.html'));}});
check('Current measurements restricted to supported service origin',()=>assert.ok(fs.readFileSync(path.join(base,'current.js'),'utf8').includes('!MiniServices.fromUrl(tab.url')));
check('Startup waits for settings and opens workspace on subsequent runs',()=>{const code=fs.readFileSync(path.join(base,'startup-runtime.js'),'utf8');assert.ok(code.includes('then(()=>portableReady)'));assert.ok(code.includes("saved.onboardingComplete?'workspace.html':'onboarding.html'"));});
check('OAuth navigation detaches configuration',()=>{const code=fs.readFileSync(path.join(base,'sessions.js'),'utf8');assert.ok(code.includes("method!=='Page.frameNavigated'"));assert.ok(code.includes("MiniServices.fromUrl(url)?.id===entry.service"));assert.ok(code.includes("issue:'LEFT_SERVICE'"));});
report.passed=true;fs.writeFileSync(path.join(__dirname,'extension-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:report.checks.length}));
