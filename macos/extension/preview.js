"use strict";
let chat;
const key=location.hash.slice(1), status=document.getElementById('status');
async function load() {
  const settings=(await chrome.storage.local.get('settings')).settings||Product.defaults;translate(settings.ui);
  if(!/^chat-export-[a-f0-9-]{36}$/.test(key))throw Error('MISSING');
  chat=(await chrome.storage.session.get(key))[key];if(!chat)throw Error('MISSING');
  document.getElementById('chat-title').textContent=chat.title;
  document.getElementById('meta').textContent=text('Сообщений: ','Messages: ')+chat.messages.length;
  for(const message of chat.messages){const article=document.createElement('article'),h=document.createElement('h2'),body=document.createElement('div');h.textContent=message.role==='user'?text('Вы','You'):(chat.service?.label||'Ассистент');body.className='message-text';body.textContent=message.text;article.append(h,body);document.getElementById('messages').append(article);}
  document.querySelectorAll('[data-format]').forEach(button=>{button.disabled=false;button.onclick=()=>{const format=button.dataset.format;download(ChatFormats.render(chat,format),format==='json'?'application/json;charset=utf-8':'text/plain;charset=utf-8',(chat.service?.id||'chat')+'-chat-'+new Date().toISOString().replace(/[:.]/g,'-')+'.'+format);status.textContent=text('Скачивание начато.','Download started.');};});
  document.getElementById('print').disabled=false;document.getElementById('clear').disabled=false;
}
document.getElementById('print').onclick=()=>window.print();
document.getElementById('clear').onclick=async()=>{
  await chrome.storage.session.remove(key);chat=null;document.getElementById('messages').replaceChildren();document.getElementById('chat-title').textContent=text('Временная копия удалена','Temporary copy deleted');document.getElementById('meta').textContent='';
  document.querySelectorAll('button').forEach(button=>button.disabled=true);status.textContent=text('Скачанные файлы остаются у вас.','Downloaded files remain on your device.');
};
load().catch(()=>{status.textContent=text('Копия недоступна. Повторите экспорт из открытого чата.','Copy unavailable. Export the open chat again.');});
