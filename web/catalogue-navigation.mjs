import {BM_DEPARTMENTS,isBmScope} from './bm-model.mjs';
import {MS_DEPARTMENTS,isMsScope} from './ms-model.mjs';
import {RETAILER_INFO,retailerForScope,retailerName} from './retailers.mjs';
import {ASDA_DEPARTMENTS,isAsdaScope} from './asda-model.mjs';
import {DEPARTMENTS,DEPARTMENT_MAP,THEME_DEFINITIONS} from './catalogue-model.mjs';

// Navigation groups organise existing departments; they never reclassify SKUs.
export const CATALOGUE_GROUPS=[
 {id:'trees',zh:'树与树裙',en:'Trees & tree skirts',icon:'tree',children:['tree','skirt']},
 {id:'decorations',zh:'圣诞装饰',en:'Christmas decorations',icon:'ornament',children:['ornaments','standing','wreath','garland','spray','candle-holder','swag','scenes','tree-decorations','inflatable','outdoor','wall','presents']},
 {id:'lighting',zh:'圣诞灯饰',en:'Christmas lights',icon:'light',children:['lights',...DEPARTMENTS.filter(d=>d.parentId==='lights').map(d=>d.id)]},
 {id:'themes',zh:'主题系列',en:'Christmas themes',icon:'palette',children:THEME_DEFINITIONS.map(d=>d.id)}
];
export const ASDA_GROUPS=[{id:'asda-trees',zh:'圣诞树与树饰',en:'Trees & tree decorations',icon:'tree',children:['asda-tree','asda-tree-decorations']},{id:'asda-decorations',zh:'圣诞装饰',en:'Christmas decorations',icon:'ornament',children:['asda-room','asda-wreath','asda-garland','asda-outdoor']},{id:'asda-lighting',zh:'圣诞灯',en:'Christmas Lights',icon:'light',children:['asda-lights']}];
export const MS_GROUPS=[{id:'ms-trees',zh:'圣诞树',en:'Christmas Trees',icon:'tree',children:['ms-tree']},{id:'ms-decorations',zh:'圣诞装饰',en:'Christmas Decorations',icon:'ornament',children:['ms-baubles','ms-wreath','ms-garland','ms-stockings']},{id:'ms-lighting',zh:'圣诞彩灯',en:'Christmas Lights',icon:'light',children:['ms-lights']}];
export const BM_GROUPS=[{id:'bm-trees',zh:'圣诞树与树饰',en:'Trees & tree decorations',icon:'tree',children:['bm-tree','bm-baubles']},{id:'bm-decorations',zh:'圣诞装饰',en:'Christmas decorations',icon:'ornament',children:['bm-wreath','bm-garland','bm-outdoor']},{id:'bm-lighting',zh:'圣诞灯',en:'Christmas Lights',icon:'light',children:['bm-lights']}];
export const groupsForScope=id=>isBmScope(id)?BM_GROUPS:isMsScope(id)?MS_GROUPS:isAsdaScope(id)?ASDA_GROUPS:CATALOGUE_GROUPS;
export const RETAILERS=[{id:'the-range',name:'The Range',country:'英国 · United Kingdom',collections:[
 {id:'christmas',zh:'圣诞产品',en:'Christmas',available:true,groups:CATALOGUE_GROUPS},
 {id:'autumn',zh:'秋季产品',en:'Autumn',available:false},
 {id:'spring',zh:'春季产品',en:'Spring',available:false}
]}];
RETAILERS.push(...[{id:'bm',name:'B&M',groups:BM_GROUPS},{id:'asda',name:'ASDA · George',groups:ASDA_GROUPS},{id:'ms',name:'M&S · Marks & Spencer',groups:MS_GROUPS}].map(r=>({id:r.id,name:r.name,country:'英国 · United Kingdom',collections:[{id:'christmas',zh:'圣诞产品',en:'Christmas',available:true,groups:r.groups},{id:'autumn',zh:'秋季产品',en:'Autumn',available:false},{id:'spring',zh:'春季产品',en:'Spring',available:false}]})));
export const normaliseScope=id=>id==='themes'?THEME_DEFINITIONS[0].id:Object.hasOwn(DEPARTMENT_MAP,id)?id:'tree';
export const groupForScope=id=>groupsForScope(id).find(g=>g.children.includes(normaliseScope(id)));
export function cataloguePath(id){const d=DEPARTMENT_MAP[normaliseScope(id)],g=groupForScope(id),retailer=retailerForScope(id);return [{id:retailer,zh:retailerName(retailer),en:''},{id:'christmas',zh:'圣诞产品',en:'Christmas'},{id:g.id,zh:g.zh,en:g.en},{id:d.id,zh:d.zh,en:d.en}];}
export function readCatalogueLocation(value){const p=new URL(value,'https://catalogue.invalid').searchParams,candidate=normaliseScope(p.get('scope')),explicit=p.get('retailer'),retailer=Object.hasOwn(RETAILER_INFO,explicit)?explicit:retailerForScope(candidate);return {retailer,collection:'christmas',scope:retailerForScope(candidate)===retailer?candidate:RETAILER_INFO[retailer].defaultScope,mode:['all','new','today'].includes(p.get('mode'))?p.get('mode'):'all'};}
export function catalogueLocation(value,scope,mode='all'){const u=new URL(value,'https://catalogue.invalid');u.searchParams.set('retailer',retailerForScope(scope));u.searchParams.set('collection','christmas');u.searchParams.set('scope',normaliseScope(scope));u.searchParams.set('mode',['all','new','today'].includes(mode)?mode:'all');return u.pathname+u.search+u.hash;}
