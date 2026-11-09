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
export const groupsForScope=id=>isAsdaScope(id)?ASDA_GROUPS:CATALOGUE_GROUPS;
export const RETAILERS=[{id:'the-range',name:'The Range',country:'英国 · United Kingdom',collections:[
 {id:'christmas',zh:'圣诞产品',en:'Christmas',available:true,groups:CATALOGUE_GROUPS},
 {id:'autumn',zh:'秋季产品',en:'Autumn',available:false},
 {id:'spring',zh:'春季产品',en:'Spring',available:false}
]}];
export const normaliseScope=id=>id==='themes'?THEME_DEFINITIONS[0].id:Object.hasOwn(DEPARTMENT_MAP,id)?id:'tree';
export const groupForScope=id=>groupsForScope(id).find(g=>g.children.includes(normaliseScope(id)));
export function cataloguePath(id){const d=DEPARTMENT_MAP[normaliseScope(id)],g=groupForScope(id);return [{id:isAsdaScope(id)?'asda':'the-range',zh:isAsdaScope(id)?'ASDA · George':'The Range',en:''},{id:'christmas',zh:'圣诞产品',en:'Christmas'},{id:g.id,zh:g.zh,en:g.en},{id:d.id,zh:d.zh,en:d.en}];}
export function readCatalogueLocation(value){const p=new URL(value,'https://catalogue.invalid').searchParams;const candidate=normaliseScope(p.get('scope')),asda=p.get('retailer')==='asda'||isAsdaScope(candidate);return {retailer:asda?'asda':'the-range',collection:'christmas',scope:asda&&!isAsdaScope(candidate)?'asda-tree':candidate,mode:['all','new','today'].includes(p.get('mode'))?p.get('mode'):'all'};}
export function catalogueLocation(value,scope,mode='all'){const u=new URL(value,'https://catalogue.invalid');u.searchParams.set('retailer',isAsdaScope(scope)?'asda':'the-range');u.searchParams.set('collection','christmas');u.searchParams.set('scope',normaliseScope(scope));u.searchParams.set('mode',['all','new','today'].includes(mode)?mode:'all');return u.pathname+u.search+u.hash;}
