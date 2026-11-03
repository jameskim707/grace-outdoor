// 중앙 분수광장 모듈 (인터페이스 v0.2)  ·  Three.js 는 host.THREE 로 받는다(직접 import 하지 않음)
// 로컬 원점 = 분수 중심. 단위 1 = 1m, y 위, 오른손 좌표. 배치 위치는 통합 담당이 host.offset 으로 정한다.
export const MODULE_INFO={id:'plaza',name:'중앙 분수광장',version:'0.1.0',interface:'0.2',threeTested:'0.186.1'};

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}}
const h2rgb=h=>{const a=parseInt(h.slice(1),16);return[a>>16,(a>>8)&255,a&255]};
const mixHex=(a,b,t)=>{const A=h2rgb(a),B=h2rgb(b);return'#'+A.map((v,i)=>Math.round(lerp(v,B[i],t)).toString(16).padStart(2,'0')).join('')};

// ── 낮·밤 환경값 (통합 담당이 하늘·전역 조명에 그대로 써도 되고, 자기 값을 써도 된다)
//  t01: 0=자정, 0.25=해뜸, 0.5=정오, 0.75=해짐
export function envFor(t01){
  const e=-Math.cos(t01*TAU);                 // -1(자정) ~ 1(정오)
  const day=smooth(-0.12,0.3,e),night=1-day,amb=smooth(-0.45,0.25,e);   // amb: 해가 져도 주변광은 천천히 줄어든다
  const KEYS=[[-1,'#0a142e'],[-0.25,'#1e2550'],[0,'#e8a56f'],[0.28,'#b9d8ee'],[1,'#cfe7f7']];
  let sky=KEYS[KEYS.length-1][1];
  for(let i=0;i<KEYS.length-1;i++){const[a,ca]=KEYS[i],[b,cb]=KEYS[i+1];if(e<=b){sky=mixHex(ca,cb,smooth(a,b,e));break}}
  const warm=clamp(1-Math.abs(e)/0.32,0,1);
  return{t01,e,day,night,sky,fog:sky,
    hemi:{sky:mixHex('#3b5b9c','#e4f1ff',amb),ground:mixHex('#1c1e2a','#b3b09f',amb),intensity:lerp(.8,1.1,amb)},
    sun:{color:mixHex(mixHex('#9fb8ec','#fff2d8',day),'#ffb178',warm*.8),intensity:lerp(.38,1.0,day)+warm*.3,dir:[Math.sin(t01*TAU)*.7,Math.max(.12,e),.45]},
    lamps:smooth(0.2,-0.12,e)};
}

// ── 평면 충돌 판정 도우미 (교회의 blocked(x,z)와 같은 방식: 높이는 무시)
export function collides(shapes,x,z,r=0.3){
  for(const s of shapes){
    if(s.type==='circle'){if(Math.hypot(x-s.x,z-s.z)<s.r+r)return true}
    else if(s.type==='rect'){const dx=x-s.x,dz=z-s.z,c=Math.cos(s.rot||0),n=Math.sin(s.rot||0),xl=dx*c-dz*n,zl=dx*n+dz*c;if(Math.abs(xl)<s.w/2+r&&Math.abs(zl)<s.d/2+r)return true}
  }return false}


// 같은 재질을 쓰는 조각들을 하나로 합쳐서 그리기 호출을 줄인다 (position·normal·uv)
function mergeGeos(T,list){const gs=list.map(g=>g.index?g.toNonIndexed():g),out=new T.BufferGeometry();
  for(const k of['position','normal','uv']){let total=0;for(const g of gs)total+=g.attributes[k].array.length;const arr=new Float32Array(total);let o=0;for(const g of gs){arr.set(g.attributes[k].array,o);o+=g.attributes[k].array.length}out.setAttribute(k,new T.BufferAttribute(arr,gs[0].attributes[k].itemSize))}return out}

export default function createPlazaModule(opts={}){
  const cfg=Object.assign({radius:16,plazaR:10.2,basinR:3.4,pathW:3.4,seed:186,
    labels:{to_church:'예배당',to_garden:'치유의 정원',to_music:'별빛 음악당',to_library:'성경 도서관'}},opts);
  const QUALITY={low:{particles:150,flowers:16,ripples:3},mid:{particles:320,flowers:32,ripples:5},high:{particles:480,flowers:52,ripples:6}};
  let T=null,root=null,host=null,qual='mid',active=true,disposed=false,time=0;
  const tracked={geo:[],mat:[],tex:[]};const own=(k,o)=>{if(o)tracked[k].push(o);return o};
  const refs={};                       // 낮·밤에 따라 바뀌는 재질/메시
  const shapes=[],anchors={};
  const AX={to_church:{x:0,z:-1},to_library:{x:0,z:1},to_garden:{x:-1,z:0},to_music:{x:1,z:0}};   // 교회는 −z, 도서관은 +z, 정원은 서(−x), 음악당은 동(+x)
  let makeCanvas=()=>null;

  // ───────── 캔버스 무늬 (캔버스가 없으면 단색으로 대체)
  const tex=(c,rep)=>{if(!c)return null;const t=own('tex',new T.CanvasTexture(c));t.colorSpace=T.SRGBColorSpace;t.anisotropy=2;if(rep){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rep[0],rep[1])}return t};
  function paveCanvas(){const S=512,c=makeCanvas(S,S);if(!c)return null;const g=c.getContext('2d'),R=S/2,r=rng(11);
    const rings=[0,.17,.34,.52,.72,1];for(let i=rings.length-2;i>=0;i--){g.beginPath();g.arc(R,R,rings[i+1]*R,0,TAU);g.fillStyle=i%2?'#e4dac4':'#d3c8ae';g.fill()}
    g.strokeStyle='#b9ad92';g.lineWidth=2;const n=[0,10,18,26,36];
    for(let i=1;i<rings.length-1;i++){g.beginPath();g.arc(R,R,rings[i]*R,0,TAU);g.stroke()}
    for(let i=1;i<rings.length-1;i++){for(let k=0;k<n[i];k++){const a=k/n[i]*TAU+(i%2)*.1;g.beginPath();g.moveTo(R+Math.cos(a)*rings[i]*R,R+Math.sin(a)*rings[i]*R);g.lineTo(R+Math.cos(a)*rings[i+1]*R,R+Math.sin(a)*rings[i+1]*R);g.stroke()}}
    for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()>.5?'255,250,238':'120,105,80'},${.05+r()*.06})`;const a=r()*TAU,d=Math.sqrt(r())*R;g.fillRect(R+Math.cos(a)*d,R+Math.sin(a)*d,2,2)}return c}
  function brickCanvas(){const S=256,c=makeCanvas(S,S);if(!c)return null;const g=c.getContext('2d'),r=rng(7);g.fillStyle='#c9bea5';g.fillRect(0,0,S,S);
    const rows=8,bw=64,bh=S/rows;for(let y=0;y<rows;y++){for(let x=-1;x<S/bw+1;x++){const ox=(y%2)*bw/2;g.fillStyle=['#d9cfb8','#d0c5ab','#ddd3bd','#cdc2a8'][Math.floor(r()*4)];g.fillRect(x*bw+ox+2,y*bh+2,bw-4,bh-4)}}return c}
  function grassCanvas(){const S=256,c=makeCanvas(S,S);if(!c)return null;const g=c.getContext('2d'),r=rng(5);g.fillStyle='#7da66a';g.fillRect(0,0,S,S);
    for(let i=0;i<1400;i++){g.fillStyle=`rgba(${r()>.5?'160,200,120':'70,110,60'},${.1+r()*.12})`;g.fillRect(r()*S,r()*S,3,3)}return c}
  function waterCanvas(){const S=256,c=makeCanvas(S,S);if(!c)return null;const g=c.getContext('2d'),r=rng(3);g.fillStyle='#bfe0f4';g.fillRect(0,0,S,S);
    for(let i=0;i<30;i++){g.strokeStyle=`rgba(255,255,255,${.25+r()*.3})`;g.lineWidth=1+r()*2;g.beginPath();g.ellipse(r()*S,r()*S,10+r()*40,4+r()*14,r()*3,0,TAU);g.stroke()}return c}
  function spriteCanvas(){const S=64,c=makeCanvas(S,S);if(!c)return null;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.45,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,S,S);return c}
  function coneAlphaCanvas(){const c=makeCanvas(8,64);if(!c)return null;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#fff');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,8,64);return c}
  function signCanvas(text){const c=makeCanvas(256,96);if(!c)return null;const g=c.getContext('2d');g.fillStyle='#6a4326';g.fillRect(0,0,256,96);g.strokeStyle='#e0b830';g.lineWidth=4;g.strokeRect(6,6,244,84);g.fillStyle='#f6efe0';g.font='600 34px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,128,50,230);return c}

  // ───────── 만들기
  const addMesh=(geo,mat,parent=root)=>{own('geo',geo);own('mat',mat);const m=new T.Mesh(geo,mat);parent.add(m);return m};
  const lam=(color,extra={})=>new T.MeshLambertMaterial(Object.assign({color},extra));

  function buildGround(){
    const gtex=tex(grassCanvas(),[7,7]);
    const grass=addMesh(new T.CircleGeometry(cfg.radius,72),lam('#ffffff',{map:gtex}));grass.rotation.x=-Math.PI/2;if(!gtex)grass.material.color.set('#7da66a');
    const ptex=tex(paveCanvas());
    const plaza=addMesh(new T.CircleGeometry(cfg.plazaR,72),lam('#ffffff',{map:ptex}));plaza.rotation.x=-Math.PI/2;plaza.position.y=.012;if(!ptex)plaza.material.color.set('#d9cfb8');
    const btex=tex(brickCanvas(),[cfg.pathW/2,3]);const len=cfg.radius-cfg.plazaR+.7,mid=(cfg.radius+cfg.plazaR-.7)/2;
    const pathGeo=own('geo',new T.PlaneGeometry(cfg.pathW,len));pathGeo.rotateX(-Math.PI/2);const pathMat=own('mat',lam('#ffffff',{map:btex}));if(!btex)pathMat.color.set('#d4c9b0');
    const curbGeo=own('geo',new T.BoxGeometry(.18,.14,len)),curbMat=own('mat',lam('#bdb29a'));
    const paths=new T.InstancedMesh(pathGeo,pathMat,4),curbs=new T.InstancedMesh(curbGeo,curbMat,8);root.add(paths,curbs);
    const M=new T.Matrix4(),R=new T.Matrix4();let pi=0,ci=0;
    for(const d of Object.values(AX)){R.makeRotationY(d.x?Math.PI/2:0);
      M.makeTranslation(d.x*mid,.024,d.z*mid).multiply(R);paths.setMatrixAt(pi++,M);
      for(const s of[-1,1]){const off=s*(cfg.pathW/2+.09);M.makeTranslation(d.x*mid+(d.z?off:0),.07,d.z*mid+(d.x?off:0)).multiply(R);curbs.setMatrixAt(ci++,M)}}
    paths.instanceMatrix.needsUpdate=curbs.instanceMatrix.needsUpdate=true;
  }
  function buildFountain(){
    const stone=own('mat',lam('#e9dfca')),stoneD=own('mat',lam('#d2c7ad'));
    // 분수대의 돌 부분(바깥 수조·기둥·두 층 물그릇)은 한 덩어리로 합쳐서 한 번에 그린다
    const prof=[[cfg.basinR,0],[cfg.basinR,.62],[cfg.basinR-.26,.62],[cfg.basinR-.26,.1]].map(p=>new T.Vector2(p[0],p[1]));
    const part=(g,y)=>{g.translate(0,y,0);return g};
    const merged=own('geo',mergeGeos(T,[new T.LatheGeometry(prof,44),part(new T.CylinderGeometry(.34,.5,1.25,14),.72),part(new T.CylinderGeometry(1.45,.62,.34,28),1.45),part(new T.CylinderGeometry(.17,.26,1.0,12),2.12),part(new T.CylinderGeometry(.82,.34,.26,24),2.53)]));
    root.add(new T.Mesh(merged,stone));
    const rimCap=addMesh(new T.TorusGeometry(cfg.basinR-.13,.07,6,44),stoneD);rimCap.rotation.x=Math.PI/2;rimCap.position.y=.64;
    const floor=addMesh(new T.CircleGeometry(cfg.basinR-.26,40),lam('#5d7f9d'));floor.rotation.x=-Math.PI/2;floor.position.y=.1;
    const flat=(g,y)=>{g.rotateX(-Math.PI/2);g.translate(0,y,0);return g};
    const wUp=own('mat',new T.MeshBasicMaterial({color:'#63aee0',transparent:true,opacity:.9}));refs.water1=refs.water2=wUp;
    root.add(new T.Mesh(own('geo',mergeGeos(T,[flat(new T.CircleGeometry(1.3,28),1.63),flat(new T.CircleGeometry(.7,24),2.65)])),wUp));
    const fin=addMesh(new T.ConeGeometry(.13,.42,10),lam('#e0c46a'));fin.position.y=2.9;
    // 수면 + 물결 무늬(천천히 흐름)
    const wtex=tex(waterCanvas(),[3,3]);refs.waterTex=wtex;
    const wm=own('mat',new T.MeshBasicMaterial({color:'#63aee0',map:wtex,transparent:true,opacity:.9}));refs.water=wm;
    const water=addMesh(new T.CircleGeometry(cfg.basinR-.26,44),wm);water.rotation.x=-Math.PI/2;water.position.y=.46;
    // 밤에 물속에서 은은히 켜지는 빛(가짜 조명, 광원 없음)
    const sprite=tex(spriteCanvas());refs.sprite=sprite;
    const glowM=own('mat',new T.MeshBasicMaterial({color:'#7fd2ff',map:sprite,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));refs.glow=glowM;
    const glow=addMesh(new T.CircleGeometry(cfg.basinR+.5,32),glowM);glow.rotation.x=-Math.PI/2;glow.position.y=.5;
    shapes.push({type:'circle',x:0,z:0,r:cfg.basinR+.2});
  }
  function buildJets(){
    const g=9,jets=[];
    jets.push({ox:0,oy:2.98,oz:0,vx:0,vy:6.4,vz:0,land:.47,w:3.4,spread:.4});
    for(let k=0;k<8;k++){const a=k/8*TAU+.2;jets.push({ox:Math.cos(a)*.74,oy:2.66,oz:Math.sin(a)*.74,vx:Math.cos(a)*1.15,vy:1.6,vz:Math.sin(a)*1.15,land:1.66,w:.5,spread:.08})}
    for(let k=0;k<12;k++){const a=k/12*TAU;jets.push({ox:Math.cos(a)*1.38,oy:1.66,oz:Math.sin(a)*1.38,vx:Math.cos(a)*1.9,vy:2.2,vz:Math.sin(a)*1.9,land:.47,w:.7,spread:.12})}
    for(const j of jets){const disc=j.vy*j.vy+2*g*(j.oy-j.land);j.T=(j.vy+Math.sqrt(disc))/g}   // 착수까지 걸리는 시간
    refs.jets=jets;refs.g=g;
    const MAX=QUALITY.high.particles+jets.length*3,pos=new Float32Array(MAX*3);
    const geo=own('geo',new T.BufferGeometry());geo.setAttribute('position',new T.BufferAttribute(pos,3));
    const mat=own('mat',new T.PointsMaterial({color:'#f2fbff',size:.19,sizeAttenuation:true,map:refs.sprite,transparent:true,opacity:.95,depthWrite:false,alphaTest:.01}));
    const pts=new T.Points(geo,mat);pts.frustumCulled=false;root.add(pts);refs.pts=pts;refs.ptsMat=mat;
    refs.pj=new Uint8Array(MAX);refs.pp=new Float32Array(MAX);refs.px=new Float32Array(MAX);refs.pz=new Float32Array(MAX);
    const r=rng(cfg.seed+1);for(let i=0;i<MAX;i++){refs.px[i]=(r()-.5);refs.pz[i]=(r()-.5)}
    assignParticles(QUALITY[qual].particles);
  }
  function assignParticles(N){
    const jets=refs.jets,tw=jets.reduce((s,j)=>s+j.w,0);let i=0;const counts=jets.map(j=>Math.max(2,Math.round(N*j.w/tw)));
    jets.forEach((j,k)=>{for(let c=0;c<counts[k]&&i<refs.pj.length;c++){refs.pj[i]=k;refs.pp[i]=c/counts[k]+((i*0.618)%1)*.02;i++}});
    refs.pn=i;refs.pts.geometry.setDrawRange(0,refs.pn);
  }
  function buildRipples(){
    const geo=own('geo',new T.RingGeometry(.12,.18,24));refs.ripples=[];
    for(let k=0;k<QUALITY.high.ripples;k++){const m=own('mat',new T.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:0,depthWrite:false,side:T.DoubleSide}));const mesh=new T.Mesh(geo,m);mesh.rotation.x=-Math.PI/2;mesh.position.y=.475;root.add(mesh);
      const a=k/QUALITY.high.ripples*TAU+.4,rr=k%2?2.75:1.05;refs.ripples.push({mesh,m,x:Math.cos(a)*rr,z:Math.sin(a)*rr,ph:k*.37})}
    refs.rn=QUALITY[qual].ripples;
  }
  function buildBenches(){
    const N=8,r=8.4,angs=[];for(let q=0;q<4;q++){angs.push((q*90+31)*Math.PI/180,(q*90+59)*Math.PI/180)}
    const seatG=own('geo',new T.BoxGeometry(1.9,.08,.52)),backG=own('geo',new T.BoxGeometry(1.9,.5,.07)),legG=own('geo',new T.BoxGeometry(.12,.45,.46));
    const wood=own('mat',lam('#6a4326')),stone=own('mat',lam('#cdc3ad'));
    const seat=new T.InstancedMesh(seatG,wood,N),back=new T.InstancedMesh(backG,wood,N),legs=new T.InstancedMesh(legG,stone,N*2);root.add(seat,back,legs);
    const M=new T.Matrix4(),R=new T.Matrix4(),P=new T.Matrix4(),B=new T.Matrix4();let li=0;
    angs.forEach((a,k)=>{const x=Math.cos(a)*r,z=Math.sin(a)*r,phi=Math.atan2(-Math.cos(a),-Math.sin(a));R.makeRotationY(phi);B.makeTranslation(x,0,z).multiply(R);
      const put=(mesh,idx,lx,ly,lz)=>{P.makeTranslation(lx,ly,lz);M.copy(B).multiply(P);mesh.setMatrixAt(idx,M)};
      put(seat,k,0,.45,0);put(back,k,0,.76,-.23);put(legs,li++,-.8,.225,0);put(legs,li++,.8,.225,0);
      shapes.push({type:'rect',x,z,w:2.05,d:.75,rot:phi});anchors['seat_'+k]={x,z,yaw:phi,kind:'bench'}});
    seat.instanceMatrix.needsUpdate=back.instanceMatrix.needsUpdate=legs.instanceMatrix.needsUpdate=true;
  }
  function buildBeds(){
    const bedR=2.0,rr=12.4,soil=own('mat',lam('#5b4331')),curb=own('mat',lam('#c8bea6')),shrubM=own('mat',lam('#4f8a4d'));
    const MAXF=QUALITY.high.flowers,bedsN=4,flowerG=own('geo',new T.IcosahedronGeometry(.1,0)),flowerM=own('mat',lam('#ffffff'));
    const soilG=own('geo',new T.CircleGeometry(bedR,28));soilG.rotateX(-Math.PI/2);const ringG=own('geo',new T.TorusGeometry(bedR,.13,6,28));ringG.rotateX(Math.PI/2);const shrubG=own('geo',new T.IcosahedronGeometry(.62,1));
    const soils=new T.InstancedMesh(soilG,soil,bedsN),rings=new T.InstancedMesh(ringG,curb,bedsN),shrubs=new T.InstancedMesh(shrubG,shrubM,bedsN),flowers=new T.InstancedMesh(flowerG,flowerM,bedsN*MAXF);root.add(soils,rings,shrubs,flowers);
    const pal=['#e9a6c2','#f6f2ea','#f2d36b','#a98ed0','#f08c7a'].map(h=>new T.Color(h));const r=rng(cfg.seed+2),M=new T.Matrix4();
    refs.fm=[];
    for(let b=0;b<bedsN;b++){const a=(b*90+45)*Math.PI/180,cx=Math.cos(a)*rr,cz=Math.sin(a)*rr;
      M.makeTranslation(cx,.03,cz);soils.setMatrixAt(b,M);M.makeTranslation(cx,.13,cz);rings.setMatrixAt(b,M);M.makeScale(1,.85,1).setPosition(cx,.5,cz);shrubs.setMatrixAt(b,M);
      for(let f=0;f<MAXF;f++){const ang=r()*TAU,d=.8+Math.sqrt(r())*(bedR-1.0),sc=.8+r()*.6;M.makeScale(sc,sc,sc);M.setPosition(cx+Math.cos(ang)*d,.2+r()*.1,cz+Math.sin(ang)*d);refs.fm.push(M.clone());flowers.setColorAt(b*MAXF+f,pal[Math.floor(r()*pal.length)])}
      shapes.push({type:'circle',x:cx,z:cz,r:bedR+.1})}
    for(const m of[soils,rings,shrubs])m.instanceMatrix.needsUpdate=true;flowers.instanceColor.needsUpdate=true;refs.flowers=flowers;refs.MAXF=MAXF;refs.bedsN=bedsN;refs.zero=new T.Matrix4().makeScale(0,0,0);
    setFlowerCount();
  }
  function setFlowerCount(){const n=QUALITY[qual].flowers;
    for(let b=0;b<refs.bedsN;b++)for(let f=0;f<refs.MAXF;f++){const i=b*refs.MAXF+f;refs.flowers.setMatrixAt(i,f<n?refs.fm[i]:refs.zero)}
    refs.flowers.instanceMatrix.needsUpdate=true}
  function buildLamps(){
    const N=8,r=11.6,pole=own('geo',new T.CylinderGeometry(.06,.08,3.2,8)),base=own('geo',new T.CylinderGeometry(.18,.23,.35,8)),head=own('geo',new T.BoxGeometry(.32,.42,.32));
    const iron=own('mat',lam('#2e2f34'));const headM=own('mat',new T.MeshBasicMaterial({color:'#d9d0b8'}));refs.headM=headM;
    const poles=new T.InstancedMesh(pole,iron,N),bases=new T.InstancedMesh(base,iron,N),heads=new T.InstancedMesh(head,headM,N);root.add(poles,bases,heads);
    const alpha=tex(coneAlphaCanvas());
    const coneG=own('geo',new T.ConeGeometry(1.7,3.0,18,1,true)),coneM=own('mat',new T.MeshBasicMaterial({color:'#ffd88a',transparent:true,opacity:0,alphaMap:alpha,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));refs.coneM=coneM;
    const poolG=own('geo',new T.CircleGeometry(2.7,24)),poolM=own('mat',new T.MeshBasicMaterial({color:'#ffd27a',map:refs.sprite,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false}));refs.poolM=poolM;
    const cones=new T.InstancedMesh(coneG,coneM,N),pools=new T.InstancedMesh(poolG,poolM,N);root.add(cones,pools);cones.frustumCulled=false;pools.frustumCulled=false;
    const M=new T.Matrix4(),R=new T.Matrix4().makeRotationX(-Math.PI/2);
    for(let k=0;k<N;k++){const a=(22.5+k*45)*Math.PI/180,x=Math.cos(a)*r,z=Math.sin(a)*r;
      M.makeTranslation(x,1.6,z);poles.setMatrixAt(k,M);M.makeTranslation(x,.175,z);bases.setMatrixAt(k,M);M.makeTranslation(x,3.4,z);heads.setMatrixAt(k,M);M.makeTranslation(x,1.9,z);cones.setMatrixAt(k,M);
      M.makeTranslation(x,.04,z).multiply(R);pools.setMatrixAt(k,M);shapes.push({type:'circle',x,z,r:.28})}
    for(const m of[poles,bases,heads,cones,pools])m.instanceMatrix.needsUpdate=true;
  }
  function buildSigns(){
    const post=own('geo',new T.CylinderGeometry(.05,.06,1.7,8)),pm=own('mat',lam('#4a3220')),boardG=own('geo',new T.PlaneGeometry(1.7,.64));
    const posts=new T.InstancedMesh(post,pm,4);root.add(posts);const M=new T.Matrix4();let i=0;
    for(const[k,d]of Object.entries(AX)){
      const along=cfg.plazaR+.7,lat=cfg.pathW/2+1.1,x=d.x*along+(d.z?lat:0),z=d.z*along+(d.x?lat:0);
      M.makeTranslation(x,.85,z);posts.setMatrixAt(i++,M);
      const t=tex(signCanvas(cfg.labels[k]||k));const bm=own('mat',lam('#ffffff',{map:t,side:T.FrontSide}));if(!t)bm.color.set('#6a4326');
      const ang=Math.atan2(-x,-z),nx=Math.sin(ang)*.02,nz=Math.cos(ang)*.02;const b=new T.Mesh(boardG,bm);b.position.set(x+nx,1.45,z+nz);b.rotation.y=ang;const b2=new T.Mesh(boardG,bm);b2.position.set(x-nx,1.45,z-nz);b2.rotation.y=ang+Math.PI;root.add(b,b2);
      shapes.push({type:'circle',x,z,r:.3})}
    posts.instanceMatrix.needsUpdate=true;
  }
  function buildAnchors(){
    for(const[k,d]of Object.entries(AX))anchors[k]={x:d.x*cfg.radius,z:d.z*cfg.radius,dirX:d.x,dirZ:d.z,width:cfg.pathW,kind:'path'};
    anchors.plaza_ring={x:0,z:cfg.plazaR*.62,kind:'spot'};
  }

  // ───────── 인터페이스
  const mod={
    id:MODULE_INFO.id,info:MODULE_INFO,footprint:{type:'circle',cx:0,cz:0,r:cfg.radius},
    get root(){return root},
    async init(h){
      host=h||{};T=host.THREE;if(!T)throw new Error('host.THREE 가 필요해요');
      makeCanvas=host.createCanvas||((w,hh)=>{if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=w;c.height=hh;return c});
      qual=QUALITY[host.quality]?host.quality:'mid';
      root=new T.Group();root.name='plaza';
      if(host.offset)root.position.set(host.offset.x||0,0,host.offset.z||0);
      buildGround();buildFountain();buildJets();buildRipples();buildBenches();buildBeds();buildLamps();buildSigns();buildAnchors();
      (host.root||host.scene)?.add(root);
      mod.setTimeOfDay(host.t01??0.5);
      return root},
    update(dt){
      if(disposed||!active||!root)return;time+=dt;
      const {jets,g}=refs,pos=refs.pts.geometry.attributes.position.array,rate=.28;
      for(let i=0;i<refs.pn;i++){const j=jets[refs.pj[i]],u=(refs.pp[i]+time*rate)%1,t=u*j.T;
        pos[i*3]=j.ox+(j.vx+refs.px[i]*j.spread*3)*t;pos[i*3+1]=j.oy+j.vy*t-.5*g*t*t;pos[i*3+2]=j.oz+(j.vz+refs.pz[i]*j.spread*3)*t}
      refs.pts.geometry.attributes.position.needsUpdate=true;
      if(refs.waterTex){refs.waterTex.offset.x=(time*.012)%1;refs.waterTex.offset.y=(time*.007)%1}
      for(let k=0;k<refs.ripples.length;k++){const r=refs.ripples[k];if(k>=refs.rn){r.m.opacity=0;continue}const u=(time*.55+r.ph)%1;r.mesh.position.x=r.x;r.mesh.position.z=r.z;r.mesh.scale.setScalar(1+u*5.5);r.m.opacity=(1-u)*(1-u)*.5}
      const flick=1+Math.sin(time*7.3)*.02+Math.sin(time*3.1)*.015;refs.coneM.opacity=refs.coneBase*flick},
    setTimeOfDay(t01){const E=envFor(t01),n=E.night,wc=mixHex('#63aee0','#27528f',n);
      refs.water.color.set(wc);refs.water1.color.set(wc);refs.water2.color.set(wc);
      refs.glow.opacity=n*.55;refs.ptsMat.color.set(mixHex('#f2fbff','#cfe6ff',n));
      refs.headM.color.set(mixHex('#d9d0b8','#ffe3a0',E.lamps));refs.coneBase=E.lamps*.2;refs.coneM.opacity=refs.coneBase;refs.poolM.opacity=E.lamps*.42;
      return E},
    setLightingState(timeOfDay){const map={day:.5,sunset:.75,night:0};mod.setTimeOfDay(map[timeOfDay]??.5)},     // 라이라 초안 호환
    setQuality(q){if(!QUALITY[q]||!root)return;qual=q;assignParticles(QUALITY[q].particles);refs.rn=QUALITY[q].ripples;setFlowerCount()},
    getColliders(offset){const ox=offset?.x??host?.offset?.x??0,oz=offset?.z??host?.offset?.z??0;return shapes.map(s=>Object.assign({},s,{x:s.x+ox,z:s.z+oz}))},
    getAnchors(offset){const ox=offset?.x??host?.offset?.x??0,oz=offset?.z??host?.offset?.z??0,o={};for(const[k,a]of Object.entries(anchors))o[k]=Object.assign({},a,{x:a.x+ox,z:a.z+oz});return o},
    getStats(){let tri=0,draw=0,inst=0;if(!root)return{triangles:0,drawCalls:0,instancedMeshes:0,particles:0,quality:qual};
      root.traverse(o=>{if(o.isMesh||o.isPoints){draw++;const g=o.geometry;if(o.isMesh){const n=(g.index?g.index.count:g.attributes.position.count)/3;tri+=n*(o.isInstancedMesh?o.count:1);if(o.isInstancedMesh)inst++}}});
      return{triangles:Math.round(tri),drawCalls:draw,instancedMeshes:inst,particles:refs.pn||0,quality:qual}},
    onEnter(){active=true},onExit(){active=false},
    dispose(){if(disposed)return;disposed=true;root?.traverse(o=>{if(o.isInstancedMesh)o.dispose?.()});if(root)root.parent?.remove(root);
      for(const k of['geo','mat','tex'])for(const o of tracked[k])o.dispose?.();tracked.geo.length=tracked.mat.length=tracked.tex.length=0;root=null;host=null}
  };
  return mod;
}
