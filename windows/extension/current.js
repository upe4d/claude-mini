"use strict";
// One snapshot of the main page after a toolbar click, without network or background scanning.
function readPageValues() {
  return {timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale:Intl.DateTimeFormat().resolvedOptions().locale,
    language:navigator.language,languages:Array.from(navigator.languages),
    cores:navigator.hardwareConcurrency,date:new Date().toString(),checkedAt:Date.now(),origin:location.origin};
}
function boundedValues(value) {
  if(!value||typeof value!=='object')throw Error('READ_FAILED');
  const short=v=>typeof v==='string'?v.slice(0,180):'—';
  return {timezone:short(value.timezone),locale:short(value.locale),language:short(value.language),
    languages:Array.isArray(value.languages)?value.languages.slice(0,10).map(short):[],
    cores:Number.isInteger(value.cores)&&value.cores>0&&value.cores<65536?value.cores:null,
    date:short(value.date),checkedAt:Date.now(),origin:short(value.origin)};
}
function valuesMatch(actual,selected) {
  return (!selected.timezone||actual.timezone===selected.timezone)&&
    (!selected.locale||(actual.languages.join(',')===selected.locale&&actual.locale===selected.locale.split(',')[0]))&&
    (!selected.cores||actual.cores===selected.cores);
}
// У двух сервисов могут оставаться вкладки с разными параметрами. Текущий
// глобальный выбор не заменяет конфигурацию уже открытой вкладки другого сервиса.
function comparisonSelection(origin,tabId,state){
  const service=MiniServices.fromUrl(origin);if(!service)return null;
  const session=state.sessions?.find(item=>item.tabId===tabId&&item.service===service.id);
  const prior=state.serviceLaunches?.['lastLaunch:'+service.id];
  const candidates=[[session,'tab'],[prior,'last_launch'],[state.settings?.service===service.id?state.settings:null,'saved_choice']];
  for(const [candidate,source]of candidates){
    if(!candidate||typeof candidate.timezone!=='string'||typeof candidate.locale!=='string'||!Number.isInteger(candidate.cores))continue;
    try{return {settings:Product.validate({...Product.defaults,...candidate,service:service.id}),source,service};}catch{}
  }
  return null;
}
function renderValues(table,actual,selected) {
  table.replaceChildren();
  const rows=[['Часовой пояс','Timezone',actual.timezone,selected?.timezone],
    ['Язык сайта','Site language',actual.languages.join(', '),selected?.locale?.split(',').join(', ')],
    ['CPU','CPU',actual.cores??'—',selected?.cores||'']];
  for(const [ru,en,current,chosen] of rows){
    const row=document.createElement('tr');
    for(const value of [text(ru,en),current,!selected?text('Нет точки сравнения','No comparison point'):chosen||text('Как в браузере','Browser default')]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}
    if(chosen&&String(current)!==String(chosen))row.className='different';table.append(row);
  }
}
async function readActiveValues() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!MiniServices.fromUrl(tab.url||''))throw Error('PAGE_UNAVAILABLE');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',func:readPageValues});
  if(!result[0]?.result)throw Error('READ_FAILED');
  return {tabId:tab.id,values:boundedValues(result[0].result)};
}
