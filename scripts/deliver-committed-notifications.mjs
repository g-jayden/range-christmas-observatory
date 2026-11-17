import {spawnSync} from 'node:child_process';
// Both queues are durable and verified against committed native files. A mail
// provider failure in one retailer must not prevent the other from being tried.
let failed=false;for(const command of ['scripts/recover-committed-notifications.mjs','scripts/deliver-asda-notifications.mjs','scripts/deliver-ms-notifications.mjs','scripts/deliver-bm-notifications.mjs','scripts/deliver-hb-notifications.mjs','scripts/deliver-du-notifications.mjs','scripts/deliver-nx-notifications.mjs','scripts/deliver-jl-notifications.mjs','scripts/deliver-outbox.mjs','scripts/mail-readiness.mjs',['scripts/deliver-retailer-notifications.mjs','mt'],['scripts/deliver-retailer-notifications.mjs','bq']]){const r=spawnSync(process.execPath,Array.isArray(command)?command:[command],{stdio:'inherit',env:process.env});if(r.status!==0)failed=true;}
if(failed)process.exitCode=1;
