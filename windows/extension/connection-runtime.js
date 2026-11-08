"use strict";
const Connection = {
  async snapshot(){const s=await chrome.storage.local.get(['lastConnection','connectionBaseline','onboardingComplete','lastLaunchSettings']);return {connection:s.lastConnection||null,connectionBaseline:s.connectionBaseline||null,onboardingComplete:!!s.onboardingComplete,lastLaunchSettings:s.lastLaunchSettings||null};},
  async check(){
    const response=await fetch('https://www.cloudflare.com/cdn-cgi/trace',{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('CONNECTION_FAILED');const text=await response.text();if(text.length>16384)throw Error('CONNECTION_FAILED');
    const lines=Object.fromEntries(text.trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)]}));
    if(!/^[0-9a-fA-F:.]{3,64}$/.test(lines.ip||'')||!/^[A-Z]{2}$/.test(lines.loc||''))throw Error('CONNECTION_FAILED');
    const connection={ip:lines.ip,country:lines.loc,checkedAt:new Date().toISOString()};await chrome.storage.local.set({lastConnection:connection});
    const baseline=(await chrome.storage.local.get('connectionBaseline')).connectionBaseline||null;
    return {connection,baseline,changed:{country:!!baseline&&baseline.country!==connection.country,ip:!!baseline&&baseline.ip!==connection.ip}};
  },
  async remember(){const s=await chrome.storage.local.get('lastConnection');if(!s.lastConnection)throw Error('CHECK_CONNECTION_FIRST');const baseline=s.lastConnection;await chrome.storage.local.set({connectionBaseline:baseline});return {baseline};}
};
