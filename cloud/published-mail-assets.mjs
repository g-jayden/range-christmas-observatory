import {retailerAssetId} from '../web/retailers.mjs';
const REPO='g-jayden/range-christmas-observatory';
const PAGES='https://g-jayden.github.io/range-christmas-observatory/';
export function mailAssetUrl(raw,sku){
 if(!/^(?:(?:asda|ms)-)?\d{1,12}$/.test(String(sku)))throw Error('Invalid mail SKU');
 const u=new URL(raw),prefix='mail-assets/'+sku+'/';
 const page=u.href.startsWith(PAGES+prefix);
 const repo=u.origin==='https://raw.githubusercontent.com'&&new RegExp('^/'+REPO+'/(?:main|[a-f0-9]{40})/web/'+prefix).test(u.pathname);
 if(!page&&!repo)throw Error('Invalid generated mail asset');return u.href;
}
export function pinMailAssets(manifest,revision){
 if(!/^[a-f0-9]{40}$/.test(String(revision)))throw Error('Invalid published asset revision');
 const m=structuredClone(manifest),sku=m.assetId||String(m.sku);
 for(const key of ['card','original','mailOriginal','proof','notification'])if(m[key]?.url){
  const u=new URL(mailAssetUrl(m[key].url,sku));
  const suffix=u.origin==='https://raw.githubusercontent.com'?u.pathname.replace(new RegExp('^/'+REPO+'/(?:main|[a-f0-9]{40})/web/'),''):u.pathname.slice('/range-christmas-observatory/'.length);
  m[key].url='https://raw.githubusercontent.com/'+REPO+'/'+revision+'/web/'+suffix+u.search;
 }
 m.publishedRevision=revision;
 m.manifestUrl='https://raw.githubusercontent.com/'+REPO+'/'+revision+'/web/mail-assets/'+sku+'/manifest.json';
 return m;
}
export function publishedManifestUrl(p){
 const m=p.mailAssets,assetId=retailerAssetId(p);
 if(m?.publishedRevision){const expected='https://raw.githubusercontent.com/'+REPO+'/'+m.publishedRevision+'/web/mail-assets/'+assetId+'/manifest.json';if(!/^[a-f0-9]{40}$/.test(m.publishedRevision)||m.manifestUrl!==expected)throw Error('Published manifest identity mismatch');return mailAssetUrl(expected,assetId);}
 return PAGES+'mail-assets/'+assetId+'/manifest.json';
}
