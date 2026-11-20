// GitHub checkout logs record the checkout used by a delayed job; the event's
// head SHA can predate it by hours. Never substitute the trigger revision.
export function verifiedCheckoutFromLog(text){
 const rows=String(text).split(/\r?\n/),found=new Set();
 for(let i=0;i<rows.length;i++)if(/\[command\].*\bgit log -1 --format=%H\s*$/.test(rows[i])){
  const m=rows[i+1]?.match(/(?:^|\s)([a-f0-9]{40})\s*$/);if(m)found.add(m[1]);
 }
 if(found.size!==1)throw Error('Missing or ambiguous actual native collector checkout');
 return [...found][0];
}
