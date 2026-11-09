import {isAsdaScope} from './asda-model.mjs';
import {CATALOGUE_GROUPS,groupsForScope,groupForScope,cataloguePath} from './catalogue-navigation.mjs';
import {DEPARTMENT_MAP} from './catalogue-model.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={tree:'<path d="m12 3 5 6h-3l5 6h-5v5h-4v-5H5l5-6H7z"/>',ornament:'<path d="M9 5h6M10 2h4v3h-4z"/><circle cx="12" cy="13" r="8"/><path d="m6 10 12 6"/>',light:'<path d="M8 15c-5-5-2-12 4-12s9 7 4 12l-1 2H9zM9 20h6M10 17v3m4-3v3"/>',palette:'<path d="M20 12c0-5-4-9-9-9S2 7 2 12s4 9 9 9h2c2 0 3-3 1-4-2-2 0-4 2-3 2 0 4 0 4-2Z"/><circle cx="7" cy="10" r=".7"/><circle cx="10" cy="6.5" r=".7"/><circle cx="15" cy="7" r=".7"/>'};
const icon=id=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[id]+'</svg>';

export function setupCatalogueNavigation({onSelect}){
 const el=id=>document.getElementById(id),nav=el('departmentNav'),sidebar=el('catalogueSidebar'),slot=el('sidebarSlot'),drawer=el('catalogueDialog'),query=el('categorySearch'),mobile=matchMedia('(max-width: 1000px)');let active='',drawerOpener=null,settingsOpener=null;
 function draw(scope){nav.innerHTML=groupsForScope(scope).map(g=>'<details class="navBranch" data-group="'+g.id+'"><summary>'+icon(g.icon)+'<span>'+g.zh+'<small>'+g.en+'</small></span><span class="branchCount">'+(g.id==='lighting'?g.children.length-1:g.children.length)+'</span></summary><div class="navLeaves">'+g.children.map(id=>{const d=DEPARTMENT_MAP[id];return '<button type="button" id="scope-'+id+'" data-department="'+id+'" aria-pressed="false"><span>'+(id==='lights'?'全部灯饰':esc(d.zh))+'<small>'+(id==='lights'?'All Christmas lights':esc(d.en))+'</small></span><span class="leafArrow" aria-hidden="true">↗</span></button>';}).join('')+'</div></details>').join('');}
 draw('tree');
 el('retailerSelect').onchange=()=>onSelect(el('retailerSelect').value==='asda'?'asda-tree':'tree');
 function showActiveBranch(){const group=groupForScope(active);for(const branch of nav.querySelectorAll('.navBranch'))branch.open=branch.dataset.group===group?.id;}
 function filter(){const q=query.value.trim().toLowerCase();let count=0;for(const group of nav.querySelectorAll('.navBranch')){let matches=0;for(const button of group.querySelectorAll('[data-department]')){const d=DEPARTMENT_MAP[button.dataset.department],hit=!q||(d.label+' '+group.querySelector('summary').textContent).toLowerCase().includes(q);button.hidden=!hit;if(hit)matches++;}group.hidden=!matches;if(q&&matches)group.open=true;count+=matches;}el('categoryEmpty').hidden=count>0;el('clearCategorySearch').hidden=!q;if(!q)showActiveBranch();}
 function closeDrawer(){if(drawer.open)drawer.close();}
 nav.addEventListener('click',e=>{const b=e.target.closest('[data-department]');if(!b)return;query.value='';filter();onSelect(b.dataset.department);closeDrawer();});
 for(const branch of nav.querySelectorAll('.navBranch'))branch.addEventListener('toggle',()=>{if(branch.open&&!query.value.trim())for(const other of nav.querySelectorAll('.navBranch'))if(other!==branch)other.open=false;});
 query.addEventListener('input',filter);el('clearCategorySearch').onclick=()=>{query.value='';filter();query.focus();};
 el('catalogueOpen').onclick=()=>{drawerOpener=document.activeElement;drawer.append(sidebar);drawer.showModal();el('catalogueOpen').setAttribute('aria-expanded','true');};
 el('catalogueClose').onclick=closeDrawer;
 drawer.addEventListener('close',()=>{slot.append(sidebar);el('catalogueOpen').setAttribute('aria-expanded','false');if(mobile.matches)drawerOpener?.focus();});
 drawer.addEventListener('click',e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDrawer();}});
 mobile.addEventListener('change',()=>{if(!mobile.matches)closeDrawer();});
 const settings=el('settingsDialog');
 for(const button of document.querySelectorAll('[data-open-settings]'))button.addEventListener('click',()=>{settingsOpener=button;settings.showModal();});
 el('settingsClose').onclick=()=>settings.close();settings.addEventListener('close',()=>settingsOpener?.focus());
 settings.addEventListener('click',e=>{if(e.target===settings){const r=settings.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)settings.close();}});
 return {update(scope,mode){const changed=active!==scope;if(!active||isAsdaScope(active)!==isAsdaScope(scope)){query.value='';draw(scope);}active=scope;el('retailerSelect').value=isAsdaScope(scope)?'asda':'the-range';el('retailerEyebrow').textContent=isAsdaScope(scope)?'ASDA · GEORGE':'THE RANGE';const path=cataloguePath(scope),d=DEPARTMENT_MAP[scope];for(const b of nav.querySelectorAll('[data-department]')){const yes=b.dataset.department===scope;b.setAttribute('aria-pressed',String(yes));if(yes)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  if(changed&&!query.value.trim())showActiveBranch();el('pageTitle').textContent=d.zh;el('pageTitleEnglish').textContent=d.en;el('mobileScope').textContent=d.zh;el('mobileScopeEnglish').textContent=d.en;
  el('catalogueBreadcrumb').innerHTML=path.map((p,i)=>'<span class="crumb '+(i===2?'crumbGroup':'')+'"'+(i===path.length-1?' aria-current="page"':'')+'>'+esc(p.zh)+(p.en?'<small>'+esc(p.en)+'</small>':'')+'</span>').join('<span class="crumbSeparator" aria-hidden="true">/</span>');
  el('catalogueBreadcrumb').setAttribute('aria-label',path.map(p=>p.zh+(p.en?' · '+p.en:'')).join(' → '));document.title=d.zh+' · '+d.en+' | '+(isAsdaScope(scope)?'ASDA · George':'The Range')+' · 选品观察室';
  for(const id of ['all','new','today'])el(id+'Tab').setAttribute('aria-pressed',String(mode===id));
 },close:closeDrawer};
}
