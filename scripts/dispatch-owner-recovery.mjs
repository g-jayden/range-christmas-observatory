import fs from'node:fs/promises';import{dispatchOwnerRecovery}from'../server/owner-recovery-dispatch.mjs';
const request=JSON.parse(await fs.readFile('ops/owner-recovery-request.json'));console.log(JSON.stringify(await dispatchOwnerRecovery(request)));
