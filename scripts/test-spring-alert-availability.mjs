import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {SPRING_DEPARTMENTS} from '../web/spring-model.mjs';
import {DEPARTMENTS} from '../web/catalogue-model.mjs';
import {CATALOGUE_GROUPS} from '../web/catalogue-navigation.mjs';
const code=await fs.readFile(new URL('../web/controls.js',import.meta.url),'utf8'),start=code.indexOf(' const groups='),end=code.indexOf(' const el=id=>');assert(start>0&&end>start);
for(const alerts of [false,true]){
 const element={innerHTML:''},context={SPRING_AVAILABLE:true,SPRING_ALERTS_AVAILABLE:alerts,SPRING_DEPARTMENTS,DEPARTMENTS,CATALOGUE_GROUPS,retailerEnabled:()=>true,document:{getElementById:()=>element}};
 for(const id of ['AR','MT','BQ','NX','JL','ASDA','DU','HB','BM','MS'])context[id+'_DEPARTMENTS']=[];
 runInNewContext(code.slice(start,end),context);
 for(const d of SPRING_DEPARTMENTS)assert.equal(element.innerHTML.includes('value="'+d.id+'"'),alerts,'Website availability alone must not add an inactive monitor to a recipient\'s complete daily PDF barrier');
 assert(element.innerHTML.includes('value="tree"'),'Existing Christmas subscriptions remain available');
}
console.log('PASS: verified Spring browsing cannot automatically subscribe a new recipient to an unstarted Spring monitor or block their complete daily Christmas PDF; email scopes have their own readiness flag.');
