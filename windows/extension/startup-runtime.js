"use strict";
let startupOpening = null;
function openStartupWorkspace() {
  if (startupOpening) return startupOpening;
  startupOpening = Promise.resolve().then(() => portableReady).catch(() => {}).then(async () => {
    const stamp = typeof InstallBrowser === 'object' ? InstallBrowser : {};
    const browser = ['chrome','edge','brave'].includes(stamp.id) ? stamp.id : 'chrome';
    const base = chrome.runtime.getURL('onboarding.html');
    const query = new URLSearchParams({browser});
    if (typeof stamp.extensionPath === 'string' && stamp.extensionPath) query.set('extensionPath',stamp.extensionPath);
    const target = base + '?' + query.toString();
    const ownBase = chrome.runtime.getURL('');
    const tabs = await chrome.tabs.query({});
    const own = tabs.filter(tab => typeof tab.url === 'string' && tab.url.startsWith(ownBase) && ['onboarding.html','workspace.html'].some(page => tab.url.startsWith(ownBase+page)));
    const existing = own.find(tab => tab.active) || own[0];
    // Re-navigate even a restored error tab after the extension has registered.
    if (existing) await chrome.tabs.update(existing.id,{url:target,active:true});
    else await chrome.tabs.create({url:target});
  }).catch(error => console.error('Workspace startup failed:',error.message));
  return startupOpening;
}
chrome.runtime.onInstalled.addListener(() => { void openStartupWorkspace(); });
chrome.runtime.onStartup.addListener(() => { void openStartupWorkspace(); });
