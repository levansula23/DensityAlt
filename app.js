"use strict";

const G=9.80665, M=0.0289644, R=8.31447, L=0.0065;
const T0=288.15, P0=101325, RHO0=1.225;
const FT_PER_M=3.28084, PA_PER_INHG=3386.389, MMHG_PER_PA=0.00750062;
const FIO2=0.2095, PH2O=47, RQ=0.8;
const MAX_ALT=65000;
const CABIN_MAX=60000;
const KB=1.380649e-23, N0=P0/(KB*T0);

function isa(h){
  let T,P;
  if(h<=11000){
    T=T0-L*h;
    P=P0*Math.pow(T/T0, G*M/(R*L));
  } else {
    const T11=T0-L*11000;
    const P11=P0*Math.pow(T11/T0, G*M/(R*L));
    T=T11;
    P=P11*Math.exp(-G*M*(h-11000)/(R*T11));
  }
  return {T,P,rho:P*M/(R*T)};
}
function paCO2(altFt){ return Math.max(18, 40 - 0.0015*Math.max(0, altFt-8000)); }
function spo2(pao2){ return pao2<=0?0:100/(1+23400/(pao2*pao2*pao2 + 150*pao2)); }
function pressureToAltFt(P){ return (T0/L)*(1-Math.pow(P/P0, R*L/(G*M)))*FT_PER_M; }

const TUC=[[18000,'20–30 min'],[22000,'~10 min'],[25000,'3–5 min'],[28000,'2.5–3 min'],
           [30000,'1–2 min'],[35000,'30–60 sec'],[40000,'15–20 sec'],[43000,'9–12 sec']];
function tuc(a){ if(a<15000)return null; let r='30+ min'; for(const[al,l]of TUC){if(a>=al)r=l;} return r; }

const LM=[
  {a:0,t:'Sea level',c:'#9fd0ff'},
  {a:5280,t:'Denver',c:'#9fd0ff'},
  {a:12500,t:'FAA crew O₂ (>30 min)',c:'#ffd27a'},
  {a:14000,t:'FAA crew O₂ (continuous)',c:'#ffb84d'},
  {a:18000,t:'½ the atmosphere is below you',c:'#ffb84d'},
  {a:26000,t:'Death zone',c:'#ff7a45'},
  {a:29032,t:'Mt Everest',c:'#ff9d6b'},
  {a:38000,t:'Airliner cruise',c:'#bcd'},
  {a:63000,t:"Armstrong limit — water boils at body temp",c:'#ff4d4d'},
];

let alt=8000;
let lastDA=0, tempUnit='C';
const fmt=n=>Math.round(n).toLocaleString('en-US');
const commaInt=s=>{const n=parseFloat(String(s).replace(/,/g,''));return isNaN(n)?0:n;};
const sciHTML=n=>{ if(n<=0)return '0'; const e=Math.floor(Math.log10(n)); return (n/Math.pow(10,e)).toFixed(2)+' × 10<sup>'+e+'</sup>'; };

const $=id=>document.getElementById(id);
let slider,sky,air,curve,pcChart,hpChart,cabinChart,daChart,kChart,xChart;
let skc,ac,cc,pcc,hpc,cbc,dac,kc,xc;

function fit(cv,ctx){const r=cv.getBoundingClientRect();const d=window.devicePixelRatio||1;
  cv.width=r.width*d;cv.height=r.height*d;ctx.setTransform(d,0,0,d,0,0);return {w:r.width,h:r.height};}
let airDim,curveDim,pcDim,hpDim,cabinDim,skyDim,daDim,kDim,xDim;
let cabinXMax=51000;
let dragging=false;
let kTempUnit='C';

function satColor(s){
  if(s>=95)return '#37d67a';
  if(s>=90)return '#9ad637';
  if(s>=85)return '#ffd24d';
  if(s>=80)return '#ffb84d';
  if(s>=70)return '#ff7a45';
  return '#ff4d4d';
}
function feelText(s){
  if(s>=95)return 'Normal — no impairment';
  if(s>=90)return 'Mild — subtle night-vision & reaction loss';
  if(s>=85)return 'Hypoxia onset — judgment quietly degrading';
  if(s>=80)return 'Impaired — euphoria, poor decisions, no warning';
  if(s>=70)return 'Serious hypoxia — vision tunnels, hands fumble';
  if(s>=60)return 'Severe — confusion, near collapse';
  return 'Critical — loss of consciousness imminent';
}

function update(a){
  alt=Math.max(0,Math.min(MAX_ALT,a));
  const h=alt/FT_PER_M;
  const {T,P,rho}=isa(h);
  const pHpa=P/100, pInHg=P/PA_PER_INHG, pMm=P*MMHG_PER_PA, tC=T-273.15;
  const ambPO2=FIO2*pMm;
  const pao2=Math.max(0, FIO2*(pMm-PH2O)-paCO2(alt)/RQ);
  const sat=spo2(pao2);

  $('altFt').textContent=fmt(alt);
  $('altM').textContent=fmt(h)+' m';
  slider.value=alt;

  $('pHpa').textContent=Math.round(pHpa);
  $('pInHg').textContent=pInHg.toFixed(2);
  $('pPct').textContent=Math.round(P/P0*100)+'%';
  $('pBar').style.width=(P/P0*100)+'%';

  $('rho').textContent=rho.toFixed(2);
  $('rhoPct').textContent=Math.round(rho/RHO0*100)+'%';
  $('rhoBar').style.width=(rho/RHO0*100)+'%';

  const numDens=P/(KB*T);
  $('molDensity').innerHTML=sciHTML(numDens);
  $('molPct').textContent=Math.round(numDens/N0*100)+'%';

  $('tC').textContent=Math.round(tC);
  $('tF').textContent=Math.round(tC*9/5+32);
  $('tBar').style.width=Math.max(2,Math.min(100,(tC+60)/75*100))+'%';

  $('po2').textContent=Math.round(ambPO2);
  $('po2Bar').style.width=(ambPO2/(FIO2*760)*100)+'%';

  $('pao2').textContent=Math.round(pao2);
  $('pao2Bar').style.width=Math.min(100,pao2/100*100)+'%';

  const se=$('spo2'); se.innerHTML=Math.round(sat)+'<small>%</small>';
  se.style.color=satColor(sat);
  $('feel').textContent=feelText(sat);
  $('feel').style.color=satColor(sat);

  renderFlags(sat);
  drawSky();
  drawCurve(pao2,sat);
}

function renderFlags(sat){
  const f=$('flags'); f.innerHTML='';
  const t=tuc(alt);
  const add=(cls,html)=>{const d=document.createElement('div');d.className='flag '+cls;d.innerHTML=html;f.appendChild(d);};
  if(alt<5000) add('ok','✓ No supplemental oxygen required');
  else if(alt<12500) add('warn','△ Night-vision loss begins — O₂ recommended');
  else if(alt<14000) add('bad','⚠ FAR 91.211 — crew O₂ required above 12,500 ft for more than 30 min');
  else if(alt<15000) add('bad','⚠ FAR 91.211 — crew O₂ required continuously above 14,000 ft');
  else add('crit','⛔ FAR 91.211 — all occupants must be provided O₂ above 15,000 ft');
  if(t) add(alt>=25000?'crit':(alt>=18000?'bad':'warn'),'Time of useful consciousness: <span class="tuc">'+t+'</span>');
  if(alt>=26000) add('crit','Above the death zone — body cannot acclimatize');
  if(alt>=63000) add('crit','Above Armstrong limit — unprotected blood would boil');
}

let stars=null;
function drawSky(){
  const w=skyDim.w, h=skyDim.h;
  if(!stars){ stars=[]; for(let i=0;i<90;i++) stars.push({x:Math.random()*w,y:Math.random()*h*0.72,r:Math.random()*1.3+0.2,a:Math.random()*0.7+0.3}); }

  const pad=14;
  const altToY=al=>h-pad-(al/MAX_ALT)*(h-2*pad);

  const g=skc.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#01010a'); g.addColorStop(0.18,'#05143a');
  g.addColorStop(0.42,'#0b347e'); g.addColorStop(0.7,'#2f72c7'); g.addColorStop(1,'#7db9ef');
  skc.fillStyle=g; skc.fillRect(0,0,w,h);

  for(const s of stars){ const vis=1-(altToYInv(s.y,h,pad)/MAX_ALT); const op=s.a*Math.max(0,Math.min(1,(s.y/(h*0.6))*-1+1));
    skc.globalAlpha=Math.max(0,1-s.y/(h*0.62))*s.a; skc.fillStyle='#fff';
    skc.beginPath(); skc.arc(s.x,s.y,s.r,0,7); skc.fill(); }
  skc.globalAlpha=1;

  skc.textBaseline='middle'; skc.font='600 9px ui-monospace,Menlo,monospace';
  for(const m of LM){ const y=altToY(m.a); if(y<pad||y>h-pad)continue;
    skc.strokeStyle='rgba(255,255,255,.18)'; skc.lineWidth=1; skc.setLineDash([3,3]);
    skc.beginPath(); skc.moveTo(0,y); skc.lineTo(w,y); skc.stroke(); skc.setLineDash([]);
    skc.fillStyle=m.c; skc.fillText(m.t,7,y-6); }

  const y=altToY(alt);
  skc.save();
  skc.shadowColor='rgba(120,200,255,.9)'; skc.shadowBlur=14;
  skc.fillStyle='#fff'; skc.strokeStyle='#4ea1ff'; skc.lineWidth=2;
  skc.beginPath();
  skc.moveTo(w/2,y-9); skc.lineTo(w/2+8,y+7); skc.lineTo(w/2,y+3); skc.lineTo(w/2-8,y+7); skc.closePath();
  skc.fill(); skc.stroke();
  skc.restore();

  skc.fillStyle='#fff'; skc.font='700 11px ui-monospace,Menlo,monospace'; skc.textBaseline='bottom';
  skc.fillText(fmt(alt)+' ft', w/2-22, y-12);
}
function altToYInv(){return 0;}

let parts=[];
function ensureParts(n){
  while(parts.length<n) parts.push({x:Math.random()*airDim.w,y:Math.random()*airDim.h,
    vx:(Math.random()*2-1)*0.5,vy:(Math.random()*2-1)*0.5});
}
function drawAir(){
  const {w,h}=airDim;
  ac.clearRect(0,0,w,h);
  const rho=isa(alt/FT_PER_M).rho;
  const target=Math.max(4,Math.round(170*rho/RHO0));
  ensureParts(target);
  const active=parts.slice(0,target);
  for(const p of active){
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<2||p.x>w-2)p.vx*=-1; if(p.y<2||p.y>h-2)p.vy*=-1;
    p.x=Math.max(2,Math.min(w-2,p.x)); p.y=Math.max(2,Math.min(h-2,p.y));
  }
  ac.fillStyle='rgba(124,200,255,.85)';
  for(const p of active){ ac.beginPath(); ac.arc(p.x,p.y,2.1,0,7); ac.fill(); }
  requestAnimationFrame(drawAir);
}

function drawCurve(pao2,sat){
  const {w,h}=curveDim; const padL=30,padB=22,padT=10,padR=8;
  cc.clearRect(0,0,w,h);
  const xMax=120;
  const X=v=>padL+(v/xMax)*(w-padL-padR);
  const Y=s=>h-padB-(s/100)*(h-padB-padT);

  cc.strokeStyle='rgba(255,255,255,.08)'; cc.lineWidth=1; cc.font='9px ui-monospace,monospace'; cc.fillStyle='rgba(255,255,255,.45)';
  for(let s=0;s<=100;s+=25){const y=Y(s);cc.beginPath();cc.moveTo(padL,y);cc.lineTo(w-padR,y);cc.stroke();cc.fillText(s+'%',4,y+3);}
  for(let x=0;x<=120;x+=30){const xx=X(x);cc.fillText(x,xx-5,h-8);}

  cc.strokeStyle='#7cf'; cc.lineWidth=2.5; cc.beginPath();
  for(let p=0;p<=xMax;p+=1){const s=spo2(p); const xx=X(p),yy=Y(s); p===0?cc.moveTo(xx,yy):cc.lineTo(xx,yy);}
  cc.stroke();

  const mx=X(Math.min(pao2,xMax)), my=Y(sat);
  cc.strokeStyle='rgba(255,255,255,.25)'; cc.setLineDash([3,3]);
  cc.beginPath();cc.moveTo(mx,h-padB);cc.lineTo(mx,my);cc.lineTo(padL,my);cc.stroke();cc.setLineDash([]);
  cc.fillStyle=satColor(sat); cc.shadowColor=satColor(sat); cc.shadowBlur=10;
  cc.beginPath();cc.arc(mx,my,5,0,7);cc.fill(); cc.shadowBlur=0;
  cc.fillStyle='rgba(255,255,255,.6)'; cc.font='9px ui-monospace,monospace';
  cc.fillText('PaO₂ (mmHg)', w-78, h-8);
}

const AIRPORTS={
 KMYF:423,KGAI:539,KSEE:388,KSEZ:4830,KSBA:13,KRNM:1395,KHMT:1512,KOKB:28,KPSP:477,KSGU:2941,KPGA:4316,
 KLAX:125,KSMO:177,KBUR:778,KAVX:1602,KGCN:6609,KSAN:17,L06:-210,
 KJFK:13,KLGA:21,KEWR:18,KORD:672,KMDW:620,KATL:1026,KDEN:5434,KSFO:13,KOAK:9,KSJC:62,KSEA:433,KBOS:20,
 KDFW:607,KDAL:487,KLAS:2181,KPHX:1135,KMIA:8,KFLL:65,KMCO:96,KDCA:15,KIAD:313,KBWI:146,KSLC:4227,KMSP:1044,
 KDTW:645,KPHL:36,KCLT:748,KIAH:97,KAUS:542,KPDX:31,KSMF:27,KSAF:6349,KFLG:7014,
 KASE:7838,KTEX:9078,KLXV:9934,KEGE:6548,KJAC:6451,KTRK:5901,KAPA:5885,KBJC:5673,
 EGLL:83,EGKK:202,LFPG:392,LFPO:291,EHAM:-11,EDDF:364,EDDM:1487,LIRF:15,LIMC:768,LEMD:1998,LEBL:12,
 LSZH:1416,LOWW:600,EKCH:17,ESSA:137,LPPT:374,LTFM:325,
 OMDB:62,OTHH:13,OERK:2049,LLBG:135,
 RJTT:35,RJAA:141,RKSI:23,ZBAA:116,ZSPD:13,VHHH:28,RCTP:108,WSSS:22,VTBS:5,WMKK:69,VIDP:777,VABB:39,RPLL:75,WIII:34,
 YSSY:21,YMML:434,NZAA:23,
 CYYZ:569,CYVR:14,CYUL:118,
 MMMX:7316,SBGR:2461,SAEZ:67,SCEL:1555,SKBO:8361,SPJC:113,
 FAOR:5558,HECA:382,DNMM:135,HAAB:7625,
 SLLP:13325,ZULS:14472,VQPR:7333,SPZO:10860,VNKT:4390,VNLK:9334,
 KSDL:1510,KTUS:2643,KABQ:5355,KBOI:2871,KRNO:4415,KGEG:2376,KBZN:4473,KCOS:6187,KGJT:4858,KSUN:5318,KTVL:6264,KMMH:7135,KBIH:4124,KPRC:5045,
 KSAT:809,KMSY:4,KBNA:599,KSTL:618,KMCI:1026,KCLE:791,KPIT:1203,KCVG:896,KIND:797,KCMH:815,KMKE:723,KSAV:51,KJAX:30,KTPA:26,KPBI:19,KRDU:435,KMEM:341,KOKC:1295,KTUL:677,KOMA:984,KONT:944,KSNA:56,KLGB:60,KVNY:802,KPAO:4,
 PANC:152,PAFA:434,PAJN:21,PHNL:13,PHOG:54,PHTO:38,PHKO:47,
 CYYC:3557,CYEG:2373,CYWG:783,CYOW:374,CYHZ:477,CYQB:244,
 MMUN:22,MMGL:5016,MMMY:1278,SEQM:7841,SKCL:3162,SLVR:1224,SABE:18,SUMU:105,SBGL:28,SBBR:3497,SBSP:2631,SCFA:455,
 EGCC:257,EGPH:135,EGGD:622,EGLC:19,EIDW:242,EINN:46,LFML:74,LFLL:821,LFMN:13,LEMG:53,LEPA:27,GCLP:78,GCTS:209,LGAV:308,LHBP:495,LKPR:1247,EPWA:362,UUEE:622,LTAI:177,LIPZ:7,LIML:353,EBBR:184,ELLX:1234,LSGG:1411,LSZS:5600,LOWI:1907,LFLJ:6588,ENGM:681,ENBR:170,EFHK:179,BIKF:171,BIRK:48,LPMA:192,LCLK:8,LMML:300,LXGB:15,
 OMAA:88,OEJN:48,OKBK:206,OBBI:6,OIIE:3305,HKJK:5330,FACT:151,HEGN:60,
 ZGGG:50,ZGSZ:13,ZUUU:1626,ZSSS:10,ZPPP:6903,VOMM:52,VOBL:3002,VOHS:2024,VECC:20,VTBD:9,VTSP:82,VVNB:39,VVTS:33,WADD:14,RPLC:484,RJBB:26,RJOO:50,RJCC:82,RKPC:119,
 NZQN:1171,NZWN:41,NZCH:123,YBBN:13,YPPH:67,YPAD:20,YBCG:21,NFFN:59,NTAA:5,
 TNCM:13,MDPC:47,TJSJ:9,MKJP:10,MWCR:8,TBPB:169,TFFJ:49,TNCS:60
};
const COORDS={ L06:[36.4636,-116.8811], VNLK:[27.6861,86.7297], ZULS:[29.3231,100.0533] };
function fetchT(url,ms){ const c=new AbortController(); const t=setTimeout(()=>c.abort(),ms); return fetch(url,{cache:'no-store',signal:c.signal}).finally(()=>clearTimeout(t)); }

const HOSTED=(location.protocol==='http:'||location.protocol==='https:');
function wxURL(src,ids){ return HOSTED ? '/api/wx?src='+src+'&ids='+encodeURIComponent(ids)
  : 'https://aviationweather.gov/api/data/'+src+'?ids='+encodeURIComponent(ids)+'&format=json'; }
async function lookupICAO(){
  const raw=$('icao').value.trim().toUpperCase();
  const st=$('icaoStatus');
  if(!raw){ st.className='icao-status'; st.textContent=''; return; }
  st.className='icao-status loading'; st.innerHTML='<span class="spin"></span>Looking up '+raw+' — fetching live elevation, temperature &amp; altimeter…';
  let elevFt=null, tempC=null, altInHg=null, name=null, lat=null, lon=null;

  try{
    const r=await fetchT(wxURL('metar',raw),5000);
    if(r.ok){ const d=await r.json(); if(d && d[0]){
      if(d[0].name) name=d[0].name.trim();
      if(d[0].elev!=null) elevFt=d[0].elev*FT_PER_M;
      if(d[0].temp!=null) tempC=d[0].temp;
      if(d[0].altim!=null) altInHg=d[0].altim*0.0295300;
      if(d[0].lat!=null){ lat=d[0].lat; lon=d[0].lon; }
    }}
  }catch(e){}

  if(elevFt==null || lat==null){
    try{
      const r=await fetchT(wxURL('airport',raw),5000);
      if(r.ok){ const d=await r.json(); if(d && d[0]){
        if(elevFt==null && d[0].elev!=null) elevFt=d[0].elev*FT_PER_M;
        if(!name && d[0].name) name=d[0].name.trim();
        if(lat==null && d[0].lat!=null){ lat=d[0].lat; lon=d[0].lon; }
      } }
    }catch(e){}
  }

  if(elevFt==null && AIRPORTS[raw]!=null) elevFt=AIRPORTS[raw];
  if(lat==null && COORDS[raw]){ lat=COORDS[raw][0]; lon=COORDS[raw][1]; }

  if((tempC==null || altInHg==null) && lat!=null && lon!=null){
    try{
      const r=await fetchT('https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,pressure_msl',6000);
      const d=r.ok?await r.json():null, cur=d&&d.current;
      if(cur){
        if(tempC==null && cur.temperature_2m!=null) tempC=cur.temperature_2m;
        if(altInHg==null && cur.pressure_msl!=null) altInHg=cur.pressure_msl*0.0295300;
      }
    }catch(e){}
  }

  const got=[], missing=[];
  if(elevFt!=null){ $('elev').value=fmt(elevFt); got.push('elevation '+Math.round(elevFt).toLocaleString('en-US')+' ft'); } else missing.push('elevation');
  if(tempC!=null){ $('oat').value=Math.round(tempC); got.push('temp '+Math.round(tempC)+'°C'); } else missing.push('temp');
  if(altInHg!=null){ $('altim').value=altInHg.toFixed(2); got.push('altimeter '+altInHg.toFixed(2)+'"'); } else missing.push('altimeter');
  calcDA();

  if(!got.length){
    st.className='icao-status err';
    st.textContent='Couldn’t reach live data for '+raw+'. '+(HOSTED?'The station may be unlisted or the weather service is momentarily down.':'Live temp/altimeter needs the hosted site (it runs through a server-side proxy).')+' Listed airports still work offline for elevation — otherwise enter values manually.';
    return;
  }
  let msg='<strong>'+raw+'</strong>'+(name?' · '+name:'')+' — set '+got.join(', ')+'.';
  if(missing.length){
    const noElev=missing.includes('elevation');
    st.className='icao-status '+(noElev?'err':'info');
    msg+=' No live '+missing.join(' & ')+' published for this field — enter '+(missing.length>1?'them':'it')+' manually.';
  }
  else st.className='icao-status ok';
  st.innerHTML=msg;
}

function useMyLocation(){
  const st=$('icaoStatus');
  if(!navigator.geolocation){ st.className='icao-status err'; st.textContent='Geolocation isn’t available in this browser.'; return; }
  st.className='icao-status loading'; st.innerHTML='<span class="spin"></span>Getting your location…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat=pos.coords.latitude, lon=pos.coords.longitude, got=[], missing=[];
    try{
      const r=await fetchT('https://api.open-meteo.com/v1/elevation?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4),6000);
      const d=r.ok?await r.json():null, m=(d&&d.elevation&&d.elevation[0]!=null)?d.elevation[0]:null;
      if(m!=null){ const ft=Math.round(m*FT_PER_M); $('elev').value=fmt(ft); got.push('elevation '+ft.toLocaleString('en-US')+' ft'); } else missing.push('elevation');
    }catch(e){ missing.push('elevation'); }
    try{
      const r=await fetchT('https://api.open-meteo.com/v1/forecast?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&current=temperature_2m,pressure_msl',6000);
      const d=r.ok?await r.json():null, cur=d&&d.current;
      if(cur&&cur.temperature_2m!=null){ const c=cur.temperature_2m; $('oat').value=(tempUnit==='F')?Math.round(c*9/5+32):Math.round(c); got.push('temp '+Math.round(c)+'°C'); } else missing.push('temp');
      if(cur&&cur.pressure_msl!=null){ const inHg=cur.pressure_msl*0.0295300; $('altim').value=inHg.toFixed(2); got.push('altimeter '+inHg.toFixed(2)+'"'); } else missing.push('altimeter');
    }catch(e){ missing.push('temp'); missing.push('altimeter'); }
    calcDA();
    if(!got.length){ st.className='icao-status err'; st.textContent='Got your location, but couldn’t fetch its data — enter values manually.'; return; }
    let msg='Current conditions at your location ('+lat.toFixed(2)+', '+lon.toFixed(2)+') — set '+got.join(', ')+'.';
    if(missing.length){ st.className='icao-status err'; msg+=' Couldn’t get '+missing.join(' &amp; ')+' — set '+(missing.length>1?'those':'it')+' manually.'; }
    else st.className='icao-status ok';
    st.innerHTML=msg;
  }, err=>{
    st.className='icao-status err';
    st.textContent = (err && err.code===1) ? 'Location permission denied — type the values, or use the ICAO lookup.' : 'Couldn’t get your location (needs a secure HTTPS connection once hosted) — enter values manually.';
  }, {timeout:8000, maximumAge:600000});
}

function useMyAltitude(){
  const btn=$('geoExplore'); if(!btn) return;
  if(!navigator.geolocation){ btn.textContent='no geolocation'; setTimeout(()=>btn.textContent='📍 My elevation',2200); return; }
  const orig='📍 My elevation'; btn.textContent='locating…';
  navigator.geolocation.getCurrentPosition(async pos=>{
    try{
      const r=await fetchT('https://api.open-meteo.com/v1/elevation?latitude='+pos.coords.latitude.toFixed(4)+'&longitude='+pos.coords.longitude.toFixed(4),6000);
      const d=r.ok?await r.json():null, m=(d&&d.elevation&&d.elevation[0]!=null)?d.elevation[0]:null;
      if(m!=null){ update(Math.max(0,Math.round(m*FT_PER_M))); btn.textContent=orig; return; }
    }catch(e){}
    btn.textContent='unavailable'; setTimeout(()=>btn.textContent=orig,2200);
  }, ()=>{ btn.textContent='needs HTTPS / allow location'; setTimeout(()=>btn.textContent=orig,2600); }, {timeout:8000,maximumAge:600000});
}

function calcDA(){
  const elev=commaInt($('elev').value);
  let oat=parseFloat($('oat').value);
  if(tempUnit==='F' && !isNaN(oat)) oat=(oat-32)*5/9;
  const altim=parseFloat($('altim').value)||29.92;
  const pa=elev+(29.92-altim)*1000;
  const isaT=15-1.98*(pa/1000);
  const dev=(isNaN(oat)?isaT:oat)-isaT;
  const da=pa+120*dev;
  $('paOut').textContent=fmt(pa);
  $('isaDev').textContent=(dev>=0?'+':'')+Math.round(dev);
  $('daOut').textContent=fmt(da);
  const diff=da-elev;
  const toMult=1+Math.max(0,da)/1000*0.10;
  $('daNote').innerHTML=
    'Your aircraft will perform as if at <strong>'+fmt(da)+' ft</strong> — about <strong>'+fmt(diff)+' ft higher</strong> than the field. '
    +'Rule of thumb: takeoff/landing distance up ≈ <strong>'+Math.round((toMult-1)*100)+'%</strong>, and a normally-aspirated engine loses ≈ <strong>'+Math.round(Math.max(0,da)/1000*3)+'%</strong> of its power. Climb rate suffers most.';
  lastDA=da;
  const u=$('useDa'); if(u) u.textContent='↑ use the density altitude from above ('+fmt(da)+' ft)';
  drawDA(pa,isaT,(isNaN(oat)?isaT:oat),elev);
}
function drawDA(pa,isaT,oatC,elev){
  const w=daDim.w,h=daDim.h,padL=46,padR=14,padT=14,padB=26,tMin=-25,tMax=50;
  dac.clearRect(0,0,w,h);
  const daAt=t=>pa+120*(t-isaT);
  let yMin=Math.min(daAt(tMin),daAt(tMax)), yMax=Math.max(daAt(tMin),daAt(tMax));
  const padY=(yMax-yMin)*0.14||600; yMin-=padY; yMax+=padY;
  const X=t=>padL+((t-tMin)/(tMax-tMin))*(w-padL-padR);
  const Y=v=>h-padB-((v-yMin)/(yMax-yMin))*(h-padT-padB);
  dac.font='9px ui-monospace,Menlo,monospace';dac.textBaseline='alphabetic';
  dac.strokeStyle='rgba(255,255,255,.08)';dac.fillStyle='rgba(255,255,255,.5)';dac.lineWidth=1;
  const yStep=niceStep(yMax-yMin,4);
  for(let v=Math.ceil(yMin/yStep)*yStep; v<=yMax; v+=yStep){ const yy=Y(v); dac.beginPath();dac.moveTo(padL,yy);dac.lineTo(w-padR,yy);dac.stroke(); dac.fillText(fmt(v),4,yy+3); }
  for(let t=tMin;t<=tMax;t+=15){ dac.fillText(t+'°',X(t)-7,h-8); }
  dac.fillStyle='rgba(255,255,255,.55)';dac.fillText('OAT °C',w-46,h-8);
  if(elev>=yMin&&elev<=yMax){ const ey=Y(elev); dac.strokeStyle='rgba(124,200,255,.5)';dac.setLineDash([4,3]);dac.beginPath();dac.moveTo(padL,ey);dac.lineTo(w-padR,ey);dac.stroke();dac.setLineDash([]); dac.fillStyle='rgba(124,200,255,.8)';dac.fillText('field elev',padL+4,ey-4); }
  dac.strokeStyle='#ffb84d';dac.lineWidth=2.6;dac.beginPath();dac.moveTo(X(tMin),Y(daAt(tMin)));dac.lineTo(X(tMax),Y(daAt(tMax)));dac.stroke();
  const t=Math.max(tMin,Math.min(tMax,oatC)), da=daAt(t), mx=X(t), my=Y(da);
  dac.strokeStyle='rgba(255,255,255,.25)';dac.setLineDash([3,3]);dac.beginPath();dac.moveTo(mx,h-padB);dac.lineTo(mx,my);dac.lineTo(padL,my);dac.stroke();dac.setLineDash([]);
  dac.fillStyle='#ffb84d';dac.shadowColor='#ffb84d';dac.shadowBlur=10;dac.beginPath();dac.arc(mx,my,5,0,7);dac.fill();dac.shadowBlur=0;
  dac.font='700 11px ui-monospace,Menlo,monospace';dac.fillStyle='#ffd24d';
  const lbl=fmt(da)+' ft',tw=dac.measureText(lbl).width; dac.fillText(lbl,Math.min(mx+8,w-padR-tw),Math.max(padT+10,my-7));
}

const AIRCRAFT={
 c172:{n:'Cessna 172 (unpressurized)',dp:0},
 sr22:{n:'Cirrus SR22 (unpressurized)',dp:0},
 p210:{n:'Cessna P210 Centurion',dp:3.35},
 m350:{n:'Piper M350',dp:5.5},
 pc12:{n:'Pilatus PC-12',dp:5.75},
 tbm:{n:'Daher TBM 960',dp:6.2},
 cj4:{n:'Cessna Citation CJ4',dp:9.0},
 phenom:{n:'Embraer Phenom 300',dp:9.4},
 a320:{n:'Airbus A320',dp:8.3},
 b737:{n:'Boeing 737',dp:8.65},
 b787:{n:'Boeing 787 Dreamliner',dp:9.4},
 a350:{n:'Airbus A350',dp:9.25},
 g650:{n:'Gulfstream G650',dp:10.7},
 concorde:{n:'Concorde',dp:10.7},
 custom:{n:'Custom ΔP…',dp:null}
};
function initAircraft(){
  const sel=$('acft');
  for(const k in AIRCRAFT){ const o=document.createElement('option'); o.value=k; o.textContent=AIRCRAFT[k].n; sel.appendChild(o); }
  sel.value='b787';
}
function calcCabin(){
  const key=$('acft').value, ac=AIRCRAFT[key];
  const cruise=Math.max(0,Math.min(CABIN_MAX,parseFloat($('cruise').value)||0));
  let dp=ac.dp;
  if(key==='custom'){ $('customDpWrap').style.display=''; dp=Math.max(0,parseFloat($('customDp').value)||0); }
  else $('customDpWrap').style.display='none';
  const Pamb=isa(cruise/FT_PER_M).P;
  let cabinAlt, cabinMm;
  if(dp<=0){ cabinAlt=cruise; cabinMm=Pamb*MMHG_PER_PA; }
  else { const cabinP=Math.min(P0, Pamb+dp*6894.76); cabinAlt=Math.max(0,pressureToAltFt(cabinP)); cabinMm=cabinP*MMHG_PER_PA; }
  const pao2=Math.max(0, FIO2*(cabinMm-PH2O)-paCO2(cabinAlt)/RQ);
  const sat=spo2(pao2);
  $('cabinDp').textContent=dp.toFixed(2);
  $('cabinAlt').textContent=fmt(cabinAlt);
  const ce=$('cabinSpo2'); ce.textContent=Math.round(sat)+'%'; ce.style.color=satColor(sat);
  let note;
  if(dp<=0){
    note='This aircraft is <strong>unpressurized</strong> — the cabin <em>is</em> the outside air, so your body is physiologically at the full '+fmt(cruise)+' ft. '
      +(cruise>=15000?'Oxygen is mandatory and you have limited useful consciousness here.':cruise>=12500?'FAR 91.211 requires crew oxygen above 12,500 ft.':cruise>=10000?'Supplemental oxygen is recommended above 10,000 ft.':'Within the comfortable, no-oxygen range.');
  } else {
    note='At '+fmt(cruise)+' ft, a '+dp.toFixed(1)+' psi maximum differential holds the cabin near <strong>'+fmt(cabinAlt)+' ft</strong>. Passengers feel like they’re at '+fmt(cabinAlt)+' ft with about <strong>'+Math.round(sat)+'% blood oxygen</strong> — '
      +(cabinAlt>8000?'on the high side, which drives the fatigue and headaches of long flights.':'comfortable, in line with modern jets (the 787 & A350 target ~6,000 ft for exactly this reason).');
  }
  $('cabinNote').innerHTML=note;
  drawCabin(dp, cruise);
}
function drawCabin(dp, cruise){
  const w=cabinDim.w,h=cabinDim.h,padL=44,padR=14,padT=16,padB=30;
  cbc.clearRect(0,0,w,h);
  const xMax=Math.min(CABIN_MAX, Math.max(45000, Math.ceil((cruise+3000)/5000)*5000)); cabinXMax=xMax;
  const X=a=>padL+(a/xMax)*(w-padL-padR);
  const Y=a=>h-padB-(Math.max(0,a)/xMax)*(h-padT-padB);
  const cab=a=> dp<=0 ? a : Math.max(0, pressureToAltFt(Math.min(P0, isa(a/FT_PER_M).P + dp*6894.76)));
  cbc.font='9px ui-monospace,Menlo,monospace';cbc.textBaseline='alphabetic';
  cbc.strokeStyle='rgba(255,255,255,.08)';cbc.fillStyle='rgba(255,255,255,.5)';cbc.lineWidth=1;
  for(let v=0;v<=xMax;v+=10000){ const yy=Y(v); cbc.beginPath();cbc.moveTo(padL,yy);cbc.lineTo(w-padR,yy);cbc.stroke(); cbc.fillText((v/1000)+'k',6,yy+3); cbc.fillText((v/1000)+'k',X(v)-6,h-8); }
  cbc.fillStyle='rgba(255,255,255,.55)';cbc.fillText('aircraft altitude (ft)',w-130,h-8);
  const pts=[], step=xMax/160; for(let a=0;a<=xMax+1;a+=step) pts.push([a,cab(a)]);

  cbc.fillStyle='rgba(78,161,255,.10)';cbc.beginPath();cbc.moveTo(X(0),Y(0));
  for(const p of pts) cbc.lineTo(X(p[0]),Y(p[0]));
  for(let i=pts.length-1;i>=0;i--) cbc.lineTo(X(pts[i][0]),Y(pts[i][1]));
  cbc.closePath();cbc.fill();

  cbc.strokeStyle='rgba(255,120,90,.65)';cbc.lineWidth=1.5;cbc.setLineDash([5,4]);
  cbc.beginPath();cbc.moveTo(X(0),Y(0));cbc.lineTo(X(xMax),Y(xMax));cbc.stroke();cbc.setLineDash([]);

  cbc.strokeStyle='rgba(255,210,77,.5)';cbc.setLineDash([2,3]);cbc.beginPath();cbc.moveTo(padL,Y(8000));cbc.lineTo(w-padR,Y(8000));cbc.stroke();cbc.setLineDash([]);
  cbc.fillStyle='rgba(255,210,77,.85)';cbc.fillText('8,000 ft cabin',padL+4,Y(8000)-4);

  cbc.strokeStyle='#7cf';cbc.lineWidth=2.6;cbc.beginPath();
  pts.forEach((p,i)=>{const xx=X(p[0]),yy=Y(p[1]);i?cbc.lineTo(xx,yy):cbc.moveTo(xx,yy);});cbc.stroke();

  const cc2=cab(cruise),mx=X(cruise);
  cbc.strokeStyle='rgba(124,200,255,.45)';cbc.setLineDash([4,3]);cbc.lineWidth=1.2;
  cbc.beginPath();cbc.moveTo(mx,padT);cbc.lineTo(mx,h-padB);cbc.stroke();cbc.setLineDash([]);
  cbc.strokeStyle='rgba(255,255,255,.35)';cbc.setLineDash([3,3]);cbc.beginPath();cbc.moveTo(mx,Y(cruise));cbc.lineTo(mx,Y(cc2));cbc.stroke();cbc.setLineDash([]);
  cbc.fillStyle='rgba(255,160,130,.95)';cbc.beginPath();cbc.arc(mx,Y(cruise),4,0,7);cbc.fill();
  cbc.fillStyle='#37d67a';cbc.shadowColor='#37d67a';cbc.shadowBlur=12;cbc.beginPath();cbc.arc(mx,Y(cc2),6.5,0,7);cbc.fill();cbc.shadowBlur=0;
  cbc.strokeStyle='rgba(255,255,255,.9)';cbc.lineWidth=1.5;cbc.beginPath();cbc.arc(mx,Y(cc2),6.5,0,7);cbc.stroke();
  cbc.font='700 11px ui-monospace,Menlo,monospace';
  const aLbl=fmt(cruise)+' ft',aTw=cbc.measureText(aLbl).width;
  cbc.fillStyle='#ffb09a';cbc.fillText(aLbl,Math.min(mx+8,w-padR-aTw),Math.max(padT+9,Y(cruise)-7));
  const cLbl=fmt(cc2)+' ft cabin',cTw=cbc.measureText(cLbl).width;
  cbc.fillStyle='#37d67a';cbc.fillText(cLbl,Math.min(mx+10,w-padR-cTw),Math.min(h-padB-4,Y(cc2)+19));
}

const AIRCRAFT_HP={
 c152:{n:'Cessna 152',hp:110},
 c172e:{n:'Cessna 172E–H (145 hp)',hp:145},
 c172m:{n:'Cessna 172I–M (150 hp)',hp:150},
 c172n:{n:'Cessna 172N',hp:160},
 c172s:{n:'Cessna 172S Skyhawk',hp:180},
 c182:{n:'Cessna 182 Skylane',hp:230},
 t182t:{n:'Cessna T182T (turbo)',hp:235,turbo:true,crit:20000},
 c206:{n:'Cessna 206 Stationair',hp:300},
 pa28w:{n:'Piper PA-28 Warrior',hp:160},
 pa28a:{n:'Piper PA-28 Archer',hp:180},
 arrow:{n:'Piper Arrow',hp:200},
 sr20:{n:'Cirrus SR20',hp:215},
 sr22:{n:'Cirrus SR22',hp:310},
 sr22t:{n:'Cirrus SR22T (turbo)',hp:315,turbo:true,crit:25000},
 a36:{n:'Beechcraft Bonanza A36',hp:300},
 m20j:{n:'Mooney M20J',hp:200},
 m20k:{n:'Mooney M20K 231 (turbo)',hp:210,turbo:true,crit:20000},
 da40:{n:'Diamond DA40',hp:180},
 tiger:{n:'Grumman Tiger',hp:180},
 custom:{n:'Custom…',hp:null}
};
function densityRatioAtFt(ft){ return isa(ft/FT_PER_M).rho/RHO0; }
function gagg(sigma){ return Math.max(0, Math.min(1, 1.132*sigma - 0.132)); }
function powerFrac(daFt, turbo, critFt){
  if(turbo){
    if(daFt<=critFt) return 1;
    const base=gagg(densityRatioAtFt(critFt));
    return base>0 ? Math.max(0,Math.min(1, gagg(densityRatioAtFt(daFt))/base)) : 0;
  }
  return gagg(densityRatioAtFt(daFt));
}
function initHP(){
  const s=$('hpAcft');
  for(const k in AIRCRAFT_HP){ const o=document.createElement('option'); o.value=k; o.textContent=AIRCRAFT_HP[k].n; s.appendChild(o); }
  s.value='c172s';
}
function calcHP(){
  const key=$('hpAcft').value, a=AIRCRAFT_HP[key];
  let rated=a.hp, turbo=!!a.turbo, crit=a.crit||0;
  if(key==='custom'){ $('hpCustomWrap').style.display=''; rated=Math.max(0,parseFloat($('hpCustom').value)||0); turbo=false; }
  else $('hpCustomWrap').style.display='none';
  const da=Math.max(0,commaInt($('hpDa').value));
  const frac=powerFrac(da, turbo, crit);
  const avail=rated*frac, lost=rated-avail;
  $('hpRated').textContent=Math.round(rated);
  $('hpPct').textContent=Math.round(frac*100)+'%';
  const ae=$('hpAvail'); ae.textContent=Math.round(avail);
  const hpCol = frac>=0.85?'#37d67a':frac>=0.70?'#ffd24d':frac>=0.55?'#ffb84d':'#ff6a45';
  ae.style.color=hpCol; ae.parentElement.style.color=hpCol;
  let note;
  if(turbo && da<=crit){
    note='Turbocharged — the engine holds its full <strong>'+Math.round(rated)+' hp</strong> up to its critical altitude (~'+fmt(crit)+' ft density altitude). At '+fmt(da)+' ft you’re below that, so no power loss yet.';
  } else {
    note='At <strong>'+fmt(da)+' ft</strong> density altitude you have about <strong>'+Math.round(avail)+' hp</strong> — '+Math.round(frac*100)+'% of rated, down <strong>'+Math.round(lost)+' hp</strong>. '
      +(turbo?'You’re above the turbo’s critical altitude, so power now falls with air density.':'Normally-aspirated power falls roughly with air density (Gagg–Ferrar).')
      +' Less power means a longer takeoff roll and a sharply reduced climb rate — the figure pilots feel first.';
  }
  $('hpNote').innerHTML=note;
  drawHP(turbo,crit,da);
}
function drawHP(turbo,crit,curDa){
  const w=hpDim.w,h=hpDim.h,padL=42,padR=14,padT=14,padB=28,daMax=30000;
  hpc.clearRect(0,0,w,h);
  const X=da=>padL+(da/daMax)*(w-padL-padR);
  const Y=p=>h-padB-(p/100)*(h-padT-padB);
  hpc.font='9px ui-monospace,Menlo,monospace';hpc.textBaseline='alphabetic';
  hpc.strokeStyle='rgba(255,255,255,.08)';hpc.fillStyle='rgba(255,255,255,.5)';hpc.lineWidth=1;
  for(let p=0;p<=100;p+=25){const yy=Y(p);hpc.beginPath();hpc.moveTo(padL,yy);hpc.lineTo(w-padR,yy);hpc.stroke();hpc.fillText(p+'%',6,yy+3);}
  for(let da=0;da<=daMax;da+=5000){hpc.fillText((da/1000)+'k',X(da)-6,h-8);}
  hpc.fillStyle='rgba(255,255,255,.55)';hpc.fillText('density altitude (ft)',w-128,h-8);
  hpc.strokeStyle='#7cf';hpc.lineWidth=2.6;hpc.beginPath();
  for(let da=0;da<=daMax;da+=200){const p=powerFrac(da,turbo,crit)*100,xx=X(da),yy=Y(p);da?hpc.lineTo(xx,yy):hpc.moveTo(xx,yy);}
  hpc.stroke();
  if(turbo&&crit<daMax){const xx=X(crit);hpc.strokeStyle='rgba(255,184,77,.7)';hpc.setLineDash([3,3]);hpc.beginPath();hpc.moveTo(xx,padT);hpc.lineTo(xx,h-padB);hpc.stroke();hpc.setLineDash([]);hpc.fillStyle='rgba(255,184,77,.9)';hpc.fillText('critical alt',xx-8,padT+9);}
  const cda=Math.max(0,Math.min(daMax,curDa)),pp=powerFrac(cda,turbo,crit)*100,mx=X(cda),my=Y(pp);
  hpc.strokeStyle='rgba(255,255,255,.25)';hpc.setLineDash([3,3]);hpc.beginPath();hpc.moveTo(mx,h-padB);hpc.lineTo(mx,my);hpc.stroke();hpc.setLineDash([]);
  hpc.fillStyle='#37d67a';hpc.shadowColor='#37d67a';hpc.shadowBlur=10;hpc.beginPath();hpc.arc(mx,my,5,0,7);hpc.fill();hpc.shadowBlur=0;
}

const AIRCRAFT_PC={
 c152:{n:'Cessna 152', W:1670, S:160, b:33.4, cd0:0.035, e:0.75, hp:110, vs:43, va:104, vno:111, vne:149},
 c172:{n:'Cessna 172', W:2450, S:174, b:36.0, cd0:0.033, e:0.75, hp:180, vs:48, va:99, vno:129, vne:163},
 pa28:{n:'Piper PA-28 Archer', W:2550, S:170, b:35.0, cd0:0.035, e:0.74, hp:180, vs:50, va:113, vno:125, vne:154},
 da40:{n:'Diamond DA40', W:2646, S:145, b:39.2, cd0:0.026, e:0.78, hp:180, vs:49, va:108, vno:129, vne:178},
 sr22:{n:'Cirrus SR22', W:3400, S:145, b:38.3, cd0:0.027, e:0.77, hp:310, vs:60, va:133, vno:165, vne:200},
 custom:{n:'Custom…', W:2400, S:170, b:36, cd0:0.033, e:0.75, hp:180, vs:48, va:100, vno:125, vne:160}
};
const LB_N=4.44822, FT2_M2=0.092903, MS_KT=1.94384, HP_W=745.7, N_LBF=0.224809, ETAP=0.80;
let pcView='power', pcVminKt=40, pcVmaxKt=180;

function pcParams(){
  const key=$('pcAcft').value, a=Object.assign({},AIRCRAFT_PC[key]);
  if(key==='custom'){ $('pcCustomWrap').style.display='';
    a.W=Math.max(1,parseFloat($('pcW').value)||2400);
    a.S=Math.max(1,parseFloat($('pcS').value)||170);
    a.b=Math.max(1,parseFloat($('pcB').value)||36);
    a.cd0=Math.max(0.005,parseFloat($('pcCd0').value)||0.033);
    a.e=Math.max(0.4,Math.min(1,parseFloat($('pcE').value)||0.75));
  } else $('pcCustomWrap').style.display='none';
  a.Wn=a.W*LB_N; a.Sm=a.S*FT2_M2; a.AR=a.b*a.b/a.S; a.k=1/(Math.PI*a.AR*a.e);
  return a;
}
function pcPerf(a,V,rho){ const q=0.5*rho*V*V, CL=a.Wn/(q*a.Sm);
  const Dp=q*a.Sm*a.cd0; let Di=q*a.Sm*a.k*CL*CL;
  const Vs=a.vs/MS_KT; if(V<Vs){ const x=(Vs-V)/Vs; Di*=1+6*x*x; }
  const D=Dp+Di;
  return {Dp,Di,D,Pp:Dp*V,Pi:Di*V,Pr:D*V,CL}; }
function pcSpeeds(a,rho){
  const Vmd=Math.sqrt(2*a.Wn/(rho*a.Sm*Math.sqrt(a.cd0/a.k)));
  const Vmp=Math.sqrt(2*a.Wn/(rho*a.Sm*Math.sqrt(3*a.cd0/a.k)));
  return {Vmd,Vmp}; }

function drawPC(a,rho){
  const w=pcDim.w,h=pcDim.h,padL=52,padR=14,padT=34,padB=32;
  pcc.clearRect(0,0,w,h);
  const {Vmd,Vmp}=pcSpeeds(a,rho);
  const power=pcView==='power';
  const xMinKt=Math.max(10, a.vs*0.22), xMaxKt=a.vne*1.03;
  const VminMs=xMinKt/MS_KT, VmaxMs=xMaxKt/MS_KT;
  const conv=v=>power?v.Pr/HP_W:v.D*N_LBF, convI=v=>power?v.Pi/HP_W:v.Di*N_LBF, convP=v=>power?v.Pp/HP_W:v.Dp*N_LBF;
  const PaHp=Math.max(0,parseFloat($('pcHp').value)||0)*ETAP;

  const minVal=power?pcPerf(a,Vmp,rho).Pr/HP_W:pcPerf(a,Vmd,rho).D*N_LBF;
  const yMax=power?Math.max(3.5*minVal,1.25*PaHp,1.6*minVal):3.0*minVal;
  const N=140, pts=[];
  for(let i=0;i<=N;i++){ const V=VminMs+(VmaxMs-VminMs)*i/N, p=pcPerf(a,V,rho);
    pts.push({x:V*MS_KT,t:conv(p),i:convI(p),p:convP(p)}); }
  const X=kt=>padL+((kt-xMinKt)/(xMaxKt-xMinKt))*(w-padL-padR);
  const Y=y=>h-padB-(y/yMax)*(h-padT-padB);

  pcc.fillStyle='rgba(120,130,150,.12)'; pcc.fillRect(X(xMinKt),padT,Math.max(0,X(a.vs)-X(xMinKt)),h-padT-padB);
  if(power){ pcc.fillStyle='rgba(255,106,69,.13)'; pcc.fillRect(X(a.vs),padT,Math.max(0,X(Vmp*MS_KT)-X(a.vs)),h-padT-padB); }
  pcc.font='9px ui-monospace,Menlo,monospace'; pcc.textBaseline='alphabetic';
  pcc.strokeStyle='rgba(255,255,255,.08)'; pcc.fillStyle='rgba(255,255,255,.5)'; pcc.lineWidth=1;
  const yUnit=power?'hp':'lbf', yStep=niceStep(yMax,5);
  for(let y=0;y<=yMax;y+=yStep){ const yy=Y(y); pcc.beginPath();pcc.moveTo(padL,yy);pcc.lineTo(w-padR,yy);pcc.stroke(); pcc.fillText(Math.round(y),6,yy+3); }
  const xStep=niceStep(xMaxKt,7);
  for(let kt=Math.ceil(xMinKt/xStep)*xStep;kt<=xMaxKt;kt+=xStep){ pcc.fillText(Math.round(kt),X(kt)-7,h-8); }
  pcc.fillStyle='rgba(255,255,255,.55)'; pcc.fillText('kt TAS',w-44,h-8); pcc.save();
  pcc.translate(11,padT+34);pcc.rotate(-Math.PI/2);pcc.fillText(yUnit,0,0);pcc.restore();

  const line=(key,color,width,dash)=>{ pcc.save();pcc.beginPath();pcc.rect(padL,padT-4,w-padL-padR,h-padT-padB+6);pcc.clip();
    pcc.strokeStyle=color;pcc.lineWidth=width;pcc.setLineDash(dash?[4,3]:[]);pcc.beginPath();
    pts.forEach((o,idx)=>{const xx=X(o.x),yy=Y(o[key]); idx?pcc.lineTo(xx,yy):pcc.moveTo(xx,yy);}); pcc.stroke();pcc.setLineDash([]);pcc.restore(); };
  line('p','rgba(124,200,255,.5)',1.5,true);
  line('i','rgba(185,163,255,.7)',1.5,true);
  line('t','#7cf',2.6,false);
  if(power && PaHp>0 && PaHp<yMax){ const yy=Y(PaHp); pcc.strokeStyle='rgba(55,214,122,.85)';pcc.lineWidth=1.5;pcc.setLineDash([6,4]);
      pcc.beginPath();pcc.moveTo(padL,yy);pcc.lineTo(w-padR,yy);pcc.stroke();pcc.setLineDash([]);
      pcc.fillStyle='rgba(55,214,122,.9)';pcc.fillText('power available',w-padR-96,yy-4); }

  if(power && PaHp>0){ let vmaxKt=null; for(const o of pts){ if(o.t<=PaHp) vmaxKt=o.x; }
    if(vmaxKt!=null && vmaxKt<xMaxKt*0.995){ const xx=X(vmaxKt),yy=Y(PaHp);
      pcc.fillStyle='#37d67a';pcc.shadowColor='#37d67a';pcc.shadowBlur=8;pcc.beginPath();pcc.arc(xx,yy,4.5,0,7);pcc.fill();pcc.shadowBlur=0;
      pcc.font='700 11px ui-monospace,Menlo,monospace';pcc.fillStyle='rgba(55,214,122,.95)';
      const lbl='max level ≈ '+Math.round(vmaxKt)+' kt',tw=pcc.measureText(lbl).width; pcc.fillText(lbl,Math.min(xx+7,w-tw-4),yy+15); } }
  pcc.fillStyle='rgba(6,9,16,.28)'; pcc.fillRect(X(xMinKt),padT,Math.max(0,X(a.vs)-X(xMinKt)),h-padT-padB);
  pcc.fillStyle='rgba(255,255,255,.5)'; pcc.font='italic 9px ui-monospace,Menlo,monospace'; pcc.fillText('stalled — hypothetical', X(xMinKt)+4, h-padB-6);
  pcc.font='700 12px ui-monospace,Menlo,monospace';
  const vline=(kt,color,label,row)=>{ if(kt<xMinKt||kt>xMaxKt)return; const xx=X(kt); pcc.strokeStyle=color;pcc.setLineDash([2,3]);pcc.lineWidth=1;
    pcc.beginPath();pcc.moveTo(xx,padT);pcc.lineTo(xx,h-padB);pcc.stroke();pcc.setLineDash([]);
    if(label){ pcc.fillStyle=color; const tw=pcc.measureText(label).width; pcc.fillText(label, Math.min(Math.max(xx-tw/2,2), w-tw-2), row===0?14:29); } };
  vline(a.vs,'rgba(255,99,99,.95)','Vs',0);
  if(power) vline(Vmp*MS_KT,'rgba(255,184,77,.95)','',1);
  vline(Vmd*MS_KT,'rgba(55,214,122,.9)','L/Dmax',0);
  vline(a.va,'rgba(124,200,255,.9)','Va',1);
  vline(a.vno,'rgba(255,210,77,.9)','Vno',0);
  vline(a.vne,'rgba(255,99,99,.95)','Vne',1);
  const vkt=Math.max(xMinKt,Math.min(xMaxKt,+$('pcSlider').value)), pp=pcPerf(a,vkt/MS_KT,rho);
  const mx=X(vkt),my=Math.max(padT+2,Math.min(h-padB,Y(conv(pp))));
  pcc.strokeStyle='rgba(255,255,255,.25)';pcc.setLineDash([3,3]);pcc.beginPath();pcc.moveTo(mx,h-padB);pcc.lineTo(mx,my);pcc.stroke();pcc.setLineDash([]);
  pcc.fillStyle=vkt<Vmp*MS_KT?'#ff6a45':'#fff';pcc.shadowColor=pcc.fillStyle;pcc.shadowBlur=10;
  pcc.beginPath();pcc.arc(mx,my,5,0,7);pcc.fill();pcc.shadowBlur=0;
  pcVminKt=xMinKt; pcVmaxKt=xMaxKt;
}
function niceStep(max,target){ const raw=max/target,mag=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/mag;
  const s=n<1.5?1:n<3?2:n<7?5:10; return s*mag; }

function calcPC(){
  const a=pcParams(), da=parseFloat($('pcDa').value)||0, rho=isa(da/FT_PER_M).rho;
  const {Vmd,Vmp}=pcSpeeds(a,rho);
  const xMinKt=Math.max(10, a.vs*0.22);
  const sl=$('pcSlider'); sl.min=Math.round(xMinKt); sl.max=Math.round(a.vno);
  let vkt=parseFloat(sl.value); if(vkt<+sl.min)vkt=+sl.min; if(vkt>+sl.max)vkt=+sl.max; sl.value=vkt;
  $('pcV').textContent=Math.round(vkt);
  const V=vkt/MS_KT, p=pcPerf(a,V,rho), prHp=p.Pr/HP_W;
  const PaHp=Math.max(0,parseFloat($('pcHp').value)||0)*ETAP;
  const excessHp=PaHp-prHp;
  $('pcPr').textContent=Math.round(prHp);
  const re=$('pcExcess');
  if(vkt<a.vs){ re.textContent='—'; re.parentElement.style.color='var(--ink-dim)'; }
  else { re.textContent=(excessHp>=0?'+':'−')+Math.abs(Math.round(excessHp)); re.parentElement.style.color=excessHp>=0?'#37d67a':'#ff6a45'; }
  let note;
  if(vkt<a.vs){ note='<strong>Hypothetical.</strong> Stall speed is determined by the wing’s critical angle of attack, not by power. Theoretically, if enough thrust were available to "hang the plane on the prop" (not realistic in a trainer), you could sustain flight slower — but the wing stalls first.'; }
  else if(V<Vmp){ note='<strong>Region of reversed command (back side of the power curve).</strong> Flying at very slow speeds requires high angle of attack (AoA, or alpha), so it takes <em>more</em> power to fly <em>slower</em>, nose-high. Inside this region, altitude is controlled with <em>power</em> and airspeed with <em>pitch</em> — which is why being "behind the curve" sneaks up on you on short final.'; }
  else { note='Front side of the power curve. <b>L/Dmax ≈ '+Math.round(Vmd*MS_KT)+' kt</b> is best lift-to-drag (best glide &amp; max range); the <b>minimum-power speed ≈ '+Math.round(Vmp*MS_KT)+' kt</b> gives best endurance and is near best-rate-of-climb (Vy).'; }
  if(vkt>=a.vs){ note += excessHp>=0
    ? ' <b>Excess power ≈ '+Math.round(excessHp)+' hp</b> (the green line minus the curve) is the surplus over level-flight power — what climbs or accelerates the airplane. It’s largest near the min-power speed, which is why Vy sits there.'
    : ' Here power required exceeds power available, so at this setting you’d be <b>descending</b>, not holding altitude.'; }
  $('pcNote').innerHTML=note;
  drawPC(a,rho);
}
function initPC(){ const s=$('pcAcft'); for(const k in AIRCRAFT_PC){const o=document.createElement('option');o.value=k;o.textContent=AIRCRAFT_PC[k].n;s.appendChild(o);} s.value='c172'; }

function pcSyncPower(from){
  const a=pcParams(), da=parseFloat($('pcDa').value)||0, ratedAtAlt=a.hp*gagg(densityRatioAtFt(da));
  if(from==='hp'){ const hp=Math.max(0,parseFloat($('pcHp').value)||0);
    $('pcPow').value = ratedAtAlt>0 ? Math.round(Math.min(100, hp/ratedAtAlt*100)) : 0; }
  else { const pct=Math.max(0,Math.min(100,parseFloat($('pcPow').value)||0));
    $('pcHp').value = Math.round(ratedAtAlt*pct/100); }
}

function skyToAlt(clientY){
  const r=sky.getBoundingClientRect(); const pad=14*(sky.height/r.height);
  const yCanvas=(clientY-r.top)*(sky.height/r.height);
  const frac=1-(yCanvas-pad)/(sky.height-2*pad);
  return Math.max(0,Math.min(MAX_ALT,frac*MAX_ALT));
}

// ---- Koch chart: takeoff / climb derating from pressure altitude + temperature ----
// Density altitude via the standard NWS/Embree relation (matches kochchart.com).
// DA = 145426 * (1 - sigma^0.235), sigma = density ratio.
function kochSigma(paFt, tC){
  return Math.pow((288.16 - paFt*0.0019812)/288.16, 5.2563) / ((273.16 + tC)/288.16);
}
function kochDA(sigma){ return 145426*(1 - Math.pow(Math.max(1e-6,sigma), 0.235)); }
// Takeoff-distance multiplier ~ sigma^-4.0, calibrated to FAA Koch chart reference
// points (+230% at ~9,800 ft DA); conservative (over-estimates) at low DA.
function kochTOpct(sigma, cs){ return (Math.pow(Math.max(1e-6,sigma), -4.0) - 1)*100*(cs?0.867:1); }
// Climb-rate loss ~ 7.5%/1000 ft DA (fixed-pitch), 7.0% constant-speed; matches FAA chart.
function kochClimbLoss(daFt, cs){ return Math.min(95, Math.max(0, daFt/1000*(cs?7.0:7.5))); }

// Landing distance scales ~ 1/density-ratio (ground roll proportional to TAS^2,
// TAS proportional to 1/sqrt(sigma)) -> about +3.5% per 1,000 ft DA.
function kochLDpct(sigma){ return (1/Math.max(1e-6,sigma) - 1)*100; }
function kRoundRect(x,y,w,h,r){ r=Math.min(r,h/2,w/2); kc.beginPath();
  kc.moveTo(x+r,y); kc.arcTo(x+w,y,x+w,y+h,r); kc.arcTo(x+w,y+h,x,y+h,r);
  kc.arcTo(x,y+h,x,y,r); kc.arcTo(x,y,x+w,y,r); kc.closePath(); }
function kPlane(x,y,col){ kc.save(); kc.fillStyle=col; kc.shadowColor=col; kc.shadowBlur=8;
  kc.beginPath(); kc.moveTo(x+9,y); kc.lineTo(x-6,y-6); kc.lineTo(x-2,y); kc.lineTo(x-6,y+6);
  kc.closePath(); kc.fill(); kc.restore(); }

function calcKoch(){
  const pa=commaInt($('kPa').value);
  let oat=parseFloat($('kOat').value);
  if(kTempUnit==='F' && !isNaN(oat)) oat=(oat-32)*5/9;
  if(isNaN(oat)) oat=15-1.9812*(pa/1000);
  const cs=$('kProp').value==='cs';
  const sigma=kochSigma(pa,oat), da=kochDA(sigma);
  const toPct=kochTOpct(sigma,cs), ldPct=kochLDpct(sigma), climbLoss=kochClimbLoss(da,cs);
  const baseTo=Math.max(0,commaInt($('kTo').value)), baseLd=Math.max(0,commaInt($('kLd').value)), baseRoc=Math.max(0,commaInt($('kRoc').value));
  const daTo=baseTo*(1+toPct/100), daLd=baseLd*(1+ldPct/100);
  $('kDa').textContent=fmt(da);
  $('kToPct').textContent='+'+Math.round(toPct)+'%';
  $('kLdPct').textContent='+'+Math.round(ldPct)+'%';
  $('kRocPct').textContent='−'+Math.round(climbLoss)+'%';
  $('kToOut').textContent=fmt(daTo);
  $('kLdOut').textContent=fmt(daLd);
  $('kRocOut').textContent=fmt(baseRoc*(1-climbLoss/100));
  const toEl=$('kToPct'); toEl.style.color = toPct>=150?'#ff4d4d':toPct>=70?'#ff6a45':toPct>=30?'#ffb84d':'#37d67a';
  let note='At <strong>'+fmt(pa)+' ft</strong> pressure altitude and <strong>'+Math.round(oat)+'°C</strong>, density altitude is about <strong>'+fmt(da)+' ft</strong>. '
    +'Expect the <strong>takeoff roll about '+Math.round(toPct)+'% longer</strong> and the <strong>landing roll about '+Math.round(ldPct)+'% longer</strong> than a sea-level standard day, with climb rate down about <strong>'+Math.round(climbLoss)+'%</strong>. ';
  if(baseTo>0) note+='A '+fmt(baseTo)+' ft sea-level takeoff becomes roughly <strong>'+fmt(daTo)+' ft</strong>; a '+fmt(baseLd)+' ft landing becomes about <strong>'+fmt(daLd)+' ft</strong>. ';
  note+=(toPct>=100?'That is a serious high/hot penalty — verify against your POH and the runway available.':'Always confirm against your POH and runway available.');
  $('kNote').innerHTML=note;
  drawKoch(toPct,ldPct,baseTo,baseLd,daTo,daLd);
}
function drawKoch(toPct,ldPct,baseTo,baseLd,daTo,daLd){
  const w=kDim.w,h=kDim.h,padL=12,padR=14,padT=8,padB=20;
  kc.clearRect(0,0,w,h);
  const maxD=Math.max(daTo,daLd,baseTo,baseLd,1)*1.06;
  const plotW=w-padL-padR, X=d=>padL+(d/maxD)*plotW;
  const laneH=(h-padT-padB)/2;
  function lane(yTop,label,base,da,pct,col){
    const stripY=yTop+20, stripH=laneH-30, cy=stripY+stripH/2;
    kc.fillStyle='rgba(255,255,255,.05)'; kRoundRect(padL,stripY,plotW,stripH,6); kc.fill();
    kc.strokeStyle='rgba(255,255,255,.20)'; kc.lineWidth=2; kc.setLineDash([11,9]);
    kc.beginPath(); kc.moveTo(padL+8,cy); kc.lineTo(padL+plotW-8,cy); kc.stroke(); kc.setLineDash([]);
    const g=kc.createLinearGradient(padL,0,X(da),0);
    g.addColorStop(0,col+'cc'); g.addColorStop(1,col+'66');
    kc.fillStyle=g; kRoundRect(padL,stripY,Math.max(3,X(da)-padL),stripH,6); kc.fill();
    if(base>0){ const sx=X(base);
      kc.strokeStyle='rgba(255,255,255,.85)'; kc.lineWidth=1.5; kc.setLineDash([4,3]);
      kc.beginPath(); kc.moveTo(sx,stripY-3); kc.lineTo(sx,stripY+stripH+3); kc.stroke(); kc.setLineDash([]);
      kc.fillStyle='rgba(255,255,255,.85)'; kc.font='9px ui-monospace,monospace'; kc.textAlign='center';
      kc.fillText('sea level', sx, stripY+stripH+14); }
    kPlane(Math.min(X(da),w-padR-2), cy, col);
    kc.textAlign='left'; kc.fillStyle='#cdd6e6'; kc.font='700 11px ui-monospace,monospace';
    kc.fillText(label, padL+2, yTop+12);
    kc.fillStyle=col; kc.font='700 13px ui-monospace,monospace';
    kc.fillText(fmt(da)+' ft  (+'+Math.round(pct)+'%)', padL+72, yTop+12);
  }
  lane(padT, 'TAKEOFF', baseTo, daTo, toPct, '#ff6a45');
  lane(padT+laneH, 'LANDING', baseLd, daLd, ldPct, '#7cf');
  kc.textAlign='left';
}
function setupKoch(){
  kChart=$('kChart'); if(!kChart) return false;
  kc=kChart.getContext('2d'); kDim=fit(kChart,kc);
  ['kPa','kOat','kProp','kTo','kLd','kRoc'].forEach(id=>$(id).addEventListener('input',calcKoch));
  $('kOatUnit').addEventListener('click',()=>{ const inp=$('kOat'); const v=parseFloat(inp.value);
    if(kTempUnit==='C'){ kTempUnit='F'; if(!isNaN(v)) inp.value=Math.round(v*9/5+32); $('kOatUnit').textContent='°F'; }
    else { kTempUnit='C'; if(!isNaN(v)) inp.value=Math.round((v-32)*5/9); $('kOatUnit').textContent='°C'; }
    calcKoch(); });
  ['kPa','kTo','kLd'].forEach(id=>$(id).addEventListener('blur',()=>{ const v=$(id).value.trim(); if(v!=='') $(id).value=fmt(commaInt(v)); }));
  calcKoch();
  return true;
}

// ---- Crosswind calculator: headwind/tailwind + crosswind components ----
function calcCross(){
  const rwy=((parseFloat($('xRwy').value)||0)%360+360)%360;
  const wdir=((parseFloat($('xWdir').value)||0)%360+360)%360;
  const wspd=Math.max(0,parseFloat($('xWspd').value)||0);
  let ang=wdir-rwy; while(ang>180)ang-=360; while(ang<-180)ang+=360;
  const rad=ang*Math.PI/180;
  const head=wspd*Math.cos(rad), cross=wspd*Math.sin(rad);
  const he=$('xHead'); he.textContent=(head>=0?'+':'−')+Math.abs(Math.round(head));
  he.style.color = head>=0?'#37d67a':'#ff6a45';
  $('xCross').textContent=Math.abs(Math.round(cross))+' '+(Math.abs(Math.round(cross))===0?'':(cross>=0?'R':'L'));
  $('xAngle').textContent=Math.round(Math.abs(ang))+'°';
  let note='Wind '+Math.round(wdir).toString().padStart(3,'0')+'° at '+Math.round(wspd)+' kt, '+Math.round(Math.abs(ang))+'° off the nose. '
    +'<strong>'+Math.abs(Math.round(cross))+' kt crosswind from the '+(cross>=0?'right':'left')+'</strong>'
    +' and a <strong>'+Math.abs(Math.round(head))+' kt '+(head>=0?'headwind':'tailwind')+'</strong>. ';
  if(head<0) note+='Note the <strong>tailwind component</strong> — check your takeoff/landing distance and consider the reciprocal runway. ';
  else note+='Compare the crosswind against your aircraft’s demonstrated crosswind component and your personal limits.';
  $('xNote').innerHTML=note;
  drawCross(rwy,wdir,wspd,ang,head,cross);
}
function drawCross(rwy,wdir,wspd,ang,head,cross){
  const w=xDim.w,h=xDim.h; xc.clearRect(0,0,w,h);
  const cx=w/2, cy=h/2, R=Math.min(w,h)/2-26;
  xc.save(); xc.translate(cx,cy);
  xc.strokeStyle='rgba(255,255,255,.12)';xc.lineWidth=1;xc.beginPath();xc.arc(0,0,R,0,7);xc.stroke();
  const rwLen=R*1.45, rwW=26;
  xc.fillStyle='rgba(255,255,255,.08)';xc.strokeStyle='rgba(255,255,255,.45)';xc.lineWidth=2;
  xc.fillRect(-rwW/2,-rwLen/2,rwW,rwLen);xc.strokeRect(-rwW/2,-rwLen/2,rwW,rwLen);
  xc.strokeStyle='rgba(255,255,255,.6)';xc.setLineDash([7,9]);xc.lineWidth=1.5;
  xc.beginPath();xc.moveTo(0,-rwLen/2+10);xc.lineTo(0,rwLen/2-10);xc.stroke();xc.setLineDash([]);
  const num=Math.round(rwy/10)||36, recip=((num+18-1)%36)+1;
  xc.fillStyle='#cdd6e6';xc.font='700 14px ui-monospace,Menlo,monospace';xc.textAlign='center';
  xc.fillText((num<10?'0':'')+num, 0, rwLen/2-14);
  xc.fillText((recip<10?'0':'')+recip, 0, -rwLen/2+22);
  const a=ang*Math.PI/180, fx=Math.sin(a)*R, fy=-Math.cos(a)*R;
  xc.strokeStyle='#4ea1ff';xc.fillStyle='#4ea1ff';xc.lineWidth=3.5;
  xc.beginPath();xc.moveTo(fx,fy);xc.lineTo(fx*0.18,fy*0.18);xc.stroke();
  const ah=Math.atan2(fy*0.18-fy, fx*0.18-fx);
  xc.beginPath();xc.moveTo(fx*0.18,fy*0.18);
  xc.lineTo(fx*0.18-12*Math.cos(ah-0.4),fy*0.18-12*Math.sin(ah-0.4));
  xc.lineTo(fx*0.18-12*Math.cos(ah+0.4),fy*0.18-12*Math.sin(ah+0.4));
  xc.closePath();xc.fill();
  xc.fillStyle='#9fd0ff';xc.font='700 12px ui-monospace,Menlo,monospace';
  xc.fillText(Math.round(wspd)+' kt', fx*1.04, fy*1.04+4);
  const scale=R/Math.max(wspd,1)*0.72;
  xc.strokeStyle='#ff6a45';xc.lineWidth=3;xc.setLineDash([4,3]);
  xc.beginPath();xc.moveTo(0,0);xc.lineTo(cross*scale,0);xc.stroke();xc.setLineDash([]);
  xc.strokeStyle='#37d67a';
  xc.beginPath();xc.moveTo(0,0);xc.lineTo(0,-head*scale);xc.stroke();
  xc.restore();
  xc.fillStyle='#ff9d6b';xc.font='700 11px ui-monospace,Menlo,monospace';xc.textAlign='left';
  xc.fillText(Math.abs(Math.round(cross))+' kt xwind '+(cross>=0?'→':'←'), 10, h-12);
  xc.fillStyle='#37d67a';xc.textAlign='right';
  xc.fillText((head>=0?'headwind ':'tailwind ')+Math.abs(Math.round(head))+' kt', w-10, h-12);
}
function setupCross(){
  xChart=$('xChart'); if(!xChart) return false;
  xc=xChart.getContext('2d'); xDim=fit(xChart,xc);
  ['xRwy','xWdir','xWspd'].forEach(id=>$(id).addEventListener('input',calcCross));
  (function(){ let drag=false;
    const toDir=e=>{ const r=xChart.getBoundingClientRect(); const px=e.clientX-r.left-r.width/2, py=e.clientY-r.top-r.height/2;
      let deg=Math.atan2(px,-py)*180/Math.PI; const rwy=((parseFloat($('xRwy').value)||0)); let wd=rwy+deg; wd=((Math.round(wd)%360)+360)%360; return wd; };
    const set=e=>{ $('xWdir').value=Math.round(toDir(e)); calcCross(); };
    xChart.addEventListener('pointerdown',e=>{drag=true;xChart.setPointerCapture(e.pointerId);set(e);});
    xChart.addEventListener('pointermove',e=>{if(drag)set(e);});
    xChart.addEventListener('pointerup',()=>drag=false);
  })();
  calcCross();
  return true;
}

function setupExplorer(){
  sky=$('sky'); if(!sky) return false;
  air=$('air'); curve=$('curve');
  skc=sky.getContext('2d'); ac=air.getContext('2d'); cc=curve.getContext('2d');
  airDim=fit(air,ac); curveDim=fit(curve,cc); skyDim=fit(sky,skc);
  slider=$('slider');
  slider.addEventListener('input',e=>update(+e.target.value));
  document.querySelectorAll('.chip[data-alt]').forEach(c=>c.addEventListener('click',()=>update(+c.dataset.alt)));
  $('geoExplore').addEventListener('click',useMyAltitude);
  sky.addEventListener('pointerdown',e=>{dragging=true;sky.setPointerCapture(e.pointerId);update(skyToAlt(e.clientY));});
  sky.addEventListener('pointermove',e=>{if(dragging)update(skyToAlt(e.clientY));});
  sky.addEventListener('pointerup',()=>dragging=false);
  update(500);
  drawAir();
  return true;
}

function setupDA(){
  daChart=$('daChart'); if(!daChart) return false;
  dac=daChart.getContext('2d'); daDim=fit(daChart,dac);
  document.querySelectorAll('.apchip').forEach(c=>c.addEventListener('click',()=>{ $('icao').value=c.dataset.icao; lookupICAO(); }));
  ['elev','oat','altim'].forEach(id=>$(id).addEventListener('input',calcDA));
  (function(){ let drag=false;
    const toOAT=e=>{ const r=daChart.getBoundingClientRect(),padL=46,padR=14; let f=(e.clientX-r.left-padL)/(r.width-padL-padR); f=Math.max(0,Math.min(1,f)); return -25+f*75; };
    const set=e=>{ const tC=toOAT(e); $('oat').value=(tempUnit==='F')?Math.round(tC*9/5+32):Math.round(tC); calcDA(); };
    daChart.addEventListener('pointerdown',e=>{drag=true;daChart.setPointerCapture(e.pointerId);set(e);});
    daChart.addEventListener('pointermove',e=>{if(drag)set(e);});
    daChart.addEventListener('pointerup',()=>drag=false);
  })();
  $('icaoBtn').addEventListener('click',lookupICAO);
  $('geoBtn').addEventListener('click',useMyLocation);
  $('oatUnit').addEventListener('click',()=>{ const inp=$('oat'); const v=parseFloat(inp.value);
    if(tempUnit==='C'){ tempUnit='F'; if(!isNaN(v)) inp.value=Math.round(v*9/5+32); $('oatUnit').textContent='°F'; }
    else { tempUnit='C'; if(!isNaN(v)) inp.value=Math.round((v-32)*5/9); $('oatUnit').textContent='°C'; }
    calcDA(); });
  $('icao').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookupICAO();}});
  $('icao').addEventListener('blur',lookupICAO);
  $('elev').addEventListener('blur',()=>{ const v=$('elev').value.trim(); if(v!=='') $('elev').value=fmt(commaInt(v)); });
  calcDA();
  return true;
}

function setupCabin(){
  cabinChart=$('cabinChart'); if(!cabinChart) return false;
  cbc=cabinChart.getContext('2d'); cabinDim=fit(cabinChart,cbc);
  initAircraft();
  ['acft','cruise','customDp'].forEach(id=>$(id).addEventListener('input',calcCabin));
  (function(){ let drag=false;
    const toAlt=e=>{ const r=cabinChart.getBoundingClientRect(),padL=44,padR=14; let f=(e.clientX-r.left-padL)/(r.width-padL-padR); f=Math.max(0,Math.min(1,f)); return Math.round(f*cabinXMax/500)*500; };
    const set=e=>{ $('cruise').value=toAlt(e); calcCabin(); };
    cabinChart.addEventListener('pointerdown',e=>{drag=true;cabinChart.setPointerCapture(e.pointerId);set(e);});
    cabinChart.addEventListener('pointermove',e=>{if(drag)set(e);});
    cabinChart.addEventListener('pointerup',()=>drag=false);
  })();
  calcCabin();
  return true;
}

function setupHP(){
  hpChart=$('hpChart'); if(!hpChart) return false;
  hpc=hpChart.getContext('2d'); hpDim=fit(hpChart,hpc);
  initHP();
  ['hpAcft','hpDa','hpCustom'].forEach(id=>$(id).addEventListener('input',calcHP));
  (function(){ let drag=false;
    const toDa=e=>{ const r=hpChart.getBoundingClientRect(),padL=42,padR=14; let f=(e.clientX-r.left-padL)/(r.width-padL-padR); f=Math.max(0,Math.min(1,f)); return Math.round(f*30000/100)*100; };
    const set=e=>{ $('hpDa').value=fmt(toDa(e)); calcHP(); };
    hpChart.addEventListener('pointerdown',e=>{drag=true;hpChart.setPointerCapture(e.pointerId);set(e);});
    hpChart.addEventListener('pointermove',e=>{if(drag)set(e);});
    hpChart.addEventListener('pointerup',()=>drag=false);
  })();
  const ud=$('useDa'); if(ud) ud.addEventListener('click',()=>{ $('hpDa').value=fmt(lastDA); calcHP(); });
  $('hpDa').addEventListener('blur',()=>{ const v=$('hpDa').value.trim(); if(v!=='') $('hpDa').value=fmt(commaInt(v)); });
  calcHP();
  return true;
}

function setupPC(){
  pcChart=$('pcChart'); if(!pcChart) return false;
  pcc=pcChart.getContext('2d'); pcDim=fit(pcChart,pcc);
  initPC();
  pcSyncPower('pct');
  ['pcAcft','pcDa','pcW','pcS','pcB','pcCd0','pcE'].forEach(id=>$(id).addEventListener('input',()=>{ pcSyncPower('pct'); calcPC(); }));
  $('pcPow').addEventListener('input',()=>{ pcSyncPower('pct'); calcPC(); });
  $('pcHp').addEventListener('input',()=>{ pcSyncPower('hp'); calcPC(); });
  $('pcSlider').addEventListener('input',calcPC);
  const upd=$('usePcDa'); if(upd) upd.addEventListener('click',()=>{ $('pcDa').value=Math.round(lastDA); pcSyncPower('pct'); calcPC(); });
  (function(){ let drag=false;
    const toKt=e=>{ const r=pcChart.getBoundingClientRect(),padL=52,padR=14; let f=(e.clientX-r.left-padL)/(r.width-padL-padR); f=Math.max(0,Math.min(1,f)); return pcVminKt+f*(pcVmaxKt-pcVminKt); };
    const set=e=>{ const sl=$('pcSlider'); let kt=Math.round(toKt(e)); kt=Math.max(+sl.min,Math.min(+sl.max,kt)); sl.value=kt; calcPC(); };
    pcChart.addEventListener('pointerdown',e=>{drag=true;pcChart.setPointerCapture(e.pointerId);set(e);});
    pcChart.addEventListener('pointermove',e=>{if(drag)set(e);});
    pcChart.addEventListener('pointerup',()=>drag=false);
  })();
  calcPC();
  return true;
}

const hasExplorer=setupExplorer();
const hasDA=setupDA();
const hasCabin=setupCabin();
const hasHP=setupHP();
const hasPC=setupPC();
const hasKoch=setupKoch();
const hasCross=setupCross();

window.addEventListener('resize',()=>{
  if(hasExplorer){skyDim=fit(sky,skc);stars=null;airDim=fit(air,ac);curveDim=fit(curve,cc);parts=[];update(alt);}
  if(hasPC){pcDim=fit(pcChart,pcc);calcPC();}
  if(hasHP){hpDim=fit(hpChart,hpc);calcHP();}
  if(hasCabin){cabinDim=fit(cabinChart,cbc);calcCabin();}
  if(hasDA){daDim=fit(daChart,dac);calcDA();}
  if(hasKoch){kDim=fit(kChart,kc);calcKoch();}
  if(hasCross){xDim=fit(xChart,xc);calcCross();}
});

(function(){ const b=$('disclaimerBar'); if(!b)return; b.hidden=false;
  $('disclaimerOk').addEventListener('click',()=>{ b.hidden=true; }); })();
