// Registered only after complete official catalogue and image acceptance.
import {nxPhysicalObject} from './nx-physical.mjs';
export const NX_DEPARTMENTS=[['nx-baubles','圣诞装饰球','Baubles'],['nx-wreath','圣诞圈','Christmas Wreaths'],['nx-garland','圣诞长藤','Christmas Garlands'],['nx-tree','圣诞树','Christmas Trees'],['nx-ornaments','圣诞装饰品','Christmas Ornaments']].map(([id,zh,en])=>({id,zh,en,label:zh+' · '+en,retailerId:'nx'}));
export const NEXT_DIRECTORIES=[['nx-baubles','/shop/home/christmas-decorations/baubles'],['nx-wreath','/shop/home/christmas-decorations/wreath'],['nx-garland','/shop/home/christmas-decorations/garland'],['nx-tree','/shop/home/christmas-decorations/christmas-trees'],['nx-ornaments','/shop/home/christmas-decorations/f/type-ornaments']];
export const validNextItemCode=value=>/^(?:\d{6}|[A-Z]\d{5}|[A-Z]{2}\d{4})$/.test(String(value));
export const isNxScope=id=>NX_DEPARTMENTS.some(d=>d.id===id);
export function nxMemberships(p){const memberships=nxPhysicalObject({name:p.baseName||p.variantName,description:p.sourceDescription,groups:p.nxSource?.groups,maxCm:p.dimensions?.maxCm});return {primary:memberships[0]||null,memberships,method:'Next-official-scope-physical-product-and-exact-variant-description',...(memberships.length?{}:{disposition:'exclude',reason:'官网关联的非指定圣诞商品 · Related product outside the five requested Christmas categories'})};}
