import {spawnSync} from 'node:child_process';
// Both queues are durable and verified against committed native files. A mail
// provider failure in one retailer must not prevent the other from being tried.
let failed=false;for(const file of ['scripts/recover-committed-notifications.mjs','scripts/deliver-asda-notifications.mjs','scripts/deliver-ms-notifications.mjs','scripts/deliver-bm-notifications.mjs','scripts/deliver-outbox.mjs','scripts/mail-readiness.mjs']){const r=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});if(r.status!==0)failed=true;}
if(failed)process.exitCode=1;
