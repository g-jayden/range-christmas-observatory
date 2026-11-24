export function reusableBqSource(snapshot,now=Date.now()) {
  const day=new Date(now+28800000).toISOString().slice(0,10),due=Date.parse(day+'T06:00:00+08:00');
  return Boolean(snapshot?.collectionComplete&&snapshot.automaticArrivalChecks&&Date.parse(snapshot.observedAt)>=due&&Date.parse(snapshot.observedAt)<=now&&snapshot.sourceAudits?.length===10&&snapshot.sourceAudits.every(a=>a.complete&&a.closingVerified&&a.unique===a.expected)&&Array.isArray(snapshot.products)&&snapshot.products.length&&new Set(snapshot.products.map(p=>p.sku)).size===snapshot.products.length);
}

// A photo-only continuation must prefer today's closed staged source over an
// older accepted catalogue. The 06:00 observation window matches the 07:00
// digest barrier and does not force a second paid scan of a 06:xx catalogue.
export function preferBqStagedSource(staged,previous,now=Date.now()){
 return Boolean(reusableBqSource(staged,now)&&!staged.variantEvidencePending?.length&&!(Date.parse(previous?.observedAt)>Date.parse(staged.observedAt)));
}
