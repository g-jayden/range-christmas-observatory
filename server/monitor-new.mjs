import {runUpdate} from './update-daily.mjs';
process.env.COLLECTION_MODE='catalogue';
const result=await runUpdate();if(!result.success)process.exitCode=1;
