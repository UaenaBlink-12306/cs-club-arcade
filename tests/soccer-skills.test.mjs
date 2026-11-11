import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html=readFileSync(new URL('../public/soccer-skills/index.html',import.meta.url),'utf8')
const engine=html.split('// BEGIN SOCCER ENGINE')[1].split('// END SOCCER ENGINE')[0]
const {SoccerMatch,NATIONS,FIELD,distance}=new Function(engine+';return {SoccerMatch,NATIONS,FIELD,distance};')()


function uiHarness(html){
  const elements=new Map(),timers=new Map();let tid=0,animation=null;const draws=[];
  const drawing=new Proxy({}, {get:(_,key)=>key==='canvas'?{}:key==='createLinearGradient'?(()=>({addColorStop(){}})):((...args)=>{
    if(args.some(v=>typeof v==='number'&&!Number.isFinite(v)))throw Error('Nonfinite canvas '+String(key));
    if((key==='arc'||key==='ellipse')&&args[2]<0)throw Error('Negative radius');
    draws.push({method:key,args});
  }),set:()=>true});
  function element(id,dataset={}){
    const classes=new Set(),attributes=new Map();return {id,dataset,textContent:'',style:{},title:'',tagName:'BUTTON',handlers:{},
      classList:{toggle:(key,on)=>{if(on)classes.add(key);else classes.delete(key);},add:key=>classes.add(key),remove:key=>classes.delete(key),contains:key=>classes.has(key)},
      addEventListener(type,cb){this.handlers[type]=cb;},
      setAttribute(name,value){attributes.set(name,String(value));},getAttribute(name){return attributes.get(name)??null;},
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
    script+'\nreturn {get match(){return match},get view(){return view},get round(){return round},get champion(){return champion},setTeam,startMatch,syncMatch,continueCup,frame,camera,render,point,playerPose,playerMesh,playerMarkers,input,bracketMarkup,cupFinalists,opponentFor,replaySample};'
  )(document,window,(fn)=>{timers.set(++tid,fn);return tid;},id=>timers.delete(id),fn=>{animation=fn;});
  return {app,elements,go,penalties,document,window,draws,flush(){let n=0;while(timers.size&&n++<50){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}},
    tick(t){animation(t);},click(id){elements.get(id).onclick();},
    chooseMode(mode){go.find(e=>e.dataset.go===mode).onclick();}};
}

// Legacy interaction checks wait for the intentional wind-up before checking flight.
function advanceToContact(m){
 let frames=0;
 while(m.pendingKick&&frames++<30)m.step(Math.min(1/120,m.pendingKick.remaining),{dx:0,dy:0,teams:[{dx:0,dy:0},{dx:0,dy:0}]});
 assert.ok(!m.pendingKick,'contact should complete within the bounded wind-up');
}

test('all 22 players move during play, including the active player and both teams',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),before=m.snapshot();
 for(let i=0;i<900;i++){if(m.phase==='restart')m.takeRestart();m.step(1/60);}
 assert.equal(m.players.length,22);
 for(let team=0;team<2;team++)assert.ok(m.players.filter(p=>p.team===team&&distance(p,before.players[p.id])>10).length>=8);
 assert.ok(distance(m.players[before.active],before.players[before.active])>10);
 assert.ok(m.passes[0]+m.passes[1]>0);
});
test('active player responds to directional input and dribbles the owned ball',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner,start={x:p.x,y:p.y};
 m.protection=3;
 for(let i=0;i<30;i++)m.step(1/60,{dx:0,dy:1});
 assert.ok(p.y-start.y>55&&p.y-start.y<65);assert.equal(m.ball.owner,p.id);assert.ok(distance(p,m.ball)<17);
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
 assert.ok(m.kick(p,{x:p.x+180,y:p.y+180},.5,true));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.setPiece,null);
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
 m.giveBall(p);defender.x=p.x+15;defender.y=p.y;m.protection=0;m.random=()=>0;
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
  const h=uiHarness(html);
  for(let i=0;i<n;i++)h.click('next');
  assert.equal(h.elements.get('teamName').textContent,NATIONS[n].name);
  h.chooseMode('cup');h.click('startMatch');
  assert.equal(h.elements.get('loadingTitle').textContent,NATIONS[n].name);
  assert.equal(h.elements.get('loadingFlag').textContent,NATIONS[n].flag);
  h.flush();
  assert.equal(h.elements.get('homeName').textContent,NATIONS[n].name);
  assert.equal(h.elements.get('homeFlag').textContent,NATIONS[n].flag);
  h.app.match.score=[2,1];h.app.match.finish();h.app.syncMatch();
  assert.ok(h.elements.get('resultMsg').textContent.includes(NATIONS[n].name+' wins!'));
  assert.ok(h.elements.get('resultScore').textContent.startsWith(NATIONS[n].name));
 }
});
test('practice skips cup setup; cup advances QF to SF to final and a loss resets the run',()=>{
 const practice=uiHarness(html);practice.chooseMode('practice');
 assert.equal(practice.app.view,'loading');practice.flush();assert.equal(practice.app.match.mode,'practice');
 const cup=uiHarness(html);cup.chooseMode('cup');
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
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.elements.get('game'),m=h.app.match,p=m.owner;m.protection=4;
 const event=(x,y)=>({clientX:x,clientY:y,pointerId:1,preventDefault(){}});
 const start={x:p.x,y:p.y};
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x,p.y+80));
 for(let i=1;i<=30;i++)h.tick(i*1000/60);
 assert.ok(p.y-start.y>50);
 c.handlers.pointerup(event(start.x,start.y+80));advanceToContact(m);assert.equal(m.ball.owner,null);assert.ok(m.ball.vy>0);
 m.giveBall(p);
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x-100,p.y));
 c.handlers.pointercancel(event(p.x-100,p.y));assert.equal(m.ball.owner,p.id);
});
test('rendering, pause, resume and replay do not advance the paused simulation',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
 h.tick(16);h.tick(32);h.click('menuBtn');const minute=h.app.match.minute;
 h.tick(100);h.tick(200);assert.equal(h.app.match.minute,minute);
 h.click('resumePause');h.tick(300);assert.ok(h.app.match.minute>minute);
 h.app.match.scorer=0;h.app.match.phase='replay';h.app.match.replayFrames=[h.app.match.snapshot()];h.tick(400);
 h.click('skipReplay');assert.equal(h.app.match.phase,'playing');
});
test('local multiplayer has distinct setup and never claims online play',()=>{
 const h=uiHarness(html);h.chooseMode('multi');assert.equal(h.app.view,'local');assert.equal(h.app.match,null);
 assert.ok(html.includes('LOCAL TWO PLAYER'));assert.ok(html.includes('Keyboard required.'));
 h.click('startLocal');h.flush();assert.equal(h.app.match.mode,'local');
 assert.ok(h.elements.get('hint').textContent.includes('P2: Arrows'));
});

test('a 0–0 regulation finish never declares the selected team the winner',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
 h.app.match.period=2;h.app.match.minute=89.999;h.app.match.step(1/60);h.app.syncMatch();
 assert.equal(h.app.view,'penalties');assert.equal(h.app.match.winner(),null);
 assert.ok(!h.elements.get('resultMsg').textContent.includes('Congratulations'));
});
test('pause menu restarts a match and practice can finish without a timed result',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 h.app.match.score=[3,2];h.click('menuBtn');h.click('restartMatch');h.flush();
 assert.deepEqual(h.app.match.score,[0,0]);assert.equal(h.app.match.mode,'practice');
 h.click('menuBtn');h.click('finishPractice');assert.equal(h.app.view,'full');h.click('continueCup');assert.equal(h.app.view,'menu');
});
test('keyboard passing and shooting use possession rather than teleporting the ball',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,key=value=>({key:value,target:{tagName:'CANVAS'},repeat:false,preventDefault(){}});
 h.window.handlers.keydown(key('e'));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.passes[0],1);
 const p=m.players[9];m.giveBall(p);h.window.handlers.keydown(key(' '));
 advanceToContact(m);assert.equal(m.ball.owner,null);advanceToContact(m);assert.equal(m.shots[0],1);
});
test('pointer coordinates remain correct on a scaled touch canvas',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.elements.get('game'),p=h.app.match.owner;
 c.getBoundingClientRect=()=>({left:10,top:100,width:550,height:310});
 const event=(x,y)=>({clientX:10+x/2,clientY:100+y/2,pointerId:8,preventDefault(){}});
 c.handlers.pointerdown(event(p.x,p.y));c.handlers.pointermove(event(p.x,p.y+100));c.handlers.pointerup(event(p.x,p.y+100));
 advanceToContact(h.app.match);assert.ok(h.app.match.ball.vy>0);
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
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
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

 const regulation=uiHarness(html);regulation.chooseMode('cup');regulation.click('startMatch');regulation.flush();
 regulation.app.match.finish();regulation.app.match.random=()=>0;regulation.app.syncMatch();
 for(let kick=0;kick<9;kick++)regulation.penalties[1].onclick();
 assert.equal(regulation.elements.get('penaltyPrompt').textContent,'Round 5 · Choose where to dive');
 regulation.penalties[0].onclick();
 assert.deepEqual(regulation.app.match.penalties.taken,[5,5]);
 assert.equal(regulation.app.view,'full');assert.ok(regulation.elements.get('penalties').classList.contains('hidden'));
});

test('camera ground projection round-trips at both ends and across landscape and portrait viewports',()=>{
 const cameraCode=html.split('// BEGIN SOCCER CAMERA')[1].split('// END SOCCER CAMERA')[0];
 const {ActionCamera}=new Function('clamp','FIELD',cameraCode+';return {ActionCamera};')((v,a,b)=>Math.max(a,Math.min(b,v)),FIELD);
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
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
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
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.elements.get('game'),m=h.app.match,p=m.owner;
 const down={clientX:550,clientY:320,pointerId:3,preventDefault(){}};
 c.handlers.pointerdown(down);
 h.app.camera.x+=170;h.app.camera.zoom=1.4;
 c.handlers.pointerup(down);
 assert.equal(m.owner.id,p.id);assert.equal(m.passes[0],0);assert.equal(m.shots[0],0);
});
test('projected touch selection picks the intended player after camera movement',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.elements.get('game'),m=h.app.match;m.ball.owner=null;
 const p=m.players[6];m.active=9;
 h.app.camera.x=400;h.app.camera.y=340;h.app.camera.zoom=1.8;
 const q=h.app.camera.project(p.x,p.y);
 c.handlers.pointerdown({clientX:q.x,clientY:q.y,pointerId:4,preventDefault(){}});
 assert.equal(m.active,p.id);
 c.handlers.pointercancel({pointerId:4});
});
test('canvas fills resized desktop and touch viewports without changing simulation coordinates',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const canvas=h.elements.get('game'),before=h.app.match.snapshot();
 for(const rect of [{width:1440,height:810},{width:390,height:844},{width:844,height:390}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.app.render(1/60);
  assert.equal(canvas.width,rect.width);assert.equal(canvas.height,rect.height);
  assert.ok(Math.abs(h.app.camera.height-1100*rect.height/rect.width)<.0001);
 }
 assert.deepEqual(h.app.match.snapshot(),before);
 assert.ok(h.draws.some(d=>d.method==='fill'),'projected player faces are filled');
 assert.ok(h.draws.some(d=>d.method==='lineTo'),'pitch and articulated limbs are rendered');
});
test('restarts and halftime remain controllable under the new camera',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
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
 advanceToContact(m);assert.equal(m.ball.owner,null);assert.ok(m.ball.vx>0&&m.ball.vy>0);assert.equal(m.setPiece,null);
 m.phase='half';h.app.syncMatch();h.click('resume');h.app.render(1/60);
 assert.equal(m.direction(0),1);assert.equal(m.phase,'playing');assert.ok(Number.isFinite(h.app.camera.x));
});

test('portrait turns the long pitch axis upright and fills the 500 by 739 viewport',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
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
 advanceToContact(m);assert.ok(m.ball.vx<0,'upward portrait drag attacks the left world goal');
 assert.ok(Math.abs(m.ball.vy)<.001);
 assert.ok(h.elements.get('hint').textContent.includes('Release to pass or shoot'));
 assert.ok(!h.elements.get('hint').textContent.includes('WASD'));
});
test('touch guidance is selected before first input and landscape returns to horizontal pitch',()=>{
 const h=uiHarness(html);h.window.matchMedia=()=>({matches:true});
 h.chooseMode('practice');h.flush();
 assert.ok(!h.elements.get('hint').textContent.includes('WASD'));
 const canvas=h.elements.get('game');
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:739});h.app.render(1/60);
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720});h.app.render(1/60);
 const c=h.app.camera,a=c.project(68,318),b=c.project(1032,318);
 assert.equal(c.portrait,false);assert.ok(Math.abs(a.y-b.y)<c.height*.6);assert.ok(b.x>a.x);
 assert.ok(c.zoom>4&&c.zoom<4.3);
 const desktop=uiHarness(html);desktop.chooseMode('practice');desktop.flush();
 assert.ok(desktop.elements.get('hint').textContent.includes('WASD'));
});

test('portrait keeps both end lines at the frame edges through keeper tracking, fast balls and replay zoom',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const canvas=h.elements.get('game'),c=h.app.camera,m=h.app.match;
 for(const rect of [{width:500,height:739},{width:390,height:844}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});h.app.render(1/60);
  for(const x of [FIELD.right-18,FIELD.left+18,550,FIELD.right-18]){
   const shot=m.snapshot();shot.ball.x=x;shot.ball.y=318;shot.players[shot.active].x=x;shot.players[shot.active].y=318;
   for(const speed of [0,600,0])for(let frame=0;frame<90;frame++){
    shot.ball.vx=speed;c.update(shot,1/60,false);
    const top=c.project(FIELD.left,318).y/c.height,bottom=c.project(FIELD.right,318).y/c.height;
    assert.ok(top<=.140001,'top runoff must not grow into a blank third');
    assert.ok(bottom>=.899999,'bottom runoff must stay within ten percent');
   }
   const keeper=c.project(x,318);
   assert.ok(keeper.y>c.height*.1&&keeper.y<c.height*.94,'keeper remains visible near either end');
  }
 }
});
test('portrait end-line clamp preserves touch aiming and landscape bounds',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const canvas=h.elements.get('game'),c=h.app.camera,m=h.app.match;
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:739});h.app.render(1/60);
 const shot=m.snapshot();shot.ball.x=1014;shot.players[shot.active].x=1014;
 for(let i=0;i<120;i++)c.update(shot,1/60);
 const origin={x:1014,y:318},p=c.project(origin.x,origin.y),v=c.vector(origin,0,-120),q=c.project(origin.x+v.x,origin.y+v.y);
 assert.ok(v.x<0);assert.ok(Math.abs(q.x-p.x)<.001);assert.ok(Math.abs(q.y-p.y+120)<.001);
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:1440,height:810});h.app.render(1/60);
 c.update(shot,0,false,true);
 assert.equal(c.x,975);assert.equal(c.portrait,false);
});

test('successful kicks and keeper saves have bounded replayable pose envelopes',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner;
 assert.equal(m.snapshot().players[p.id].kick,0);
 assert.ok(m.kick(p,{x:450,y:318},.5));
 assert.ok(m.pendingKick);assert.equal(m.snapshot().players[p.id].kick,0);
 advanceToContact(m);assert.equal(m.snapshot().players[p.id].kick,1);
 m.step(1/60);assert.ok(m.snapshot().players[p.id].kick<1);
 const recorded=m.snapshot();for(let i=0;i<30;i++)m.step(1/60);
 assert.equal(m.snapshot().players[p.id].kick,0);assert.ok(recorded.players[p.id].kick>0);
 const save=new SoccerMatch(NATIONS[0],NATIONS[2]),keeper=save.players[11];
 Object.assign(save.ball,{owner:null,x:keeper.x+10,y:keeper.y,z:0,vx:-150,vy:0,vz:0,lastTouch:0,lock:0});
 save.step(1/60);assert.equal(save.owner.id,keeper.id);
 assert.equal(save.snapshot().players[keeper.id].save,1);
 for(let i=0;i<45;i++)save.step(1/60);
 assert.equal(save.snapshot().players[keeper.id].save,0);
 save.kickoff(0);assert.ok(save.snapshot().players.every(p=>p.kick===0&&p.save===0));
});
test('running, kicking and keeper poses change without moving simulation players',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const p=h.app.match.snapshot().players[9],ball=h.app.match.ball;
 const idle=h.app.playerPose({...p,speed:0,kick:0},ball);
 const run=h.app.playerPose({...p,speed:120,stride:1,kick:0},ball);
 const kick=h.app.playerPose({...p,kick:.5,strike:undefined},ball);
 const keeper=h.app.playerPose({...p,keeper:true,save:.5},ball);
 assert.equal(idle.running,0);assert.ok(run.running>0);assert.ok(run.bob>0);
 assert.ok(kick.kick>.9);assert.ok(keeper.save>.9);
 const before=h.app.match.snapshot();h.app.render(1/60);
 assert.deepEqual(h.app.match.snapshot(),before);
});
test('new menu stats, trophy teams and circular loading stay in sync with team selection',()=>{
 const h=uiHarness(html);h.click('next');
 assert.equal(h.elements.get('atkBar').style.width,'86%');
 h.chooseMode('cup');
 assert.ok(h.elements.get('cupBracket').innerHTML.includes('Argentina'));
 assert.ok(h.elements.get('cupBracket').innerHTML.includes('selected'));
 assert.ok(h.elements.get('cupBracket').innerHTML.includes('SEMIFINAL'));
 h.click('startMatch');assert.equal(h.elements.get('loadingPercent').textContent,'0%');h.flush();
 assert.equal(h.elements.get('loadingPercent').textContent,'100%');assert.equal(h.app.view,'match');
});
test('stadium, turf and new sprite rendering stay finite and bounded in desktop and portrait',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.elements.get('game'),m=h.app.match;
 for(const rect of [{width:1440,height:810},{width:500,height:739},{width:844,height:390}]){
  c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  for(const x of [88,550,1014]){
   m.players[9].x=x;m.giveBall(m.players[9]);h.draws.length=0;
   h.app.camera.ready=false;h.app.render(1/60);
   assert.ok(h.draws.length<18000,'bounded visible crowd/turf drawing work');
   assert.ok(h.draws.filter(d=>d.method==='lineTo').length>100);
  }
 }
 m.scorer=0;m.phase='goal';m.phaseTime=.6;h.app.render(1/60);
});

function localHarness(){
 const h=uiHarness(html);h.chooseMode('multi');h.click('startLocal');h.flush();return h;
}
function keyEvent(key,repeat=false){return {key,repeat,target:{tagName:'CANVAS'},preventDefault(){this.prevented=true;}};}
test('local setup independently changes two distinct teams and preserves them on restart',()=>{
 const h=uiHarness(html);h.chooseMode('multi');
 const away=h.elements.get('localAway').textContent;
 h.click('localHomeNext');assert.equal(h.elements.get('localAway').textContent,away);
 const home=h.elements.get('localHome').textContent;
 h.click('localAwayNext');assert.equal(h.elements.get('localHome').textContent,home);
 for(let i=0;i<12;i++){
  h.click('localHomeNext');assert.ok(h.elements.get('localHome').textContent!==h.elements.get('localAway').textContent);
  h.click('localAwayPrev');assert.ok(h.elements.get('localHome').textContent!==h.elements.get('localAway').textContent);
 }
 h.click('startLocal');h.flush();const names=[h.app.match.home.name,h.app.match.away.name];
 h.click('menuBtn');h.click('restartMatch');h.flush();
 assert.deepEqual([h.app.match.home.name,h.app.match.away.name],names);
});
test('both teams move simultaneously with separate keys; idle active players remain under human control',()=>{
 const h=localHarness(),m=h.app.match;
 for(const p of m.players){p.x=800+(p.id%5)*30;p.y=420+Math.floor(p.id/5)*25;}
 const p1=m.players[9],p2=m.players[20];p1.x=400;p1.y=220;p2.x=600;p2.y=220;m.giveBall(p1);m.activeAway=p2.id;m.protection=4;
 const b1={x:p1.x,y:p1.y},b2={x:p2.x,y:p2.y};
 h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowDown'));
 for(let i=0;i<30;i++)m.step(1/60,h.app.input());
 assert.ok(p1.y<b1.y-50);assert.ok(p2.y>b2.y+50);
 h.window.handlers.keyup(keyEvent('w'));const stop={x:p1.x,y:p1.y};
 for(let i=0;i<15;i++)m.step(1/60,h.app.input());
 assert.ok(distance(p1,stop)<.001);assert.ok(p2.y>b2.y+75);
 h.window.handlers.keyup(keyEvent('ArrowDown'));assert.deepEqual(h.app.input().teams,[{dx:0,dy:0},{dx:0,dy:0}]);
});
test('each player can pass and shoot only for the team currently in possession',()=>{
 const h=localHarness(),m=h.app.match;
 h.window.handlers.keydown(keyEvent('l'));h.window.handlers.keydown(keyEvent('k'));
 assert.equal(m.ball.owner,9);assert.deepEqual(m.shots,[0,0]);assert.deepEqual(m.passes,[0,0]);
 h.window.handlers.keydown(keyEvent('f'));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.passes[0],1);
 m.giveBall(m.players[20]);h.window.handlers.keydown(keyEvent('g'));assert.equal(m.ball.owner,20);
 h.window.handlers.keydown(keyEvent('k'));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.passes[1],1);
 m.giveBall(m.players[9]);h.window.handlers.keydown(keyEvent('g'));advanceToContact(m);assert.equal(m.shots[0],1);
 m.giveBall(m.players[20]);h.window.handlers.keydown(keyEvent('l'));advanceToContact(m);assert.equal(m.shots[1],1);
 assert.ok(m.ball.vx>0);
});
test('possession transfers and defensive selection are independent for both teams',()=>{
 const h=localHarness(),m=h.app.match;m.ball.owner=null;
 const p1=m.active,p2=m.activeAway;
 h.window.handlers.keydown(keyEvent('q'));assert.ok(m.active!==p1);assert.equal(m.activeAway,p2);
 const p1After=m.active;
 h.window.handlers.keydown(keyEvent('o'));assert.ok(m.activeAway!==p2);assert.equal(m.active,p1After);
 m.giveBall(m.players[17]);assert.equal(m.activeAway,17);assert.equal(m.active,p1After);
 m.giveBall(m.players[4]);assert.equal(m.active,4);assert.equal(m.activeAway,17);
});
test('neither local ball carrier automatically dribbles, passes or shoots',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');
  for(const p of m.players){p.x=900+(p.id%4)*25;p.y=110+Math.floor(p.id/4)*28;}
  const p=m.players[team*11+9];p.x=550;p.y=318;m.giveBall(p);m.protection=10;
  const before={x:p.x,y:p.y};
  for(let i=0;i<180;i++)m.step(1/60);
  assert.ok(distance(p,before)<.001);assert.equal(m.ball.owner,p.id);
  assert.deepEqual(m.passes,[0,0]);assert.deepEqual(m.shots,[0,0]);
 }
});
test('corners, throw-ins and goal kicks wait for the correct human and accept that team pass key',()=>{
 for(const team of [0,1])for(const type of ['Corner Kick','Throw-in','Goal Kick']){
  const h=localHarness(),m=h.app.match;
  m.phase='restart';m.restart={type,team,x:team===0?100:1000,y:type==='Goal Kick'?318:108};
  h.app.syncMatch();assert.ok(h.elements.get('restartHelp').textContent.startsWith('Player '+(team+1)));
  h.click('takeCorner');const owner=m.owner.id;
  for(let i=0;i<90;i++)m.step(1/60,h.app.input());
  assert.equal(m.ball.owner,owner);assert.equal(m.setPiece,type);
  h.window.handlers.keydown(keyEvent(team===0?'k':'f'));assert.equal(m.ball.owner,owner);
  h.window.handlers.keydown(keyEvent(team===0?'f':'k'));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.setPiece,null);
  assert.equal(m.ball.lastTouch,team);
 }
});
test('local goals score correctly at both ends in both halves and restart with the conceding team',()=>{
 for(const period of [1,2])for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const side=m.goalX(team),d=m.direction(team);
  Object.assign(m.ball,{owner:null,x:side+d,y:318,z:0,lastTouch:team});
  m.checkBoundary({x:side-d*10,y:318,z:0});
  assert.equal(m.phase,'goal');assert.equal(m.score[team],1);assert.equal(m.score[1-team],0);
  m.skipReplay();assert.equal(m.owner.team,1-team);assert.equal(m.activeFor(1-team),m.owner.id);
 }
});
test('local halftime switches ends and local wins, losses and draws do not enter the cup',()=>{
 for(const score of [[2,1],[1,2],[1,1]]){
  const h=localHarness(),m=h.app.match;m.minute=44.999;m.step(1/60);h.app.syncMatch();
  assert.equal(h.app.view,'half');h.click('resume');assert.equal(m.period,2);assert.equal(m.direction(0),1);assert.equal(m.direction(1),-1);
  m.score=score;m.period=2;m.minute=89.999;m.step(1/60);h.app.syncMatch();assert.equal(h.app.view,'full');
  assert.ok(!m.penalties);
  const text=h.elements.get('resultMsg').textContent;
  assert.ok(score[0]===score[1]?text.startsWith('Draw'):text.startsWith('Player '+(score[0]>score[1]?1:2)));
  assert.equal(h.elements.get('continueCup').textContent,'CHANGE TEAMS');
  assert.ok(!h.elements.get('rematchLocal').classList.contains('hidden'));
  h.click('continueCup');assert.equal(h.app.view,'local');assert.equal(h.app.round,0);
 }
});
test('rematch preserves both teams, resets scores and returns keyboard focus to the game',()=>{
 const h=localHarness(),m=h.app.match,names=[m.home.name,m.away.name];
 m.score=[1,3];m.finish();h.app.syncMatch();h.click('rematchLocal');h.flush();
 assert.equal(h.app.match.mode,'local');assert.deepEqual(h.app.match.score,[0,0]);
 assert.deepEqual([h.app.match.home.name,h.app.match.away.name],names);assert.ok(h.elements.get('game').focused);
});
test('pause and blur clear both input sets; key repeats cannot double-fire shots',()=>{
 const h=localHarness(),m=h.app.match;
 h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowUp'));h.window.handlers.blur();
 assert.equal(m.phase,'paused');h.click('resumePause');
 assert.deepEqual(h.app.input().teams,[{dx:0,dy:0},{dx:0,dy:0}]);
 h.window.handlers.keydown(keyEvent('g',true));assert.equal(m.ball.owner,9);
 h.window.handlers.keydown(keyEvent('g'));advanceToContact(m);assert.equal(m.ball.owner,null);
 m.giveBall(m.players[20]);h.window.handlers.keydown(keyEvent('l',true));assert.equal(m.ball.owner,20);
 h.window.handlers.keydown(keyEvent('l'));advanceToContact(m);assert.equal(m.ball.owner,null);
});
test('local screen-direction input rotates correctly in portrait for both players',()=>{
 const h=localHarness(),m=h.app.match,canvas=h.elements.get('game');
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:739});h.app.render(1/60);
 h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowDown'));
 const input=h.app.input();assert.ok(input.teams[0].dx<0);assert.ok(input.teams[1].dx>0);
 for(const team of [0,1]){
  const p=m.players[m.activeFor(team)],v=input.teams[team],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x+v.dx,p.y+v.dy);
  assert.ok(Math.abs(b.x-a.x)<.02);assert.ok(team===0?b.y<a.y:b.y>a.y);
 }
});
test('local mode ignores pointer play and legacy solo kick keys; quitting restores solo controls',()=>{
 const h=localHarness(),m=h.app.match,c=h.elements.get('game');
 c.handlers.pointerdown({pointerId:1,clientX:550,clientY:318,preventDefault(){}});
 c.handlers.pointerup({pointerId:1,clientX:100,clientY:318});assert.equal(m.ball.owner,9);
 h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keydown(keyEvent(' '));assert.equal(m.ball.owner,9);
 h.chooseMode('menu');h.chooseMode('practice');h.flush();
 assert.equal(h.app.match.mode,'practice');h.window.handlers.keydown(keyEvent('e'));advanceToContact(h.app.match);assert.equal(h.app.match.ball.owner,null);
});

test('local keyboard shots physically cross the correct goal line for either player in either half',()=>{
 for(const period of [1,2])for(const team of [0,1]){
  const h=localHarness(),m=h.app.match;m.period=period;m.kickoff(team);
  for(const p of m.players){p.x=550;p.y=120;}
  const p=m.players[team*11+9],d=m.direction(team);p.x=m.goalX(team)-d*100;p.y=318;m.giveBall(p);
  h.window.handlers.keydown(keyEvent(team===0?'g':'l'));
  for(let i=0;i<90&&m.phase==='playing';i++)m.step(1/60,h.app.input());
  assert.equal(m.phase,'goal');assert.equal(m.score[team],1);assert.equal(m.restarts,0);
 }
});
test('receiving a real short pass transfers control to either team receiver',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.players[team*11+9],receiver=m.players[team*11+6];
  for(const q of m.players){q.x=950;q.y=110;}
  p.x=500;p.y=318;receiver.x=team===0?420:580;receiver.y=318;
  m.giveBall(p);m.kick(p,receiver,.3);advanceToContact(m);
  for(let frame=0;frame<120&&!m.owner;frame++)m.step(1/60);
  assert.equal(m.owner.id,receiver.id);assert.equal(m.activeFor(team),receiver.id);
  assert.equal(m.restarts,0);
 }
});
test('a real local tackle transfers possession and the selected player to the winning side',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),owner=m.players[team*11+9],defender=m.players[(1-team)*11+9];
  owner.x=550;owner.y=318;defender.x=565;defender.y=318;m.giveBall(owner);
  m.selectPlayer(1-team,defender.id);m.protection=0;m.random=()=>0;
  m.step(1/60);assert.equal(m.owner.id,defender.id);assert.equal(m.activeFor(1-team),defender.id);assert.equal(m.tackles,1);
 }
});
test('an entire no-input local match completes as a draw without AI shooting or penalties',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');
 for(let i=0;i<10000&&m.phase!=='full';i++){
  if(m.phase==='half')m.resumeHalf();if(m.phase==='restart')m.takeRestart();
  m.step(1/60);
 }
 assert.equal(m.phase,'full');assert.equal(m.minute,90);assert.deepEqual(m.score,[0,0]);assert.deepEqual(m.shots,[0,0]);assert.equal(m.winner(),null);
});

test('Choose Your Team after quitting local returns to the solo cup flow',()=>{
 const h=localHarness();h.chooseMode('menu');
 assert.equal(h.app.view,'menu');h.chooseMode('cup');assert.equal(h.app.view,'trophy');
 h.click('startMatch');h.flush();assert.equal(h.app.match.mode,'cup');
 h.app.match.score=[0,1];h.app.match.finish();h.app.syncMatch();
 assert.ok(h.elements.get('rematchLocal').classList.contains('hidden'));
});

test('canvas accessible instructions follow local, practice and cup modes without stale solo bindings',()=>{
 const h=uiHarness(html),canvas=h.elements.get('game'),description=h.elements.get('gameControls');
 assert.ok(/aria-describedby="gameControls"/.test(html));
 h.chooseMode('multi');
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — local two-player match');
 for(const expected of ['Player 1: WASD','F passes','G shoots','Q switches','Player 2: arrow keys','K passes','L shoots','O switches','Escape pauses']){
  assert.ok(description.textContent.includes(expected),expected);
 }
 assert.ok(!description.textContent.includes('Space shoots'));assert.ok(!description.textContent.includes('E passes'));
 assert.ok(!description.textContent.includes('Hold and drag'));
 h.click('startLocal');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — local two-player match');
 h.click('menuBtn');h.click('resumePause');
 assert.ok(description.textContent.includes('Player 2'));
 h.chooseMode('menu');h.chooseMode('practice');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — untimed practice');
 assert.ok(description.textContent.includes('Space shoots'));assert.ok(description.textContent.includes('E passes'));
 assert.ok(description.textContent.includes('Hold and drag'));assert.ok(!description.textContent.includes('Player 2'));
 h.chooseMode('menu');h.chooseMode('cup');h.click('startMatch');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — single-player cup');
 assert.ok(description.textContent.includes('Tab switches player'));
 h.chooseMode('menu');h.chooseMode('multi');
 assert.ok(description.textContent.includes('K passes'));assert.ok(!description.textContent.includes('Space shoots'));
});

test('one compact selector directly launches practice, cup and local setup',()=>{
 const h=uiHarness(html);assert.equal(h.app.view,'menu');
 assert.ok(h.elements.has('prev')&&h.elements.has('next'));assert.ok(!h.elements.has('toTrophy'));
 assert.ok(!h.elements.has('team'));
 h.click('next');h.chooseMode('practice');assert.equal(h.app.view,'loading');h.flush();
 assert.equal(h.app.match.home.name,'Argentina');assert.equal(h.app.match.mode,'practice');
 h.chooseMode('menu');h.chooseMode('cup');assert.equal(h.app.view,'trophy');
 h.chooseMode('team');assert.equal(h.app.view,'menu');h.chooseMode('multi');assert.equal(h.app.view,'local');
});
test('eight-team bracket has unique finalists from the 32-country roster and actual future opponents on each branch',()=>{
 const h=uiHarness(html);
 for(let n=0;n<NATIONS.length;n++){
  const qf=h.app.bracketMarkup(n,0,false);
  const field=h.app.cupFinalists(n);
  assert.equal(field.length,8);assert.equal(new Set(field).size,8);assert.equal(field[0],n);
  const actual=[...qf.matchAll(/title="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(actual.length,8);assert.equal(new Set(actual).size,8);
  assert.deepEqual(actual,[field[0],field[1],field[2],field[3],field[4],field[5],field[6],field[7]].map(i=>NATIONS[i].name));
  for(let r=0;r<3;r++)assert.equal(h.app.opponentFor(n,r),field[[1,2,4][r]]);
  assert.equal((qf.match(/class="bracket-match"/g)||[]).length,7);
 }
 h.chooseMode('cup');
 for(let round=0;round<3;round++){
  assert.equal(h.app.round,round);h.click('startMatch');h.flush();
  const m=h.app.match;assert.ok(h.elements.get('cupBracket').innerHTML.includes(m.away.code));
  m.score=[1,0];m.finish();h.app.syncMatch();h.click('continueCup');
 }
 assert.ok(h.elements.get('cupBracket').innerHTML.includes('UZB · CHAMPIONS'));
});
test('intro, gameplay and replay presets have different viewpoints with invertible input mapping',()=>{
 const h=uiHarness(html);h.chooseMode('practice');
 // Render the loading preview before its timers complete.
 h.app.render(.1);assert.equal(h.app.camera.preset,'intro');
 const introYaw=h.app.camera.yaw;assert.ok(introYaw<0);
 h.flush();for(let i=0;i<100;i++)h.app.render(1/60);
 const c=h.app.camera;assert.equal(c.preset,'gameplay');assert.ok(Math.abs(c.yaw+.12)<.01);
 const normalTilt=c.tilt;
 const m=h.app.match;m.phase='replay';m.replayFrames=[m.snapshot()];m.replayTime=1;
 for(let i=0;i<90;i++)h.app.render(1/60);
 assert.equal(c.preset,'replay');assert.ok(Math.abs(c.yaw)>1.2);assert.ok(c.tilt<normalTilt-.2);assert.ok(c.zoom>=1.3&&c.zoom<=3.3);
 for(const p of [{x:200,y:150},{x:550,y:318},{x:920,y:480}]){
  const s=c.project(p.x,p.y),q=c.unproject(s.x,s.y);
  assert.ok(distance(p,q)<.00001);
 }
 m.scorer=0;h.click('skipReplay');for(let i=0;i<120;i++)h.app.render(1/60);
 assert.equal(c.preset,'gameplay');assert.ok(Math.abs(c.yaw+.12)<.01);
});
test('replay interpolation uses recorded positions and never changes the live match',()=>{
 const h=localHarness(),m=h.app.match,a=m.snapshot(),b=m.snapshot();
 b.players[9].x+=100;b.ball.x+=100;b.ball.z=20;
 const before=m.snapshot(),sample=h.app.replaySample([a,b],.5);
 assert.equal(sample.players[9].x,a.players[9].x+50);assert.equal(sample.ball.x,a.ball.x+50);assert.equal(sample.ball.z,10);
 assert.deepEqual(m.snapshot(),before);
});
test('stoppages automatically set up the taker while waiting for human release or keyboard pass',()=>{
 for(const mode of ['practice','multi']){
  const h=uiHarness(html);h.chooseMode(mode);if(mode==='multi')h.click('startLocal');h.flush();
  const m=h.app.match;m.phase='restart';m.restart={type:'Corner Kick',team:mode==='multi'?1:0,x:100,y:108};h.app.syncMatch();
  h.tick(100);h.tick(200);assert.equal(m.phase,'restart');
  for(let t=300;t<=1300;t+=100)h.tick(t);
  assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Corner Kick');assert.ok(m.owner);
  const owner=m.owner.id;for(let i=0;i<60;i++)m.step(1/60,h.app.input());
  assert.equal(m.ball.owner,owner);
  if(mode==='multi'){h.window.handlers.keydown(keyEvent('k'));advanceToContact(m);assert.equal(m.ball.owner,null);}
 }
});
test('screen-direction solo keyboard controls stay aligned while intro camera settles',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.app.render(.15);h.flush();
 h.window.handlers.keydown(keyEvent('w'));
 const p=h.app.match.players[h.app.match.active],v=h.app.input(),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x+v.dx,p.y+v.dy);
 assert.ok(b.y<a.y);assert.ok(Math.abs(b.x-a.x)<.02);
});

test('selector country and rating colors have WCAG AA normal-text contrast',()=>{
 const luminance=hex=>{
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const bg=luminance('#e8f4ee');
 for(const fg of ['#123f40','#254d43'])assert.ok((bg+.05)/(luminance(fg)+.05)>=4.5);
 // Evaluate the last explicit foreground/background pair, not a superseded rule.
 const rules=[...html.matchAll(/#menu \.teamName\{([^}]+)\}/g)].map(m=>m[1]);
 const lastValue=key=>rules.map(r=>r.match(new RegExp('(?:^|;)'+key+':([^;]+)'))?.[1]).filter(Boolean).pop();
 assert.equal(lastValue('background'),'#e8f4ee');assert.equal(lastValue('color'),'#123f40');
 assert.ok((luminance(lastValue('background'))+.05)/(luminance(lastValue('color'))+.05)>=4.5);
 assert.ok(html.includes('#menu .stat{background:#e8f4ee;color:#254d43'));
});
test('half-time and full-time badges match teams and penalties occupy a separate score element',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
 const m=h.app.match;m.score=[4,4];m.phase='half';h.app.syncMatch();
 assert.equal(h.elements.get('halfHomeName').textContent,m.home.name);
 assert.equal(h.elements.get('halfAwayFlag').textContent,m.away.flag);
 assert.equal(h.elements.get('halfGoals').textContent,'4 – 4');
 m.penalties={done:true,score:[2,3]};m.phase='full';h.app.syncMatch();
 assert.equal(h.elements.get('resultGoals').textContent,'4 – 4');
 assert.equal(h.elements.get('resultPenalties').textContent,'PENALTIES  2 – 3');
 assert.ok(!h.elements.get('resultPenalties').classList.contains('hidden'));
 assert.ok(h.elements.get('resultScore').textContent.includes('(pens 2 - 3)'));
 assert.ok(h.elements.get('resultMsg').textContent.includes(m.away.name+' wins'));
 h.click('continueCup');h.click('startMatch');h.flush();h.app.match.score=[1,0];h.app.match.finish();h.app.syncMatch();
 assert.equal(h.elements.get('resultPenalties').textContent,'');
 assert.ok(h.elements.get('resultPenalties').classList.contains('hidden'));
 assert.equal(h.elements.get('resultHomeFlag').textContent,h.app.match.home.flag);
 assert.equal(h.elements.get('resultGoals').textContent,'1 – 0');
});
test('routine pass and shot messages use subtle feedback and other notices reset that style',()=>{
 const h=localHarness(),m=h.app.match;
 for(const event of ['Pass!','Shot!','Player 2: Pass!','Player 2: Shot!']){
  m.event=event;h.app.syncMatch();
  assert.ok(h.elements.get('toast').classList.contains('routine'));
 }
 m.event='Second half — switch ends';h.app.syncMatch();
 assert.ok(!h.elements.get('toast').classList.contains('routine'));
});
test('bracket includes an original cup graphic and result layouts keep penalty tallies unbroken',()=>{
 const h=uiHarness(html);h.chooseMode('cup');
 const bracket=h.elements.get('cupBracket').innerHTML;
 assert.ok(bracket.includes('class="gold-cup"'));
 assert.ok(bracket.includes('aria-label="International Cup trophy"'));
 assert.ok(!bracket.includes('aria-hidden="true">★'));
 assert.ok(/\.penalty-tally\{[^}]*white-space:nowrap/.test(html));
 assert.ok(/#skipReplay\{[^}]*right:[^}]*bottom:/.test(html));
 assert.ok(/#replay h2\{[^}]*left:[^}]*top:/.test(html));
});

test('stadium presentation camera is used at halftime and full time without changing match state',()=>{
 const h=localHarness(),m=h.app.match;
 m.score=[2,1];m.phase='half';h.app.syncMatch();
 const before=m.snapshot();
 for(let i=0;i<45;i++){h.app.render(1/30);h.draws.length=0;}
 assert.equal(h.app.camera.preset,'presentation');
 assert.ok(h.app.camera.zoom<1.3);assert.ok(h.app.camera.yaw>.08);
 assert.deepEqual(m.snapshot(),before);
 h.click('resume');h.app.render(1/60);
 assert.equal(m.phase,'playing');assert.equal(h.app.camera.preset,'gameplay');
 h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowDown'));
 const input=h.app.input();
 for(const team of [0,1]){
  const p=m.players[m.activeFor(team)],v=input.teams[team],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x+v.dx,p.y+v.dy);
  assert.ok(Math.abs(b.x-a.x)<.02);assert.ok(team===0?b.y<a.y:b.y>a.y);
 }
 m.finish();h.app.syncMatch();h.app.render(1/60);
 assert.equal(h.app.camera.preset,'presentation');assert.equal(h.elements.get('resultGoals').textContent,'2 – 1');
});
test('camera anticipates the ball carrier run without changing projection inversion',()=>{
 const h=localHarness(),m=h.app.match,c=h.app.camera,shot=m.snapshot();
 const p=shot.players.find(p=>p.id===shot.ball.owner);
 p.speed=0;c.update(shot,0,false,true);const still=c.x;
 p.speed=140;p.angle=Math.PI;c.update(shot,0,false,true);assert.ok(c.x<still-15);
 const at=c.project(p.x,p.y),world=c.unproject(at.x,at.y);assert.ok(distance(world,p)<.00001);
});
test('compact selector and bracket progression retain team selection and local-mode access',()=>{
 const h=uiHarness(html);
 assert.ok(!html.includes('<svg class="team-art"'));
 h.click('next');h.chooseMode('cup');
 const qf=h.elements.get('cupBracket').innerHTML;
 assert.ok(qf.includes('bracket-flag'));assert.ok(qf.includes('bracket-country'));
 assert.ok(qf.includes('class="current">1 · Quarterfinal'));
 h.click('startMatch');h.flush();h.app.match.score=[1,0];h.app.match.finish();h.app.syncMatch();h.click('continueCup');
 const sf=h.elements.get('cupBracket').innerHTML;
 assert.ok(sf.includes('class="complete">1 · Quarterfinal'));assert.ok(sf.includes('class="current">2 · Semifinal'));
 h.chooseMode('menu');h.chooseMode('multi');assert.equal(h.app.view,'local');
});

test('restart live announcements clear on resumption, match restart, menu and result transitions',()=>{
 const h=localHarness(),m=h.app.match;
 const restart=()=>{m.phase='restart';m.restart={type:'Goal Kick',team:1,x:1000,y:318};h.app.syncMatch();assert.ok(h.elements.get('matchStatus').textContent.includes('Goal Kick'));};
 restart();h.click('takeCorner');assert.equal(h.elements.get('matchStatus').textContent,'');
 h.flush();assert.equal(h.elements.get('toast').textContent,'');
 restart();h.chooseMode('menu');assert.equal(h.elements.get('matchStatus').textContent,'');
 assert.equal(h.elements.get('toast').textContent,'');
 h.chooseMode('multi');h.click('startLocal');h.flush();
 h.app.match.phase='restart';h.app.match.restart={type:'Throw-in',team:0,x:500,y:108};h.app.syncMatch();
 h.click('restartMatch');assert.equal(h.elements.get('matchStatus').textContent,'');h.flush();
 h.app.match.phase='restart';h.app.match.restart={type:'Corner Kick',team:0,x:100,y:108};h.app.syncMatch();
 h.app.match.phase='full';h.app.syncMatch();assert.equal(h.elements.get('matchStatus').textContent,'');
});
test('behind-goal replay keeps recorded action and the goal in frame at both ends and orientations',()=>{
 const h=localHarness(),m=h.app.match,c=h.app.camera,canvas=h.elements.get('game');
 for(const rect of [{width:1280,height:720},{width:500,height:739}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});h.app.render(1/60);
  for(const goal of [FIELD.left,FIELD.right]){
   c.preset='gameplay';c.replayGoal=goal;
   const inward=goal===FIELD.left?1:-1;
   for(let frame=0;frame<=240;frame++){
    const t=frame/240,shot=m.snapshot();
    shot.ball.x=goal+inward*(650*(1-t)+15);shot.ball.y=318+100*(1-t);shot.ball.z=10*Math.sin(t*Math.PI);
    shot.players[shot.active].x=shot.ball.x;shot.players[shot.active].y=shot.ball.y;
    c.update(shot,1/60,true);
    const ball=c.project(shot.ball.x,shot.ball.y,shot.ball.z),post=c.project(goal,318);
    assert.ok(ball.x>0&&ball.x<c.width&&ball.y>0&&ball.y<c.height,'recorded ball must stay visible');
    assert.ok(post.y>c.height*.65&&post.y<c.height,'goal stays in foreground');
    const q=c.unproject(ball.x,c.project(shot.ball.x,shot.ball.y).y);
    assert.ok(Math.abs(q.x-shot.ball.x)<.001);
   }
   assert.ok(c.tilt<(c.portrait?.55:.35));
   const totalYaw=c.yaw+(c.portrait?Math.PI/2:0);
   assert.ok(Math.abs(totalYaw-(goal===FIELD.left?-Math.PI/2+.28:Math.PI/2-.28))<.01);
   c.update(m.snapshot(),1/60,false);assert.equal(c.preset,'gameplay');
  }
 }
});
test('composed interval art and sculptural trophy retain accessible team and score data',()=>{
 const h=localHarness(),m=h.app.match;
 m.phase='half';h.app.syncMatch();assert.ok(h.elements.get('halfSummary').textContent.includes(m.home.name));
 m.score=[2,1];m.finish();h.app.syncMatch();assert.ok(h.elements.get('resultScore').textContent.includes('2 - 1'));
 assert.equal((html.match(/class="interval-art"/g)||[]).length,2);
 h.chooseMode('menu');h.chooseMode('cup');
 const cup=h.elements.get('cupBracket').innerHTML;
 assert.ok(cup.includes('International Cup trophy'));assert.ok(cup.includes('cx="90" cy="55" r="40"'));
});

test('country columns list the actual eight finalists once and identify the selected team',()=>{
 const h=uiHarness(html);h.click('next');h.chooseMode('cup');
 const roster=h.elements.get('cupEntrants').innerHTML;
 assert.equal((roster.match(/class="country-row/g)||[]).length,8);
 assert.equal((roster.match(/class="country-row chosen"/g)||[]).length,1);
 for(const index of h.app.cupFinalists(1)){
  assert.equal((roster.match(new RegExp('<b>'+NATIONS[index].name+'</b>','g'))||[]).length,1);
 }
 assert.ok(roster.includes('86 / 84 / 82'));
 h.click('startMatch');h.flush();h.app.match.score=[1,0];h.app.match.finish();h.app.syncMatch();h.click('continueCup');
 assert.equal(h.app.round,1);assert.ok(h.elements.get('cupEntrants').innerHTML.includes('<b>Argentina</b>'));
});
test('oblique replay visibly separates the two goalposts in depth while preserving projection inversion',()=>{
 const h=localHarness(),c=h.app.camera;
 for(const goal of [FIELD.left,FIELD.right]){
  c.replayGoal=goal;c.preset='gameplay';
  const shot=h.app.match.snapshot();shot.ball.x=goal+(goal===FIELD.left?100:-100);shot.ball.y=318;
  c.update(shot,1/60,true);
  const a=c.project(goal,FIELD.cy-FIELD.goalHalf),b=c.project(goal,FIELD.cy+FIELD.goalHalf);
  assert.ok(Math.abs(a.y-b.y)>10,'goal view should be oblique rather than straight-on');
  const point=c.project(shot.ball.x,shot.ball.y),world=c.unproject(point.x,point.y);
  assert.ok(distance(world,shot.ball)<.0001);
 }
});
test('player cadence varies by identity without altering simulation positions',()=>{
 const h=localHarness(),m=h.app.match,base=m.snapshot().players[9],ball=m.ball;
 const a=h.app.playerPose({...base,id:9,speed:110,stride:1},ball);
 const b=h.app.playerPose({...base,id:10,speed:110,stride:1},ball);
 assert.ok(Math.abs(a.stride-b.stride)>.01);
 const before=m.snapshot();h.app.render(1/60);assert.deepEqual(m.snapshot(),before);
});

test('player mesh has real depth, finite face normals and rotates with player heading',()=>{
 const h=localHarness(),p={...h.app.match.snapshot().players[9],angle:0,speed:0,stride:0,kick:0,save:0},ball=h.app.match.ball;
 const pose=h.app.playerPose(p,ball),a=h.app.playerMesh(p,pose),b=h.app.playerMesh({...p,angle:Math.PI/2},pose);
 assert.ok(a.length>=70&&a.length<=110);
 for(let f=0;f<a.length;f++){
  assert.ok(a[f].normal.every(Number.isFinite));assert.ok(Math.hypot(...a[f].normal)>.99);
  for(let i=0;i<a[f].points.length;i++){
   const u=a[f].points[i],v=b[f].points[i];
   assert.ok(u.every(Number.isFinite));assert.ok(u[2]>=0);
   assert.ok(Math.abs((v[0]-p.x)+(u[1]-p.y))<.001);
   assert.ok(Math.abs((v[1]-p.y)-(u[0]-p.x))<.001);
   assert.ok(Math.abs(v[2]-u[2])<.001);
  }
 }
 const heights=a.flatMap(f=>f.points.map(p=>p[2]));
 assert.ok(Math.max(...heights)>21&&Math.max(...heights)<24);assert.ok(Math.min(...heights)<2);
});
test('kick and goalkeeper poses change mesh geometry without changing the match snapshot',()=>{
 const h=localHarness(),m=h.app.match,p=m.snapshot().players[9],ball=m.ball;
 const normal=h.app.playerPose({...p,speed:0,kick:0},ball);
 const standing=h.app.playerMesh(p,normal);
 const kicked=h.app.playerMesh(p,{...normal,kick:1,strike:undefined});
 const keeper=h.app.playerMesh({...p,keeper:true},{...normal,save:1,reach:1});
 assert.ok(JSON.stringify(standing)!==JSON.stringify(kicked));
 assert.ok(JSON.stringify(standing)!==JSON.stringify(keeper));
 const before=m.snapshot();h.app.render(1/60);assert.deepEqual(m.snapshot(),before);
});
test('country grid supports direct choice with pressed state and correct cup opponent status',()=>{
 const h=uiHarness(html),grid=h.elements.get('nationGrid');
 assert.equal((grid.innerHTML.match(/data-nation=/g)||[]).length,32);
 grid.handlers.click({target:{closest:()=>({dataset:{nation:'3'}})}});
 assert.equal(h.elements.get('teamName').textContent,'Japan');
 assert.ok(grid.innerHTML.includes('data-nation="3" aria-label="Choose Japan" aria-pressed="true"'));
 grid.handlers.click({target:{closest:()=>({dataset:{nation:'999'}})}});
 assert.equal(h.elements.get('teamName').textContent,'Japan');
 h.chooseMode('cup');
 assert.equal((h.elements.get('cupEntrants').innerHTML.match(/<em>YOU<\/em>/g)||[]).length,1);
 assert.equal((h.elements.get('cupEntrants').innerHTML.match(/<em>NEXT<\/em>/g)||[]).length,1);
 h.click('startMatch');h.flush();assert.equal(h.app.match.home.name,'Japan');
});

test('portrait action remains legible in CSS pixels and desktop returns to the tighter action view',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.app.camera,m=h.app.match,canvas=h.elements.get('game');
 for(const rect of [{width:500,height:745},{width:390,height:844},{width:320,height:568}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});
  m.players[9].x=550;m.players[9].y=318;m.giveBall(m.players[9]);
  c.ready=false;h.draws.length=0;h.app.render(1/60);
  const body=h.app.playerMesh(m.players[9],h.app.playerPose(m.players[9],m.ball));
  const height=Math.max(...body.flatMap(f=>f.points.map(p=>p[2])));
  const foot=c.project(550,318),head=c.project(550,318,height);
  assert.ok((foot.y-head.y)*rect.width/1100 >=36,'central player should be at least 36 CSS pixels tall');
  const ball=c.project(m.ball.x,m.ball.y,m.ball.z*.65+1.5);
  const sphere=h.draws.find(d=>d.method==='arc'&&Math.abs(d.args[0]-ball.x)<.001&&Math.abs(d.args[1]-ball.y)<.001);
  assert.ok(sphere,'ball is rendered at its projected position');
  assert.ok(sphere.args[2]*2*rect.width/1100>=5.999,'ball should be at least 6 CSS pixels across');
  const world=c.unproject(ball.x,c.project(m.ball.x,m.ball.y).y);
  assert.ok(Math.abs(world.x-m.ball.x)<.001&&Math.abs(world.y-m.ball.y)<.001);
 }
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:1440,height:810});
 c.ready=false;h.app.render(1/60);
 assert.equal(c.portrait,false);assert.ok(c.zoom>4&&c.zoom<4.3);
});

test('32 unique countries have complete ratings and directly selectable, scroll-preserving controls',()=>{
 assert.equal(NATIONS.length,32);
 for(const key of ['name','code','flag'])assert.equal(new Set(NATIONS.map(n=>n[key])).size,32);
 const h=uiHarness(html),grid=h.elements.get('nationGrid');
 for(let i=0;i<32;i++){
  const n=NATIONS[i];assert.ok(n.name&&n.flag&&/^[A-Z]{3}$/.test(n.code));
  for(const key of ['attack','midfield','defence'])assert.ok(Number.isInteger(n[key])&&n[key]>=0&&n[key]<=100);
  grid.scrollTop=120+i;
  grid.handlers.click({target:{closest:()=>({dataset:{nation:String(i)}})}});
  assert.equal(grid.scrollTop,120+i);
  assert.equal((grid.innerHTML.match(/aria-pressed="true"/g)||[]).length,1);
  assert.ok(grid.innerHTML.includes('data-nation="'+i+'" aria-label="Choose '+n.name+'" aria-pressed="true"'));
  assert.ok(grid.innerHTML.includes('<b>'+n.name+'</b>'));
  assert.ok(grid.innerHTML.includes(n.attack+' / '+n.midfield+' / '+n.defence));
  assert.equal(h.elements.get('teamName').textContent,n.name);
  assert.equal(h.elements.get('teamFlag').textContent,n.flag);
  assert.equal(h.elements.get('atk').textContent,n.attack);
  assert.equal(h.elements.get('mid').textContent,n.midfield);
  assert.equal(h.elements.get('def').textContent,n.defence);
 }
 h.click('next');assert.equal(h.elements.get('teamName').textContent,NATIONS[0].name);
 h.click('prev');assert.equal(h.elements.get('teamName').textContent,NATIONS[31].name);
});

test('every country completes a stable QF to semifinal to final path with no duplicate finalists',()=>{
 const allOpponents=new Set();
 for(let home=0;home<32;home++){
  const h=uiHarness(html),grid=h.elements.get('nationGrid');
  grid.handlers.click({target:{closest:()=>({dataset:{nation:String(home)}})}});
  h.chooseMode('cup');
  const originalRoster=h.elements.get('cupEntrants').innerHTML;
  const field=h.app.cupFinalists(home),faced=[];
  field.slice(1).forEach(i=>allOpponents.add(i));
  for(let r=0;r<3;r++){
   assert.equal(h.app.round,r);
   const bracket=h.elements.get('cupBracket').innerHTML,opponent=h.app.opponentFor(home,r);
   const roster=h.elements.get('cupEntrants').innerHTML;
   assert.equal((roster.match(/class="country-row/g)||[]).length,8);
   for(const i of field)assert.ok(roster.includes('<b>'+NATIONS[i].name+'</b>'));
   assert.equal((roster.match(/<em>NEXT<\/em>/g)||[]).length,1);
   assert.ok(bracket.includes('title="'+NATIONS[opponent].name+'"'));
   h.click('startMatch');assert.equal(h.elements.get('loadingTitle').textContent,NATIONS[home].name);h.flush();
   assert.equal(h.app.match.home.code,NATIONS[home].code);
   assert.equal(h.app.match.away.code,NATIONS[opponent].code);faced.push(opponent);
   assert.equal(h.elements.get('awayName').textContent,NATIONS[opponent].name);
   h.click('menuBtn');h.click('restartMatch');h.flush();
   assert.equal(h.app.match.away.code,NATIONS[opponent].code);
   h.app.match.score=[2,1];h.app.match.finish();h.app.syncMatch();
   assert.equal(h.elements.get('resultHomeName').textContent,NATIONS[home].name);
   assert.equal(h.elements.get('resultAwayName').textContent,NATIONS[opponent].name);
   h.click('continueCup');
  }
  assert.equal(new Set(faced).size,3);assert.ok(!faced.includes(home));assert.ok(h.app.champion);
  h.click('startMatch');h.flush();assert.equal(h.app.round,0);assert.equal(h.app.champion,false);
  h.app.match.score=[0,1];h.app.match.finish();h.app.syncMatch();h.click('continueCup');
  assert.equal(h.app.round,0);assert.equal(h.app.champion,false);
  assert.equal(h.elements.get('cupEntrants').innerHTML,originalRoster);
 }
 assert.equal(allOpponents.size,32,'all selectable countries can participate in generated fields');
});

test('every country propagates through either local player dropdown, loading, HUD, halftime, results and rematch',()=>{
 for(const side of ['Home','Away'])for(let n=0;n<32;n++){
  const h=uiHarness(html);h.chooseMode('multi');
  // Move the other player away first so any of the 32 countries can be selected.
  const other=side==='Home'?'Away':'Home',otherSelect=h.elements.get('local'+other+'Select');
  const otherIndex=(n+1)%32;
  // Use the arrows if the requested other country is currently held by this player.
  if(Number(h.elements.get('local'+side+'Select').value)===otherIndex)h.click('local'+side+'Next');
  otherSelect.handlers.change({target:{value:String(otherIndex)}});
  const select=h.elements.get('local'+side+'Select');
  assert.equal((select.innerHTML.match(/<option /g)||[]).length,32);
  select.handlers.change({target:{value:String(n)}});
  assert.equal(select.value,String(n));
  assert.ok(h.elements.get('local'+side).textContent.includes(NATIONS[n].name));
  assert.ok(h.elements.get('local'+side+'Rating').textContent.includes(String(NATIONS[n].attack)));
  h.click('startLocal');
  const expectedHome=side==='Home'?n:otherIndex,expectedAway=side==='Away'?n:otherIndex;
  assert.equal(h.elements.get('loadingTitle').textContent,NATIONS[expectedHome].name);
  assert.ok(h.elements.get('loadText').textContent.includes(NATIONS[expectedHome].name+' vs '+NATIONS[expectedAway].name));h.flush();
  assert.equal(h.elements.get('homeName').textContent,NATIONS[expectedHome].name);
  assert.equal(h.elements.get('awayName').textContent,NATIONS[expectedAway].name);
  assert.equal(h.elements.get('homeFlag').textContent,NATIONS[expectedHome].flag);
  assert.equal(h.elements.get('awayFlag').textContent,NATIONS[expectedAway].flag);
  h.app.match.phase='half';h.app.syncMatch();
  assert.equal(h.elements.get('halfHomeName').textContent,NATIONS[expectedHome].name);
  assert.equal(h.elements.get('halfAwayName').textContent,NATIONS[expectedAway].name);
  h.click('resume');h.app.match.score=[1,2];h.app.match.finish();h.app.syncMatch();
  assert.equal(h.elements.get('resultHomeName').textContent,NATIONS[expectedHome].name);
  assert.equal(h.elements.get('resultAwayName').textContent,NATIONS[expectedAway].name);
  h.click('rematchLocal');h.flush();
  assert.equal(h.app.match.home.name,NATIONS[expectedHome].name);
  assert.equal(h.app.match.away.name,NATIONS[expectedAway].name);
 }
});

test('local country inputs reject duplicate or invalid teams and roster selection survives returning to solo',()=>{
 const h=uiHarness(html);h.chooseMode('multi');
 const home=h.elements.get('localHomeSelect'),away=h.elements.get('localAwaySelect');
 for(const value of [away.value,'','-1','32','NaN','1.5']){
  home.handlers.change({target:{value}});assert.equal(home.value,'0');assert.equal(away.value,'2');
 }
 away.handlers.change({target:{value:'31'}});
 home.handlers.change({target:{value:'30'}});
 h.chooseMode('menu');
 assert.equal(h.elements.get('teamName').textContent,NATIONS[30].name);
 h.chooseMode('practice');h.flush();
 assert.equal(h.app.match.home.name,NATIONS[30].name);assert.ok(h.app.match.away.code!==h.app.match.home.code);
});

test('all 32 practice selections remain untimed and return to the same selected country',()=>{
 for(let i=0;i<32;i++){
  const h=uiHarness(html);
  h.elements.get('nationGrid').handlers.click({target:{closest:()=>({dataset:{nation:String(i)}})}});
  h.chooseMode('practice');h.flush();const m=h.app.match;
  assert.equal(m.home.name,NATIONS[i].name);assert.equal(m.mode,'practice');
  m.minute=120;m.step(1/60);assert.equal(m.phase,'playing');
  h.click('menuBtn');h.click('finishPractice');
  assert.equal(h.elements.get('resultHomeName').textContent,NATIONS[i].name);
  h.click('continueCup');assert.equal(h.app.view,'menu');
  assert.equal(h.elements.get('teamName').textContent,NATIONS[i].name);
 }
});

test('carousel is the default, chooser toggles accessibly and selection restores the compact view',()=>{
 const h=uiHarness(html),toggle=h.elements.get('chooseCountry'),chooser=h.elements.get('countryChooser');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.ok(chooser.classList.contains('hidden'));
 h.click('next');assert.equal(h.elements.get('teamName').textContent,NATIONS[1].name);
 assert.equal(h.elements.get('selectionPosition').textContent,'02 / 32');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 h.click('chooseCountry');assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.ok(!chooser.classList.contains('hidden'));
 h.elements.get('nationGrid').handlers.click({target:{closest:()=>({dataset:{nation:'31'}})}});
 assert.equal(h.elements.get('teamName').textContent,NATIONS[31].name);
 assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.ok(chooser.classList.contains('hidden'));assert.ok(toggle.focused);
 h.click('chooseCountry');h.elements.get('nationGrid').handlers.keydown({key:'Escape',preventDefault(){}});
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 h.click('chooseCountry');h.chooseMode('multi');assert.equal(toggle.getAttribute('aria-expanded'),'false');
 h.chooseMode('menu');assert.equal(h.elements.get('teamName').textContent,NATIONS[31].name);
});

test('dense cup overview lists 32 countries, marks only its eight finalists and updates with selection',()=>{
 const h=uiHarness(html);
 for(let i=0;i<32;i++){
  h.chooseMode('menu');
  h.elements.get('nationGrid').handlers.click({target:{closest:()=>({dataset:{nation:String(i)}})}});
  h.chooseMode('cup');
  const roster=h.elements.get('worldRoster').innerHTML,field=h.app.cupFinalists(i);
  assert.equal((roster.match(/class="world-country/g)||[]).length,32);
  assert.equal((roster.match(/class="world-country finalist/g)||[]).length,8);
  assert.equal((roster.match(/class="world-country finalist chosen"/g)||[]).length,1);
  for(let n=0;n<32;n++){
   const row=roster.match(new RegExp('<div class="([^"]+)" data-country="'+n+'">([\\s\\S]*?)</div>'));
   assert.ok(row);assert.equal(row[1].includes('finalist'),field.includes(n));assert.ok(row[2].includes(NATIONS[n].name));
  }
 }
 assert.ok(html.includes('Play starts at the quarterfinal; no group stage or round of 16 is played.'));
});

test('tighter gameplay camera tracks moving ground and aerial balls inside desktop and portrait frames',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const canvas=h.elements.get('game'),c=h.app.camera,m=h.app.match;
 for(const rect of [{width:1440,height:810},{width:844,height:390},{width:500,height:745},{width:390,height:844}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});h.app.render(1/60);
  const shot=m.snapshot();shot.ball.owner=null;shot.active=9;
  for(const [from,to] of [[100,1000],[1000,100]]){
   shot.ball.x=from;shot.ball.y=FIELD.cy;shot.ball.z=0;shot.ball.vx=0;shot.ball.vy=0;
   shot.players[9].x=from;shot.players[9].y=FIELD.cy;c.update(shot,0,false,true);
   for(let frame=0;frame<180;frame++){
    const progress=frame/179;shot.ball.x=from+(to-from)*progress;
    shot.ball.y=FIELD.cy+190*Math.sin(progress*Math.PI*2);
    shot.ball.z=42*Math.sin(progress*Math.PI);shot.ball.vx=(to-from)/3;
    shot.ball.vy=190*Math.PI*2/3*Math.cos(progress*Math.PI*2);
    // Selected defender can lag behind a free ball without dragging the view away.
    shot.players[9].x=550;shot.players[9].y=FIELD.cy;
    c.update(shot,1/60);
    const p=c.project(shot.ball.x,shot.ball.y,shot.ball.z*.65+4);
    assert.ok(p.x>c.width*.035&&p.x<c.width*.965,'ball horizontally visible '+JSON.stringify(rect));
    assert.ok(p.y>c.height*.035&&p.y<c.height*.965,'ball vertically visible '+JSON.stringify(rect));
    const ground=c.project(shot.ball.x,shot.ball.y),world=c.unproject(ground.x,ground.y);
    assert.ok(distance(world,shot.ball)<.00001);
   }
  }
 }
});

test('landscape framing matches the circle-width target with smaller field-relative humanoids',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const c=h.app.camera,m=h.app.match,canvas=h.elements.get('game');
 for(const rect of [{width:1440,height:810},{width:1280,height:720},{width:844,height:390}]){
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});
  m.players[9].x=550;m.players[9].y=318;m.giveBall(m.players[9]);c.ready=false;h.app.render(1/60);
  const a=c.project(484,318),b=c.project(616,318),fraction=Math.abs(b.x-a.x)/c.width;
  assert.ok(fraction>.42&&fraction<.53,'center circle occupies roughly half the landscape viewport');
  assert.ok(Math.abs(a.y-b.y)>10,'landscape pitch has a diagonal sideline composition');
  const mesh=h.app.playerMesh(m.players[9],h.app.playerPose(m.players[9],m.ball));
  const height=Math.max(...mesh.flatMap(f=>f.points.map(p=>p[2])));
  assert.ok(height/132>.15&&height/132<.19,'body scale is measured against the center-circle diameter');
  const foot=c.project(550,318),head=c.project(550,318,height);
  const cssHeight=(foot.y-head.y)*rect.width/1100;
  assert.ok(cssHeight>50&&cssHeight<140,'tighter crop preserves a readable viewport-sized humanoid');
 }
});

test('desktop country columns include a central original trophy without changing the eight-team draw',()=>{
 const h=uiHarness(html);h.chooseMode('cup');
 const roster=h.elements.get('worldRoster').innerHTML;
 assert.equal((roster.match(/class="roster-column"/g)||[]).length,4);
 assert.equal((roster.match(/class="world-country/g)||[]).length,32);
 assert.ok(roster.includes('class="roster-cup"'));
 assert.ok(roster.includes('id="overviewGold"'));assert.ok(!roster.includes('id="cupGold"'));
 assert.ok(h.elements.get('cupBracket').innerHTML.includes('id="cupGold"'));
 assert.equal((h.elements.get('cupEntrants').innerHTML.match(/class="country-row/g)||[]).length,8);
});

function pacedMatch(){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');
 for(const q of m.players){q.x=930;q.y=100+q.id*3;}
 const p=m.players[9];p.x=550;p.y=318;m.giveBall(p);m.protection=2;
 return {m,p};
}
test('shots have a bounded wind-up, one contact and reduced flight speed; repeat requests cannot fire twice',()=>{
 const {m,p}=pacedMatch(),before={...m.ball};
 assert.ok(m.kick(p,{x:FIELD.left-20,y:FIELD.cy},1));
 assert.equal(m.ball.owner,p.id);assert.equal(m.shots[0],0);
 assert.equal(m.kick(p,{x:FIELD.right+20,y:FIELD.cy},1),false);
 for(let i=0;i<12;i++)m.step(1/120,{dx:0,dy:0});
 assert.equal(m.ball.owner,p.id);assert.equal(m.shots[0],0);assert.ok(m.pendingKick);
 advanceToContact(m);
 assert.equal(m.ball.owner,null);assert.equal(m.shots[0],1);assert.ok(Math.abs(m.elapsed-.105)<.00001);
 assert.ok(Math.abs(Math.hypot(m.ball.vx,m.ball.vy)-550)<.001);
 assert.ok(Math.abs(distance(p,m.ball)-10)<.001);
 for(let i=0;i<24;i++)m.step(1/120,{dx:0,dy:0});
 assert.equal(m.shots[0],1);assert.ok(m.ball.x<before.x-70);
});
test('passes contact sooner than shots and deferred launch is stable at 30, 60 and 120 Hz',()=>{
 const positions=[];
 for(const hz of [30,60,120]){
  const {m,p}=pacedMatch();m.kick(p,{x:350,y:318},.6);
  for(let i=0;i<hz/2;i++)m.step(1/hz,{dx:0,dy:0});
  assert.equal(m.passes[0],1);assert.ok(Math.abs(p.kickAt-.075)<.00001);
  positions.push(m.ball.x);
 }
 assert.ok(Math.max(...positions)-Math.min(...positions)<3);
});
test('wind-up freezes during pause and cancels on possession loss or a new kickoff',()=>{
 const {m,p}=pacedMatch();m.kick(p,{x:FIELD.left-20,y:318},1);
 m.step(1/60);const remaining=m.pendingKick.remaining;m.phase='paused';
 m.step(1/30);assert.equal(m.pendingKick.remaining,remaining);assert.equal(m.ball.owner,p.id);
 m.phase='playing';m.giveBall(m.players[20]);assert.equal(m.pendingKick,null);
 m.step(1/60,{dx:0,dy:0});assert.equal(m.shots[0],0);
 m.kickoff(0);m.kick(m.owner,{x:FIELD.left-20,y:318},1);m.kickoff(1);
 assert.equal(m.pendingKick,null);assert.equal(m.shots[0],0);
});
test('kick pose winds back before contact and settles smoothly after the ball leaves',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner;
 m.protection=2;m.kick(p,{x:FIELD.left-20,y:318},1);
 let backswing=false,contactPose=null,last=0,maxJump=0,after=0;
 for(let i=0;i<130;i++){
  m.step(1/240,{dx:0,dy:0});
  const snapshot=m.snapshot(),player=snapshot.players[p.id],pose=h.app.playerPose(player,snapshot.ball);
  if(m.pendingKick&&pose.kick<-.2)backswing=true;
  if(!m.pendingKick&&contactPose===null)contactPose=pose.kick;
  maxJump=Math.max(maxJump,Math.abs(pose.kick-last));last=pose.kick;after=pose.kick;
 }
 assert.ok(backswing);assert.ok(contactPose>.8&&contactPose<.95);
 assert.ok(maxJump<.3,'leg motion should not jump from idle to full extension');
 assert.equal(after,0);
});
test('movement starts and stops immediately while visual gait and heading ease between poses',()=>{
 const {m,p}=pacedMatch(),start={x:p.x,y:p.y};
 m.step(1/60,{dx:0,dy:1});assert.ok(p.y>start.y+1.8&&p.y<start.y+2.1);
 assert.ok(p.gaitSpeed>0&&p.gaitSpeed<p.speed);
 const running=p.gaitSpeed,stop={x:p.x,y:p.y};
 m.step(1/60,{dx:0,dy:0});assert.ok(distance(p,stop)<.001);
 assert.ok(p.gaitSpeed>0&&p.gaitSpeed<running);
 assert.ok(Number.isFinite(m.snapshot().players[p.id].angle));
});

test('human kickoff offers two seconds to aim, then normal tackling resumes',()=>{
 for(const [mode,team] of [['cup',0],['practice',0],['local',0],['local',1]]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);m.kickoff(team);
  const p=m.owner,defender=m.players[(1-team)*11+9];
  m.random=()=>0;
  const idle={dx:0,dy:0,teams:[{dx:0,dy:0},{dx:0,dy:0}]};
  for(let i=0;i<108;i++)m.step(1/60,idle);
  assert.equal(m.owner.id,p.id);assert.equal(m.tackles,0);
  if(mode!=='local')assert.ok(distance(defender,p)>45,'AI leaves space for the opening aim');
  else assert.ok(distance(defender,p)<=45,'the second human retains control of their stationary defender');
  for(let i=0;i<18;i++)m.step(1/60,idle);
  assert.equal(m.kickoffGrace,0);
  defender.x=p.x+15;defender.y=p.y;defender.cooldown=0;m.protection=0;
  m.step(1/60,idle);
  assert.equal(m.owner.team,1-team);assert.equal(m.tackles,1);
 }
});
test('kickoff grace ends at contact and does not carry into later possessions',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.owner;
 m.kick(p,{x:350,y:318},.6);assert.ok(m.kickoffGrace>0);
 advanceToContact(m);assert.equal(m.kickoffGrace,0);
 m.giveBall(p);assert.equal(m.kickoffGrace,0);assert.equal(m.protection,.55);
 m.kickoff(0);assert.equal(m.kickoffGrace,2);
 m.giveBall(m.players[20]);assert.equal(m.kickoffGrace,0);
 m.kickoff(1);assert.equal(m.kickoffGrace,0,'solo AI kickoff gets no extra immunity');
});
test('the first shot starts from a settled camera and does not zoom during contact',()=>{
 for(const rect of [{width:1440,height:810},{width:500,height:745}]){
  const h=uiHarness(html),canvas=h.elements.get('game');
  canvas.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.app.render(.1);assert.equal(h.app.camera.preset,'intro');
  h.flush();const m=h.app.match,c=h.app.camera;
  assert.equal(c.preset,'gameplay');
  assert.ok(c.zoom>3.5);assert.ok(Math.abs(c.yaw-(c.portrait?0:-.12))<.00001);
  const zoom=c.zoom;h.window.handlers.keydown({key:' ',target:{tagName:'CANVAS'},preventDefault(){},repeat:false});
  let maxCameraTravel=0;
  for(let frame=0;frame<30;frame++){
   const x=c.x,y=c.y,beforeZoom=c.zoom;
   m.step(1/60,h.app.input());h.app.render(1/60);
   const displacement=Math.hypot(c.x-x,c.y-y)*c.zoom;
   maxCameraTravel=Math.max(maxCameraTravel,displacement);
   assert.ok(Math.abs(c.zoom-beforeZoom)<=.16/60+.000001);
   if(m.pendingKick||m.snapshot().players[9].strike<.65&&m.snapshot().players[9].strike>0)assert.ok(Math.abs(c.zoom-zoom)<.00001);
   const ball=c.project(m.ball.x,m.ball.y,m.ball.z*.65+1.5);
   assert.ok(ball.x>0&&ball.x<c.width&&ball.y>0&&ball.y<c.height);
  }
  assert.ok(maxCameraTravel<c.width*.065,'opening camera must not lurch across the viewport');
 }
});
test('replay and halftime return directly to a settled kickoff camera before input',()=>{
 const h=localHarness(),m=h.app.match,c=h.app.camera;
 m.phase='half';h.app.syncMatch();h.app.render(.1);assert.equal(c.preset,'presentation');
 h.click('resume');assert.equal(c.preset,'gameplay');assert.equal(m.kickoffGrace,2);
 m.scorer=0;m.phase='replay';m.replayFrames=[m.snapshot()];h.app.syncMatch();h.app.render(.1);
 assert.equal(c.preset,'replay');h.click('skipReplay');assert.equal(c.preset,'gameplay');
 assert.ok(Math.abs(c.yaw+.12)<.00001);assert.equal(m.kickoffGrace,2);
});

function runIdleFrames(h,clock,seconds,check=()=>{}){
 const count=Math.round(seconds*30);
 for(let frame=0;frame<count;frame++){
  clock.time+=1000/30;h.tick(clock.time);h.draws.length=0;check(frame);
 }
}
test('actual idle frame loop never auto-kicks at practice or cup kickoff, including Restart Match',()=>{
 for(const mode of ['practice','cup']){
  const h=uiHarness(html),clock={time:0};
  h.chooseMode(mode);if(mode==='cup')h.click('startMatch');h.flush();
  for(let run=0;run<2;run++){
   const m=h.app.match,taker=m.owner,start={x:taker.x,y:taker.y};
   runIdleFrames(h,clock,1.8,()=>{
    assert.deepEqual(h.app.input(),{dx:0,dy:0});
    assert.equal(m.owner.id,taker.id);assert.equal(m.pendingKick,null);
    assert.deepEqual(m.passes,[0,0]);assert.deepEqual(m.shots,[0,0]);
    assert.ok(distance(taker,start)<.001,'idle taker does not run automatically');
    assert.equal(h.app.camera.preset,'gameplay');
   });
   runIdleFrames(h,clock,1.2,()=>{
    assert.equal(m.passes[0],0);assert.equal(m.shots[0],0);
    assert.ok(m.pendingKick?.player!==taker.id);
   });
   h.click('menuBtn');h.click('restartMatch');h.flush();
  }
 }
});
test('releasing a movement key keeps possession idle until an intentional shot',()=>{
 const h=uiHarness(html),clock={time:0};h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.owner;
 for(const q of m.players)if(q!==p){q.x=950;q.y=100+q.id*3;}
 m.protection=10;
 h.window.handlers.keydown({key:'ArrowLeft',target:{tagName:'CANVAS'},repeat:false,preventDefault(){}});
 runIdleFrames(h,clock,1.5);
 assert.ok(p.x<420);h.window.handlers.keyup({key:'ArrowLeft'});
 const stop={x:p.x,y:p.y};
 runIdleFrames(h,clock,3,()=>{
  assert.equal(m.owner.id,p.id);assert.ok(distance(p,stop)<.001);
  assert.equal(m.pendingKick,null);assert.equal(m.passes[0],0);assert.equal(m.shots[0],0);
 });
 h.window.handlers.keydown({key:' ',target:{tagName:'CANVAS'},repeat:false,preventDefault(){}});
 assert.ok(m.pendingKick);
 runIdleFrames(h,clock,.2);assert.equal(m.shots[0],1);assert.equal(m.passes[0],0);
});
test('idle human controls leave opposition shooting and off-ball teammate AI operational',()=>{
 const h=uiHarness(html),clock={time:0};h.chooseMode('practice');h.flush();
 const m=h.app.match,opponent=m.players[20];
 opponent.x=820;opponent.y=FIELD.cy;m.giveBall(opponent);
 const before=m.snapshot();
 runIdleFrames(h,clock,1);
 assert.ok(m.shots[1]>0,'opponent decides to shoot without human input');
 assert.equal(m.shots[0],0);assert.equal(m.passes[0],0);
 assert.ok(m.players.filter(p=>!p.keeper&&p.id!==m.active&&distance(p,before.players[p.id])>5).length>=6,'off-ball players still steer');
});

test('kick intent and wind-up belong to a possession, and stale intent cannot release after reacquisition',()=>{
 const {m,p}=pacedMatch();m.kick(p,{x:FIELD.left-20,y:318},1);
 const action=m.pendingKick;m.step(1/120,{dx:0,dy:0});
 assert.equal(m.snapshot().players.filter(q=>q.strikePhase==='windup').length,1);
 assert.equal(m.snapshot().players[p.id].strikePhase,'windup');
 m.giveBall(m.players[20]);assert.equal(m.pendingKick,null);
 assert.ok(m.snapshot().players.every(q=>q.strikePhase!=='windup'));
 m.giveBall(p);assert.equal(m.releaseKick(action),false);assert.equal(m.ball.owner,p.id);assert.equal(m.shots[0],0);
 assert.ok(m.kick(p,{x:FIELD.left-20,y:318},1));assert.ok(m.pendingKick.id!==action.id);
 advanceToContact(m);assert.equal(m.shots[0],1);
});
test('tackles cancel wind-up, while pass follow-through stays on its kicker rather than the receiver',()=>{
 const {m,p}=pacedMatch(),defender=m.players[20];
 m.kick(p,{x:FIELD.left-20,y:318},1);
 defender.x=p.x+15;defender.y=p.y;defender.cooldown=0;m.protection=0;m.random=()=>0;
 m.step(1/120,{dx:0,dy:0});
 assert.equal(m.owner.id,defender.id);assert.equal(m.pendingKick,null);assert.equal(m.shots[0],0);
 assert.ok(m.snapshot().players.every(q=>q.strikePhase==='idle'));
 const pass=pacedMatch(),receiver=pass.m.players[6];receiver.x=400;receiver.y=318;
 pass.m.kick(pass.p,receiver,.6);advanceToContact(pass.m);
 assert.equal(pass.m.snapshot().players[pass.p.id].strikePhase,'follow');
 assert.equal(pass.m.snapshot().players[receiver.id].strikePhase,'idle');
 pass.m.giveBall(receiver);
 assert.equal(pass.m.snapshot().players[receiver.id].strikePhase,'idle');
 assert.equal(pass.m.snapshot().players[pass.p.id].strikePhase,'follow','legitimate contact follow-through remains on the original kicker');
});
test('pointer aiming cancels on teammate possession, opponent possession, reacquisition or selection change',()=>{
 for(const transition of ['teammate','opponent','reacquire','selection']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();
  const m=h.app.match,c=h.elements.get('game'),p=m.owner;
  const at=h.app.camera.project(p.x,p.y),event=(x,y)=>({clientX:x,clientY:y,pointerId:7,preventDefault(){}});
  c.handlers.pointerdown(event(at.x,at.y));c.handlers.pointermove(event(at.x-120,at.y));
  if(transition==='teammate')m.giveBall(m.players[6]);
  if(transition==='opponent')m.giveBall(m.players[20]);
  if(transition==='reacquire'){m.giveBall(m.players[20]);m.giveBall(p);}
  if(transition==='selection')m.active=6;
  h.app.input();
  assert.equal(c.hasPointerCapture(7),false);
  c.handlers.pointerup(event(at.x-120,at.y));
  assert.equal(m.pendingKick,null);assert.deepEqual(m.shots,[0,0]);assert.deepEqual(m.passes,[0,0]);
 }
});
test('replay does not invent a strike when a wind-up is cancelled or interpolate another player by array position',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.owner;m.kick(p,{x:FIELD.left-20,y:318},1);
 for(let i=0;i<5;i++)m.step(1/240,{dx:0,dy:0});
 const windup=m.snapshot();m.giveBall(m.players[20]);const cancelled=m.snapshot();
 const sample=h.app.replaySample([windup,cancelled],.6);
 assert.equal(sample.players[p.id].strike,0);assert.equal(sample.players[p.id].strikePhase,'idle');
 const next=structuredSnapshot(cancelled);next.players.reverse();
 for(const q of next.players)q.x+=10;
 const mixed=h.app.replaySample([cancelled,next],.5);
 for(const q of mixed.players)assert.ok(Math.abs(q.x-(cancelled.players[q.id].x+5))<.001);
});
function structuredSnapshot(value){return JSON.parse(JSON.stringify(value));}
test('replay preserves contact ownership and cancels old follow-through when a player receives again',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.owner;m.kick(p,{x:FIELD.left-20,y:318},1);
 for(let i=0;i<11;i++)m.step(1/120,{dx:0,dy:0});
 const before=m.snapshot();advanceToContact(m);m.step(1/120,{dx:0,dy:0});const after=m.snapshot();
 const sample=h.app.replaySample([before,after],.9);
 assert.equal(sample.ball.owner,null);assert.equal(sample.players[p.id].strikePhase,'follow');
 m.giveBall(p);assert.equal(m.snapshot().players[p.id].strikePhase,'idle');
 assert.equal(m.snapshot().players[p.id].kick,0);
});

test('control marker transfers at contact while possession and follow-through retain distinct identities',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.owner;m.kick(p,{x:FIELD.left-20,y:318},1);
 m.step(1/120,h.app.input());
 let shot=m.snapshot(),marker=h.app.playerMarkers(shot.players[p.id],shot);
 assert.equal(marker.selected,true);assert.equal(marker.ownsBall,true);assert.equal(marker.follow,0);
 advanceToContact(m);shot=m.snapshot();
 const receiver=m.players[m.active],before={x:receiver.x,y:receiver.y};
 assert.ok(receiver.id!==p.id);
 marker=h.app.playerMarkers(shot.players[receiver.id],shot);
 assert.equal(marker.selected,true);assert.equal(marker.ownsBall,false);assert.equal(marker.follow,0);
 const kicker=h.app.playerMarkers(shot.players[p.id],shot);
 assert.equal(kicker.selected,false);assert.equal(kicker.ownsBall,false);assert.ok(kicker.follow>0);
 assert.equal(shot.players.filter(q=>h.app.playerMarkers(q,shot).ownsBall).length,0);
 m.step(1/60,{dx:1,dy:0});assert.ok(distance(receiver,before)>1,'receiver control responds before follow-through finishes');
});
test('new owners immediately get the possession ring in solo and local play without retaining an old owner ring',()=>{
 for(const local of [false,true]){
  const h=uiHarness(html);h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();
  const m=h.app.match;
  for(const id of [9,6,20,17,9]){
   m.giveBall(m.players[id]);const shot=m.snapshot();
   const owners=shot.players.filter(p=>h.app.playerMarkers(p,shot,local).ownsBall);
   assert.equal(owners.length,1);assert.equal(owners[0].id,id);
   const marker=h.app.playerMarkers(shot.players[id],shot,local);
   assert.equal(marker.follow,0);
   if(local||m.players[id].team===0)assert.ok(marker.selected);
   assert.equal(shot.players.filter(p=>h.app.playerMarkers(p,shot,local).selected).length,local?2:1);
  }
 }
});
test('replay handoff switches the control arrow at recorded contact, not during wind-up',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.owner;m.kick(p,{x:FIELD.left-20,y:318},1);
 for(let i=0;i<10;i++)m.step(1/120,h.app.input());
 const before=m.snapshot();advanceToContact(m);m.step(1/120,h.app.input());const after=m.snapshot();
 const wind=h.app.replaySample([before,after],.05),contact=h.app.replaySample([before,after],.95);
 assert.equal(wind.active,p.id);assert.equal(wind.ball.owner,p.id);
 assert.equal(contact.active,after.active);assert.equal(contact.ball.owner,null);
 assert.ok(h.app.playerMarkers(contact.players[p.id],contact).follow>0);
 assert.equal(h.app.playerMarkers(contact.players[p.id],contact).selected,false);
 assert.equal(h.app.playerMarkers(contact.players[after.active],contact).selected,true);
});
test('receiving pose cushions contact then settles without delaying movement or surviving a kickoff',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const m=h.app.match,p=m.players[6];m.giveBall(p);m.protection=2;
 const before={x:p.x,y:p.y};m.step(1/60,{dx:1,dy:0});
 assert.ok(distance(p,before)>1);assert.ok(m.snapshot().players[p.id].receive>0);
 for(let i=0;i<7;i++)m.step(1/120,{dx:0,dy:0});
 const snapshot=m.snapshot(),pose=h.app.playerPose(snapshot.players[p.id],snapshot.ball);
 assert.ok(pose.receive>.8);
 for(let i=0;i<30;i++)m.step(1/120,{dx:0,dy:0});
 assert.equal(m.snapshot().players[p.id].receive,0);
 m.kickoff(0);assert.ok(m.snapshot().players.every(q=>q.receive===0));
});

test('replay suppresses decorative board lettering while keeping skip and return to play functional',()=>{
 const h=uiHarness(html);h.app.render(1/60);
 const slogan=d=>d.method==='fillText'&&['PLAY TOGETHER','SOCCER SKILLS'].includes(d.args[0]);
 assert.ok(h.draws.some(slogan),'stadium lettering is retained outside replay');
 h.chooseMode('practice');h.flush();
 const m=h.app.match;m.scorer=0;m.phase='replay';
 const recorded=m.snapshot();recorded.ball.x=FIELD.left-1;recorded.ball.y=FIELD.cy;
 m.replayFrames=[recorded];m.replayTime=.5;h.app.syncMatch();
 h.draws.length=0;h.app.render(1/60);
 assert.equal(h.app.view,'replay');assert.equal(h.draws.some(slogan),false);
 assert.ok(h.elements.get('attackDirection').classList.contains('hidden'));
 assert.ok(h.draws.some(d=>d.method==='fill'),'replay scene continues to render');
 h.click('skipReplay');assert.equal(m.phase,'playing');assert.equal(h.app.view,'match');
 assert.ok(!h.elements.get('attackDirection').classList.contains('hidden'));
});
