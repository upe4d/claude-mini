"use strict";
function captureClaudeChat(){
 if(location.hostname!=='claude.ai'||!location.pathname.startsWith('/chat/'))throw Error('Откройте нужный чат Claude, затем повторите экспорт.');
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
 const selectors='[data-testid="user-message"],[data-testid="assistant-message"],.font-claude-response';
 const nodes=Array.from(document.querySelectorAll(selectors)).filter(n=>!n.parentElement?.closest(selectors));
 if(!nodes.length)throw Error('Сообщения не найдены. Возможно, интерфейс Claude изменился. Ничего не сохранено.');
 const messages=nodes.map(n=>({role:n.matches('[data-testid="user-message"]')?'user':'assistant',text:finish(plain(n),plainCode),markdown:finish(md(n),mdCode)})).filter(m=>m.text);
 if(!messages.length)throw Error('Найдены только пустые сообщения.');
 const warnings=['Сохранены только сообщения, присутствующие в DOM страницы. Полнота истории не подтверждена.','Вложения, изображения и содержимое артефактов отдельно не скачиваются.','Отредактированные варианты, скрытые рассуждения и ветки переписки могут отсутствовать.'];
 if(!messages.some(m=>m.role==='assistant'))warnings.push('Ответы Claude не найдены: проверьте предпросмотр.');
 return {schemaVersion:1,title:document.title,url:location.href,exportedAt:new Date().toISOString(),scope:'available_page_messages',complete:false,warnings,messages};
}
