"use strict";
const guideViews=['install','start','export','help'];
let guideMode='install',guideStep=0;
const inExtension=location.protocol==='chrome-extension:';
const prefix=inExtension||location.pathname.endsWith('/guide.html')?'':'extension/';
function guideStatus(message){document.getElementById('wizard-status').textContent=message;}
async function copyGuide(value){
  try{await navigator.clipboard.writeText(value);}
  catch{
    const field=document.createElement('textarea');field.value=value;document.body.append(field);field.select();
    const ok=document.execCommand('copy');field.remove();if(!ok)throw Error('Не удалось скопировать. Выделите путь мышью и нажмите Ctrl + C.');
  }
}
function showGuide(view,focus=false){
  for(const id of guideViews){const section=document.getElementById(id);section.hidden=id!==view;section.classList.add('guide-view');}
  document.querySelectorAll('.guide-menu [data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  if(focus){const h=document.querySelector('#'+view+' h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
}
function renderGuide(){
  const total=guideMode==='install'?7:2;
  guideStep=Math.max(0,Math.min(total-1,guideStep));
  document.querySelectorAll('[data-step],[data-update]').forEach(el=>el.hidden=Number(el.dataset[guideMode==='install'?'step':'update'])!==guideStep);
  const progress=document.getElementById('wizard-progress');progress.replaceChildren();
  const labels=guideMode==='install'?['Подготовка','Страница','Режим','Папка','Проверка','Закрепить','Рабочее место']:['Файлы','Карточка'];
  labels.forEach((name,i)=>{const b=document.createElement('button');b.textContent=(guideMode==='update'?(i+1)+'. ':i?i+'. ':'')+name;b.className='secondary';b.setAttribute('aria-current',i===guideStep?'step':'false');b.onclick=()=>{guideStep=i;renderGuide();};progress.append(b);});
  document.getElementById('wizard-counter').textContent=guideMode==='install'?(guideStep?'Шаг '+guideStep+' из 6':'Подготовка к установке'):'Шаг '+(guideStep+1)+' из '+total;
  document.getElementById('wizard-back').disabled=guideStep===0;
  document.getElementById('wizard-next').textContent=guideStep===total-1?'К рабочему месту →':'Дальше →';
  document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===guideMode)));
  guideStatus('');
}
function routeGuide(){
  const hash=location.hash.slice(1),[view,step]=hash.split('/');
  if(view==='privacy'||view==='technical'){showGuide('help');document.getElementById('technical').open=true;if(view==='privacy')document.getElementById('privacy').open=true;return;}
  if(view==='update'){guideMode='update';guideStep=Number(step)||0;showGuide('install');renderGuide();return;}
  showGuide(guideViews.includes(view)?view:'install');
  if(view==='install'){guideMode='install';guideStep=Number(step)||0;}renderGuide();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{location.hash=b.dataset.view;showGuide(b.dataset.view,true);});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{guideMode=b.dataset.mode;guideStep=0;renderGuide();});
document.getElementById('wizard-back').onclick=()=>{guideStep--;renderGuide();};
document.getElementById('wizard-next').onclick=()=>{if(guideStep===(guideMode==='install'?6:1)){location.hash='start';}else{guideStep++;renderGuide();}};
document.querySelector('[data-open-update]').onclick=()=>{location.hash='update/0';};
document.querySelectorAll('[data-browser]').forEach(b=>b.onclick=async()=>{
  const address=b.dataset.browser==='chrome'?'chrome://extensions/':'edge://extensions/';
  const target=document.getElementById('internal-page-status');
  try{
    if(inExtension){await chrome.tabs.create({url:address});target.textContent='Список расширений открыт в новой вкладке.';}
    else{await copyGuide(address);target.textContent='Адрес скопирован. В рабочем браузере: Ctrl + L → Ctrl + V → Enter.';}
  }catch{target.textContent='Введите в адресную строку рабочего браузера: '+address;}
});
const path=window.InstallInfo?.extensionPath;
if(path)document.getElementById('extension-path').textContent=path;
document.getElementById('copy-extension-path').onclick=async()=>{try{if(!path){guideStatus('Сначала создайте рабочую папку в Setup.cmd. В мастере есть кнопка «Скопировать путь папки».');return;}await copyGuide(path);guideStatus('Путь скопирован. В окне выбора папки: Ctrl + L → Ctrl + V → Enter.');}catch(e){guideStatus(e.message);}};
document.querySelectorAll('[data-workspace]').forEach(b=>b.onclick=async()=>{
  if(inExtension){await chrome.tabs.create({url:chrome.runtime.getURL('workspace.html')});return;}
  // file: pages cannot reliably navigate to browser-internal URLs.
  const p=document.createElement('p');p.className='notice';p.textContent='В отдельном рабочем браузере нажмите Ctrl + T. Или в Setup.cmd нажмите «Открыть рабочее место Claude».';
  const old=b.parentElement.querySelector('[data-workspace-hint]');if(old)old.remove();p.dataset.workspaceHint='true';b.after(p);
});
document.querySelectorAll('[data-pro]').forEach(a=>a.href=prefix+'pro.html');
window.addEventListener('hashchange',routeGuide);routeGuide();
