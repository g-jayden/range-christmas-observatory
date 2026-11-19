// Shared by live DOM and normal same-origin HTML reads. Every relative link is
// resolved against the actual requested page, including pagination and ranges.
export function readJlDirectoryDom(input={}){
 const detached=typeof input.html==='string',doc=detached?new DOMParser().parseFromString(input.html,'text/html'):document,base=input.url||location.href;
 if(detached)doc.querySelectorAll('script,style,noscript').forEach(n=>n.remove());
 const text=n=>(n?.innerText??n?.textContent??'').trim(),href=a=>a?.getAttribute('href')?new URL(a.getAttribute('href'),base).href:null;
 const rows=[...doc.querySelectorAll('article[data-product-id]')].map(c=>{
  const anchors=[...c.querySelectorAll('a[href]')],product=a=>/\/p\d+$/.test(new URL(href(a)).pathname),p=anchors.find(a=>product(a)&&text(a)&&!/^(?:£|Product review)/.test(text(a)))||anchors.find(product);
  const range=!p&&anchors.find(a=>text(a)==='View range'),source=p||range;
  return {pageProductId:c.getAttribute('data-product-id'),type:range?'range-navigation':'product',name:text(p)||text(c).split('\n').slice(1,3).join(' '),sourceUrl:href(source)?.split('#')[0]||null,text:text(c),sponsored:/\bSponsored\b/.test(text(c)),unavailable:/Email when available/.test(text(c)),images:[...c.querySelectorAll('img')].map(i=>({alt:i.alt,url:i.currentSrc||i.getAttribute('src')})).filter(i=>i.url?.includes('johnlewiscontent.com'))};
 });
 const u=new URL(base);return {url:u.origin+u.pathname+u.search,title:text(doc.querySelector('h1')),documentTitle:doc.title,count:text(doc.body).match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*([\d,]+)/)?.slice(1).map(s=>Number(s.replaceAll(',',''))),next:href([...doc.querySelectorAll('a[href]')].find(a=>text(a)==='Next'&&href(a).includes('page='))),rows};
}
