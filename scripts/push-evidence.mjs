import {mergeCollectorLedgers,mergeCollectorImageCaches,mergeCollectorNativeIndexes,mergeCollectorPreviewStatus} from '../server/collector-merge.mjs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {execFileSync,spawn} from 'node:child_process';
import {withDataPublicationLease} from '../server/pages-lease-client.mjs';
import fs from 'node:fs';
import {control,apiBase} from '../server/cloud-client.mjs';
import{isolateEvidencePublication}from'../server/isolated-evidence-publication.mjs';
const git=(...args)=>execFileSync('git',args,{stdio:'inherit'}),read=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:67108864}).trim();
if(!process.env.GITHUB_RUN_ID)throw Error('Evidence publishing is restricted to its GitHub workflow');
// Rebase data onto the already-authorised workflow revision. Creating a new
// branch can require workflow-file permission even for a data-only checkpoint.
// The collector writes only web/ data to main and never requests that scope.
// The shared visual quality cache is written by every retailer image check.
// Preserve this known data side effect before rebasing an already committed
// catalogue. Never auto-stage arbitrary files or executable source changes.
const sharedCacheFiles=new Set(['web/preview-quality-cache.json.gz']);
const dirty=execFileSync('git',['diff','--name-only','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const knownUntracked=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(p=>sharedCacheFiles.has(p));
if(dirty.length||knownUntracked.length){if(dirty.some(p=>!sharedCacheFiles.has(p)))throw Error('Uncommitted collector output needs an explicit publication path: '+dirty.join(', '));git('add','--sparse','--',...dirty,...knownUntracked);git('commit','-m','Preserve shared source-photo quality evidence [skip ci]');}
if(process.env.EVIDENCE_ISOLATE_WORKTREE==='1'&&process.env.EVIDENCE_ISOLATED_PUBLISHER!=='1'){console.log(JSON.stringify({phase:'isolated-evidence-publication',...await isolateEvidencePublication()}));process.exit(0);}
const gitNetwork=(...args)=>new Promise((resolve,reject)=>{const child=spawn('git',args,{stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Git publication exited '+code)));});
const publishEvidence=async(assertLease=()=>{})=>{
const maximumAttempts=process.env.EVIDENCE_NATIVE_ONLY==='1'?8:4;
let saved=false;for(let attempt=1;attempt<=maximumAttempts;attempt++){
 try{
  assertLease();try{await gitNetwork('pull','--rebase','origin','main');}catch(error){
   const conflicts=read('diff','--name-only','--diff-filter=U').split('\n').filter(Boolean),allowed=new Set(['web/collection-ledger.json','web/preview-quality-cache.json.gz','web/paid-native-index.json','web/preview-status.json']);
   if(!conflicts.length||conflicts.some(p=>!allowed.has(p)))throw error;
   for(const file of conflicts){const packed=file.endsWith('.gz'),stages=[1,2,3].map(n=>{const raw=execFileSync('git',['show',':'+n+':'+file],{maxBuffer:67108864});return JSON.parse((packed?gunzipSync(raw):raw).toString('utf8'));}),merged=file.endsWith('collection-ledger.json')?mergeCollectorLedgers(...stages):file.endsWith('paid-native-index.json')?mergeCollectorNativeIndexes(...stages):file.endsWith('preview-status.json')?mergeCollectorPreviewStatus(...stages):mergeCollectorImageCaches(...stages),bytes=Buffer.from(JSON.stringify(merged));fs.writeFileSync(file,packed?gzipSync(bytes):bytes);git('add','--',file);}
   git('-c','core.editor=true','rebase','--continue');
   console.log(JSON.stringify({collectorReceiptConflictsReconciled:conflicts,sourceRequests:0,firecrawlCredits:0}));
  }
  const changed=read('diff','--name-only','origin/main..HEAD').split('\n').filter(Boolean);
  if(changed.some(p=>!p.startsWith('web/')))throw Object.assign(Error('Collector publication contains non-data files; refused'),{nonData:true});
  assertLease();await gitNetwork('push','origin','HEAD:refs/heads/main');saved=true;break;
 }catch(error){const rebase=read('rev-parse','--git-path','rebase-merge');if(error.nonData||fs.existsSync(rebase))throw Error('Data publication requires reconciliation; recover the workflow source-evidence archive');if(attempt<maximumAttempts)await new Promise(r=>setTimeout(r,Math.min(8000,1500*attempt)+Math.floor(Math.random()*1000)));}
}
if(!saved)throw Error('Main was not updated; recover the source-evidence artifact instead of collecting again');
console.log(JSON.stringify({evidenceSaved:true,dataOnly:true,commit:read('rev-parse','HEAD')}));
};
if(apiBase&&process.env.CONTROL_TOKEN)await withDataPublicationLease(publishEvidence);else await publishEvidence();
// Announce only after the exact public files have been pushed. Pages file sync
// is a separate delivery channel and cannot hold the team's data hostage.
if(process.env.EVIDENCE_NATIVE_ONLY!=='1'&&apiBase&&process.env.CONTROL_TOKEN){try{const p=JSON.parse(fs.readFileSync('web/asda/catalogue.json','utf8'));if(p.baselineReady&&p.imageAudit?.verified===p.products.length){const result=await control('/internal/published-site',{commit:read('rev-parse','HEAD')});console.log(JSON.stringify({mirrorPublished:result.published,commit:result.commit,firecrawlCredits:0}));}}catch(e){console.log(JSON.stringify({mirrorAnnouncementPending:true,status:e.status||0,firecrawlCredits:0}));}}

// A completed private scan is not a saved public catalogue. Announce each
// retailer only after its exact files reached main, so a failed push cannot
// suppress the next bounded clock attempt. Sparse collectors need no other store.
if(process.env.EVIDENCE_NATIVE_ONLY!=='1'&&apiBase&&process.env.CONTROL_TOKEN)for(const id of ['asda','ms','bm','hb','du','nx','jl','mt','bq','ar'])try{const s=JSON.parse(fs.readFileSync('web/'+id+'/catalogue.json','utf8'));if(s.baselineReady&&(s.notificationBaselineReady||['asda','ms','bm','hb','du'].includes(id))){const result=await control('/internal/retailer-published',{id,observedAt:s.observedAt,commit:read('rev-parse','HEAD')});console.log(JSON.stringify({retailerCommitAnnounced:id,marked:result.marked,firecrawlCredits:0}));}}catch(e){if(e.code!=='ENOENT')console.log(JSON.stringify({retailerCommitAnnouncementPending:id,status:e.status||0,firecrawlCredits:0}));}
