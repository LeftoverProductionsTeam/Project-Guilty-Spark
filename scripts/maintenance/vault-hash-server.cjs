// Bounded read-only parallel SHA-256. Responses preserve input order.
const fs = require('node:fs/promises'), crypto = require('node:crypto');
const buffers = Array.from({length:8},()=>Buffer.allocUnsafe(1024*1024));
async function hashes(files) {
  const out = Array(files.length); let next=0;
  await Promise.all(buffers.map(async buffer=>{
    while(next<files.length) {
      const index=next++, file=files[index], h=crypto.createHash('sha256');
      const handle=await fs.open(file,'r');
      try { while(true){const {bytesRead:n}=await handle.read(buffer,0,buffer.length,null);if(!n)break;h.update(buffer.subarray(0,n));} }
      finally {await handle.close();}
      out[index]=h.digest('hex');
    }
  }));
  return out;
}
let pending='', chain=Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{
  pending+=chunk;
  while(pending.includes('\n')) {
    const at=pending.indexOf('\n'),line=pending.slice(0,at);pending=pending.slice(at+1);
    if(!line)continue;
    chain=chain.then(async()=>{
      try {
        const request=JSON.parse(line), files=Array.isArray(request)?request:[request];
        if(!files.length||files.length>128||files.some(f=>typeof f!=='string'))throw Error('Invalid bounded hash request');
        const results=await hashes(files);
        process.stdout.write(JSON.stringify(Array.isArray(request)?{hashes:results}:{sha256:results[0]})+'\n');
      } catch(e) {process.stdout.write(JSON.stringify({error:String(e)})+'\n');}
    });
  }
});
