/* A public request code identifies a release and catches copying mistakes. It is not a licence or proof of payment. */
'use strict';
const RequestCode=(()=>{
  function checksum(value){let crc=0xffffffff;for(const byte of new TextEncoder().encode(value)){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0').toUpperCase();}
  function make(version,release,nonce){
    if(!/^\d+\.\d+\.\d+$/.test(version)||!/^\w{8}$/.test(release)||!(/^[0-9a-f]{16}$/i).test(nonce))throw Error('INVALID_INPUT');
    const body=`CMP-${version}-${release.toUpperCase()}-${nonce.toUpperCase()}`;return body+'-'+checksum(body);
  }
  function parse(input,known){
    if(typeof input!=='string'||input.length>4000)return {ok:false,reason:'format'};
    const found=input.toUpperCase().match(/CMP-\d+\.\d+\.\d+-[A-Z0-9]{8}-[A-F0-9]{16}-[A-F0-9]{8}/g);
    if(!found||new Set(found).size!==1)return {ok:false,reason:'format'};
    const code=found[0],parts=code.split('-'),body=parts.slice(0,-1).join('-');
    if(checksum(body)!==parts[4])return {ok:false,reason:'checksum'};
    if(!known.some(item=>item.version===parts[1]&&item.release===parts[2]))return {ok:false,reason:'unknown',version:parts[1],release:parts[2]};
    return {ok:true,code,version:parts[1],release:parts[2],request:parts[3]};
  }
  return {make,parse};
})();
if(typeof module!=='undefined')module.exports=RequestCode;
