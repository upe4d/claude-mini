"use strict";
// Only explicitly opened tabs are owned. No measurements or network logs are taken.
const BrowserSessions = {
  prefix: 'browser-session-',
  key(id) { return this.prefix + id; },
  async list() {
    const all = await chrome.storage.session.get(null);
    return Object.entries(all).filter(([key]) => key.startsWith(this.prefix)).map(([,value]) => value);
  },
  async child(source, params) {
    const entry = (await chrome.storage.session.get(this.key(source.tabId)))[this.key(source.tabId)];
    if (!entry?.active) return;
    const target = {tabId: source.tabId, sessionId: params.sessionId};
    try {
      // Параметры не распространяются на сторонние iframe, включая вход Google.
      const childURL=params.targetInfo?.url||'';
      let scopedURL=childURL;
      try{if(childURL.startsWith('blob:'))scopedURL=new URL(childURL).origin;}catch{return;}
      if(MiniServices.fromUrl(scopedURL)?.id!==entry.service)return;
      if (params.targetInfo.type === 'iframe') {
        if (entry.agent) TabLocale.agents.set(source.tabId, entry.agent);
        await this.children(target);
        await TabLocale.applyChild(target, entry.locale);
        if (entry.timezone) await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {timezoneId: entry.timezone});
        if (entry.cores) await chrome.debugger.sendCommand(target,'Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:entry.cores});
      } else if (['worker','shared_worker'].includes(params.targetInfo.type) && (entry.locale || entry.cores)) {
        const languages = entry.locale ? entry.locale.split(',') : null;
        const expression = `(()=>{const languages=${JSON.stringify(languages)},cores=${entry.cores||0};const values={};if(languages){(${defaultLocalePatch.toString()})(languages[0]);values.language=languages[0];values.languages=Object.freeze(languages);}if(cores)values.hardwareConcurrency=cores;const p=Object.getPrototypeOf(navigator);for(const [key,value] of Object.entries(values)){const d=Object.getOwnPropertyDescriptor(p,key);if(!d?.configurable)throw Error('LANGUAGE_UNAVAILABLE');Object.defineProperty(p,key,{...d,get:()=>value});}})()`;
        const result = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {expression});
        if (result.exceptionDetails) throw Error('LANGUAGE_UNAVAILABLE');
      }
    } catch (error) {
      entry.issue = 'CHILD_SETTINGS_UNAVAILABLE';
      await chrome.storage.session.set({[this.key(source.tabId)]: entry});
    } finally {
      await chrome.debugger.sendCommand(target, 'Runtime.runIfWaitingForDebugger').catch(() => {});
    }
  },
  async children(target) {
    await chrome.debugger.sendCommand(target, 'Target.setAutoAttach', {
      autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{type:'iframe',exclude:false},{type:'worker',exclude:false},{type:'shared_worker',exclude:false},{exclude:true}],
    });
  },
  async apply(tabId, settings) {
    const target = {tabId};
    await chrome.debugger.attach(target, '1.3');
    try {
      await chrome.debugger.sendCommand(target, 'Page.enable');
      await TabLocale.apply(target, settings.locale);
      if (settings.timezone) await chrome.debugger.sendCommand(target, 'Emulation.setTimezoneOverride', {timezoneId: settings.timezone});
      if (settings.cores) await chrome.debugger.sendCommand(target,'Emulation.setHardwareConcurrencyOverride',{hardwareConcurrency:settings.cores});
      await chrome.storage.session.set({[this.key(tabId)]: {
        tabId, active:true, service:settings.service, timezone:settings.timezone, locale:settings.locale,cores:settings.cores||0,
        agent:TabLocale.agents.get(tabId) || null, openedAt:new Date().toISOString(), issue:null,
      }});
      await this.children(target);
    } catch (error) {
      await chrome.debugger.detach(target).catch(() => {});
      await chrome.storage.session.remove(this.key(tabId));
      throw error;
    }
  },
  async launch(settings) {
    if (!settings.timezone && !settings.locale && !settings.cores) return chrome.tabs.create({url:Product.target(settings)});
    const tab = await chrome.tabs.create({url:'about:blank', active:false});
    try {
      await this.apply(tab.id, settings);
      return await chrome.tabs.update(tab.id, {url:Product.target(settings), active:true});
    } catch (error) {
      await chrome.debugger.detach({tabId:tab.id}).catch(() => {});
      await chrome.tabs.remove(tab.id).catch(() => {});
      await chrome.storage.session.remove(this.key(tab.id));
      throw Error('LAUNCH_FAILED');
    }
  },
  async clearAndReload() {
    const entries = await this.list();
    const failures = [];
    for (const entry of entries) {
      if (entry.active) {
        try { await chrome.debugger.detach({tabId:entry.tabId}); }
        catch {
          const targets = await chrome.debugger.getTargets();
          if (targets.some(t => t.tabId === entry.tabId && t.attached)) { failures.push(entry.tabId); continue; }
        }
      }
      try { await chrome.tabs.reload(entry.tabId); await chrome.storage.session.remove(this.key(entry.tabId)); }
      catch { failures.push(entry.tabId); }
    }
    if (failures.length) throw Error('RESET_INCOMPLETE');
  },
};
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Target.attachedToTarget') BrowserSessions.child(source, params).catch(console.error);
});
chrome.debugger.onDetach.addListener(source => {
  TabLocale.agents.delete(source.tabId);
  const key = BrowserSessions.key(source.tabId);
  chrome.storage.session.get(key).then(async saved => {
    if (saved[key]) await chrome.storage.session.set({[key]:{...saved[key], active:false, issue:'RELOAD_REQUIRED'}});
  }).catch(console.error);
});
chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove(BrowserSessions.key(id)).catch(console.error));

chrome.debugger.onEvent.addListener((source,method,params)=>{
  if(method!=='Page.frameNavigated'||source.sessionId||params.frame?.parentId)return;
  const url=params.frame?.url;if(!url||url==='about:blank')return;
  chrome.storage.session.get(BrowserSessions.key(source.tabId)).then(async saved=>{
    const entry=saved[BrowserSessions.key(source.tabId)];if(!entry?.active)return;
    if(MiniServices.fromUrl(url)?.id===entry.service)return;
    await chrome.debugger.detach({tabId:source.tabId}).catch(()=>{});
    await chrome.storage.session.set({[BrowserSessions.key(source.tabId)]:{...entry,active:false,issue:'LEFT_SERVICE'}});
  }).catch(console.error);
});
