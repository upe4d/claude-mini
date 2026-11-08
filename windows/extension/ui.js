"use strict";
let uiLanguage = 'ru';
const text = (ru,en) => uiLanguage === 'en' ? en : ru;
function translate(lang) {
  uiLanguage = lang; document.documentElement.lang = lang;
  for (const element of document.querySelectorAll('[data-ru][data-en]')) element.innerHTML=element.dataset[lang];
  document.querySelectorAll('[data-referral]').forEach(a=>{a.href=Product.referral;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';});
}
const uiErrors = {
  SELECT_SUPPORTED_TIMEZONE:['Откройте рабочее место и выберите пояс региона подключения. Москва из старого профиля требует замены.','Open the workspace and choose the connection region timezone. Replace Moscow retained from an old profile.'],
  SELECT_REGION_TIMEZONE:['Выберите явный часовой пояс региона подключения перед сохранением.','Choose an explicit connection-region timezone before saving.'],
  CONNECTION_FAILED:['Не удалось проверить подключение. Проверьте интернет или VPN и повторите.','Connection check failed. Check your connection or VPN and retry.'],
  CHECK_CONNECTION_FIRST:['Сначала нажмите «Проверить подключение».','Check your connection first.'],
  PRO_REQUIRED:['Экспериментальные настройки доступны в Claude mini Pro.','Experimental settings are available in Claude mini Pro.'],
  INVALID_SETTINGS:['Не удалось сохранить выбор. Выберите значения из списка.','Choose values from the available lists.'],
  LAUNCH_FAILED:['Не удалось применить настройки. Закройте DevTools этой вкладки или выберите настройки браузера и повторите запуск.','Settings could not be applied. Close DevTools or choose browser defaults and try again.'],
  WEBRTC_CONFLICT:['Настройкой WebRTC управляет другое расширение или организация.','Another extension or organization controls WebRTC.'],
  WEBRTC_RELEASE_FAILED:['Браузер не снял наше ограничение. Повторите действие.','The browser did not release our setting. Try again.'],
  RESET_INCOMPLETE:['Не все вкладки удалось перезагрузить. Закройте вкладки с настройками и заново откройте нужный сервис из рабочего места.','Some tabs could not be reloaded. Close configured tabs and reopen the selected service from the workspace.'],
  NO_BACKUP:['Ещё не было импорта. Предыдущий выбор отсутствует.','No settings have been imported yet. There is no previous selection.'],
};
function errorText(error) { const pair=uiErrors[error.message];return pair?text(...pair):text('Не получилось выполнить действие. Перезагрузите расширение и повторите.','Action failed. Reload the extension and try again.'); }
async function send(type, extra={}) { const result=await chrome.runtime.sendMessage({type,...extra});if(!result?.ok)throw Error(result?.error||'REQUEST_FAILED');return result; }
function download(content,mime,name) { const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000); }
function bindAction(id, task) {
  const button=document.getElementById(id);if(!button)return;
  button.addEventListener('click',async()=>{button.disabled=true;try{await task();}catch(error){document.getElementById('status').textContent=errorText(error);}finally{button.disabled=false;if(typeof renderState==='function'&&state)renderState();}});
}
