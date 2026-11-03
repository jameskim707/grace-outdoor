// 분수광장 모듈 시험 (Node 에서 실행, 그래픽 장치 없이 가능):  node test/plaza.test.mjs
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import createPlazaModule, {collides, envFor, MODULE_INFO} from '../plaza.module.js';

let pass=0;const ok=(name)=>{pass++;console.log('  ✔',name)};
const BUDGET={triangles:20000,drawCalls:60};
console.log(`Three.js r${THREE.REVISION} · 모듈 ${MODULE_INFO.id} v${MODULE_INFO.version} (interface ${MODULE_INFO.interface})`);

const scene=new THREE.Scene();
const OFFSET={x:0,z:44};
const m=createPlazaModule();
const root=await m.init({THREE,scene,quality:'mid',offset:OFFSET,t01:0.5});

// 1) 인터페이스
for(const fn of['init','update','setTimeOfDay','setLightingState','setQuality','getColliders','getAnchors','getStats','onEnter','onExit','dispose'])assert.equal(typeof m[fn],'function',fn);
assert.deepEqual(m.footprint,{type:'circle',cx:0,cz:0,r:16});assert.ok(root.isGroup);assert.equal(scene.children.length,1);assert.equal(root.position.z,44);ok('인터페이스 함수와 footprint, 배치 오프셋');

// 2) 성능 예산 (품질 3단계 모두)
for(const q of['low','mid','high']){m.setQuality(q);const s=m.getStats();
  assert.ok(s.triangles<=BUDGET.triangles,`${q} 삼각형 ${s.triangles}`);assert.ok(s.drawCalls<=BUDGET.drawCalls,`${q} 그리기 호출 ${s.drawCalls}`);
  console.log(`     ${q.padEnd(4)} 삼각형 ${String(s.triangles).padStart(6)} · 그리기 호출 ${s.drawCalls} · 입자 ${s.particles}`)}
assert.ok(m.setQuality('low')||true);const pl=m.getStats().particles;m.setQuality('high');assert.ok(m.getStats().particles>pl*2.5);m.setQuality('mid');ok('성능 예산 이내(삼각형 ≤ 20000, 호출 ≤ 60) · 품질에 따라 입자 수 변화');

// 3) 점유 영역: 모든 충돌체가 반지름 16 안에 있어야 한다 (오프셋 적용 후 좌표 기준)
const cols=m.getColliders();assert.ok(cols.length>=20);
for(const c of cols){const d=Math.hypot(c.x-OFFSET.x,c.z-OFFSET.z),ext=c.type==='circle'?c.r:Math.hypot(c.w,c.d)/2;assert.ok(d+ext<=16.001,`영역 밖 충돌체 ${JSON.stringify(c)} d=${d.toFixed(2)}`)}
ok(`충돌체 ${cols.length}개 모두 반지름 16 점유 영역 안`);

// 4) 길 확보: 4갈래 길의 중심선과 폭 안쪽이 막히지 않아야 한다
const an=m.getAnchors();for(const k of['to_church','to_library','to_garden','to_music'])assert.ok(an[k]&&an[k].width>=3.2,k);
let blockedPath=0;
for(const k of['to_church','to_library','to_garden','to_music']){const a=an[k];
  for(let r=10.5;r<=16;r+=.25)for(let w=-1.2;w<=1.2;w+=.4){const x=OFFSET.x+a.dirX*r+(a.dirZ?w:0),z=OFFSET.z+a.dirZ*r+(a.dirX?w:0);if(collides(cols,x,z,.3))blockedPath++}}
assert.equal(blockedPath,0,`길이 막힌 지점 ${blockedPath}곳`);ok('4갈래 길(폭 ±1.2m, 반경 0.3m 방문자)이 모두 열려 있음');

// 5) 서로 오갈 수 있는지: 격자 탐색(0.25m)으로 네 입구가 모두 연결되는지
function reachable(from,to){const S=.25,R=16,N=Math.round(2*R/S),key=(i,j)=>i*(N+1)+j,ix=x=>Math.round((x-OFFSET.x+R)/S),iz=z=>Math.round((z-OFFSET.z+R)/S);
  const seen=new Uint8Array((N+1)*(N+1)),q=[[ix(from.x-from.dirX*.5),iz(from.z-from.dirZ*.5)]];const goal=[ix(to.x-to.dirX*.5),iz(to.z-to.dirZ*.5)];
  while(q.length){const[i,j]=q.pop();if(i<0||j<0||i>N||j>N||seen[key(i,j)])continue;const x=OFFSET.x-R+i*S,z=OFFSET.z-R+j*S;if(Math.hypot(x-OFFSET.x,z-OFFSET.z)>R-.2||collides(cols,x,z,.3))continue;seen[key(i,j)]=1;if(i===goal[0]&&j===goal[1])return true;q.push([i+1,j],[i-1,j],[i,j+1],[i,j-1])}return false}
const names=['to_church','to_library','to_garden','to_music'];
for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)assert.ok(reachable(an[names[a]],an[names[b]]),`${names[a]} → ${names[b]} 연결 안 됨`);
ok('네 입구(교회·도서관·정원·음악당) 사이를 모두 걸어서 오갈 수 있음');

// 6) 낮·밤
let dayLamp=1,nightLamp=0;for(let t=0;t<=1.0001;t+=.05){const E=m.setTimeOfDay(t);assert.ok(E.sky.startsWith('#'));assert.ok(E.day>=0&&E.day<=1);}
dayLamp=m.setTimeOfDay(.5).lamps;nightLamp=m.setTimeOfDay(0).lamps;assert.ok(dayLamp<.02&&nightLamp>.98,`가로등 낮 ${dayLamp} 밤 ${nightLamp}`);
assert.ok(envFor(.5).sun.intensity>envFor(0).sun.intensity*2);m.setLightingState('sunset');m.setLightingState('night');m.setLightingState('day');ok('낮·밤 전환(가로등 낮 꺼짐/밤 켜짐), 라이라 초안 호환 함수');

// 7) 600프레임 갱신 + 물줄기 범위
m.setTimeOfDay(.5);let maxY=0,maxR=0,minY=9;const P=root.children.find(o=>o.isPoints);
for(let f=0;f<600;f++){m.update(1/60);}
const pos=P.geometry.attributes.position.array,n=m.getStats().particles;
for(let i=0;i<n;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];assert.ok(Number.isFinite(x+y+z));maxY=Math.max(maxY,y);minY=Math.min(minY,y);maxR=Math.max(maxR,Math.hypot(x,z))}
assert.ok(maxY<6.2&&minY>.4&&maxR<3.3,`물줄기 범위 y ${minY.toFixed(2)}~${maxY.toFixed(2)} r ${maxR.toFixed(2)}`);ok(`물줄기가 분수대 안에 머묾(높이 ${minY.toFixed(1)}~${maxY.toFixed(1)}m, 반경 ≤ ${maxR.toFixed(1)}m)`);
m.onExit();const before=pos[1];m.update(1);assert.equal(pos[1],before);m.onEnter();ok('onExit 중에는 갱신 멈춤, onEnter 로 재개');

// 8) 두 개를 동시에 올려도 서로 간섭 없음 + 정리 함수
const m2=createPlazaModule();await m2.init({THREE,scene,quality:'low',offset:{x:100,z:0}});assert.equal(scene.children.length,2);assert.equal(m2.getColliders()[0].x,100);ok('두 개를 동시에 올려도 전역 상태를 공유하지 않음');
let disposed={g:0,m:0};const og=THREE.BufferGeometry.prototype.dispose,om=THREE.Material.prototype.dispose;
THREE.BufferGeometry.prototype.dispose=function(){disposed.g++;return og.call(this)};THREE.Material.prototype.dispose=function(){disposed.m++;return om.call(this)};
m.dispose();m.dispose();assert.equal(scene.children.length,1);assert.equal(m.root,null);assert.equal(m.getStats().triangles,0);assert.ok(disposed.g>20&&disposed.m>20,`해제 수 지오메트리 ${disposed.g} 재질 ${disposed.m}`);
THREE.BufferGeometry.prototype.dispose=og;THREE.Material.prototype.dispose=om;m.update(1);ok(`dispose: 씬에서 제거, 지오메트리 ${disposed.g}개·재질 ${disposed.m}개 해제, 두 번 호출해도 안전`);
m2.dispose();

// 9) 잘못된 사용
await assert.rejects(()=>createPlazaModule().init({}),/THREE/);ok('host.THREE 가 없으면 분명한 오류');

console.log(`\nPASS: ${pass}개 항목 통과`);
