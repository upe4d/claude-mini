"use strict";
async function captureForPreview() {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https:\/\/claude\.ai\/chat\//.test(tab.url||''))throw Error('OPEN_CHAT');
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:captureClaudeChat});
  const chat=result[0]?.result;
  if(!chat?.messages?.length)throw Error('NO_MESSAGES');
  const key='chat-export-'+crypto.randomUUID();
  const existing=await chrome.storage.session.get(null);
  const old=Object.keys(existing).filter(k=>k.startsWith('chat-export-')).sort((a,b)=>Date.parse(existing[a].exportedAt)-Date.parse(existing[b].exportedAt));
  if(old.length>=5)await chrome.storage.session.remove(old.slice(0,old.length-4));
  await chrome.storage.session.set({[key]:chat});
  await chrome.tabs.create({url:chrome.runtime.getURL('preview.html')+'#'+key});
}
