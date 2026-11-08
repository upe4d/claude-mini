"use strict";
const ChatFormats={
 render(chat,format){
  if(format==='json')return JSON.stringify(chat,null,2);
  const title=chat.title.replace(/[\r\n]/g,' ');
  const warning=chat.warnings.join('\n');
  if(format==='md')return '# '+title+'\n\n'+chat.url+'\n\nЭкспорт: '+chat.exportedAt+'\n\n'+warning+'\n\n'+chat.messages.map(m=>'## '+(m.role==='user'?'Вы':(chat.service?.label||'Ассистент'))+'\n\n'+m.markdown).join('\n\n---\n\n');
  if(format==='txt')return title+'\n'+chat.url+'\nЭкспорт: '+chat.exportedAt+'\n\n'+warning+'\n\n'+chat.messages.map(m=>(m.role==='user'?'Вы':(chat.service?.label||'Ассистент'))+':\n'+m.text).join('\n\n--------------------\n\n');
  throw Error('Неизвестный формат');
 }
};
if(typeof module!=='undefined')module.exports=ChatFormats;
