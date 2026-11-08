'use strict';
// Сохранённый выбор и измеренные показания намеренно не смешиваются.
let state, dirty=false, saving=false;
const status=document.getElementById('status'), node=id=>document.getElementById(id);
const fields=['service','locale','timezone','cores'];
function selection(){return {service:node('service').value,locale:node('locale').value,timezone:node('timezone').value,cores:Number(node('cores').value),ui:node('ui-language').value};}
function setFields(settings){for(const id of fields)node(id).value=String(settings[id]);node('ui-language').value=settings.ui;}
function chosen(key,value){return key==='locale'?(value?value.split(',').join(', '):text('Как в браузере','Browser default')):value||text('Как в браузере','Browser default');}
function changed(){const next=selection();dirty=fields.some(key=>next[key]!==state.settings[key])||next.ui!==state.settings.ui;renderState();}
function renderState(){
  const next=selection(),service=MiniServices.get(next.service),save=node('save');
  save.disabled=saving;save.className=saving?'':dirty?'pending':'saved';
  save.textContent=saving?text('Сохраняем…','Saving…'):dirty?text('Сохранить изменения','Save changes'):text('Сохранено','Saved');
  node('saved').className='saved-state'+(dirty?' pending':'');
  node('saved').textContent=saving?text('Сохраняем выбранные параметры…','Saving your selection…'):dirty?text('Выбор ещё не сохранён','Selection not saved yet'):text('Выбор сохранён','Selection saved');
  node('launch-heading').textContent=text('Откройте ','Open ')+service.label;
  node('apply-launch').textContent=text('Сохранить и открыть ','Save and open ')+service.label+' →';
  node('launch').disabled=dirty||saving;node('apply-launch').disabled=saving;
  const table=node('selection-values');table.replaceChildren();
  const prior=state.serviceLaunches?.['lastLaunch:'+next.service];
  for(const [key,ru,en] of [['locale','Язык сайтов','Site language'],['timezone','Часовой пояс','Timezone'],['cores','CPU','CPU']]){
    const row=document.createElement('tr');if(prior&&prior[key]!==next[key])row.className='changed';
    for(const value of [text(ru,en),prior?chosen(key,prior[key]):text('Ещё не запускали','No previous launch'),chosen(key,next[key])]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}table.append(row);
  }
  const privacy=state.privacy||{},own=privacy.levelOfControl==='controlled_by_this_extension',enabled=own&&privacy.value==='disable_non_proxied_udp';
  node('webrtc-state').textContent=enabled?text('Ограничение включено','Restriction enabled'):text('Наше ограничение выключено','Our restriction is off');
  node('webrtc-on').disabled=enabled||!['controlled_by_this_extension','controllable_by_this_extension'].includes(privacy.levelOfControl);node('webrtc-off').disabled=!own;
  const current=state.connection,baseline=state.connectionBaseline;node('connection-values').hidden=!current;
  if(current){node('ip-value').textContent=current.ip;node('country-value').textContent=current.country;node('ip-card').classList.toggle('changed',!!baseline&&baseline.ip!==current.ip);node('country-card').classList.toggle('changed',!!baseline&&baseline.country!==current.country);}
  node('connection-remember').disabled=!current;
  node('connection-state').textContent=baseline?text('Для сравнения: ','Baseline: ')+baseline.ip+' · '+baseline.country:text('Точка сравнения ещё не сохранена','No baseline saved yet');
  const sessions=state.sessions||[];node('session-state').textContent=text('Открытых вкладок с настройками: ','Open configured tabs: ')+sessions.filter(item=>item.active).length;node('reset-tabs').disabled=!sessions.length;
}
async function refresh(){state=await send('state');renderState();}
async function save(){
  saving=true;renderState();
  try{const result=await send('save',{settings:Product.validate(selection())});state.settings=result.settings;dirty=false;status.textContent=text('Настройки сохранены.','Settings saved.');}
  finally{saving=false;renderState();}
}
async function init(){
  for(const zone of Product.zones)node('timezone').add(new Option(zone||'Как в браузере',zone));
  const labels=['Как в браузере','English · US','English · UK','Русский','Deutsch','Français','العربية'];Product.locales.forEach((value,i)=>node('locale').add(new Option(labels[i],value)));
  state=await send('state');setFields(state.settings);translate(state.settings.ui);renderState();
}
fields.forEach(id=>node(id).addEventListener('change',changed));
node('ui-language').addEventListener('change',()=>{translate(node('ui-language').value);changed();});
bindAction('save',save);
bindAction('apply-launch',async()=>{await save();await send('launch');await refresh();status.textContent=text('Сервис открыт. Проверьте вкладку через значок расширения.','Service opened. Check the tab through the extension icon.');});
bindAction('launch',async()=>{await send('launch');await refresh();});
bindAction('webrtc-on',async()=>{await send('privacy',{enabled:true});await refresh();});
bindAction('webrtc-off',async()=>{await send('privacy',{enabled:false});await refresh();});
bindAction('connection-check',async()=>{const result=await send('connection.check');state.connection=result.connection;state.connectionBaseline=result.baseline;renderState();status.textContent=text('Подключение проверено сейчас.','Connection checked now.');});
bindAction('connection-remember',async()=>{state.connectionBaseline=(await send('connection.remember')).baseline;renderState();status.textContent=text('Подключение запомнено.','Connection remembered.');});
bindAction('reset-tabs',async()=>{await send('resetTabs');await refresh();});
bindAction('export-settings',()=>download(JSON.stringify({format:'claude-mini-browser-settings',schemaVersion:1,version:Product.version,settings:state.settings},null,2),'application/json','claude-mini-settings.json'));
bindAction('import-settings',async()=>{
  const file=node('settings-file').files[0];if(!file||file.size>8192)throw Error('INVALID_SETTINGS');let document;try{document=JSON.parse(await file.text());}catch{throw Error('INVALID_SETTINGS');}
  await send('importSettings',{document});state=await send('state');dirty=false;setFields(state.settings);translate(state.settings.ui);renderState();status.textContent=text('Импортировано и сохранено.','Imported and saved.');
});
bindAction('restore-settings',async()=>{await send('restoreSettings');state=await send('state');dirty=false;setFields(state.settings);translate(state.settings.ui);renderState();});
window.addEventListener('focus',()=>{if(state)refresh().catch(error=>status.textContent=errorText(error));});
chrome.storage.onChanged.addListener((changes,area)=>{
  if(!state)return;
  if(area==='local'&&changes.settings?.newValue&&!dirty){state.settings=Product.validate({...Product.defaults,...changes.settings.newValue});setFields(state.settings);translate(state.settings.ui);}
  refresh().catch(error=>status.textContent=errorText(error));
});
init().catch(error=>status.textContent=errorText(error));
