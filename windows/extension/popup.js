"use strict";
const status=document.getElementById('status');
let popupState;
bindAction('workspace',()=>chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')}));
bindAction('launch',async()=>{
  const value=await send('state');
  await send('save',{settings:{...value.settings,service:document.getElementById('popup-service').value}});
  if(!value.onboardingComplete){await chrome.tabs.create({url:chrome.runtime.getURL('onboarding.html')});window.close();return;}
  await send('launch');window.close();
});
bindAction('export',async()=>{
  try{await captureForPreview();window.close();}
  catch(error){status.textContent=error.message==='OPEN_CHAT'?text('Откройте нужный чат Claude или Gemini и нажмите значок расширения.','Open a Claude or Gemini chat, then click the extension icon.'):text('Сообщения не найдены или интерфейс сайта изменился. Обновите чат и повторите.','Messages are missing or the site layout changed. Refresh the chat and try again.');}
});
async function refreshCurrent(){
  popupState=await send('state');const label=document.getElementById('current-state');
  document.getElementById('current-values').replaceChildren();
  for(const id of ['current-meta','current-date','current-session'])document.getElementById(id).textContent='';
  const privacy=popupState.privacy||{};
  document.getElementById('popup-webrtc').textContent=privacy.value==='disable_non_proxied_udp'&&privacy.levelOfControl==='controlled_by_this_extension'?text('Ограничен','Restricted'):text('Не ограничен нами','Not restricted by us');
  try{
    const {tabId,values}=await readActiveValues();
    const reference=comparisonSelection(values.origin,tabId,popupState);
    renderValues(document.getElementById('current-values'),values,reference?.settings);
    const match=reference?valuesMatch(values,reference.settings):null;
    label.className=match===null?'note':match?'match':'different';
    label.textContent=match===null?text('Для этого сервиса нет сохранённой точки сравнения. Совпадение не подтверждено.','No comparison point exists for this service. A match is not confirmed.'):match?text('Измеренные значения совпадают с выбором для этой вкладки или сервиса.','Measured values match the reference for this tab or service.'):text('Есть отличия от выбора для этой вкладки или сервиса. Проверьте рабочее место.','Values differ from the reference for this tab or service. Check the workspace.');
    document.getElementById('current-meta').textContent=values.origin+' · '+new Date(values.checkedAt).toLocaleTimeString();document.getElementById('current-date').textContent=values.date;
    const session=popupState.sessions.find(item=>item.tabId===tabId);
    document.getElementById('current-session').textContent=session?.active?text('Настройки подключены к этой вкладке.','Settings are attached to this tab.'):text('Подключение настроек к этой вкладке не подтверждено.','Settings attachment to this tab is not confirmed.');
  }catch{label.className='note';label.textContent=text('Откройте Claude или Gemini и нажмите значок расширения на его вкладке. Служебные страницы и страницы входа Google не проверяются.','Open Claude or Gemini and click the extension icon on its tab. Browser and Google sign-in pages are not inspected.');}
}
bindAction('refresh-current',refreshCurrent);
send('state').then(async value=>{translate(value.settings.ui);document.getElementById('popup-service').value=value.settings.service;await refreshCurrent();}).catch(error=>status.textContent=errorText(error));
