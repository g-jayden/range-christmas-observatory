import fs from 'node:fs/promises';import {finishNewEvents} from '../server/new-events.mjs';
const file='runtime/notification-outbox.private.json';let out;try{out=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT'){console.log('No verified NEW delivery queued.');process.exit(0)}throw e}
process.env.NOTIFICATION_PHASE='deliver';const result=await finishNewEvents(out.result,{snapshot:out.snapshot,lease:out.lease});console.log(JSON.stringify({success:result.success,captured:result.captured,delivery:result.delivery}));await fs.unlink(file);
