"use strict";
importScripts('services.js','preset.js','config.js','locale-runtime.js','sessions.js','connection-runtime.js','startup-runtime.js');
const settingsRead = async () => {
  const saved={...Product.defaults, ...(await chrome.storage.local.get('settings')).settings};
  if(!Product.cpu)saved.cores=0;
  return Product.validate(saved);
};
const privacyRead = () => chrome.privacy.network.webRTCIPHandlingPolicy.get({});
async function privacySet(enabled) {
  const setting = chrome.privacy.network.webRTCIPHandlingPolicy, before = await privacyRead();
  if (enabled && !['controllable_by_this_extension','controlled_by_this_extension'].includes(before.levelOfControl)) throw Error('WEBRTC_CONFLICT');
  if (enabled) await setting.set({value:'disable_non_proxied_udp',scope:'regular'});
  else await setting.clear({scope:'regular'});
  const after = await privacyRead();
  if (enabled && (after.value !== 'disable_non_proxied_udp' || after.levelOfControl !== 'controlled_by_this_extension')) throw Error('WEBRTC_CONFLICT');
  if (!enabled && after.levelOfControl === 'controlled_by_this_extension') throw Error('WEBRTC_RELEASE_FAILED');
  return after;
}
let mutation = Promise.resolve();
function serial(task) { const result = mutation.then(task); mutation = result.catch(() => {}); return result; }
const portableReady=serial(async()=>{const saved=await chrome.storage.local.get(['settings','portableInitialized']);if(!saved.portableInitialized){if(!saved.settings)await chrome.storage.local.set({settings:Product.validate({...Product.defaults})});await privacySet(true);await chrome.storage.local.set({portableInitialized:true});}});
const pages = new Set(['/workspace.html','/popup.html','/onboarding.html']);
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let url;
  try { url = new URL(sender.url); } catch { return; }
  if (sender.id !== chrome.runtime.id || url.protocol !== 'chrome-extension:' || url.host !== chrome.runtime.id || !pages.has(url.pathname)) return;
  const tasks = {
    state: async () => ({settings:await settingsRead(),privacy:await privacyRead(),sessions:await BrowserSessions.list(),...await Connection.snapshot(),serviceLaunches:await chrome.storage.local.get(['lastLaunch:claude','lastLaunch:gemini'])}),
    save: async () => { const value=Product.validate(message.settings); await chrome.storage.local.set({settings:value}); return {settings:value}; },
    importSettings: async () => {
      if(message.document?.format!=='claude-mini-browser-settings'||message.document?.schemaVersion!==1)throw Error('INVALID_SETTINGS');
      const settings=Product.validate(message.document.settings),previous=await settingsRead();
      await chrome.storage.local.set({settings,previousSettings:previous});return {settings};
    },
    restoreSettings: async () => {
      const saved=(await chrome.storage.local.get('previousSettings')).previousSettings;if(!saved)throw Error('NO_BACKUP');
      const settings=Product.validate(saved);await chrome.storage.local.set({settings});return {settings};
    },
    launch: async () => { const settings=await settingsRead();const tab=await BrowserSessions.launch(settings);const key='lastLaunch:'+settings.service;await chrome.storage.local.set({[key]:settings,lastLaunchSettings:settings});return {tabId:tab.id}; },
    privacy: async () => { if(typeof message.enabled !== 'boolean') throw Error('INVALID_SETTINGS'); return {privacy:await privacySet(message.enabled)}; },
    'connection.check': async()=>Connection.check(),
    'connection.remember': async()=>Connection.remember(),
    'onboarding.complete': async()=>{const s=await settingsRead();Product.validate(s);await chrome.storage.local.set({onboardingComplete:true});return {};},
    resetTabs: async () => { await BrowserSessions.clearAndReload(); return {}; },
  };
  if (!Object.hasOwn(tasks, message.type)) return;
  const result = portableReady.then(()=>message.type === 'state' ? tasks.state() : serial(tasks[message.type]));
  result.then(data=>reply({ok:true,...data}), error=>reply({ok:false,error:error.message}));
  return true;
});
chrome.runtime.onInstalled.addListener(details => {
  // Presets are initialized before the first UI request.
});
