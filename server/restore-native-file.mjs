import fs from'node:fs/promises';import path from'node:path';import{createHash}from'node:crypto';
export async function restoreNativeFile({entry,archiveRoot,webRoot='web',tracked=false}){
 if(!entry?.ok||!/^images\/source\/[a-f0-9]{64}\.(?:jpg|png|webp|avif|gif)$/.test(entry.cachedImageUrl||'')||!entry.cachedImageUrl.includes(entry.hash+'.'))throw Error('Invalid native artifact entry');
 const source=path.join(archiveRoot,entry.cachedImageUrl),target=path.join(webRoot,entry.cachedImageUrl);
 let bytes;try{bytes=await fs.readFile(source);}catch(e){if(e.code==='ENOENT'&&tracked)return'already-durable';throw e;}
 if(bytes.length>25000000||createHash('sha256').update(bytes).digest('hex')!==entry.hash)throw Error('Archived native image hash mismatch');
 if(tracked){await fs.rm(source);return'already-durable';}
 await fs.mkdir(path.dirname(target),{recursive:true});
 // One disk copy only: an artifact can exceed 6 GB and Git needs room for its
 // immutable objects. Both directories belong to this same runner filesystem.
 await fs.rename(source,target);return'restored';
}
