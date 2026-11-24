import {restoreSavedMsEvidence} from '../server/saved-ms-evidence.mjs';
if(process.env.GITHUB_REPOSITORY!=='g-jayden/range-christmas-observatory'||!/^\d+$/.test(process.env.GITHUB_RUN_ID||''))throw Error('M&S restoration requires its repository workflow');
console.log(JSON.stringify(await restoreSavedMsEvidence({archiveRoot:'runtime/ms-saved-evidence'})));
