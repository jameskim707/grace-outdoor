import * as THREE from 'https://jameskim707.github.io/grace-outdoor/vendor/three/three.module.js';
import { createMusicPlayer } from './player.js';

const AUDIO_BASE = 'https://jameskim707.github.io/grace-chapel-audio/';
const MANIFEST_URL = `${AUDIO_BASE}music.json`;
const canvas = document.querySelector('#stage');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#10182b');
scene.fog = new THREE.FogExp2('#10182b', .022);
const camera = new THREE.PerspectiveCamera(54, 1, .1, 100);
camera.position.set(0, 1.72, 14.2);
const renderer = new THREE.WebGLRenderer({canvas, antialias: !matchMedia('(pointer:coarse)').matches, alpha: false});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.25 : 1.6));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const colors = {navy:'#111a31', navy2:'#1a2941', blue:'#243957', glass:'#76a8c2', gold:'#dfc582', warm:'#f1dfb0', wood:'#61472f', stone:'#d4cfbf', cream:'#f0ecdf'};
const materials = {
  floor: new THREE.MeshStandardMaterial({color:'#171f34', roughness:.36, metalness:.22}),
  wall: new THREE.MeshStandardMaterial({color:'#1b2941', roughness:.72, metalness:.08}),
  wood: new THREE.MeshStandardMaterial({color:colors.wood, roughness:.57}),
  gold: new THREE.MeshStandardMaterial({color:colors.gold, metalness:.72, roughness:.24}),
  trim: new THREE.MeshStandardMaterial({color:'#b89450', metalness:.62, roughness:.3}),
  glass: new THREE.MeshPhysicalMaterial({color:'#8bbbd1', roughness:.18, metalness:.18, transmission:.25, transparent:true, opacity:.31, depthWrite:false}),
  darkGlass: new THREE.MeshPhysicalMaterial({color:'#263d5b', roughness:.32, metalness:.2, transparent:true, opacity:.58, depthWrite:false}),
  seat: new THREE.MeshStandardMaterial({color:'#41546d', roughness:.87}),
  emissive: new THREE.MeshStandardMaterial({color:'#f2d889', emissive:'#d9a748', emissiveIntensity:2.6, metalness:.35, roughness:.25}),
  star: new THREE.MeshBasicMaterial({color:'#fff4cf'}),
};
scene.add(new THREE.HemisphereLight('#adc9ee','#151322',1.12));
const key = new THREE.DirectionalLight('#ffdba0',2.1); key.position.set(-5,9,7); scene.add(key);
const fill = new THREE.PointLight('#8ebce9',26,32,1.8); fill.position.set(0,6,-1); scene.add(fill);
const goldFill = new THREE.PointLight('#f0c47b',14,22,2); goldFill.position.set(0,3,8); scene.add(goldFill);

const group = new THREE.Group(); scene.add(group);
const booths = [];
const keymap = Object.create(null);
let yaw = 0, pitch = -.035, isDragging = false, lastPointer = null, pointerDownAt = null;
let activeBooth = null, playerInstance = null, entered = false, toastTimer = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const tmp = new THREE.Object3D();
const podiumNames = ['달빛','은하수','새벽별','고요','위로','소망'];
const podiumCaptions = ['차분히 머무는 방','마음이 넓어지는 방','새롭게 시작하는 방','조용히 숨 고르는 방','따뜻한 노래의 방','희망을 담는 방'];

function box(parent, size, pos, mat, name='') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos); if (name) mesh.name=name; parent.add(mesh); return mesh;
}
function cylinder(parent, rTop, rBottom, h, pos, mat, segments=20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),mat);mesh.position.set(...pos);parent.add(mesh);return mesh;
}
function line(parent, points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(18,points.length*5),radius,8,false),mat);parent.add(mesh);return mesh;
}
function makeLabelTexture(number, title) {
  const c=document.createElement('canvas');c.width=512;c.height=180;const x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height);x.fillStyle='#111a31e8';x.beginPath();x.roundRect(8,8,496,164,24);x.fill();
  x.strokeStyle='#dfc582cc';x.lineWidth=3;x.beginPath();x.roundRect(9,9,494,162,23);x.stroke();
  x.fillStyle='#dfc582';x.font='500 25px Georgia,serif';x.textAlign='center';x.fillText(`LISTENING POD 0${number}`,256,55);
  x.fillStyle='#fbf5e7';x.font='500 45px "Noto Serif KR","Malgun Gothic",serif';x.fillText(`${title} 부스`,256,119);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function addHall() {
  // 무대처럼 단차가 느껴지는 별빛 원형 홀
  box(group,[18,.35,22],[0,-.22,0],materials.floor,'hall-floor');
  const innerFloor=new THREE.Mesh(new THREE.PlaneGeometry(15.2,19.4),new THREE.MeshStandardMaterial({color:'#24263b',roughness:.27,metalness:.28}));
  innerFloor.rotation.x=-Math.PI/2;innerFloor.position.set(0,-.035,0);group.add(innerFloor);
  // 중앙 통로를 따라 이어지는 황금빛 인레이
  const aisle=new THREE.Mesh(new THREE.PlaneGeometry(2.35,.055),materials.trim);aisle.rotation.x=-Math.PI/2;aisle.position.set(0,.002,3.1);aisle.scale.set(1,17,1);group.add(aisle);
  for(const side of [-1,1]){
    box(group,[.22,7.6,19.8],[side*8.55,3.65,0],materials.wall,'side-wall');
    for(let z=-7.2;z<=7.3;z+=4.8){
      const col=cylinder(group,.18,.24,7.35,[side*7.55,3.65,z],materials.trim,18);
      const cap=cylinder(group,.34,.31,.18,[side*7.55,7.36,z],materials.gold,20);
      for(const y of [1.15,6.0]){const band=cylinder(group,.225,.225,.1,[side*7.55,y,z],materials.gold,18);}
    }
    for(let z=-6.7;z<=6.7;z+=4.45){
      const window=box(group,[.045,4.1,2.4],[side*8.4,4.3,z],materials.darkGlass,'stained-glass-window');
      for(const dz of [-1.22,1.22])box(group,[.07,4.3,.055],[side*8.36,4.3,z+dz],materials.gold);
      box(group,[.07,.055,4.35],[side*8.36,4.3,z],materials.gold);
      const shine=new THREE.PointLight(side<0?'#8cbbe8':'#bbd9ef',3,7,2);shine.position.set(side*7.5,4.2,z);group.add(shine);
    }
  }
  box(group,[17.2,.22,.22],[0,7.55,-9.88],materials.trim);
  box(group,[17.2,.22,.22],[0,7.55,9.88],materials.trim);
  // 후면 별빛 스테인드 창
  const back=new THREE.Mesh(new THREE.PlaneGeometry(7.4,5.4),materials.darkGlass);back.position.set(0,4.2,-10.72);group.add(back);
  for(let x=-3.6;x<=3.61;x+=1.2)box(group,[.045,5.5,.06],[x,4.2,-10.67],materials.gold);
  for(let y=1.5;y<=6.91;y+=1.35)box(group,[7.45,.045,.06],[0,y,-10.67],materials.gold);
  // 낮은 별 무늬 천장과 아치 리브
  const roof=new THREE.Mesh(new THREE.CylinderGeometry(7.9,7.9,.16,64),new THREE.MeshStandardMaterial({color:'#121b30',roughness:.7,metalness:.12}));roof.position.set(0,8.15,-.4);group.add(roof);
  for(let z=-7.5;z<=7.6;z+=3.75){
    const pts=[];for(let i=0;i<=32;i++){const a=Math.PI+(i/32)*Math.PI;pts.push([Math.cos(a)*7.8,7.25+Math.sin(a)*2.6,z])}
    line(group,pts,.045,materials.trim);
  }
  const starCount=210,positions=new Float32Array(starCount*3);let seed=1771;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
  for(let i=0;i<starCount;i++){const a=rand()*Math.PI*2,r=Math.sqrt(rand())*7.25;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=7.98+(rand()-.5)*.035;positions[i*3+2]=Math.sin(a)*r-0.4;}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const starPoints=new THREE.Points(starGeo,new THREE.PointsMaterial({color:'#f9eac3',size:.055,transparent:true,opacity:.9,sizeAttenuation:true}));group.add(starPoints);
  // 중심의 별자리 조명 조형물
  const orb=new THREE.Mesh(new THREE.IcosahedronGeometry(.68,1),materials.emissive);orb.position.set(0,6.25,-1);group.add(orb);orb.name='star-orb';
  const halo1=new THREE.Mesh(new THREE.TorusGeometry(1.25,.025,8,80),materials.gold);halo1.position.copy(orb.position);halo1.rotation.x=.98;group.add(halo1);
  const halo2=new THREE.Mesh(new THREE.TorusGeometry(1.7,.016,8,90),new THREE.MeshStandardMaterial({color:'#a9cbe0',emissive:'#2b6085',emissiveIntensity:1.2,metalness:.6,roughness:.3}));halo2.position.copy(orb.position);halo2.rotation.x=1.17;halo2.rotation.y=.52;group.add(halo2);
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2.8+i*.42,.012,6,90),new THREE.MeshBasicMaterial({color:i===1?'#e5ca89':'#7b9fba',transparent:true,opacity:.5}));ring.position.set(0,6.25,-1);ring.rotation.x=.82+i*.22;group.add(ring);}
  // 바닥 별자리를 닮은 원형 무늬
  for(let r=1;r<=3;r++){const circle=new THREE.Mesh(new THREE.TorusGeometry(r*1.55,.012,6,96),new THREE.MeshBasicMaterial({color:r===1?'#d7bd7d':'#8096ab',transparent:true,opacity:.4}));circle.rotation.x=Math.PI/2;circle.position.set(0,.015+r*.001,0);group.add(circle)}
  for(let i=0;i<12;i++){const a=i*Math.PI/6;const dot=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),materials.emissive);dot.position.set(Math.cos(a)*4.85,.04,Math.sin(a)*4.85);group.add(dot)}
  // 출입구 위 간결한 표지
  const signMat=new THREE.MeshBasicMaterial({map:makeSignTexture(),transparent:true,side:THREE.DoubleSide});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(4.9,1.02),signMat);sign.position.set(0,6.5,9.64);sign.rotation.y=Math.PI;group.add(sign);
  // 안내 스탠드
  box(group,[2.4,.1,.6],[0,.09,8.4],materials.wood);cylinder(group,.045,.08,.88,[0,.56,8.4],materials.gold,14);
}
function makeSignTexture(){const c=document.createElement('canvas');c.width=900;c.height=180;const x=c.getContext('2d');x.clearRect(0,0,900,180);x.fillStyle='#111a31';x.fillRect(4,4,892,172);x.strokeStyle='#dfc582';x.lineWidth=4;x.strokeRect(13,13,874,154);x.textAlign='center';x.fillStyle='#e3ca88';x.font='40px Georgia,serif';x.fillText('STARLIGHT MUSIC HALL',450,76);x.fillStyle='#f8f4e9';x.font='42px "Noto Serif KR","Malgun Gothic",serif';x.fillText('별빛 음악당',450,137);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t}
function makeBooth(index) {
  const side=index<3?-1:1,slot=index%3,z=[3.9,-.65,-5.15][slot],x=side*5.72;
  const yaw=side<0?-Math.PI/2:Math.PI/2;
  const pod=new THREE.Group();pod.position.set(x,0,z);pod.rotation.y=yaw;pod.userData.boothIndex=index;group.add(pod);
  // 부스의 낮은 목재 기단과 흡음 패널
  box(pod,[3.5,.18,2.9],[0,.11,0],materials.wood);
  box(pod,[3.34,.08,2.72],[0,.24,0],materials.trim);
  box(pod,[3.15,.06,2.48],[0,.31,0],new THREE.MeshStandardMaterial({color:'#27344b',roughness:.94}));
  box(pod,[3.16,2.35,.16],[0,1.5,-1.19],materials.wood);
  box(pod,[.14,2.4,2.48],[-1.56,1.5,0],materials.wood);
  box(pod,[.14,2.4,2.48],[1.56,1.5,0],materials.wood);
  // 전면 유리문은 중앙에서 살짝 열린 듯 비워 둔다
  box(pod,[1.18,2.18,.055],[-.98,1.47,1.22],materials.glass);
  box(pod,[1.18,2.18,.055],[.98,1.47,1.22],materials.glass);
  box(pod,[.12,2.35,.11],[0,1.45,1.22],materials.gold);
  box(pod,[3.46,.13,2.98],[0,2.76,0],materials.wood);
  box(pod,[3.28,.05,2.8],[0,2.84,0],materials.trim);
  // 상부 작은 별빛 채광창
  box(pod,[2.55,.04,1.7],[0,2.88,0],new THREE.MeshStandardMaterial({color:'#344c67',emissive:'#244468',emissiveIntensity:.65,roughness:.28,metalness:.22}));
  // 벽면 금색 수직 라인과 방음 패널 리듬
  for(let s of [-1,1])for(let j=0;j<4;j++){
    const zz=-.84+j*.55;box(pod,[.035,1.7,.12],[s*1.48,1.45,zz],materials.trim);
  }
  // 편안한 의자·낮은 테이블·오디오 콘솔
  const seat=new THREE.Group();seat.position.set(0,0,-.22);pod.add(seat);
  box(seat,[1.08,.24,.92],[0,.72,0],materials.seat);
  box(seat,[1.08,1.02,.2],[0,1.24,-.35],materials.seat);
  box(seat,[.12,.68,.76],[-.43,.34,0],materials.wood);box(seat,[.12,.68,.76],[.43,.34,0],materials.wood);
  box(pod,[1.22,.12,.68],[0,.84,.72],materials.wood);
  box(pod,[.9,.045,.42],[0,.93,.72],new THREE.MeshStandardMaterial({color:'#121a2a',metalness:.45,roughness:.35}));
  const console=new THREE.Mesh(new THREE.BoxGeometry(.35,.09,.19),new THREE.MeshStandardMaterial({color:'#182c3a',emissive:'#4d9db0',emissiveIntensity:1.2,roughness:.28}));console.position.set(0,1.03,.72);pod.add(console);
  cylinder(pod,.11,.11,.045,[0,2.56,0],materials.gold,20);
  const lamp=new THREE.PointLight('#e8c77c',5,5,2);lamp.position.set(0,2.45,0);pod.add(lamp);
  const labelPlane=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.78),new THREE.MeshBasicMaterial({map:makeLabelTexture(index+1,podiumNames[index]),transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  labelPlane.position.set(0,3.55,0);labelPlane.userData.boothIndex=index;pod.add(labelPlane);
  const hit=new THREE.Mesh(new THREE.BoxGeometry(3.6,3.9,3.1),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.set(0,1.86,0);hit.userData.boothIndex=index;pod.add(hit);
  // 문틀에 은은한 황금색 표시등
  for(const xx of [-1.44,1.44]){const light=new THREE.Mesh(new THREE.BoxGeometry(.055,2.06,.07),new THREE.MeshBasicMaterial({color:'#f1d487',emissive:'#d69c35',emissiveIntensity:1.1}));light.position.set(xx,1.52,1.28);pod.add(light)}
  return {id:`booth-${index+1}`,index,title:podiumNames[index],caption:podiumCaptions[index],group:pod,hit,label:labelPlane,light,occupied:false};
}
function buildScene(){
  addHall();
  for(let i=0;i<6;i++)booths.push(makeBooth(i));
  const path=new THREE.Mesh(new THREE.PlaneGeometry(5.6,4.5),new THREE.MeshStandardMaterial({color:'#282b40',roughness:.3,metalness:.2}));path.rotation.x=-Math.PI/2;path.position.set(0,.003,5.45);group.add(path);
  const dots=new THREE.PointLight('#e6c982',7,14,2);dots.position.set(0,4.4,2);scene.add(dots);
}
buildScene();

const $=s=>document.querySelector(s);
const bar=$('#boothBar');
booths.forEach((booth,i)=>{
  const btn=document.createElement('button');btn.className='booth-chip';btn.type='button';btn.innerHTML=`<b><span class="number">0${i+1}</span>${booth.title} 부스</b><small>${booth.caption}</small>`;
  btn.addEventListener('click',()=>enterBooth(i));bar.append(btn);booth.button=btn;
});
function showToast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200)}
function updateCamera(){camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;}
updateCamera();
function enterBooth(index){
  if(!entered){showToast('먼저 음악당에 들어와 주세요.');return;}
  const booth=booths[index];if(!booth)return;
  if(activeBooth?.index===index){showToast(`${booth.title} 부스 안에 있어요.`);return;}
  closeBooth(false);
  activeBooth=booth;booth.occupied=true;booth.button.classList.add('active');
  $('#boothCode').textContent=`LISTENING POD 0${index+1}`;$('#boothTitle').textContent=`${booth.title} 부스`;
  $('#boothPanel').classList.add('open');$('#panelShade').classList.add('open');
  playerInstance=createMusicPlayer({mount:$('#playerMount'),manifestUrl:MANIFEST_URL,initialVolume:.42,onStateChange:({state})=>{booth.button.dataset.state=state;}});
  showToast(`${booth.title} 부스에 들어왔어요. 원하는 곡을 직접 재생해 주세요.`);
}
function closeBooth(announce=true){
  if(playerInstance){playerInstance.stop();playerInstance.destroy();playerInstance=null;}
  if(activeBooth){activeBooth.occupied=false;activeBooth.button.classList.remove('active');activeBooth=null;}
  $('#boothPanel').classList.remove('open');$('#panelShade').classList.remove('open');
  if(announce)showToast('부스에서 나왔어요. 재생을 정지했어요.');
}
$('#closePanel').addEventListener('click',()=>closeBooth());$('#leaveBooth').addEventListener('click',()=>closeBooth());$('#panelShade').addEventListener('click',()=>closeBooth());
$('#boothListBtn').addEventListener('click',()=>{bar.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});showToast('아래에서 여섯 개 부스 중 하나를 골라보세요.');});
$('#lookBtn').addEventListener('click',()=>showToast('마우스 드래그나 터치로 홀을 둘러보세요.'));
$('#enterHall').addEventListener('click',()=>{$('#welcome').classList.add('hidden');entered=true;showToast('별빛 음악당 문이 열렸어요.');});
window.addEventListener('keydown',e=>{const key=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key))e.preventDefault();keymap[key]=true;if(key==='escape'&&activeBooth)closeBooth();});
window.addEventListener('keyup',e=>{keymap[e.key.toLowerCase()]=false;});
canvas.addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;isDragging=true;pointerDownAt={x:e.clientX,y:e.clientY};lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!isDragging||!lastPointer)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;yaw-=dx*.0032;pitch=Math.max(-.42,Math.min(.28,pitch-dy*.0023));lastPointer={x:e.clientX,y:e.clientY};updateCamera();});
canvas.addEventListener('pointerup',e=>{if(isDragging&&pointerDownAt){const dx=e.clientX-pointerDownAt.x,dy=e.clientY-pointerDownAt.y;if(Math.hypot(dx,dy)<8){pointer.x=e.clientX/innerWidth*2-1;pointer.y=-(e.clientY/innerHeight)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(booths.map(b=>b.hit),false)[0];if(hit?.object?.userData.boothIndex!==undefined)enterBooth(hit.object.userData.boothIndex)}}isDragging=false;lastPointer=null;pointerDownAt=null;});
canvas.addEventListener('pointercancel',()=>{isDragging=false;lastPointer=null;pointerDownAt=null;});
function moveKey(btn,key){const down=e=>{e.preventDefault();keymap[key]=true},up=e=>{e.preventDefault();keymap[key]=false};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up)}
document.querySelectorAll('[data-move]').forEach(btn=>moveKey(btn,btn.dataset.move));
function resize(){const w=innerWidth,h=innerHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
window.addEventListener('resize',resize,{passive:true});resize();
let time=0;
function frame(){requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);time+=dt;
  if(entered&&!activeBooth){const f=(keymap.w||keymap.arrowup?1:0)-(keymap.s||keymap.arrowdown?1:0),s=(keymap.d||keymap.arrowright?1:0)-(keymap.a||keymap.arrowleft?1:0);if(f||s){const len=Math.hypot(f,s)||1;camera.position.x+=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*dt*2.3/len;camera.position.z+=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*dt*2.3/len;camera.position.x=Math.max(-6.8,Math.min(6.8,camera.position.x));camera.position.z=Math.max(-7.8,Math.min(8.6,camera.position.z));}}
  const orb=scene.getObjectByName('star-orb');if(orb){orb.rotation.y+=dt*.19;orb.rotation.x+=dt*.08;}
  group.children.forEach((child,i)=>{if(child.material===materials.emissive&&child.geometry?.type==='BoxGeometry')child.material.emissiveIntensity=1.8+Math.sin(time*1.4+i)*.55;});
  booths.forEach((b,i)=>{b.light.material.emissiveIntensity=1.15+Math.sin(time*1.5+i*.7)*.3;});
  renderer.render(scene,camera);
}
frame();
window.addEventListener('pagehide',()=>closeBooth(false),{once:true});
