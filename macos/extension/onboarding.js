'use strict';
// Мастер показывает одно действие за раз, подтверждая запись перед следующим шагом.
const node=id=>document.getElementById(id),steps=[...document.querySelectorAll('[data-step]')];
let step=0,state,busy=false;
function show(){
  steps.forEach((page,index)=>page.hidden=index!==step);
  document.querySelectorAll('.progress li').forEach((item,index)=>index===step?item.setAttribute('aria-current','step'):item.removeAttribute('aria-current'));
  node('counter').textContent='Шаг '+(step+1)+' из '+steps.length;node('back').disabled=busy||step===0;node('next').hidden=step===steps.length-1;node('next').disabled=busy||!state||(step===0&&!node('pin-confirmed').checked);node('next').textContent=step===1?'Сохранить и дальше →':'Дальше →';
  const p=state?.privacy,enabled=p?.value==='disable_non_proxied_udp'&&p?.levelOfControl==='controlled_by_this_extension';node('privacy-state').textContent=enabled?'Ограничение включено. Можно продолжать.':'Наше ограничение выключено.';node('privacy-enable').disabled=busy||enabled;node('privacy-disable').disabled=busy||p?.levelOfControl!=='controlled_by_this_extension';node('finish').disabled=busy||!state;
}
async function action(task){if(busy)return;busy=true;node('notice').textContent='';show();try{await task();}catch(error){node('notice').textContent=errorText(error);}finally{busy=false;show();}}
async function init(){
  for(const zone of Product.zones)node('setup-timezone').add(new Option(zone||'Как в браузере',zone));
  const labels=['Как в браузере','English · US','English · UK','Русский','Deutsch','Français','العربية'];Product.locales.forEach((value,index)=>node('setup-locale').add(new Option(labels[index],value)));
  state=await send('state');
  if(state.onboardingComplete&&new URLSearchParams(location.search).get('again')!=='1'){location.replace(chrome.runtime.getURL('workspace.html'));return;}
  for(const key of ['service','locale','timezone','cores'])node('setup-'+key).value=String(state.settings[key]);node('settings-state').textContent='Показан сохранённый выбор. Кнопка «Сохранить и дальше» запишет изменения.';translate('ru');show();
}
node('pin-confirmed').addEventListener('change',show);
node('back').onclick=()=>{if(!busy&&step>0){step--;show();}};
node('next').onclick=()=>action(async()=>{
  if(step===0&&!node('pin-confirmed').checked)return;
  if(step===1){const selected={...state.settings};for(const key of ['service','locale','timezone'])selected[key]=node('setup-'+key).value;selected.cores=Number(node('setup-cores').value);state.settings=(await send('save',{settings:Product.validate(selected)})).settings;node('settings-state').textContent='Выбор сохранён.';}
  if(step<steps.length-1)step++;
});
node('open-extensions').onclick=()=>action(()=>chrome.tabs.create({url:'chrome://extensions/'}));
node('privacy-enable').onclick=()=>action(async()=>{state.privacy=(await send('privacy',{enabled:true})).privacy;});
node('privacy-disable').onclick=()=>action(async()=>{state.privacy=(await send('privacy',{enabled:false})).privacy;});
node('finish').onclick=()=>action(async()=>{await send('onboarding.complete');location.href=chrome.runtime.getURL('workspace.html');});
show();init().catch(error=>{node('notice').textContent=errorText(error);});
