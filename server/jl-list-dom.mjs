export function readJlDirectoryDom(){
 const rows=[...document.querySelectorAll('article[data-product-id]')].map(c=>{
  const anchors=[...c.querySelectorAll('a[href]')],product=a=>/\/p\d+$/.test(new URL(a.href).pathname),p=anchors.find(a=>product(a)&&a.textContent.trim()&&!/^(?:£|Product review)/.test(a.textContent.trim()))||anchors.find(product);
  const range=!p&&anchors.find(a=>a.textContent.trim()==='View range'),source=p||range;
  return {pageProductId:c.getAttribute('data-product-id'),type:range?'range-navigation':'product',name:p?.textContent.trim()||c.innerText.split('\n').slice(1,3).join(' '),sourceUrl:source?.href.split('#')[0]||null,text:c.innerText,sponsored:/\bSponsored\b/.test(c.innerText),unavailable:/Email when available/.test(c.innerText),images:[...c.querySelectorAll('img')].map(i=>({alt:i.alt,url:i.currentSrc||i.src})).filter(i=>i.url.includes('johnlewiscontent.com'))};
 });
 return {url:location.origin+location.pathname+location.search,title:document.querySelector('h1')?.textContent.trim(),count:document.body.innerText.match(/(\d+)\s*[-–]\s*(\d+)\s*of\s*([\d,]+)/)?.slice(1).map(s=>Number(s.replaceAll(',',''))),next:[...document.querySelectorAll('a')].find(a=>a.textContent.trim()==='Next'&&a.href.includes('page='))?.href||null,rows};
}
