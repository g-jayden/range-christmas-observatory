import fs from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';import{execFile}from'node:child_process';import{promisify}from'node:util';const run=promisify(execFile);
export async function materializeCommittedImage(file,expected,{root='web',read=fs.readFile,write=fs.writeFile,mkdir=fs.mkdir,readGit=async target=>(await run('git',['show','HEAD:'+target],{encoding:'buffer',maxBuffer:25000001})).stdout}={}){
 if(!/^[a-f0-9]{64}$/.test(expected||'')||!/^images\/(?:[a-z0-9_-]+\/)*[a-f0-9]{64}(?:-native)?\.(?:jpe?g|png|webp|avif)$/i.test(file)||!path.basename(file).startsWith(expected))throw Error('Exact content-addressed source image required');
 const target=path.join(root,file);let bytes,restored=false;try{bytes=await read(target);}catch(e){if(e.code!=='ENOENT')throw e;bytes=await readGit(target.replaceAll(path.sep,'/'));restored=true;}
 if(bytes.length>25000000||createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Committed source image digest mismatch');if(restored){await mkdir(path.dirname(target),{recursive:true});await write(target,bytes);}return{file:target,restored,sourceRequests:0,firecrawlCredits:0};
}
