// Ordinary public image requests only. A transient error retries the same
// official asset once; no identity changes, cookies or paid calls are used.
export async function fetchArFreeMedia(raw,options={}, {fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const u=new URL(raw);if(u.origin!=='https://media.4rgos.it'||u.username||u.password||u.port||!/^\/i\/Argos\/[a-z0-9]{7,8}_R_[A-Z0-9]+(?:_[A-Z0-9]+)*(?:\.json)?$/.test(u.pathname))throw Error('Exact public Argos media required');
 for(let attempt=0;attempt<2;attempt++){try{const r=await fetcher(u.href,{...options,signal:AbortSignal.timeout(25000)});if(attempt===0&&(r.status===429||r.status>=500)){await pause(250);continue;}if(!r.ok||r.status===204||r.status===304)return r;const bytes=await r.arrayBuffer();if(bytes.byteLength>25000000)throw Error('Public Argos media exceeds verified size bound');return new Response(bytes,{status:r.status,statusText:r.statusText,headers:r.headers});}catch(e){if(attempt===1)throw e;await pause(250);}}
}
