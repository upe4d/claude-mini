'use strict';
// Реальный Chromium, но полностью локальные DOM-образцы: к аккаунтам не обращаемся.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const capture=fs.readFileSync(path.join(__dirname,'..','extension','capture.js'),'utf8');
const formats=require(path.join(__dirname,'..','extension','chat-formats.js'));
const report={passed:false,checks:[],network:'All page requests intercepted; no real service connection',limitations:['Selectors tested against fixtures. Current authenticated Gemini interface is not verified.','This test uses local fixtures in Chromium on Windows; it does not log in to either service.']};
async function run(){
 const browser=await chromium.launch({executablePath:process.env.MINI_TEST_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext();let fixture='';
  await context.route('**/*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<!doctype html><title>Чат проверки</title>'+fixture}));
  const page=await context.newPage();
  async function read(url,id,html){fixture=html;await page.goto(url);await page.addScriptTag({content:capture+'\nwindow.testCapture=captureClaudeChat;'});return page.evaluate(value=>window.testCapture(value),id);}
  const claude=await read('https://claude.ai/chat/fixture?token=secret#private','claude','<div data-testid="user-message"><p>Вопрос</p><button>Не включать</button></div><div data-testid="assistant-message"><div class="font-claude-response"><p>Ответ <strong>важный</strong></p><pre><code>const a = `code`;</code></pre></div></div><div data-testid="assistant-message" hidden>Скрытая ветка</div>');
  assert.equal(claude.messages.length,2);assert.deepEqual(claude.messages.map(item=>item.role),['user','assistant']);assert.equal(claude.service.label,'Claude');assert.ok(!claude.messages[0].text.includes('Не включать'));assert.ok(claude.messages[1].markdown.includes('**важный**'));assert.ok(claude.messages[1].markdown.includes('const a = `code`;'));assert.equal(claude.url,'https://claude.ai/chat/fixture');assert.equal(claude.complete,false);report.checks.push('Claude nested messages, roles, markdown, hidden branch and URL stripping');
  const gemini=await read('https://gemini.google.com/app/fixture?authuser=2#secret','gemini','<user-query><div class="query-text"><p>Привет</p></div><button>Изменить</button></user-query><model-response><message-content><p>Ответ Gemini</p><pre><code>````</code></pre></message-content><button>Оценка</button></model-response><user-query aria-hidden="true"><div class="query-text">Скрытый</div></user-query><user-query><div class="query-text">Второй вопрос</div></user-query><model-response><div class="model-response-text"><p>Второй ответ</p><a href="javascript:alert(1)">текст</a></div></model-response>');
  assert.equal(gemini.messages.length,4);assert.deepEqual(gemini.messages.map(item=>item.role),['user','assistant','user','assistant']);assert.equal(gemini.service.label,'Gemini');assert.ok(!JSON.stringify(gemini.messages).includes('Оценка'));assert.ok(!JSON.stringify(gemini.messages).includes('Изменить'));assert.ok(!gemini.messages[3].markdown.includes('javascript:'));assert.equal(gemini.url,'https://gemini.google.com/app/fixture');report.checks.push('Gemini multi-turn order, explicit roles, controls excluded, safe links and clean URL');
  const md=formats.render(gemini,'md'),txt=formats.render(gemini,'txt'),json=JSON.parse(formats.render(gemini,'json'));assert.ok(md.includes('## Gemini'));assert.ok(!md.includes('## Claude'));assert.ok(txt.includes('Gemini:'));assert.equal(json.service.id,'gemini');assert.equal(json.complete,false);report.checks.push('MD, TXT and JSON preserve Gemini identity and incomplete-history flag');
  for(const [url,id,html]of [['https://accounts.google.com/','gemini','<model-response>secret</model-response>'],['https://gemini.google.com/app/fixture','claude','<model-response>secret</model-response>'],['https://gemini.google.com/app/fixture','gemini','<main>Unrelated page and account menu</main>']]){await assert.rejects(read(url,id,html));}report.checks.push('OAuth origin, service mismatch after navigation and unrecognized DOM fail explicitly');
  await context.close();report.passed=true;
 }finally{await browser.close();}
 fs.writeFileSync(path.join(__dirname,'capture-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:report.checks.length}));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
