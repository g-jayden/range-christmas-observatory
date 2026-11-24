import{prepareNativeRecoveryArchive}from'../server/native-recovery-archive.mjs';
const report=await prepareNativeRecoveryArchive();console.log(JSON.stringify({phase:'Save unpublished native Git blobs before runner shutdown',...report,files:undefined}));if(report.rejected.length)process.exitCode=1;
