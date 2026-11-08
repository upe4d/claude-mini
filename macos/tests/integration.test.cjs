// Интеграция настоящего расширения; сайты заменены локальными ответами, без аккаунтов.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'test-cache', 'integration');
fs.mkdirSync(out, {recursive:true});
const exe = process.env.TEST_BROWSER || path.join(root, 'test-cache/windows-browser/chrome-win64/chrome.exe');
const extensionSource = path.join(root, 'extension');
const testNativeRoot = fs.mkdtempSync(path.join(path.dirname(exe),'mini-integration-'));
const extension = path.join(testNativeRoot, 'extension');
fs.cpSync(extensionSource,extension,{recursive:true});
const stamp = Date.now();
const profile = path.join(testNativeRoot, 'profile');
const report = {kind:'Windows CfT integration of macOS extension; local fixtures only',
  macOSNativeVerified:false,realServicesVerified:false,at:new Date().toISOString(),checks:[],errors:[],screenshots:[]};
const extensionId='jnbpljkmhjfhjhmbkeneinfnohebdopg';
const base='chrome-extension://'+extensionId+'/';
const check=(name,extra={})=>{report.checks.push({name,...extra});console.log('PASS',name);};
const sourceHashes=(dir=extensionSource)=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(n=>fs.statSync(path.join(dir,n)).isFile()).sort().map(n=>[n.replaceAll('\\','/'),crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,n))).digest('hex')]));
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
let context;
async function makeContext(ext,existing){
  const args=['--no-first-run','--no-default-browser-check'];
  if(process.env.TEST_ACTION_API!=='0')args.push('--enable-unsafe-extension-debugging');
  if(ext)args.push('--load-extension='+extension);
  const ctx=await chromium.launchPersistentContext(existing||path.join(testNativeRoot,'guide-profile'),{
    executablePath:exe,headless:false,viewport:{width:1440,height:1000},args,
    ignoreDefaultArgs:['--disable-extensions'],acceptDownloads:true,
  });
  report.browserVersion=ctx.browser().version();
  report.executable=exe;
  ctx.on('page',page=>page.on('pageerror',error=>report.errors.push({url:page.url(),message:String(error)})));
  await ctx.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='guide.fixture.test'){
      let rel=decodeURIComponent(u.pathname).replace(/^\//,'');
      const resolved=path.resolve(root,rel);
      if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved))return route.fulfill({status:404,body:'Missing fixture'});
      return route.fulfill({status:200,contentType:types[path.extname(resolved)]||'text/plain',body:fs.readFileSync(resolved)});
    }
    if(['claude.ai','gemini.google.com','accounts.google.com'].includes(u.hostname)){
      const gemini=u.hostname==='gemini.google.com';
      const body=u.hostname==='accounts.google.com'?'<h1>Local OAuth fixture</h1>':gemini?
        '<main><user-query><div class="query-text">Fixture Gemini question</div></user-query><model-response><message-content><p>Fixture Gemini answer.</p><pre><code>const answer = 42;</code></pre></message-content></model-response></main>':
        '<main><div data-testid="user-message">Fixture Claude question</div><div data-testid="assistant-message"><p>Fixture Claude answer.</p><pre><code>const answer = 42;</code></pre></div></main>';
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Fixture '+(gemini?'Gemini':'Claude')+' chat</title>'+body});
    }
    if(['http:','https:'].includes(u.protocol))return route.abort('blockedbyclient');
    return route.continue();
  });
  return ctx;
}
async function shot(page,name){const target=path.join(out,name+'.png');await page.screenshot({path:target,fullPage:true,animations:'disabled'});report.screenshots.push(target);}
async function waitUI(page){await page.waitForFunction(()=>document.querySelector('#saved')?.textContent.includes('сохранён'),{timeout:15000});}
async function guideTests(){
  context=await makeContext(false);
  const page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({url:page.url(),message:String(error)}));
  for(const width of [360,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    await page.goto('http://guide.fixture.test/'+encodeURIComponent('Начните здесь.html'));
    for(let step=0;step<4;step++){
      await page.locator('[data-step="'+step+'"]').click();
      assert.equal(await page.locator('[data-panel]:visible').count(),1);
      assert.equal(await page.locator('[data-panel="'+step+'"]').isVisible(),true);
      const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
      assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify({width,step,bounds}));
      assert.equal(await page.locator('[data-step="'+step+'"]').getAttribute('aria-current'),'step');
    }
    check('Offline wizard single panel and no overflow '+width);
    if(width===390||width===1440)await shot(page,'guide-'+width);
  }
  await page.locator('[data-step="0"]').click();
  await page.locator('[data-panel="0"] .next').click();
  assert.equal(await page.locator('[data-panel="1"]').isVisible(),true);
  await page.locator('[data-panel="1"] .previous').click();
  assert.equal(await page.locator('[data-panel="0"]').isVisible(),true);
  check('Offline wizard next/back');
  assert.ok((await page.locator('body').textContent()).includes('Keep it'));
  check('Offline wizard includes Keep it and manual extension setup');
  await context.close();context=null;
}
async function workerFor(ctx){return ctx.serviceWorkers().find(w=>w.url().startsWith(base))||await ctx.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith(base),timeout:20000});}
async function openAction(ctx,tabPage){
  await tabPage.bringToFront();
  const targetSession=await ctx.newCDPSession(tabPage);
  const {targetInfo}=await targetSession.send('Target.getTargetInfo');
  await targetSession.detach();
  const browserSession=await ctx.browser().newBrowserCDPSession();
  const {targetInfos}=await browserSession.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
  const tabTarget=targetInfos.find(info=>info.type==='tab'&&info.url===tabPage.url());
  report.actionTargets=targetInfos;
  const before=new Set(ctx.pages());
  await browserSession.send('Extensions.triggerAction',{id:extensionId,targetId:tabTarget?.targetId||targetInfo.targetId});
  let popup,popupTarget;
  for(let i=0;i<30;i++){
    popup=ctx.pages().find(p=>p.url().startsWith(base+'popup.html')&&!before.has(p));
    if(popup)break;
    const targets=await browserSession.send('Target.getTargets',{filter:[{}]});
    popupTarget=targets.targetInfos.find(info=>info.url.startsWith(base+'popup.html'));
    if(popupTarget)break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(popup){await browserSession.detach();await popup.waitForLoadState('domcontentloaded');return popup;}
  if(!popupTarget){report.popupTargets=await browserSession.send('Target.getTargets',{filter:[{}]});throw Error('Actual extension action did not expose native popup target');}
  // Chrome представляет нативную панель как other target, а не Playwright Page.
  const {sessionId}=await browserSession.send('Target.attachToTarget',{targetId:popupTarget.targetId,flatten:false});
  let nextId=1;const pending=new Map();
  browserSession.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==sessionId)return;const data=JSON.parse(event.message);if(!data.id)return;
    const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timeout);data.error?task.reject(Error(JSON.stringify(data.error))):task.resolve(data.result);
  });
  const command=(method,params)=>new Promise((resolve,reject)=>{const id=nextId++;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Native popup CDP timeout '+method));},10000);pending.set(id,{resolve,reject,timeout});browserSession.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);});
  const evaluate=async expression=>{const value=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(value.exceptionDetails)throw Error(JSON.stringify(value.exceptionDetails));return value.result.value;};
  return {
    async waitForFunction(fn){for(let i=0;i<100;i++){if(await evaluate('('+fn.toString()+')()'))return;await new Promise(r=>setTimeout(r,100));}throw Error('Native popup condition timeout');},
    locator(selector){return {innerText:()=>evaluate('document.querySelector('+JSON.stringify(selector)+').innerText'),click:()=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()')};},
  };
}
async function extensionTests(){
  context=await makeContext(true,profile);
  const worker=await workerFor(context);
  await worker.evaluate(()=>portableReady);
  const initial=await worker.evaluate(async()=>({saved:await chrome.storage.local.get(null),privacy:await chrome.privacy.network.webRTCIPHandlingPolicy.get({})}));
  assert.equal(initial.saved.portableInitialized,true);
  assert.equal(initial.privacy.value,'disable_non_proxied_udp');
  assert.equal(initial.privacy.levelOfControl,'controlled_by_this_extension');
  check('Service worker initialized settings and WebRTC restriction');
  let wizard;
  for(let i=0;i<100;i++){wizard=context.pages().find(p=>p.url().startsWith(base+'onboarding.html'));if(wizard)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(wizard,'Startup should open first-run onboarding automatically');
  await wizard.waitForSelector('#pin-confirmed');
  assert.equal(await wizard.locator('.wizard-step:visible').count(),1);
  assert.equal(await wizard.locator('#next').isDisabled(),true);
  await wizard.locator('#pin-confirmed').check();await wizard.locator('#next').click();
  await wizard.waitForSelector('[data-step="1"]:visible');
  await wizard.selectOption('#setup-service','gemini');await wizard.selectOption('#setup-timezone','UTC');await wizard.selectOption('#setup-locale','en-GB,en');await wizard.selectOption('#setup-cores','2');
  await wizard.locator('#next').click();await wizard.waitForSelector('[data-step="2"]:visible');
  assert.match(await wizard.locator('#privacy-state').innerText(),/включено/);
  await wizard.locator('#next').click();await wizard.waitForSelector('[data-step="3"]:visible');
  await wizard.locator('#finish').click();await wizard.waitForURL(base+'workspace.html');
  const completed=await worker.evaluate(async()=>(await chrome.storage.local.get('onboardingComplete')).onboardingComplete);
  assert.equal(completed,true);check('Actual first-run wizard pin/settings/WebRTC/finish opens workspace');
  const workspace=wizard;await waitUI(workspace);assert.equal(await workspace.locator('#cores').inputValue(),'2');
  assert.equal(await workspace.locator('#service option').count(),2);
  check('Workspace contains Claude and Gemini');
  for(const width of [360,390,768,1440]){
    await workspace.setViewportSize({width,height:1000});
    const bounds=await workspace.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
    assert.ok(bounds.scroll<=bounds.width+1,JSON.stringify(bounds));
    check('Workspace no overflow '+width);
  }
  await workspace.setViewportSize({width:1440,height:1000});
  await workspace.selectOption('#service','claude');await workspace.selectOption('#timezone','UTC');await workspace.selectOption('#locale','en-US,en');await workspace.selectOption('#cores','2');
  assert.match(await workspace.locator('#saved').innerText(),/не сохранён/);
  await workspace.selectOption('#service','gemini');await workspace.selectOption('#locale','en-GB,en');await workspace.selectOption('#cores','4');
  await workspace.locator('#save').click();await waitUI(workspace);
  assert.match(await workspace.locator('#save').innerText(),/Сохранено/);
  assert.match(await workspace.locator('#saved').innerText(),/Выбор сохранён/);
  const persisted=await worker.evaluate(async()=>(await chrome.storage.local.get('settings')).settings);
  assert.deepEqual({service:persisted.service,timezone:persisted.timezone,locale:persisted.locale,cores:persisted.cores},{service:'gemini',timezone:'UTC',locale:'en-GB,en',cores:4});
  check('Save feedback and persisted service/timezone/language/CPU');
  await shot(workspace,'workspace-saved');
  const guards=await worker.evaluate(()=>['https://claude.ai/','https://gemini.google.com/app','https://accounts.google.com/','https://claude.ai.evil.test/','http://claude.ai/','https://claude.ai:444/','https://evil@claude.ai/'].map(url=>({url,service:MiniServices.fromUrl(url)?.id||null})));
  assert.deepEqual(guards.map(x=>x.service),['claude','gemini',null,null,null,null,null]);
  check('Strict service origins exclude OAuth/host lookalikes/HTTP/ports/userinfo');
  report.debuggerProbe=await worker.evaluate(async()=>{const tab=await chrome.tabs.create({url:'about:blank',active:false});try{await chrome.debugger.attach({tabId:tab.id},'1.3');await chrome.debugger.detach({tabId:tab.id});return {ok:true};}catch(e){return {error:e.message};}finally{await chrome.tabs.remove(tab.id);}});console.log('DEBUGGER',JSON.stringify(report.debuggerProbe));
  report.applyProbe=await worker.evaluate(async()=>{const tab=await chrome.tabs.create({url:'about:blank',active:false});try{const s=(await chrome.storage.local.get('settings')).settings;await BrowserSessions.apply(tab.id,s);await chrome.debugger.detach({tabId:tab.id});return {ok:true};}catch(e){return {error:e.message,stack:e.stack};}finally{await chrome.tabs.remove(tab.id);}});console.log('APPLY',JSON.stringify(report.applyProbe));
  assert.equal(report.applyProbe.ok,true,'Existing settings API compatibility: '+JSON.stringify(report.applyProbe));
  for(const service of ['gemini','claude']){
    await workspace.bringToFront();await workspace.selectOption('#service',service);await workspace.locator('#save').click();await waitUI(workspace);
    const opening=context.waitForEvent('page');await workspace.locator('#launch').click();const tab=await opening;
    const expected=service==='gemini'?'https://gemini.google.com/app':'https://claude.ai/';
    await tab.waitForURL(expected,{timeout:15000});await tab.waitForLoadState('domcontentloaded');
    check('Launch '+service+' uses exact expected URL',{url:tab.url()});
    const snapshot=await tab.evaluate(()=>({zone:Intl.DateTimeFormat().resolvedOptions().timeZone,language:navigator.language,cores:navigator.hardwareConcurrency}));
    assert.deepEqual(snapshot,{zone:'UTC',language:'en-GB',cores:4});
    check('Configured '+service+' fixture reports selected values',{snapshot});
    const chatUrl=service==='gemini'?'https://gemini.google.com/app/fixture-id?token=remove#private':'https://claude.ai/chat/fixture-id?token=remove#private';
    await tab.goto(chatUrl);
    const popup=await openAction(context,tab);
    await popup.waitForFunction(()=>document.querySelector('#current-values')?.children.length===3,{timeout:10000});
    assert.match(await popup.locator('#current-state').innerText(),/совпадают/);
    assert.match(await popup.locator('#current-values').innerText(),/UTC/);
    check('Actual toolbar popup reads '+service+' tab measurements');
    const previewOpened=context.waitForEvent('page',{predicate:p=>p.url().startsWith(base+'preview.html')});
    await popup.locator('#export').click();const preview=await previewOpened;
    await preview.waitForFunction(()=>document.querySelectorAll('#messages article').length===2,{timeout:10000});
    assert.equal(await preview.locator('#messages article h2').nth(1).innerText(),service==='gemini'?'Gemini':'Claude');
    for(const format of ['txt','md','json']){
      const download=preview.waitForEvent('download');await preview.locator('[data-format="'+format+'"]').click();const file=await download;
      const target=path.join(out,service+'-fixture.'+format);await file.saveAs(target);
      const text=fs.readFileSync(target,'utf8');assert.ok(text.includes('Fixture'));
      if(format==='json'){
        const chat=JSON.parse(text);assert.equal(chat.service.id,service);assert.equal(chat.messages.length,2);assert.ok(!chat.url.includes('?')&&!chat.url.includes('#'));assert.equal(chat.complete,false);
      }
    }
    await preview.evaluate(()=>{window.print=()=>{window.__printRequested=true;};});
    await preview.locator('#print').click();assert.equal(await preview.evaluate(()=>window.__printRequested),true);
    check('Preview labels and TXT/MD/JSON downloads + PDF print request '+service);
    await shot(preview,'preview-'+service);
    await tab.goto('https://accounts.google.com/fixture');
    await workspace.bringToFront();
    await workspace.waitForTimeout(300);
    const detached=await worker.evaluate(async()=>BrowserSessions.list());
    assert.ok(detached.some(x=>x.service===service&&!x.active&&x.issue==='LEFT_SERVICE'));
    check('Configured '+service+' tab detaches on local OAuth navigation');
    await preview.close();await tab.close();
  }
  await context.close();context=null;
  context=await makeContext(true,profile);const restarted=await workerFor(context);await restarted.evaluate(()=>portableReady);
  const values=await restarted.evaluate(async()=>(await chrome.storage.local.get('settings')).settings);
  assert.equal(values.service,'claude');assert.equal(values.cores,4);assert.equal(values.timezone,'UTC');
  let page;
  for(let i=0;i<100;i++){page=context.pages().find(p=>p.url().startsWith(base+'workspace.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page,'Startup should open workspace automatically after onboarding');
  assert.equal(context.pages().some(p=>p.url().startsWith(base+'onboarding.html')),false);
  await waitUI(page);
  assert.equal(await page.locator('#cores').inputValue(),'4');
  check('Own profile restart preserves saved settings');
  await context.close();context=null;
}
(async()=>{
  report.sourceHashes=sourceHashes();
  report.testExtensionHashes=sourceHashes(extension);report.nativeTestRoot=testNativeRoot;
  try{assert.deepEqual(report.testExtensionHashes,report.sourceHashes);await guideTests();if(!process.argv.includes('--guide-only'))await extensionTests();assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.passed=true;}
  catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
  finally{if(context)await context.close();report.sourceUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(sourceHashes());fs.writeFileSync(path.join(out,process.argv.includes('--guide-only')?'guide-ui-tests.json':'integration-tests.json'),JSON.stringify(report,null,2));console.log('REPORT',report.passed,report.checks.length,report.sourceUnchanged);}
})();
