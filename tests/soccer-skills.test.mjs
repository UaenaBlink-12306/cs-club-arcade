import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html=readFileSync(new URL('../public/soccer-skills/index.html',import.meta.url),'utf8')
const engine=html.split('// BEGIN SOCCER ENGINE')[1].split('// END SOCCER ENGINE')[0]
const {SoccerMatch,NATIONS,FIELD,distance}=new Function(engine+';return {SoccerMatch,NATIONS,FIELD,distance};')()


function uiHarness(html){
  const elements=new Map(),timers=new Map();let tid=0,animation=null;const draws=[];
  const drawing=new Proxy({}, {get:(_,key)=>key==='canvas'?{}:((...args)=>{
    if(args.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Nonfinite canvas '+String(key));
    if((key==='arc'||key==='ellipse')&&args[2]<0)throw Error('Negative radius');
    draws.push({method:key,args});
  }),set:()=>true});
  function element(id,dataset={}){
    const classes=new Set();return {id,dataset,textContent:'',style:{},title:'',tagName:'BUTTON',handlers:{},
      classList:{toggle:(key,on)=>{if(on)classes.add(key);else classes.delete(key);},add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)},
      addEventListener(type,cb){this.handlers[type]=cb;},
      focus(){this.focused=true;},width:1100,height:620,getContext:()=>drawing,
      getBoundingClientRect:()=>({left:0,top:0,width:1100,height:620}),
      setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;}
    };
  }
  for(const m of html.matchAll(/\bid="([^"]+)"/g))elements.set(m[1],element(m[1]));
  const go=[...html.matchAll(/data-go="([^"]+)"/g)].map((m,i)=>element('go'+i,{go:m[1]}));
  const penalties=[0,1,2].map(n=>element('penalty'+n,{penalty:String(n)}));
  const document={hidden:false,handlers:{},getElementById:id=>elements.get(id),
    querySelector:selector=>{if(!selector.startsWith('#'))throw Error('Unmocked selector '+selector);return elements.get(selector.slice(1));},
    querySelectorAll:selector=>selector==='[data-go]'?go:selector==='[data-penalty]'?penalties:[],
    addEventListener(type,cb){this.handlers[type]=cb;}};
  const window={handlers:{},addEventListener(type,cb){this.handlers[type]=cb;}};
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const app=new Function('document','window','setTimeout','clearTimeout','requestAnimationFrame',
    script+'\nreturn {get match(){return match},get view(){return view},get round(){return round},get champion(){return champion},setTeam,startMatch,syncMatch,continueCup,frame,camera,render,point};'
  )(document,window,(fn)=>{timers.set(++tid,fn);return tid;},id=>timers.delete(id),fn=>{animation=fn;});
  return {app,elements,go,penalties,document,window,draws,flush(){let n=0;while(timers.size&&n++<50){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}},
    tick(t){animation(t);},click(id){elements.get(id).onclick();},
    chooseMode(mode){go.find(e=>e.dataset.go===mode).onclick();}};
}

test('all 22 players move during play, including the active player and both teams',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),before=m.snapshot();
 for(let i=0;i<600;i++){if(m.phase==='restart')m.takeRestart();m.step(1/60);}
 assert.equal(m.players.length,22);
 for(let team=0;team<2;team++)assert.ok(m.players.filter(p=>p.team===team&&distance(p,before.players[p.id])>10).length>=8);
 assert.ok(distance(m.players[before.active],before.players[before.active])>10);
 assert.ok(m.passes[0]+m.passes[1]>0);assert.ok(m.shots[0]+m.shots[1]>0);
});
test('active player responds to directional input and dribbles the owned ball',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner,start={x:p.x,y:p.y};
 m.protection=3;
 for(let i=0;i<30;i++)m.step(1/60,{dx:0,dy:1});
 assert.ok(p.y-start.y>65);assert.equal(m.ball.owner,p.id);assert.ok(distance(p,m.ball)<17);
});
test('a short pass travels normally and can be received by a teammate',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner,receiver=m.players[6];
 for(const q of m.players)if(q!==p){q.x=950;q.y=110;}
 receiver.x=470;receiver.y=318;
 assert.ok(m.kick(p,receiver,.3,false));
 let received=false;
 for(let i=0;i<120;i++){m.step(1/60);if(m.owner?.team===0&&m.owner.id!==p.id){received=true;break;}if(m.phase!=='playing')break;}
 assert.ok(received,'short pass should reach a teammate');assert.equal(m.restarts,0);
});
test('horizontal shot crosses the actual goal line once without becoming a corner',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner;
 for(const q of m.players)if(q!==p){q.x=950;q.y=110;}
 m.kick(p,{x:FIELD.left-20,y:FIELD.cy},1,false);
 for(let i=0;i<120&&m.phase==='playing';i++)m.step(1/60);
 assert.equal(m.phase,'goal');assert.deepEqual(m.score,[1,0]);assert.equal(m.restarts,0);
 for(let i=0;i<100;i++)m.step(1/60);
 assert.deepEqual(m.score,[1,0]);assert.equal(m.phase,'replay');
 m.skipReplay();assert.equal(m.phase,'playing');assert.equal(m.owner.team,1);
});
test('ball physics use elapsed seconds and remain stable at 30/60/120 Hz',()=>{
 const positions=[];
 for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);
  for(const q of m.players){q.x=950;q.y=100;}
  Object.assign(m.ball,{owner:null,x:500,y:318,vx:-140,vy:0,vz:0,z:0,lock:2});
  for(let i=0;i<hz/2;i++)m.step(1/hz);
  assert.equal(m.phase,'playing');assert.equal(m.restarts,0);positions.push(m.ball.x);
 }
 assert.ok(Math.max(...positions)-Math.min(...positions)<2);
});
test('corners position a taker correctly and wait for human release',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);
 Object.assign(m.ball,{owner:null,x:FIELD.left-1,y:FIELD.top+10,z:0,lastTouch:1});
 m.checkBoundary({x:FIELD.left+10,y:FIELD.top+10,z:0});
 assert.equal(m.restart.type,'Corner Kick');assert.equal(m.restart.team,0);
 m.takeRestart();const p=m.owner,spot={x:p.x,y:p.y};
 assert.equal(p.x,FIELD.left+20);assert.equal(p.y,FIELD.top+20);
 for(let i=0;i<180;i++)m.step(1/60);
 assert.equal(m.phase,'playing');assert.equal(m.ball.owner,p.id);assert.ok(distance(p,spot)<.01);
 for(let i=0;i<30;i++)m.step(1/60,{dx:1,dy:1});
 assert.ok(distance(p,spot)<.01);
 assert.ok(m.kick(p,{x:p.x+180,y:p.y+180},.5,true));assert.equal(m.ball.owner,null);assert.equal(m.setPiece,null);
});
test('touchline exit, attacking miss, and defender touch produce different restarts',()=>{
 for(const fixture of [
  {x:500,y:FIELD.top-2,last:0,type:'Throw-in',team:1},
  {x:FIELD.left-2,y:120,last:0,type:'Goal Kick',team:1},
  {x:FIELD.left-2,y:120,last:1,type:'Corner Kick',team:0}]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);
  Object.assign(m.ball,{owner:null,x:fixture.x,y:fixture.y,z:0,lastTouch:fixture.last});
  m.checkBoundary({x:500,y:318,z:0});
  assert.equal(m.restart.type,fixture.type);assert.equal(m.restart.team,fixture.team);
 }
});
test('defenders win possession rather than simply following stationary dots',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner,defender=m.players[20];
 defender.x=p.x+15;defender.y=p.y;m.protection=0;m.random=()=>0;
 m.step(1/60,{dx:0,dy:0});
 assert.equal(m.owner.team,1);assert.equal(m.tackles,1);
});
test('goalkeepers claim a reachable shot and record a save',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),keeper=m.players[11];
 Object.assign(m.ball,{owner:null,x:keeper.x+10,y:keeper.y,z:0,vx:-150,vy:0,vz:0,lastTouch:0,lock:0});
 m.step(1/60);assert.equal(m.owner.id,keeper.id);assert.equal(m.saves[1],1);
});
test('a draw goes to penalties; normal wins and losses use actual scores',()=>{
 const draw=new SoccerMatch(NATIONS[0],NATIONS[2]);draw.finish();assert.equal(draw.phase,'penalties');assert.equal(draw.winner(),null);
 // Home places every shot away from a fixed keeper; player saves away kicks.
 draw.random=()=>0;
 for(let i=0;i<10&&draw.phase==='penalties';i++)draw.takePenalty(draw.penalties.turn===0?1:0);
 assert.equal(draw.phase,'full');assert.equal(draw.winner(),0);assert.ok(draw.penalties.done);
 const win=new SoccerMatch(NATIONS[0],NATIONS[2]);win.score=[2,1];win.finish();assert.equal(win.winner(),0);
 const loss=new SoccerMatch(NATIONS[0],NATIONS[2]);loss.score=[0,2];loss.finish();assert.equal(loss.winner(),1);
});
test('penalty sudden death requires both sides to take equal attempts',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.finish();m.random=()=>0;
 for(let i=0;i<10;i++)m.takePenalty(1);
 assert.equal(m.phase,'penalties');assert.deepEqual(m.penalties.score,[5,5]);
 m.takePenalty(1);assert.equal(m.phase,'penalties');
 m.takePenalty(0);assert.equal(m.phase,'full');assert.equal(m.winner(),0);
});
test('halftime swaps directions and practice never ends on the match clock',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.minute=44.999;m.step(1/60);
 assert.equal(m.phase,'half');m.resumeHalf();assert.equal(m.direction(0),1);assert.equal(m.phase,'playing');
 const practice=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');practice.minute=100;practice.step(1/60);
 assert.equal(practice.phase,'playing');assert.ok(practice.minute>100);
});
test('selected nation propagates through selection, loading, HUD and results for all nations',()=>{
 for(let n=0;n<NATIONS.length;n++){
  const h=uiHarness(html);h.chooseMode('cup');
  for(let i=0;i<n;i++)h.click('next');
  assert.equal(h.elements.get('teamName').textContent,NATIONS[n].name);
  h.click('toTrophy');h.click('startMatch');
  assert.equal(h.elements.get('loadingTitle').textContent,NATIONS[n].name);
  assert.equal(h.elements.get('loadingFlag').textContent,NATIONS[n].flag);
  h.flush();
  assert.equal(h.elements.get('homeName').textContent,NATIONS[n].code);
  assert.equal(h.elements.get('homeFlag').textContent,NATIONS[n].flag);
  h.app.match.score=[2,1];h.app.match.finish();h.app.syncMatch();
  assert.ok(h.elements.get('resultMsg').textContent.includes(NATIONS[n].name+' wins!'));
  assert.ok(h.elements.get('resultScore').textContent.startsWith(NATIONS[n].name));
 }
});
test('practice skips cup setup; cup advances QF to SF to final and a loss resets the run',()=>{
 const practice=uiHarness(html);practice.chooseMode('practice');practice.click('toTrophy');
 assert.equal(practice.app.view,'loading');practice.flush();assert.equal(practice.app.match.mode,'practice');
 const cup=uiHarness(html);cup.chooseMode('cup');cup.click('toTrophy');
 for(let round=0;round<3;round++){
  assert.equal(cup.app.round,round);cup.click('startMatch');cup.flush();
  cup.app.match.score=[1,0];cup.app.match.finish();cup.app.syncMatch();cup.click('continueCup');
 }
 assert.ok(cup.app.champion);assert.equal(cup.elements.get('trophyTitle').textContent,'Cup champions!');
 cup.click('startMatch');cup.flush();cup.app.match.score=[0,1];cup.app.match.finish();cup.app.syncMatch();
 assert.ok(!cup.elements.get('resultMsg').textContent.startsWith('Congratulations'));
 cup.click('continueCup');assert.equal(cup.app.round,0);assert.equal(cup.app.champion,false);
});
test('pointer hold moves the active player; release kicks; cancellation does not kick',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const c=h.elements.get('game'),m=h.app.match,p=m.owner;m.protection=4;
 const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,preventDefault(){}});
 const start={x:p.x,y:p.y};
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x,p.y+80));
 for(let i=1;i<=30;i++)h.tick(i*1000/60);
 assert.ok(p.y-start.y>50);
 c.handlers.pointerup(event(start.x,start.y+80));assert.equal(m.ball.owner,null);assert.ok(m.ball.vy>0);
 m.giveBall(p);
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x-100,p.y));
 c.handlers.pointercancel(event(p.x-100,p.y));assert.equal(m.ball.owner,p.id);
});
test('rendering, pause, resume and replay do not advance the paused simulation',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('toTrophy');h.click('startMatch');h.flush();
 h.tick(16);h.tick(32);h.click('menuBtn');const minute=h.app.match.minute;
 h.tick(100);h.tick(200);assert.equal(h.app.match.minute,minute);
 h.click('resumePause');h.tick(300);assert.ok(h.app.match.minute>minute);
 h.app.match.scorer=0;h.app.match.phase='replay';h.app.match.replayFrames=[h.app.match.snapshot()];h.tick(400);
 h.click('skipReplay');assert.equal(h.app.match.phase,'playing');
});
test('multiplayer is visibly unavailable and cannot start a fake cup',()=>{
 const h=uiHarness(html);h.chooseMode('multi');assert.equal(h.app.view,'menu');assert.equal(h.app.match,null);
 assert.ok(/data-go="multi" disabled aria-disabled="true"/.test(html));
});

test('a 0–0 regulation finish never declares the selected team the winner',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('toTrophy');h.click('startMatch');h.flush();
 h.app.match.period=2;h.app.match.minute=89.999;h.app.match.step(1/60);h.app.syncMatch();
 assert.equal(h.app.view,'penalties');assert.equal(h.app.match.winner(),null);
 assert.ok(!h.elements.get('resultMsg').textContent.includes('Congratulations'));
});
test('pause menu restarts a match and practice can finish without a timed result',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 h.app.match.score=[3,2];h.click('menuBtn');h.click('restartMatch');h.flush();
 assert.deepEqual(h.app.match.score,[0,0]);assert.equal(h.app.match.mode,'practice');
 h.click('menuBtn');h.click('finishPractice');assert.equal(h.app.view,'full');h.click('continueCup');assert.equal(h.app.view,'team');
});
test('keyboard passing and shooting use possession rather than teleporting the ball',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const m=h.app.match,key=value=>({key:value,target:{tagName:'CANVAS'},repeat:false,preventDefault(){}});
 h.window.handlers.keydown(key('e'));assert.equal(m.ball.owner,null);assert.equal(m.passes[0],1);
 const p=m.players[9];m.giveBall(p);h.window.handlers.keydown(key(' '));
 assert.equal(m.ball.owner,null);assert.equal(m.shots[0],1);
});
test('pointer coordinates remain correct on a scaled touch canvas',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const c=h.elements.get('game'),p=h.app.match.owner;
 c.getBoundingClientRect=()=>({left:10,top:100,width:550,height:310});
 const event=(x,y)=>({clientX:10+x/2,clientY:100+y/2,pointerId:8,preventDefault(){}});
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x,p.y+100));c.handlers.pointerup(event(p.x,p.y+100));
 assert.ok(h.app.match.ball.vy>0);
 // A vertical screen drag can have a small world-x component on the tapered pitch.
 const from=h.app.camera.project(p.x,p.y),v=h.app.match.ball;
 const target=h.app.camera.project(p.x+v.vx*.1,p.y+v.vy*.1);
 assert.ok(Math.abs(target.x-from.x)<1);assert.ok(target.y>from.y);
});
test('six seeded matches finish without nonfinite coordinates or repeated-goal loops',()=>{
 for(let seed=1;seed<=6;seed++){
  const m=new SoccerMatch(NATIONS[seed%6],NATIONS[(seed+1)%6],'cup',seed);
  for(let frame=0;frame<60*300&&m.phase!=='full';frame++){
   if(m.phase==='half')m.resumeHalf();
   if(m.phase==='restart')m.takeRestart();
   if(m.setPiece&&m.owner?.team===0)m.kick(m.owner,m.bestPass(m.owner),.6,true);
   if(m.phase==='penalties')m.takePenalty(frame%3);
   m.step(1/60);
   assert.ok(m.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
   assert.ok(Number.isFinite(m.ball.x)&&Number.isFinite(m.ball.y));
  }
  assert.equal(m.phase,'full');assert.equal(m.minute,90);assert.ok(m.winner()!==null);
  assert.ok(m.tackles>0);assert.ok(m.passes[0]+m.passes[1]>0);
 }
});

test('shootout labels wait for both fifth kicks and stay in sudden death during its reply kick',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('toTrophy');h.click('startMatch');h.flush();
 const m=h.app.match;m.finish();m.random=()=>0;h.app.syncMatch();
 for(let kick=0;kick<9;kick++){
  assert.equal(h.elements.get('penaltyPrompt').textContent,
   'Round '+(Math.floor(kick/2)+1)+' · '+(kick%2===0?'Choose where to shoot':'Choose where to dive'));
  h.penalties[1].onclick();
 }
 assert.deepEqual(m.penalties.taken,[5,4]);
 assert.equal(h.elements.get('penaltyPrompt').textContent,'Round 5 · Choose where to dive');
 h.penalties[1].onclick();
 assert.deepEqual(m.penalties.taken,[5,5]);assert.deepEqual(m.penalties.score,[5,5]);
 assert.equal(h.elements.get('penaltyPrompt').textContent,'Sudden death · Choose where to shoot');
 h.penalties[1].onclick();
 assert.deepEqual(m.penalties.score,[6,5]);
 assert.equal(h.elements.get('penaltyPrompt').textContent,'Sudden death · Choose where to dive');
 h.penalties[0].onclick();assert.equal(h.app.view,'full');assert.equal(m.winner(),0);

 const regulation=uiHarness(html);regulation.chooseMode('cup');regulation.click('toTrophy');regulation.click('startMatch');regulation.flush();
 regulation.app.match.finish();regulation.app.match.random=()=>0;regulation.app.syncMatch();
 for(let kick=0;kick<9;kick++)regulation.penalties[1].onclick();
 assert.equal(regulation.elements.get('penaltyPrompt').textContent,'Round 5 · Choose where to dive');
 regulation.penalties[0].onclick();
 assert.deepEqual(regulation.app.match.penalties.taken,[5,5]);
 assert.equal(regulation.app.view,'full');assert.ok(regulation.elements.get('penalties').classList.contains('hidden'));
});

test('camera ground projection round-trips at both ends and across landscape and portrait viewports',()=>{
 const cameraCode=html.split('// BEGIN SOCCER CAMERA')[1].split('// END SOCCER CAMERA')[0];
 const {ActionCamera}=new Function('clamp',cameraCode+';return {ActionCamera};')((v,a,b)=>Math.max(a,Math.min(b,v)));
 const c=new ActionCamera();
 for(const size of [[1100,620],[1100,2380],[1100,510]])for(const cx of [125,550,975])for(const zoom of [1.3,1.58,2.25]){
  c.resize(...size);c.x=cx;c.y=318;c.zoom=zoom;
  for(const x of [68,200,550,900,1032])for(const y of [88,318,548]){
   const screen=c.project(x,y),world=c.unproject(screen.x,screen.y);
   assert.ok(Math.abs(world.x-x)<.00001);assert.ok(Math.abs(world.y-y)<.00001);
  }
 }
 c.resize(1100,620);c.x=550;c.zoom=1.58;
 assert.ok(c.project(1032,548).x-c.project(68,548).x>c.project(1032,88).x-c.project(68,88).x,
  'near touchline must appear wider than the far touchline');
});
test('camera pans smoothly to the action, widens for fast passes and follows replay snapshots',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const c=h.app.camera,m=h.app.match,before=c.x,normalZoom=c.zoom,shot=m.snapshot();
 shot.ball.x=900;shot.ball.vx=500;shot.active=9;shot.players[9].x=870;
 c.update(shot,1/60);assert.ok(c.x>before&&c.x<900);assert.ok(c.zoom<normalZoom);
 for(let i=0;i<120;i++)c.update(shot,1/60);
 assert.ok(c.x>900);assert.ok(c.project(shot.ball.x,shot.ball.y).x<1100);
 const pan=c.x;
 m.phase='replay';m.replayTime=0;
 const replay=m.snapshot();replay.ball.x=180;replay.players[replay.active].x=190;
 m.replayFrames=[replay];
 h.app.render(.1);assert.ok(c.x<pan,'replay tracks the recorded ball, not the live ball');
 for(let i=0;i<120;i++)h.app.render(1/60);
 const p=c.project(180,318);assert.ok(p.x>0&&p.x<1100);
});
test('stationary touch does not create a kick when the camera moves beneath it',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const c=h.elements.get('game'),m=h.app.match,p=m.owner;
 const down={clientX:550,clientY:320,pointerId:3,preventDefault(){}};
 c.handlers.pointerdown(down);
 h.app.camera.x+=170;h.app.camera.zoom=1.4;
 c.handlers.pointerup(down);
 assert.equal(m.owner.id,p.id);assert.equal(m.passes[0],0);assert.equal(m.shots[0],0);
});
test('projected touch selection picks the intended player after camera movement',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const c=h.elements.get('game'),m=h.app.match;m.ball.owner=null;
 const p=m.players[6];m.active=9;
 h.app.camera.x=400;h.app.camera.y=340;h.app.camera.zoom=1.8;
 const q=h.app.camera.project(p.x,p.y);
 c.handlers.pointerdown({clientX:q.x,clientY:q.y,pointerId:4,preventDefault(){}});
 assert.equal(m.active,p.id);
 c.handlers.pointercancel({pointerId:4});
});
test('canvas fills resized desktop and touch viewports without changing simulation coordinates',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const canvas=h.elements.get('game'),before=h.app.match.snapshot();
 for(const rect of [{width:1440,height:810},{width:390,height:844},{width:844,height:390}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.app.render(1/60);
  assert.equal(canvas.width,rect.width);assert.equal(canvas.height,rect.height);
  assert.ok(Math.abs(h.app.camera.height-1100*rect.height/rect.width)<.0001);
 }
 assert.deepEqual(h.app.match.snapshot(),before);
 assert.ok(h.draws.some(d=>d.method==='scale'),'upright player sprites use projected depth scale');
 assert.ok(h.draws.some(d=>d.method==='lineTo'),'pitch and articulated limbs are rendered');
});
test('restarts and halftime remain controllable under the new camera',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const m=h.app.match;
 m.phase='restart';m.restart={type:'Corner Kick',team:0,x:88,y:108};h.app.syncMatch();h.click('takeCorner');
 for(let i=0;i<90;i++)h.app.render(1/60);
 const projected=h.app.camera.project(m.owner.x,m.owner.y);
 assert.ok(projected.x>0&&projected.x<1100&&projected.y>0&&projected.y<620);
 const ball=m.ball.owner;
 const event=(x,y)=>({clientX:x,clientY:y,pointerId:5,preventDefault(){}});
 const canvas=h.elements.get('game');
 canvas.handlers.pointerdown(event(projected.x,projected.y));
 canvas.handlers.pointerup(event(projected.x+120,projected.y+80));
 assert.equal(m.ball.owner,null);assert.ok(m.ball.vx>0&&m.ball.vy>0);assert.equal(m.setPiece,null);
 m.phase='half';h.app.syncMatch();h.click('resume');h.app.render(1/60);
 assert.equal(m.direction(0),1);assert.equal(m.phase,'playing');assert.ok(Number.isFinite(h.app.camera.x));
});

test('portrait turns the long pitch axis upright and fills the 500 by 739 viewport',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.click('toTrophy');h.flush();
 const canvas=h.elements.get('game');
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:739});
 h.app.render(1/60);
 const c=h.app.camera,top=c.project(68,318),bottom=c.project(1032,318);
 assert.ok(c.portrait);assert.ok(Math.abs(top.x-bottom.x)<.001);
 assert.ok((bottom.y-top.y)/c.height>.85,'long axis should fill at least 85% of portrait height');
 const m=h.app.match,p=m.owner,origin=c.project(p.x,p.y);
 const event=(x,y)=>({clientX:x*500/1100,clientY:y*500/1100,pointerType:'touch',pointerId:8,preventDefault(){}});
 canvas.handlers.pointerdown(event(origin.x,origin.y));
 canvas.handlers.pointerup(event(origin.x,origin.y-120));
 assert.ok(m.ball.vx<0,'upward portrait drag attacks the left world goal');
 assert.ok(Math.abs(m.ball.vy)<.001);
 assert.ok(h.elements.get('hint').textContent.includes('Release to pass or shoot'));
 assert.ok(!h.elements.get('hint').textContent.includes('WASD'));
});
test('touch guidance is selected before first input and landscape returns to horizontal pitch',()=>{
 const h=uiHarness(html);h.window.matchMedia=()=>({matches:true});
 h.chooseMode('practice');h.click('toTrophy');h.flush();
 assert.ok(!h.elements.get('hint').textContent.includes('WASD'));
 const canvas=h.elements.get('game');
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:739});h.app.render(1/60);
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720});h.app.render(1/60);
 const c=h.app.camera,a=c.project(68,318),b=c.project(1032,318);
 assert.equal(c.portrait,false);assert.ok(Math.abs(a.y-b.y)<.001);assert.ok(b.x>a.x);
 assert.ok(c.zoom<1.8);
 const desktop=uiHarness(html);desktop.chooseMode('practice');desktop.click('toTrophy');desktop.flush();
 assert.ok(desktop.elements.get('hint').textContent.includes('WASD'));
});
