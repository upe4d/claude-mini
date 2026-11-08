"use strict";
const status=document.getElementById('status');
bindAction('workspace',()=>chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')}));
bindAction('launch',async()=>{const s=await send('state');if(!s.onboardingComplete){await chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html')});window.close();return;}await send('launch');window.close();});
bindAction('export',async()=>{
  try { await captureForPreview();window.close(); }
  catch(error){status.textContent=error.message==='OPEN_CHAT'?text('Откройте нужный чат Claude и снова нажмите значок расширения.','Open a Claude chat, then click the extension icon again.'):error.message==='NO_MESSAGES'?text('Сообщения не найдены. Дождитесь ответа и повторите.','No messages found. Wait for the answer and try again.'):text('Чат не удалось прочитать. Откройте его заново и повторите экспорт.','Could not read this chat. Reopen it and export again.');}
});
let popupState;
async function refreshCurrent(){
  const label=document.getElementById('current-state');
  label.textContent=text('Читаем параметры…','Reading settings…');
  document.getElementById('current-values').replaceChildren();
  for(const id of ['current-meta','current-date','current-session'])document.getElementById(id).textContent='';
  popupState=await send('state');
  const enabled=popupState.privacy.value==='disable_non_proxied_udp';
  document.getElementById('popup-webrtc').textContent=enabled?text('Ограничение включено','Restriction on'):text('Ограничение выключено','Restriction off');
  try{
    const {tabId,values}=await readActiveValues();
    renderValues(document.getElementById('current-values'),values,popupState.settings);
    const match=valuesMatch(values,popupState.settings);
    label.textContent=match?text('Измеренные значения соответствуют сохранённому выбору.','Measured values match your saved choice.'):text('Есть отличия от сохранённого выбора. Откройте рабочее место.','Values differ from your saved choice. Open the workspace.');
    label.className=match?'match':'different';
    document.getElementById('current-meta').textContent=values.origin+' · '+new Date(values.checkedAt).toLocaleTimeString();
    document.getElementById('current-date').textContent=values.date;
    const session=popupState.sessions.find(v=>v.tabId===tabId);
    document.getElementById('current-session').textContent=session?.issue?text('Настройка прервана или неполна. Откройте Claude заново из рабочего места.','Settings were interrupted or incomplete. Reopen Claude from the workspace.'):session?.active?text('Настройки подключены к этой вкладке.','Settings are attached to this tab.'):text('Настройки расширения к этой вкладке не подключены.','No extension settings are attached to this tab.');
  }catch{
    label.className='note';label.textContent=text('Для показаний откройте сайт и нажмите значок расширения на нём. Служебные страницы браузера недоступны.','Open a website and click the extension icon there to read values. Browser internal pages cannot be read.');
  }
}
bindAction('refresh-current',refreshCurrent);
send('state').then(async state=>{
  translate(state.settings.ui);
  document.getElementById('summary').textContent=text('Для экспорта откройте нужный чат и дождитесь ответа.','To export, open a chat and wait for the answer.');
  const issues=state.sessions.some(v=>v.issue);
  if(issues)status.textContent=text('Настройки одной из вкладок прерваны. Откройте рабочее место.','A tab setting was interrupted. Open the workspace.');
  await refreshCurrent();
}).catch(error=>{status.textContent=errorText(error);});
