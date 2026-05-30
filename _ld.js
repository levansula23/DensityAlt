function sig(pa,t){return Math.pow((288.16-pa*0.0019812)/288.16,5.2563)/((273.16+t)/288.16);}
function da(s){return 145426*(1-Math.pow(s,0.235));}
function ld(s){return (1/s-1)*100;}
var lines=[];
// rendered page reported DA 9010 -> back out the conditions. Page default PA=6000.
// Try OAT values to find which gives DA~9010
[20,25,30,35].forEach(function(t){
  var s=sig(6000,t); lines.push("PA6000 OAT"+t+"C: sigma="+s.toFixed(4)+" DA="+Math.round(da(s))+" LD=+"+Math.round(ld(s))+"% ROT(3.5/1000)=+"+Math.round(da(s)/1000*3.5)+"%");
});
require("fs").writeFileSync("_ldout.txt", lines.join("\n")+"\n");
