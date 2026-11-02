import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {control} from '../server/cloud-client.mjs';
let requests;try{requests=JSON.parse(await fs.readFile('web/notification-recovery.json','utf8')).products||[]}catch(e){if(e.code==='ENOENT')process.exit(0);throw e;}
if(!requests.length)process.exit(0);
const catalogue=JSON.parse(await fs.readFile('web/catalogue.json','utf8'));let changed=false;
for(const item of requests){
 if(!/^\d{1,12}$/.test(item.sku)||!Number.isSafeInteger(item.artifactId)||!/^[a-f0-9]{64}$/.test(item.originalSha256))throw Error('Invalid reviewed recovery request');
 const p=catalogue.products.find(p=>p.sku===item.sku);if(!p?.newStatus||p.arrivalEvidence!=='observed-after-baseline')throw Error('Recovery SKU has no observed NEW evidence');
 const dir='web/mail-assets/'+p.sku;
 try{await fs.access(dir+'/manifest.json');await fs.access(dir+'/proof.png');await fs.access(dir+'/original.jpg');await fs.access(dir+'/card.png')}catch{
  if(!process.env.GITHUB_TOKEN)throw Error('Artifact recovery requires the repository Actions read permission');
  const r=await fetch('https://api.github.com/repos/g-jayden/range-christmas-observatory/actions/artifacts/'+item.artifactId+'/zip',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(120000)});
  if(!r.ok)throw Error('Captured NEW artifact recovery HTTP '+r.status);
  const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>150000000)throw Error('Recovery archive is too large');
  await fs.mkdir('runtime',{recursive:true});const archive='runtime/new-recovery-'+item.artifactId+'.zip';await fs.writeFile(archive,bytes);
  execFileSync('python3',['-c',`import sys,zipfile,tarfile,io,pathlib
z=zipfile.ZipFile(sys.argv[1]);t=tarfile.open(fileobj=io.BytesIO(z.read('artifact.tar')))
out=pathlib.Path(sys.argv[3]);out.mkdir(parents=True,exist_ok=True)
allowed={'manifest.json','card.png','original.jpg','proof.png','notification.png'}
for m in t:
 name=m.name.removeprefix('./');parts=name.split('/')
 if m.isfile() and len(parts)==3 and parts[:2]==['mail-assets',sys.argv[2]] and parts[2] in allowed:
  if m.size>10000000:raise ValueError('Oversized recovery member')
  (out/parts[2]).write_bytes(t.extractfile(m).read())
`,archive,p.sku,dir],{stdio:'inherit'});
  await fs.unlink(archive);
 }
 const manifest=JSON.parse(await fs.readFile(dir+'/manifest.json','utf8'));
 const original=await fs.readFile(dir+'/original.jpg');if(manifest.sku!==p.sku||manifest.sourceUrl!==p.sourceUrl||createHash('sha256').update(original).digest('hex')!==item.originalSha256)throw Error('Recovered original does not match verified SKU evidence');
 p.mailAssets=manifest;
 const result=await control('/internal/recover-event',{product:p,screenshotBase64:(await fs.readFile(dir+'/proof.png')).toString('base64'),screenshotVerifiedAt:p.detailEvidence.observedAt});
 console.log(JSON.stringify({recoveredSku:p.sku,recorded:Boolean(result.recorded),alreadyRecorded:Boolean(result.alreadyRecorded),firecrawlCredits:0}));changed=true;
}
if(changed){await fs.writeFile('web/catalogue.json',JSON.stringify(catalogue));await fs.writeFile('web/notification-recovery.json',JSON.stringify({version:1,products:[],completed:requests.map(p=>({...p,restoredAt:new Date().toISOString()}))}));}
