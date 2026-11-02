if(process.env.REPAIR_SCOPE==='decorations'){
 const {repairDecorations}=await import('../server/repair-decorations.mjs');
 if(!(await repairDecorations()).success)process.exitCode=1;
}else await import('../server/repair-snapshot.mjs');
