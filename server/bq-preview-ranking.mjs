import{createHash}from'node:crypto';
import{bqAsset}from'./bq-images.mjs';import{bqFingerprint}from'./bq-products.mjs';
import{bqVisualTypeCompatible}from'./bq-type-evidence.mjs';
export function boundBqPreviewSelection(p,selection,index,visual){
 if(!selection||selection.sourceFingerprint!==bqFingerprint(p))return null;
 const gallery=[...new Set(p.originalImages.map(g=>bqAsset(g.url)))];
 if(!gallery.includes(selection.asset)||selection.galleryFingerprint!==createHash('sha256').update(JSON.stringify(gallery)).digest('hex'))return null;
 const record=index[(createHash('sha256').update(selection.asset).digest('hex'))];
 if(!record||record.error||record.sha256!==selection.imageHash||visual[createHash('sha256').update(selection.asset).digest('hex')]?.imageHash!==selection.imageHash)return null;
 return selection;
}
export function rankBqPreviewCandidates(p,candidates){const clear=c=>!c.t?.accessoryOnly&&!c.v?.textQuality?.accessoryOnly&&!c.t?.diagram&&!c.t?.logo&&!c.v?.textQuality?.diagram&&!c.v?.textQuality?.logo;const target=c=>c.v?.objectTop?.find(t=>t.id===p.department)?.score||0;const strong=candidates.some(c=>clear(c)&&target(c)>=.65);let eligible=strong?candidates.filter(c=>clear(c)&&(target(c)>=.12||c.v?.objectTop?.[0]?.id==='other'&&(c.v.quality?.geometry?.white||0)>.2&&(c.v.quality?.geometry?.edge??1)<.02||bqVisualTypeCompatible(p,p.department,c.v).compatible)):candidates;if(!eligible.length)eligible=candidates;return [...eligible].sort((a,b)=>b.score-a.score);}

export function bqApprovedSourceIllustration(p,saved,candidate){return saved?.sourceOnlyIllustration===true&&saved.bestAvailableSource===true&&p.originalImages.length===1&&!candidate?.t?.logo&&!candidate?.v?.textQuality?.logo;}
export function bqSavedPreview(p,review,candidates){const saved=review?.previewReview;if(saved?.sourceFingerprint!==bqFingerprint(p)||!p.originalImages.some(g=>bqAsset(g.url)===saved.asset))return null;if(saved.galleryFingerprint!==createHash('sha256').update(JSON.stringify([...new Set(p.originalImages.map(g=>bqAsset(g.url)))])).digest('hex'))return null;const candidate=candidates.find(c=>c.asset===saved.asset&&c.v?.imageHash===saved.imageHash);return candidate&&(!candidate.t?.diagram&&!candidate.t?.logo&&!candidate.v?.textQuality?.diagram&&!candidate.v?.textQuality?.logo||bqApprovedSourceIllustration(p,saved,candidate))?candidate:null;}
