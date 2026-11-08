"use strict";
function defaultLocalePatch(locale){
 const choose=value=>value===undefined||(Array.isArray(value)&&value.length===0)?locale:value;
 for(const name of ['DateTimeFormat','NumberFormat','Collator','PluralRules','RelativeTimeFormat','ListFormat','DisplayNames','Segmenter','DurationFormat']){
  const original=Intl[name];if(typeof original!=='function')continue;
  const adjusted=args=>{const next=[...args];next[0]=choose(next[0]);return next;};
  Intl[name]=new Proxy(original,{
   apply(target,self,args){return Reflect.apply(target,self,adjusted(args));},
   construct(target,args,newTarget){return Reflect.construct(target,adjusted(args),newTarget);},
  });
 }
 for(const [prototype,names] of [[Date.prototype,['toLocaleString','toLocaleDateString','toLocaleTimeString']],[Number.prototype,['toLocaleString']],[BigInt.prototype,['toLocaleString']],[Array.prototype,['toLocaleString']],[String.prototype,['toLocaleLowerCase','toLocaleUpperCase']]]){
  for(const name of names){const descriptor=Object.getOwnPropertyDescriptor(prototype,name);if(!descriptor)continue;
   Object.defineProperty(prototype,name,{...descriptor,value:new Proxy(descriptor.value,{apply(target,self,args){const next=[...args];next[0]=choose(next[0]);return Reflect.apply(target,self,next);}})});
  }
 }
 const descriptor=Object.getOwnPropertyDescriptor(String.prototype,'localeCompare');
 Object.defineProperty(String.prototype,'localeCompare',{...descriptor,value:new Proxy(descriptor.value,{apply(target,self,args){const next=[...args];next[1]=choose(next[1]);return Reflect.apply(target,self,next);}})});
}
const TabLocale={
 agents:new Map(),
 async applyChild(target,value){
  this.validate(value);if(!value)return;
  const native=this.agents.get(target.tabId);if(!native)throw Error('Native agent metadata missing for child frame');
  await chrome.debugger.sendCommand(target,'Page.enable');
  await chrome.debugger.sendCommand(target,'Emulation.setUserAgentOverride',{...native,acceptLanguage:value});
  await chrome.debugger.sendCommand(target,'Page.addScriptToEvaluateOnNewDocument',{source:'('+defaultLocalePatch.toString()+')('+JSON.stringify(value.split(',')[0])+');',runImmediately:true});
 },
 presets:['en-US,en','en-GB,en','ru-RU,ru','de-DE,de,en','fr-FR,fr,en','ar-AE,ar,en'],
 validate(value){
  if(typeof value!=='string'||(value&&!this.presets.includes(value)))throw Error('Invalid site language');
  return value;
 },
 async apply(target,value){
  this.validate(value);if(!value)return;
  const locale=value.split(',')[0];
  const agent=await chrome.debugger.sendCommand(target,'Runtime.evaluate',{
   expression:'({userAgent:navigator.userAgent,platform:navigator.platform})',returnByValue:true,
  });
  const native=agent.result?.value;
  if(!native?.userAgent)throw Error('Could not read native User-Agent');
  // Preserve native client hints when changing the language via the UA command.
  if(!navigator.userAgentData)throw Error('Native Client Hints are unavailable');
  const hints=await navigator.userAgentData.getHighEntropyValues(['architecture','bitness','model','platformVersion','fullVersionList','wow64']);
  const metadata={brands:hints.brands,mobile:hints.mobile,platform:hints.platform,
   architecture:hints.architecture,bitness:hints.bitness,model:hints.model,
   platformVersion:hints.platformVersion,fullVersionList:hints.fullVersionList,wow64:hints.wow64};
  this.agents.set(target.tabId,{userAgent:native.userAgent,platform:native.platform,userAgentMetadata:metadata});
  await chrome.debugger.sendCommand(target,'Emulation.setUserAgentOverride',{
   userAgent:native.userAgent,platform:native.platform,acceptLanguage:value,userAgentMetadata:metadata,
  });
  // Native locale override is ineffective in tested Edge. Patch only default locale
  // arguments, preserving explicit caller locales and the native timezone handling.
  const source='('+defaultLocalePatch.toString()+')('+JSON.stringify(locale)+');';
  await chrome.debugger.sendCommand(target,'Page.addScriptToEvaluateOnNewDocument',{source});
  await chrome.debugger.sendCommand(target,'Runtime.evaluate',{expression:source});
 },
};
if(typeof module!=='undefined')module.exports=TabLocale;
