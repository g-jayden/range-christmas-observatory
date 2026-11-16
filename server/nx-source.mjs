import {validNextItemCode} from '../web/nx-model.mjs';

// Parse JSON as data. Never execute retailer scripts or copy session headers.
export function nextPlpState(html){
 const script=String(html).match(/<script\b[^>]*id="next-plp-script"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
 if(!script)throw Error('Next official PLP state missing');
 const marker='_STATE_:',start=script.indexOf(marker)+marker.length;
 if(start<marker.length||script[start]!=='{')throw Error('Next official state JSON missing');
 let depth=0,quoted=false,escaped=false,end=-1;
 for(let i=start;i<script.length;i++){const c=script[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}}
 if(end<0)throw Error('Next official state JSON incomplete');return JSON.parse(script.slice(start,end));
}

export function nextExactPrice(raw){
 const match=String(raw||'').trim().match(/^£([\d,]+)(?:\.(\d{1,2}))?$/);
 return match?Number(match[1].replaceAll(',',''))*100+Number((match[2]||'').padEnd(2,'0')):null;
}

export function nextListingPage(state){
 const search=state.search,summary=state.productSummary?.summaryItemsData;
 if(!Number.isInteger(search?.totalResults)||search.totalResults<0||!Array.isArray(search.items)||!summary||!Number.isInteger(state.request?.page)||state.request.page<1)throw Error('Next listing count, page or summaries missing');
 const url=new URL(state.request.url);if(url.origin!=='https://www.next.co.uk'||!url.pathname.startsWith('/shop/home/christmas-decorations'))throw Error('Unexpected Next official category URL');
 const cached=Object.values(search.itemsCache||{}).flat(),ids=[...new Set([...search.items,...cached].map(p=>p.itemNumber))];
 if(ids.some(id=>!validNextItemCode(id)))throw Error('Next listing item identity invalid');
 const rows=ids.map(itemCode=>{const p=summary[itemCode];if(!p)return {itemCode,summaryReady:false};const selected=p.colourways?.find(c=>c.id===itemCode);if(!selected)throw Error('Next selected item missing from colourways');const target=new URL(selected.url,'https://www.next.co.uk/');if(target.origin!==url.origin||!target.pathname.toUpperCase().endsWith('/'+itemCode))throw Error('Next selected item URL mismatch');return {itemCode,summaryReady:true,name:selected.t||p.title,sourceUrl:target.href,category:p.category,brand:p.brand,sourceNew:p.newIn===true,sourceColour:selected.c||'',sourcePriceText:selected.p,exactPricePence:nextExactPrice(selected.p),sizeSpecificPriceRequired:nextExactPrice(selected.p)===null,colourwayItemCodes:p.colourways.map(c=>c.id),detailsReady:false};});
 return {sourceUrl:url.href,page:state.request.page,declared:search.totalResults,displayed:search.items.length,prefetched:ids.length,rows,detailsReady:false};
}

export function assertNextCoverage(pages){
 if(!pages.length||pages[0].page!==1)throw Error('Next complete directory must start at page one');
 const count=pages[0].declared,seen=new Set();
 for(let i=0;i<pages.length;i++){const p=pages[i];if(p.page!==i+1||p.declared!==count)throw Error('Next pagination or source count changed');for(const row of p.rows){if(!row.summaryReady)throw Error('Next product summary still missing: '+row.itemCode);seen.add(row.itemCode);}}
 if(seen.size!==count)throw Error('Next source coverage incomplete: '+seen.size+' / '+count);
 return {expected:count,unique:seen.size,complete:true};
}
