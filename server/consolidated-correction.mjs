import {createHash} from 'node:crypto';
import {productRetailer} from '../web/product-facts.mjs';
import {PDF_LAYOUT_VERSION,productNames} from '../web/product-names.mjs';
import {offeredObject} from '../web/taxonomy.mjs';
import {createCatalogueReport} from './catalogue-report.mjs';
// Reflow already-delivered, immutable report evidence. This path cannot collect
// a catalogue or purchase an image. Each original is checked against its receipt.
export async function prepareConsolidatedCorrection(plan,{readManifest,readNative,render=createCatalogueReport,output}={}){
 if(!plan?.correction||!Array.isArray(plan.parentReports)||plan.parentReports.length!==plan.parents?.length||new Set(plan.parents).size!==plan.parents.length)throw Error('An explicit consolidated correction plan is required');
 const items=new Map(),declared=new Set(plan.products.map(p=>p.digestProductKey));
 for(const parent of plan.parentReports){if(!plan.parents.includes(parent.id)||!/^[a-f0-9]{40}$/.test(parent.revision||'')||!/^[a-f0-9]{64}$/.test(parent.pdfSha256||''))throw Error('Pinned original report receipt missing');const m=await readManifest(parent);if(m.version!=='daily-native-pdf-v1'||m.planId!==parent.id||m.day!==plan.day||m.pdf?.sha256!==parent.pdfSha256||!Array.isArray(m.items))throw Error('Original delivered manifest differs from its provider receipt');for(const item of m.items){if(!declared.has(item.key)||!Number.isFinite(item.priceGBP)||item.priceGBP<0||typeof item.size!=='string'||!item.size||!item.names?.zh||!item.names?.en||!/^[a-f0-9]{64}$/.test(item.imageSha256||''))throw Error('Invalid original report product evidence');const previous=items.get(item.key);if(previous&&JSON.stringify(previous)!==JSON.stringify(item))throw Error('Conflicting duplicate product across original reports');items.set(item.key,item);}}
 if(items.size!==declared.size)throw Error('A correction must preserve every distinct product in the delivered reports');
 const images=new Map(),products=[],classificationCorrections=[];
 for(const candidate of plan.products){const item=items.get(candidate.digestProductKey);if(item.sku!==candidate.sku||item.sourceUrl!==candidate.sourceUrl||item.retailerId!==productRetailer(candidate))throw Error('Original product identity does not match the owner plan');const p={...candidate,priceGBP:item.priceGBP,variantName:item.names.en},bytes=await readNative(item);if(createHash('sha256').update(bytes).digest('hex')!==item.imageSha256)throw Error('Original source photograph digest mismatch');
  const type=item.retailerId==='the-range'?offeredObject(p):null;if(type?.reason==='offered-explicit-Christmas-light-set-before-hanging-use-context'&&(p.department||p.kind)!=='lights'){const previousDepartment=p.department||p.kind;p.department='lights';p.departmentIds=['lights'];p.taxonomyAudit={...p.taxonomyAudit,primary:'lights'};items.set(item.key,{...item,names:productNames({...p,localizedProductName:undefined})});classificationCorrections.push({key:item.key,previousDepartment,department:'lights',reason:type.reason,imageSha256:item.imageSha256});}
  images.set(p,bytes);products.push(p);}
 const facts=p=>items.get(p.digestProductKey),bytes=await render(products,{output,readImage:p=>images.get(p),productNames:p=>facts(p).names,productPrice:p=>'£'+facts(p).priceGBP.toFixed(2),productSize:p=>facts(p).size});
 return{bytes,manifest:{correction:true,originalReports:plan.parents,sourceReports:plan.parentReports,classificationCorrections,version:'daily-native-pdf-v1',layoutVersion:PDF_LAYOUT_VERSION,planId:plan.id,day:plan.day,items:plan.products.map(p=>items.get(p.digestProductKey)),pdf:{sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}},sourceRequests:0,firecrawlCredits:0};
}
