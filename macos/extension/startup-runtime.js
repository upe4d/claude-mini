"use strict";
let startupOpening=null;
function openStartupWorkspace(){
  if(startupOpening)return startupOpening;
  // Регистрации расширения и записи начальных настроек дожидаемся до перехода.
  startupOpening=Promise.resolve().then(()=>portableReady).then(async()=>{
    const saved=await chrome.storage.local.get('onboardingComplete');
    const page=saved.onboardingComplete?'workspace.html':'onboarding.html';
    const target=chrome.runtime.getURL(page),base=chrome.runtime.getURL('');
    const tabs=await chrome.tabs.query({});
    const own=tabs.filter(tab=>typeof tab.url==='string'&&['workspace.html','onboarding.html'].some(name=>tab.url.startsWith(base+name)));
    const existing=own.find(tab=>tab.active)||own[0];
    if(existing)await chrome.tabs.update(existing.id,{url:target,active:true});
    else await chrome.tabs.create({url:target});
  }).catch(error=>console.error('Workspace startup failed:',error.message));
  return startupOpening;
}
chrome.runtime.onInstalled.addListener(()=>{void openStartupWorkspace();});
chrome.runtime.onStartup.addListener(()=>{void openStartupWorkspace();});
