'use strict';
(()=>{
 const field=document.getElementById('request-id'),note=document.getElementById('id-status');if(!field)return;
 const cfg=window.ProductRelease,key='claude-mini-pro-request-'+cfg.release;
 let code='';try{code=localStorage.getItem(key)||'';}catch{}
 if(!RequestCode.parse(code,[cfg]).ok){
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  code=RequestCode.make(cfg.version,cfg.release,[...bytes].map(v=>v.toString(16).padStart(2,'0')).join(''));
  try{localStorage.setItem(key,code);}catch{note.textContent='Скопируйте ID: этот браузер не разрешил сохранить его для следующего открытия.';}
 }
 field.value=code;
 const message='Здравствуйте! Нужен пароль к Claude mini Pro 0.13.1 за 1 500 ₽.\nID заявки: '+code+'\nЧек оплаты приложу к сообщению.';
 const draft=document.getElementById('request-message');if(draft)draft.value=message;
 async function copy(value){try{await navigator.clipboard.writeText(value);return true;}catch{const temp=document.createElement('textarea');temp.value=value;temp.style.position='fixed';temp.style.left='-10000px';document.body.append(temp);temp.select();let ok=false;try{ok=document.execCommand('copy');}catch{}temp.remove();return ok;}}
 document.getElementById('copy-request').addEventListener('click',async()=>{note.textContent=await copy(message)?'Сообщение скопировано. Отправьте его @creativerelab и приложите чек.':'Выделите текст сообщения ниже и скопируйте вручную.';});
 document.getElementById('copy-id')?.addEventListener('click',async()=>{note.textContent=await copy(code)?'ID скопирован.':'Выделите ID и скопируйте его вручную.';});
})();
