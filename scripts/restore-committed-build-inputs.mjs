import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function restoreCommittedBuildInputs({cwd=process.cwd(),env=process.env}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_WORKFLOW!=='Publish committed catalogues without source collection')throw Error('Only the source-free Pages workflow may restore its committed build inputs');
 const git=args=>execFileSync('git',args,{cwd,encoding:'utf8',maxBuffer:16777216});
 const revision=git(['rev-parse','HEAD']).trim();
 git(['restore','--source=HEAD','--worktree','--','web']);
 // Tests are allowed to make isolated fixtures; the publishing job is not a
 // collector. Only tracked files from this immutable source commit can ship.
 git(['clean','-fd','--','web']);
 if(git(['diff','--name-only','HEAD','--','web']).trim())throw Error('Committed catalogue build inputs did not restore exactly');
 return{revision,committedSourceRestored:true,sourceRequests:0,firecrawlCredits:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1])))console.log(JSON.stringify({phase:'restore-committed-build-inputs',...restoreCommittedBuildInputs()}));
