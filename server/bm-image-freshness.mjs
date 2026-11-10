export function bmImageFresh(prior,observedAt,{maxAgeDays=7,now=Date.now()}={}){
 const checked=Date.parse(prior?.checkedAt||prior?.observedAt),source=Date.parse(observedAt);
 return Boolean(prior?.file&&Number.isFinite(checked)&&Number.isFinite(source)&&checked>=source&&checked<=now&&now-checked<maxAgeDays*86400000);
}
