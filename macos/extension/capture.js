"use strict";
// Функция самодостаточна: Chrome сериализует её в изолированный контекст вкладки.
function captureClaudeChat(expectedService){
 const service=location.protocol==='https:'&&location.hostname==='claude.ai'&&location.pathname.startsWith('/chat/')?{id:'claude',label:'Claude'}:location.protocol==='https:'&&location.hostname==='gemini.google.com'&&/^\/app(?:\/|$)/.test(location.pathname)?{id:'gemini',label:'Gemini'}:null;
 if(!service||service.id!==expectedService)throw Error('Откройте нужный чат Claude или Gemini, затем повторите экспорт.');
 const mdCode=[],plainCode=[];
 function finish(text,parts){return text.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,'\n\n').trim().replace(/\uE000(\d+)\uE001/g,(_,i)=>parts[Number(i)]);}
 function md(node){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const tag=node.tagName.toLowerCase();
  if(['script','style','button','svg'].includes(tag)||node.getAttribute('aria-hidden')==='true'||node.matches('[hidden],.sr-only,.screen-reader-only'))return '';
  if(tag==='pre'){const code=node.querySelector('code')||node;const text=code.textContent;let fence='```';while(text.includes(fence))fence+='`';const index=mdCode.push(fence+'\n'+text+'\n'+fence)-1;return '\n\n\uE000'+index+'\uE001\n\n';}
  const text=Array.from(node.childNodes).map(md).join('');
  if(tag==='br')return '\n';
  if(tag==='a'){try{const url=new URL(node.getAttribute('href'),location.href);return ['http:','https:'].includes(url.protocol)?'['+text.replace(/\]/g,'\\]')+']('+url.href.replace(/\)/g,'%29')+')':text;}catch{return text;}}
  if(tag==='code')return '`'+text.replace(/`/g,'\\`')+'`';
  if(['strong','b'].includes(tag))return '**'+text+'**';if(['em','i'].includes(tag))return '*'+text+'*';
  if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+text+'\n\n';
  if(tag==='li')return '\n- '+text.trim();
  if(['p','div','section','ul','ol','blockquote'].includes(tag))return '\n\n'+text+'\n\n';
  return text;
 }
 function plain(node){
  if(node.nodeType===Node.TEXT_NODE)return node.textContent;
  if(node.nodeType!==Node.ELEMENT_NODE)return '';
  const tag=node.tagName.toLowerCase();
  if(['script','style','button','svg'].includes(tag)||node.getAttribute('aria-hidden')==='true'||node.matches('[hidden],.sr-only,.screen-reader-only'))return '';
  if(tag==='pre'){const index=plainCode.push(node.textContent)-1;return '\n\n\uE000'+index+'\uE001\n\n';}
  if(tag==='br')return '\n';
  const text=Array.from(node.childNodes).map(plain).join('');
  return ['p','div','section','li','ul','ol','blockquote','h1','h2','h3','h4','h5','h6'].includes(tag)?'\n\n'+text+'\n\n':text;
 }
 // Отдельные DOM-адаптеры сохраняют порядок ролей. Если сайт изменит разметку,
 // экспорт завершается явной ошибкой вместо захвата всей страницы и меню.
 const selectors=service.id==='claude'?'[data-testid="user-message"],[data-testid="assistant-message"],.font-claude-response':'user-query,model-response';
 const nodes=Array.from(document.querySelectorAll(selectors)).filter(n=>!n.parentElement?.closest(selectors));
 if(!nodes.length)throw Error('Сообщения не найдены. Возможно, интерфейс '+service.label+' изменился. Ничего не сохранено.');
 if(nodes.length>1000)throw Error('Слишком много сообщений для одного экспорта.');
 const messages=nodes.filter(n=>!n.closest('[hidden],[aria-hidden="true"]')).map(n=>{
  const role=n.matches('[data-testid="user-message"],user-query')?'user':'assistant';
  const content=service.id==='gemini'?(n.querySelector(role==='user'?'.query-text':'message-content,.model-response-text')||n):n;
  return {role,text:finish(plain(content),plainCode),markdown:finish(md(content),mdCode)};
 }).filter(m=>m.text);
 if(messages.reduce((n,m)=>n+m.text.length+m.markdown.length,0)>5000000)throw Error('Чат слишком велик для одного экспорта.');
 if(!messages.length)throw Error('Найдены только пустые сообщения.');
 const warnings=['Сохранены только сообщения, присутствующие в DOM страницы. Полнота истории не подтверждена.','Вложения, изображения и содержимое артефактов отдельно не скачиваются.','Отредактированные варианты, скрытые рассуждения и ветки переписки могут отсутствовать.'];
 if(!messages.some(m=>m.role==='assistant'))warnings.push('Ответы '+service.label+' не найдены: проверьте предпросмотр.');
 return {schemaVersion:1,service,title:document.title.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,500),url:location.origin+location.pathname,exportedAt:new Date().toISOString(),scope:'available_page_messages',complete:false,warnings,messages};
}
