import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html=readFileSync(new URL('../public/soccer-skills/index.html',import.meta.url),'utf8')
const engine=html.split('// BEGIN SOCCER ENGINE')[1].split('// END SOCCER ENGINE')[0]
const {SoccerMatch,NATIONS,FIELD,distance}=new Function(engine+';return {SoccerMatch,NATIONS,FIELD,distance};')()


function uiHarness(html){
  const elements=new Map(),timers=new Map(),timerDelays=[];let tid=0,animation=null;const draws=[];
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
      focus(){if(this.disabled)return;this.focused=true;document.activeElement=this;},width:1100,height:620,getContext:()=>drawing,
      getBoundingClientRect:()=>({left:0,top:0,right:id==='game'?1100:0,bottom:id==='game'?620:0,width:id==='game'?1100:0,height:id==='game'?620:0}),
      setPointerCapture(id){this.capture=id;},hasPointerCapture(id){return this.capture===id;},releasePointerCapture(){this.capture=null;}
    };
  }
  for(const m of html.matchAll(/\bid="([^"]+)"/g))elements.set(m[1],element(m[1]));
  for(const m of html.matchAll(/<([a-z][a-z0-9-]*)[^>]*\bid="([^"]+)"/gi)){const e=elements.get(m[2]);if(e)e.tagName=m[1].toUpperCase();}
  const go=[...html.matchAll(/data-go="([^"]+)"/g)].map((m,i)=>element('go'+i,{go:m[1]}));
  const penalties=[0,1,2].map(n=>element('penalty'+n,{penalty:String(n)}));
  const document={hidden:false,activeElement:null,handlers:{},getElementById:id=>elements.get(id),
    querySelector:selector=>{if(!selector.startsWith('#'))throw Error('Unmocked selector '+selector);return elements.get(selector.slice(1));},
    querySelectorAll:selector=>selector==='[data-go]'?go:selector==='[data-penalty]'?penalties:[],
    addEventListener(type,cb){this.handlers[type]=cb;}};
  const window={handlers:{},addEventListener(type,cb){this.handlers[type]=cb;}};
  const script='let drawnBall=null;const drawnPlayers=new Map(),drawnMarkers=new Map();const drawnPaths=[];let drawnAim=null,drawnForecast=null,drawnIndicatorShot=null;\n'+html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('function drawBall(b){','function drawBall(b){drawnBall={...b};').replace('function drawPlayer(p,marker,ball){','function drawPlayer(p,marker,ball){drawnPlayers.set(p.id,{...p});drawnMarkers.set(p.id,{...marker});').replace('function groundPath(points,fill,stroke,width=2){',"function groundPath(points,fill,stroke,width=2){if(stroke==='#30efff')drawnPaths.push(points.map(p=>p.slice()));").replace('function drawPlayerAimHUD(p,intent,forecast){','function drawPlayerAimHUD(p,intent,forecast){drawnAim={p:{...p},intent};').replace('function drawShotForecast(prediction){','function drawShotForecast(prediction){drawnForecast=prediction;').replace('function drawControlledIndicators(shot){','function drawControlledIndicators(shot){drawnIndicatorShot=shot;');
  const app=new Function('document','window','setTimeout','clearTimeout','requestAnimationFrame',
    script+'\nreturn {get drawnBall(){return drawnBall},drawnPlayers,drawnMarkers,drawnPaths,get drawnAim(){return drawnAim},get drawnForecast(){return drawnForecast},get drawnIndicatorShot(){return drawnIndicatorShot},localShotIntent,localShotPreview,localScreenDirection,localMovement,goalCelebrationFrame,interpolateLiveFrame,liveRenderSample,interpolateDribbleBall,replayDribbleBall,get match(){return match},get view(){return view},get round(){return round},get champion(){return champion},get drag(){return drag},setTeam,startMatch,syncMatch,continueCup,frame,camera,render,point,playerPose,playerSkeleton,playerMesh,playerWorldTransform,keeperHeldBall,gaitAmplitude,GAIT_CYCLE_SCALE,playerMarkers,input,bracketMarkup,cupFinalists,opponentFor,replaySample,goalAimGuide,pointerAim,shotForecast,aimPanelObstacles,matchKits,currentKits,kitContrast,edgePointer,controlEdgeObstacles,controlledIndicators,drawControlledIndicators};'
  )(document,window,(fn,delay)=>{timerDelays.push(delay);timers.set(++tid,fn);return tid;},id=>timers.delete(id),fn=>{animation=fn;});
  return {app,elements,go,penalties,document,window,draws,timerDelays,flush(){let n=0;while(timers.size&&n++<50){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}},
    flushUntilMatch(){let n=0;while(!app.match&&timers.size&&n++<50){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}assert.equal(app.view,'match');},
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
 m.giveBall(p);m.protection=3;
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
 Object.assign(m.ball,{owner:null,x:FIELD.left-4,y:FIELD.top+10,z:0,lastTouch:1});
 m.checkBoundary({x:FIELD.left+10,y:FIELD.top+10,z:0});
 assert.equal(m.restart.type,'Corner Kick');assert.equal(m.restart.team,0);
 m.takeRestart();const p=m.owner,spot={x:p.x,y:p.y};
 assert.equal(p.x,FIELD.left+6);assert.equal(p.y,FIELD.top+6);
 for(let i=0;i<180;i++)m.step(1/60);
 assert.equal(m.phase,'playing');assert.equal(m.ball.owner,p.id);assert.ok(distance(p,spot)<.01);
 for(let i=0;i<30;i++)m.step(1/60,{dx:1,dy:1});
 assert.ok(distance(p,spot)<.01);
 assert.ok(m.kick(p,{x:p.x+180,y:p.y+180},.5,true));advanceToContact(m);assert.equal(m.ball.owner,null);assert.equal(m.setPiece,null);
});
test('touchline exit, attacking miss, and defender touch produce different restarts',()=>{
 for(const fixture of [
  {x:500,y:FIELD.top-4,last:0,type:'Throw-in',team:1},
  {x:FIELD.left-4,y:120,last:0,type:'Goal Kick',team:1},
  {x:FIELD.left-4,y:120,last:1,type:'Corner Kick',team:0}]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);
  Object.assign(m.ball,{owner:null,x:fixture.x,y:fixture.y,z:0,lastTouch:fixture.last});
  m.checkBoundary({x:500,y:318,z:0});
  assert.equal(m.restart.type,fixture.type);assert.equal(m.restart.team,fixture.team);
 }
});
test('defenders win possession rather than simply following stationary dots',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.owner,defender=m.players[20];
 m.giveBall(p);defender.x=p.x-15;defender.y=p.y;m.protection=0;m.random=()=>0;
 m.step(1/60,{dx:0,dy:0});
 assert.equal(m.owner.team,1);assert.equal(m.tackles,1);
});
test('goalkeepers claim a reachable shot and record a save',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),keeper=m.players[11];
 Object.assign(m.ball,{owner:null,x:keeper.x+10,y:keeper.y,z:0,vx:-150,vy:0,vz:0,lastTouch:0,lock:0});
 m.step(1/60);assert.equal(m.owner.id,keeper.id);assert.equal(m.saves[1],1);
});

function playShootoutKick(m,outcome='goal',hz=60){
 assert.equal(m.phase,'playing');assert.equal(m.penalties.stage,'aim');
 const team=m.penalties.turn,offset=outcome==='goal'?45:outcome==='save'?0:80;
 // Controlled outcome fixture: commit a central keeper and a specified AI shot before input.
 const decision=m.penalties.decision;
 m.penalties.decision=Object.freeze({keeper:Object.freeze({...decision.keeper,y:FIELD.cy}),shot:Object.freeze({...decision.shot,y:FIELD.cy+offset,power:.85})});
 m.players[m.penalties.keeper].y=FIELD.cy;
 if(team===0)assert.ok(m.kick(m.owner,{x:m.penalties.goal+m.direction(team)*20,y:FIELD.cy+offset,shot:true},.85));

 const before=m.penalties.history.length;
 for(let frame=0;frame<hz*12&&m.phase!=='penalties';frame++)m.step(1/hz,{dx:0,dy:0});
 assert.equal(m.phase,'penalties');assert.equal(m.penalties.history.length,before+1);
 assert.equal(m.penalties.history.at(-1).outcome,outcome);
 return m.penalties.history.at(-1);
}
test('a draw goes to penalties; normal wins and losses use actual scores',()=>{
 const draw=new SoccerMatch(NATIONS[0],NATIONS[2]);draw.finish();assert.equal(draw.phase,'playing');assert.equal(draw.winner(),null);
 while(!draw.penalties.done){playShootoutKick(draw,draw.penalties.turn===0?'goal':'save');draw.nextShootoutKick();}
 assert.equal(draw.phase,'full');assert.equal(draw.winner(),0);assert.deepEqual(draw.penalties.taken,[3,3]);
 assert.deepEqual(draw.score,[0,0]);assert.deepEqual(draw.penalties.score,[3,0]);
 const win=new SoccerMatch(NATIONS[0],NATIONS[2]);win.score=[2,1];win.finish();assert.equal(win.winner(),0);
 const loss=new SoccerMatch(NATIONS[0],NATIONS[2]);loss.score=[0,2];loss.finish();assert.equal(loss.winner(),1);
});
test('penalty sudden death requires both sides to take equal attempts',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.finish();
 for(let i=0;i<10;i++){playShootoutKick(m,'goal');assert.ok(!m.penalties.done);m.nextShootoutKick();}
 assert.deepEqual(m.penalties.score,[5,5]);
 playShootoutKick(m,'goal');assert.ok(!m.penalties.done);assert.equal(m.winner(),null);m.nextShootoutKick();
 playShootoutKick(m,'save');assert.deepEqual(m.penalties.taken,[6,6]);assert.ok(m.penalties.done);m.nextShootoutKick();
 assert.equal(m.phase,'full');assert.equal(m.winner(),0);
});
test('halftime swaps directions and practice never ends on the match clock',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.giveBall(m.owner);m.minute=44.999;m.step(1/60);
 assert.equal(m.phase,'half');m.resumeHalf();assert.equal(m.direction(0),1);assert.equal(m.phase,'playing');
 const practice=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');practice.giveBall(practice.owner);practice.minute=100;practice.step(1/60);
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
 const c=h.elements.get('game'),m=h.app.match,p=m.owner;m.giveBall(p);m.protection=4;
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
 h.app.match.giveBall(h.app.match.owner);
 h.tick(16);h.tick(32);h.click('menuBtn');const minute=h.app.match.minute;
 h.tick(100);h.tick(200);assert.equal(h.app.match.minute,minute);
 h.click('resumePause');h.tick(300);assert.equal(h.app.match.minute,minute,'first resumed frame establishes the clock baseline');h.tick(320);assert.ok(h.app.match.minute>minute);
 h.app.match.scorer=0;h.app.match.phase='replay';h.app.match.replayFrames=[h.app.match.snapshot()];h.tick(400);
 h.click('skipReplay');assert.equal(h.app.match.phase,'playing');
});
test('local multiplayer has distinct setup and never claims online play',()=>{
 const h=uiHarness(html);h.chooseMode('multi');assert.equal(h.app.view,'local');assert.equal(h.app.match,null);
 assert.ok(html.includes('LOCAL TWO PLAYER'));assert.ok(html.includes('Keyboard required.'));
 h.click('startLocal');h.flush();assert.equal(h.app.match.mode,'local');
 assert.ok(h.elements.get('hint').textContent.includes('F pass / G shoot'));
});

test('a 0–0 regulation finish never declares the selected team the winner',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
 h.app.match.giveBall(h.app.match.owner);h.app.match.period=2;h.app.match.minute=89.999;h.app.match.step(1/60);h.app.syncMatch();
 assert.equal(h.app.view,'match');assert.equal(h.app.match.penalties.stage,'aim');assert.equal(h.app.match.winner(),null);
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
   if(m.setPiece&&m.owner?.team===0)m.kick(m.owner,m.setPiece==='Penalty Kick'?{x:m.goalX(0)+m.direction(0)*20,y:FIELD.cy+35}:m.bestPass(m.owner),.6,true);
   if(m.phase==='penalties')m.nextShootoutKick();
   m.step(1/60);
   assert.ok(m.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
   assert.ok(Number.isFinite(m.ball.x)&&Number.isFinite(m.ball.y));
  }
  assert.equal(m.phase,'full');assert.equal(m.minute,90);assert.ok(m.winner()!==null);
  assert.ok(m.tackles+m.interceptions[0]+m.interceptions[1]>0);assert.ok(m.passes[0]+m.passes[1]>0);
 }
});

test('shootout labels wait for both fifth kicks and stay in sudden death during its reply kick',()=>{
 const h=uiHarness(html);h.chooseMode('cup');h.click('startMatch');h.flush();
 const m=h.app.match;m.finish();h.app.syncMatch();
 for(let kick=0;kick<12;kick++){
  const label=kick>=10?'Sudden death':'Round '+(Math.floor(kick/2)+1);
  assert.equal(h.elements.get('penaltyPrompt').textContent,label+' · '+(kick%2===0?'Aim and release to shoot':'Move your goalkeeper'));
  playShootoutKick(m,kick===11?'save':'goal');h.app.syncMatch();
  assert.equal(h.app.view,'penalties');assert.equal(h.elements.get('nextPenalty').textContent,kick===11?'VIEW RESULT':'NEXT KICK');
  h.click('nextPenalty');
 }
 assert.equal(h.app.view,'full');assert.equal(m.winner(),0);
 assert.ok(h.elements.get('penalties').classList.contains('hidden'));
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
 assert.ok(desktop.elements.get('hint').textContent.includes('Aim + release to kick'));
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
  Object.assign(m.ball,{owner:null,x:side+d*4,y:318,z:0,lastTouch:team});
  m.checkBoundary({x:side-d*10,y:318,z:0});
  assert.equal(m.phase,'goal');assert.equal(m.score[team],1);assert.equal(m.score[1-team],0);
  m.skipReplay();assert.equal(m.owner.team,1-team);assert.equal(m.activeFor(1-team),m.owner.id);
 }
});
test('local halftime switches ends and local wins, losses and draws do not enter the cup',()=>{
 for(const score of [[2,1],[1,2],[1,1]]){
  const h=localHarness(),m=h.app.match;m.giveBall(m.owner);m.minute=44.999;m.step(1/60);h.app.syncMatch();
  assert.equal(h.app.view,'half');h.click('resume');assert.equal(m.period,2);assert.equal(m.direction(0),1);assert.equal(m.direction(1),-1);
  m.score=score;m.period=2;m.giveBall(m.owner);m.minute=89.999;m.step(1/60);h.app.syncMatch();assert.equal(h.app.view,'full');
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
  for(const q of m.players){q.x=q.team===team?950:(team===0?100:1000);q.y=110;}
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
  owner.x=550;owner.y=318;owner.angle=m.direction(team)>0?0:Math.PI;defender.x=550+m.direction(team)*15;defender.y=318;m.giveBall(owner);
  m.selectPlayer(1-team,defender.id);m.protection=0;m.random=()=>0;
  m.step(1/60);assert.equal(m.owner.id,defender.id);assert.equal(m.activeFor(1-team),defender.id);assert.equal(m.tackles,1);
 }
});
test('an untouched local kickoff waits indefinitely without dribbling, clock advance or AI kicks',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),before=m.snapshot();
 for(let i=0;i<1000;i++)m.step(1/60);
 assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Kick-off');assert.equal(m.minute,0);
 assert.deepEqual(m.score,[0,0]);assert.deepEqual(m.shots,[0,0]);assert.deepEqual(m.passes,[0,0]);
 assert.equal(m.owner.id,before.ball.owner);assert.equal(m.ball.x,550);assert.equal(m.ball.y,FIELD.cy);
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
 for(const expected of ['Player 1: WASD','F auto-selects a teammate and passes','G shoots','Q switches','Player 2: arrow keys','K auto-selects a teammate and passes','L shoots','O switches','Escape pauses']){
  assert.ok(description.textContent.includes(expected),expected);
 }
 assert.ok(!description.textContent.includes('Space shoots'));assert.ok(!description.textContent.includes('E auto-selects a teammate and passes'));
 assert.ok(!description.textContent.includes('Hold and drag'));
 h.click('startLocal');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — local two-player match');
 h.click('menuBtn');h.click('resumePause');
 assert.ok(description.textContent.includes('Player 2'));
 h.chooseMode('menu');h.chooseMode('practice');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — untimed practice');
 assert.ok(description.textContent.includes('Space shoots'));assert.ok(description.textContent.includes('E auto-selects a teammate and passes'));
 assert.ok(description.textContent.includes('Hold and drag'));assert.ok(!description.textContent.includes('Player 2'));
 h.chooseMode('menu');h.chooseMode('cup');h.click('startMatch');h.flush();
 assert.equal(canvas.getAttribute('aria-label'),'Soccer pitch — single-player cup');
 assert.ok(description.textContent.includes('Tab switches defender'));
 h.chooseMode('menu');h.chooseMode('multi');
 assert.ok(description.textContent.includes('K auto-selects a teammate and passes'));assert.ok(!description.textContent.includes('Space shoots'));
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
 for(const event of ['Pass!','Shot!','P1: Pass!','P1: Shot!','P2: Pass!','P2: Shot!']){
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

test('restart announcements describe the stationary restart, then clear at contact, menu and result transitions',()=>{
 const h=localHarness(),m=h.app.match;
 const restart=()=>{m.phase='restart';m.restart={type:'Goal Kick',team:1,x:1000,y:318};h.app.syncMatch();assert.ok(h.elements.get('matchStatus').textContent.includes('Goal Kick'));};
 restart();h.click('takeCorner');assert.ok(h.elements.get('matchStatus').textContent.includes('Ball stationary'));
 h.window.handlers.keydown(keyEvent('k'));advanceToContact(m);h.app.syncMatch();assert.equal(h.elements.get('matchStatus').textContent,'');
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
 assert.equal(m.ball.owner,null);assert.equal(m.shots[0],1);assert.ok(Math.abs(m.elapsed-.14)<.00001);
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

test('kickoff positioning and stationary ball survive input and AI until explicit contact',()=>{
 for(const mode of ['cup','practice','local'])for(const team of [0,1])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);m.period=period;m.kickoff(team);
  const p=m.owner,idle={dx:1,dy:1,teams:[{dx:1,dy:1},{dx:-1,dy:-1}]};
  // Solo opposition is intentionally AI-controlled; test its pre-contact interval.
  for(let i=0;i<(team===1&&mode!=='local'?30:300);i++)m.step(1/60,idle);
  assert.equal(m.setPiece,'Kick-off');assert.equal(m.ball.x,550);assert.equal(m.ball.y,318);
  assert.equal(p.x,550);assert.equal(p.y,318);assert.equal(m.minute,0);
  for(const q of m.players)if(q.id!==p.id){
   assert.ok((q.x-550)*m.direction(q.team)<=.001,'own half until contact');
   if(q.team!==team)assert.ok(distance(q,m.ball)>=66);
  }
  assert.ok(m.kick(p,{x:550+m.direction(team)*80,y:380},.6));advanceToContact(m);
  assert.equal(m.setPiece,null);assert.equal(m.restartGuard,null);assert.equal(m.ball.owner,null);
  m.step(1/60,idle);assert.ok(m.minute>0);
 }
});

test('kickoff grace ends at contact and does not carry into later possessions',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.owner;
 m.kick(p,{x:350,y:318},.6);assert.ok(m.kickoffGrace>0);
 advanceToContact(m);assert.equal(m.kickoffGrace,0);
 m.giveBall(p);assert.equal(m.kickoffGrace,0);assert.equal(m.protection,.8);
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
 const m=h.app.match,p=m.owner;m.giveBall(p);
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
 for(const q of m.players)if(q.team===0){q.x=300;q.y=100+q.id*20;}
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
 defender.x=p.x-15;defender.y=p.y;defender.cooldown=0;m.protection=0;m.random=()=>0;
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
test('pointer capture persists across possession and selection changes but stale release cannot kick',()=>{
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
  assert.equal(c.hasPointerCapture(7),true);
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

function restartFixture(type,team=0,period=1){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
 const x=type==='Goal Kick'?m.ownGoalX(team):m.goalX(team);
 m.phase='restart';m.restart={type,team,x:x+(x===FIELD.left?6:-6),y:type==='Goal Kick'?FIELD.cy:FIELD.top};
 m.takeRestart();return m;
}
test('goal-kick box exclusion holds for both sides and halves while teammates may receive inside',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const m=restartFixture('Goal Kick',team,period),taker=m.owner,d=m.direction(team);
  const opponent=m.players[(1-team)*11+9],teammate=m.players[team*11+6];
  teammate.x=m.ownGoalX(team)+d*85;teammate.y=FIELD.cy+40;
  const idle={teams:[{dx:0,dy:0},{dx:0,dy:0}]};
  for(let i=0;i<120;i++){
   opponent.x=taker.x+d*10;opponent.y=taker.y;m.selectPlayer(1-team,opponent.id);
   m.step(1/60,idle);
   assert.ok(m.players.filter(p=>p.team!==team).every(p=>!m.inPenalty(p,team)));
   assert.equal(m.ball.x,m.restartGuard.x);assert.equal(m.ball.y,m.restartGuard.y);
   assert.equal(m.owner.id,taker.id);
  }
  teammate.x=m.ownGoalX(team)+d*85;teammate.y=FIELD.cy+40;m.enforceRestart();
  assert.ok(m.inPenalty(teammate,team),'teammates are allowed inside the box');
  assert.ok(m.kick(taker,teammate,.5));advanceToContact(m);
  assert.equal(m.restartGuard,null);assert.equal(m.offside,null);
  teammate.x=m.ball.x+d*22;teammate.y=m.ball.y;m.ball.lock=0;
  assert.equal(m.receiveBall(teammate),false);assert.equal(m.owner.id,teammate.id);
 }
});
test('an early goal-kick entrant is removed before contact and cannot steal or launch the ball',()=>{
 const m=restartFixture('Goal Kick'),p=m.owner,q=m.players[20];
 m.kick(p,{x:800,y:360},.6);q.x=p.x;q.y=p.y;m.protection=0;m.random=()=>0;
 advanceToContact(m);assert.ok(!m.inPenalty(q,0));assert.equal(m.tackles,0);assert.equal(m.passes[0],1);
 // Once kicked, normal opponent control is allowed back into the box.
 q.x=m.ownGoalX(0)+m.direction(0)*120;q.y=318;m.activeAway=q.id;
 m.step(1/60,{teams:[{dx:0,dy:0},{dx:-m.direction(0),dy:0}]});assert.ok(m.inPenalty(q,0));
});
test('corner and throw-in positions and spacing are enforced through keyboard movement until release',()=>{
 for(const type of ['Corner Kick','Throw-in'])for(const team of [0,1]){
  const m=restartFixture(type,team),p=m.owner;
  for(const q of m.players)if(q.team!==team){q.x=p.x;q.y=p.y;}
  for(let i=0;i<60;i++)m.step(1/60,{teams:[{dx:-1,dy:-1},{dx:-1,dy:-1}]});
  const r=m.restartGuard;
  if(type==='Corner Kick'){
   assert.ok(Math.hypot(r.x-(r.x<550?FIELD.left:FIELD.right),r.y-FIELD.top)<=12);
   assert.ok(m.players.filter(q=>q.team!==team).every(q=>distance(q,r)>=78-.01));
  }else{
   assert.equal(r.y,FIELD.top);
   assert.ok(m.players.filter(q=>q.team!==team).every(q=>distance(q,r)>=19-.01));
   assert.equal(m.kick(p,{x:p.x+30,y:FIELD.top-100},.5),false,'outward throw rejected');
  }
  assert.equal(m.ball.x,r.x);assert.equal(m.ball.y,r.y);
 }
});
test('whole-ball crossing and first diagonal boundary determine stoppage and ownership',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]),side=m.goalX(team),d=m.direction(team);m.giveBall(m.owner);
  Object.assign(m.ball,{owner:null,x:side+d*.01,y:318,z:0,lastTouch:team});
  assert.equal(m.checkBoundary({x:side-d*10,y:318,z:0}),false);assert.deepEqual(m.score,[0,0]);
  m.ball.x=side+d*3.01;assert.equal(m.checkBoundary({x:side+d*.01,y:318,z:0}),true);assert.equal(m.score[team],1);
 }
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.giveBall(m.owner);
 Object.assign(m.ball,{owner:null,x:FIELD.left-20,y:FIELD.top-40,z:0,lastTouch:0});
 m.checkBoundary({x:FIELD.left+80,y:FIELD.top+10,z:0});
 assert.equal(m.restart.type,'Throw-in');assert.equal(m.restart.team,1);
 assert.ok(Math.abs(m.restart.x-(FIELD.left+57))<.001);
});
test('a throw-in or indirect free kick cannot score directly; direct own-goal restarts award corners',()=>{
 for(const type of ['Throw-in','Indirect Free Kick','Goal Kick','Corner Kick','Kick-off'])
 for(const ownGoal of [false,true])for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.giveBall(m.owner);
  const side=ownGoal?m.ownGoalX(team):m.goalX(team),d=side===FIELD.left?-1:1;
  m.lastRestart={type,team,taker:team*11+9};
  Object.assign(m.ball,{owner:null,x:side+d*4,y:318,z:0,lastTouch:team});
  m.checkBoundary({x:side-d*8,y:318,z:0});
  const denied=ownGoal||type==='Throw-in'||type==='Indirect Free Kick';
  assert.equal(m.phase,denied?'restart':'goal');
  if(denied){assert.equal(m.restart.type,ownGoal?'Corner Kick':'Goal Kick');assert.equal(m.restart.team,1-team);}
  else assert.equal(m.score[team],1);
 }
});
test('all restarts award an indirect free kick for second touch and clear the restriction on another touch',()=>{
 for(const type of ['Goal Kick','Corner Kick','Throw-in','Indirect Free Kick','Kick-off']){
  const m=type==='Kick-off'?new SoccerMatch(NATIONS[0],NATIONS[2],'local'):restartFixture(type);
  const p=m.owner;m.kick(p,{x:550,y:400},.5);advanceToContact(m);
  assert.equal(m.lastRestart.taker,p.id);
  assert.ok(m.receiveBall(p));assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Indirect Free Kick');assert.equal(m.restart.team,1);
  m.takeRestart();assert.equal(m.setPiece,'Indirect Free Kick');
  const n=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),k=n.owner;n.kick(k,{x:600,y:380},.5);advanceToContact(n);
  const receiver=n.players[6];assert.equal(n.receiveBall(receiver),false);assert.equal(n.lastRestart,null);
  assert.equal(n.receiveBall(k),false);assert.equal(n.owner.id,k.id);
 }
});
test('offside uses pass-contact positions and second-last defender, with direct restart exceptions',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const p=m.players[team*11+6],receiver=m.players[team*11+9],d=m.direction(team);
  p.x=550+d*90;p.y=318;m.giveBall(p);
  for(const q of m.players)if(q.team!==team){q.x=550+d*200;q.y=120;}
  m.players[(1-team)*11].x=550+d*420;receiver.x=550+d*250;receiver.y=350;
  m.kick(p,receiver,.6);advanceToContact(m);
  assert.ok(m.offside.ids.includes(receiver.id));
  receiver.x=550-d*10;assert.ok(m.receiveBall(receiver),'returning onside does not erase the earlier offside position');
  assert.equal(m.restart.type,'Indirect Free Kick');assert.equal(m.restart.team,1-team);
 }
 for(const type of ['Goal Kick','Corner Kick','Throw-in']){
  const m=restartFixture(type),p=m.owner;m.kick(p,{x:550,y:400},.6);advanceToContact(m);
  assert.equal(m.offside,null);
 }
});
test('offside does not penalise level, own-half or behind-ball receivers and resets on opponent control',()=>{
 for(const kind of ['level','own-half','behind-ball']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.owner,r=m.players[6];p.x=450;m.giveBall(p);
  for(const q of m.players)if(q.team===1){q.x=300;q.y=120;}
  m.players[11].x=100;r.x=kind==='level'?300:kind==='own-half'?600:470;r.y=400;
  m.kick(p,r,.5);advanceToContact(m);assert.ok(!m.offside.ids.includes(r.id));assert.equal(m.receiveBall(r),false);
 }
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.giveBall(m.owner);
 m.offside={team:0,ids:[6]};assert.equal(m.receiveBall(m.players[20]),false);assert.equal(m.offside,null);
});
test('goalkeeper handling is limited to own box, protects possession and awards a corner after eight seconds',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const keeper=m.players[team*11];m.giveBall(keeper);m.ball.lastTouch=1-team;m.receiveBall(keeper);
  assert.equal(m.handOwner,keeper.id);
  const q=m.players[(1-team)*11+9];m.random=()=>0;m.protection=0;
  for(let i=0;i<100;i++){q.x=keeper.x;q.y=keeper.y;m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});}
  assert.equal(m.owner.id,keeper.id);assert.equal(m.tackles,0);
  keeper.held=8.01;m.step(1/60);assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Corner Kick');assert.equal(m.restart.team,1-team);
 }
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),k=m.players[0];k.x=550;m.ball.lastTouch=1;m.receiveBall(k);assert.equal(m.handOwner,null);
 m.ball.lastTouch=0;k.x=m.ownGoalX(0)+m.direction(0)*30;m.receiveBall(k);assert.equal(m.handOwner,null,'teammate pass is controlled with feet');
});
function pointerEvent(h,x,y,id=31,type='mouse'){
 const c=h.elements.get('game'),r=c.getBoundingClientRect();
 return {clientX:r.left+x*r.width/1100,clientY:r.top+y*r.width/1100,pointerId:id,pointerType:type,button:0,isPrimary:true,preventDefault(){}};
}
test('continuous held pointer resumes running after loss and reacquisition, but release alone never fires stale intent',()=>{
 for(const type of ['mouse','touch']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner;m.giveBall(p);
  const a=h.app.camera.project(p.x,p.y),ev=(x,y)=>pointerEvent(h,x,y,31,type);
  c.handlers.pointerdown(ev(a.x,a.y));c.handlers.pointermove(ev(a.x,a.y+90));
  m.giveBall(m.players[20]);h.app.input();assert.ok(c.hasPointerCapture(31));
  const r=m.players[6];r.x=600;r.y=320;m.giveBall(r);const before={x:r.x,y:r.y};
  for(let i=0;i<10;i++)m.step(1/60,h.app.input());
  assert.ok(distance(before,r)>10);assert.ok(c.hasPointerCapture(31));
  c.handlers.pointerup(ev(a.x,a.y+90));assert.equal(m.pendingKick,null);assert.deepEqual(m.passes,[0,0]);assert.deepEqual(m.shots,[0,0]);
 }
});
test('fresh drag after held-pointer reacquisition passes once from the new owner and uses current aim',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner;m.giveBall(p);
 const ev=(x,y)=>pointerEvent(h,x,y),a=h.app.camera.project(p.x,p.y);
 c.handlers.pointerdown(ev(a.x,a.y));c.handlers.pointermove(ev(a.x-100,a.y));
 m.giveBall(m.players[20]);h.app.input();const r=m.players[6];r.x=620;r.y=320;m.giveBall(r);h.app.input();
 c.handlers.pointermove(ev(a.x-100,a.y+100));c.handlers.pointerup(ev(a.x-100,a.y+100));
 assert.equal(m.pendingKick.player,r.id);assert.ok(m.pendingKick.target.y>r.y);assert.equal(m.snapshot().players[p.id].strikePhase,'idle');
 advanceToContact(m);const count=m.passes[0]+m.shots[0];
 c.handlers.pointerup(ev(a.x-100,a.y+100));assert.equal(m.passes[0]+m.shots[0],count);assert.equal(count,1);
});
test('mouse and scaled touch aim at a teammate, release exactly once, and real flight transfers possession',()=>{
 for(const type of ['mouse','touch'])for(const kickoff of [false,true]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game');
  if(type==='touch')c.getBoundingClientRect=()=>({left:17,top:60,width:550,height:310});
  const p=m.owner,r=m.players[6];if(!kickoff)m.giveBall(p);
  // An onside teammate in the taker half; defenders remain beyond the halfway line.
  for(const q of m.players)if(q!==p&&q!==r){q.x=q.team===0?900:250;q.y=120;}
  r.x=650;r.y=340;m.protection=5;
  const from=h.app.camera.project(p.x,p.y),to=h.app.camera.project(r.x,r.y),ev=(v)=>pointerEvent(h,v.x,v.y,31,type);
  c.handlers.pointerdown(ev(from));c.handlers.pointermove(ev(to));c.handlers.pointerup(ev(to));
  assert.ok(m.pendingKick);assert.ok(distance(m.pendingKick.target,r)<1);assert.equal(m.pendingKick.player,p.id);
  advanceToContact(m);assert.equal(m.passes[0],1);c.handlers.pointerup(ev(to));assert.equal(m.passes[0],1);
  for(let i=0;i<180&&!m.owner&&m.phase==='playing';i++)m.step(1/60,{dx:0,dy:0});
  assert.equal(m.owner?.id,r.id);assert.equal(m.restarts,0);
 }
});
test('drag length changes pass power and travel; pointer cancellation and secondary fingers cannot kick',()=>{
 const speeds=[];
 for(const pixels of [45,140]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner;
  const at=h.app.camera.project(p.x,p.y),ev=(dy,id=31)=>pointerEvent(h,at.x,at.y+dy,id);
  c.handlers.pointerdown(ev(0));c.handlers.pointermove(ev(pixels));c.handlers.pointerup(ev(pixels));
  assert.ok(m.pendingKick);advanceToContact(m);speeds.push(Math.hypot(m.ball.vx,m.ball.vy));
 }
 assert.ok(speeds[1]>speeds[0]*1.2);
 for(const cancel of ['pointercancel','lostpointercapture','blur']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),at=h.app.camera.project(m.owner.x,m.owner.y),ev=(id=31)=>pointerEvent(h,at.x+100,at.y+80,id,'touch');
  c.handlers.pointerdown(pointerEvent(h,at.x,at.y,31,'touch'));c.handlers.pointermove(ev());
  c.handlers.pointerdown({...ev(32),isPrimary:false});c.handlers.pointerup(ev(32));assert.equal(m.pendingKick,null);
  if(cancel==='blur')h.window.handlers.blur();else c.handlers[cancel](ev());
  c.handlers.pointerup(ev());assert.equal(m.pendingKick,null);assert.deepEqual(m.passes,[0,0]);
 }
});

test('passes aimed at a teammate near goal remain passes and carry explicit power through contact',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.owner,r=m.players[6];
 p.x=230;p.y=318;m.giveBall(p);r.x=FIELD.left+50;r.y=350;
 for(const q of m.players)if(q.team===1){q.x=FIELD.left+20;q.y=120;}
 assert.ok(m.kick(p,r,.4));assert.ok(m.pendingKick.target.pass);
 advanceToContact(m);assert.equal(m.passes[0],1);assert.equal(m.shots[0],0);
});
test('crossbar clearance follows the same height scale and radius as the rendered ball',()=>{
 for(const above of [false,true]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.giveBall(m.owner);
  Object.assign(m.ball,{owner:null,x:FIELD.left-4,y:318,z:above?70:40,lastTouch:0});
  m.checkBoundary({x:FIELD.left+8,y:318,z:above?70:40});
  assert.equal(m.phase,above?'restart':'goal');
 }
});
test('second half and every post-goal kickoff require the correct team to kick before dribbling',()=>{
 const h=localHarness(),m=h.app.match;
 for(const transition of ['half','home-goal','away-goal']){
  if(transition==='half'){m.phase='half';h.app.syncMatch();h.click('resume');}
  else{m.scorer=transition==='home-goal'?0:1;m.phase='replay';m.replayFrames=[m.snapshot()];h.app.syncMatch();h.click('skipReplay');}
  const team=transition==='away-goal'?0:1,p=m.owner,spot={x:p.x,y:p.y};
  assert.equal(p.team,team);assert.equal(m.setPiece,'Kick-off');
  h.window.handlers.keydown(keyEvent(team===0?'w':'ArrowUp'));
  for(let i=0;i<20;i++)m.step(1/60,h.app.input());
  assert.ok(distance(p,spot)<.001);assert.equal(m.ball.x,550);assert.equal(m.ball.y,318);
  h.window.handlers.keydown(keyEvent(team===0?'k':'f'));assert.equal(m.pendingKick,null);
  h.window.handlers.keydown(keyEvent(team===0?'f':'k'));advanceToContact(m);
  assert.equal(m.setPiece,null);assert.equal(m.ball.lastTouch,team);
 }
});

function contactFixture(team=0,period=1,inside=false){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
 for(const q of m.players){q.x=450+(q.id%4)*65;q.y=110+Math.floor(q.id/4)*23;}
 const p=m.players[team*11+9],q=m.players[(1-team)*11+9],d=m.direction(team);
 p.x=inside?m.goalX(team)-d*80:550;p.y=FIELD.cy;p.angle=d>0?0:Math.PI;
 q.x=p.x-d*24;q.y=p.y;m.giveBall(p);m.selectPlayer(1-team,q.id);m.random=()=>1;m.protection=0;
 const controls={teams:[{dx:0,dy:0},{dx:0,dy:0}]};controls.teams[1-team]={dx:d,dy:0};
 return {m,p,q,d,controls};
}
test('visible charging contact from behind awards a direct free kick or penalty in both halves and for both teams',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const inside of [false,true]){
  const {m,p,q,controls}=contactFixture(team,period,inside);
  for(let i=0;i<25&&m.phase==='playing';i++)m.step(1/60,controls);
  assert.equal(m.phase,'restart');assert.equal(m.restart.team,team);assert.equal(m.restart.type,inside?'Penalty Kick':'Direct Free Kick');
  assert.equal(m.fouls[1-team],1);assert.equal(m.fouls[team],0);assert.equal(m.lastFoul.offender,q.id);assert.equal(m.lastFoul.victim,p.id);
  assert.equal(m.pendingKick,null);assert.equal(m.ball.owner,null);assert.ok(m.event.includes('Challenge from behind'));
  assert.ok(m.snapshot().players[p.id].fouled>0);
  for(let i=0;i<10;i++)m.step(1/60,controls);assert.equal(m.fouls[1-team],1);
 }
});
test('stationary proximity, a retreating defender and a clean ball-side challenge do not become fouls',()=>{
 for(const action of ['idle','retreat','clean']){
  const {m,p,q,d,controls}=contactFixture();q.x=p.x-d*16;
  controls.teams[1]={dx:action==='retreat'?-d:0,dy:0};
  if(action==='clean'){q.x=p.x+d*20;controls.teams[1]={dx:-d,dy:0};m.random=()=>0;}
  for(let i=0;i<15&&m.phase==='playing';i++)m.step(1/60,controls);
  assert.deepEqual(m.fouls,[0,0]);assert.equal(m.phase,'playing');
  if(action==='clean'){assert.equal(m.owner.team,1);assert.equal(m.tackles,1);}
 }
});
test('late contact after a released pass is penalised but dead-ball collisions are not',()=>{
 const {m,p,q,d,controls}=contactFixture();
 m.kick(p,{x:p.x+d*220,y:p.y},.8);advanceToContact(m);assert.equal(m.ball.owner,null);
 for(let i=0;i<20&&m.phase==='playing';i++)m.step(1/60,controls);
 assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Direct Free Kick');assert.equal(m.lastFoul.reason,'Late challenge');
 const counts=[...m.fouls];m.takeRestart();
 for(let i=0;i<60;i++){q.x=p.x-d*5;q.y=p.y;m.step(1/60,controls);}
 assert.deepEqual(m.fouls,counts);assert.equal(m.setPiece,'Direct Free Kick');
});
test('foul location on the area line is a penalty; outside contact remains a free kick',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const outside of [false,true]){
  const {m,p,q,d}=contactFixture(team,period,true);
  p.x=m.goalX(team)-d*(126+(outside?.1:0));p.y=318;
  m.foul(q,p,'Challenge from behind');
  assert.equal(m.restart.type,outside?'Direct Free Kick':'Penalty Kick');
  if(outside)assert.equal(m.restart.x,p.x);else assert.equal(m.restart.x,m.goalX(team)-d*90);
 }
});
test('direct free kicks keep a stationary ball and legal distances, including defending-area free kicks',()=>{
 for(const team of [0,1])for(const ownArea of [false,true]){
  const {m,p,q,d}=contactFixture(team,1,false);
  if(ownArea){p.x=m.ownGoalX(team)+d*30;p.y=318;}
  m.foul(q,p,'Late challenge');m.takeRestart();const r=m.restartGuard,spot={x:r.x,y:r.y};
  for(const opp of m.players)if(opp.team!==team){opp.x=p.x;opp.y=p.y;}
  for(let i=0;i<60;i++)m.step(1/60,{teams:[{dx:1,dy:1},{dx:-1,dy:-1}]});
  assert.equal(m.setPiece,'Direct Free Kick');assert.equal(m.ball.x,spot.x);assert.equal(m.ball.y,spot.y);
  for(const opp of m.players)if(opp.team!==team){assert.ok(distance(opp,spot)>=66);if(ownArea)assert.ok(!m.inPenalty(opp,team));}
  m.kick(m.owner,{x:550,y:450,pass:true},.5);advanceToContact(m);
  assert.equal(m.setPiece,null);assert.equal(m.lastRestart.type,'Direct Free Kick');
  const taker=m.players[m.lastRestart.taker];m.receiveBall(taker);
  assert.equal(m.restart.type,'Indirect Free Kick');assert.equal(m.restart.team,1-team);
 }
});
test('direct free kick may score in opposing goal, never directly in own goal',()=>{
 for(const own of [false,true]){
  const {m,p,q}=contactFixture();m.foul(q,p,'Late challenge');m.takeRestart();
  const side=own?m.ownGoalX(0):m.goalX(0),d=side===FIELD.left?-1:1;
  m.kick(m.owner,{x:side+d*20,y:318},.8);advanceToContact(m);
  Object.assign(m.ball,{x:side+d*4,y:318,z:0});
  m.checkBoundary({x:side-d*10,y:318,z:0});
  assert.equal(m.phase,own?'restart':'goal');
  if(own)assert.equal(m.restart.type,'Corner Kick');else assert.equal(m.score[0],1);
 }
});
test('penalty setup excludes both teams from the area and arc, keeps keeper on line, and rejects backwards kicks',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const {m,p,q,d}=contactFixture(team,period,true);m.foul(q,p,'Challenge from behind');m.takeRestart();
  const taker=m.owner,keeper=m.players[(1-team)*11],spot={x:m.goalX(team)-d*90,y:318};
  assert.equal(m.activeFor(1-team),keeper.id);
  for(let i=0;i<90;i++){
   const controls={teams:[{dx:1,dy:1},{dx:1,dy:1}]};m.step(1/60,controls);
   assert.equal(taker.x,spot.x);assert.equal(m.ball.x,spot.x);assert.equal(m.ball.y,318);
   assert.equal(keeper.x,m.goalX(team));assert.ok(Math.abs(keeper.y-318)<=48);
   for(const v of m.players)if(v.id!==taker.id&&v.id!==keeper.id){
    assert.ok(!m.inPenalty(v,1-team));assert.ok((v.x-spot.x)*d<0);assert.ok(distance(v,spot)>=66);
   }
  }
  assert.equal(m.kick(taker,{x:spot.x-d*50,y:318},1),false);assert.equal(m.pendingKick,null);
  assert.ok(m.kick(taker,{x:m.goalX(team)+d*20,y:355},.8,true));
  for(let i=0;i<5;i++){m.step(1/120);assert.equal(keeper.x,m.goalX(team));}
  advanceToContact(m);assert.equal(m.setPiece,null);assert.equal(m.ball.vz,0);
  assert.ok(m.ball.vx*d>0);assert.equal(m.lastRestart.type,'Penalty Kick');
 }
});
test('a real in-match penalty scores through ball flight and restarts with the conceding team',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const {m,p,q,d}=contactFixture(team,period,true);m.foul(q,p,'Challenge from behind');m.takeRestart();
  m.players[(1-team)*11].y=FIELD.cy-45;
  m.kick(m.owner,{x:m.goalX(team)+d*20,y:FIELD.cy+45},.9);advanceToContact(m);
  for(let i=0;i<90&&m.phase==='playing';i++)m.step(1/60);
  assert.equal(m.phase,'goal');assert.equal(m.score[team],1);m.skipReplay();
  assert.equal(m.setPiece,'Kick-off');assert.equal(m.owner.team,1-team);assert.equal(m.penaltyRun,null);
 }
});
test('a saved in-match penalty remains live, while a taker second touch awards an indirect free kick',()=>{
 const {m,p,q}=contactFixture(0,1,true);m.foul(q,p,'Challenge from behind');m.takeRestart();
 const taker=m.owner,keeper=m.players[11];m.kick(taker,{x:FIELD.left-20,y:318},1);advanceToContact(m);
 m.receiveBall(keeper);assert.equal(m.phase,'playing');assert.equal(m.owner.id,keeper.id);assert.equal(m.penaltyRun,null);
 const n=contactFixture(0,1,true);n.m.foul(n.q,n.p,'Challenge from behind');n.m.takeRestart();
 n.m.kick(n.m.owner,{x:FIELD.left-20,y:318},1);advanceToContact(n.m);n.m.receiveBall(n.p);
 assert.equal(n.m.restart.type,'Indirect Free Kick');assert.equal(n.m.restart.team,1);
});
test('penalties awarded near the interval are completed before the half or match ends',()=>{
 for(const period of [1,2])for(const outcome of ['goal','save','miss','stopped']){
  const {m,p,q,d}=contactFixture(0,period,true);m.minute=period===1?44.999:89.999;
  m.foul(q,p,'Challenge from behind');m.takeRestart();
  for(let i=0;i<20;i++)m.step(1/60);
  assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Penalty Kick');assert.ok(m.penaltyRun.extended);
  m.kick(m.owner,{x:m.goalX(0)+d*20,y:FIELD.cy+40},.8);advanceToContact(m);
  if(outcome==='goal'){
   Object.assign(m.ball,{x:m.goalX(0)+d*4,y:318,z:0});
   m.checkBoundary({x:m.goalX(0)-d*10,y:318,z:0});assert.equal(m.phase,'goal');m.skipReplay();
  }else if(outcome==='save')m.receiveBall(m.players[11]);
  else if(outcome==='miss'){
   Object.assign(m.ball,{x:m.goalX(0)+d*4,y:FIELD.top+50,z:0});m.checkBoundary({x:m.goalX(0)-d*10,y:FIELD.top+50,z:0});
  }else{Object.assign(m.ball,{vx:0,vy:0,vz:0,z:0,lock:1,x:550,y:110});m.step(1/60);}
  assert.equal(m.phase,period===1?'half':'full');assert.equal(m.minute,period===1?45:90);
  assert.equal(m.setPiece,null);assert.equal(m.penaltyRun,null);
 }
});
test('foul detection is stable at 30, 60 and 120 Hz and does not depend on random draws',()=>{
 for(const hz of [30,60,120])for(const random of [0,.5,1]){
  const {m,controls}=contactFixture();m.random=()=>random;
  for(let i=0;i<hz&&m.phase==='playing';i++)m.step(1/hz,controls);
  assert.equal(m.restart?.type,'Direct Free Kick');assert.equal(m.lastFoul.reason,'Challenge from behind');
 }
});

test('foul UI names the offence, clears a held gesture and exposes penalty controls for the proper local player',()=>{
 for(const team of [0,1]){
  const h=localHarness(),m=h.app.match,p=m.players[team*11+9],q=m.players[(1-team)*11+9],d=m.direction(team);
  p.x=m.goalX(team)-d*80;p.y=318;m.giveBall(p);m.foul(q,p,'Challenge from behind');h.app.syncMatch();
  assert.equal(h.elements.get('restartNotice').textContent,'FOUL');assert.equal(h.elements.get('restartType').textContent,'Penalty Kick');
  assert.ok(h.elements.get('matchStatus').textContent.includes('Challenge from behind'));
  h.click('takeCorner');
  assert.ok(h.elements.get('hint').textContent.includes('P'+(team+1)));assert.ok(h.elements.get('hint').textContent.includes('move keeper'));
  const keeper=m.players[(1-team)*11],y=keeper.y;
  h.window.handlers.keydown(keyEvent(team===0?'ArrowUp':'w'));
  for(let i=0;i<10;i++)m.step(1/60,h.app.input());
  assert.ok(keeper.y!==y);assert.equal(keeper.x,m.goalX(team));
  h.window.handlers.keydown(keyEvent(team===0?'l':'g'));assert.equal(m.pendingKick,null);
  h.window.handlers.keydown(keyEvent(team===0?'g':'l'));assert.equal(m.pendingKick.player,p.id);advanceToContact(m);
  assert.equal(m.setPiece,null);assert.equal(m.ball.lastTouch,team);
 }
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner;m.giveBall(p);
 const from=h.app.camera.project(p.x,p.y),ev=(dx)=>pointerEvent(h,from.x+dx,from.y);
 c.handlers.pointerdown(ev(0));c.handlers.pointermove(ev(120));
 m.foul(m.players[20],p,'Late challenge');h.app.syncMatch();assert.equal(c.hasPointerCapture(31),false);
 c.handlers.pointerup(ev(120));assert.equal(m.pendingKick,null);
});
test('moving held pointer reanchors through possession recovery with camera motion and releases exactly once',()=>{
 for(const type of ['mouse','touch']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner;m.giveBall(p);
  const start=h.app.camera.project(p.x,p.y),ev=(i)=>pointerEvent(h,start.x+i*8,start.y+80+i*4,71,type);
  c.handlers.pointerdown(pointerEvent(h,start.x,start.y,71,type));
  for(let i=0;i<8;i++){c.handlers.pointermove(ev(i));m.step(1/60,h.app.input());h.app.render(1/60);h.draws.length=0;}
  m.giveBall(m.players[20]);c.handlers.pointermove(ev(8));assert.ok(c.hasPointerCapture(71));
  const r=m.players[6];r.x=610;r.y=330;m.giveBall(r);const before={x:r.x,y:r.y};
  for(let i=9;i<22;i++){c.handlers.pointermove(ev(i));m.step(1/60,h.app.input());h.app.render(1/60);h.draws.length=0;}
  assert.ok(distance(r,before)>10);assert.ok(c.hasPointerCapture(71));
  c.handlers.pointerup(ev(22));assert.equal(m.pendingKick.player,r.id);advanceToContact(m);
  assert.equal(m.passes[0]+m.shots[0],1);c.handlers.pointerup(ev(22));assert.equal(m.passes[0]+m.shots[0],1);
 }
});
test('an actual goal-line miss becomes a human goal kick with box exclusion through a pointer wind-up',()=>{
 for(const rect of [{width:1280,height:720},{width:500,height:745}]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const m=h.app.match;m.giveBall(m.owner);
  Object.assign(m.ball,{owner:null,x:FIELD.right-5,y:FIELD.top+35,z:0,vx:200,vy:0,vz:0,lastTouch:1,lock:1});
  for(let i=0;i<10&&m.phase==='playing';i++)m.step(1/60,h.app.input());
  h.app.syncMatch();assert.equal(m.restart.type,'Goal Kick');assert.equal(m.restart.team,0);
  const clock={time:0};runIdleFrames(h,clock,1.2);
  assert.equal(m.setPiece,'Goal Kick');assert.equal(m.owner.id,0);
  const p=m.owner,from=h.app.camera.project(p.x,p.y),to=h.app.camera.project(p.x-75,p.y+35);
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,to.x,to.y));
  for(let i=0;i<60;i++){
   m.step(1/60,h.app.input());assert.equal(m.ball.owner,p.id);
   assert.ok(m.players.filter(q=>q.team===1).every(q=>!m.inPenalty(q,0)));
  }
  c.handlers.pointerup(pointerEvent(h,to.x,to.y));assert.equal(m.pendingKick.player,0);
  while(m.pendingKick){m.step(1/120,h.app.input());if(m.pendingKick)assert.ok(m.players.filter(q=>q.team===1).every(q=>!m.inPenalty(q,0)));}
  assert.equal(m.restartGuard,null);assert.ok(m.ball.vx<0);assert.equal(m.passes[0],1);
 }
});
test('AI takes its awarded penalty without human input and a paused penalty cannot progress',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.players[20],q=m.players[9];
 p.x=m.goalX(1)-m.direction(1)*80;p.y=318;m.giveBall(p);m.foul(q,p,'Challenge from behind');m.takeRestart();h.app.syncMatch();
 assert.ok(h.elements.get('hint').textContent.includes('your goalkeeper'));
 h.click('menuBtn');const elapsed=m.elapsed;for(let i=0;i<100;i++)m.step(1/60,h.app.input());
 assert.equal(m.elapsed,elapsed);assert.equal(m.pendingKick,null);
 h.click('resumePause');
 for(let i=0;i<100&&m.shots[1]===0;i++)m.step(1/60,h.app.input());
 assert.equal(m.shots[1],1);assert.equal(m.setPiece,null);
});

function placeShot(m,range=180,offset=0,team=0,period=1){
 m.period=period;m.kickoff(team);
 const d=m.direction(team),goal=m.goalX(team),p=m.players[team*11+9],keeper=m.players[(1-team)*11];
 for(const q of m.players){q.x=550+(q.id%4)*55;q.y=FIELD.top+25+(q.id%5)*25;}
 p.x=goal-d*range;p.y=FIELD.cy+offset;p.angle=d>0?0:Math.PI;p.visualAngle=p.angle;m.giveBall(p);
 keeper.x=goal-d*18;keeper.y=FIELD.cy;keeper.angle=d>0?Math.PI:0;m.protection=2;m.random=()=>.9;
 return {m,p,keeper,d,goal};
}
function finishShot(m,p,keeper,hz=120){
 for(let i=0;i<hz*3&&m.phase==='playing';i++){
  m.step(1/hz,{dx:0,dy:0});
  if(m.owner&&m.owner.id!==p.id)break;
 }
 return m.phase==='goal'?'goal':m.owner?.id===keeper.id?'save':m.phase==='restart'?'miss':m.owner?'intercept':'stopped';
}
test('repeatable placed shots score, central shots are saved and wide attempts miss in both directions and halves',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const range of [100,180])
 for(const offset of [-70,0,70])for(const aim of [-45,0,45,90]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),range,offset,team,period);
  f.m.kick(f.p,{x:f.goal+f.d*20,y:318+aim},.85);
  const outcome=finishShot(f.m,f.p,f.keeper);
  if(aim===0)assert.equal(outcome,'save');
  else if(aim===90)assert.equal(outcome,'miss');
  else assert.equal(outcome,'goal');
  assert.equal(f.m.score[team],outcome==='goal'?1:0);
 }
});
test('long-range corner shots reward power without guaranteeing goals from excessive range',()=>{
 for(const power of [.25,.6,1])for(const range of [260,320]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),range);
  f.m.kick(f.p,{x:f.goal+f.d*20,y:369},power);
  assert.equal(finishShot(f.m,f.p,f.keeper),power===1&&range===260?'goal':'save');
 }
});
test('shot saves and goals remain consistent at 30, 60 and 120 Hz',()=>{
 for(const hz of [30,60,120])for(const aim of [0,45,90]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'));
  f.m.kick(f.p,{x:f.goal+f.d*20,y:318+aim},.85);
  assert.equal(finishShot(f.m,f.p,f.keeper,hz),aim===0?'save':aim===45?'goal':'miss');
 }
});
test('keeper reaction is delayed after contact and save reach cannot collect a shot from a distance',()=>{
 const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),260);
 f.m.kick(f.p,{x:48,y:369},1);advanceToContact(f.m);
 const start={x:f.keeper.x,y:f.keeper.y};
 for(let i=0;i<22;i++){f.m.step(1/120,{dx:0,dy:0});assert.ok(distance(f.keeper,start)<.001);}
 for(let i=0;i<15;i++)f.m.step(1/120,{dx:0,dy:0});
 assert.ok(f.keeper.y>start.y);assert.ok(f.keeper.y-start.y<10);
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),k=m.players[11];m.giveBall(m.owner);
 k.x=100;k.y=318;k.cooldown=0;
 Object.assign(m.ball,{owner:null,x:100,y:339,z:0,vx:0,vy:0,vz:0,lastTouch:0,lock:0});
 m.step(1/120,{dx:0,dy:0});assert.ok(m.owner?.id!==k.id,'no catch at the old 23-unit radius');
});
test('fast shots use swept body contact and cannot tunnel through a nearby defender at low frame rates',()=>{
 for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.giveBall(m.owner);
  for(const p of m.players){p.x=800;p.y=110;}
  const defender=m.players[13];defender.x=300;defender.y=318;defender.cooldown=0;
  m.flight={id:1,team:0,shot:true,started:0,target:{x:48,y:318}};
  Object.assign(m.ball,{owner:null,x:310,y:325,z:0,vx:-550,vy:0,vz:0,lastTouch:0,lock:0});
  for(let i=0;i<6&&!m.owner;i++)m.step(1/hz,{dx:0,dy:0});
  assert.equal(m.owner?.id,defender.id);assert.equal(m.interceptions[1],1);
 }
});
test('pointer helper maps logical projection coordinates to CSS pixels independently of DPR',()=>{
 const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:13,top:47,width:500,height:745});
 h.window.devicePixelRatio=2;h.chooseMode('practice');h.flush();
 const expected={x:730,y:900},event=pointerEvent(h,expected.x,expected.y,1,'touch'),actual=h.app.point(event);
 assert.ok(Math.abs(actual.x-expected.x)<.001);assert.ok(Math.abs(actual.y-expected.y)<.001);
});
test('a short goal-directed mouse or touch drag becomes a shot, shows power and scores through flight',()=>{
 for(const rect of [{width:1280,height:720},{width:500,height:745}])for(const period of [1,2]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:13,top:47,...rect});
  h.window.devicePixelRatio=2;h.chooseMode('practice');h.flush();
  const f=placeShot(h.app.match,180,0,0,period);h.app.camera.ready=false;h.app.render(0);
  const from=h.app.camera.project(f.p.x,f.p.y),net=h.app.camera.project(f.goal+f.d*20,363);
  const n=Math.hypot(net.x-from.x,net.y-from.y),length=150*1100/rect.width;
  const end={x:from.x+(net.x-from.x)/n*length,y:from.y+(net.y-from.y)/n*length};
  const type=rect.width===500?'touch':'mouse';
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y,11,type));c.handlers.pointermove(pointerEvent(h,end.x,end.y,11,type));
  h.draws.length=0;h.app.render(0);assert.ok(h.draws.some(d=>d.method==='fillText'&&String(d.args[0]).startsWith('SHOT ')));
  c.handlers.pointerup(pointerEvent(h,end.x,end.y,11,type));
  assert.ok(f.m.pendingKick.shot);assert.ok(Math.abs(f.m.pendingKick.target.x-f.goal)<25);
  assert.equal(f.m.shots[0],0);assert.equal(finishShot(f.m,f.p,f.keeper),'goal');
  assert.equal(f.m.shots[0],1);assert.equal(f.m.score[0],1);
  c.handlers.pointerup(pointerEvent(h,end.x,end.y,11,type));assert.equal(f.m.shots[0],1);
 }
});
test('goalward drags preserve explicit teammate passes and allow genuine off-target misses',()=>{
 for(const aim of ['teammate','wide']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180),c=h.elements.get('game'),r=f.m.players[6];
  r.x=f.p.x-60;r.y=f.p.y-30;h.app.camera.ready=false;h.app.render(0);
  const from=h.app.camera.project(f.p.x,f.p.y),target=aim==='teammate'?h.app.camera.project(r.x,r.y):h.app.camera.project(48,408);
  const length=aim==='teammate'?1:150/Math.hypot(target.x-from.x,target.y-from.y);
  const end={x:from.x+(target.x-from.x)*length,y:from.y+(target.y-from.y)*length};
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));c.handlers.pointerup(pointerEvent(h,end.x,end.y));
  assert.ok(f.m.pendingKick);
  if(aim==='teammate'){assert.ok(f.m.pendingKick.target.pass);advanceToContact(f.m);assert.equal(f.m.passes[0],1);assert.equal(f.m.shots[0],0);}
  else{assert.ok(f.m.pendingKick.shot);assert.equal(finishShot(f.m,f.p,f.keeper),'miss');}
 }
});
test('shot wind-up turns the held ball smoothly and plants the support leg until actual contact',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180);
 f.p.angle=-Math.PI/2;f.p.visualAngle=f.p.angle;f.m.followBall();
 const initial={x:f.m.ball.x,y:f.m.ball.y};f.m.kick(f.p,{x:48,y:363},.85);
 assert.ok(distance(f.m.ball,initial)<.001,'request alone must not teleport the ball');
 let last={...f.m.ball},worst=0;
 while(f.m.pendingKick){
  f.m.step(1/120,{dx:0,dy:0});worst=Math.max(worst,distance(last,f.m.ball));last={...f.m.ball};
  const shot=f.m.snapshot(),pose=h.app.playerPose(shot.players[f.p.id],shot.ball);
  assert.equal(pose.running,0);assert.ok(Number.isFinite(pose.kick));
 }
 assert.ok(worst<3);assert.equal(f.m.shots[0],1);assert.ok(Math.abs(f.p.kickAt-.14)<.00001);
});
test('shot framing reveals the goal smoothly without zooming during contact',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180),c=h.elements.get('game');
 h.app.camera.ready=false;h.app.render(0);const camera=h.app.camera,zoom=camera.zoom,from=camera.project(f.p.x,f.p.y),goal=camera.project(48,363);
 const n=Math.hypot(goal.x-from.x,goal.y-from.y),end={x:from.x+(goal.x-from.x)/n*160,y:from.y+(goal.y-from.y)/n*160};
 c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
 let maxPan=0;
 for(let i=0;i<30;i++){const x=camera.x;h.app.render(1/60);maxPan=Math.max(maxPan,Math.abs(camera.x-x));h.draws.length=0;}
 const post=camera.project(FIELD.left,318);assert.ok(post.x>0&&post.x<camera.width);assert.ok(maxPan<6);
 const contactZoom=camera.zoom;c.handlers.pointerup(pointerEvent(h,end.x,end.y));
 while(f.m.pendingKick){f.m.step(1/120,h.app.input());h.app.render(1/120);h.draws.length=0;assert.ok(Math.abs(camera.zoom-contactZoom)<.001);}
});

test('full-team kickoff, held-pointer dribble and aimed far-corner release produce an actual goal',()=>{
 for(const [rect,lane,type] of [[{width:1100,height:620},-.35,'mouse'],[{width:1100,height:620},.35,'mouse'],[{width:500,height:745},-.35,'touch']]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const m=h.app.match,start=m.owner.id;
  h.window.handlers.keydown(keyEvent('e'));
  let received=false,shoot=false,anchor=null;
  for(let frame=0;frame<700&&m.phase==='playing';frame++){
   assert.ok(m.owner?.team!==1,'this deliberate approach must retain possession until the shot');
   if(!received&&m.owner?.team===0&&m.owner.id!==start){
    received=true;anchor=h.app.camera.project(m.owner.x,m.owner.y);
    c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y,91,type));
   }
   if(received&&!shoot&&m.owner?.team===0){
    const p=m.owner,at=h.app.camera.project(p.x,p.y),range=p.x-FIELD.left;
    const dest=h.app.camera.project(range<180?FIELD.left:p.x-100,range<180?FIELD.cy+(lane<0?45:-45):p.y+lane*100);
    const len=Math.hypot(dest.x-at.x,dest.y-at.y),q={x:anchor.x+(dest.x-at.x)/len*160,y:anchor.y+(dest.y-at.y)/len*160};
    c.handlers.pointermove(pointerEvent(h,q.x,q.y,91,type));
    if(range<180){c.handlers.pointerup(pointerEvent(h,q.x,q.y,91,type));shoot=true;assert.ok(m.pendingKick?.shot);}
   }
   m.step(1/60,h.app.input());h.app.syncMatch();h.app.render(1/60);h.draws.length=0;
  }
  assert.ok(received&&shoot);assert.equal(m.phase,'goal');assert.equal(m.score[0],1);assert.equal(m.shots[0],1);
  assert.ok(m.players.length===22);assert.equal(h.app.view,'goal');
 }
});
test('a missed tackle has a recovery window, but a nearby clean challenge can still win the ball',()=>{
 for(const win of [false,true]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.owner,q=m.players[20];
  m.giveBall(p);m.protection=0;q.x=p.x-15;q.y=p.y;m.activeAway=q.id;
  let calls=0;m.random=()=>++calls===1?0:win?0:.99;
  m.step(1/120);
  assert.ok(q.challengeUntil>m.elapsed);assert.ok(q.cooldown>0);
  if(win){assert.equal(m.owner.id,q.id);assert.equal(m.tackles,1);}
  else{
   assert.equal(m.owner.id,p.id);const first=q.challengeUntil;
   for(let i=0;i<20;i++)m.step(1/120);
   assert.equal(q.challengeUntil,first);assert.equal(m.owner.id,p.id);
  }
 }
});

test('shooting frame fits carrier and entire goal from both flanks, both goals and both halves',()=>{
 const cameraCode=html.split('// BEGIN SOCCER CAMERA')[1].split('// END SOCCER CAMERA')[0];
 const {ActionCamera}=new Function('clamp','FIELD',cameraCode+';return {ActionCamera};')((v,a,b)=>Math.max(a,Math.min(b,v)),FIELD);
 for(const [width,height,cssWidth] of [[1100,620,1100],[1100,1639,500]])
 for(const team of [0,1])for(const period of [1,2])for(const offset of [-218,-118,0,122,217]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),180,offset,team,period);
  const c=new ActionCamera();c.resize(width,height,cssWidth);
  const initial=f.m.snapshot();c.update(initial,0,false,true);
  const shot={...initial,shootingGoal:f.goal};
  for(let i=0;i<240;i++)c.update(shot,1/60);
  const points=[c.project(f.p.x,f.p.y),c.project(f.p.x,f.p.y,28)];
  for(const gx of [f.goal,f.goal+f.d*32])for(const y of [264,372])for(const z of [0,44])points.push(c.project(gx,y,z));
  for(const p of points){
   assert.ok(p.x>width*.02&&p.x<width*.98,'entire goal and carrier fit horizontally');
   assert.ok(p.y>height*.09&&p.y<height*.98,'crossbar clears top HUD and net stays on screen');
  }
  const screen=c.project(f.p.x,f.p.y),roundtrip=c.unproject(screen.x,screen.y);
  assert.ok(Math.hypot(roundtrip.x-f.p.x,roundtrip.y-f.p.y)<.00001);
 }
});
test('approach framing keeps ball visible with bounded zoom changes and freezes scale through contact',()=>{
 const cameraCode=html.split('// BEGIN SOCCER CAMERA')[1].split('// END SOCCER CAMERA')[0];
 const {ActionCamera}=new Function('clamp','FIELD',cameraCode+';return {ActionCamera};')((v,a,b)=>Math.max(a,Math.min(b,v)),FIELD);
 for(const [width,height,cssWidth] of [[1100,620,1100],[1100,1639,500]])
 for(const team of [0,1])for(const period of [1,2])for(const offset of [-160,0,160]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),400,offset,team,period);
  const c=new ActionCamera();c.resize(width,height,cssWidth);c.update(f.m.snapshot(),0,false,true);
  for(let i=0;i<240;i++){
   f.p.x=f.goal-f.d*(400-i);f.m.ball.x=f.p.x;f.m.ball.y=f.p.y;
   const shot={...f.m.snapshot(),...(400-i<360?{shootingGoal:f.goal}:{})};
   const zoom=c.zoom,previous=c.project(f.m.ball.x,f.m.ball.y);
   c.update(shot,1/60);
   const ball=c.project(f.m.ball.x,f.m.ball.y);
   assert.ok(ball.x>0&&ball.x<width&&ball.y>0&&ball.y<height,'ball stays in frame during approach');
   assert.ok(Math.abs(c.zoom-zoom)<=.65/60+.000001);
   assert.ok(Math.hypot(ball.x-previous.x,ball.y-previous.y)<width*.015,'camera changes less than 1.5% of width per frame');
  }
  const shot={...f.m.snapshot(),shootingGoal:f.goal};shot.players.find(p=>p.id===f.p.id).strike=.2;
  const before=c.zoom;for(let i=0;i<18;i++)c.update(shot,1/60);
  assert.equal(c.zoom,before);
 }
});
test('UI anticipates the correct attacking goal without a drag in both halves and local play',()=>{
 for(const mode of ['practice','local'])for(const period of [1,2])for(const team of [0,1]){
  const h=mode==='local'?localHarness():uiHarness(html);
  if(mode!=='local'){h.chooseMode('practice');h.flush();}
  const f=placeShot(h.app.match,180,team===0?-118:122,team,period),c=h.app.camera;
  let goal=null;const update=c.update.bind(c);
  c.update=(shot,...args)=>{goal=shot.shootingGoal;return update(shot,...args);};
  h.app.render(1/60);h.draws.length=0;
  assert.equal(goal,f.goal);assert.equal(f.goal,(team===0)===(period===1)?FIELD.left:FIELD.right);
  f.m.ball.owner=null;f.m.flight={shot:true,team,target:{x:f.goal,y:318}};
  h.app.render(1/60);assert.equal(goal,f.goal);
  f.m.flight=null;h.app.render(1/60);assert.equal(goal,undefined);
 }
});

test('an immediate wide-position shot keeps the carrier visible while contact locks the zoom',()=>{
 const cameraCode=html.split('// BEGIN SOCCER CAMERA')[1].split('// END SOCCER CAMERA')[0];
 const {ActionCamera}=new Function('clamp','FIELD',cameraCode+';return {ActionCamera};')((v,a,b)=>Math.max(a,Math.min(b,v)),FIELD);
 for(const [width,height,cssWidth] of [[1100,620,1100],[1100,1639,500]])
 for(const team of [0,1])for(const offset of [-218,217]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),180,offset,team),c=new ActionCamera();
  c.resize(width,height,cssWidth);const shot=f.m.snapshot();c.update(shot,0,false,true);
  shot.shootingGoal=f.goal;shot.players.find(p=>p.id===f.p.id).strike=.2;
  const zoom=c.zoom;
  for(let i=0;i<30;i++){
   c.update(shot,1/60);const p=c.project(f.p.x,f.p.y);
   assert.equal(c.zoom,zoom);
   assert.ok(p.x>0&&p.x<width&&p.y>0&&p.y<height,'goal framing must not hide the ball while zoom is locked');
  }
 }
});

test('off-screen goal guidance is visible on the first shot-capable frame and its post rays are exact',()=>{
 for(const rect of [{width:1100,height:620},{width:500,height:745}])
 for(const period of [1,2])for(const offset of [-118,122]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,359,offset,0,period),cam=h.app.camera;
  for(const q of f.m.players)if(q!==f.p&&!q.keeper){q.x=550;q.y=FIELD.bottom-20;}
  h.app.render(0);cam.update(f.m.snapshot(),0,false,true);h.draws.length=0;
  const origin=cam.project(f.p.x,f.p.y),goal=cam.project(f.goal,318);
  const n=Math.hypot(goal.x-origin.x,goal.y-origin.y),len=Math.min(cam.width,cam.height)*.32;
  const end={x:origin.x+(goal.x-origin.x)/n*len,y:origin.y+(goal.y-origin.y)/n*len};
  c.handlers.pointerdown(pointerEvent(h,origin.x,origin.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
  const intent=h.app.pointerAim(h.app.drag);assert.ok(intent.shot);
  const guide=h.app.goalAimGuide(f.p,intent);assert.ok(guide,'guide must exist immediately, without camera settlement');
  h.app.render(0);
  assert.ok(h.draws.some(d=>d.method==='fillText'&&d.args[0]==='GOAL AIM'),'first SHOT frame must draw its guide');
  for(const [marker,y] of [[guide.a,264],[guide.b,372]]){
   assert.ok(marker.x>0&&marker.x<cam.width&&marker.y>0&&marker.y<cam.height);
   const actual=cam.project(f.goal,y),dx=marker.x-guide.origin.x,dy=marker.y-guide.origin.y;
   assert.ok(Math.abs(dx*(actual.y-guide.origin.y)-dy*(actual.x-guide.origin.x))<.00001);
  }
  for(const fraction of [.1,.5,.9]){
   const marker={x:guide.a.x+(guide.b.x-guide.a.x)*fraction,y:guide.a.y+(guide.b.y-guide.a.y)*fraction};
   const aim=h.app.pointerAim(h.app.drag,(marker.x-origin.x)*3,(marker.y-origin.y)*3);
   assert.ok(aim.shot);const crossing=f.p.y+(aim.target.y-f.p.y)*(f.goal-f.p.x)/(aim.target.x-f.p.x);
   assert.ok(crossing>264&&crossing<372,'aim between visible markers must cross between real posts');
  }
  c.handlers.pointerup(pointerEvent(h,end.x,end.y));assert.ok(f.m.pendingKick?.shot);assert.equal(f.m.shots[0],0);
  advanceToContact(f.m);assert.equal(f.m.shots[0],1,JSON.stringify({period,offset,rect,phase:f.m.phase,event:f.m.event,owner:f.m.ball.owner}));
 }
});
test('rapid held approaches show the goal or exact post guidance on every SHOT frame before release',()=>{
 for(const rect of [{width:1100,height:620},{width:500,height:745}])
 for(const period of [1,2]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,400,-80,0,period),cam=h.app.camera;
  h.app.render(0);cam.update(f.m.snapshot(),0,false,true);
  const anchor=cam.project(f.p.x,f.p.y);c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y));
  let shotFrames=0,firstRange=null,last=null;
  for(let frame=0;frame<131;frame++){
   const at=cam.project(f.p.x,f.p.y),target=cam.project(f.goal,318+35),n=Math.hypot(target.x-at.x,target.y-at.y),len=Math.min(cam.width,cam.height)*.32;
   last={x:anchor.x+(target.x-at.x)/n*len,y:anchor.y+(target.y-at.y)/n*len};
   c.handlers.pointermove(pointerEvent(h,last.x,last.y));
   f.m.step(1/60,h.app.input());h.app.render(1/60);h.draws.length=0;
   assert.equal(f.m.owner.id,f.p.id);
   const intent=h.app.pointerAim(h.app.drag);
   if(intent.shot){
    shotFrames++;if(firstRange===null)firstRange=Math.abs(f.goal-f.p.x);
    const unit=cam.width/rect.width,points=[264,372].flatMap(y=>[0,44].map(z=>cam.project(f.goal,y,z)));
    const visible=points.every(p=>p.x>=14*unit&&p.x<=cam.width-14*unit&&p.y>=14*unit&&p.y<=cam.height-14*unit);
    assert.ok(visible||h.app.goalAimGuide(f.p,intent),'SHOT must never depend on a future camera position');
   }
  }
  assert.ok(shotFrames>60&&firstRange>350,'check begins at shot availability, not after settlement');
  c.handlers.pointerup(pointerEvent(h,last.x,last.y));assert.ok(f.m.pendingKick?.shot);
  advanceToContact(f.m);assert.equal(f.m.shots[0],1);
 }
});
test('goal guidance respects possession, both local sides, misses and replay visibility',()=>{
 const h=localHarness(),m=h.app.match,c=h.app.camera;
 for(const team of [0,1])for(const period of [1,2]){
  const f=placeShot(m,359,0,team,period);c.update(m.snapshot(),0,false,true);
  const guide=h.app.goalAimGuide(f.p,{shot:true,target:{x:f.goal+f.d*20,y:FIELD.cy+120}});
  assert.ok(guide&&guide.wide&&guide.aim);
  m.phase='replay';assert.equal(h.app.goalAimGuide(f.p),null);m.phase='playing';
  m.setPiece='Throw-in';assert.equal(h.app.goalAimGuide(f.p),null);m.setPiece=null;
  const snap={...m.snapshot(),shootingGoal:f.goal};f.p.x=f.goal-f.d*180;m.ball.x=f.p.x;
  for(let i=0;i<300;i++)c.update({...m.snapshot(),shootingGoal:f.goal},1/60);
  assert.equal(h.app.goalAimGuide(f.p),null,'guide clears when the whole goal is visible');
 }
 const solo=uiHarness(html);solo.chooseMode('practice');solo.flush();
 const f=placeShot(solo.app.match,359,0,1);solo.app.camera.update(f.m.snapshot(),0,false,true);
 assert.equal(solo.app.goalAimGuide(f.p),null,'opponent possession must not advertise player aim guidance');
});

test('a nearby team-mate beside the launch path no longer traps a fast shot at contact',()=>{
 for(const hz of [30,60,120])for(const team of [0,1])for(const period of [1,2]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),180,0,team,period);
  const q=f.m.players[team*11+6];q.x=f.p.x+f.d*8;q.y=f.p.y+15;
  f.m.kick(f.p,{x:f.goal+f.d*20,y:FIELD.cy+45},1);
  while(f.m.pendingKick)f.m.step(Math.min(1/hz,f.m.pendingKick.remaining),{dx:0,dy:0});
  assert.equal(f.m.shots[team],1);
  for(let i=0;i<Math.ceil(hz*.08);i++)f.m.step(1/hz,{dx:0,dy:0});
  assert.ok(f.m.ball.owner!==q.id,'a shot beside a team-mate must clear the receiving halo');
  assert.ok(Math.hypot(f.m.ball.vx,f.m.ball.vy)>300);
 }
});
test('stationary bodies of either team still block fast shots while adjacent bodies do not',()=>{
 for(const hz of [30,60,120])for(const shotTeam of [0,1])for(const blockerTeam of [0,1])for(const period of [1,2])for(const offset of [0,7,12]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),180,0,shotTeam,period),m=f.m;
  for(const q of m.players){q.x=550;q.y=110;}
  const blocker=m.players[blockerTeam*11+6],x=f.goal-f.d*100;blocker.x=x;blocker.y=318+offset;blocker.cooldown=0;
  m.move=()=>{};m.offside=null;m.lastRestart=null;
  m.flight={id:1,team:shotTeam,shot:true,started:0,target:{x:f.goal,y:318}};
  Object.assign(m.ball,{owner:null,x:x-f.d*12,y:318,z:0,vx:f.d*550,vy:0,vz:0,lastTouch:shotTeam,lock:0});
  for(let i=0;i<Math.ceil(hz*.07)&&!m.owner;i++)m.step(1/hz,{dx:0,dy:0});
  if(offset<8){assert.equal(m.owner?.id,blocker.id);assert.equal(m.interceptions[blockerTeam],shotTeam===blockerTeam?0:1);}
  else{assert.equal(m.owner,null);assert.ok((m.ball.x-x)*f.d>8);}
 }
});
test('pointer preview, pending kick and contact agree for a goal, save, wide miss and deliberate pass',()=>{
 for(const rect of [{width:1100,height:620},{width:500,height:745}])for(const period of [1,2])
 for(const outcome of ['goal','save','miss','pass']){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180,outcome==='miss'?-118:0,0,period),receiver=f.m.players[6];
  for(const q of f.m.players)if(q!==f.p&&!q.keeper){q.x=q.team===1?f.goal-f.d*30:550;q.y=q.team===1?FIELD.top+20:FIELD.bottom-20;}
  if(outcome==='pass'){receiver.x=f.p.x+f.d*60;receiver.y=f.p.y-30;}
  h.app.render(0);h.app.camera.update(f.m.snapshot(),0,false,true);const cam=h.app.camera;
  const from=cam.project(f.p.x,f.p.y),dest=outcome==='pass'?cam.project(receiver.x,receiver.y):cam.project(f.goal,outcome==='goal'?363:outcome==='miss'?408:318);
  const n=Math.hypot(dest.x-from.x,dest.y-from.y),length=outcome==='pass'?n:Math.min(cam.width,cam.height)*.32;
  const end={x:from.x+(dest.x-from.x)/n*length,y:from.y+(dest.y-from.y)/n*length};
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
  const preview=h.app.pointerAim(h.app.drag);assert.equal(preview.shot,outcome!=='pass');
  const guide=h.app.goalAimGuide(f.p,preview);if(guide&&preview.shot)assert.equal(guide.wide,outcome==='miss');
  c.handlers.pointerup(pointerEvent(h,end.x,end.y));assert.equal(f.m.pendingKick.shot,preview.shot);
  if(outcome==='pass'){
   advanceToContact(f.m);assert.equal(f.m.passes[0],1);assert.equal(f.m.shots[0],0);
   for(let i=0;i<240&&!f.m.owner&&f.m.phase==='playing';i++)f.m.step(1/120,{dx:0,dy:0});
   assert.equal(f.m.owner?.id,receiver.id);
  }else{assert.equal(finishShot(f.m,f.p,f.keeper),outcome);assert.equal(f.m.shots[0],1);}
 }
});
test('a deliberately far-wide pointer ray stays a pass in preview and at contact',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180),cam=h.app.camera,c=h.elements.get('game');
 cam.update(f.m.snapshot(),0,false,true);
 const from=cam.project(f.p.x,f.p.y),dest=cam.project(f.goal,FIELD.cy+180),n=Math.hypot(dest.x-from.x,dest.y-from.y);
 const end={x:from.x+(dest.x-from.x)/n*200,y:from.y+(dest.y-from.y)/n*200};
 c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
 const intent=h.app.pointerAim(h.app.drag);assert.equal(intent.shot,false);assert.ok(intent.target.pass);
 c.handlers.pointerup(pointerEvent(h,end.x,end.y));assert.equal(f.m.pendingKick.shot,false);
 advanceToContact(f.m);assert.equal(f.m.passes[0],1);assert.equal(f.m.shots[0],0);
});
test('goal aim label avoids a nearby player while post markers retain exact rays and contrast backing',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,359),cam=h.app.camera;
 cam.update(f.m.snapshot(),0,false,true);const initial=h.app.goalAimGuide(f.p),q=f.m.players[6];
 const body=cam.unproject(initial.title.x,initial.title.y);q.x=body.x;q.y=body.y;
 const guide=h.app.goalAimGuide(f.p);assert.ok(guide.title.overlap===0);
 assert.ok(Math.hypot(guide.title.x-initial.title.x,guide.title.y-initial.title.y)>10);
 assert.ok(Math.hypot(guide.a.x-initial.a.x,guide.a.y-initial.a.y)<.00001,'moving text must not distort post rays');
 h.draws.length=0;h.app.render(0);
 assert.ok(h.draws.some(d=>d.method==='arc'&&Math.abs(d.args[2]-6*guide.unit)<.00001),'post dots need a dark contrast disc');
 assert.ok(h.draws.some(d=>d.method==='fillRect'&&Math.abs(d.args[2]-guide.title.width)<.00001),'label needs an opaque backing');
});

function offsideInvolvementFixture(team=0,period=1,shot=true){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
 const d=m.direction(team),goal=m.goalX(team),p=m.players[team*11+9],a=m.players[team*11+6],keeper=m.players[(1-team)*11];
 for(const q of m.players){q.x=q.team===team?550:goal-d*110;q.y=FIELD.top+25;q.cooldown=0;}
 p.x=goal-d*180;p.y=FIELD.cy;p.angle=d>0?0:Math.PI;m.giveBall(p);
 a.x=goal-d*45;a.y=FIELD.cy;keeper.x=goal-d*18;keeper.y=FIELD.cy;
 m.kick(p,{x:goal+d*20,y:FIELD.cy,pass:!shot},.9);
 // This rules fixture deliberately keeps the obstruction in place through wind-up.
 const move=m.move;m.move=()=>{};advanceToContact(m);m.move=move;
 return {m,p,a,keeper,d,goal};
}
test('an offside attacker blocking a shot from the keeper view is penalised without touching the ball',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const f=offsideInvolvementFixture(team,period);assert.ok(f.m.offside.ids.includes(f.a.id));
  const spot={x:f.a.x,y:f.a.y};f.m.move=()=>{};f.m.step(1/hz,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  assert.equal(f.m.phase,'restart');assert.equal(f.m.restart.type,'Indirect Free Kick');assert.equal(f.m.restart.team,1-team);
  assert.equal(f.m.restart.offside.player,f.a.id);assert.ok(f.m.event.includes('goalkeeper'));
  assert.ok(distance(f.m.restart,spot)<.01);assert.deepEqual(f.m.score,[0,0]);assert.equal(f.m.shots[team],1);
 }
});
test('offside position alone, a clear view, behind-keeper positions and high or wide shots remain legal',()=>{
 for(const kind of ['clear-view','behind-keeper','high','wide','pass','onside']){
  const f=offsideInvolvementFixture(0,1,kind!=='pass');f.m.move=()=>{};
  if(kind==='clear-view')f.a.y+=25;
  if(kind==='behind-keeper')f.a.x=f.goal+f.d*2;
  if(kind==='high'){f.m.ball.z=240;f.m.ball.vz=0;}
  if(kind==='wide')f.m.ball.vy=300;
  if(kind==='onside')f.m.offside.ids=[];
  const before=f.m.players.map(p=>({x:p.x,y:p.y}));
  assert.equal(f.m.checkOffsideInvolvement(before,1/60),false,kind+' must not trigger offside');
  assert.equal(f.m.phase,'playing');
 }
});
test('an offside player actively challenging for a nearby ball is penalised before winning it',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const f=offsideInvolvementFixture(team,period,false),opponent=f.m.players[(1-team)*11+6];
  f.a.x=f.goal-f.d*70;f.a.y=FIELD.cy;opponent.x=f.goal-f.d*90;opponent.y=FIELD.cy;
  Object.assign(f.m.ball,{x:opponent.x,y:opponent.y,vx:0,vy:0,z:0,vz:0});
  f.m.selectPlayer(team,f.a.id);f.m.selectPlayer(1-team,opponent.id);
  const teams=[{dx:0,dy:0},{dx:0,dy:0}];teams[team]={dx:-f.d,dy:0};
  f.m.step(1/hz,{teams});
  assert.equal(f.m.phase,'restart');assert.equal(f.m.restart.team,1-team);
  assert.ok(f.m.event.includes('challenging'));assert.equal(f.m.restart.offside.player,f.a.id);
 }
});
test('offside challenge detection requires close involvement, not a passive or retreating nearby attacker',()=>{
 for(const kind of ['stationary','retreating','distant-ball','no-opponent','high-ball']){
  const f=offsideInvolvementFixture(0,1,false),opponent=f.m.players[17];
  f.a.x=300;f.a.y=318;opponent.x=320;opponent.y=318;Object.assign(f.m.ball,{x:320,y:318,z:0});
  const before=f.m.players.map(p=>({x:p.x,y:p.y}));
  if(kind!=='stationary')before[f.a.id].x=kind==='retreating'?301:299;
  if(kind==='distant-ball')f.m.ball.x=400;
  if(kind==='no-opponent')opponent.y=450;
  if(kind==='high-ball')f.m.ball.z=100;
  assert.equal(f.m.checkOffsideInvolvement(before,1/60),false,kind);
 }
});
test('restart exemptions survive direct involvement but end at a later teammate play',()=>{
 for(const type of ['Goal Kick','Corner Kick','Throw-in']){
  const m=restartFixture(type),p=m.owner,team=p.team,d=m.direction(team),a=m.players[team*11+6];
  m.kick(p,{x:550,y:400},.6);advanceToContact(m);assert.equal(m.offside,null);
  assert.equal(m.checkOffsideInvolvement(m.players.map(q=>({...q})),1/60),false);
  m.receiveBall(a);assert.equal(m.phase,'playing');
  const next=m.players[team*11+9],goal=m.goalX(team);
  a.x=goal-d*180;a.y=318;next.x=goal-d*45;next.y=318;m.followBall();
  for(const q of m.players)if(q.team!==team){q.x=goal-d*110;q.y=110;}
  const keeper=m.players[(1-team)*11];keeper.x=goal-d*18;keeper.y=318;
  m.move=()=>{};m.kick(a,{x:goal+d*20,y:318},1);advanceToContact(m);
  assert.ok(m.offside.ids.includes(next.id),'the next teammate play creates a new offside phase');
  m.move=()=>{};m.step(1/60,{dx:0,dy:0});
  assert.equal(m.phase,'restart');assert.equal(m.restart.team,1-team);
 }
});
test('offside involvement reaches the visible and accessible restart flow and resumes legally',()=>{
 const h=localHarness(),m=h.app.match;
 const f=offsideInvolvementFixture(0,1);
 // Reproduce the same real shot sequence in the UI-owned match.
 m.period=f.m.period;m.players=f.m.players;m.ball={...f.m.ball};m.offside=f.m.offside;m.flight=f.m.flight;
 m.setPiece=null;m.restartGuard=null;m.lastRestart=null;m.pendingKick=null;m.phase='playing';m.move=()=>{};
 m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});h.app.syncMatch();h.app.render(0);
 assert.equal(h.app.view,'corner');assert.equal(h.elements.get('restartNotice').textContent,'OFFSIDE');
 assert.ok(h.elements.get('matchStatus').textContent.includes('goalkeeper'));
 assert.ok(h.elements.get('restartHelp').textContent.includes('goalkeeper'));
 h.click('takeCorner');assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Indirect Free Kick');
 assert.equal(m.owner.team,1);assert.equal(m.ball.vx,0);
 h.window.handlers.keydown(keyEvent('k'));assert.ok(m.pendingKick);
 advanceToContact(m);assert.equal(m.setPiece,null);assert.equal(m.phase,'playing');
});

test('keeper hand-possession countdown uses the last five seconds and clears on release, pause and restart',()=>{
 const h=localHarness(),m=h.app.match,k=m.players[0];
 k.x=m.ownGoalX(0)+m.direction(0)*30;k.y=FIELD.cy+20;
 m.ball.lastTouch=1;m.receiveBall(k);assert.equal(m.handOwner,k.id);
 for(const [held,expected] of [[2.99,null],[3,5],[4.2,4],[6.1,2],[7.3,1]]){
  k.held=held;h.app.syncMatch();h.draws.length=0;h.app.render(0);
  const status=h.elements.get('keeperStatus').textContent;
  if(expected===null)assert.equal(status,'');
  else{
   assert.ok(status.includes('within '+expected+(expected===1?' second':' seconds')));
   assert.ok(h.draws.some(d=>d.method==='fillText'&&d.args[0]==='KEEPER · RELEASE '+expected));
  }
 }
 const held=k.held;h.click('menuBtn');assert.equal(h.elements.get('keeperStatus').textContent,'');m.step(1);assert.equal(k.held,held);
 h.click('resumePause');assert.ok(h.elements.get('keeperStatus').textContent.includes('within 1 second'));
 h.window.handlers.keydown(keyEvent('f'));advanceToContact(m);h.app.syncMatch();assert.equal(h.elements.get('keeperStatus').textContent,'');
 m.ball.lastTouch=1;m.receiveBall(k);k.held=7.99;m.step(.02,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});h.app.syncMatch();
 assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Corner Kick');assert.equal(m.restart.team,1);assert.equal(h.elements.get('keeperStatus').textContent,'');
 h.click('takeCorner');h.click('menuBtn');h.click('restartMatch');assert.equal(h.elements.get('keeperStatus').textContent,'');
});
test('keeper countdown never treats foot-controlled teammate deliveries as handling',()=>{
 const h=localHarness(),m=h.app.match,k=m.players[0];
 k.x=m.ownGoalX(0)+m.direction(0)*30;k.y=318;m.ball.lastTouch=0;m.receiveBall(k);k.held=9;
 h.app.syncMatch();h.draws.length=0;h.app.render(0);
 assert.equal(m.handOwner,null);assert.equal(h.elements.get('keeperStatus').textContent,'');
 assert.ok(!h.draws.some(d=>d.method==='fillText'&&String(d.args[0]).startsWith('KEEPER · RELEASE')));
 m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});assert.equal(m.phase,'playing');
});

test('shot forecast matches actual whole-ball crossing and height in both directions and halves',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120])
 for(const [range,offset,loft] of [[180,0,false],[180,57,false],[180,90,false],[180,0,true],[320,0,true]]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),range,0,team,period),m=f.m;
  for(const q of m.players)if(q!==f.p){q.x=550;q.y=110;}m.move=()=>{};
  const target={x:f.goal+f.d*20,y:318+offset,shot:true},before=JSON.stringify(m.snapshot());
  const predicted=m.previewKick(f.p,target,1,loft,1/hz);assert.equal(JSON.stringify(m.snapshot()),before);
  m.kick(f.p,target,1,loft);
  while(m.pendingKick)m.step(Math.min(1/hz,m.pendingKick.remaining),{dx:0,dy:0});
  let actual=null;
  for(let i=0;i<hz*4&&m.phase==='playing';i++){
   const old={...m.ball};m.step(1/hz,{dx:0,dy:0});
   if(m.phase!=='playing'){
    const line=f.goal+f.d*1.5,k=(line-old.x)/(m.ball.x-old.x);
    actual={x:line,y:old.y+(m.ball.y-old.y)*k,z:old.z+(m.ball.z-old.z)*k};
   }
  }
  assert.ok(actual&&predicted.crossing);
  assert.ok(Math.abs(predicted.crossing.x-(f.goal+f.d*1.5))<.00001);
  assert.ok(Math.abs(actual.y-predicted.crossing.y)<.01);
  assert.ok(Math.abs(actual.z-predicted.crossing.z)<.01,'forecast and flight use the same requested simulation step');
  assert.equal(m.phase==='goal',predicted.onTarget);assert.equal(m.score[team],predicted.onTarget?1:0);
 }
});
test('whole-ball post margin and airborne high misses are reported honestly',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180),m=f.m;
 for(const [crossY,label,onTarget] of [[318,'LOW',true],[370,'TIGHT MARGIN',true],[370.6,'WIDE',false]]){
  const target={x:f.goal+f.d*20,y:318+(crossY-318)*200/181.5,shot:true};
  const forecast=m.previewKick(f.p,target,1);
  assert.ok(Math.abs(forecast.crossing.y-crossY)<.001);assert.equal(forecast.label,label);assert.equal(forecast.onTarget,onTarget);
 }
 for(const p of m.players){p.x=550;p.y=110;}m.move=()=>{};
 Object.assign(m.ball,{owner:null,x:f.goal-f.d*60,y:318,z:100,vx:f.d*400,vy:0,vz:0,lock:0,lastTouch:0});
 m.flight={team:0,shot:true,target:{x:f.goal,y:318}};m.offside=null;
 const forecast=h.app.shotForecast();assert.equal(forecast.label,'HIGH');assert.equal(forecast.onTarget,false);
 for(let i=0;i<60&&m.phase==='playing';i++)m.step(1/120,{dx:0,dy:0});
 assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Goal Kick');assert.equal(m.score[0],0);
});
test('moving-camera pointer preview agrees with release and remains fixed during wind-up',()=>{
 for(const rect of [{width:1100,height:620},{width:500,height:745}])for(const period of [1,2]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180,-70,0,period),cam=h.app.camera;
  h.app.render(0);const origin=cam.project(f.p.x,f.p.y);c.handlers.pointerdown(pointerEvent(h,origin.x,origin.y));
  let last=null,forecast=null;
  for(let i=0;i<12;i++){
   cam.x+=f.d*1.2;cam.y+=.5;
   const at=cam.project(f.p.x,f.p.y),goal=cam.project(f.goal,363),n=Math.hypot(goal.x-at.x,goal.y-at.y);
   last={x:origin.x+(goal.x-at.x)/n*200,y:origin.y+(goal.y-at.y)/n*200};
   c.handlers.pointermove(pointerEvent(h,last.x,last.y));h.app.render(1/60);forecast=h.app.shotForecast();h.draws.length=0;
   assert.ok(forecast?.crossing);assert.equal(forecast.label,'LOW');
  }
  c.handlers.pointerup(pointerEvent(h,last.x,last.y));assert.ok(f.m.pendingKick.shot);
  const released=h.app.shotForecast();assert.ok(distance(released.crossing,forecast.crossing)<.00001);
  cam.x+=30;cam.y-=25;cam.zoom*=.95;
  const afterCamera=h.app.shotForecast();assert.ok(distance(afterCamera.crossing,released.crossing)<.00001);
  assert.equal(finishShot(f.m,f.p,f.keeper),'goal');
 }
});
function advantageShotFixture(team=0,period=1,range=180,aim=45){
 const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'local'),range,0,team,period),m=f.m,q=m.players[(1-team)*11+9];
 q.x=f.p.x-f.d*24;q.y=f.p.y;m.selectPlayer(1-team,q.id);m.random=()=>1;m.protection=0;
 m.kick(f.p,{x:f.goal+f.d*20,y:318+aim,shot:true},1);advanceToContact(m);
 const controls={teams:[{dx:0,dy:0},{dx:0,dy:0}]};controls.teams[1-team]={dx:f.d,dy:0};
 for(let i=0;i<20&&m.phase==='playing'&&!m.advantage;i++)m.step(1/120,controls);
 return {...f,q,controls};
}
test('a real late challenge allows an existing goal-bound shot to score without losing the goal',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const range of [100,180]){
  const f=advantageShotFixture(team,period,range);assert.ok(f.m.advantage);assert.equal(f.m.lastFoul.reason,'Late challenge');
  assert.equal(f.m.fouls[1-team],1);assert.equal(f.m.phase,'playing');
  for(let i=0;i<240&&f.m.phase==='playing';i++)f.m.step(1/120,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  assert.equal(f.m.phase,'goal');assert.equal(f.m.score[team],1);assert.equal(f.m.advantage,null);assert.equal(f.m.restarts,0);
  f.m.skipReplay();assert.equal(f.m.kickoffOwner,f.m.players[(1-team)*11+9].id);
 }
});
test('a saved or blocked advantage shot recalls the original free kick or penalty exactly once',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const range of [100,180]){
  const f=advantageShotFixture(team,period,range,0);assert.ok(f.m.advantage);const original={...f.m.advantage.restart};
  for(let i=0;i<240&&f.m.phase==='playing';i++)f.m.step(1/120,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  assert.equal(f.m.phase,'restart');assert.equal(f.m.restart.type,range===100?'Penalty Kick':'Direct Free Kick');
  assert.equal(f.m.restart.x,original.x);assert.equal(f.m.restart.y,original.y);assert.equal(f.m.restart.team,team);
  assert.equal(f.m.fouls[1-team],1);assert.equal(f.m.restarts,1);assert.deepEqual(f.m.score,[0,0]);assert.equal(f.m.advantage,null);
 }
});
test('advantage trial expires, recalls on a miss and does not apply to an already-wide shot',()=>{
 for(const outcome of ['timeout','out','wide']){
  const f=advantageShotFixture(0,1,180,outcome==='wide'?90:45);
  if(outcome==='wide'){assert.equal(f.m.advantage,null);assert.equal(f.m.phase,'restart');continue;}
  assert.ok(f.m.advantage);f.m.move=()=>{};
  if(outcome==='timeout'){
   f.m.ball.vx=0;f.m.ball.vy=0;
   for(let i=0;i<250&&f.m.phase==='playing';i++)f.m.step(1/120,{dx:0,dy:0});
  }else{const old={...f.m.ball};f.m.ball.x=FIELD.left-2;f.m.ball.y=450;f.m.checkBoundary(old);}
  assert.equal(f.m.phase,'restart');assert.equal(f.m.restart.type,'Direct Free Kick');assert.equal(f.m.restart.team,0);
  assert.equal(f.m.fouls[1],1);assert.equal(f.m.restarts,1);assert.equal(f.m.advantage,null);
 }
});
test('advantage UI announces play-on, freezes during pause and clears after recall or restart',()=>{
 const h=localHarness(),m=h.app.match,f=advantageShotFixture();
 Object.assign(m,{players:f.m.players,ball:f.m.ball,flight:f.m.flight,offside:f.m.offside,advantage:f.m.advantage,
  lastFoul:f.m.lastFoul,elapsed:f.m.elapsed,setPiece:null,restartGuard:null,lastRestart:null,pendingKick:null,phase:'playing',event:f.m.event});
 h.app.syncMatch();assert.ok(h.elements.get('matchStatus').textContent.includes('Advantage'));
 h.click('menuBtn');const elapsed=m.elapsed;m.step(1);assert.equal(m.elapsed,elapsed);assert.ok(m.advantage);
 h.click('resumePause');assert.ok(h.elements.get('matchStatus').textContent.includes('Advantage'));
 m.recallAdvantage();h.app.syncMatch();assert.ok(h.elements.get('matchStatus').textContent.includes('not realised'));
 h.click('takeCorner');assert.equal(m.advantage,null);assert.equal(m.setPiece,'Direct Free Kick');
 h.click('menuBtn');h.click('restartMatch');h.flush();assert.equal(h.app.match.advantage,null);
 assert.ok(!h.elements.get('matchStatus').textContent.includes('Advantage'));
});

test('an on-target forecast remains a prediction when a real defender blocks the shot',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180),m=f.m;
 const target={x:f.goal+f.d*20,y:363,shot:true},forecast=m.previewKick(f.p,target,1);assert.ok(forecast.onTarget);
 m.kick(f.p,target,1);advanceToContact(m);
 const defender=m.players[13],n=Math.hypot(m.ball.vx,m.ball.vy);defender.x=m.ball.x+m.ball.vx/n*35;defender.y=m.ball.y+m.ball.vy/n*35;
 m.move=()=>{};m.offside=null;
 for(let i=0;i<30&&!m.owner&&m.phase==='playing';i++)m.step(1/120,{dx:0,dy:0});
 assert.equal(m.owner?.id,defender.id);assert.deepEqual(m.score,[0,0]);
});

test('player shot forecast clears the selection arrow and paints after players in desktop and portrait',()=>{
 for(const rect of [{width:1100,height:620},{width:500,height:745}])for(const period of [1,2])for(const aim of [45,90]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,...rect});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180,0,0,period),cam=h.app.camera;
  cam.ready=false;h.app.render(0);
  const from=cam.project(f.p.x,f.p.y),goal=cam.project(f.goal,318+aim),n=Math.hypot(goal.x-from.x,goal.y-from.y),length=Math.min(cam.width,cam.height)*.32;
  const end={x:from.x+(goal.x-from.x)/n*length,y:from.y+(goal.y-from.y)/n*length};
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
  const before=h.app.shotForecast(),state=JSON.stringify(f.m.snapshot());
  h.draws.length=0;h.app.render(0);
  assert.equal(JSON.stringify(f.m.snapshot()),state,'HUD layout must not change the simulation');
  assert.ok(distance(before.crossing,h.app.shotForecast().crossing)<.00001,'HUD layout must not change aim');
  const power=h.draws.findIndex(d=>d.method==='fillText'&&String(d.args[0]).startsWith('SHOT '));
  assert.ok(power>=0);const text=h.draws[power].args,unit=1100/rect.width;
  const forecast=h.draws.findIndex(d=>d.method==='fillText'&&String(d.args[0]).includes('IF CLEAR')&&Math.abs(d.args[1]-text[1])<.001&&Math.abs(d.args[2]-text[2]-24*unit)<.001);
  assert.ok(forecast>power,'the player-level forecast remains visible beside its power label');
  const arrow=cam.project(f.p.x,f.p.y,28),bounds={left:arrow.x-3.4*arrow.scale,right:arrow.x+3.4*arrow.scale,top:arrow.y-2.4*arrow.scale,bottom:arrow.y+3.4*arrow.scale};
  const panel={left:text[1]-66*unit,right:text[1]+66*unit,top:text[2]-12*unit,bottom:text[2]+29*unit};
  assert.ok(panel.right<=bounds.left-6*unit||panel.left>=bounds.right+6*unit||panel.bottom<=bounds.top-6*unit||panel.top>=bounds.bottom+6*unit,'HUD must leave a visible gap around the arrow');
  assert.ok(panel.left>=0&&panel.right<=cam.width&&panel.top>=0&&panel.bottom<=cam.height);
  const triangle=h.draws.findIndex(d=>d.method==='moveTo'&&Math.abs(d.args[0]-arrow.x)<.001&&Math.abs(d.args[1]-arrow.y-3*arrow.scale)<.001);
  assert.ok(triangle>=0&&power>triangle+5,JSON.stringify({rect,period,aim,power,triangle,arrow,active:f.m.active,player:f.p.id,near:h.draws.filter(d=>d.method==='moveTo'&&Math.abs(d.args[0]-arrow.x)<.001).slice(-5)}));
  c.handlers.pointerup(pointerEvent(h,end.x,end.y));assert.ok(f.m.pendingKick.shot);
  assert.equal(finishShot(f.m,f.p,f.keeper),aim===45?'goal':'miss');
 }
});

function passReceptionFixture(width=1180,height=757){
 const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height});
 h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner,r=m.players[6];m.giveBall(p);p.x=550;p.y=318;
 for(const q of m.players)if(q!==p&&q!==r){q.x=q.team?130:900;q.y=100;}
 r.x=550;r.y=438;m.followBall();h.app.camera.ready=false;h.app.render(0);h.draws.length=0;
 return {h,c,m,p,r};
}
function runPassFrames(h,hz=60,seconds=4,render=false){
 const m=h.app.match;let frames=0;
 for(;frames<hz*seconds;frames++){
  m.step(1/hz,h.app.input());h.app.syncMatch();
  if(render)h.app.render(1/hz);h.draws.length=0;
  if(!m.pendingKick&&m.owner||m.phase!=='playing')break;
 }
 return frames;
}
test('reported two mouse drags reach two different teammates against all live AI at 30/60/120 Hz',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});
  h.chooseMode('practice');h.flush();const m=h.app.match;
  const ev=(x,y)=>({clientX:x,clientY:y,pointerId:31,button:0,isPrimary:true,pointerType:'mouse',preventDefault(){}});
  for(const id of [6,7]){
   // Preserve the reported opening gesture; the spread formation moves the next outlet,
   // so aim at that teammate's current sprite instead of the old formation's pixel location.
   const a=id===6?[590,395]:(()=>{const p=h.app.camera.project(m.owner.x,m.owner.y);return [p.x*1180/1100,p.y*1180/1100];})();
   const b=id===6?[902,374]:(()=>{const p=h.app.camera.project(m.players[id].x,m.players[id].y);return [p.x*1180/1100,p.y*1180/1100];})();
   const passer=m.owner.id;c.handlers.pointerdown(ev(...a));c.handlers.pointermove(ev(...b));
   assert.equal(h.app.pointerAim(h.app.drag).target.receiverId,id);
   c.handlers.pointerup(ev(...b));runPassFrames(h,hz,4,true);
   assert.equal(m.owner?.id,id,'intended teammate receives, rather than original passer '+passer+' at '+hz+' Hz');
  }
  assert.equal(m.passes[0],2);assert.equal(m.shots[0],0);
 }
});
test('short directional drags complete actual passes in eight directions, three powers and frame rates',()=>{
 for(const hz of [30,60,120])for(const length of [40,90,180])for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){
  const {h,c,m,p,r}=passReceptionFixture();r.x=p.x+Math.cos(angle)*120;r.y=p.y+Math.sin(angle)*120;
  h.app.render(0);h.draws.length=0;const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y),d=Math.hypot(b.x-a.x,b.y-a.y);
  const end={x:a.x+(b.x-a.x)/d*length,y:a.y+(b.y-a.y)/d*length},ev=q=>pointerEvent(h,q.x,q.y);
  c.handlers.pointerdown(ev(a));c.handlers.pointermove(ev(end));assert.equal(h.app.pointerAim(h.app.drag).target.receiverId,r.id);
  c.handlers.pointerup(ev(end));runPassFrames(h,hz);assert.equal(m.owner?.id,r.id,'receiver at '+hz+' Hz length '+length+' angle '+angle);
  assert.equal(m.passes[0],1);assert.equal(m.shots[0],0);
 }
});
test('hovering a teammate after camera movement completes desktop and portrait mouse and touch-event passes',()=>{
 for(const [w,height] of [[1180,757],[500,745]])for(const type of ['mouse','touch']){
  const {h,c,m,p,r}=passReceptionFixture(w,height),a=h.app.camera.project(p.x,p.y),ev=q=>pointerEvent(h,q.x,q.y,31,type);
  c.handlers.pointerdown(ev(a));h.app.camera.x+=65;h.app.camera.y-=15;
  const b=h.app.camera.project(r.x,r.y);c.handlers.pointermove(ev(b));
  assert.equal(h.app.pointerAim(h.app.drag).target.receiverId,r.id);
  c.handlers.pointerup(ev(b));runPassFrames(h);assert.equal(m.owner?.id,r.id);assert.equal(m.passes[0],1);
 }
});
test('pass after continuously held pointer changes possession reaches the new intended teammate exactly once',()=>{
 const {h,c,m,p,r}=passReceptionFixture(),a=h.app.camera.project(p.x,p.y),ev=q=>pointerEvent(h,q.x,q.y);
 c.handlers.pointerdown(ev(a));c.handlers.pointermove(ev({x:a.x+80,y:a.y}));
 m.giveBall(m.players[20]);h.app.input();m.giveBall(p);h.app.input();
 const b=h.app.camera.project(r.x,r.y);c.handlers.pointermove(ev(b));c.handlers.pointerup(ev(b));
 runPassFrames(h);assert.equal(m.owner?.id,r.id);assert.equal(m.passes[0],1);
 c.handlers.pointerup(ev(b));assert.equal(m.pendingKick,null);assert.equal(m.passes[0],1);
});
test('directed pass power changes contact speed while intended receiver moves during wind-up',()=>{
 const speeds=[];
 for(const power of [.15,.5,1]){
  const {h,m,p,r}=passReceptionFixture();m.kick(p,{...r,receiverId:r.id,pass:true},power);
  r.x+=25;advanceToContact(m);speeds.push(Math.hypot(m.ball.vx,m.ball.vy));
  assert.equal(m.flight.target.x,r.x);runPassFrames(h);assert.equal(m.owner?.id,r.id);
 }
 assert.ok(speeds[0]<speeds[1]&&speeds[1]<speeds[2]);assert.ok(speeds[2]-speeds[0]>80);
});
test('receiver assist yields to deliberate movement and defenders still intercept a covered pass',()=>{
 const first=passReceptionFixture();first.m.kick(first.p,{...first.r,receiverId:first.r.id,pass:true},.7);advanceToContact(first.m);
 const x=first.r.x;first.m.step(1/60,{dx:-1,dy:0});assert.ok(first.r.x<x);
 for(const hz of [30,60,120]){
  const {h,c,m,p,r}=passReceptionFixture(),defender=m.players[20];defender.x=550;defender.y=378;
  const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y),ev=q=>pointerEvent(h,q.x,q.y);
  c.handlers.pointerdown(ev(a));c.handlers.pointermove(ev(b));c.handlers.pointerup(ev(b));runPassFrames(h,hz);
  assert.equal(m.owner?.team,1,'covered lane remains interceptable at '+hz+' Hz');assert.equal(m.passes[0],1);
 }
});

test('a settling receiver can aim and return a pass under live AI pressure without indefinite protection',()=>{
 for(const hz of [30,60,120]){
  const {h,c,m,p,r}=passReceptionFixture(),defender=m.players[20];defender.x=p.x+60;defender.y=p.y;
  const step=()=>{m.step(1/hz,h.app.input());h.app.syncMatch();h.app.render(1/hz);h.draws.length=0;};
  for(let i=0;i<Math.round(.45*hz);i++)step();
  const a=h.app.camera.project(p.x,p.y),ev=q=>pointerEvent(h,q.x,q.y);c.handlers.pointerdown(ev(a));
  for(let i=0;i<Math.round(.15*hz);i++){c.handlers.pointermove(ev(h.app.camera.project(r.x,r.y)));step();}
  c.handlers.pointerup(ev(h.app.camera.project(r.x,r.y)));runPassFrames(h,hz,4,true);
  assert.equal(m.owner?.id,r.id,'return pass completes under live pressure at '+hz+' Hz');assert.equal(m.passes[0],1);
 }
 const {h,m,p}=passReceptionFixture(),d=m.players[20];d.x=p.x+60;d.y=p.y;p.angle=0;m.followBall();
 for(let i=0;i<240&&m.owner?.id===p.id;i++)m.step(1/60,h.app.input());
 assert.ok(m.protection===0||m.owner?.id!==p.id||m.phase!=='playing');
 assert.ok(distance(d,p)<42||m.owner?.id!==p.id||m.phase!=='playing','defender resumes closing after settling window');
});

test('running feet have a ground stance, bent swing and continuous cycle boundaries',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();
 const p={...h.app.match.snapshot().players[9],id:0,speed:110,strikePhase:'idle',strike:0,receive:0,save:0};
 const sample=phase=>{const q={...p,stride:phase*Math.PI*2/h.app.GAIT_CYCLE_SCALE};const pose=h.app.playerPose(q,null);return h.app.playerSkeleton(q,pose).legs[0];};
 const a=sample(.03),b=sample(.29),flight=sample(.66);
 assert.equal(a.stance,true);assert.equal(b.stance,true);assert.equal(a.ankle[2],b.ankle[2]);assert.ok(flight.ankle[2]>a.ankle[2]+3);
 const rootTravel=(.29-.03)*Math.PI*2/(h.app.GAIT_CYCLE_SCALE*.095);
 assert.ok(Math.abs(rootTravel+(b.ankle[1]-a.ankle[1])*.6)<1.5,'stance foot nearly cancels root travel');
 for(const phase of [.32,1]){
  const l=sample(phase-1e-5),r=sample(phase+1e-5);
  assert.ok(Math.hypot(...l.ankle.map((v,i)=>v-r.ankle[i]))<.02);
 }
});
test('run-to-kick blends the incoming legs and keeps the boot beside the ball at contact',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner;m.giveBall(p);m.protection=5;
 for(let i=0;i<20;i++)m.step(1/60,{dx:1,dy:0});
 const s=m.snapshot().players[p.id],before=h.app.playerSkeleton(s,h.app.playerPose(s,m.ball));
 m.kick(p,{x:p.x+130,y:p.y,pass:true},.7);
 const w=m.snapshot().players[p.id],start=h.app.playerSkeleton(w,h.app.playerPose(w,m.ball));
 assert.deepEqual(before.legs.map(x=>x.ankle),start.legs.map(x=>x.ankle));
 advanceToContact(m);const at=m.snapshot().players[p.id],pose=h.app.playerPose(at,m.ball),leg=h.app.playerSkeleton(at,pose).legs[1];
 assert.equal(at.strikePhase,'follow');assert.equal(pose.running,0);
 assert.ok(Math.abs((leg.ankle[1]+2)*.6-10)<2,'contact boot matches the 10-unit held ball offset');
});
test('visual acceleration, braking and turn balance settle without delaying control',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner;m.giveBall(p);m.protection=10;
 m.step(1/60,{dx:1,dy:0});assert.ok(p.bodyLean>0);
 for(let i=0;i<25;i++)m.step(1/60,{dx:1,dy:0});
 for(let i=0;i<4;i++)m.step(1/60,{dx:0,dy:1});
 assert.ok(Math.abs(p.turnLean)>.05);const old={x:p.x,y:p.y};
 m.step(1/60,{dx:0,dy:0});assert.ok(distance(old,p)<.001);assert.ok(p.bodyLean<0);
 for(let i=0;i<90;i++)m.step(1/60,{dx:0,dy:0});
 assert.ok(Math.abs(p.bodyLean)<.001&&Math.abs(p.turnLean)<.001);
 m.kickoff(0);assert.ok(m.snapshot().players.every(q=>q.bodyLean===0&&q.turnLean===0&&q.tackle===0));
});
test('animation envelopes and replay stay finite and preserve deterministic mesh size',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.snapshot().players[9],ball=m.ball;
 let faceCount=null;
 for(const kind of ['run','strike','receive','tackle','save','fouled'])for(let i=0;i<=60;i++){
  const t=i/60,q={...p,speed:kind==='run'?110:0,stride:t*Math.PI*2,strike:kind==='strike'?t:0,
   strikePhase:kind==='strike'?(t<.3?'windup':'follow'):'idle',receive:kind==='receive'?1-t:0,
   tackle:kind==='tackle'?1-t:0,save:kind==='save'?1-t:0,fouled:kind==='fouled'?1-t:0,
   keeper:kind==='save',saveSide:.8,turnLean:Math.sin(t*Math.PI),bodyLean:Math.cos(t*Math.PI)};
  const pose=h.app.playerPose(q,ball),mesh=h.app.playerMesh(q,pose);
  for(const f of mesh)assert.ok([...f.normal,...f.points.flat()].every(Number.isFinite));
  if(!q.keeper){if(faceCount===null)faceCount=mesh.length;assert.equal(mesh.length,faceCount);}
  assert.ok(pose.running>=0&&pose.running<=1);
 }
 const a=m.snapshot();a.players[9].bodyLean=-.7;a.players[9].turnLean=.6;a.players[9].tackle=.8;
 const b=JSON.parse(JSON.stringify(a));b.players[9].bodyLean=.5;b.players[9].turnLean=-.2;b.players[9].tackle=.2;
 const mix=h.app.replaySample([a,b],.5).players[9];
 assert.ok(Math.abs(mix.bodyLean+.1)<1e-8);assert.ok(Math.abs(mix.turnLean-.2)<1e-8);assert.equal(mix.tackle,.5);
});
test('keeper save direction stays stable across camera turns and ball ownership changes',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p={...m.snapshot().players[0],save:.5,saveSide:-.8,keeper:true};
 const a=h.app.playerPose(p,{...m.ball,x:p.x+30,y:p.y+20});
 h.app.camera.yaw+=1;const b=h.app.playerPose(p,{...m.ball,x:p.x-30,y:p.y-20,owner:p.id});
 assert.equal(a.reach,-.8);assert.equal(b.reach,-.8);assert.ok(a.save>.9&&b.save>.9);
});

test('catching during a keeper dive preserves its animation envelope rather than snapping to a new start',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]),p=m.players[11];
 m.giveBall(m.players[9]);m.elapsed=2;p.saveAt=1.8;p.saveSide=-.7;
 Object.assign(m.ball,{owner:null,lastTouch:0,x:p.x+2,y:p.y,z:0,vx:0,vy:0});
 const before=m.snapshot().players[p.id].save;m.receiveBall(p);
 assert.equal(m.owner.id,p.id);assert.equal(p.saveAt,1.8);assert.equal(p.saveSide,-.7);
 assert.equal(m.snapshot().players[p.id].save,before);
});

test('saved shots clear forecast text at contact and ease camera bounds without hiding keeper or ball',()=>{
 for(const [width,height] of [[1180,757],[500,757]])for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const h=uiHarness(html),canvas=h.elements.get('game');canvas.getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180,0,team,period),cam=h.app.camera;
  cam.ready=false;h.app.render(0);h.draws.length=0;
  f.m.kick(f.p,{x:f.goal+f.d*20,y:318},.85);
  let savedAt=null,windupText=false,flight=false,maxJump=0;
  for(let i=0;i<hz*2;i++){
   const beforeSave=f.m.saves[1-team],pos={x:f.keeper.x,y:f.keeper.y},before=cam.project(pos.x,pos.y);
   f.m.step(1/hz,{dx:0,dy:0});h.app.syncMatch();h.app.render(1/hz);
   const after=cam.project(pos.x,pos.y);
   if(f.m.saves[1-team]>beforeSave)savedAt=i;
   const labels=h.draws.filter(x=>x.method==='fillText'&&String(x.args[0]).includes('IF CLEAR'));
   if(f.m.pendingKick){windupText=windupText||labels.length>0;assert.ok(h.app.shotForecast());}
   else{assert.equal(labels.length,0,'released shot must not cover save animation');if(!f.m.flight?.shot)assert.equal(h.app.shotForecast(),null);}
   if(f.m.flight?.shot)flight=true;
   if(savedAt!==null){
    maxJump=Math.max(maxJump,Math.hypot(after.x-before.x,after.y-before.y)*width/1100);
    for(const z of [0,22]){
     const q=cam.project(f.keeper.x,f.keeper.y,z);assert.ok(q.x>0&&q.x<cam.width&&q.y>0&&q.y<cam.height,'keeper remains framed');
    }
    const q=cam.project(f.m.ball.x,f.m.ball.y);assert.ok(q.x>0&&q.x<cam.width&&q.y>0&&q.y<cam.height,'saved ball remains framed');
   }
   h.draws.length=0;if(savedAt!==null&&i-savedAt>=Math.floor(.5*hz))break;
  }
  assert.ok(windupText&&flight&&savedAt!==null);assert.ok(maxJump<360/hz,'bounded save framing shift '+maxJump+' at '+hz+' Hz');
 }
});
test('expired shooting context clears smoothly and resets on a fresh kickoff camera',()=>{
 const h=uiHarness(html),canvas=h.elements.get('game');canvas.getBoundingClientRect=()=>({left:0,top:0,width:500,height:757});
 h.chooseMode('practice');h.flush();const m=h.app.match,c=h.app.camera,s=m.snapshot();s.ball.x=FIELD.left+18;s.ball.y=FIELD.cy;s.shootingGoal=FIELD.left;
 c.update(s,0,false,true);assert.equal(c.goalBlend,1);
 delete s.shootingGoal;const before={x:c.x,y:c.y,zoom:c.zoom};c.update(s,0);
 assert.equal(c.x,before.x);assert.equal(c.y,before.y);assert.equal(c.zoom,before.zoom);
 for(let i=0;i<60;i++)c.update(s,1/60);
 assert.equal(c.goalBlend,0);const bounds=c.portraitBounds(c.zoom);assert.ok(c.x>=bounds[0]&&c.x<=bounds[1]);
 s.shootingGoal=FIELD.left;c.update(s,1/60);delete s.shootingGoal;c.update(s,0,false,true);
 assert.equal(c.goalBlend,0);assert.equal(c.goalContext,null);
});

test('aim captions avoid the keeper, ball and each other while camera and keeper move in portrait and desktop',()=>{
 for(const [width,height] of [[500,757],[1180,757]])for(const period of [1,2])for(const offset of [-35,0,35]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('practice');h.flush();const f=placeShot(h.app.match,180,0,0,period),cam=h.app.camera;cam.ready=false;h.app.render(0);
  const from=cam.project(f.p.x,f.p.y),goal=cam.project(f.goal,318+offset),len=Math.hypot(goal.x-from.x,goal.y-from.y),power=Math.min(cam.width,cam.height)*.32;
  const end={x:from.x+(goal.x-from.x)/len*power,y:from.y+(goal.y-from.y)/len*power};
  c.handlers.pointerdown(pointerEvent(h,from.x,from.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));
  for(let frame=0;frame<12;frame++){
   f.keeper.y=318+Math.sin(frame*.35)*22;h.draws.length=0;h.app.render(1/60);
   const foot=cam.project(f.keeper.x,f.keeper.y),head=cam.project(f.keeper.x,f.keeper.y,26),unit=1100/width;
   const keeper={left:foot.x-13*foot.scale,right:foot.x+13*foot.scale,top:head.y-5*unit,bottom:foot.y+5*unit};
   const ball=cam.project(f.m.ball.x,f.m.ball.y),ballBox={left:ball.x-8*unit,right:ball.x+8*unit,top:ball.y-8*unit,bottom:ball.y+8*unit};
   const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
   const panels=[];
   for(let i=0;i<h.draws.length;i++){
    const d=h.draws[i];if(d.method!=='fillText'||!(/IF CLEAR|GOAL AIM|^SHOT /.test(String(d.args[0]))))continue;
    const bg=h.draws[i-1];assert.equal(bg.method,'fillRect');const [x,y,w,height]=bg.args;
    const rect={left:x,right:x+w,top:y,bottom:y+height};
    assert.equal(overlap(rect,keeper),0,'caption covers keeper');assert.equal(overlap(rect,ballBox),0,'caption covers ball');
    for(const old of panels)assert.equal(overlap(rect,old),0,'captions overlap');
    assert.ok(rect.left>=0&&rect.right<=cam.width&&rect.top>=0&&rect.bottom<=cam.height);panels.push(rect);
   }
   assert.ok(panels.length>=2,'power and forecast remain visible');h.draws.length=0;
  }
  c.handlers.pointerup(pointerEvent(h,end.x,end.y));assert.ok(f.m.pendingKick?.shot,'layout preserves release action');
 }
});
test('replay event envelopes begin at recorded contact instead of animating before it',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.players[6];
 m.elapsed=1;m.ball.owner=null;const before=m.snapshot();
 m.elapsed=1.04;m.giveBall(p);p.tackleAt=m.elapsed;p.saveAt=m.elapsed;p.foulAt=m.elapsed;
 m.elapsed=1.05;const after=m.snapshot();
 const early=h.app.replaySample([before,after],.4),late=h.app.replaySample([before,after],.9);
 const e=early.players[p.id],l=late.players[p.id];
 for(const key of ['receive','tackle','save','fouled'])assert.equal(e[key],0,key+' must not anticipate its event');
 assert.equal(early.ball.owner,null);assert.equal(late.ball.owner,p.id);assert.equal(late.active,p.id);
 assert.ok(l.receive>.9);assert.ok(h.app.playerPose(l,late.ball).receive<.05,'pose begins gently after contact');
 const edge1=h.app.replaySample([before,after],.8-1e-5),edge2=h.app.replaySample([before,after],.8+1e-5);
 assert.ok(Math.abs(h.app.playerPose(edge1.players[p.id],edge1.ball).receive-h.app.playerPose(edge2.players[p.id],edge2.ball).receive)<.001);
 assert.equal(after.players[p.id].receive,m.snapshot().players[p.id].receive,'replay must not mutate live state');
});
test('replay envelopes still decay continuously across ordinary recorded frames',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.players[6];
 m.elapsed=2;m.giveBall(p);p.saveAt=2;p.tackleAt=2;p.foulAt=2;m.elapsed=2.06;const a=m.snapshot();m.elapsed=2.11;const b=m.snapshot();
 for(const fraction of [0,.25,.5,.75,1]){
  const s=h.app.replaySample([a,b],fraction),q=s.players[p.id],time=2.06+.05*fraction;
  for(const [key,duration] of [['receive',.18],['save',.65],['tackle',.36],['fouled',.6]])assert.ok(Math.abs(q[key]-(1-(time-2)/duration))<1e-8);
  assert.equal(s.ball.owner,p.id);
 }
});

function possessionAdvantageFixture(team=0,period=1,hz=60){
 const f=contactFixture(team,period);f.q.x=f.p.x-f.d*19;
 // The victim is recovering from a previous challenge, so the pursuing defender visibly closes.
 f.p.challengeUntil=f.m.elapsed+.6;f.controls.teams[team]={dx:f.d,dy:0};
 for(let i=0;i<hz&&!f.m.advantage&&f.m.phase==='playing';i++)f.m.step(1/hz,f.controls);
 assert.equal(f.m.advantage?.kind,'possession');return f;
}
test('real moving rear fouls allow a retained attack to advance in both halves and at 30/60/120 Hz',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const {m,p,controls,d}=possessionAdvantageFixture(team,period,hz),origin={...m.advantage.origin};
  assert.equal(m.owner.id,p.id);assert.equal(m.phase,'playing');
  for(let i=0;i<hz*2&&m.advantage&&m.phase==='playing';i++)m.step(1/hz,controls);
  assert.equal(m.advantage,null);assert.equal(m.phase,'playing');assert.equal(m.restarts,0);
  assert.ok((p.x-origin.x)*d>=45);assert.equal(m.fouls[1-team],1);
 }
});
test('standing, retreating, crowded, defensive-zone and penalty situations still get the foul immediately',()=>{
 for(const type of ['standing','retreat','crowded','defensive','penalty']){
  const f=contactFixture(0,1,type==='penalty');f.p.speed=80;
  if(type==='standing')f.p.speed=0;
  if(type==='retreat')f.p.angle=0;
  if(type==='defensive')f.p.x=750;
  if(type==='crowded'){f.m.players[12].x=f.p.x+f.d*45;f.m.players[12].y=f.p.y;}
  f.m.foul(f.q,f.p,'Challenge from behind');
  assert.equal(f.m.phase,'restart');assert.equal(f.m.advantage,null);
  assert.equal(f.m.restart.type,type==='penalty'?'Penalty Kick':'Direct Free Kick');
 }
});
test('a forward pass during advantage actually reaches a teammate before benefit is accepted',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const {m,p,q,d}=possessionAdvantageFixture(team,period,hz),r=m.players[team*11+6],origin={...m.advantage.origin};
  r.x=p.x+d*105;r.y=p.y+60;
  // Keep two opponents beyond the receiver so the completed pass is legally onside.
  for(const id of [(1-team)*11,(1-team)*11+1]){m.players[id].x=m.goalX(team)-d*20;m.players[id].y=100;}
  assert.ok(m.kick(p,r,.7));assert.ok(m.advantage);
  const input={teams:[{dx:0,dy:0},{dx:0,dy:0}]};
  for(let i=0;i<hz*2&&m.phase==='playing';i++){m.step(1/hz,input);if(m.owner?.id===r.id)break;}
  assert.equal(m.owner?.id,r.id);assert.equal(m.advantage,null);assert.equal(m.restarts,0);assert.ok((r.x-origin.x)*d>=45);
 }
});
test('failed continuation recalls the original location on timeout, interception, offside, exit and tackle',()=>{
 for(const failure of ['timeout','interception','offside','out','tackle']){
  const {m,p,q}=possessionAdvantageFixture(),original={...m.advantage.restart};
  if(failure==='timeout'){m.move=()=>{};for(let i=0;i<130&&m.phase==='playing';i++)m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});}
  if(failure==='interception'){m.ball.owner=null;m.receiveBall(q);}
  if(failure==='offside'){const r=m.players[6];m.ball.owner=null;m.offside={team:0,ids:[r.id]};m.receiveBall(r);}
  if(failure==='out'){m.stopForRestart({type:'Throw-in',team:1,x:550,y:FIELD.top});}
  if(failure==='tackle'){
   m.move=()=>{};p.angle=0;m.followBall();q.x=p.x+16;q.y=p.y;q.cooldown=0;m.protection=0;m.random=()=>0;
   m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  }
  assert.equal(m.phase,'restart',failure);assert.equal(m.advantage,null);assert.equal(m.restart.type,'Direct Free Kick');
  assert.equal(m.restart.team,original.team);assert.equal(m.restart.x,original.x);assert.equal(m.restart.y,original.y);
  assert.equal(m.fouls[1],1);assert.equal(m.restarts,1);
  m.step(1);assert.equal(m.restarts,1);
 }
});
test('a subsequent attacking foul can improve the restart to a penalty without erasing either offence',()=>{
 const {m,p,q,d}=possessionAdvantageFixture();p.x=m.goalX(0)-d*80;
 m.foul(q,p,'Challenge from behind');assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Penalty Kick');
 assert.equal(m.restart.team,0);assert.equal(m.fouls[1],2);assert.equal(m.advantage,null);
 const f=possessionAdvantageFixture(),original={...f.m.advantage.restart};f.p.x-=f.d*30;
 f.m.foul(f.q,f.p,'Challenge from behind');assert.equal(f.m.restart.x,original.x);assert.equal(f.m.fouls[1],2);
});
test('using a new shot during continuation consumes the advantage even when that shot misses',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'local'),180,0,team,period),q=f.m.players[(1-team)*11+9];
  q.x=f.p.x-f.d*20;q.y=f.p.y;f.p.speed=80;f.m.foul(q,f.p,'Challenge from behind');
  assert.equal(f.m.advantage?.kind,'possession');
  f.m.kick(f.p,{x:f.goal+f.d*20,y:408,shot:true},1);advanceToContact(f.m);
  assert.equal(f.m.advantage,null);
  assert.equal(finishShot(f.m,f.p,f.keeper),'miss');assert.equal(f.m.restart.type,'Goal Kick');assert.equal(f.m.fouls[1-team],1);
 }
});
test('held pointer can finish a real pass during advantage and its accessible announcement clears',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game'),p=m.owner,q=m.players[20],r=m.players[6];
 m.giveBall(p);p.x=550;p.y=318;p.angle=Math.PI;p.speed=80;q.x=570;q.y=318;
 for(const other of m.players)if(other!==p&&other!==q&&other!==r){other.x=other.team?100:900;other.y=110;}
 r.x=445;r.y=378;m.followBall();h.app.camera.ready=false;h.app.render(0);h.draws.length=0;
 const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
 c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
 m.foul(q,p,'Challenge from behind');h.app.syncMatch();assert.equal(m.advantage?.kind,'possession');
 assert.ok(c.hasPointerCapture(31));assert.ok(h.elements.get('matchStatus').textContent.includes('Continue the attack'));
 c.handlers.pointerup(pointerEvent(h,b.x,b.y));runPassFrames(h);
 assert.equal(m.owner?.id,r.id);assert.equal(m.passes[0],1);assert.equal(m.advantage,null);
 h.app.syncMatch();assert.ok(!h.elements.get('matchStatus').textContent.startsWith('Advantage:'));
});
test('continuation timers freeze on pause and are cleared on restart or the interval whistle',()=>{
 const f=possessionAdvantageFixture(),deadline=f.m.advantage.until,elapsed=f.m.elapsed;
 f.m.phase='paused';f.m.step(5);assert.equal(f.m.elapsed,elapsed);assert.equal(f.m.advantage.until,deadline);
 f.m.phase='playing';f.m.minute=44.999;f.m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
 assert.equal(f.m.phase,'restart');assert.equal(f.m.advantage,null);
 f.m.kickoff(0);assert.equal(f.m.advantage,null);
});


test('physical shootouts produce goals, saves and misses at both ends at 30/60/120 Hz',()=>{
 for(const period of [1,2])for(const hz of [30,60,120])for(const outcome of ['goal','save','miss']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.period=period;m.finish();
  const score=m.score.slice(),stats=[...m.shots,...m.saves,...m.passes],entry=playShootoutKick(m,outcome,hz);
  assert.deepEqual(m.score,score);assert.deepEqual([...m.shots,...m.saves,...m.passes],stats);
  assert.equal(entry.taker,9);assert.equal(m.penalties.history.length,1);
  assert.equal(m.penalties.score[0],outcome==='goal'?1:0);
  assert.equal(m.penalties.saves[1],outcome==='save'?1:0);
  const saved=JSON.stringify(m.penalties);assert.ok(!m.completeShootoutKick('goal'));assert.equal(JSON.stringify(m.penalties),saved);
  m.nextShootoutKick();assert.equal(m.penalties.goal,period===1?FIELD.left:FIELD.right);
  assert.equal(m.active,m.penalties.keeper);playShootoutKick(m,outcome,hz);
 }
});
test('shootout wind-up releases a moving ball and leaves a readable result beat before the next-kick panel',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.random=()=>.5;m.finish();const ball={x:m.ball.x,y:m.ball.y};
 assert.ok(m.takePenalty(0));m.step(.03,{dx:0,dy:0});
 assert.ok(m.pendingKick);assert.equal(m.penalties.history.length,0);assert.deepEqual({x:m.ball.x,y:m.ball.y},ball);
 const locked=m.penalties.aimY;m.step(.03,{aimDelta:1});assert.equal(m.penalties.aimY,locked);
 advanceToContact(m);assert.equal(m.penalties.stage,'flight');assert.ok(Math.hypot(m.ball.vx,m.ball.vy)>100);
 for(let i=0;i<240&&m.phase==='playing';i++)m.step(1/60,{dx:0,dy:0});
 assert.equal(m.phase,'shootoutResult');assert.equal(m.penalties.history.length,1);assert.ok(!m.nextShootoutKick());
 for(let i=0;i<30;i++)m.step(1/60);assert.equal(m.phase,'shootoutResult');
 for(let i=0;i<30;i++)m.step(1/60);assert.equal(m.phase,'penalties');
});
test('shootout takers rotate through all eleven eligible players before repeating',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.finish();const goal=m.penalties.goal,seen=[new Set(),new Set()];
 for(let n=0;n<24;n++){
  const p=m.penalties,team=p.turn,taker=p.taker;
  assert.equal(p.goal,goal);assert.equal(m.owner.id,taker);
  if(n<22){assert.ok(!seen[team].has(taker));seen[team].add(taker);}else assert.equal(taker,team*11+9);
  for(const q of m.players){
   if(q.id===taker||q.id===p.keeper)continue;
   if(q.keeper){assert.equal(q.x,goal);assert.ok(Math.abs(q.y-FIELD.cy)>120);}
   else assert.ok(Math.hypot(q.x-550,q.y-FIELD.cy)<=46);
  }
  playShootoutKick(m,'goal');assert.ok(!m.penalties.done);m.nextShootoutKick();
 }
 assert.equal(seen[0].size,11);assert.equal(seen[1].size,11);
});
test('a physical away shootout win clinches early and cannot be converted into a home win',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.score=[2,2];m.finish();
 while(!m.penalties.done){playShootoutKick(m,m.penalties.turn===0?'miss':'goal');m.nextShootoutKick();}
 assert.equal(m.phase,'full');assert.equal(m.winner(),1);assert.deepEqual(m.penalties.score,[0,3]);
 assert.deepEqual(m.score,[2,2]);assert.ok(!m.nextShootoutKick());assert.equal(m.winner(),1);
});
function shootoutUI(portrait=false,period=2){
 const h=uiHarness(html),c=h.elements.get('game');
 if(portrait)c.getBoundingClientRect=()=>({left:0,top:0,width:500,height:757});
 h.chooseMode('cup');h.click('startMatch');h.flush();const m=h.app.match;m.period=period;m.random=()=>.5;m.finish();h.app.syncMatch();h.app.render(0);h.draws.length=0;
 return h;
}
function shootoutEvent(h,q,id=81,type='mouse'){
 const r=h.elements.get('game').getBoundingClientRect();
 return {clientX:q.x*r.width/1100,clientY:q.y*r.width/1100,pointerId:id,pointerType:type,button:0,isPrimary:true,preventDefault(){}};
}
test('real pointer event sequences aim and score shootouts in desktop and portrait at either goal',()=>{
 for(const portrait of [false,true])for(const period of [1,2]){
  const h=shootoutUI(portrait,period),m=h.app.match,c=h.elements.get('game'),p=m.owner;
  const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(m.penalties.goal+m.direction(0)*20,FIELD.cy+45);
  const height=1100*c.getBoundingClientRect().height/c.getBoundingClientRect().width;
  for(const q of [a,h.app.camera.project(m.penalties.goal,FIELD.cy-FIELD.goalHalf),h.app.camera.project(m.penalties.goal,FIELD.cy+FIELD.goalHalf)]){
   assert.ok(q.x>0&&q.x<1100&&q.y>0&&q.y<height,'taker and posts visible before aiming');
  }
  c.handlers.pointerdown(shootoutEvent(h,a));c.handlers.pointermove(shootoutEvent(h,b));
  assert.ok(h.app.pointerAim(h.app.drag).shot);assert.ok(h.app.shotForecast());
  for(let i=0;i<10;i++){m.step(1/60,h.app.input());h.app.render(1/60);h.draws.length=0;}
  assert.equal(m.ball.owner,p.id);assert.equal(m.penalties.history.length,0);
  // Re-aim at the intended goal-plane coordinate after the camera's small settling movement.
  const updated=h.app.camera.project(m.penalties.goal+m.direction(0)*20,FIELD.cy+45);
  c.handlers.pointermove(shootoutEvent(h,updated));c.handlers.pointerup(shootoutEvent(h,updated));
  assert.ok(m.pendingKick);assert.equal(m.pendingKick.player,p.id);
  for(let i=0;i<600&&m.phase!=='penalties';i++){m.step(1/60,h.app.input());h.app.syncMatch();h.app.render(1/60);h.draws.length=0;}
  assert.equal(m.penalties.history[0].outcome,'goal');assert.equal(m.penalties.history.length,1);
  h.click('nextPenalty');assert.equal(m.active,m.penalties.keeper);assert.ok(c.focused);
  assert.ok(h.elements.get('gameControls').textContent.includes('move your goalkeeper'));
 }
});
test('shootout keyboard aim is responsive without dribbling and Space locks one physical shot',()=>{
 for(const portrait of [false,true]){
  const h=shootoutUI(portrait),m=h.app.match,p=m.owner,initial={x:p.x,y:p.y};
  const a=h.app.camera.project(m.penalties.goal,FIELD.cy),b=h.app.camera.project(m.penalties.goal,FIELD.cy+40);
  const key=Math.abs(b.x-a.x)>Math.abs(b.y-a.y)?(b.x>a.x?'ArrowRight':'ArrowLeft'):(b.y>a.y?'ArrowDown':'ArrowUp');
  h.window.handlers.keydown(keyEvent(key));
  for(let i=0;i<30;i++)m.step(1/60,h.app.input());h.window.handlers.keyup(keyEvent(key));
  assert.ok(m.penalties.aimY>FIELD.cy+20);assert.deepEqual({x:p.x,y:p.y},initial);
  h.window.handlers.keydown(keyEvent(' '));const id=m.pendingKick.id;h.window.handlers.keydown(keyEvent(' ',true));assert.equal(m.pendingKick.id,id);
  advanceToContact(m);assert.equal(m.penalties.stage,'flight');assert.equal(m.ball.owner,null);
 }
});
test('held pointer controls the shootout goalkeeper without selecting a waiting teammate or firing a kick',()=>{
 for(const portrait of [false,true]){
  const h=shootoutUI(portrait),m=h.app.match,c=h.elements.get('game');playShootoutKick(m,'goal');h.app.syncMatch();h.click('nextPenalty');
  const keeper=m.players[m.penalties.keeper],start=keeper.y,a=h.app.camera.project(keeper.x,keeper.y),b=h.app.camera.project(keeper.x,keeper.y+80);
  c.handlers.pointerdown(shootoutEvent(h,a));c.handlers.pointermove(shootoutEvent(h,b));
  for(let i=0;i<25;i++){m.step(1/60,h.app.input());h.app.render(1/60);h.draws.length=0;}
  assert.equal(m.active,keeper.id);assert.ok(keeper.y>start+15);assert.equal(keeper.x,m.penalties.goal);
  c.handlers.pointerup(shootoutEvent(h,b));assert.ok(!m.pendingKick);assert.equal(m.penalties.history.length,1);
  // Keeper choice affects a genuine incoming shot: stay on the far side of a centre shot.
  m.penalties.decision=Object.freeze({...m.penalties.decision,shot:Object.freeze({...m.penalties.decision.shot,y:FIELD.cy,power:.85})});
  for(let i=0;i<600&&m.phase!=='penalties';i++)m.step(1/60,{dx:0,dy:0});
  assert.equal(m.penalties.history[1].outcome,'goal');
 }
});
test('shootout cancellation never kicks and pause freezes aim, contact, flight and result',()=>{
 const h=shootoutUI(),m=h.app.match,c=h.elements.get('game'),a=h.app.camera.project(m.owner.x,m.owner.y),b=h.app.camera.project(m.penalties.goal,FIELD.cy+40);
 c.handlers.pointerdown(shootoutEvent(h,a));c.handlers.pointermove(shootoutEvent(h,b));c.handlers.pointercancel(shootoutEvent(h,b));
 assert.ok(!m.pendingKick);assert.equal(m.penalties.history.length,0);
 const pauseCheck=()=>{const phase=m.phase,before=JSON.stringify({ball:m.ball,elapsed:m.elapsed,p:m.penalties});h.click('menuBtn');assert.equal(m.phase,'paused');for(let i=0;i<60;i++)m.step(1/60);assert.equal(JSON.stringify({ball:m.ball,elapsed:m.elapsed,p:m.penalties}),before);h.click('resumePause');assert.equal(m.phase,phase);};
 pauseCheck();m.takePenalty(0);pauseCheck();advanceToContact(m);pauseCheck();
 for(let i=0;i<240&&m.phase==='playing';i++)m.step(1/60,{dx:0,dy:0});
 assert.equal(m.phase,'shootoutResult');pauseCheck();
 for(let i=0;i<60;i++)m.step(1/60);assert.equal(m.phase,'penalties');pauseCheck();
});
test('physical shootout wins preserve quarterfinal semifinal final progression and championship',()=>{
 const h=uiHarness(html);h.chooseMode('cup');
 for(let round=0;round<3;round++){
  h.click('startMatch');h.flush();const m=h.app.match;assert.equal(h.app.round,round);m.finish();
  while(!m.penalties.done){playShootoutKick(m,m.penalties.turn===0?'goal':'save');h.app.syncMatch();h.click('nextPenalty');}
  assert.equal(h.app.view,'full');assert.ok(h.elements.get('resultMsg').textContent.includes('Congratulations'));
  h.click('continueCup');
 }
 assert.ok(h.app.champion);assert.equal(h.app.view,'trophy');
});
test('normal practice and local draw still finish directly without shootouts',()=>{
 for(const mode of ['practice','local']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);m.finish();
  assert.equal(m.phase,'full');assert.ok(!m.penalties);assert.equal(m.winner(),null);
 }
});

test('shootout fifth reply can decide a regulation sequence and the loss returns to the cup',()=>{
 const h=shootoutUI(),m=h.app.match;
 for(let n=0;n<10;n++){
  playShootoutKick(m,n===8?'miss':'goal');h.app.syncMatch();
  if(n===8){assert.ok(!m.penalties.done);assert.equal(h.elements.get('penaltyPrompt').textContent,'Round 5 · Move your goalkeeper');}
  h.click('nextPenalty');
 }
 assert.equal(m.phase,'full');assert.deepEqual(m.penalties.score,[4,5]);assert.equal(m.winner(),1);
 h.click('continueCup');assert.equal(h.app.view,'trophy');assert.equal(h.app.round,0);assert.ok(!h.app.champion);
});
test('shootout idle and drag strength retain intentional release with different physical ball speeds',()=>{
 const speeds=[];
 for(const power of [.25,.75]){
  const h=shootoutUI(),m=h.app.match,c=h.elements.get('game'),initial={x:m.ball.x,y:m.ball.y};
  for(let n=0;n<360;n++)m.step(1/60,h.app.input());
  assert.deepEqual({x:m.ball.x,y:m.ball.y},initial);assert.ok(!m.pendingKick);assert.equal(m.penalties.history.length,0);
  const a=h.app.camera.project(m.owner.x,m.owner.y),b=h.app.camera.project(m.penalties.goal,FIELD.cy+36),len=Math.hypot(b.x-a.x,b.y-a.y),amount=620*.32*power;
  const end={x:a.x+(b.x-a.x)/len*amount,y:a.y+(b.y-a.y)/len*amount};
  c.handlers.pointerdown(shootoutEvent(h,a));c.handlers.pointermove(shootoutEvent(h,end));c.handlers.pointerup(shootoutEvent(h,end));
  assert.ok(Math.abs(m.pendingKick.power-power)<.001);advanceToContact(m);speeds.push(Math.hypot(m.ball.vx,m.ball.vy));
 }
 assert.ok(speeds[1]>speeds[0]+75);
});

test('halftime suppresses live HUD and restores current score clock direction and controls on resume',()=>{
 for(const local of [false,true])for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game'),hud=h.elements.get('hud');
  c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?500:1180,height:757});
  if(local){h.chooseMode('multi');h.click('startLocal');}else{h.chooseMode('cup');h.click('startMatch');}h.flush();
  const m=h.app.match,before=h.elements.get('attackDirection').textContent;
  assert.ok(!hud.classList.contains('hidden'));assert.equal(hud.getAttribute('aria-hidden'),'false');
  m.score=[2,1];m.giveBall(m.owner);m.minute=44.999;m.step(1/60,{dx:0,dy:0});h.app.syncMatch();
  assert.equal(h.app.view,'half');assert.ok(hud.classList.contains('hidden'));assert.equal(hud.getAttribute('aria-hidden'),'true');
  assert.ok(!h.elements.get('half').classList.contains('hidden'));assert.equal(h.elements.get('halfGoals').textContent,'2 – 1');
  assert.ok(h.elements.get('halfSummary').textContent.includes(m.home.name+' 2 - 1 '+m.away.name));
  assert.ok(h.elements.get('resume').focused);assert.ok(h.elements.get('hint').classList.contains('hidden'));
  const snapshot=m.snapshot();for(let i=0;i<12;i++){m.step(1/60,h.app.input());h.app.syncMatch();h.app.render(1/60);h.draws.length=0;}
  assert.deepEqual(m.snapshot(),snapshot);assert.ok(hud.classList.contains('hidden'));
  h.elements.get('resume').focused=false;h.app.syncMatch();assert.ok(!h.elements.get('resume').focused,'do not steal focus each animation frame');
  h.click('resume');
  assert.equal(m.period,2);assert.equal(m.phase,'playing');assert.equal(m.direction(0),1);
  assert.ok(!hud.classList.contains('hidden'));assert.equal(hud.getAttribute('aria-hidden'),'false');
  assert.ok(h.elements.get('half').classList.contains('hidden'));assert.ok(c.focused);
  assert.equal(h.elements.get('clock').textContent,'45:00');assert.equal(h.elements.get('scoreText').textContent,'2 - 1');
  assert.ok(h.elements.get('attackDirection').textContent!==before);
  assert.equal(h.elements.get('attackDirection').textContent,local?(portrait?'P1 ↓  ·  P2 ↑':'P1 →  ·  P2 ←'):(portrait?'ATTACK ↓':'ATTACK →'));
  h.click('menuBtn');assert.equal(m.phase,'paused');h.click('resumePause');assert.equal(m.phase,'playing');
 }
 assert.ok(html.includes('.hidden{display:none!important}'),'hidden HUD is absent from layout, accessibility tree and tab order');
 assert.ok(/id="resume" aria-describedby="halfSummary"/.test(html),'focused resume action includes the halftime score summary');
});
test('resizing during halftime leaves HUD hidden and restores orientation before the next frame',()=>{
 for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');h.chooseMode('cup');h.click('startMatch');h.flush();
  const m=h.app.match;m.phase='half';m.minute=45;h.app.syncMatch();
  c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?500:1180,height:757});
  h.app.render(1/60);h.draws.length=0;assert.ok(h.elements.get('hud').classList.contains('hidden'));
  // Change orientation once more without a render; resume must refresh the direction synchronously.
  c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?1180:500,height:757});
  h.click('resume');
  assert.equal(h.elements.get('attackDirection').textContent,portrait?'ATTACK →':'ATTACK ↓');
  assert.ok(!h.elements.get('hud').classList.contains('hidden'));assert.equal(h.elements.get('hud').getAttribute('aria-hidden'),'false');
 }
});

test('opponent shooter commits before keeper input and retains target power and launch timing under late changes',()=>{
 for(const hz of [30,60,120])for(const period of [1,2]){
  const trials=[];
  for(const variant of [-1,1,0]){
   const m=new SoccerMatch(NATIONS[0],NATIONS[2],'cup',87);m.period=period;m.finish();
   m.penalties.turn=1;m.penalties.stage='result';m.prepareShootoutKick();
   const decision=m.penalties.decision,copy=JSON.stringify(decision);
   assert.ok(Object.isFrozen(decision)&&Object.isFrozen(decision.shot)&&Object.isFrozen(decision.keeper));
   decision.shot.y+=100;decision.shot.power=0;
   assert.equal(JSON.stringify(decision),copy);
   for(let frame=0;frame<hz*3&&m.penalties.stage==='aim';frame++){
    const dy=variant|| (frame/hz<1.55?-1:1);
    m.step(1/hz,{dx:0,dy});assert.equal(JSON.stringify(m.penalties.decision),copy);
    if(m.pendingKick){assert.equal(m.pendingKick.target.y,decision.shot.y);assert.equal(m.pendingKick.power,decision.shot.power);}
   }
   assert.equal(m.penalties.stage,'flight');
   trials.push({decision,at:m.penalties.releasedAt,target:m.flight.target,speed:Math.hypot(m.ball.vx,m.ball.vy)});
  }
  assert.deepEqual(trials[0],trials[1]);assert.deepEqual(trials[0],trials[2]);
 }
});
test('opponent keeper follows the same precommitted path for opposite shots and late aim changes',()=>{
 for(const seed of [1,2,3])for(const period of [1,2]){
  const trials=[];
  for(const side of [-1,1]){
   const m=new SoccerMatch(NATIONS[0],NATIONS[2],'cup',seed);m.period=period;m.finish();
   const decision=m.penalties.decision,copy=JSON.stringify(decision);
   for(let i=0;i<90;i++)m.step(1/60,{dx:0,dy:0,aimDelta:i<85?-side:side});
   assert.equal(JSON.stringify(m.penalties.decision),copy);assert.equal(m.players[m.penalties.keeper].y,FIELD.cy);
   m.kick(m.owner,{x:m.penalties.goal+m.direction(0)*20,y:FIELD.cy+side*40,shot:true},.8);advanceToContact(m);
   const path=[];for(let i=0;i<15;i++){m.step(1/120,{dx:0,dy:0,aimDelta:-side});path.push(m.players[m.penalties.keeper].y);}
   assert.equal(JSON.stringify(m.penalties.decision),copy);
   trials.push({decision,path});
  }
  assert.deepEqual(trials[0],trials[1]);
 }
});
test('precommitted shootout guesses allow both saves and goals rather than guaranteeing an outcome',()=>{
 const counts={goal:0,save:0};
 for(let seed=1;seed<=60;seed++){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'cup',seed);m.period=2;m.finish();
  m.kick(m.owner,{x:m.penalties.goal+20,y:FIELD.cy+(seed%2?-40:40),shot:true},.8);
  for(let i=0;i<600&&m.phase!=='penalties';i++)m.step(1/60,{dx:0,dy:0});
  const result=m.penalties.history[0];assert.ok(result.outcome in counts);counts[result.outcome]++;
  assert.deepEqual(result.decision,m.penalties.decision);
 }
 assert.ok(counts.goal>=15&&counts.save>=10);assert.equal(counts.goal+counts.save,60);
});
test('each shootout attempt receives a fresh decision and completed decisions survive sudden death',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.finish();
 for(let i=0;i<12;i++){
  const old=m.penalties.decision;
  playShootoutKick(m,i===11?'save':'goal');
  const recorded=m.penalties.history.at(-1).decision,copy=JSON.stringify(recorded);
  assert.ok(Object.isFrozen(recorded));m.nextShootoutKick();
  if(i<11){assert.ok(m.penalties.decision!==recorded&&m.penalties.decision!==old);assert.equal(m.penalties.stage,'aim');}
  assert.equal(JSON.stringify(m.penalties.history.at(-1).decision),copy);
 }
 assert.equal(m.phase,'full');assert.equal(m.winner(),0);assert.deepEqual(m.penalties.taken,[6,6]);
});
test('fresh movement coalesced into pointer release after held possession recovery completes a pass once',()=>{
 for(const type of ['mouse','touch'])for(const hz of [30,60,120])for(const portrait of [false,true]){
  const {h,c,m,p,r}=passReceptionFixture(portrait?500:1180,757),a=h.app.camera.project(p.x,p.y),ev=q=>pointerEvent(h,q.x,q.y,31,type);
  c.handlers.pointerdown(ev(a));c.handlers.pointermove(ev({x:a.x+80,y:a.y}));
  m.giveBall(m.players[20]);h.app.input();m.giveBall(p);h.app.input();
  const b=h.app.camera.project(r.x,r.y);c.handlers.pointerup(ev(b));
  assert.ok(m.pendingKick);assert.equal(m.pendingKick.target.receiverId,r.id);
  runPassFrames(h,hz);assert.equal(m.owner?.id,r.id);assert.equal(m.passes[0],1);
  c.handlers.pointerup(ev(b));assert.ok(!m.pendingKick);assert.equal(m.passes[0],1);
 }
});
test('teammate first touches remain continuous without delaying immediate pass contact for either team',()=>{
 for(const team of [0,1])for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.players[team*11+6];
  for(const q of m.players){q.x=100;q.y=100;}p.x=550;p.y=318;p.angle=-Math.PI/2;
  Object.assign(m.ball,{owner:null,x:p.x,y:p.y+18,z:0,vx:0,vy:-200,lastTouch:team});
  m.flight={team,shot:false,receiverId:p.id};const at={x:m.ball.x,y:m.ball.y};m.receiveBall(p);
  assert.equal(m.ball.x,at.x);assert.equal(m.ball.y,at.y);
  const samples=[m.ball.y];
  for(let i=1;i<=Math.ceil(.12*hz);i++){m.elapsed=i/hz;m.followBall();samples.push(m.ball.y);}
  assert.ok(samples.every((y,i)=>i===0||Math.abs(y-samples[i-1])<12));
  assert.ok(Math.abs(m.ball.y-(p.y-10))<.01);
  // Reproduce receiving and kicking immediately; the touch need not finish first.
  Object.assign(m.ball,{owner:null,x:p.x,y:p.y+18,z:0,lastTouch:team});m.flight={team,shot:false,receiverId:p.id};m.receiveBall(p);
  const before={x:m.ball.x,y:m.ball.y};assert.ok(m.kick(p,{x:p.x+150,y:p.y,pass:true},.5));
  m.followBall();assert.deepEqual({x:m.ball.x,y:m.ball.y},before);assert.equal(m.pendingKick.duration,.075);
  advanceToContact(m);assert.equal(m.ball.owner,null);assert.ok(m.ball.vx>0);
 }
});
test('human and computer control share pass wind-up and launch speed and both receive the ball',()=>{
 const results=[];
 for(const human of [true,false]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');for(const p of m.players){p.x=100;p.y=100;}
  const p=m.players[9],r=m.players[6];p.x=550;p.y=318;r.x=550;r.y=438;m.giveBall(p);
  const input=human?{dx:0,dy:0}:null;
  assert.ok(m.kick(p,{...r,receiverId:r.id,pass:true},.5));const delay=m.pendingKick.duration;advanceToContact(m);
  const speed=Math.hypot(m.ball.vx,m.ball.vy);let received=false;
  for(let i=0;i<240;i++){m.step(1/120,input);if(m.owner){received=m.owner.id===r.id;break;}}
  assert.ok(received);results.push({delay,speed});
 }
 assert.deepEqual(results[0],results[1]);assert.equal(results[0].delay,.075);
});
test('coalesced recovered release supports consecutive passes while stale releases remain inert',()=>{
 const {h,c,m,p,r}=passReceptionFixture(),ev=q=>pointerEvent(h,q.x,q.y),a=h.app.camera.project(p.x,p.y);
 c.handlers.pointerdown(ev(a));m.giveBall(m.players[20]);h.app.input();m.giveBall(p);h.app.input();
 c.handlers.pointerup(ev(a));assert.ok(!m.pendingKick);assert.equal(m.passes[0],0);
 for(let n=0;n<3;n++){
  const owner=m.owner,target=owner.id===p.id?r:p;
  // Isolate reception/gesture continuity; live-pressure consecutive passes are covered separately.
  target.x=owner.x;target.y=owner.y>FIELD.cy?owner.y-110:owner.y+110;
  h.app.render(0);h.draws.length=0;
  const from=h.app.camera.project(owner.x,owner.y),to=h.app.camera.project(target.x,target.y);
  c.handlers.pointerdown(ev(from));c.handlers.pointermove(ev(to));c.handlers.pointerup(ev(to));
  runPassFrames(h,60,4,true);assert.equal(m.owner?.id,target.id);assert.equal(m.passes[0],n+1);
 }
});

function assertSpreadKickoff(m){
 const taker=m.owner;
 assert.equal(m.setPiece,'Kick-off');assert.equal(m.ball.x,550);assert.equal(m.ball.y,FIELD.cy);
 for(const p of m.players)if(p.id!==taker.id){
  assert.ok((p.x-550)*m.direction(p.team)<=0,'all non-takers in own half');
  if(p.team!==taker.team)assert.ok(distance(p,m.ball)>=66);
  else assert.ok(distance(p,taker)>=60,'no teammate stacked at centre');
 }
 for(const team of [0,1]){
  const ps=m.players.filter(p=>p.team===team&&!p.keeper&&p.id!==taker.id);
  assert.ok(new Set(ps.map(p=>Math.round(p.x))).size>=4,'distinct formation depths');
  assert.ok(Math.max(...ps.map(p=>p.x))-Math.min(...ps.map(p=>p.x))>=250);
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++)assert.ok(distance(ps[i],ps[j])>=45);
 }
 const support=m.players.filter(p=>p.team===taker.team&&!p.keeper&&p.id!==taker.id&&distance(p,taker)<210);
 assert.ok(support.length>=5);assert.ok(support.some(p=>p.y<FIELD.cy-80));assert.ok(support.some(p=>p.y>FIELD.cy+80));
}
test('spread kickoff shape holds through idle time and wind-up for either team and direction',()=>{
 for(const period of [1,2])for(const team of [0,1])for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const positions=()=>m.players.map(p=>({x:p.x,y:p.y})),before=positions(),input={teams:[{dx:0,dy:0},{dx:0,dy:0}]};
  assertSpreadKickoff(m);
  for(let i=0;i<hz*10;i++)m.step(1/hz,input);
  assertSpreadKickoff(m);assert.deepEqual(positions(),before);assert.equal(m.minute,0);
  const p=m.owner,r=m.players[team*11+6];assert.ok(m.kick(p,r,.5));
  m.step(.03,input);assert.deepEqual(positions(),before);assert.equal(m.ball.owner,p.id);
  advanceToContact(m);assert.equal(m.setPiece,null);assert.equal(m.restartGuard,null);assert.equal(m.kickoffGrace,0);
  for(let i=0;i<hz/4;i++)m.step(1/hz,input);
  assert.ok(m.minute>0);assert.ok(m.players.some(q=>q.team!==team&&distance(q,before[q.id])>5),'opponents may move immediately after contact');
 }
});
test('first kickoff halftime and every post-goal restart use the same spread legal formation',()=>{
 for(const mode of ['cup','practice','local']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);assertSpreadKickoff(m);assert.equal(m.owner.team,0);
  m.phase='half';m.resumeHalf();assert.equal(m.period,2);assert.equal(m.owner.team,1);assertSpreadKickoff(m);
  for(const period of [1,2])for(const scorer of [0,1]){
   m.period=period;m.scorer=scorer;m.phase='replay';m.skipReplay();
   assert.equal(m.owner.team,1-scorer);assertSpreadKickoff(m);
  }
 }
});
test('solo opposition kickoff respects the frozen shape until its actual AI kick contact',()=>{
 for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2]);m.period=period;m.kickoff(1);
  const before=m.players.map(p=>({x:p.x,y:p.y}));
  for(let i=0;i<63;i++)m.step(1/60,{dx:0,dy:0});
  assertSpreadKickoff(m);assert.deepEqual(m.players.map(p=>({x:p.x,y:p.y})),before);
  for(let i=0;i<30&&m.setPiece;i++)m.step(1/60,{dx:0,dy:0});
  assert.equal(m.setPiece,null);assert.equal(m.restartGuard,null);assert.equal(m.passes[1],1);
 }
});
test('directional kickoff passes select and reach short diagonal backward and long outlets with live AI',()=>{
 for(const period of [1,2])for(const hz of [30,60,120])for(const id of [6,8,5,2]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,c=h.elements.get('game');
  m.period=period;m.kickoff(0);h.app.camera.ready=false;h.app.render(0);h.draws.length=0;
  for(let i=0;i<hz*3;i++)m.step(1/hz,h.app.input());
  const p=m.owner,r=m.players[id],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y),n=Math.hypot(b.x-a.x,b.y-a.y);
  const length=id===2?180:90,end={x:a.x+(b.x-a.x)/n*length,y:a.y+(b.y-a.y)/n*length},ev=q=>pointerEvent(h,q.x,q.y);
  c.handlers.pointerdown(ev(a));c.handlers.pointermove(ev(end));assert.equal(h.app.pointerAim(h.app.drag).target.receiverId,id);
  c.handlers.pointerup(ev(end));assert.equal(m.pendingKick.target.receiverId,id);assert.equal(m.pendingKick.duration,.075);
  runPassFrames(h,hz,5,true);assert.equal(m.owner?.id,id,'actual intended reception '+id+' period '+period+' Hz '+hz);
  assert.equal(m.passes[0],1);assert.equal(m.shots[0],0);assert.equal(m.setPiece,null);assert.ok(m.minute>0);
 }
});
test('an off-player drag crossing a different teammate sprite keeps its intended directional lane',()=>{
 for(const portrait of [false,true]){
  const {h,c,m,p,r}=passReceptionFixture(portrait?500:1180,757),near=m.players[8];near.x=p.x+50;near.y=p.y;
  const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y),over=h.app.camera.project(near.x,near.y);
  const start={x:over.x-(b.x-a.x),y:over.y-(b.y-a.y)},ev=q=>pointerEvent(h,q.x,q.y);
  c.handlers.pointerdown(ev(start));c.handlers.pointermove(ev(over));assert.equal(h.app.pointerAim(h.app.drag).target.receiverId,r.id);
  c.handlers.pointerup(ev(over));runPassFrames(h);assert.equal(m.owner?.id,r.id);assert.equal(m.passes[0],1);
 }
});
test('directed passes pass nearby teammates but retain body blocks and normal opponent interception',()=>{
 for(const hz of [30,60,120])for(const kind of ['beside','body','opponent']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.players[9],r=m.players[6],q=m.players[kind==='opponent'?20:8];
  for(const a of m.players){a.x=100;a.y=100;}p.x=550;p.y=318;r.x=700;r.y=318;q.x=610;q.y=kind==='body'?318:333;
  m.giveBall(p);m.move=()=>{};m.kick(p,{...r,receiverId:r.id,pass:true},.7);
  for(let i=0;i<hz*4;i++){m.step(1/hz,{dx:0,dy:0});if(!m.pendingKick&&m.owner)break;}
  assert.equal(m.owner?.id,kind==='beside'?r.id:q.id);
 }
});
test('unaddressed passes retain normal teammate trapping and cannot silently grant receiver immunity',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.players[9],r=m.players[6],q=m.players[8];
 for(const a of m.players){a.x=100;a.y=100;}p.x=550;p.y=318;r.x=700;r.y=318;q.x=610;q.y=333;m.giveBall(p);m.move=()=>{};
 m.kick(p,{x:700,y:318,pass:true},1);advanceToContact(m);assert.equal(m.flight.directed,false);
 for(let i=0;i<300&&!m.owner;i++)m.step(1/120,{dx:0,dy:0});assert.equal(m.owner?.id,q.id);
});

test('a live non-target teammate yields the addressed pass lane instead of running across it',()=>{
 for(const hz of [30,60,120])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.period=period;
  const p=m.players[9],r=m.players[6],q=m.players[8];for(const a of m.players){a.x=a.team&&period===2?1000:100;a.y=100;}
  p.x=550;p.y=318;r.x=700;r.y=318;q.x=610;q.y=333;m.giveBall(p);
  m.kick(p,{...r,receiverId:r.id,pass:true},.7);
  for(let i=0;i<hz*4;i++){m.step(1/hz,{dx:0,dy:0});if(!m.pendingKick&&m.owner)break;}
  assert.equal(m.owner?.id,r.id);assert.ok(q.y>333,'support run yields outside the lane');
 }
});

test('shootout practice is reachable from the menu without a regulation match or state injection',()=>{
 for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?500:1180,height:757});
  h.chooseMode('shootout');assert.equal(h.app.view,'loading');assert.ok(h.elements.get('loadText').textContent.includes('Shootout practice'));
  h.flush();h.app.render(0);const m=h.app.match;
  assert.equal(m.mode,'shootout');assert.equal(h.app.view,'match');assert.equal(m.penalties.stage,'aim');assert.equal(m.penalties.turn,0);
  assert.equal(m.owner.id,m.penalties.taker);assert.equal(m.minute,90);assert.equal(h.app.round,0);
  assert.ok(!h.elements.get('shootoutInfo').classList.contains('hidden'));
  assert.equal(h.elements.get('shootoutRole').textContent,'PRACTICE · ROUND 1 · YOUR KICK');
  assert.ok(h.elements.get('shootoutLiveHistory').innerHTML.includes('Kick 1: waiting'));
  const p=m.owner,point=h.app.camera.project(p.x,p.y),goal=h.app.camera.project(m.penalties.goal+m.direction(0)*20,FIELD.cy+40);
  c.handlers.pointerdown(shootoutEvent(h,point));c.handlers.pointermove(shootoutEvent(h,goal));c.handlers.pointerup(shootoutEvent(h,goal));
  assert.ok(m.pendingKick);h.app.syncMatch();assert.equal(h.elements.get('shootoutAction').textContent,'Striking…');
  for(let n=0;n<600&&m.phase!=='penalties';n++){m.step(1/60,h.app.input());h.app.syncMatch();h.app.render(1/60);h.draws.length=0;}
  assert.equal(m.penalties.taken[0],1);assert.ok(h.elements.get('nextPenalty').focused);
  h.click('nextPenalty');assert.equal(m.penalties.turn,1);assert.equal(m.active,m.penalties.keeper);
  assert.equal(h.elements.get('shootoutAction').textContent,'Move keeper now · Shot in 2s');
  for(let n=0;n<45;n++)m.step(1/60,h.app.input());h.app.syncMatch();
  assert.equal(h.elements.get('shootoutAction').textContent,'Move keeper now · Shot in 1s');
 }
});
test('shootout practice win and loss offer play again and return to teams without advancing the cup',()=>{
 for(const winner of [0,1]){
  const h=uiHarness(html);h.chooseMode('shootout');h.flush();const m=h.app.match,first=m.penalties.decision;
  while(!m.penalties.done){playShootoutKick(m,m.penalties.turn===winner?'goal':'save');h.app.syncMatch();h.click('nextPenalty');}
  assert.equal(h.app.view,'full');assert.equal(m.winner(),winner);
  assert.equal(h.elements.get('resultEyebrow').textContent,'Shootout practice');
  assert.equal(h.elements.get('resultGoals').textContent,m.penalties.score.join(' – '));
  assert.ok(!h.elements.get('practiceAgain').classList.contains('hidden'));assert.equal(h.elements.get('continueCup').textContent,'BACK TO TEAMS');
  assert.equal(h.app.round,0);assert.ok(!h.app.champion);
  h.click('practiceAgain');h.flush();assert.equal(h.app.match.mode,'shootout');assert.deepEqual(h.app.match.penalties.score,[0,0]);
  assert.ok(JSON.stringify(h.app.match.penalties.decision)!==JSON.stringify(first),'practice session varies plans without reading input');
  const again=h.app.match;while(!again.penalties.done){playShootoutKick(again,again.penalties.turn===0?'goal':'save');h.app.syncMatch();h.click('nextPenalty');}
  h.click('continueCup');assert.equal(h.app.view,'menu');assert.equal(h.app.match,null);assert.equal(h.app.round,0);
  h.chooseMode('cup');assert.equal(h.app.view,'trophy');assert.equal(h.app.round,0);
 }
});
test('shootout practice selected nation pause restart cancellation and quit preserve normal controls',()=>{
 const h=uiHarness(html);h.click('next');h.chooseMode('shootout');h.flush();
 assert.equal(h.app.match.home.name,'Argentina');assert.equal(h.elements.get('homeName').textContent,'Argentina');
 const m=h.app.match,decision=JSON.stringify(m.penalties.decision),c=h.elements.get('game'),p=h.app.camera.project(m.owner.x,m.owner.y);
 c.handlers.pointerdown(shootoutEvent(h,p));c.handlers.pointermove(shootoutEvent(h,{x:p.x+90,y:p.y}));
 h.click('menuBtn');assert.equal(m.phase,'paused');assert.equal(h.app.drag,null);assert.ok(!m.pendingKick);
 assert.ok(h.elements.get('coreControls').innerHTML.includes('Move your keeper'));assert.equal(h.elements.get('restartMatch').textContent,'RESTART SHOOTOUT');
 assert.ok(h.elements.get('shootoutInfo').classList.contains('hidden'));
 for(let i=0;i<60;i++)m.step(1/60);assert.equal(JSON.stringify(m.penalties.decision),decision);
 h.click('resumePause');assert.equal(m.phase,'playing');assert.ok(!h.elements.get('shootoutInfo').classList.contains('hidden'));
 h.click('menuBtn');h.click('restartMatch');h.flush();assert.ok(h.app.match!==m);assert.equal(h.app.match.penalties.history.length,0);
 h.chooseMode('menu');assert.equal(h.app.match,null);assert.ok(h.elements.get('shootoutInfo').classList.contains('hidden'));
 h.chooseMode('practice');h.flush();assert.ok(!h.app.match.penalties);h.click('menuBtn');
 assert.equal(h.elements.get('restartMatch').textContent,'RESTART MATCH');assert.ok(h.elements.get('coreControls').innerHTML.includes('Switch defender'));
});
test('shootout ledger records outcomes and labels a fifth reply before switching to sudden death',()=>{
 const h=uiHarness(html);h.chooseMode('shootout');h.flush();const m=h.app.match;
 for(let n=0;n<10;n++){playShootoutKick(m,'goal');h.app.syncMatch();h.click('nextPenalty');}
 assert.ok(h.elements.get('shootoutRole').textContent.includes('SUDDEN DEATH'));
 assert.ok(h.elements.get('penaltyHistory').innerHTML.includes('Kick 5: goal'));
 playShootoutKick(m,'goal');h.app.syncMatch();h.click('nextPenalty');
 assert.ok(h.elements.get('shootoutLiveHistory').innerHTML.includes('kicks 2 to 6'));
 playShootoutKick(m,'save');h.app.syncMatch();assert.ok(h.elements.get('penaltyHistory').innerHTML.includes('Kick 6: saved'));
 h.click('nextPenalty');assert.equal(m.winner(),0);
 const k=uiHarness(html);k.chooseMode('shootout');k.flush();const v=k.app.match;
 for(let n=0;n<9;n++){playShootoutKick(v,n===8?'miss':'goal');k.app.syncMatch();k.click('nextPenalty');}
 v.penalties.decision=Object.freeze({...v.penalties.decision,shot:Object.freeze({...v.penalties.decision.shot,y:FIELD.cy+45,power:.85})});
 for(let n=0;n<500&&v.phase==='playing';n++)v.step(1/60,{dx:0,dy:0});k.app.syncMatch();
 assert.equal(v.phase,'shootoutResult');assert.ok(k.elements.get('shootoutRole').textContent.includes('SHOOTOUT COMPLETE'));
 assert.ok(k.elements.get('shootoutAction').textContent.startsWith('GOAL!'));
});
test('shootout practice inputs do not alter precommitted opponent plans',()=>{
 const trials=[];
 for(const side of [-1,1]){
  const h=uiHarness(html);h.chooseMode('shootout');h.flush();const m=h.app.match,copy=JSON.stringify(m.penalties.decision);
  for(let n=0;n<90;n++)m.step(1/60,{dx:0,dy:0,aimDelta:n<80?side:-side});
  assert.equal(JSON.stringify(m.penalties.decision),copy);trials.push(copy);
 }
 assert.equal(trials[0],trials[1]);
});
test('kickoff cue is visible only while awaiting contact and uses the correct team controls',()=>{
 for(const local of [false,true])for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?500:1180,height:757});
  if(local){h.chooseMode('multi');h.click('startLocal');}else h.chooseMode('practice');h.flush();
  const m=h.app.match,cue=h.elements.get('kickoffCue');
  assert.ok(!cue.classList.contains('hidden'));assert.ok(cue.textContent.includes(local?'P1: F pass / G shoot':'Hold + drag'));
  h.click('menuBtn');assert.ok(cue.classList.contains('hidden'));h.click('resumePause');assert.ok(!cue.classList.contains('hidden'));
  h.window.handlers.keydown(keyEvent(local?'f':'e'));h.app.syncMatch();assert.equal(cue.textContent,'Kicking off…');
  advanceToContact(m);h.app.syncMatch();assert.ok(cue.classList.contains('hidden'));
  m.phase='half';h.app.syncMatch();assert.ok(cue.classList.contains('hidden'));h.click('resume');
  if(local){assert.ok(!cue.classList.contains('hidden'));assert.ok(cue.textContent.includes('P2: K pass / L shoot'));}
  else{assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');}
 }
 assert.ok(/id="kickoffCue"[^>]*role="status"/.test(html));
});
test('pause separates concise core controls from the complete accessible advanced instructions',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();h.click('menuBtn');
 const core=h.elements.get('coreControls').innerHTML,advanced=h.elements.get('soloPauseHelp').textContent;
 for(const title of ['Move','Pass','Shoot','Switch defender','Pause / resume'])assert.ok(core.includes('<dt>'+title+'</dt>'));
 assert.ok(core.replace(/<[^>]*>/g,' ').split(/\s+/).length<110);assert.equal(advanced,h.elements.get('gameControls').textContent);
 assert.ok(advanced.includes('After possession changes'));assert.ok(advanced.includes('shot forecast'));
 assert.ok(/<details id="advancedControls" class="rules-note"><summary>More aiming/.test(html));
 assert.ok(/#pause \.card\{max-height:[^}]*overflow-y:auto/.test(html));
 h.chooseMode('menu');h.chooseMode('multi');h.click('startLocal');h.flush();h.click('menuBtn');
 assert.ok(h.elements.get('coreControls').classList.contains('hidden'));assert.ok(h.elements.get('advancedControls').classList.contains('hidden'));
 assert.ok(!h.elements.get('localPauseHelp').classList.contains('hidden'));
});
test('pass target feedback remains through wind-up and clears at contact without changing the release',()=>{
 const {h,c,m,p,r}=passReceptionFixture(),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
 c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
 assert.ok(m.pendingKick);const target=m.pendingKick.target.receiverId,power=m.pendingKick.power;
 h.draws.length=0;h.app.render(0);
 assert.ok(h.draws.some(d=>d.method==='fillText'&&String(d.args[0]).includes('PASS TO #')));
 assert.equal(m.pendingKick.target.receiverId,target);assert.equal(m.pendingKick.power,power);assert.equal(m.pendingKick.duration,.075);
 advanceToContact(m);h.draws.length=0;h.app.render(0);
 assert.ok(!h.draws.some(d=>d.method==='fillText'&&String(d.args[0]).includes('PASS TO #')));
 runPassFrames(h);assert.equal(m.owner?.id,r.id);
});

test('completed shootouts replace next-kick instructions with won or lost status at every ending',()=>{
 const sequences=[
  ['goal','goal','goal','goal','goal','save','save','goal','goal','save'],
  ['goal','goal','goal','goal','goal','save','save','goal','save','goal'],
  ['goal','save','goal','save','goal','save'],
  ['save','goal','save','goal','save','goal'],
  [...Array(10).fill('goal'),'goal','save'],
  [...Array(10).fill('goal'),'save','goal']
 ];
 for(const mode of ['shootout','cup'])for(const outcomes of sequences){
  const h=uiHarness(html);h.chooseMode(mode);if(mode==='cup')h.click('startMatch');h.flush();
  const m=h.app.match;if(mode==='cup'){m.finish();h.app.syncMatch();}
  for(const outcome of outcomes){
   playShootoutKick(m,outcome);h.app.syncMatch();
   if(!m.penalties.done){assert.ok(!/Shootout (won|lost)/.test(h.elements.get('penaltyPrompt').textContent));h.click('nextPenalty');}
  }
  assert.ok(m.penalties.done);const won=m.winner()===0,word=won?'won':'lost';
  const prompt=h.elements.get('penaltyPrompt').textContent;
  assert.ok(prompt.includes('Shootout '+word));assert.ok(!/Sudden death|Round|Move your|Aim and release/.test(prompt));
  assert.equal(h.elements.get('nextPenalty').textContent,'VIEW RESULT');
  assert.ok(h.elements.get('shootoutRole').textContent.includes('SHOOTOUT COMPLETE'));
  assert.ok(!/YOUR KICK|YOUR KEEPER|SUDDEN DEATH/.test(h.elements.get('shootoutRole').textContent));
  const desc=h.elements.get('gameControls').textContent;
  assert.ok(desc.includes('Shootout '+word));assert.ok(desc.includes('View Result'));
  assert.ok(!/kick-off|WASD|single-player cup|move your goalkeeper/i.test(desc));
  h.click('nextPenalty');assert.equal(h.app.view,'full');
  assert.ok(h.elements.get('game').getAttribute('aria-label').includes('shootout result'));
  assert.ok(h.elements.get('gameControls').textContent.includes(mode==='shootout'?'Play Again':won?'Continue':'Back to Cup'));
  assert.ok(!/kick-off|WASD|move your goalkeeper/i.test(h.elements.get('gameControls').textContent));
  assert.ok(h.elements.get('gameControls').textContent.includes(m.home.name));
  assert.ok(h.elements.get('gameControls').textContent.includes(m.away.name));
  assert.ok(h.elements.get('hint').classList.contains('hidden'));
  if(mode==='shootout'){h.click('practiceAgain');h.flush();assert.equal(h.app.match.penalties.done,false);
   assert.ok(!/shootout result/.test(h.elements.get('game').getAttribute('aria-label')));
   assert.ok(h.elements.get('gameControls').textContent.includes('release to shoot'));
  }
 }
});
test('finished shootout result beat retains the final save but announces completion immediately',()=>{
 const h=uiHarness(html);h.chooseMode('shootout');h.flush();const m=h.app.match;
 for(const outcome of ['goal','goal','goal','goal','goal','save','save','goal','goal']){
  playShootoutKick(m,outcome);h.app.syncMatch();h.click('nextPenalty');
 }
 assert.deepEqual(m.penalties.score,[4,3]);assert.equal(m.penalties.turn,1);
 m.penalties.decision=Object.freeze({...m.penalties.decision,shot:Object.freeze({...m.penalties.decision.shot,y:FIELD.cy,power:.85})});
 for(let n=0;n<500&&m.phase==='playing';n++)m.step(1/60,{dx:0,dy:0});
 assert.equal(m.phase,'shootoutResult');assert.ok(m.penalties.done);h.app.syncMatch();
 assert.ok(h.elements.get('shootoutRole').textContent.includes('SHOOTOUT COMPLETE'));
 assert.ok(h.elements.get('shootoutAction').textContent.includes('SAVED'));
 assert.ok(h.elements.get('shootoutAction').textContent.includes('Shootout won'));
 assert.ok(h.elements.get('gameControls').textContent.includes('Shootout won'));
 assert.ok(!/move your goalkeeper/i.test(h.elements.get('gameControls').textContent));
 assert.equal(h.elements.get('shootoutPrep').style.width,'0%');
});
test('result title and subtitle share a flowing group with responsive scroll and wrapping actions',()=>{
 // DOM/CSS contract only: this harness does not perform browser text layout.
 const full=html.slice(html.indexOf('id="full"'),html.indexOf('id="pause"'));
 assert.ok(/class="result-copy"[\s\S]*id="resultEyebrow"[\s\S]*id="resultMsg"[\s\S]*<\/div>/.test(full));
 const css=html.slice(html.indexOf('/* Results keep their title'),html.indexOf('</style>'));
 assert.ok(/#full\.football-scene \.card\{[^}]*overflow-y:auto/.test(css));
 assert.ok(/#full \.result-copy\{[^}]*display:flex[^}]*flex-direction:column/.test(css));
 assert.ok(/#full \.result-copy \.pill\{[^}]*position:static[^}]*line-height:1\.08/.test(css));
 assert.ok(/#full \.result-copy #resultMsg\{[^}]*position:static[^}]*margin:16px 0 0/.test(css));
 assert.ok(/#full \.scene-actions\{[^}]*position:static[^}]*flex-wrap:wrap/.test(css));
 assert.ok(/@media\(max-width:620px\)/.test(css));
 for(const size of [[1180,757],[500,757],[320,568],[757,360]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:size[0],height:size[1]});
  h.chooseMode('shootout');h.flush();const m=h.app.match;
  while(!m.penalties.done){playShootoutKick(m,m.penalties.turn===0?'goal':'save');h.app.syncMatch();h.click('nextPenalty');}
  assert.equal(h.elements.get('resultEyebrow').textContent,'Shootout practice');
  assert.ok(h.elements.get('resultMsg').textContent.includes('Play again'));
  assert.ok(!h.elements.get('practiceAgain').classList.contains('hidden'));
  assert.ok(!h.elements.get('full').classList.contains('hidden'));
 }
});

test('all country pairs use deterministic contrasting outfield palettes and distinct keeper shirts',()=>{
 const h=uiHarness(html);
 for(const home of NATIONS)for(const away of NATIONS){
  if(home===away)continue;
  const a=h.app.matchKits(home,away),b=h.app.matchKits(home,away);
  assert.deepEqual(a,b);assert.ok(Object.isFrozen(a));
  assert.ok(h.app.kitContrast(a[0].shirt,a[1].shirt)>=3,home.name+' / '+away.name);
  assert.ok(a[0].keeper.shirt!==a[1].keeper.shirt);
  for(const k of a){assert.ok(k.name&&k.keeper.name);assert.ok(!a.some(other=>other.shirt===k.keeper.shirt));}
 }
 const f=h.app.matchKits(NATIONS.find(n=>n.code==='FRA'),NATIONS.find(n=>n.code==='CRO'));
 assert.equal(f[0].name,'navy blue');assert.equal(f[1].name,'white');
 const clash=h.app.matchKits(NATIONS.find(n=>n.code==='FRA'),NATIONS.find(n=>n.code==='JPN'));
 assert.ok(clash[1].alternate);assert.equal(clash[1].name,'white');
});
test('HUD swatches and accessible kit names match actual meshes for every selected nation and survive side changes',()=>{
 for(let index=0;index<NATIONS.length;index++){
  const h=uiHarness(html);for(let n=0;n<index;n++)h.click('next');h.chooseMode('practice');h.flush();
  const m=h.app.match,kits=h.app.currentKits();
  for(const team of [0,1]){
   const swatch=h.elements.get(team===0?'homeKit':'awayKit'),kit=kits[team],nation=team===0?m.home:m.away;
   assert.equal(swatch.style.backgroundColor,kit.shirt);assert.equal(swatch.style.borderBottomColor,kit.shorts);
   const desc=swatch.getAttribute('aria-label');
   assert.ok(desc.includes(nation.name));assert.ok(desc.includes(team===0?'Home':'Away'));
   assert.ok(desc.includes(kit.name+' '));assert.ok(desc.includes(kit.keeper.name+' goalkeeper'));
   for(const keeper of [false,true]){
    const p=m.snapshot().players.find(p=>p.team===team&&p.keeper===keeper),mesh=h.app.playerMesh(p,h.app.playerPose(p,m.ball));
    assert.ok(mesh.some(face=>face.color===(keeper?kit.keeper.shirt:kit.shirt)));
    assert.ok(mesh.some(face=>face.color===(keeper?kit.keeper.trim:kit.trim)));
   }
  }
  const before=JSON.stringify(kits);m.phase='half';h.app.syncMatch();h.click('resume');
  assert.equal(JSON.stringify(h.app.currentKits()),before);
  h.click('menuBtn');h.click('restartMatch');h.flush();assert.equal(JSON.stringify(h.app.currentKits()),before);
 }
});
test('local setup identifies both selected kits including clash alternatives and player ownership',()=>{
 const h=uiHarness(html);h.chooseMode('multi');
 h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='FRA'))}});
 h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='JPN'))}});
 assert.equal(h.elements.get('localHomeKit').textContent,'NAVY BLUE KIT');
 assert.equal(h.elements.get('localAwayKit').textContent,'WHITE ALTERNATE KIT');
 h.click('startLocal');h.flush();
 assert.ok(h.elements.get('homeKit').getAttribute('aria-label').includes('Player 1'));
 assert.ok(h.elements.get('awayKit').getAttribute('aria-label').includes('Player 2'));
 assert.ok(h.elements.get('gameControls').textContent.includes('P1/P2'));
 h.click('menuBtn');assert.ok(h.elements.get('localPauseHelp'));
});
test('edge pointer geometry stays visible and points toward off-screen players in eight directions',()=>{
 const h=uiHarness(html);
 for(const [width,height] of [[1180,757],[500,757],[320,568],[757,360]]){
  for(const [x,y] of [[-100,height/2],[width+100,height/2],[width/2,-100],[width/2,height+100],[-100,-100],[width+100,-100],[-100,height+100],[width+100,height+100]]){
   const q=h.app.edgePointer({x,y},width,height);assert.ok(q);
   assert.ok(q.rect.left>=0&&q.rect.right<=width&&q.rect.top>=64&&q.rect.bottom<=height-40);
   assert.ok(Math.abs(q.angle-Math.atan2(y-q.y,x-q.x))<1e-12);
  }
  assert.equal(h.app.edgePointer({x:width/2,y:height/2},width,height),null);
  assert.equal(h.app.edgePointer({x:NaN,y:0},width,height),null);
 }
});
test('edge pointer avoids overlay and aim bounds, separates local badges and suppresses fully occluded cues',()=>{
 const h=uiHarness(html),width=500,height=757,target={x:800,y:90};
 const obstacles=[{left:0,right:410,top:0,bottom:60},{left:256,right:492,top:54,bottom:270},
  {left:10,right:490,top:680,bottom:747},{left:420,right:490,top:280,bottom:340}];
 const first=h.app.edgePointer(target,width,height,obstacles);assert.ok(first);
 const second=h.app.edgePointer(target,width,height,[...obstacles,first.rect]);assert.ok(second);
 for(const q of [first,second])for(const r of obstacles)assert.ok(q.rect.right<=r.left||q.rect.left>=r.right||q.rect.bottom<=r.top||q.rect.top>=r.bottom);
 assert.ok(first.rect.bottom<=second.rect.top||second.rect.bottom<=first.rect.top||first.rect.right<=second.rect.left||second.rect.right<=first.rect.left);
 assert.equal(h.app.edgePointer(target,width,height,[{left:0,right:width,top:0,bottom:height}]),null);
});
test('off-screen cues track actual selection in solo and local play and disappear under every blocking overlay',()=>{
 for(const local of [false,true])for(const portrait of [false,true]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:30,top:20,width:portrait?500:1180,height:757});
  if(local){h.chooseMode('multi');h.click('startLocal');}else h.chooseMode('practice');h.flush();
  const m=h.app.match,shot=m.snapshot(),original=h.app.camera.project;
  const project=(x,y,z)=>({x:x<0?-100:1300,y:300,scale:1});
  h.app.camera.project=project;shot.players.find(p=>p.id===shot.active).x=-100;
  if(local)shot.players.find(p=>p.id===shot.activeAway).x=-100;
  let cues=h.app.controlledIndicators(shot,[]);assert.equal(cues.length,local?2:1);
  assert.equal(cues[0].text,local?'P1':'YOU');assert.equal(cues[0].id,m.active);assert.equal(cues[0].color,'#39e8e1');
  if(local){assert.equal(cues[1].text,'P2');assert.equal(cues[1].color,'#ffb84e');}
  h.app.drawControlledIndicators(shot);assert.ok(h.elements.get('controlledLocation').textContent.includes('off-screen'));
  assert.ok(h.draws.some(d=>d.method==='fillText'&&d.args[0]===(local?'P1':'YOU')));
  h.app.camera.project=()=>({x:550,y:300,scale:1});
  assert.equal(h.app.controlledIndicators(shot,[]).length,0);h.app.drawControlledIndicators(shot);
  assert.equal(h.elements.get('controlledLocation').textContent,'');
  h.app.camera.project=project;
  for(const phase of ['paused','half','full','goal','replay','restart','penalties','shootoutResult']){
   m.phase=phase;assert.equal(h.app.controlledIndicators(shot,[]).length,0,phase);
  }
  m.phase='playing';h.click('menuBtn');assert.equal(h.elements.get('controlledLocation').textContent,'');
  h.app.camera.project=original;
 }
});
test('edge obstacles convert actual HUD rectangles and exclude hidden overlays without moving match state',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
 h.elements.get('game').getBoundingClientRect=()=>({left:30,top:20,width:500,height:757});
 h.elements.get('matchScoreboard').getBoundingClientRect=()=>({left:40,right:390,top:30,bottom:65,width:350,height:35});
 h.elements.get('shootoutInfo').getBoundingClientRect=()=>({left:290,right:520,top:74,bottom:260,width:230,height:186});
 h.elements.get('shootoutInfo').classList.add('hidden');
 let blocks=h.app.controlEdgeObstacles();assert.ok(blocks.some(r=>r.left===10&&r.right===360&&r.top===10&&r.bottom===45));
 assert.ok(!blocks.some(r=>r.left===260&&r.top===54));
 h.elements.get('shootoutInfo').classList.remove('hidden');blocks=h.app.controlEdgeObstacles();assert.ok(blocks.some(r=>r.left===260&&r.top===54));
 const before=JSON.stringify(m.snapshot());h.app.controlledIndicators(m.snapshot());assert.equal(JSON.stringify(m.snapshot()),before);
 h.chooseMode('menu');assert.equal(h.elements.get('controlledLocation').textContent,'');
});

function installCueRestart(h,type,team=0,period=1){
 const m=h.app.match;m.period=period;m.kickoff(team);
 if(type==='Kick-off'){h.app.syncMatch();return m;}
 const goal=m.goalX(team),own=m.ownGoalX(team),d=m.direction(team);
 const x=type==='Goal Kick'?own:type==='Corner Kick'?goal:550;
 m.phase='restart';m.restart={type,team,x,y:type==='Throw-in'||type==='Corner Kick'?FIELD.top:FIELD.cy};
 h.app.syncMatch();assert.ok(h.elements.get('kickoffCue').classList.contains('hidden'));h.click('takeCorner');return m;
}
test('visible restart cue names every human-owned restart and the correct local or solo action in both halves',()=>{
 const types=['Kick-off','Direct Free Kick','Indirect Free Kick','Corner Kick','Throw-in','Goal Kick','Penalty Kick'];
 for(const mode of ['practice','local'])for(const team of [0,1])for(const period of [1,2])for(const type of types){
  const h=uiHarness(html);if(mode==='local'){h.chooseMode('multi');h.click('startLocal');}else h.chooseMode('practice');h.flush();
  const m=installCueRestart(h,type,team,period),cue=h.elements.get('kickoffCue'),before=JSON.stringify(m.snapshot());
  if(mode!=='local'&&team===1){assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');continue;}
  assert.ok(!cue.classList.contains('hidden'),mode+' '+team+' '+type);
  assert.ok(cue.textContent.startsWith(type.toUpperCase()+' · '));
  if(mode==='local'){
   assert.ok(cue.textContent.includes('P'+(team+1)+': '));
   assert.ok(!cue.textContent.includes('P'+(2-team)+': '));
   assert.ok(cue.textContent.includes(type==='Penalty Kick'?(team===0?'G shoot':'L shoot'):type==='Throw-in'?(team===0?'F throw':'K throw'):(team===0?'F pass / G':'K pass / L')));
   assert.ok(!/drag|release|Space/.test(cue.textContent));
  }else{
   assert.ok(cue.textContent.includes('release'));
   assert.ok(cue.textContent.includes(type==='Penalty Kick'?'Space shoot':type==='Throw-in'?'E throw':'E pass / Space'));
  }
  if(type==='Throw-in')assert.ok(!/shoot|Space|G |L /.test(cue.textContent));
  if(type==='Indirect Free Kick')assert.ok(cue.textContent.includes('Another touch needed'));
  for(let n=0;n<5;n++)h.app.syncMatch();
  assert.equal(JSON.stringify(m.snapshot()),before,'cue must not move the ball or mutate players');
  h.window.handlers.keydown(keyEvent(type==='Penalty Kick'?(mode==='local'?(team===0?'g':'l'):' '):(mode==='local'?(team===0?'f':'k'):'e')));
  assert.ok(m.pendingKick,mode+' '+type+' action accepted');h.app.syncMatch();
  assert.ok(!cue.classList.contains('hidden'));assert.ok(/Kicking off|Taking kick|Throwing/.test(cue.textContent));
  advanceToContact(m);h.app.syncMatch();assert.equal(m.setPiece,null);
  assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');
  assert.equal(m.ball.lastTouch,team);
 }
});
test('restart cues persist while waiting, restore after pause and clear for overlays and shootouts',()=>{
 for(const type of ['Direct Free Kick','Indirect Free Kick','Corner Kick','Throw-in','Goal Kick','Penalty Kick']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=installCueRestart(h,type),cue=h.elements.get('kickoffCue');
  const text=cue.textContent,owner=m.ball.owner;
  for(let n=0;n<90;n++){m.step(1/60,{dx:0,dy:0});h.app.syncMatch();}
  assert.equal(cue.textContent,text);assert.equal(m.ball.owner,owner);assert.equal(m.setPiece,type);
  h.click('menuBtn');assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');
  h.click('resumePause');assert.ok(!cue.classList.contains('hidden'));assert.equal(cue.textContent,text);
  m.phase='half';h.app.syncMatch();assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');
  m.phase='full';h.app.syncMatch();assert.ok(cue.classList.contains('hidden'));
  h.chooseMode('menu');assert.equal(cue.textContent,'');
  h.chooseMode('shootout');h.flush();assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');
  assert.ok(!h.elements.get('shootoutInfo').classList.contains('hidden'));
 }
 const h=localHarness(),m=h.app.match;installCueRestart(h,'Direct Free Kick');
 m.scorer=0;m.phase='goal';h.app.syncMatch();assert.ok(h.elements.get('kickoffCue').classList.contains('hidden'));
 m.phase='replay';h.app.syncMatch();assert.ok(h.elements.get('kickoffCue').classList.contains('hidden'));
});
test('real pointer restart release clears visible guidance only when the ball leaves the taker',()=>{
 for(const type of ['Direct Free Kick','Indirect Free Kick','Corner Kick','Throw-in','Goal Kick','Penalty Kick'])for(const width of [1180,500]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:757});
  h.chooseMode('practice');h.flush();const m=installCueRestart(h,type),cue=h.elements.get('kickoffCue'),owner=m.owner;
  const target=type==='Penalty Kick'?{x:m.goalX(0),y:FIELD.cy}:m.bestPass(owner);
  const a=h.app.camera.project(owner.x,owner.y),b=h.app.camera.project(target.x,target.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));h.app.syncMatch();
  assert.ok(!cue.classList.contains('hidden'));assert.equal(m.ball.owner,owner.id);assert.equal(m.pendingKick,null);
  c.handlers.pointerup(pointerEvent(h,b.x,b.y));assert.ok(m.pendingKick,type+' pointer release');
  h.app.syncMatch();assert.ok(!cue.classList.contains('hidden'));advanceToContact(m);h.app.syncMatch();
  assert.ok(cue.classList.contains('hidden'));assert.equal(cue.textContent,'');assert.equal(m.ball.owner,null);
 }
});
test('visible restart cue remains an edge-indicator obstacle and never changes legal restart ownership',()=>{
 for(const width of [1180,500,320]){
  const h=localHarness(),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:20,top:10,width,height:757});
  const m=installCueRestart(h,'Direct Free Kick',1),cue=h.elements.get('kickoffCue'),owner=m.owner.id;
  cue.getBoundingClientRect=()=>({left:36,top:655,right:width+4,bottom:751,width:width-32,height:96});
  const obstacles=h.app.controlEdgeObstacles(),block=obstacles.find(r=>r.left===16&&r.top===645);
  assert.ok(block);const indicator=h.app.edgePointer({x:width/2,y:900},width,757,obstacles);assert.ok(indicator);
  assert.ok(indicator.rect.bottom<=block.top||indicator.rect.left>=block.right||indicator.rect.right<=block.left);
  h.window.handlers.keydown(keyEvent('f'));assert.equal(m.pendingKick,null);assert.equal(m.owner.id,owner);
  assert.ok(cue.textContent.includes('P2: K pass / L shoot'));
  h.click('menuBtn');assert.ok(!h.app.controlEdgeObstacles().some(r=>r.left===16&&r.top===645));
 }
});

test('local kickoff introductions identify resolved kits and marker colors after selection restart and rematch',()=>{
 for(const [home,away] of [['FRA','CRO'],['FRA','JPN'],['ARG','URU']]){
  const h=uiHarness(html);h.chooseMode('multi');
  h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code===home))}});
  h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code===away))}});
  const check=()=>{
   const m=h.app.match,kits=h.app.currentKits(),text=h.elements.get('toast').textContent;
   assert.ok(h.elements.get('toast').classList.contains('toastOn'));
   for(const team of [0,1]){
    const kit=kits[team],nation=team===0?m.home:m.away,marker=team===0?'cyan':'orange';
    assert.ok(text.includes('Player '+(team+1)+': '+nation.name+' — '+kit.name+(kit.alternate?' alternate':'')+' kit / '+marker+' marker.'));
    assert.equal(h.elements.get(team===0?'homeKit':'awayKit').style.backgroundColor,kit.shirt);
    assert.equal(h.elements.get(team===0?'localHomeMarker':'localAwayMarker').textContent,marker.toUpperCase()+' P'+(team+1)+' MARKER');
    assert.equal(h.app.playerMarkers(m.snapshot().players[team*11+9],m.snapshot(),true).color,team===0?'#39e8e1':'#ffb84e');
   }
   if(home==='FRA'&&away==='CRO')assert.equal(text,'Player 1: France — navy blue kit / cyan marker. Player 2: Croatia — white kit / orange marker.');
   if(home==='FRA'&&away==='JPN')assert.ok(text.includes('Player 2: Japan — white alternate kit / orange marker.'));
  };
  h.click('startLocal');h.flushUntilMatch();check();
  h.click('menuBtn');h.click('restartMatch');h.flushUntilMatch();check();
  h.app.match.finish();h.app.syncMatch();h.click('rematchLocal');h.flushUntilMatch();check();
  h.chooseMode('menu');assert.equal(h.elements.get('toast').textContent,'');
 }
});
test('cup introductions identify the selected kit for every country instead of assuming white',()=>{
 for(let index=0;index<NATIONS.length;index++){
  const h=uiHarness(html);for(let n=0;n<index;n++)h.click('next');h.chooseMode('cup');h.click('startMatch');h.flushUntilMatch();
  const m=h.app.match,kit=h.app.currentKits()[0],text=h.elements.get('toast').textContent;
  assert.ok(text.includes(m.home.name+' — '+kit.name+' kit / cyan marker.'));
  assert.ok(text.includes('Attack the left goal!'));
 }
 assert.ok(!html.includes('Player 1: white / cyan.'));
 assert.ok(!html.includes('Player 2: blue / orange.'));
 assert.ok(!html.includes('You are white.'));
 assert.ok(!html.includes('id="localHomeKit">WHITE KIT'));
 assert.ok(!html.includes('id="localAwayKit">BLUE KIT'));
});

test('simultaneous introductions and restart guidance share a wrapping normal-flow bottom stack',()=>{
 const start=html.indexOf('<div id="bottomMessages">'),end=html.indexOf('<p id="controlledLocation"',start);
 const messages=html.slice(start,end);
 assert.ok(start>=0);assert.ok(messages.includes('<div id="toast"></div>'));
 assert.ok(messages.includes('<p id="kickoffCue"'));
 assert.ok(messages.indexOf('id="toast"')<messages.indexOf('id="kickoffCue"'));
 assert.ok(messages.trim().endsWith('</div>'));
 // CSS contract: neither child can keep the old independent absolute placement.
 const css=html.slice(html.indexOf('/* One normal-flow stack'),html.indexOf('</style>'));
 assert.ok(/#bottomMessages\{[^}]*display:flex[^}]*flex-direction:column[^}]*gap:6px/.test(css));
 assert.ok(/#bottomMessages>#toast,#bottomMessages>#kickoffCue\{[^}]*position:static[^}]*inset:auto[^}]*transform:none!important[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere/.test(css));
 assert.ok(/#bottomMessages>#toast\{display:none/.test(css));assert.ok(/#bottomMessages>#toast\.toastOn\{display:block/.test(css));
 assert.ok(/@media\(max-width:620px\)/.test(css));assert.ok(/@media\(max-height:420px\)/.test(css));
 for(const mode of ['local','cup']){
  const h=uiHarness(html);
  if(mode==='local'){
   h.chooseMode('multi');
   h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='FRA'))}});
   h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='CRO'))}});
   h.click('startLocal');
  }else{for(let n=0;n<NATIONS.findIndex(n=>n.code==='FRA');n++)h.click('next');h.chooseMode('cup');h.click('startMatch');}
  h.flushUntilMatch();
  assert.ok(h.elements.get('toast').classList.contains('toastOn'));
  assert.ok(h.elements.get('toast').textContent.includes('France — navy blue kit'));
  assert.ok(!h.elements.get('kickoffCue').classList.contains('hidden'));
  assert.ok(h.elements.get('kickoffCue').textContent.startsWith('KICK-OFF'));
  h.flush();assert.ok(!h.elements.get('toast').classList.contains('toastOn'));
  assert.ok(!h.elements.get('kickoffCue').classList.contains('hidden'));
 }
});
test('combined message geometry reserves long introductions and restart cues across desktop portrait and short landscape',()=>{
 // Explicit conservative wrapped-height fixtures, not a browser/font-layout claim.
 // Exercise the production obstacle conversion and edge placement with BOTH
 // message rectangles and the gap occupied by their shared normal-flow parent.
 const sizes=[[1180,757,44,40],[500,757,64,58],[320,568,96,76],[757,360,44,38]];
 for(const [width,height,toastHeight,cueHeight] of sizes)for(const local of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game'),left=27,top=19;
  c.getBoundingClientRect=()=>({left,top,width,height});
  if(local){
   h.chooseMode('multi');
   h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='USA'))}});
   h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='SUI'))}});
   h.click('startLocal');
  }else{for(let n=0;n<NATIONS.findIndex(n=>n.code==='USA');n++)h.click('next');h.chooseMode('cup');h.click('startMatch');}
  h.flushUntilMatch();
  assert.ok(h.elements.get('toast').textContent.includes('United States'));
  const messageWidth=Math.min(680,width-(width<=620?24:32)),x=(width-messageWidth)/2,bottom=height-(height<=420?8:12);
  const gap=height<=420?4:width<=620?5:6,stackTop=bottom-cueHeight-gap-toastHeight;
  const dom=(x,y,w,h)=>({left:left+x,top:top+y,right:left+x+w,bottom:top+y+h,width:w,height:h});
  const toast=dom(x,stackTop,messageWidth,toastHeight),cue=dom(x,bottom-cueHeight,messageWidth,cueHeight),stack=dom(x,stackTop,messageWidth,bottom-stackTop);
  assert.ok(toast.bottom+gap<=cue.top);assert.ok(stackTop>64);
  h.elements.get('toast').getBoundingClientRect=()=>toast;
  h.elements.get('kickoffCue').getBoundingClientRect=()=>cue;
  h.elements.get('bottomMessages').getBoundingClientRect=()=>stack;
  let blocks=h.app.controlEdgeObstacles();
  const reserved=blocks.find(r=>r.left===x&&r.right===x+messageWidth&&r.top===stackTop&&r.bottom===bottom);
  assert.ok(reserved,'whole stack, including its gap, is reserved');
  for(const target of [{x:width/2,y:height+200},{x:-100,y:height+100},{x:width+100,y:height+100}]){
   const first=h.app.edgePointer(target,width,height,blocks);assert.ok(first);
   const q=first.rect;assert.ok(q.bottom<=reserved.top||q.top>=reserved.bottom||q.right<=reserved.left||q.left>=reserved.right);
   if(local){const second=h.app.edgePointer(target,width,height,[...blocks,q]);assert.ok(second);const s=second.rect;
    assert.ok(s.bottom<=reserved.top||s.top>=reserved.bottom||s.right<=reserved.left||s.left>=reserved.right);
   }
  }
  // Real expiry still leaves the restart cue; browser flex layout collapses
  // the hidden toast, represented here by the parent's newly measured bounds.
  h.flush();h.elements.get('bottomMessages').getBoundingClientRect=()=>cue;
  blocks=h.app.controlEdgeObstacles();assert.ok(blocks.some(r=>r.top===bottom-cueHeight&&r.bottom===bottom));
  assert.ok(!blocks.some(r=>r.top===stackTop));
  h.click('menuBtn');assert.ok(!h.app.controlEdgeObstacles().some(r=>r.left===x&&r.bottom===bottom));
 }
});

test('shootout aim feedback avoids the measured progress panel at narrow portrait and desktop sizes',()=>{
 const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
 for(const [width,height] of [[333,505],[400,606],[1180,757]])for(const period of [1,2])for(const compact of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game'),left=37,top=21;
  c.getBoundingClientRect=()=>({left,top,width,height});
  h.chooseMode('shootout');h.flush();const m=h.app.match;m.period=period;m.startShootout();h.app.syncMatch();
  // The old 333px bounds come from independent live QA. Other dimensions are
  // explicit geometry fixtures; compact height is not a browser font measurement.
  const narrow=width<=420,panelWidth=narrow&&compact?width-16:width<=620?228:246;
  const box={left:width-(width<=620?8:14)-panelWidth,right:width-(width<=620?8:14),top:width<=620?55:64,bottom:(width<=620?55:64)+(narrow&&compact?92:143)};
  const panel=h.elements.get('shootoutInfo');
  panel.getBoundingClientRect=()=>({left:left+box.left,right:left+box.right,top:top+box.top,bottom:top+box.bottom,width:box.right-box.left,height:box.bottom-box.top});
  const unit=1100/width,visible={left:box.left*unit,right:box.right*unit,top:box.top*unit,bottom:box.bottom*unit};
  const before=JSON.stringify(m.snapshot());
  let releasePoint=null;
  for(let frame=0;frame<4;frame++){
   if(frame===2){const start=h.app.camera.project(m.owner.x,m.owner.y);releasePoint=h.app.camera.project(m.penalties.goal+m.direction(0)*20,FIELD.cy+30);
    c.handlers.pointerdown(pointerEvent(h,start.x,start.y));c.handlers.pointermove(pointerEvent(h,releasePoint.x,releasePoint.y));}
   h.draws.length=0;h.app.render(1/60);
   const rectangles=[];
   for(let i=0;i<h.draws.length;i++){
    const d=h.draws[i];if(d.method!=='fillText'||!/^SHOT |IF CLEAR/.test(String(d.args[0])))continue;
    const bg=h.draws[i-1];assert.equal(bg.method,'fillRect');const [x,y,w,boxHeight]=bg.args;
    const rect={left:x,right:x+w,top:y,bottom:y+boxHeight};
    assert.equal(overlap(rect,visible),0,width+'×'+height+' aim feedback hidden by progress');
    for(const id of [m.penalties.taker,m.penalties.keeper]){
     const p=m.players[id],foot=h.app.camera.project(p.x,p.y),head=h.app.camera.project(p.x,p.y,26),half=Math.max(12*unit,(p.keeper?13:9)*foot.scale);
     const body={left:foot.x-half,right:foot.x+half,top:head.y-5*unit,bottom:foot.y+5*unit};
     assert.equal(overlap(rect,body),0,'aim feedback covers taker/keeper');
    }
    for(const old of rectangles)assert.equal(overlap(rect,old),0,'aim captions overlap');
    assert.ok(rect.left>=0&&rect.right<=1100&&rect.top>=0&&rect.bottom<=1100*height/width+1);
    rectangles.push(rect);
   }
   assert.ok(rectangles.length>=2,'power and accuracy text must remain drawn');
  }
  assert.equal(JSON.stringify(m.snapshot()),before,'layout must not advance or alter the kick');
  assert.ok(h.app.aimPanelObstacles().some(r=>r.hard&&r.left<=visible.left&&r.right>=visible.right&&r.top<=visible.top&&r.bottom>=visible.bottom));
  c.handlers.pointerup(pointerEvent(h,releasePoint.x,releasePoint.y));assert.ok(m.pendingKick?.shot);advanceToContact(m);assert.equal(m.penalties.stage,'flight');
  h.click('menuBtn');assert.ok(!h.app.aimPanelObstacles().some(r=>r.ui==='shootoutInfo'));
 }
});
test('compact shootout progress retains role countdown and both complete five-attempt histories',()=>{
 const css=html.slice(html.indexOf('/* Short portrait shootout progress'),html.indexOf('/* Shared halftime/result score band'));
 assert.ok(/@media\(max-width:420px\) and \(max-height:640px\) and \(orientation:portrait\)/.test(css));
 assert.ok(/#shootoutLiveHistory\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(css));
 assert.ok(!/display:none|visibility:hidden/.test(css));
 for(const [width,height] of [[333,505],[400,606]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('shootout');h.flush();const m=h.app.match;
  assert.equal(h.elements.get('shootoutRole').textContent,'PRACTICE · ROUND 1 · YOUR KICK');
  assert.ok(h.elements.get('shootoutAction').textContent.includes('Aim, then release'));
  assert.equal((h.elements.get('shootoutLiveHistory').innerHTML.match(/class="kick-dot /g)||[]).length,10);
  playShootoutKick(m,'save');h.app.syncMatch();h.click('nextPenalty');
  assert.ok(h.elements.get('shootoutRole').textContent.includes('YOUR KEEPER'));
  assert.ok(h.elements.get('shootoutLiveHistory').innerHTML.includes('Kick 1: saved'));
  assert.equal((h.elements.get('shootoutLiveHistory').innerHTML.match(/class="kick-dot /g)||[]).length,10);
  assert.equal(h.elements.get('shootoutAction').textContent,'Move keeper now · Shot in 2s');
  for(let n=0;n<45;n++)m.step(1/60,h.app.input());h.app.syncMatch();
  assert.equal(h.elements.get('shootoutAction').textContent,'Move keeper now · Shot in 1s');
  h.click('menuBtn');assert.ok(h.elements.get('shootoutInfo').classList.contains('hidden'));
  h.click('resumePause');assert.ok(!h.elements.get('shootoutInfo').classList.contains('hidden'));
  assert.equal(h.elements.get('shootoutAction').textContent,'Move keeper now · Shot in 1s');
 }
});

test('shared halftime and result score bands constrain team names within tracks separated from the score',()=>{
 // CSS layout contract; native browser glyph wrapping still needs independent checking.
 const css=html.slice(html.indexOf('/* Shared halftime/result score band'),html.indexOf('</style>'));
 assert.ok(/grid-template-columns:minmax\(0,1fr\) max-content minmax\(0,1fr\);column-gap:20px/.test(css));
 assert.ok(/\.football-scene \.badge-team\{display:grid;grid-template-columns:var\(--team-badge-size\) minmax\(0,1fr\)/.test(css));
 assert.ok(/\.football-scene \.badge-team>b\{[^}]*min-width:0[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere[^}]*overflow:hidden/.test(css));
 assert.ok(/@media\(max-width:420px\)/.test(css));
 assert.ok(/\.football-scene \.badge-team>b,\.football-scene \.badge-team:last-child>b\{grid-column:1;grid-row:2;font-size:12px/.test(css));
 assert.ok(/\.football-scene \.board-goals\{min-width:max-content;white-space:nowrap/.test(css));
 // Track geometry with explicit score-width fixtures, not font measurements.
 // Reserve the score's intrinsic width first; neither team may consume the gap.
 for(const [viewport,bandWidth,padding,gap] of [[333,299,8,12],[400,360,8,12],[1180,1050,24,20]]){
  for(const scoreWidth of [58,88,124]){
   const content=bandWidth-padding*2,teamWidth=(content-scoreWidth-gap*2)/2;
   const home={left:padding,right:padding+teamWidth};
   const score={left:home.right+gap,right:home.right+gap+scoreWidth};
   const away={left:score.right+gap,right:score.right+gap+teamWidth};
   assert.ok(teamWidth>=26,'flag fits its track at '+viewport);
   assert.equal(score.left-home.right,gap);assert.equal(away.left-score.right,gap);
   assert.ok(Math.abs(away.right-(bandWidth-padding))<1e-10);
  }
 }
});
test('long national names and multi-digit scores remain complete in both visual and accessible interval boards',()=>{
 for(const [width,height] of [[333,505],[400,606],[1180,757]]){
  for(const [home,away] of [['USA','UZB'],['UZB','NOR'],['SUI','KOR']]){
   const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
   h.chooseMode('multi');
   h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code===home))}});
   h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code===away))}});
   h.click('startLocal');h.flush();const m=h.app.match;
   for(const score of [[0,0],[12,10],[123,104]]){
    m.score=score.slice();m.phase='half';h.app.syncMatch();
    for(const prefix of ['half','result']){
     if(prefix==='result'){m.finish();h.app.syncMatch();}
     assert.equal(h.elements.get(prefix+'HomeName').textContent,m.home.name);
     assert.equal(h.elements.get(prefix+'AwayName').textContent,m.away.name);
     assert.equal(h.elements.get(prefix+'HomeFlag').textContent,m.home.flag);
     assert.equal(h.elements.get(prefix+'AwayFlag').textContent,m.away.flag);
     assert.equal(h.elements.get(prefix+'Goals').textContent,score.join(' – '));
     const accessible=h.elements.get(prefix==='half'?'halfSummary':'resultScore').textContent;
     assert.ok(accessible.includes(m.home.name));assert.ok(accessible.includes(m.away.name));
     assert.ok(accessible.includes(score.join(' - ')));
    }
   }
  }
 }
 // The reported normal practice menu path stays reachable without state setup.
 const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:333,height:505});
 for(let i=0;i<NATIONS.findIndex(n=>n.code==='USA');i++)h.click('next');
 h.chooseMode('practice');h.flush();h.window.handlers.keydown(keyEvent('Escape'));h.click('finishPractice');
 assert.equal(h.app.view,'full');assert.equal(h.elements.get('resultHomeName').textContent,'United States');
 assert.equal(h.elements.get('resultAwayName').textContent,'Uzbekistan');assert.equal(h.elements.get('resultGoals').textContent,'0 – 0');
 assert.ok(h.elements.get('gameControls').textContent.includes('United States'));
 assert.ok(h.elements.get('gameControls').textContent.includes('Uzbekistan'));
});

function focusKey(h,key,tabTarget){
 const target=h.document.activeElement||h.elements.get('game');
 const event={key,target,repeat:false,prevented:false,preventDefault(){this.prevented=true;}};
 h.window.handlers.keydown(event);
 // Model the relevant native defaults explicitly: Tab focus navigation and
 // button activation. This is a focus/event harness, not a browser AX test.
 if(!event.prevented){
  if(key==='Tab'&&tabTarget)h.elements.get(tabTarget).focus();
  if((key===' '||key==='Enter')&&target.tagName==='BUTTON'&&!target.disabled)target.onclick?.();
 }
 return event;
}
function concededGoalForFocus(h){
 const m=h.app.match,d=m.direction(1),goal=m.goalX(1);
 m.setPiece=null;m.restartGuard=null;m.lastRestart=null;
 Object.assign(m.ball,{owner:null,x:goal+d*4,y:FIELD.cy,z:0,vx:d*200,vy:0,vz:0,lastTouch:1});
 m.checkBoundary({x:goal-d*8,y:FIELD.cy,z:0});assert.equal(m.phase,'goal');h.app.syncMatch();
 for(let n=0;n<100&&m.phase==='goal';n++)m.step(1/60);
 assert.equal(m.phase,'replay');
 return m;
}
test('goal replay completion and skip restore focus-aware keyboard targets before kickoff input',()=>{
 for(const width of [333,1180])for(const local of [false,true])for(const skip of [false,true]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:width===333?505:757});
  if(local){h.chooseMode('multi');h.click('startLocal');}else{h.chooseMode('cup');h.click('startMatch');}h.flush();
  const canvas=h.elements.get('game');assert.equal(h.document.activeElement,canvas);
  const m=concededGoalForFocus(h);
  // A Tab arrives as the simulation enters replay, before the new UI sync.
  focusKey(h,'Tab','menuBtn');h.app.syncMatch();
  assert.equal(h.document.activeElement,h.elements.get('skipReplay'));
  assert.equal(h.elements.get('menuBtn').disabled,true);
  const navigation=focusKey(h,'Tab','replayAgain');
  assert.ok(!navigation.prevented);assert.equal(h.document.activeElement,h.elements.get('replayAgain'));
  h.app.syncMatch();assert.equal(h.document.activeElement,h.elements.get('replayAgain'),'render sync must not steal overlay focus');
  if(skip){h.elements.get('skipReplay').focus();focusKey(h,' ');}
  else for(let n=0;n<300&&m.phase==='replay';n++){m.step(1/60);h.app.syncMatch();}
  assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Kick-off');assert.equal(m.owner.team,0);
  assert.equal(h.document.activeElement,canvas);assert.equal(h.elements.get('menuBtn').disabled,false);
  assert.equal(m.pendingKick,null,'the skip activation must not leak into a shot');
  const action=focusKey(h,local?(skip?'g':'f'):(skip?' ':'e'));
  assert.ok(action.prevented);assert.ok(m.pendingKick);assert.equal(m.pendingKick.shot,skip);
  advanceToContact(m);h.app.syncMatch();assert.equal(m.setPiece,null);
  focusKey(h,'w');const control=h.app.input();assert.ok(local?Math.hypot(control.teams[0].dx,control.teams[0].dy)>0:Math.hypot(control.dx,control.dy)>0);
  const minute=m.minute;m.step(1/60,control);h.window.handlers.keyup({key:'w'});assert.ok(m.minute>minute);
  assert.equal(m.phase,'playing');assert.equal(h.document.activeElement,canvas);
 }
});
test('halftime restart and shootout next-kick focus returns to play but completed results retain their action focus',()=>{
 const local=localHarness(),m=local.app.match;
 m.phase='half';local.app.syncMatch();assert.equal(local.document.activeElement,local.elements.get('resume'));
 focusKey(local,' ');assert.equal(local.document.activeElement,local.elements.get('game'));
 focusKey(local,'k');assert.ok(m.pendingKick);advanceToContact(m);
 m.phase='restart';m.restart={type:'Goal Kick',team:0,x:m.ownGoalX(0),y:FIELD.cy};local.app.syncMatch();
 local.elements.get('takeCorner').focus();m.takeRestart();local.app.syncMatch();
 assert.equal(local.document.activeElement,local.elements.get('game'));
 const h=uiHarness(html);h.chooseMode('shootout');h.flush();const s=h.app.match;
 playShootoutKick(s,'goal');h.app.syncMatch();assert.equal(h.document.activeElement,h.elements.get('nextPenalty'));
 focusKey(h,'Escape');assert.equal(h.document.activeElement,h.elements.get('resumePause'));
 focusKey(h,' ');assert.equal(h.document.activeElement,h.elements.get('nextPenalty'),'resuming a between-kick menu must not focus the canvas');
 focusKey(h,' ');assert.equal(h.document.activeElement,h.elements.get('game'));assert.equal(s.penalties.turn,1);
 focusKey(h,'ArrowUp');assert.ok(Math.hypot(h.app.input().dx,h.app.input().dy)>0);h.window.handlers.keyup({key:'ArrowUp'});
 while(!s.penalties.done){
  playShootoutKick(s,s.penalties.turn===0?'goal':'save');h.app.syncMatch();
  assert.equal(h.document.activeElement,h.elements.get('nextPenalty'));focusKey(h,' ');
 }
 assert.equal(h.app.view,'full');assert.equal(h.document.activeElement,h.elements.get('practiceAgain'));
 assert.ok(h.elements.get('gameControls').textContent.includes('shootout')||h.elements.get('gameControls').textContent.includes('Shootout'));
});
test('intentional keyboard navigation and button activation stay available in menus without frame-by-frame focus theft',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
 h.elements.get('menuBtn').focus();h.app.syncMatch();assert.equal(h.document.activeElement,h.elements.get('menuBtn'));
 const space=focusKey(h,' ');assert.ok(!space.prevented);assert.equal(m.phase,'paused');
 assert.equal(h.document.activeElement,h.elements.get('resumePause'));
 const tab=focusKey(h,'Tab','restartMatch');assert.ok(!tab.prevented);
 h.app.syncMatch();assert.equal(h.document.activeElement,h.elements.get('restartMatch'));
 assert.ok(!focusKey(h,'e').prevented);assert.equal(m.pendingKick,null);assert.equal(m.phase,'paused');
 h.elements.get('resumePause').focus();focusKey(h,'Enter');assert.equal(h.document.activeElement,h.elements.get('game'));
 focusKey(h,'Escape');assert.equal(h.document.activeElement,h.elements.get('resumePause'));
 h.elements.get('finishPractice').focus();focusKey(h,' ');assert.equal(h.app.view,'full');
 assert.equal(h.document.activeElement,h.elements.get('continueCup'));
 focusKey(h,' ');assert.equal(h.app.view,'menu');
 h.elements.get('chooseCountry').focus();const menuTab=focusKey(h,'Tab','next');assert.ok(!menuTab.prevented);assert.equal(h.document.activeElement,h.elements.get('next'));
});

function winCupForCelebration(h,scores=[[3,2],[2,0],[2,0]]){
 for(let stage=0;stage<3;stage++){
  h.click('startMatch');h.flush();const m=h.app.match;
  assert.equal(h.app.round,stage);m.score=scores[stage].slice();m.finish();h.app.syncMatch();
  if(stage===2)h.elements.get('cupContent').scrollTop=2400;
  h.click('continueCup');
 }
}
test('winning the cup opens on its trophy and actual final summary before the retained roster and bracket',()=>{
 for(const [width,height] of [[333,505],[400,606],[1180,757],[757,360]])for(const country of ['UZB','USA']){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  const index=NATIONS.findIndex(n=>n.code===country);for(let i=0;i<index;i++)h.click('next');
  h.chooseMode('cup');assert.ok(h.elements.get('cupCelebration').classList.contains('hidden'));
  assert.ok(!h.elements.get('trophy').classList.contains('cup-won'));
  winCupForCelebration(h);
  assert.equal(h.app.view,'trophy');assert.ok(h.app.champion);assert.equal(h.app.round,2);
  assert.ok(h.elements.get('trophy').classList.contains('cup-won'));
  assert.ok(!h.elements.get('cupCelebration').classList.contains('hidden'));
  assert.equal(h.elements.get('cupContent').scrollTop,0);
  assert.equal(h.document.activeElement,h.elements.get('championTitle'));
  assert.equal(h.elements.get('championTitle').textContent,NATIONS[index].flag+' '+NATIONS[index].name);
  assert.equal(h.elements.get('championTitle').getAttribute('aria-label'),NATIONS[index].name+' — Cup champions');
  const final=NATIONS[h.app.opponentFor(index,2)];
  assert.equal(h.elements.get('championFinal').textContent,'FINAL · '+NATIONS[index].name+' 2 – 0 '+final.name);
  assert.ok(h.elements.get('championPens').classList.contains('hidden'));
  const cup=h.elements.get('championTrophy').innerHTML;
  assert.ok(cup.includes('International Cup trophy'));assert.ok(cup.includes('id="championGold"'));
  assert.ok(!cup.includes('id="cupGold"'));
  assert.equal((h.elements.get('worldRoster').innerHTML.match(/data-country=/g)||[]).length,32);
  assert.ok(h.elements.get('cupBracket').innerHTML.includes(country+' · CHAMPIONS'));
  assert.equal((h.elements.get('cupBracket').innerHTML.match(/class="complete"/g)||[]).length,3);
  assert.equal(h.elements.get('startMatch').textContent,'PLAY ANOTHER CUP');
 }
 const content=html.slice(html.indexOf('id="cupContent"'),html.indexOf('<section class="panel hidden" id="loading"'));
 assert.ok(content.indexOf('id="cupCelebration"')<content.indexOf('class="tournament-overview"'));
 assert.ok(content.indexOf('id="cupCelebration"')<content.indexOf('id="cupBracket"'));
 assert.ok(/id="championTitle" tabindex="-1" aria-describedby="championFinal championPens"/.test(html));
 const css=html.slice(html.indexOf('/* Winner-only first viewport'),html.indexOf('</style>'));
 assert.ok(/#trophy\.cup-won \.cup-celebration\{min-height:100%;display:flex/.test(css));
 assert.ok(css.includes('#trophy.cup-won .trophy-content{display:block}'));
 assert.ok(css.includes('@media(max-height:560px) and (orientation:portrait)'));
 assert.ok(css.includes('@media(max-height:460px) and (orientation:landscape)'));
});
test('playing another cup and changing teams clear winner presentation without changing ordinary progression',()=>{
 for(const reset of ['another','team']){
  const h=uiHarness(html);h.chooseMode('cup');
  const originalRoster=h.elements.get('worldRoster').innerHTML,originalBracket=h.elements.get('cupBracket').innerHTML;
  winCupForCelebration(h);h.elements.get('cupContent').scrollTop=1900;
  if(reset==='another'){h.click('startMatch');h.flush();assert.equal(h.app.match.away.name,NATIONS[h.app.opponentFor(0,0)].name);assert.deepEqual(h.app.match.score,[0,0]);}
  else{h.chooseMode('team');h.chooseMode('cup');}
  assert.equal(h.app.round,0);assert.ok(!h.app.champion);
  assert.ok(h.elements.get('cupCelebration').classList.contains('hidden'));
  assert.ok(!h.elements.get('trophy').classList.contains('cup-won'));
  assert.equal(h.elements.get('championTitle').textContent,'');assert.equal(h.elements.get('championFinal').textContent,'');
  assert.equal(h.elements.get('championTrophy').innerHTML,'');
  assert.equal(h.elements.get('trophyTitle').textContent,'International Cup');assert.equal(h.elements.get('startMatch').textContent,'START MATCH');
  assert.equal(h.elements.get('worldRoster').innerHTML,originalRoster);
  assert.equal(h.elements.get('cupBracket').innerHTML,originalBracket);
  if(reset==='another'){
   assert.equal(h.elements.get('cupContent').scrollTop,0);
   h.app.match.score=[0,1];h.app.match.finish();h.app.syncMatch();h.click('continueCup');
   assert.equal(h.app.view,'trophy');assert.ok(!h.app.champion);assert.ok(h.elements.get('cupCelebration').classList.contains('hidden'));
  }
 }
});
test('champion summary preserves a drawn final and its actual shootout winning score',()=>{
 const h=uiHarness(html);h.chooseMode('cup');
 for(let round=0;round<2;round++){h.click('startMatch');h.flush();h.app.match.score=[1,0];h.app.match.finish();h.app.syncMatch();h.click('continueCup');}
 h.click('startMatch');h.flush();const m=h.app.match;m.score=[0,0];m.finish();h.app.syncMatch();
 while(!m.penalties.done){playShootoutKick(m,m.penalties.turn===0?'goal':'save');h.app.syncMatch();h.click('nextPenalty');}
 assert.equal(h.app.view,'full');h.click('continueCup');
 assert.ok(h.app.champion);assert.ok(h.elements.get('championFinal').textContent.includes('0 – 0'));
 assert.ok(!h.elements.get('championPens').classList.contains('hidden'));
 assert.equal(h.elements.get('championPens').textContent,'Won on penalties · '+m.penalties.score.join(' – '));
 assert.equal(h.elements.get('cupContent').scrollTop,0);
 h.click('startMatch');h.flush();assert.equal(h.elements.get('championPens').textContent,'');assert.ok(h.elements.get('championPens').classList.contains('hidden'));
});


test('ownership investigation: solo E W Tab sequence keeps every actionable carrier selected through natural play',()=>{
 const records=[];
 for(const [width,height] of [[333,505],[1180,757]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('cup');h.click('startMatch');h.flush();const m=h.app.match;
  const check=()=>{
   if(m.phase==='playing'&&m.owner?.team===0){
    assert.equal(m.active,m.owner.id,'human carrier must be selected before input');
    const shot=m.snapshot(),marker=h.app.playerMarkers(shot.players[m.owner.id],shot);
    assert.equal(marker.selected,true);assert.equal(marker.ownsBall,true);
   }
  };
  for(let i=0;i<16000&&m.phase!=='full';i++){
   if(m.phase==='half'){h.app.syncMatch();h.click('resume');}
   if(m.phase==='restart'){m.takeRestart();h.app.syncMatch();}
   if(m.phase==='penalties'||m.phase==='shootoutResult')break;
   check();
   if(m.phase==='playing'){
    if(i%180===0)h.window.handlers.keydown(keyEvent('w'));
    if(i%180===90)h.window.handlers.keyup(keyEvent('w'));
    if(i%67===0)h.window.handlers.keydown(keyEvent('Tab'));
    check();
    if(i%110===0){
     const owner=m.owner?.id,active=m.active,pending=m.pendingKick?.id,key=i%220===0?'e':' ';
     h.window.handlers.keydown(keyEvent(key));
     if(m.pendingKick&&m.pendingKick.id!==pending){assert.equal(m.pendingKick.player,owner);assert.equal(m.pendingKick.player,active);records.push({width,key,player:owner});}
    }
   }
   m.step(1/60,h.app.input());check();
  }
 }
 assert.ok(records.length>10,'multiple actual keyboard kick starts exercised');
});
test('ownership investigation: goalkeeper pass and shot select the kicker until contact then transfer to a real receiver',()=>{
 for(const local of [false,true])for(const team of local?[0,1]:[0])for(const period of [1,2])for(const shot of [false,true]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:333,height:505});
  h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();const m=h.app.match;
  m.period=period;m.kickoff(team);const keeper=m.players[team*11];
  // Controlled fixture for an actual keeper possession; no manual selection changes.
  m.giveBall(keeper);const own=m.activeFor(team);
  h.window.handlers.keydown(keyEvent(local?(team===0?'q':'o'):'Tab'));
  assert.equal(m.activeFor(team),keeper.id,'switch cannot detach control from owned ball');
  h.window.handlers.keydown(keyEvent(local?(team===0?(shot?'g':'f'):(shot?'l':'k')):(shot?' ':'e')));
  assert.equal(m.pendingKick.player,keeper.id);assert.equal(m.activeFor(team),keeper.id);
  let s=m.snapshot();assert.equal(h.app.playerMarkers(s.players[keeper.id],s,local).selected,true);
  advanceToContact(m);s=m.snapshot();
  assert.equal(m.ball.owner,null);assert.ok(m.activeFor(team)!==own);
  assert.equal(h.app.playerMarkers(s.players[keeper.id],s,local).selected,false);
  assert.ok(h.app.playerMarkers(s.players[keeper.id],s,local).follow>0);
  assert.equal(h.app.playerMarkers(s.players[m.activeFor(team)],s,local).selected,true);
  const count=m.strikeSequence;
  h.window.handlers.keydown(keyEvent(local?(team===0?'f':'k'):'e'));
  assert.equal(m.strikeSequence,count,'loose-ball pass cannot command the old keeper');
  const receiver=m.players[m.activeFor(team)],before={x:receiver.x,y:receiver.y};
  m.step(1/60,local?{teams:[team===0?{dx:0,dy:1}:{dx:0,dy:0},team===1?{dx:0,dy:1}:{dx:0,dy:0}]}:{dx:0,dy:1});
  assert.ok(distance(receiver,before)>0,'movement really targets transferred selection');
 }
});
test('ownership investigation: local and solo defender selection remains independent while opponents own the ball',()=>{
 for(const local of [false,true])for(const team of local?[0,1]:[0]){
  const h=uiHarness(html);h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();const m=h.app.match;
  m.giveBall(m.players[(1-team)*11+6]);const before=m.activeFor(team),other=m.activeFor(1-team);
  h.window.handlers.keydown(keyEvent(local?(team===0?'q':'o'):'Tab'));
  assert.ok(m.activeFor(team)!==before);assert.equal(m.activeFor(1-team),other);
  for(const key of local?(team===0?['f','g']:['k','l']):['e',' ']){
   h.window.handlers.keydown(keyEvent(key));assert.equal(m.pendingKick,null);
  }
  m.giveBall(m.players[team*11+4]);assert.equal(m.activeFor(team),m.owner.id);
 }
});

test('pause instructions distinguish pointer aim from automatic keyboard kicks and explain the contact handoff',()=>{
 for(const [width,height] of [[333,505],[1180,757]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('practice');h.flush();const m=h.app.match,before=JSON.stringify(m.snapshot());
  h.click('menuBtn');const core=h.elements.get('coreControls').innerHTML,help=h.elements.get('soloPauseHelp').textContent;
  for(const text of ['Pointer: aim at a teammate + release','E: auto-select a teammate and pass','Space: shoot toward goal centre','Tab: switch while defending or chasing a loose ball','At ball contact, control moves to the receiver or chasing teammate'])assert.ok(core.includes(text),text);
  assert.ok(help.includes('These keyboard shortcuts do not use pointer aim'));
  assert.ok(help.includes('while opponents have possession or the ball is loose'));
  assert.ok(help.includes('while the kicker follows through'));
  assert.equal(help,h.elements.get('gameControls').textContent);
  assert.ok(!h.elements.get('advancedControls').classList.contains('hidden'));
  h.elements.get('advancedControls').open=true;h.app.render(0);
  assert.equal(JSON.stringify(m.snapshot()),before,'help does not mutate match');
  h.click('resumePause');assert.equal(h.document.activeElement,h.elements.get('game'));
  h.window.handlers.keydown(keyEvent('e'));assert.equal(m.pendingKick.player,m.active);advanceToContact(m);assert.equal(m.passes[0],1);
 }
 // Responsive layout contracts only: no native text measurement or scroll simulation.
 assert.ok(/#pause \.card\{max-height:[^}]*overflow-y:auto/.test(html));
 assert.ok(/grid-template-columns:100px minmax\(0,1fr\);gap:8px/.test(html));
 assert.ok(/\.core-controls dd\{min-width:0;overflow-wrap:anywhere/.test(html));
});
test('local help describes both auto-pass goal-shot and defensive-switch key sets without changing shootout guidance',()=>{
 for(const [width,height] of [[333,505],[1180,757]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('multi');h.click('startLocal');h.flush();h.click('menuBtn');
  const help=h.elements.get('gameControls').textContent,markup=html.match(/<p id="localPauseHelp"[^>]*>([\s\S]*?)<\/p>/)[1];
  for(const text of ['F auto-selects a teammate and passes','K auto-selects a teammate and passes','G shoots','L shoots','hold the direction across the visible goal mouth','The shot locks when G or L is pressed','At kick contact, your control moves to the receiver or chasing teammate'])assert.ok(help.includes(text),text);
  for(const text of ['F auto-pass','K auto-pass','Q switch defender','O switch defender','Hold movement across the visible goal mouth + G/L','release it for centre','shot locks on key press','while opponents have possession or the ball is loose','kicker finishes following through'])assert.ok(markup.includes(text),text);
  assert.ok(!h.elements.get('localPauseHelp').classList.contains('hidden'));
  h.click('resumePause');h.window.handlers.keydown(keyEvent('f'));assert.ok(h.app.match.pendingKick);
  h.chooseMode('menu');h.chooseMode('shootout');h.flush();h.click('menuBtn');
  assert.ok(h.elements.get('coreControls').innerHTML.includes('Aim your kick'));
  assert.ok(!h.elements.get('gameControls').textContent.includes('toward goal centre'),'shootout keyboard aim is independent');
  assert.ok(!h.elements.get('coreControls').innerHTML.includes('After a kick'));
 }
});

test('restart announcement has a definite readable width and visible action below the measured HUD',()=>{
 const card=html.match(/#corner \.card\{([^}]+)\}/)[1],panel=html.match(/#corner\{([^}]+)\}/)[1];
 assert.ok(card.includes('width:min(420px,100%)'));assert.ok(card.includes('max-height:100%'));
 assert.ok(card.includes('overflow-y:auto'));assert.ok(card.includes('transform:none'));assert.ok(card.includes('pointer-events:auto'));
 assert.ok(panel.includes('left:12px;right:12px'));assert.ok(panel.includes('bottom:max(12px,env(safe-area-inset-bottom))'));
 assert.ok(/<button class="primary" id="takeCorner">/.test(html),'action is visible without keyboard focus');
 assert.ok(!html.includes("notice.style.left=clamp"),'restart position cannot shrink the card near the touchline');
 for(const [width,height] of [[333,505],[400,606],[1180,757],[757,333]]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:20,top:30,width,height});
  h.chooseMode('practice');h.flush();const m=h.app.match;
  m.phase='restart';m.restart={type:'Throw-in',team:1,x:550,y:FIELD.top};h.app.syncMatch();
  for(const hudHeight of [38,82]){
   h.elements.get('hud').getBoundingClientRect=()=>({left:28,top:38,right:width+12,bottom:38+hudHeight,width:width-16,height:hudHeight});
   const before=JSON.stringify(m.snapshot());h.app.render(0);
   const top=Number.parseFloat(h.elements.get('corner').style.top);
   assert.equal(top,Math.max(64,8+hudHeight+12));assert.equal(JSON.stringify(m.snapshot()),before);
   // Explicit CSS box geometry, not browser font/layout measurement.
   const availableWidth=width-24,cardWidth=Math.min(420,availableWidth),left=(width-cardWidth)/2;
   assert.ok(cardWidth>=309);assert.ok(left>=12);assert.ok(left+cardWidth<=width-12);
   assert.ok(height-12-top>=200,'scrolling card area remains usable in short landscape');
  }
  assert.ok(h.elements.get('restartHelp').textContent.includes('The opposition takes the restart.'));
  assert.equal(h.elements.get('takeCorner').textContent,'CONTINUE');
 }
});
test('shared restart presentation preserves every owner action and automatic setup countdown',()=>{
 for(const local of [false,true])for(const team of [0,1])for(const type of ['Throw-in','Corner Kick','Goal Kick','Direct Free Kick','Indirect Free Kick','Penalty Kick']){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:333,height:505});
  h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();const m=h.app.match;
  const reason=type==='Direct Free Kick'||type==='Penalty Kick'?'Challenge from behind':null;
  m.phase='restart';m.restart={type,team,x:type==='Goal Kick'?m.ownGoalX(team):type==='Corner Kick'?m.goalX(team):550,
   y:['Throw-in','Corner Kick'].includes(type)?FIELD.top:FIELD.cy,...(reason?{reason}:{} )};
  h.app.syncMatch();h.app.render(0);
  assert.equal(h.app.view,'corner');assert.equal(h.elements.get('restartType').textContent,type);
  assert.equal(h.elements.get('takeCorner').textContent,local||team===0?'SET UP '+type.toUpperCase():'CONTINUE');
  const expected=m.restart;h.tick(100);h.tick(200);assert.equal(m.phase,'restart');assert.equal(m.restart,expected);
  for(let time=300;time<=1500;time+=100)h.tick(time);
  assert.equal(m.phase,'playing');assert.equal(m.setPiece,type);assert.equal(m.owner.team,team);
  assert.ok(h.elements.get('corner').classList.contains('hidden'));
 }
 // Clicking the visible action remains the same optional early setup.
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
 m.phase='restart';m.restart={type:'Throw-in',team:1,x:550,y:FIELD.top};h.app.syncMatch();h.click('takeCorner');
 assert.equal(m.phase,'playing');assert.equal(m.setPiece,'Throw-in');assert.equal(m.owner.team,1);
});

test('compact HUD country codes retain full names tooltips flags and owner kit labels in every mode',()=>{
 for(const mode of ['practice','cup','shootout','multi'])for(let n=0;n<NATIONS.length;n++){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:333,height:596});
  for(let i=0;i<n;i++)h.click('next');h.chooseMode(mode);
  if(mode==='cup')h.click('startMatch');if(mode==='multi')h.click('startLocal');h.flush();
  const m=h.app.match;
  for(const side of ['home','away']){
   const nation=m[side],code=h.elements.get(side+'Code'),name=h.elements.get(side+'Name');
   assert.equal(code.textContent,nation.code);assert.ok(/^[A-Z]{3}$/.test(code.textContent));
   assert.equal(code.title,nation.name);assert.equal(name.textContent,nation.name);assert.equal(name.title,nation.name);
   assert.equal(h.elements.get(side+'Flag').textContent,nation.flag);
   const kit=h.elements.get(side+'Kit').getAttribute('aria-label');assert.ok(kit.includes(nation.name));
   if(mode==='multi')assert.ok(kit.includes(side==='home'?'Player 1.':'Player 2.'));
  }
  assert.equal(h.elements.get('scoreText').textContent,mode==='shootout'?'0 - 0 pens':'0 - 0');
  assert.equal(h.elements.get('clock').textContent,mode==='shootout'?'PENS':mode==='practice'?'PRACTICE':'00:00');
 }
 for(const side of ['home','away']){
  assert.ok(html.includes('id="'+side+'Code" class="hud-team-code" aria-hidden="true"'),'visual code must not duplicate accessible full name');
  assert.ok(!html.includes('id="'+side+'Name" aria-hidden="true"'));
 }
});
test('HUD resize contracts swap codes and full names without altering play or interval identities',()=>{
 const css=html.slice(html.indexOf('/* Compact match identity:'),html.indexOf('</style>'));
 assert.ok(css.includes('.hud-team-code{display:none}'));
 assert.ok(css.includes('@media(max-width:620px)'));
 assert.ok(css.includes('#hud .hud-team-code{display:inline-block;flex:0 0 auto;white-space:nowrap}'));
 assert.ok(/#hud #homeName,#hud #awayName\{[^}]*position:absolute[^}]*clip-path:inset\(50%\)/.test(css));
 assert.ok(!/#hud #homeName,#hud #awayName\{[^}]*display:none/.test(css),'full name stays in accessibility tree');
 assert.ok(html.includes('#hud .score{max-width:calc(100% - 42px);min-width:0}'),'pause clearance retained');
 assert.ok(!html.includes('.score>span:nth-child(5)'),'adding codes must not change positional font targets');
 assert.ok(html.includes('.score>#homeKit,.score>#awayName{font-size:14px}'),'existing wide label sizing is preserved');
 for(const mode of ['practice','cup','shootout','multi'])for(const code of ['USA','SUI','KOR','NOR']){
  const h=uiHarness(html);let width=887;
  h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  for(let i=0;i<NATIONS.findIndex(n=>n.code===code);i++)h.click('next');h.chooseMode(mode);
  if(mode==='cup')h.click('startMatch');if(mode==='multi')h.click('startLocal');h.flush();const m=h.app.match;
  const before=JSON.stringify(m.snapshot()),score=h.elements.get('scoreText').textContent,clock=h.elements.get('clock').textContent;
  for(width of [333,887,620,621,333]){
   h.app.render(0);h.app.syncMatch();
   assert.equal(h.elements.get('homeCode').textContent,m.home.code);assert.equal(h.elements.get('homeName').textContent,m.home.name);
   assert.equal(h.elements.get('awayCode').textContent,m.away.code);assert.equal(h.elements.get('awayName').textContent,m.away.name);
   assert.equal(h.elements.get('scoreText').textContent,score);assert.equal(h.elements.get('clock').textContent,clock);
   assert.equal(JSON.stringify(m.snapshot()),before);
  }
  if(mode!=='shootout'){
   m.phase='half';h.app.syncMatch();assert.equal(h.elements.get('halfHomeName').textContent,m.home.name);
   assert.equal(h.elements.get('halfAwayName').textContent,m.away.name);
   m.score=[2,1];m.finish();h.app.syncMatch();assert.equal(h.elements.get('resultHomeName').textContent,m.home.name);
   assert.equal(h.elements.get('resultAwayName').textContent,m.away.name);
  }
 }
});

test('local kick messages identify the actual kicker at contact and refresh separate identical actions',()=>{
 for(const [width,height] of [[333,596],[887,597]])for(const team of [0,1])for(const shot of [false,true]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('multi');
  h.elements.get('localHomeSelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='USA'))}});
  h.elements.get('localAwaySelect').handlers.change({target:{value:String(NATIONS.findIndex(n=>n.code==='SUI'))}});
  h.click('startLocal');h.flush();const m=h.app.match,toast=h.elements.get('toast'),key=team===0?(shot?'g':'f'):(shot?'l':'k');
  for(let action=0;action<2;action++){
   // Controlled possession fixture; kicks use the real keyboard, wind-up and release.
   m.kickoff(team);h.app.syncMatch();h.flush();const p=m.owner,serial=m.feedbackSerial;
   h.window.handlers.keydown(keyEvent(key));assert.equal(m.pendingKick.player,p.id);
   h.app.syncMatch();assert.equal(m.feedbackSerial,serial,'no premature action feedback during wind-up');
   advanceToContact(m);assert.equal(m.ball.owner,null);assert.ok(m.activeFor(team)!==p.id,'handoff happened before toast read');
   assert.equal(m.event,'P'+(team+1)+': '+(shot?'Shot!':'Pass!'));
   assert.equal(m.feedbackSerial,serial+1);h.app.syncMatch();
   assert.equal(toast.textContent,m.event);assert.ok(toast.classList.contains('routine'));assert.ok(toast.classList.contains('toastOn'));
   h.flush();assert.equal(toast.textContent,'');
   for(let i=0;i<3;i++)h.app.syncMatch();
   assert.equal(toast.textContent,'','ordinary render sync must not restart the expired toast');
  }
  h.click('menuBtn');h.click('restartMatch');h.flush();assert.equal(h.app.match.feedbackSerial,0);
 }
});
test('local tackle and goalkeeper-save feedback names the winning actor while solo wording stays unchanged',()=>{
 for(const mode of ['local','practice'])for(const team of [0,1]){
  const h=uiHarness(html);h.chooseMode(mode==='local'?'multi':'practice');if(mode==='local')h.click('startLocal');h.flush();const m=h.app.match;
  const victim=m.players[(1-team)*11+9],defender=m.players[team*11+9];
  victim.x=550;victim.y=318;victim.angle=m.direction(victim.team)>0?0:Math.PI;
  defender.x=550+m.direction(victim.team)*15;defender.y=318;m.giveBall(victim);
  m.selectPlayer(team,defender.id);m.protection=0;m.random=()=>0;
  m.step(1/60,mode==='local'?{teams:[{dx:0,dy:0},{dx:0,dy:0}]}:{dx:0,dy:0});
  assert.equal(m.owner.id,defender.id);assert.equal(m.tackles,1);
  assert.equal(m.event,mode==='local'?'P'+(team+1)+': Possession won':team===0?'Possession won':'Tackled — win it back');
  h.app.syncMatch();assert.equal(h.elements.get('toast').textContent,m.event);
  const keeper=m.players[team*11];keeper.x=m.ownGoalX(team)+m.direction(team)*18;keeper.y=FIELD.cy;
  m.ball.owner=null;m.ball.lastTouch=1-team;m.ball.x=keeper.x;m.ball.y=keeper.y;m.ball.z=0;m.lastRestart=null;m.offside=null;
  m.receiveBall(keeper);assert.equal(m.handOwner,keeper.id);assert.equal(m.saves[team],1);
  assert.equal(m.event,mode==='local'?'P'+(team+1)+': Goalkeeper save':'Goalkeeper save');h.app.syncMatch();
  assert.equal(h.elements.get('toast').textContent,m.event);
  assert.ok(!h.elements.get('toast').classList.contains('routine'));
 }
});
test('solo pass and shot wording and feedback durations remain unchanged with compact local labels',()=>{
 for(const shot of [false,true]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
  h.window.handlers.keydown(keyEvent(shot?' ':'e'));advanceToContact(m);h.app.syncMatch();
  assert.equal(m.event,shot?'Shot!':'Pass!');assert.equal(h.elements.get('toast').textContent,m.event);
  assert.equal(m.feedbackSerial,0);
 }
 assert.ok(html.includes('routine?650:1600'),'same per-message durations');
 assert.ok(/#bottomMessages>#toast,#bottomMessages>#kickoffCue\{[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere/.test(html),'existing narrow wrapping retained');
});

test('routine action feedback has opaque high-contrast backing and retains nonblocking wrapped placement',()=>{
 const rule=html.match(/#bottomMessages>#toast\.routine\{([^}]+)\}/)[1];
 const bg=rule.match(/background:(#[0-9a-f]+);/)[1],fg=rule.match(/(?:^|;)color:(#[0-9a-f]+);/)[1];
 assert.equal(bg,'#102b23');assert.equal(fg,'#f3f7e7');assert.equal(bg.length,7,'backing is opaque over grass nets and players');
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
 const contrast=(luminance(fg)+.05)/(luminance(bg)+.05);
 assert.ok(contrast>=7,'steady visible text exceeds 7:1 contrast');
 assert.ok(rule.includes('font-size:12px'));assert.ok(rule.includes('padding:5px 9px'));assert.ok(rule.includes('font-weight:700'));
 assert.ok(html.includes('#toast.routine.toastOn{opacity:1!important}'));
 assert.ok(!html.includes('#toast.routine.toastOn{opacity:.8!important}'));
 assert.ok(/#toast\{[^}]*opacity:0[^}]*pointer-events:none/.test(html));
 assert.ok(/#bottomMessages\{[^}]*pointer-events:none/.test(html));
 assert.ok(/#bottomMessages>#toast,#bottomMessages>#kickoffCue\{[^}]*width:max-content[^}]*max-width:100%[^}]*white-space:normal[^}]*overflow-wrap:anywhere/.test(html));
 assert.ok(html.includes('button,#toast{transition:none}'),'reduced-motion exit treatment remains');
});
test('real kick feedback retains wording lifetime exit pause and shootout suppression across narrow and wide views',()=>{
 for(const [width,height] of [[333,596],[887,597]])for(const local of [false,true])for(const team of local?[0,1]:[0]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();const m=h.app.match,toast=h.elements.get('toast');
  m.kickoff(team);h.app.syncMatch();h.flush();
  h.window.handlers.keydown(keyEvent(local?(team===0?'f':'k'):'e'));advanceToContact(m);h.app.syncMatch();
  assert.equal(toast.textContent,(local?'P'+(team+1)+': ':'')+'Pass!');
  assert.ok(toast.classList.contains('routine'));assert.equal(h.timerDelays.at(-1),650);
  assert.ok(h.elements.get('kickoffCue').classList.contains('hidden'),'contact clears the separate restart cue');
  h.flush();assert.equal(toast.textContent,'');assert.ok(!toast.classList.contains('toastOn'));
  // Fixture awards the same direct free kick seen in live QA; actual setup/key/contact follows.
  const p=m.players[team*11+6];m.giveBall(p);m.foul(m.players[(1-team)*11+9],p,'Late challenge');
  h.app.syncMatch();h.click('takeCorner');
  assert.ok(!h.elements.get('kickoffCue').classList.contains('hidden'));
  h.window.handlers.keydown(keyEvent(local?(team===0?'g':'l'):' '));advanceToContact(m);h.app.syncMatch();
  assert.equal(toast.textContent,(local?'P'+(team+1)+': ':'')+'Shot!');
  assert.ok(toast.classList.contains('routine'));assert.equal(h.timerDelays.at(-1),650);
  assert.ok(h.elements.get('kickoffCue').classList.contains('hidden'));
  h.click('menuBtn');assert.equal(toast.textContent,'');assert.ok(!toast.classList.contains('toastOn'));
  h.click('resumePause');assert.equal(toast.textContent,'','pause does not replay the action message');
  // Long non-routine notices still use the same wrapping stack and duration.
  m.event='United States and Switzerland: extended feedback must remain within the message stack.';h.app.syncMatch();
  assert.equal(toast.textContent,m.event);assert.ok(!toast.classList.contains('routine'));assert.equal(h.timerDelays.at(-1),1600);
  h.flush();assert.equal(toast.textContent,'');
 }
 const h=uiHarness(html);h.chooseMode('shootout');h.flush();
 h.window.handlers.keydown(keyEvent(' '));advanceToContact(h.app.match);h.app.syncMatch();
 assert.equal(h.elements.get('toast').textContent,'','shootout uses its existing dedicated feedback');
});

test('ordinary kickoff passes run a stable fixed-step cadence at 30 60 and 120 render Hz',()=>{
 for(const mode of ['practice','cup','local']){
  let reference=null;
  for(const hz of [30,60,120]){
   const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:887,height:597});
   h.chooseMode(mode==='local'?'multi':mode);if(mode==='cup')h.click('startMatch');if(mode==='local')h.click('startLocal');h.flush();
   const m=h.app.match,contacts=[],receives=[],release=m.releaseKick.bind(m),give=m.giveBall.bind(m);
   m.releaseKick=action=>{const ok=release(action);if(ok)contacts.push(m.elapsed);return ok;};
   m.giveBall=p=>{const prior={...m.ball};give(p);receives.push({id:p.id,at:m.elapsed,shift:distance(prior,m.ball)});};
   h.tick(100);h.window.handlers.keydown(keyEvent(mode==='local'?'f':'e'));
   let priorBall=null;
   for(let frame=1;frame<=hz*2;frame++){
    const elapsed=m.elapsed;h.tick(100+frame*1000/hz);h.draws.length=0;
    const expected=Math.floor(frame*60/hz)/60;
    assert.ok(Math.abs(m.elapsed-expected)<1e-8,'no spurious skipped/catch-up tick at '+hz+' Hz frame '+frame);
    if(hz===60)assert.ok(Math.abs(m.elapsed-elapsed-1/60)<1e-8);
    if(hz===60&&priorBall?.owner===null&&m.ball.owner===null&&Math.hypot(m.ball.vx,m.ball.vy)>20)
     assert.ok(distance(priorBall,m.ball)>0,'moving pass must advance on every 60 Hz frame');
    priorBall={...m.ball};
   }
   assert.equal(contacts.length,1);assert.ok(Math.abs(contacts[0]-.075)<1e-9);
   assert.equal(m.passes[0],1);assert.equal(m.shots[0],0);
   if(mode!=='local'){assert.equal(m.owner.id,6);assert.equal(receives[0].id,6);assert.ok(receives[0].shift<1e-8);}
   const end=JSON.stringify(m.snapshot());if(reference===null)reference=end;else assert.equal(end,reference,'same simulation/pose outcome across render rates');
  }
 }
});
test('frame tolerance ignores rounding noise without admitting early ticks or changing the stall cap',()=>{
 for(const start of [100,87654321]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
  h.tick(start);h.window.handlers.keydown(keyEvent('e'));
  h.tick(start+16.5);assert.equal(m.elapsed,0,'0.167 ms short is not numerical noise');
  h.tick(start+1000/60);assert.ok(Math.abs(m.elapsed-1/60)<1e-8);
  for(let frame=2;frame<=60;frame++){h.tick(start+frame*1000/60);h.draws.length=0;}
  assert.ok(Math.abs(m.elapsed-1)<1e-8);
  const before=m.elapsed;h.tick(start+3000);assert.ok(Math.abs(m.elapsed-before-.1)<1e-8,'long gap remains capped at six ticks');
  h.click('menuBtn');const paused=m.elapsed;h.tick(start+3100);assert.equal(m.elapsed,paused);
  h.click('resumePause');h.tick(start+3100+1000/60);assert.equal(m.elapsed,paused,'resume establishes a fresh frame baseline');
  h.tick(start+3100+2*1000/60);assert.ok(Math.abs(m.elapsed-paused-1/60)<1e-8);
 }
});
test('ordinary pointer kickoff retains one contact reception and handoff across render rates',()=>{
 for(const hz of [30,60,120])for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?333:887,height:596});
  h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner,r=m.bestPass(p);
  h.tick(100);const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,r.id);
  let contacted=false,received=false;
  for(let frame=1;frame<=hz*2;frame++){
   h.tick(100+frame*1000/hz);h.draws.length=0;
   if(!contacted&&m.passes[0]===1){contacted=true;assert.equal(m.active,r.id);}
   if(m.owner?.id===r.id){received=true;break;}
  }
  assert.ok(contacted&&received);assert.equal(m.passes[0],1);assert.equal(m.shots[0],0);
  c.handlers.pointerup(pointerEvent(h,b.x,b.y));assert.equal(m.pendingKick,null);
 }
});

test('live interpolation bounds positions and poses while retaining immediate ownership and action identity',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match;
 const a=m.snapshot();m.step(1/60,h.app.input());const b=m.snapshot(),p=9;
 b.players[p].x=a.players[p].x+2;b.players[p].angle=-Math.PI+.02;a.players[p].angle=Math.PI-.02;
 a.players[p].stride=2;b.players[p].stride=4;a.players[p].speed=50;b.players[p].speed=70;
 a.players[p].strikeId=b.players[p].strikeId=3;a.players[p].strikePhase=b.players[p].strikePhase='follow';
 a.players[p].strike=.4;b.players[p].strike=.5;
 a.players[p].receive=0;b.players[p].receive=1;
 b.ball.x=a.ball.x+4;b.ball.z=2;b.active=6;
 const saved=JSON.stringify([a,b]),sample=h.app.interpolateLiveFrame(a,b,.5);
 assert.equal(sample.players[p].x,a.players[p].x+1);assert.equal(sample.ball.x,a.ball.x+2);
 assert.equal(sample.ball.z,1);assert.equal(sample.players[p].stride,3);
 assert.equal(sample.players[p].strike,.45);assert.equal(sample.players[p].receive,1,'new receiving event is immediate');
 assert.ok(Math.abs(sample.players[p].angle-Math.PI)<1e-10,'turn takes the short angular path');
 assert.equal(sample.active,b.active);assert.equal(sample.ball.owner,b.ball.owner);
 assert.equal(JSON.stringify([a,b]),saved,'render blending cannot mutate snapshots');
 assert.equal(h.app.interpolateLiveFrame(a,b,-1).ball.x,a.ball.x);
 assert.equal(h.app.interpolateLiveFrame(a,b,2).ball.x,b.ball.x);
 b.ball.owner=null;assert.equal(h.app.interpolateLiveFrame(a,b,.5),b,'contact snaps ownership and pose together');
 b.ball.owner=a.ball.owner;b.players[p].x+=100;
 assert.equal(h.app.interpolateLiveFrame(a,b,.5),b,'formation teleports must not smear');
 b.players[p].x=a.players[p].x;b.at=a.at;
 assert.equal(h.app.interpolateLiveFrame(a,b,.5),b,'same-time reset is not a simulation interval');
});
test('ordinary 60 and 120 Hz passes interpolate actual drawn ball and follow-through with bounded visual delay',()=>{
 for(const mode of ['practice','cup','local'])for(const hz of [60,120])for(const portrait of [false,true]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:portrait?333:887,height:596});
  h.chooseMode(mode==='local'?'multi':mode);if(mode==='cup')h.click('startMatch');if(mode==='local')h.click('startLocal');h.flush();
  const m=h.app.match,kicker=m.owner.id;h.tick(100);h.window.handlers.keydown(keyEvent(mode==='local'?'f':'e'));
  let prior=null,simulationBefore=m.snapshot(),lastElapsed=m.elapsed,repeats=0,intervals=0,poseChanges=0,received=false;
  for(let frame=1;frame<=hz*.5;frame++){
   const before=m.snapshot();h.tick(100+frame*1000/hz);h.draws.length=0;const current=m.snapshot();
   if(current.at!==lastElapsed){simulationBefore=before;lastElapsed=current.at;}
   const drawn=h.app.drawnBall,pose=h.app.drawnPlayers.get(kicker);
   assert.equal(drawn.owner,current.ball.owner,'drawn ownership changes on the authoritative frame');
   assert.equal(pose.strikePhase,current.players[kicker].strikePhase);
   assert.equal(pose.strikeId,current.players[kicker].strikeId);
   if(pose.strikePhase==='windup')assert.equal(pose.strike,current.players[kicker].strike,'wind-up cannot acquire extra latency or a larger contact jump');
   for(const key of ['x','y','z']){
    const lo=Math.min(simulationBefore.ball[key],current.ball[key])-1e-8,hi=Math.max(simulationBefore.ball[key],current.ball[key])+1e-8;
    assert.ok(drawn[key]>=lo&&drawn[key]<=hi,'visual ball stays within the last tick, with no prediction');
   }
   if(prior&&prior.owner===null&&current.ball.owner===null){
    intervals++;if(distance(prior.ball,drawn)<1e-8)repeats++;
    if(Math.abs(prior.pose.strike-pose.strike)>1e-8)poseChanges++;
   }
   if(current.ball.owner!==null&&current.ball.owner!==kicker){
    received=true;if(prior?.owner!==current.ball.owner)assert.ok(distance(drawn,current.ball)<1e-8,'reception snaps without stale carrier');
   }
   prior={ball:drawn,pose,owner:current.ball.owner};
  }
  assert.ok(intervals>=16);assert.equal(repeats,hz===120?1:0,'only the immediate contact interval may repeat at 120 Hz');
  assert.ok(poseChanges>= (hz===120?30:15),'follow-through progresses on intermediate render frames');
  if(mode!=='local')assert.ok(received,'ordinary pass reaches the support player');
  assert.equal(m.passes[0],1);
 }
});
test('render interpolation leaves ordinary input simulation and camera identical to unblended rendering',()=>{
 const unblended=html.replace("if(match?.phase==='playing')shot=liveRenderSample(shot);","if(match?.phase==='playing')shot=shot;");
 for(const mode of ['practice','local','shootout'])for(const hz of [60,120]){
  const a=uiHarness(html),b=uiHarness(unblended);
  for(const h of [a,b]){
   h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:333,height:596});
   h.chooseMode(mode==='local'?'multi':mode);if(mode==='local')h.click('startLocal');h.flush();h.tick(100);
   if(mode==='practice'){
    const m=h.app.match,p=m.owner,r=m.bestPass(p),c=h.elements.get('game'),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
    c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
   }else h.window.handlers.keydown(keyEvent(mode==='local'?'f':' '));
  }
  for(let frame=1;frame<=hz;frame++){
   for(const h of [a,b]){
    if(frame===Math.round(hz*.5))h.window.handlers.keydown(keyEvent('w'));
    if(frame===Math.round(hz*.8))h.window.handlers.keyup(keyEvent('w'));
    h.tick(100+frame*1000/hz);h.draws.length=0;
   }
   assert.equal(JSON.stringify(a.app.match.snapshot()),JSON.stringify(b.app.match.snapshot()));
   assert.deepEqual(['x','y','zoom','yaw','tilt'].map(k=>a.app.camera[k]),['x','y','zoom','yaw','tilt'].map(k=>b.app.camera[k]),'camera follows current state, never delayed rendering');
   assert.equal(a.app.match.phase,b.app.match.phase);
  }
  assert.equal(JSON.stringify(a.app.match),JSON.stringify(b.app.match),'including RNG, score, pending action and history');
 }
});
test('live render buffering snaps on pause resume match reset halftime goal and replay transitions',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));
 for(let i=1;i<=20;i++){h.tick(100+i*1000/120);h.draws.length=0;}
 const exact=()=>{h.app.render();const s=h.app.match.snapshot();assert.deepEqual(h.app.drawnBall,s.ball);for(const p of s.players)assert.deepEqual(h.app.drawnPlayers.get(p.id),p);};
 h.click('menuBtn');exact();h.tick(400);exact();h.click('resumePause');h.tick(400);exact();
 // Explicit transition fixtures exercise the normal phase handlers, not naturally earned goals.
 const m=h.app.match;m.phase='half';h.app.syncMatch();exact();h.click('resume');exact();assert.equal(m.period,2);
 m.phase='goal';m.scorer=0;m.replayFrames=[m.snapshot(),m.snapshot()];h.app.syncMatch();exact();
 m.phase='replay';m.replayTime=1;h.app.syncMatch();h.app.render();
 assert.deepEqual(h.app.drawnBall,h.app.replaySample(m.replayFrames,1/4).ball,'replay retains its separate sampler');
 h.click('skipReplay');exact();
 m.phase='replay';m.replayTime=4.19;h.app.syncMatch();h.tick(420);exact();assert.equal(m.phase,'playing');
 h.click('menuBtn');h.click('restartMatch');h.flush();exact();assert.ok(h.app.match!==m);
 const current=h.app.match;current.phase='full';h.app.syncMatch();exact();
});
test('stationary restart and shootout attempt transitions never interpolate old positions',()=>{
 for(const type of ['Throw-in','Corner Kick','Goal Kick','Direct Free Kick','Indirect Free Kick','Penalty Kick']){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));h.tick(200);
  const m=h.app.match;
  m.stopForRestart({type,team:0,x:type==='Goal Kick'?FIELD.right-24:FIELD.left+40,y:FIELD.cy});
  h.app.syncMatch();h.app.render();assert.deepEqual(h.app.drawnBall,m.snapshot().ball);
  h.click('takeCorner');h.app.render();assert.deepEqual(h.app.drawnBall,m.snapshot().ball);
  h.tick(1000);assert.deepEqual(h.app.drawnBall,m.snapshot().ball,'stationary ball remains at legal restart spot');
 }
 const h=uiHarness(html);h.chooseMode('shootout');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent(' '));
 for(let i=1;i<=20;i++){h.tick(100+i*1000/120);h.draws.length=0;}
 const m=h.app.match;m.completeShootoutKick('save');h.app.syncMatch();h.app.render();assert.deepEqual(h.app.drawnBall,m.snapshot().ball);
 m.phase='penalties';h.app.syncMatch();h.click('nextPenalty');h.app.render();
 assert.deepEqual(h.app.drawnBall,m.snapshot().ball);assert.equal(m.penalties.turn,1);
});
test('between-frame input and teleports cannot reuse a stale visual interval',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));
 for(let i=1;i<=60;i++){h.tick(100+i*1000/120);h.draws.length=0;}
 const m=h.app.match;assert.equal(m.owner.id,6);
 h.window.handlers.keydown(keyEvent('e'));const now=m.snapshot();
 const painted=h.app.liveRenderSample(now);assert.equal(painted.players[6].strikeId,now.players[6].strikeId);assert.equal(painted.players[6].strikePhase,'windup','fresh action is visible immediately, before another fixed step');
 h.app.render();assert.equal(h.app.drawnPlayers.get(6).strikeId,now.players[6].strikeId);
 m.kickoff(0);const reset=m.snapshot();assert.equal(h.app.liveRenderSample(reset),reset,'same-phase formation reset snaps');
});

test('ordinary open-play pointer pass aimed at drawn players reaches its chosen receiver at 60 and 120 Hz',()=>{
 for(const hz of [60,120])for(const portrait of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:portrait?333:887,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;};
  h.window.handlers.keydown(keyEvent('e'));
  while(frame<hz&&m.owner?.id!==6)tick();
  assert.equal(m.owner.id,6,'normal kickoff must reach support player first');
  const p=m.owner,r=m.bestPass(p),paintedP=h.app.drawnPlayers.get(p.id),paintedR=h.app.drawnPlayers.get(r.id);
  const a=h.app.camera.project(paintedP.x,paintedP.y),b=h.app.camera.project(paintedR.x,paintedR.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,r.id);assert.equal(m.pendingKick.shot,false);
  let got=false;const start=frame;
  while(frame<start+hz*2&&m.phase==='playing'){tick();if(m.owner?.id===r.id){got=true;break;}}
  assert.ok(got,'chosen teammate must actually receive the second pass against live AI');
  assert.equal(m.passes[0],2);assert.equal(m.phase,'playing');
 }
});

test('moving pass guides and power labels stay attached to the drawn carrier and receiver',()=>{
 for(const mode of ['practice','cup'])for(const hz of [60,120])for(const [width,height] of [[333,596],[887,597]]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode(mode);if(mode==='cup')h.click('startMatch');h.flush();h.tick(100);const m=h.app.match;
  let frame=0;const tick=()=>{h.app.drawnPaths.length=0;h.tick(100+(++frame)*1000/hz);h.draws.length=0;};
  h.window.handlers.keydown(keyEvent('e'));while(frame<hz&&m.owner?.id!==6)tick();
  assert.equal(m.owner.id,6);
  const p=m.owner,r=m.bestPass(p),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
  let checked=0;
  for(let i=0;i<hz*.4;i++){
   tick();const d=h.app.drag,intent=h.app.pointerAim(d),path=h.app.drawnPaths.at(-1);
   assert.ok(path);const painted=h.app.drawnPlayers.get(d.player);
   assert.deepEqual(path[0],[painted.x,painted.y],'line begins at the same rendered foot as the control ring');
   const receiver=h.app.drawnPlayers.get(intent.target.receiverId);
   if(receiver)assert.deepEqual(path[1],[receiver.x,receiver.y],'target ring follows the drawn receiver');
   assert.equal(h.app.drawnAim.p.x,painted.x);assert.equal(h.app.drawnAim.p.y,painted.y);
   assert.equal(m.owner.id,p.id);checked++;
  }
  assert.ok(checked>=24);
  const expected=h.app.pointerAim(h.app.drag),before=m.passes[0];
  c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,expected.target.receiverId);
  assert.equal(m.pendingKick.power,expected.power);
  advanceToContact(m);assert.equal(m.passes[0],before+1);
 }
});
test('local keyboard pass wind-up guides use drawn teammates for both owners',()=>{
 for(const hz of [60,120])for(const width of [333,887])for(const team of [0,1]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;
  // P2 kickoff is a second-half ownership fixture; the action uses its normal key.
  if(team===1){m.phase='half';h.app.syncMatch();h.click('resume');}
  h.tick(100);h.window.handlers.keydown(keyEvent(team===0?'f':'k'));
  let checked=0;
  for(let frame=1;frame<=8;frame++){
   h.app.drawnPaths.length=0;h.tick(100+frame*1000/hz);h.draws.length=0;
   if(!m.pendingKick)break;
   const path=h.app.drawnPaths.at(-1),p=h.app.drawnPlayers.get(m.pendingKick.player),r=h.app.drawnPlayers.get(m.pendingKick.target.receiverId);
   assert.ok(path);assert.deepEqual(path[0],[p.x,p.y]);assert.deepEqual(path[1],[r.x,r.y]);checked++;
  }
  assert.ok(checked>=4);
 }
});
test('forecast uses the actual kick contact model and clears its graphics at release',()=>{
 const {RULES}=new Function(engine+';return {RULES};')();let visibleCrossings=0;
 for(const mode of ['practice','shootout'])for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode(mode);h.flush();const m=h.app.match;
  if(mode==='practice'){
   // Near-goal possession fixture, then normal aiming and release; no synthetic goal.
   const p=m.players[9];p.x=FIELD.left+160;p.y=FIELD.cy+20;m.giveBall(p);m.restartGuard=null;m.setPiece=null;
  }
  h.tick(100);const p=m.owner,goal=m.goalX(0),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(goal,FIELD.cy+25);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
  for(let frame=1;frame<=4;frame++){
   h.draws.length=0;h.tick(100+frame*1000/hz);
   const intent=h.app.pointerAim(h.app.drag);assert.ok(intent.shot);
   const expected=m.previewKick(m.owner,intent.target,intent.power,false);
   assert.deepEqual(h.app.drawnForecast,expected,'trajectory and crossing stay on authoritative physics, not delayed artwork');
   assert.ok(h.draws.some(d=>d.method==='setLineDash'&&Math.abs(d.args[0][0]-5*1100/width)<1e-7));
   const first=expected.points[0];
   if(!m.restartGuard)assert.ok(Math.abs(distance(first,m.owner)-10)<1e-7,'forecast begins at modeled foot contact, not current carried-ball position');
   assert.equal(h.app.drawnBall.owner,m.ball.owner);
   const crossing=expected.crossing,unit=1100/width;
   if(crossing){
    const at=h.app.camera.project(crossing.x,crossing.y,crossing.z*RULES.heightScale+RULES.radius);
    if(at.x>20*unit&&at.x<1100-20*unit&&at.y>85*unit&&at.y<596*unit-35*unit){
     assert.ok(h.draws.some(d=>d.method==='arc'&&Math.abs(d.args[0]-at.x)<1e-7&&Math.abs(d.args[1]-at.y)<1e-7&&Math.abs(d.args[2]-5*unit)<1e-7),'goal-plane marker is drawn at the physical forecast crossing');
     visibleCrossings++;
    }
   }
  }
  c.handlers.pointerup(pointerEvent(h,b.x,b.y));advanceToContact(m);h.draws.length=0;h.app.render();
  assert.equal(h.app.drawnBall.owner,null);
  assert.ok(!h.draws.some(d=>d.method==='setLineDash'&&Math.abs(d.args[0][0]-5*1100/width)<1e-7),'no stale forecast artwork after kick contact');
 }
 assert.ok(visibleCrossings>0);
});
test('rings selection and edge indicators use one rendered snapshot through ordinary pass reception',()=>{
 let totalEdges=0;
 for(const local of [false,true])for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();h.tick(100);
  h.window.handlers.keydown(keyEvent(local?'f':'e'));const m=h.app.match;
  let edges=0;
  for(let frame=1;frame<=hz*.5;frame++){
   h.tick(100+frame*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;
   const s=h.app.drawnIndicatorShot;
   assert.equal(s.ball.owner,m.ball.owner);assert.equal(s.active,m.active);assert.equal(s.activeAway,m.activeAway);
   for(const p of s.players){
    assert.deepEqual(h.app.drawnPlayers.get(p.id),p);
    const marker=h.app.drawnMarkers.get(p.id);
    assert.equal(marker.ownsBall,p.id===m.ball.owner);assert.equal(marker.selected,p.id===m.active||local&&p.id===m.activeAway);
   }
   for(const arrow of h.app.controlledIndicators(s)){
    const p=h.app.drawnPlayers.get(arrow.id),at=h.app.camera.project(p.x,p.y,28);
    assert.ok(Math.abs(arrow.target.x-at.x*width/1100)<1e-7);assert.ok(Math.abs(arrow.target.y-at.y*width/1100)<1e-7);edges++;
   }
  }
  totalEdges+=edges;
 }
 assert.ok(totalEdges>0,'ordinary local handoff must exercise real off-screen indicators');
});
test('blur pointer cancellation and lost capture discard stale input and permit a fresh pass',()=>{
 for(const hz of [60,120])for(const width of [333,887])for(const reason of ['blur','pointercancel','lostpointercapture']){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));while(frame<hz&&m.owner?.id!==6)tick();
  const p=m.owner,r=m.bestPass(p),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  const down=pointerEvent(h,a.x,a.y),move=pointerEvent(h,b.x,b.y);
  c.handlers.pointerdown(down);c.handlers.pointermove(move);for(let i=0;i<5;i++)tick();
  const count=m.passes[0];
  if(reason==='blur'){h.window.handlers.keydown(keyEvent('w'));h.window.handlers.blur();assert.equal(m.phase,'paused');}
  else if(reason==='pointercancel')c.handlers.pointercancel(move);
  else{c.releasePointerCapture(move.pointerId);c.handlers.lostpointercapture(move);}
  assert.equal(h.app.drag,null);assert.equal(c.capture,null);c.handlers.pointerup(move);
  assert.equal(m.pendingKick,null);assert.equal(m.passes[0],count);
  if(reason==='blur'){h.click('resumePause');assert.equal(h.document.activeElement,c);}
  assert.deepEqual(h.app.input(),{dx:0,dy:0});
  const p2=m.owner,r2=m.bestPass(p2),start=h.app.camera.project(p2.x,p2.y),end=h.app.camera.project(r2.x,r2.y);
  c.handlers.pointerdown(pointerEvent(h,start.x,start.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));c.handlers.pointerup(pointerEvent(h,end.x,end.y));
  assert.equal(m.pendingKick.target.receiverId,r2.id);advanceToContact(m);assert.equal(m.passes[0],count+1);
 }
 for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('multi');h.click('startLocal');h.flush();h.tick(100);
  h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('arrowleft'));h.tick(100+1000/hz);
  h.window.handlers.blur();assert.equal(h.app.match.phase,'paused');h.click('resumePause');
  assert.equal(h.document.activeElement,c);assert.deepEqual(h.app.input(),{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  h.window.handlers.keydown({...keyEvent('f'),target:h.document.activeElement});
  assert.ok(h.app.match.pendingKick);advanceToContact(h.app.match);assert.equal(h.app.match.passes[0],1);
 }
});

test('ordinary automatic passes avoid occupied or closing lanes and reach the clear alternative',()=>{
 for(const mode of ['practice','cup'])for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode(mode);if(mode==='cup')h.click('startMatch');h.flush();h.tick(100);const m=h.app.match;
  const receptions=[],give=m.giveBall.bind(m);
  m.giveBall=p=>{if(m.flight)receptions.push({id:p.id,team:p.team,target:m.flight.receiverId});return give(p);};
  let third=null;
  for(let f=0;f<hz*3;f++){
   if(f===0||f===hz||f===hz*2){
    if(f===hz*2){
     assert.equal(m.owner.id,3);
     assert.ok(m.groundPassBlocked(m.owner,m.bestPass(m.owner),true),'unfiltered ranking prefers a lane a moving defender can close');
     assert.ok(m.groundPassBlocked(m.owner,m.players[9]));
     assert.ok(!m.groundPassBlocked(m.owner,m.players[1]));
    }
    h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));
    if(f===hz*2)third=m.pendingKick.target.receiverId;
   }
   h.tick(100+(f+1)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;
   if(receptions.length===3)break;
  }
  assert.equal(third,1);assert.deepEqual(receptions.map(r=>r.id),[6,3,1]);
  assert.ok(receptions.every(r=>r.team===0&&r.id===r.target));
 }
});
test('ground-lane preference preserves legacy ranking fallback manual choice and capture geometry',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local',23),p=m.players[team*11+9],q=m.players[team*11+6],safe=m.players[team*11+5],o=m.players[(1-team)*11+6];
  const place=(p,x,y)=>{p.x=team?1100-x:x;p.y=team?636-y:y;};
  for(const a of m.players)place(a,a.team===team?1000:950,a.team===team?80:500);
  place(p,550,318);place(q,390,318);place(safe,650,200);place(o,470,318);m.giveBall(p);
  assert.equal(m.bestPass(p).id,q.id);assert.ok(m.groundPassBlocked(p,q));
  assert.equal(m.bestPass(p,true).id,safe.id);
  place(o,470,318+19.1);assert.ok(!m.groundPassBlocked(p,q));
  place(o,470,318+18.9);assert.ok(m.groundPassBlocked(p,q),'uses existing nineteen-unit ground capture radius');
  place(o,470,318);
  const other=m.players[(1-team)*11+7];place(other,600,259);
  assert.ok(m.groundPassBlocked(p,safe));assert.equal(m.bestPass(p,true).id,m.bestPass(p).id,'all-contested situation retains the prior ranking');
  assert.ok(m.kick(p,q,.6,false));assert.equal(m.pendingKick.target.receiverId,q.id,'manual choice is not vetoed');
 }
});
test('local F and K kickoff passes match solo ground-pass timing instead of unintended lofted overshoots',()=>{
 for(const hz of [60,120])for(const width of [333,887])for(const team of [0,1]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;
  // P2 uses the normal second-half transition from an explicit halftime fixture.
  if(team===1){m.phase='half';h.app.syncMatch();h.click('resume');}
  h.tick(100);h.window.handlers.keydown(keyEvent(team?'k':'f'));
  const target=m.pendingKick.target.receiverId;
  assert.equal(m.pendingKick.power,.6);assert.equal(m.pendingKick.loft,false);
  assert.equal(m.pendingKick.duration,.075);
  let received=false;
  for(let f=1;f<=hz;f++){
   h.tick(100+f*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;
   assert.equal(m.ball.z,0);
   if(m.owner?.id===target){received=true;break;}
  }
  assert.ok(received);assert.ok(Math.abs(m.elapsed-.36666666666666664)<1e-8);
  assert.equal(target,team*11+6);assert.equal(m.passes[team],1);
 }
 for(const team of [0,1]){
  const h=uiHarness(html);h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;
  m.stopForRestart({type:'Throw-in',team,x:550,y:FIELD.top});h.app.syncMatch();h.click('takeCorner');
  h.window.handlers.keydown(keyEvent(team?'k':'f'));assert.ok(m.pendingKick);advanceToContact(m);
  assert.equal(m.ball.z,30);assert.equal(m.ball.vz,121,'throw-in launch is unchanged by the pass-key correction');
 }
});
test('ordinary pointer choices keep directional intent while moving receivers are retargeted at contact',()=>{
 for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));while(frame<hz)tick();
  assert.equal(m.owner.id,6);const p=m.owner,r=m.players[3],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,r.id);
  const aimed={x:m.pendingKick.target.x,y:m.pendingKick.target.y},release=m.releaseKick.bind(m);let contact=null;
  m.releaseKick=k=>{const position={x:r.x,y:r.y},ok=release(k);if(ok)contact={position,target:{...m.flight.target}};return ok;};
  while(m.pendingKick)tick();
  assert.ok(contact);assert.deepEqual(contact.target,contact.position);assert.ok(distance(aimed,contact.target)>.5,'actual moving teammate is retargeted during wind-up');
  while(frame<hz*3&&m.owner?.id!==r.id)tick();
  assert.equal(m.owner.id,r.id,'receiver meets the moving delivery');
 }
});
test('manual pointer may choose a contested forward teammate without automatic-pass filtering',()=>{
 for(const hz of [60,120])for(const width of [333,887]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));while(frame<hz)tick();
  h.window.handlers.keydown(keyEvent('e'));while(frame<hz*2)tick();
  assert.equal(m.owner.id,3);assert.equal(m.bestPass(m.owner,true).id,1);
  const p=h.app.drawnPlayers.get(3),r=h.app.drawnPlayers.get(9),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,9);assert.equal(m.pendingKick.shot,false);
  assert.ok(m.pendingKick.power>=.7,'manual strength remains independently controlled');
  while(frame<hz*4&&!m.owner?.id)tick();
  while(frame<hz*4&&m.owner?.id!==9)tick();
  assert.equal(m.owner.id,9,'a sufficiently strong manual pass remains possible; lane preference is not a forced target');
 }
});
test('fresh repeated pass presses after actual reception are accepted without a settling-input lock',()=>{
 for(const local of [false,true])for(const hz of [60,120]){
  const h=uiHarness(html);h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();h.tick(100);const m=h.app.match;
  let lastPossession=-1,accepted=0,receptions=0;
  for(let f=0;f<hz*4;f++){
   if(m.owner?.team===0&&m.possessionSerial!==lastPossession&&!m.pendingKick&&m.bestPass(m.owner,true)){
    if(accepted)receptions++;
    lastPossession=m.possessionSerial;
    h.window.handlers.keydown(keyEvent(local?'f':'e'));h.window.handlers.keyup(keyEvent(local?'f':'e'));
    assert.ok(m.pendingKick,'a new press on a new possession must be actionable immediately');accepted++;
   }
   h.tick(100+(f+1)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;
   if(receptions>=3)break;
  }
  assert.ok(receptions>=2);assert.ok(accepted>=3);
 }
});

test('steady stance feet match traveled distance at walking and running speeds without changing movement',()=>{
 for(const hz of [30,60,120]){
  let previousCadence=0;
  for(const speed of [30,55,73.32,99.84,110.76]){
   const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.players[9];
   // Isolated steady-gait fixture, without AI, tackles or acceleration transients.
   p.x=550;p.y=318;p.angle=0;p.visualAngle=0;p.stride=0;p.gaitSpeed=speed;
   const start=p.x;let prior=null,checks=0;
   for(let i=0;i<hz;i++){
    m.move(p,p.x+100,p.y,speed/.78,1/hz);
    const q={...m.snapshot().players[p.id],speed,angle:0,strikePhase:'idle',strike:0,receive:0,save:0,tackle:0,fouled:0};
    const pose=h.app.playerPose(q,null),legs=h.app.playerSkeleton(q,pose).legs;
    const feet=legs.map(leg=>p.x+leg.ankle[1]*.6);
    if(prior)for(let j=0;j<2;j++)if(legs[j].stance&&prior.legs[j].stance&&legs[j].phase>prior.legs[j].phase){
     assert.ok(Math.abs(feet[j]-prior.feet[j])<1e-7,'planted stance must cancel body travel');checks++;
    }
    prior={legs,feet};
   }
   assert.ok(checks>2);assert.ok(Math.abs(p.x-start-speed)<1e-7,'animation must not alter displacement');
   const cadence=p.stride*h.app.GAIT_CYCLE_SCALE/(2*Math.PI);
   assert.ok(cadence>previousCadence,'walking cadence stays below running cadence');previousCadence=cadence;
  }
 }
});
test('ordinary directional play keeps stance drift small at 30 60 and 120 render Hz',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:887,height:597});
  h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  while(frame<hz&&m.owner?.id!==6)tick();assert.equal(m.owner.id,6);
  const previous=new Map(),stats={walk:{root:0,foot:0,n:0},run:{root:0,foot:0,n:0}};
  for(let i=0;i<hz*2;i++){
   if(i===0)h.window.handlers.keydown(keyEvent('d'));
   if(i===Math.round(hz*.8)){h.window.handlers.keyup(keyEvent('d'));h.window.handlers.keydown(keyEvent('w'));}
   if(i===Math.round(hz*1.2)){h.window.handlers.keyup(keyEvent('w'));h.window.handlers.keydown(keyEvent('a'));}
   if(i===Math.round(hz*1.6))h.window.handlers.keyup(keyEvent('a'));
   tick();
   for(const p of h.app.drawnPlayers.values()){
    const pose=h.app.playerPose(p,h.app.drawnBall),leg=h.app.playerSkeleton(p,pose).legs[0],v=leg.ankle[1]*.6;
    const foot={x:p.x+v*Math.cos(p.angle),y:p.y+v*Math.sin(p.angle)},old=previous.get(p.id);
    const delta=old?Math.atan2(Math.sin(p.angle-old.p.angle),Math.cos(p.angle-old.p.angle)):0;
    if(old&&leg.stance&&old.leg.stance&&leg.phase>old.leg.phase&&Math.abs(delta)<.005&&p.strikePhase==='idle'&&p.receive<.01&&p.save<.01&&p.tackle<.01&&p.fouled<.01&&Math.abs(p.speed-old.p.speed)<.25){
     const group=p.speed>105?'run':p.speed>40&&p.speed<85?'walk':null,travel=distance(p,old.p);
     if(group&&travel>.01){stats[group].root+=travel;stats[group].foot+=distance(foot,old.foot);stats[group].n++;}
    }
    previous.set(p.id,{p,leg,foot});
   }
  }
  assert.ok(stats.walk.n>40);assert.ok(stats.run.n>0);
  assert.ok(stats.walk.foot/stats.walk.root<.06,'slower players must not slide through most of their stance');
  assert.ok(stats.run.foot/stats.run.root<.01);
 }
});
test('ordinary held drag turns across pi and reverses without a long rotation or stale movement after cancellation',()=>{
 for(const hz of [30,60,120])for(const width of [333,887]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;
  let frame=0;const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  while(frame<hz&&m.owner?.id!==6)tick();const p=m.owner,start=h.app.camera.project(p.x,p.y),id=p.id;
  c.handlers.pointerdown(pointerEvent(h,start.x,start.y));
  const steer=(dx,dy)=>{const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x+dx*100,p.y+dy*100);c.handlers.pointermove(pointerEvent(h,start.x+b.x-a.x,start.y+b.y-a.y));};
  const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
  steer(-1,.02);for(let i=0;i<hz*.2;i++)tick();
  const beforeTurn=h.app.drawnPlayers.get(id).angle;
  steer(-1,-.02);for(let i=0;i<hz*.2;i++)tick();
  const afterTurn=h.app.drawnPlayers.get(id).angle;
  assert.ok(Math.abs(angleDelta(afterTurn,beforeTurn))<.12,'crossing pi takes the short route');
  steer(1,0);let angle=afterTurn;
  for(let i=0;i<hz*.2;i++){tick();const next=h.app.drawnPlayers.get(id).angle;assert.ok(Math.abs(angleDelta(next,angle))<1.5);angle=next;}
  assert.ok(Math.abs(angleDelta(angle,0))<.15,'sharp reversal settles toward the new heading');
  c.handlers.pointercancel(pointerEvent(h,start.x,start.y));
  const stopped={x:p.x,y:p.y},passes=m.passes[0];for(let i=0;i<Math.ceil(hz*.1);i++)tick();
  assert.equal(m.owner.id,id);assert.ok(distance(stopped,p)<1e-8);assert.equal(m.passes[0],passes);
 }
});
test('gait start stop and kick recovery stay continuous and bounded across speeds and cycle boundaries',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,p=m.owner;
 for(const speed of [0,1e-8,1,30,73.32,110,200]){
  const amplitude=h.app.gaitAmplitude(speed);assert.ok(Number.isFinite(amplitude)&&amplitude>=0&&amplitude<=1);
 }
 for(const speed of [30,73.32,110])for(const phase of [.32,1]){
  const sample=t=>{
   const q={...m.snapshot().players[p.id],id:0,speed,stride:t*Math.PI*2/h.app.GAIT_CYCLE_SCALE,strike:0,strikePhase:'idle',receive:0};
   return h.app.playerSkeleton(q,h.app.playerPose(q,null)).legs[0].ankle;
  };
  const a=sample(phase-1e-6),b=sample(phase+1e-6);
  assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<.002,'no ankle jump at stance or cycle wrap');
 }
 // Visual pose fixtures cover every follow-through recovery phase at walking/running speed.
 for(const speed of [30,73.32,110]){
  let prior=null;
  for(let i=0;i<=100;i++){
   const strike=.84+i*.0016,q={...m.snapshot().players[p.id],speed,stride:2,
    strike:strike<1?strike:0,strikePhase:strike<1?'follow':'idle',strikeId:strike<1?1:0,receive:0};
   const pose=h.app.playerPose(q,null),legs=h.app.playerSkeleton(q,pose).legs.map(l=>l.ankle);
   assert.ok(pose.footRun>=0&&pose.footRun<=1);
   if(prior)assert.ok(Math.max(...legs.map((l,j)=>Math.hypot(...l.map((v,k)=>v-prior[j][k]))))<.5);
   prior=legs;
  }
 }
});

test('ordinary shootout catch preserves the ongoing dive and recovers before the next attempt',()=>{
 for(const hz of [30,60,120])for(const width of [333,888]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('shootout');h.flush();h.tick(100);let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  const m=h.app.match,k=m.players[m.penalties.keeper];
  // Ordinary menu and keyboard inputs: no state, target or opponent-plan injection.
  const aimKey=width<500?'ArrowLeft':'ArrowRight';
  h.window.handlers.keydown(keyEvent(aimKey));for(let i=0;i<hz/3;i++)tick();
  h.window.handlers.keyup(keyEvent(aimKey));h.window.handlers.keydown(keyEvent(' '));
  let before;
  while(m.phase==='playing'&&frame<hz*5){before={at:k.saveAt,side:k.saveSide,pose:h.app.playerPose(m.snapshot().players[k.id],m.snapshot().ball).save};tick();}
  assert.equal(m.phase,'shootoutResult');assert.equal(m.penalties.history[0].outcome,'save');
  assert.ok(before.pose>.08);assert.equal(k.saveAt,before.at,'catch must not restart a dive');
  assert.equal(k.saveSide,before.side);assert.ok(h.app.playerPose(m.snapshot().players[k.id],m.snapshot().ball).save>before.pose);
  assert.equal(m.handOwner,k.id);assert.equal(m.owner.id,k.id);
  const frozen=JSON.stringify({snapshot:m.snapshot(),phaseTime:m.phaseTime,penalties:m.penalties});h.click('menuBtn');const elapsed=m.elapsed;for(let i=0;i<hz/5;i++)tick();
  assert.equal(m.elapsed,elapsed);h.click('resumePause');assert.ok(JSON.stringify({snapshot:m.snapshot(),phaseTime:m.phaseTime,penalties:m.penalties})===frozen,'pause freezes catch and recovery');
  while(m.phase==='shootoutResult'&&frame<hz*6)tick();
  assert.equal(m.phase,'penalties');assert.equal(m.snapshot().players[k.id].save,0);
  h.click('nextPenalty');assert.equal(m.penalties.turn,1);assert.equal(m.handOwner,null);
  for(const p of m.snapshot().players)assert.equal(p.save,0,'new attempt clears prior dive');
  h.click('menuBtn');h.click('restartMatch');h.flush();
  assert.equal(h.app.match.mode,'shootout');assert.equal(h.app.match.penalties.history.length,0);
  for(const p of h.app.match.snapshot().players)assert.equal(p.save,0);
 }
});
test('keeper catch pose is shared across match and shootout directions with expired dives starting fresh',()=>{
 for(const shootout of [false,true])for(const team of [0,1])for(const period of [1,2])for(const age of [.1,.4,.66,100]){
  // Direct contact fixtures isolate catch animation, not natural shot reachability.
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.period=period;m.kickoff(0);
  if(shootout){m.startShootout();if(team===0){m.penalties.stage='result';m.penalties.turn=1;m.prepareShootoutKick();}m.penalties.stage='flight';}
  const p=m.players[team*11];m.elapsed=2;p.saveAt=2-age;p.saveSide=-.7;
  Object.assign(m.ball,{owner:null,lastTouch:1-team,x:p.x+2,y:p.y+4,z:4,vx:0,vy:0});
  const prior=m.snapshot().players[p.id].save;m.receiveBall(p);
  assert.equal(m.owner.id,p.id);assert.equal(m.handOwner,p.id);
  if(age<=.65){assert.equal(p.saveAt,2-age);assert.equal(p.saveSide,-.7);assert.equal(m.snapshot().players[p.id].save,prior);}
  else{assert.equal(p.saveAt,2);assert.equal(m.snapshot().players[p.id].save,1);assert.ok(Number.isFinite(p.saveSide));}
 }
});
test('keeper recovery permits normal distribution after a caught ball and clears on restart',()=>{
 for(const local of [false,true])for(const team of local?[0,1]:[0])for(const hz of [30,60,120]){
  const h=uiHarness(html);h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();
  const m=h.app.match,k=m.players[team*11];m.elapsed=2;k.saveAt=1.8;k.saveSide=-.5;
  // Catch fixture followed by real pause and distribution key handlers.
  Object.assign(m.ball,{owner:null,lastTouch:1-team,x:k.x+2,y:k.y,z:0});m.receiveBall(k);
  const controls=local?{teams:[{dx:0,dy:0},{dx:0,dy:0}]}:{dx:0,dy:0};
  for(let i=0;i<hz*.7;i++)m.step(1/hz,controls);
  assert.equal(m.owner.id,k.id);assert.equal(m.snapshot().players[k.id].save,0);
  h.click('menuBtn');const elapsed=m.elapsed;for(let i=0;i<hz;i++)m.step(1/hz,controls);
  assert.equal(m.elapsed,elapsed);h.click('resumePause');
  h.window.handlers.keydown(keyEvent(local?(team===0?'f':'k'):'e'));
  assert.equal(m.pendingKick.player,k.id);advanceToContact(m);
  assert.equal(m.handOwner,null);assert.equal(m.ball.owner,null);assert.equal(m.passes[team],1);
  assert.ok(m.activeFor(team)!==k.id);
  h.click('menuBtn');h.click('restartMatch');h.flush();
  assert.equal(h.app.match.handOwner,null);for(const p of h.app.match.snapshot().players)assert.equal(p.save,0);
 }
});

test('ordinary saved shootout ball follows rendered gloves through recovery without moving the physics ball',()=>{
 const rules=new Function(engine+';return RULES;')();
 for(const hz of [30,60,120])for(const width of [333,888]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('shootout');h.flush();h.tick(100);let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  const m=h.app.match,key=width<500?'ArrowLeft':'ArrowRight';
  h.window.handlers.keydown(keyEvent(key));for(let i=0;i<hz/3;i++)tick();h.window.handlers.keyup(keyEvent(key));h.window.handlers.keydown(keyEvent(' '));
  while(m.phase==='playing'&&frame<hz*5)tick();
  assert.equal(m.penalties.history[0].outcome,'save');const physical={...m.ball};
  for(let i=0;i<Math.ceil(hz*.4);i++)tick();
  const p=h.app.drawnPlayers.get(m.handOwner),pose=h.app.playerPose(p,m.snapshot().ball);
  assert.equal(pose.hold,1);const world=h.app.playerWorldTransform(p,pose),hands=h.app.playerSkeleton(p,pose).arms.map(a=>world(a.hand));
  const b=h.app.drawnBall,centre=[b.x,b.y,b.z*rules.heightScale+rules.radius];
  assert.ok(Math.hypot(...centre.map((v,i)=>v-(hands[0][i]+hands[1][i])/2))<1e-8);
  assert.ok(centre[2]>8);assert.deepEqual(m.ball,physical);
  h.click('menuBtn');h.app.render();const frozen={...h.app.drawnBall};for(let i=0;i<hz/5;i++)tick();
  assert.deepEqual(h.app.drawnBall,frozen);h.click('resumePause');
  while(m.phase==='shootoutResult'&&frame<hz*6)tick();
  h.click('nextPenalty');h.app.render();assert.deepEqual(h.app.drawnBall,m.ball);
  h.click('menuBtn');h.click('restartMatch');h.flush();h.app.render();assert.deepEqual(h.app.drawnBall,h.app.match.ball);
 }
});
test('only genuine keeper hand possession attaches the visual ball and distribution returns to physical flight',()=>{
 for(const local of [false,true])for(const team of local?[0,1]:[0])for(const period of [1,2])for(const shot of [false,true]){
  const h=uiHarness(html);h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();const m=h.app.match;
  m.period=period;m.kickoff(team);const k=m.players[team*11];
  // Contact fixtures distinguish a teammate delivery, an opposition catch and a loose ball.
  Object.assign(m.ball,{owner:null,lastTouch:team,x:k.x+2,y:k.y,z:0});m.receiveBall(k);
  h.app.render();assert.equal(m.handOwner,null);assert.deepEqual(h.app.drawnBall,m.ball);
  Object.assign(m.ball,{owner:null,lastTouch:1-team,x:k.x+2,y:k.y,z:0});m.receiveBall(k);
  h.app.render();assert.deepEqual(h.app.drawnBall,m.ball,'contact starts at the original drawn position');
  const input=local?{teams:[{dx:0,dy:0},{dx:0,dy:0}]}:{dx:0,dy:0};
  for(let i=0;i<50;i++)m.step(1/60,input);h.app.render();assert.ok(h.app.drawnBall.z>10);assert.equal(m.ball.z,0);
  const state=JSON.stringify(m);h.app.render();assert.equal(JSON.stringify(m),state,'drawing cannot mutate simulation or history');
  h.window.handlers.keydown(keyEvent(local?(team===0?(shot?'g':'f'):(shot?'l':'k')):(shot?' ':'e')));
  assert.equal(m.pendingKick.player,k.id);let previous=Infinity,frames=0;
  while(m.pendingKick&&frames++<30){h.app.render();assert.ok(h.app.drawnBall.z<=previous+1e-8,'ball lowers into existing kick');previous=h.app.drawnBall.z;m.step(Math.min(1/120,m.pendingKick.remaining),input);}
  h.app.render();assert.equal(m.handOwner,null);assert.deepEqual(h.app.drawnBall,m.ball);assert.equal(shot?m.shots[team]:m.passes[team],1);
  const loose=m.snapshot();loose.players[k.id].holding=true;assert.equal(h.app.keeperHeldBall(loose),loose.ball,'stale keeper metadata cannot attach a loose ball');
  m.kickoff(team);h.app.render();assert.deepEqual(h.app.drawnBall,m.ball);
 }
});
test('recorded keeper holds replay at actual ownership boundaries and require no live hand-owner state',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,k=m.players[0];
 m.elapsed=2;Object.assign(m.ball,{owner:null,lastTouch:1,x:k.x+2,y:k.y,z:0});const before=m.snapshot();
 m.elapsed=2.02;m.receiveBall(k);m.elapsed=2.05;const caught=m.snapshot();
 for(const mix of [.1,.39,.41,.8,1]){
  const s=h.app.replaySample([before,caught],mix),p=s.players[k.id];
  assert.equal(!!p.holding,mix>=.4);assert.equal(s.ball.owner,mix>=.4?k.id:null);
  const v=h.app.keeperHeldBall(s);if(mix<.4)assert.equal(v,s.ball);else assert.ok(v.z>=s.ball.z);
 }
 m.elapsed=2.3;const held=m.snapshot();m.kick(k,m.bestPass(k,true),.6,false);const winding=m.snapshot();
 advanceToContact(m);const released=m.snapshot();
 for(const mix of [0,.1,.5,.9,1]){
  const s=h.app.replaySample([winding,released],mix);
  if(s.ball.owner===null)assert.equal(h.app.keeperHeldBall(s),s.ball);
 }
 m.kickoff(0);assert.equal(m.handOwner,null);
 const heldVisual=h.app.keeperHeldBall(held);assert.ok(heldVisual.z>10,'replay uses recorded possession rather than current match');
 h.app.render();assert.deepEqual(h.app.drawnBall,m.ball);
});
test('held-ball visual blends have bounded catch and kick endpoints in both camera orientations',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=h.app.match,k=m.players[0];
 Object.assign(m.ball,{owner:null,lastTouch:1,x:k.x+2,y:k.y,z:0});m.receiveBall(k);
 const source=m.snapshot();
 for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const save of [0,.2,.5,.8,1]){
  const sample=(receive,strike=0)=>{const s={...source,players:source.players.map(p=>p.id===k.id?{...p,angle,receive,save,strike,strikePhase:strike>0?'windup':'idle'}:p)};return h.app.keeperHeldBall(s);};
  const a=sample(1),b=sample(1-1e-5);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-5);
  const c=sample(0,.3-1e-5),d=sample(0,.3);assert.ok(Math.hypot(c.x-d.x,c.y-d.y,c.z-d.z)<1e-5);
  assert.deepEqual(d,source.ball);
 }
});

test('ordinary reversal into keyboard kick preserves the displayed pose while starting wind-up immediately',()=>{
 for(const hz of [30,60,120])for(const width of [333,888])for(const local of [false,true])for(const shot of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode(local?'multi':'practice');if(local)h.click('startLocal');h.flush();h.tick(100);const m=h.app.match;let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent(local?'f':'e'));while(frame<hz&&m.owner?.id!==6)tick();assert.equal(m.owner.id,6);
  const p=m.owner;
  h.window.handlers.keydown(keyEvent('d'));for(let i=0;i<hz*.2;i++)tick();
  h.window.handlers.keyup(keyEvent('d'));h.window.handlers.keydown(keyEvent('a'));tick();
  const before=h.app.drawnPlayers.get(p.id),ball={...h.app.drawnBall},pose=h.app.playerPose(before,ball),legs=h.app.playerSkeleton(before,pose).legs;
  const at=m.elapsed,count=m.strikeSequence;
  h.window.handlers.keydown(keyEvent(local?(shot?'g':'f'):(shot?' ':'e')));h.app.render(0);
  const after=h.app.drawnPlayers.get(p.id),next=h.app.playerSkeleton(after,h.app.playerPose(after,h.app.drawnBall)).legs;
  assert.equal(m.elapsed,at);assert.equal(after.strikePhase,'windup');assert.equal(after.strikeId,count+1);
  assert.ok(distance(before,after)<1e-8);assert.ok(Math.abs(after.angle-before.angle)<1e-8);
  assert.deepEqual(next.map(l=>l.ankle),legs.map(l=>l.ankle));assert.deepEqual(h.app.drawnBall,ball);
  h.window.handlers.keyup(keyEvent('a'));const duration=m.pendingKick.duration;
  h.window.handlers.keydown({...keyEvent(local?(shot?'g':'f'):(shot?' ':'e')),repeat:true});
  while(m.pendingKick&&m.elapsed-at<.3)tick();
  assert.ok(!m.pendingKick);assert.equal(m.strikeSequence,count+1);assert.ok(Math.abs(p.kickAt-at-duration)<1e-7);
  assert.equal(m.ball.owner,null);assert.equal(h.app.drawnPlayers.get(p.id).strikePhase,'follow');
 }
});
test('ordinary held-pointer reversal release keeps initial kick pose and cancelled turns do not kick',()=>{
 for(const hz of [30,60,120])for(const width of [333,888]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  while(frame<hz&&m.owner?.id!==6)tick();const p=m.owner,start=h.app.camera.project(p.x,p.y);
  c.handlers.pointerdown(pointerEvent(h,start.x,start.y));
  c.handlers.pointermove(pointerEvent(h,start.x+100,start.y));for(let i=0;i<hz*.2;i++)tick();
  c.handlers.pointermove(pointerEvent(h,start.x-100,start.y));tick();
  const before=h.app.drawnPlayers.get(p.id),ball={...h.app.drawnBall},legs=h.app.playerSkeleton(before,h.app.playerPose(before,ball)).legs;
  c.handlers.pointerup(pointerEvent(h,start.x-100,start.y));assert.ok(m.pendingKick);h.app.render(0);
  const after=h.app.drawnPlayers.get(p.id),next=h.app.playerSkeleton(after,h.app.playerPose(after,h.app.drawnBall)).legs;
  assert.ok(distance(before,after)<1e-8);assert.ok(Math.abs(after.angle-before.angle)<1e-8);
  assert.deepEqual(next.map(l=>l.ankle),legs.map(l=>l.ankle));assert.deepEqual(h.app.drawnBall,ball);
  const count=m.strikeSequence;while(m.pendingKick)tick();assert.equal(m.strikeSequence,count);
  h.click('menuBtn');h.click('restartMatch');h.flush();h.tick(2000);
  const n=h.app.match,a=h.app.camera.project(n.owner.x,n.owner.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,a.x+100,a.y));
  c.handlers.pointercancel(pointerEvent(h,a.x+100,a.y));c.handlers.pointerup(pointerEvent(h,a.x+100,a.y));
  assert.equal(n.pendingKick,null);assert.deepEqual(h.app.input(),{dx:0,dy:0});
 }
});
test('second-half local P2 kick preserves the pose and interruption invalidates stale buffered actions',()=>{
 for(const hz of [30,60,120])for(const width of [333,888]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;
  // Halftime fixture; all subsequent movement, kicking and pausing use normal handlers.
  m.phase='half';m.resumeHalf();h.app.syncMatch();h.tick(100);let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  const receiver=m.bestPass(m.owner,true).id;h.window.handlers.keydown(keyEvent('k'));
  while(frame<hz&&m.owner?.id!==receiver)tick();assert.equal(m.owner.id,receiver);
  const p=m.owner;h.window.handlers.keydown(keyEvent('ArrowRight'));for(let i=0;i<hz*.2;i++)tick();
  h.window.handlers.keyup(keyEvent('ArrowRight'));h.window.handlers.keydown(keyEvent('ArrowLeft'));tick();
  const before=h.app.drawnPlayers.get(p.id);h.window.handlers.keydown(keyEvent('k'));h.app.render();
  const after=h.app.drawnPlayers.get(p.id);assert.ok(distance(before,after)<1e-8);assert.ok(Math.abs(before.angle-after.angle)<1e-8);
  const at=m.elapsed,kick=m.pendingKick.id;h.click('menuBtn');tick();assert.equal(m.elapsed,at);h.click('resumePause');
  assert.equal(m.pendingKick.id,kick);assert.deepEqual(h.app.input(),{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  // Possession/position fixtures must still invalidate a cached interval, even at kick start.
  m.giveBall(m.players[6]);const stolen=m.snapshot();assert.equal(h.app.liveRenderSample(stolen),stolen);h.app.render();
  assert.equal(m.pendingKick,null);assert.ok(h.app.drawnPlayers.get(p.id).strikePhase!=='windup');
  m.kickoff(1);const reset=m.snapshot();assert.equal(h.app.liveRenderSample(reset),reset);
 }
});
test('a 120 Hz frame-harness callback after reversal kick input retains the half-tick facing interval',()=>{
 const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:888,height:596});
 h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;let frame=0;
 const tick=()=>{h.tick(100+(++frame)*1000/120);h.draws.length=0;h.app.drawnPaths.length=0;};
 while(frame<120&&m.owner?.id!==6)tick();const p=m.owner;
 h.window.handlers.keydown(keyEvent('d'));for(let i=0;i<24;i++)tick();
 h.window.handlers.keyup(keyEvent('d'));h.window.handlers.keydown(keyEvent('a'));tick();tick();
 const before=h.app.drawnPlayers.get(p.id),author=m.snapshot().players[p.id],at=m.elapsed;
 h.window.handlers.keydown(keyEvent('e'));tick();
 const after=h.app.drawnPlayers.get(p.id),delta=Math.atan2(Math.sin(author.angle-before.angle),Math.cos(author.angle-before.angle));
 assert.ok(Math.abs(delta)>.7,'ordinary reversal exposes a meaningful buffered heading difference');
 assert.equal(m.elapsed,at,'this display callback falls between fixed simulation ticks');
 assert.equal(after.strikePhase,'windup');assert.equal(after.strike,0,'input is accepted without advancing physics');
 assert.ok(Math.abs(after.angle-(before.angle+delta*.5))<1e-7,'do not snap all the way to the authoritative facing');
 assert.ok(distance(after,{x:(before.x+author.x)/2,y:(before.y+author.y)/2})<1e-7);
});

test('ordinary outfield dribble reversals keep the displayed ball outside the carrier at every render rate',()=>{
 for(const hz of [30,60,120])for(const width of [333,888])for(const pointer of [false,true]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:596});
  h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  while(frame<hz&&m.owner?.id!==6)tick();assert.equal(m.owner.id,6);
  const p=m.owner,start=h.app.camera.project(p.x,p.y);
  if(pointer){c.handlers.pointerdown(pointerEvent(h,start.x,start.y));c.handlers.pointermove(pointerEvent(h,start.x+100,start.y));}
  else h.window.handlers.keydown(keyEvent('d'));
  for(let i=0;i<hz*.25;i++)tick();
  if(pointer)c.handlers.pointermove(pointerEvent(h,start.x-100,start.y));
  else{h.window.handlers.keyup(keyEvent('d'));h.window.handlers.keydown(keyEvent('a'));}
  for(let i=0;i<Math.ceil(hz*.15);i++){
   tick();assert.equal(m.owner.id,p.id);assert.ok(Math.abs(distance(m.ball,p)-10)<1e-7);
   const drawn=h.app.drawnPlayers.get(p.id);assert.ok(Math.abs(distance(h.app.drawnBall,drawn)-10)<1e-7,'interpolation must not cut the dribble through the body');
  }
  if(pointer)c.handlers.pointercancel(pointerEvent(h,start.x-100,start.y));else h.window.handlers.keyup(keyEvent('a'));
  const count=m.strikeSequence;h.window.handlers.keydown(keyEvent('e'));assert.ok(m.pendingKick);
  while(m.pendingKick)tick();assert.equal(m.strikeSequence,count+1);assert.equal(m.ball.owner,null);
  const frozen=JSON.stringify(m);h.app.render(0);assert.equal(JSON.stringify(m),frozen);
  h.click('menuBtn');h.click('restartMatch');h.flush();h.app.render();assert.deepEqual(h.app.drawnBall,h.app.match.ball);
 }
});
test('dribble arcs preserve endpoints and exclude free flight first touches catches restarts and discontinuities',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const raw=h.app.match.snapshot();
 const a={...raw,players:raw.players.map(p=>({...p})),ball:{...raw.ball}};
 const owner=a.players[a.ball.owner];Object.assign(owner,{x:500,y:318,keeper:false,holding:false,throwing:false,receive:0,angle:0});
 Object.assign(a.ball,{x:510,y:318,z:0});
 const b=JSON.parse(JSON.stringify(a));b.at=a.at+1/60;b.players[owner.id].x=502;b.players[owner.id].angle=.8;Object.assign(b.ball,{x:492,y:318});
 const mid={...b.ball,x:501,y:318},before=JSON.stringify([a,b,mid]);
 const arc=h.app.interpolateDribbleBall(a,b,.5,mid);
 assert.ok(Math.abs(distance(arc,{x:501,y:318})-10)<1e-8);assert.ok(arc.y>327);
 assert.equal(h.app.interpolateDribbleBall(a,b,0,a.ball),a.ball);assert.equal(h.app.interpolateDribbleBall(a,b,1,b.ball),b.ball);
 assert.equal(JSON.stringify([a,b,mid]),before);
 for(const kind of ['loose','turnover','keeper','catch','receiving','throw','air','restart','teleport','changing-radius']){
  const x=JSON.parse(JSON.stringify(a)),y=JSON.parse(JSON.stringify(b)),p=x.players[owner.id],q=y.players[owner.id];
  if(kind==='loose')x.ball.owner=y.ball.owner=null;
  if(kind==='turnover')y.ball.owner=owner.id+1;
  if(kind==='keeper')p.keeper=q.keeper=true;
  if(kind==='catch')q.holding=true;
  if(kind==='receiving')q.receive=.5;
  if(kind==='throw')q.throwing=true;
  if(kind==='air')y.ball.z=5;
  if(kind==='restart'){x.ball.x=p.x;x.ball.y=p.y;}
  if(kind==='teleport'){q.x+=100;y.ball.x+=100;}
  if(kind==='changing-radius')y.ball.x-=3;
  assert.equal(h.app.interpolateDribbleBall(x,y,.5,mid),mid,kind+' must retain its existing interpolation');
 }
 for(const theta of [Math.PI-.01,-Math.PI+.01,Math.PI/2,-Math.PI/2]){
  const x=JSON.parse(JSON.stringify(a)),y=JSON.parse(JSON.stringify(b));
  Object.assign(y.ball,{x:502+10*Math.cos(theta),y:318+10*Math.sin(theta)});
  for(const mix of [.01,.25,.5,.75,.99]){
   const linear={...y.ball,x:x.ball.x+(y.ball.x-x.ball.x)*mix,y:x.ball.y+(y.ball.y-x.ball.y)*mix};
   const v=h.app.interpolateDribbleBall(x,y,mix,linear);
   assert.ok(Math.abs(distance(v,{x:500+2*mix,y:318})-10)<1e-7);assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));
  }
 }
});
test('recorded dribble turns paint an arc in replay without changing the camera sample or later kickoffs',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('e'));const m=h.app.match;let frame=0;
 const tick=()=>{h.tick(100+(++frame)*1000/120);h.draws.length=0;h.app.drawnPaths.length=0;};
 while(frame<120&&m.owner?.id!==6)tick();const id=m.owner.id;
 h.window.handlers.keydown(keyEvent('d'));for(let i=0;i<30;i++)tick();
 h.window.handlers.keyup(keyEvent('d'));h.window.handlers.keydown(keyEvent('a'));for(let i=0;i<18;i++)tick();h.window.handlers.keyup(keyEvent('a'));
 let pair=null;
 for(let i=1;i<m.history.length;i++){
  const a=m.history[i-1],b=m.history[i],p=a.players[id],q=b.players[id];
  if(a.ball.owner===id&&b.ball.owner===id&&!p.receive&&!q.receive&&(a.ball.x-p.x)*(b.ball.x-q.x)+(a.ball.y-p.y)*(b.ball.y-q.y)<-90){pair=[a,b];break;}
 }
 assert.ok(pair,'ordinary movement recorded a reversal');
 const sample=h.app.replaySample(pair,.5),raw=JSON.stringify(sample),p=sample.players[id];
 assert.ok(distance(sample.ball,p)<1,'camera sample retains the original linear interpolation');
 const drawn=h.app.replayDribbleBall(pair,.5,sample.ball);assert.ok(Math.abs(distance(drawn,p)-10)<1e-7);
 assert.equal(JSON.stringify(sample),raw);
 // Replay-entry fixture uses snapshots obtained from ordinary input above.
 m.replayFrames=pair;m.phase='replay';m.replayTime=2;m.scorer=0;h.app.render();
 assert.ok(Math.abs(distance(h.app.drawnBall,h.app.drawnPlayers.get(id))-10)<1e-7);
 m.skipReplay();h.app.syncMatch();h.app.render();assert.deepEqual(h.app.drawnBall,m.ball);assert.equal(m.setPiece,'Kick-off');
});

test('Escape auto-repeat cannot resume a paused match or re-pause a fresh resume',()=>{
 for(const mode of ['practice','multi','shootout']){
  const h=uiHarness(html);h.chooseMode(mode);if(mode==='multi')h.click('startLocal');h.flush();h.tick(100);const m=h.app.match;
  h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowLeft'));
  h.window.handlers.keydown(keyEvent('Escape'));assert.equal(m.phase,'paused');
  const snapshot=JSON.stringify(m.snapshot()),at=m.elapsed;
  for(let i=0;i<12;i++){h.window.handlers.keydown(keyEvent('Escape',true));h.tick(150+i*35);assert.equal(m.phase,'paused');assert.equal(m.elapsed,at);assert.equal(JSON.stringify(m.snapshot()),snapshot);}
  h.window.handlers.keyup(keyEvent('Escape'));h.window.handlers.keydown(keyEvent('Escape'));assert.equal(m.phase,'playing');
  for(let i=0;i<3;i++){h.window.handlers.keydown(keyEvent('Escape',true));assert.equal(m.phase,'playing');}
  const input=h.app.input();if(mode==='multi')assert.deepEqual(input,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});else{assert.equal(input.dx,0);assert.equal(input.dy,0);}
  h.window.handlers.keyup(keyEvent('Escape'));h.window.handlers.keydown(keyEvent('Escape'));assert.equal(m.phase,'paused');
 }
});
test('resume before a background frame gap preserves pending contact and starts time from the new baseline',()=>{
 for(const mode of ['practice','multi','shootout'])for(const hz of [30,60,120])for(const reason of ['blur','hidden']){
  const h=uiHarness(html);h.chooseMode(mode);if(mode==='multi')h.click('startLocal');h.flush();h.tick(100);const m=h.app.match;
  h.window.handlers.keydown(keyEvent(mode==='multi'?'f':mode==='shootout'?' ':'e'));h.tick(150);
  assert.ok(m.pendingKick);const remaining=m.pendingKick.remaining,id=m.pendingKick.player;
  if(reason==='blur')h.window.handlers.blur();else{h.document.hidden=true;h.document.handlers.visibilitychange();}
  assert.equal(m.phase,'paused');const snapshot=JSON.stringify(m.snapshot()),at=m.elapsed,minute=m.minute,count=m.strikeSequence;
  // No callbacks during tab suspension; the resume event arrives before the first returning RAF.
  h.document.hidden=false;h.click('resumePause');h.tick(10150);
  assert.equal(m.elapsed,at);assert.equal(m.minute,minute);assert.equal(m.pendingKick.remaining,remaining);assert.equal(m.strikeSequence,count);
  assert.equal(JSON.stringify(m.snapshot()),snapshot);assert.deepEqual(h.app.drawnBall,m.ball);
  for(let i=1;i<=Math.ceil(hz*.2)&&m.pendingKick;i++)h.tick(10150+i*1000/hz);
  assert.equal(m.pendingKick,null);assert.ok(Math.abs(m.players[id].kickAt-at-remaining)<1e-7,'the committed kick uses its remaining active-play time');
  assert.equal(m.strikeSequence,count);
 }
});
test('late pointer release after focus loss and Escape repeats cannot revive an abandoned charge',()=>{
 for(const mode of ['practice','shootout']){
  const h=uiHarness(html),c=h.elements.get('game');h.chooseMode(mode);h.flush();h.tick(100);const m=h.app.match;
  const p=m.owner,a=h.app.camera.project(p.x,p.y),target=mode==='shootout'?{x:m.penalties.goal,y:FIELD.cy+25}:m.bestPass(p);
  const b=h.app.camera.project(target.x,target.y),up=pointerEvent(h,b.x,b.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(up);h.window.handlers.keydown(keyEvent('w'));h.tick(120);
  h.window.handlers.blur();assert.equal(h.app.drag,null);assert.equal(c.capture,null);
  for(let i=0;i<4;i++)h.window.handlers.keydown(keyEvent('Escape',true));assert.equal(m.phase,'paused');
  const at=m.elapsed;h.click('resumePause');h.tick(10120);c.handlers.pointerup(up);h.window.handlers.keyup(keyEvent('w'));
  assert.equal(m.elapsed,at);assert.equal(m.pendingKick,null);assert.equal(h.app.drag,null);
  const q=m.owner,start=h.app.camera.project(q.x,q.y),end=h.app.camera.project(target.x,target.y);
  c.handlers.pointerdown(pointerEvent(h,start.x,start.y));c.handlers.pointermove(pointerEvent(h,end.x,end.y));c.handlers.pointerup(pointerEvent(h,end.x,end.y));
  assert.ok(m.pendingKick);const id=m.pendingKick.id;advanceToContact(m);assert.equal(m.strikeSequence,id);assert.equal(m.ball.owner,null);
 }
});
test('overlapping local movement keys remain independent after interrupted pause and delayed keyups',()=>{
 const h=uiHarness(html);h.chooseMode('multi');h.click('startLocal');h.flush();h.tick(100);
 h.window.handlers.keydown(keyEvent('w'));h.window.handlers.keydown(keyEvent('ArrowLeft'));
 let input=h.app.input();assert.ok(Math.hypot(input.teams[0].dx,input.teams[0].dy)>.99);assert.ok(Math.hypot(input.teams[1].dx,input.teams[1].dy)>.99);
 h.window.handlers.keydown(keyEvent('s'));input=h.app.input();assert.deepEqual(input.teams[0],{dx:0,dy:0});assert.ok(Math.hypot(input.teams[1].dx,input.teams[1].dy)>.99);
 h.window.handlers.blur();for(let i=0;i<3;i++)h.window.handlers.keydown(keyEvent('Escape',true));assert.equal(h.app.match.phase,'paused');
 h.click('resumePause');h.tick(10100);h.window.handlers.keyup(keyEvent('w'));h.window.handlers.keyup(keyEvent('ArrowLeft'));
 assert.deepEqual(h.app.input(),{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
 h.window.handlers.keydown(keyEvent('ArrowLeft'));input=h.app.input();assert.deepEqual(input.teams[0],{dx:0,dy:0});assert.ok(Math.hypot(input.teams[1].dx,input.teams[1].dy)>.99);
 h.window.handlers.keyup(keyEvent('ArrowLeft'));assert.deepEqual(h.app.input(),{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
});

function ballDepthHarness(src=html,width=1180){
 const instrumented=src.replace('function drawPlayer(p,marker,ball){','function drawPlayer(p,marker,ball){ctx.__depthPlayer(p.id);')
  .replace('function drawBall(b){','function drawBall(b){ctx.__depthBall();')
  .replace('function drawBallShadow(b){','function drawBallShadow(b){ctx.__depthShadow();')
  .replace('function goal(side){','function goal(side){ctx.__depthGoal(side);');
 const h=uiHarness(instrumented);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height:757});
 return h;
}
function ballShadowTrace(h){
 const marker=h.draws.findIndex(d=>d.method==='__depthShadow'),ball=h.draws.findIndex(d=>d.method==='__depthBall');
 const start=marker>=0?marker:ball,index=h.draws.findIndex((d,i)=>i>start&&d.method==='ellipse');
 return {index,ellipse:h.draws[index],ball,players:h.draws.map((d,i)=>({d,i})).filter(x=>x.d.method==='__depthPlayer'),goals:h.draws.map((d,i)=>({d,i})).filter(x=>x.d.method==='__depthGoal')};
}
test('ordinary lofted kickoff renders its ground shadow beneath players goals and the ball',()=>{
 for(const hz of [30,60,120])for(const width of [333,1180]){
  const h=ballDepthHarness(html,width);h.chooseMode('multi');h.click('startLocal');h.flush();h.tick(100);
  h.window.handlers.keydown(keyEvent('g'));let maxHeight=0,airFrames=0;
  for(let frame=1;frame<=Math.ceil(hz*.7);frame++){
   h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+frame*1000/hz);
   const b=h.app.drawnBall;maxHeight=Math.max(maxHeight,b.z);
   if(b.z<2)continue;airFrames++;
   const trace=ballShadowTrace(h);assert.ok(trace.index>=0&&trace.ball>trace.index);
   assert.ok(trace.players.every(x=>x.i>trace.index),'ground ellipse must not paint over raised players');
   assert.ok(trace.goals.every(x=>x.i>trace.index),'ground ellipse must not paint over goal structures');
   assert.equal(h.draws.filter(d=>d.method==='__depthShadow').length,1);
  }
  assert.ok(maxHeight>45&&airFrames>hz*.3,'normal kickoff G produces a genuine lofted flight');
 }
});
test('ordinary lofted ball shadow overlaps a boot in projection but remains behind its mesh',()=>{
 const h=ballDepthHarness();h.chooseMode('multi');h.click('startLocal');h.flush();h.tick(100);h.window.handlers.keydown(keyEvent('g'));
 for(let frame=1;frame<=22;frame++){h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+frame*1000/60);}
 const b=h.app.drawnBall,trace=ballShadowTrace(h),p=h.app.drawnPlayers.get(17);
 assert.ok(b.z>40);assert.ok(trace.players.find(x=>x.d.args[0]===p.id).i>trace.index);
 const [cx,cy,rx,ry]=trace.ellipse.args,points=Array.from({length:9},(_,i)=>i===0?{x:cx,y:cy}:{x:cx+rx*.8*Math.cos(i*Math.PI/4),y:cy+ry*.8*Math.sin(i*Math.PI/4)});
 const inside=(point,poly)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];if((a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
 }return yes;};
 const angle=(h.app.camera.portrait?Math.PI/2:0)+h.app.camera.yaw,eye=[Math.sin(angle),Math.cos(angle),h.app.camera.tilt];
 const hit=h.app.playerMesh(p,h.app.playerPose(p,b)).find(f=>f.centre[2]>1&&f.normal.reduce((s,v,i)=>s+v*eye[i],0)>.015&&points.some(q=>inside(q,f.points.map(v=>h.app.camera.project(...v)))));
 assert.ok(hit,'actual drawn shadow footprint overlaps the projected raised boot');
});
test('ball ground shadow stays below goal structures in live replay pause and reset views',()=>{
 for(const width of [333,1180])for(const end of [FIELD.left,FIELD.right])for(const height of [0,20,55]){
  const h=ballDepthHarness(html,width);h.chooseMode('practice');h.flush();const m=h.app.match;
  // Explicit geometry fixture near each goal; no claim of naturally reaching these camera views.
  Object.assign(m.ball,{owner:null,x:end+(end===FIELD.left?20:-20),y:FIELD.cy,z:height,vx:100,vy:0,vz:0});
  const check=()=>{
   h.draws.length=0;h.app.render(0);const trace=ballShadowTrace(h);
   assert.ok(trace.index>=0&&trace.players.length===22&&trace.goals.length===2);
   assert.ok([...trace.players,...trace.goals].every(x=>x.i>trace.index));
   assert.equal(h.draws.filter(d=>d.method==='__depthShadow').length,1);
  };
  check();const before=JSON.stringify(m);check();assert.equal(JSON.stringify(m),before);
  h.click('menuBtn');check();h.click('resumePause');check();
  m.scorer=end===FIELD.left?0:1;m.replayFrames=[m.snapshot(),m.snapshot()];m.replayTime=1;m.phase='replay';check();
  m.skipReplay();h.app.syncMatch();check();assert.equal(m.setPiece,'Kick-off');
  h.click('menuBtn');h.click('restartMatch');h.flush();check();
 }
});

function celebrationGoalFixture(h,team=0,ownGoal=false){
 const m=h.app.match;m.giveBall(m.players[(ownGoal?1-team:team)*11+9]);
 const side=m.goalX(team),d=side===FIELD.left?-1:1;
 m.lastRestart=null;m.offside=null;m.advantage=null;
 Object.assign(m.ball,{owner:null,x:side+d*5,y:FIELD.cy,z:0,vx:d*200,vy:0});
 assert.equal(m.checkBoundary({x:side-d*5,y:FIELD.cy,z:0}),true);
 assert.equal(m.phase,'goal');assert.equal(m.scorer,team);return m;
}
test('goal acknowledgement raises credited outfield arms without celebrating own-goal defenders or keepers',()=>{
 for(const mode of ['practice','local'])for(const team of [0,1])for(const ownGoal of [false,true]){
  const h=uiHarness(html);h.chooseMode(mode==='local'?'multi':'practice');if(mode==='local')h.click('startLocal');h.flush();
  const m=celebrationGoalFixture(h,team,ownGoal),record=JSON.stringify(m.replayFrames);
  const start=m.snapshot();assert.equal(h.app.goalCelebrationFrame(start,m),start);
  m.phaseTime=.6;const steady=JSON.stringify(m);h.app.render(0);
  assert.equal(JSON.stringify(m),steady,'render never mutates match state');
  for(const p of m.snapshot().players){
   const painted=h.app.drawnPlayers.get(p.id),eligible=p.team===team&&!p.keeper;
   assert.equal(painted.celebration||0,eligible?1:0);
   const posed=h.app.playerPose(painted,m.ball),s=h.app.playerSkeleton(painted,posed),plain=h.app.playerSkeleton(p,h.app.playerPose(p,m.ball));
   if(eligible){assert.ok(s.arms.every(a=>a.hand[2]>36&&a.elbow[2]>a.shoulder[2]),'two raised arms above head');
    assert.ok(JSON.stringify(h.app.playerMesh(painted,posed))!==JSON.stringify(h.app.playerMesh(p,h.app.playerPose(p,m.ball))),'actual rendered mesh changes');
   }else assert.deepEqual(s,plain,'opponent and keeper geometry unchanged');
  }
  assert.equal(JSON.stringify(m.replayFrames),record);
  assert.ok(!JSON.stringify(m.snapshot()).includes('celebration'));
  m.phaseTime=0;assert.equal(h.app.goalCelebrationFrame(start,m),start,'settles back before replay');
 }
});
test('goal acknowledgement blends smoothly within the existing stoppage at 30 60 and 120 Hz',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();const m=celebrationGoalFixture(h);
  let prior=0,maxDelta=0,count=0,peak=0;
  while(m.phase==='goal'&&count<hz*2){
   const p=h.app.goalCelebrationFrame(m.snapshot(),m).players[9],c=p.celebration||0;
   maxDelta=Math.max(maxDelta,Math.abs(c-prior));peak=Math.max(peak,c);prior=c;
   m.step(1/hz);count++;
  }
  assert.equal(m.phase,'replay');assert.ok(Math.abs(count/hz-1.15)<=1/hz+1e-8);
  assert.equal(peak,1);assert.ok(maxDelta<=1.51/(hz*.25),'bounded smooth pose ramp');
  assert.ok(prior<=.05,'arms already settle at replay boundary');
  assert.equal(m.score[0],1);
 }
});
test('goal poses never enter replay recordings or leak into replay kickoff pause and reset',()=>{
 const h=uiHarness(html);h.chooseMode('multi');h.click('startLocal');h.flush();let m=celebrationGoalFixture(h,1);
 m.phaseTime=.6;h.app.render(0);assert.equal(h.app.drawnPlayers.get(20).celebration,1);
 m.step(.7);assert.equal(m.phase,'replay');h.app.render(0);
 assert.ok([...h.app.drawnPlayers.values()].every(p=>!p.celebration));
 for(const t of [0,.5,.999])assert.ok(h.app.replaySample(m.replayFrames,t).players.every(p=>!p.celebration));
 m.skipReplay();h.app.syncMatch();h.app.render(0);
 assert.equal(m.setPiece,'Kick-off');assert.ok([...h.app.drawnPlayers.values()].every(p=>!p.celebration));
 h.click('menuBtn');assert.equal(m.phase,'paused');h.app.render(0);
 assert.ok([...h.app.drawnPlayers.values()].every(p=>!p.celebration));
 h.click('resumePause');assert.equal(m.phase,'playing');
 m=celebrationGoalFixture(h,0);m.phaseTime=.6;h.app.render(0);
 h.click('restartMatch');h.flush();h.app.render(0);
 assert.deepEqual(h.app.match.score,[0,0]);assert.ok([...h.app.drawnPlayers.values()].every(p=>!p.celebration));
});
test('goal mesh and projected raised arms remain finite in desktop and narrow portrait',()=>{
 for(const [width,height] of [[1180,757],[333,596]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('practice');h.flush();const m=celebrationGoalFixture(h);m.phaseTime=.6;h.app.render(0);
  const p=h.app.drawnPlayers.get(9),pose=h.app.playerPose(p,m.ball),world=h.app.playerWorldTransform(p,pose);
  for(const a of h.app.playerSkeleton(p,pose).arms){
   const hand=h.app.camera.project(...world(a.hand)),shoulder=h.app.camera.project(...world(a.shoulder));
   assert.ok(Number.isFinite(hand.x)&&Number.isFinite(hand.y));assert.ok(hand.y<shoulder.y,'raised gesture projects above shoulder');
  }
 }
});

test('ordinary local kickoff save can wait for observation then distribute without an AI charging foul',()=>{
 for(const [hz,width,height] of [[30,1180,757],[60,1180,757],[120,1180,757],[60,333,596]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;
  h.tick(100);h.window.handlers.keydown(keyEvent('g'));h.window.handlers.keyup(keyEvent('g'));
  let caught=false,minGap=Infinity;
  for(let f=1;f<=hz*8;f++){
   if(f===Math.round(hz*6.5)){h.window.handlers.keydown(keyEvent('k'));h.window.handlers.keyup(keyEvent('k'));}
   h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+f*1000/hz);
   if(m.handOwner===11){caught=true;minGap=Math.min(minGap,...m.players.filter(p=>p.team===0).map(p=>distance(p,m.owner)));}
   assert.equal(m.phase,'playing','idle inputs must not produce a charging stoppage');
  }
  assert.ok(caught);assert.ok(minGap>=39,'automatic press stays clear of the holding keeper');
  assert.deepEqual(m.fouls,[0,0]);assert.equal(m.passes[1],1);assert.equal(m.handOwner,null);
  assert.equal(m.owner?.team,1,'keeper distribution reaches an actual teammate');assert.ok(!m.owner.keeper);
  h.click('menuBtn');const at=m.elapsed;h.tick(100+hz*8*1000/hz+400);assert.equal(m.elapsed,at);
  h.click('resumePause');h.click('menuBtn');h.click('restartMatch');h.flush();
  assert.deepEqual(h.app.match.fouls,[0,0]);assert.equal(h.app.match.handOwner,null);assert.equal(h.app.match.setPiece,'Kick-off');
 }
});
function heldKeeperSpacingFixture(team=1,period=1,mode='local',manual=false){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);m.period=period;m.kickoff(team);
 for(const p of m.players){p.x=450+p.team*150;p.y=90+p.slot*16;p.cooldown=0;}
 const k=m.players[team*11],p=m.players[(1-team)*11+10],d=m.direction(team);
 k.x=m.ownGoalX(team)+d*18;k.y=FIELD.cy;k.angle=d>0?0:Math.PI;
 p.x=k.x+d*45;p.y=k.y;
 m.giveBall(k);m.ball.lastTouch=1-team;m.receiveBall(k);
 m.active=(team===0?k.id:manual?p.id:9);m.activeAway=(team===1?k.id:manual?p.id:20);
 const control=mode==='local'?{teams:[{dx:0,dy:0},{dx:0,dy:0}]}:{dx:0,dy:0};
 if(manual){if(mode==='local')control.teams[1-team]={dx:-d,dy:0};else control.dx=-d;}
 return {m,k,p,d,control};
}
test('AI gives hands-held keepers room in both halves and directions including end-line retreat',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const mode of ['practice','local'])for(const behind of [false,true]){
  const {m,k,p,d,control}=heldKeeperSpacingFixture(team,period,mode);
  if(behind){p.x=m.ownGoalX(team)+d*12;p.y=k.y;}
  let heldFrames=0;
  for(let i=0;i<180&&m.phase==='playing';i++){
   m.step(1/60,control);
   if(m.handOwner===k.id){heldFrames++;assert.ok(m.lastFoul?.reason!=='Charging the goalkeeper');}
  }
  assert.ok(heldFrames>30);assert.deepEqual(m.fouls,[0,0]);
  if(mode==='local'||team===0){assert.equal(m.handOwner,k.id);assert.ok(distance(p,k)>=39);}
  else assert.equal(m.handOwner,null,'solo AI keeper still releases promptly');
 }
});
test('human movement into a holding keeper still earns the normal charging free kick',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  for(const mode of team===1?['local','practice']:['local']){
   const {m,k,p,control}=heldKeeperSpacingFixture(team,period,mode,true);
   for(let i=0;i<40&&m.phase==='playing';i++)m.step(1/60,control);
   assert.equal(m.phase,'restart');assert.equal(m.restart.type,'Direct Free Kick');
   assert.equal(m.lastFoul.reason,'Charging the goalkeeper');assert.equal(m.lastFoul.offender,p.id);
   assert.equal(m.lastFoul.victim,k.id);assert.equal(m.fouls[1-team],1);
  }
 }
});
test('AI containment ends on release and does not protect a keeper controlling with feet',()=>{
 for(const team of [0,1])for(const feet of [false,true]){
  const {m,k,p,d,control}=heldKeeperSpacingFixture(team);
  for(let i=0;i<60;i++)m.step(1/60,control);
  assert.ok(distance(p,k)>=39);const heldX=p.x;
  if(feet)m.handOwner=null;
  else{m.ball.owner=null;m.handOwner=null;m.ball.x=k.x+d*8;m.ball.y=k.y;m.ball.z=0;m.ball.vx=0;m.ball.vy=0;m.ball.lock=1;}
  for(let i=0;i<6;i++)m.step(1/60,control);
  assert.ok((p.x-heldX)*d<0,'AI pursues once hand protection is gone');
  assert.ok(distance(p,k)<45);
 }
});

function localAimHarness(width=1180,height=757,team=0,period=1){
 const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
 h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;m.period=period;m.kickoff(team);h.app.syncMatch();h.app.render(0);
 return h;
}
function localAimKeys(h,team){
 const horizontal=h.app.camera.portrait;
 return {horizontal,minus:team===0?(horizontal?'a':'w'):(horizontal?'ArrowLeft':'ArrowUp'),
  plus:team===0?(horizontal?'d':'s'):(horizontal?'ArrowRight':'ArrowDown'),
  forward:team===0?(horizontal?'w':'a'):(horizontal?'ArrowUp':'ArrowLeft')};
}
test('local shot placement follows the visible goal mouth for both players halves and viewports',()=>{
 for(const [w,hg] of [[1180,757],[333,596]])for(const team of [0,1])for(const period of [1,2]){
  const h=localAimHarness(w,hg,team,period),m=h.app.match,k=localAimKeys(h,team),goal=m.goalX(team),p=m.owner;
  for(const [names,sign] of [[[],0],[[k.minus],-1],[[k.plus],1],[[k.minus,k.forward],-1],[[k.plus,k.forward],1],[[k.minus,k.plus],0],[[k.forward],0]]){
   for(const name of names)h.window.handlers.keydown(keyEvent(name));
   const intent=h.app.localShotIntent(team);assert.equal(intent.power,1);assert.equal(intent.loft,true);
   if(!sign)assert.deepEqual(intent.target,{x:goal+m.direction(team)*20,y:FIELD.cy},'neutral shot is exactly the existing target');
   else{
    const crossingGoal=goal+m.direction(team)*1.5,y=p.y+(intent.target.y-p.y)*(crossingGoal-p.x)/(intent.target.x-p.x),at=h.app.camera.project(goal,y),centre=h.app.camera.project(goal,FIELD.cy);
    assert.ok(Math.abs(Math.abs(y-FIELD.cy)-30)<1e-8,'placement targets the whole-ball crossing plane rather than a misleading extension');
    assert.ok((k.horizontal?at.x-centre.x:at.y-centre.y)*sign>0,'placement matches the pressed screen side');
    assert.ok(intent.controlLabel.includes(k.horizontal?(sign<0?'LEFT':'RIGHT'):(sign<0?'UPPER':'LOWER')));
   }
   h.app.render(0);assert.deepEqual(h.app.drawnAim.intent.target,intent.target);
   assert.ok(h.app.drawnForecast,'actual shot forecast appears before pressing shoot');
   for(const name of names)h.window.handlers.keyup(keyEvent(name));
   assert.ok(h.app.localShotIntent(team).controlLabel.endsWith('CENTRE'),'release restores neutral without sticky aim');
  }
 }
});
test('local placement preview and kick agree in ordinary possession and retain existing power and contact timing',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const width of [333,1180]){
  const h=localAimHarness(width,width===333?596:757,team,period),m=h.app.match;
  placeShot(m,170,55,team,period);h.app.render(0);const keys=localAimKeys(h,team),shoot=team===0?'g':'l';
  h.window.handlers.keydown(keyEvent(keys.plus));const intent=h.app.localShotIntent(team),forecast=h.app.shotForecast();
  assert.equal(intent.loft,false);assert.ok(forecast.onTarget);
  const before={x:m.owner.x,y:m.owner.y};m.step(1/60,h.app.input());assert.ok(distance(m.owner,before)>0,'aiming direction still moves normally');
  const shown=h.app.localShotIntent(team),expected=m.previewKick(m.owner,shown.target,1,false);
  h.window.handlers.keydown(keyEvent(shoot));const action=m.pendingKick,id=action.id;
  assert.deepEqual(action.target, {...shown.target,receiverId:null,pass:false});
  assert.equal(action.duration,.14);assert.equal(action.power,1);assert.equal(action.loft,false);
  assert.deepEqual(h.app.shotForecast(),expected,'locked forecast uses the actual release parameters');
  h.window.handlers.keyup(keyEvent(keys.plus));h.window.handlers.keydown(keyEvent(keys.minus));
  h.window.handlers.keydown({...keyEvent(shoot),repeat:true});assert.equal(m.pendingKick.id,id);
  assert.deepEqual(h.app.localShotPreview().target,action.target,'later direction cannot retarget a started shot');
  advanceToContact(m);assert.equal(m.shots[team],1);assert.equal(h.app.localShotPreview(),null,'preview clears at contact');
  assert.deepEqual(m.flight.target,{x:shown.target.x,y:shown.target.y});
 }
});
test('local pending passes never show a competing shot preview and interruptions discard a locked shot',()=>{
 const h=localAimHarness(),m=h.app.match,k=localAimKeys(h,0);
 h.window.handlers.keydown(keyEvent(k.plus));h.window.handlers.keydown(keyEvent('f'));
 assert.ok(!m.pendingKick.shot);assert.equal(h.app.localShotPreview(),null);assert.equal(h.app.shotForecast(),null);
 m.kickoff(0);h.window.handlers.keydown(keyEvent('g'));const action=m.pendingKick;
 m.giveBall(m.players[20]);assert.equal(m.pendingKick,null);assert.equal(m.shots[0],0);
 assert.ok(h.app.localShotPreview().controlLabel.startsWith('P2 L'),'preview follows the new actionable owner');
 h.window.handlers.keyup(keyEvent(k.plus));h.click('menuBtn');assert.equal(h.app.localShotPreview(),null);
 h.click('resumePause');h.click('menuBtn');h.click('restartMatch');h.flush();
 assert.equal(h.app.match.pendingKick,null);assert.ok(h.app.localShotPreview().controlLabel.endsWith('CENTRE'));
 assert.deepEqual(h.app.match.shots,[0,0]);
});
test('local aim labels fit the existing narrow panel and exclude throw-in replay pause and results',()=>{
 const h=localAimHarness(333,505),m=h.app.match;
 const k=localAimKeys(h,0);h.window.handlers.keydown(keyEvent(k.minus));h.app.render(0);
 assert.ok(h.draws.some(d=>d.method==='fillText'&&String(d.args[0]).includes('P1 G ·')));
 for(const phase of ['replay','goal','paused','full']){m.phase=phase;assert.equal(h.app.localShotPreview(),null);}
 m.phase='playing';m.setPiece='Throw-in';assert.equal(h.app.localShotPreview(),null);
 const markup=html.match(/<p id="localPauseHelp"[^>]*>([\s\S]*?)<\/p>/)[1];
 assert.ok(markup.includes('Movement still runs your player'));assert.ok(markup.includes('shot locks on key press'));
 assert.ok(/width=\(intent.controlLabel\?116:72\)\*unit/.test(html),'placement label uses the existing larger safe panel width');
});

test('normal local input previews and locks placed shots for P1 kickoff and P2 after a real keeper catch',()=>{
 for(const team of [0,1])for(const side of ['minus','plus'])for(const [width,height] of [[1180,757],[333,596]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('multi');h.click('startLocal');h.flush();const m=h.app.match;let f=0;h.tick(100);
  const tick=()=>{h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+(++f)*1000/60);};
  if(team===1){
   h.window.handlers.keydown(keyEvent('g'));h.window.handlers.keyup(keyEvent('g'));
   for(let i=0;i<80;i++)tick();assert.equal(m.handOwner,11,'ordinary kickoff shot is saved');
  }
  const key=localAimKeys(h,team)[side],otherKeys=localAimKeys(h,1-team),shoot=team===0?'g':'l';
  h.window.handlers.keydown(keyEvent(key));h.window.handlers.keydown(keyEvent(otherKeys[side==='plus'?'minus':'plus']));
  for(let i=0;i<6;i++)tick();
  const intent=h.app.localShotIntent(team),preview=h.app.shotForecast();assert.equal(m.owner.team,team);
  assert.ok(intent.target.shot);assert.deepEqual(h.app.drawnAim.intent.target,intent.target);
  h.window.handlers.keydown(keyEvent(shoot));h.window.handlers.keyup(keyEvent(shoot));
  h.window.handlers.keyup(keyEvent(key));h.window.handlers.keyup(keyEvent(otherKeys[side==='plus'?'minus':'plus']));
  assert.deepEqual(h.app.shotForecast(),preview,'pressing shoot uses the displayed prediction');
  for(let i=0;i<12;i++)tick();
  assert.equal(m.shots[team],1);assert.equal(m.pendingKick,null);
  assert.equal(h.app.localShotPreview(),null,'flight does not retain a misleading aiming bar');
 }
});

test('panning toward either end never turns forward movement into local lateral aim',()=>{
 for(const [width,height] of [[1180,757],[333,596]])for(const team of [0,1])for(const period of [1,2]){
  const h=localAimHarness(width,height,team,period),m=h.app.match,portrait=h.app.camera.portrait;
  const forward=team===0?(portrait?'w':'a'):(portrait?'ArrowUp':'ArrowLeft');
  const across=team===0?(portrait?'a':'w'):(portrait?'ArrowLeft':'ArrowUp');
  for(const x of [125,550,975]){
   h.app.camera.x=x;h.app.camera.y=318;h.app.camera.yaw=.12;
   h.window.handlers.keydown(keyEvent(forward));assert.ok(h.app.localShotIntent(team).controlLabel.endsWith('CENTRE'));
   h.window.handlers.keyup(keyEvent(forward));h.window.handlers.keydown(keyEvent(across));
   assert.ok(h.app.localShotIntent(team).controlLabel.endsWith(portrait?'LEFT':'UPPER'));
   h.window.handlers.keyup(keyEvent(across));
  }
 }
});

function cornerAimFixture(width=508,height=757,team=1,period=2,lower=false){
 const h=localAimHarness(width,height,team,period),m=h.app.match,goal=m.goalX(team),d=m.direction(team);
 m.stopForRestart({type:'Corner Kick',team,x:goal-d*6,y:lower?FIELD.bottom-6:FIELD.top+6});m.takeRestart();h.app.syncMatch();
 return h;
}
test('portrait right-corner placement marker stays on the selected screen side at whole-ball crossing',()=>{
 const h=cornerAimFixture(),m=h.app.match;
 for(let i=0;i<180;i++)h.app.render(1/60);
 h.window.handlers.keydown(keyEvent('ArrowRight'));h.draws.length=0;h.app.render(0);
 const f=h.app.shotForecast(),rules=new Function(engine+';return RULES;')(),goal=m.goalX(1),unit=508/1100;
 const marker=h.app.camera.project(f.crossing.x,f.crossing.y,f.crossing.z*rules.heightScale+rules.radius),middle=h.app.camera.project(goal,FIELD.cy);
 assert.equal(h.app.localShotIntent(1).controlLabel,'P2 L · RIGHT');
 assert.ok(marker.x>middle.x,'RIGHT must not predict a crossing on the left half');
 assert.ok(Math.abs(f.crossing.y-(FIELD.cy-30))<1e-6);assert.equal(f.label,'LOFTED');
 assert.ok(h.draws.some(d=>d.method==='arc'&&Math.abs(d.args[0]-marker.x)<1e-6&&Math.abs(d.args[1]-marker.y)<1e-6&&Math.abs(d.args[2]*unit-5)<1e-6),'actual canvas marker paints at the forecast crossing');
 h.window.handlers.keyup(keyEvent('ArrowRight'));
 assert.equal(h.app.shotForecast().label,'WIDE','legacy neutral corner trajectory stays honest and unchanged');
});
test('assisted corner preview matches actual unopposed ball crossing for both teams halves corners and screen sides',()=>{
 const {firstBallBoundary}=new Function(engine+';return {firstBallBoundary};')();
 for(const team of [0,1])for(const period of [1,2])for(const lower of [false,true])
 for(const [width,height] of [[1180,757],[508,757]])for(const side of ['minus','plus']){
  const h=cornerAimFixture(width,height,team,period,lower),m=h.app.match,taker=m.owner;
  // Explicit unopposed fixture: verify trajectory, not keeper/interception outcomes.
  for(const p of m.players)if(p.id!==taker.id){p.x=550;p.y=150+p.slot*8;}
  h.app.render(0);const key=localAimKeys(h,team)[side];h.window.handlers.keydown(keyEvent(key));
  const forecast=h.app.shotForecast();assert.ok(forecast.onTarget);
  let crossing=null;const boundary=m.checkBoundary;
  m.checkBoundary=function(old){const c=firstBallBoundary(old,this.ball);if(c)crossing=c;return boundary.call(this,old);};
  h.window.handlers.keydown(keyEvent(team===0?'g':'l'));h.window.handlers.keyup(keyEvent(key));
  advanceToContact(m);
  for(let i=0;i<120&&m.phase==='playing';i++)m.step(1/60,h.app.input());
  assert.equal(m.phase,'goal');assert.equal(m.score[team],1);assert.ok(crossing);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(crossing[axis]-forecast.crossing[axis])<1e-6,'forecast matches real '+axis+' crossing');
  assert.ok(Math.abs(Math.abs(crossing.y-FIELD.cy)-30)<1e-6,'actual shot retains selected half at the whole-ball plane');
 }
});
test('assisted local placement keeps its selected whole-ball point across near-goal and restart ranges',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const range of [6,12,45,170,480,940])for(const offset of [-224,224]){
  const h=localAimHarness(508,757,team,period),m=h.app.match,p=m.owner,goal=m.goalX(team),d=m.direction(team);
  p.x=goal-d*range;p.y=FIELD.cy+offset;m.followBall();h.app.render(0);
  for(const key of team===0?['a','d']:['ArrowLeft','ArrowRight']){
   h.window.handlers.keydown(keyEvent(key));const intent=h.app.localShotIntent(team);
   const crossX=goal+d*1.5,y=p.y+(intent.target.y-p.y)*(crossX-p.x)/(intent.target.x-p.x);
   assert.ok(Math.abs(Math.abs(y-FIELD.cy)-30)<1e-7);
   h.window.handlers.keyup(keyEvent(key));
  }
 }
});

function canvasLabelBox(h,prefix){
 const i=h.draws.findIndex(d=>d.method==='fillText'&&String(d.args[0]).startsWith(prefix));if(i<0)return null;
 const text=h.draws[i].args[0],r=h.draws.slice(0,i).reverse().find(d=>d.method==='fillRect'),unit=h.elements.get('game').getBoundingClientRect().width/1100;
 assert.ok(r,'label has a backing rectangle');
 return {text,left:r.args[0]*unit,top:r.args[1]*unit,right:(r.args[0]+r.args[2])*unit,bottom:(r.args[1]+r.args[3])*unit};
}
function panelOverlap(a,b){return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));}
test('ordinary local saved kickoff keeps keeper countdown and shot card apart in narrow and wide views',()=>{
 for(const [width,height] of [[508,757],[400,606],[333,505],[1180,757]]){
  const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width,height});
  h.chooseMode('multi');h.click('startLocal');h.flush();h.tick(100);const m=h.app.match;
  h.window.handlers.keydown(keyEvent('g'));h.window.handlers.keyup(keyEvent('g'));let samples=0;
  for(let f=1;f<=432;f++){
   h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+f*1000/60);
   const clock=canvasLabelBox(h,'KEEPER ·');if(!clock)continue;
   const aim=canvasLabelBox(h,'P2 L ·');assert.ok(aim);assert.equal(panelOverlap(clock,aim),0,'countdown does not obscure shot placement');
   const caption=canvasLabelBox(h,'SHORT · IF CLEAR');if(caption)assert.equal(panelOverlap(clock,caption),0);
   for(const r of [clock,aim]){assert.ok(r.left>=8-1e-6&&r.right<=width-8+1e-6);assert.ok(r.top>=78-1e-6&&r.bottom<=height-18+1e-6);}
   samples++;
  }
  assert.ok(samples>150);assert.equal(canvasLabelBox(h,'KEEPER ·').text,'KEEPER · RELEASE 2');
  const held=m.owner.held;h.click('menuBtn');h.draws.length=0;h.app.render(0);
  assert.equal(canvasLabelBox(h,'KEEPER ·'),null);assert.equal(m.owner.held,held);
  h.click('resumePause');h.tick(100+433*1000/60);
  h.window.handlers.keydown(keyEvent('k'));h.window.handlers.keyup(keyEvent('k'));
  for(let f=434;f<=540;f++){h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+f*1000/60);}
  assert.equal(canvasLabelBox(h,'KEEPER ·'),null);assert.equal(m.passes[1],1);assert.equal(m.owner?.team,1);assert.ok(!m.owner.keeper);
  h.click('menuBtn');h.click('restartMatch');h.flush();h.draws.length=0;h.app.render(0);
  assert.equal(canvasLabelBox(h,'KEEPER ·'),null);assert.equal(h.app.match.handOwner,null);
 }
});
test('keeper warning avoids shot labels and viewport edges at both ends and lateral keeper positions',()=>{
 for(const [width,height] of [[333,505],[508,757],[1180,757],[757,400]])for(const team of [0,1])for(const period of [1,2])for(const offset of [-110,0,110]){
  const h=localAimHarness(width,height,team,period),m=h.app.match,k=m.players[team*11];
  k.x=m.ownGoalX(team)+m.direction(team)*18;k.y=FIELD.cy+offset;m.ball.lastTouch=1-team;m.receiveBall(k);k.held=6.1;
  h.app.camera.update(m.snapshot(),0,false,true);h.app.syncMatch();h.draws.length=0;h.app.render(0);
  const warning=canvasLabelBox(h,'KEEPER ·'),aim=canvasLabelBox(h,'P'+(team+1)+' '+(team===0?'G':'L')+' ·');
  assert.ok(warning&&aim);assert.equal(panelOverlap(warning,aim),0);
  const caption=canvasLabelBox(h,'SHORT · IF CLEAR');if(caption)assert.equal(panelOverlap(warning,caption),0);
  assert.ok(warning.left>=8-1e-6&&warning.right<=width-8+1e-6);
  assert.ok(warning.top>=78-1e-6&&warning.bottom<=height-18+1e-6);
  assert.equal(warning.text,'KEEPER · RELEASE 2');assert.equal(k.held,6.1);
 }
});

test('unchanged local forecasts reuse one exact result and recompute for tiny motion aim and possession changes',()=>{
 const h=localAimHarness(508,757),m=h.app.match,original=m.previewKick;let calls=0;
 m.previewKick=function(...args){calls++;return original.apply(this,args);};
 const check=()=>{const intent=h.app.localShotPreview(),actual=h.app.shotForecast();
  assert.deepEqual(actual,original.call(m,m.owner,intent.target,intent.power,intent.loft));return actual;};
 const first=check(),initial=calls;for(let i=0;i<120;i++)assert.equal(check(),first);
 assert.equal(calls,initial,'no simulation for unchanged render inputs');
 const p=m.owner;p.x+=.000001;check();assert.equal(calls,initial+1,'movement is never rounded away');
 const k=localAimKeys(h,0);h.window.handlers.keydown(keyEvent(k.plus));check();assert.equal(calls,initial+2);
 h.window.handlers.keyup(keyEvent(k.plus));check();assert.equal(calls,initial+3,'one entry only, not an accumulating target cache');
 m.giveBall(p);check();assert.equal(calls,initial+4,'new possession and restart release invalidate');
 h.click('menuBtn');assert.equal(h.app.shotForecast(),null);h.click('resumePause');check();assert.equal(calls,initial+5);
 h.window.handlers.keydown(keyEvent('a'));const portrait=check();
 h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});h.app.render(0);
 assert.ok(h.app.localShotPreview().controlLabel.endsWith('CENTRE'));
 assert.ok(check()!==portrait,'orientation change invalidates a changed placement immediately');
 h.window.handlers.keyup(keyEvent('a'));
 h.click('menuBtn');h.click('restartMatch');h.flush();
 assert.ok(h.app.shotForecast()!==first,'a new match cannot retain the prior forecast object');
});
test('local forecast caching preserves all restart parameters and never caches wind-up or flight',()=>{
 for(const type of ['Corner Kick','Direct Free Kick','Indirect Free Kick','Penalty Kick','Goal Kick']){
  const h=localAimHarness(),m=h.app.match,goal=m.goalX(0);
  m.stopForRestart({type,team:0,x:type==='Goal Kick'?m.ownGoalX(0)-24:goal+100,y:FIELD.cy+40});m.takeRestart();h.app.render(0);
  const original=m.previewKick;let calls=0;m.previewKick=function(...args){calls++;return original.apply(this,args);};
  const compare=()=>{const k=h.app.localShotPreview();assert.deepEqual(h.app.shotForecast(),original.call(m,m.owner,k.target,k.power,k.loft));};
  compare();const n=calls;for(let i=0;i<10;i++)compare();assert.equal(calls,n);
  m.restartGuard.y+=.000001;compare();assert.equal(calls,n+1);
  const key=localAimKeys(h,0).plus;h.window.handlers.keydown(keyEvent(key));compare();assert.equal(calls,n+2);
  h.window.handlers.keydown(keyEvent('g'));assert.ok(m.pendingKick);compare();compare();assert.equal(calls,n+4,'wind-up remains fresh');
  advanceToContact(m);const {traceShot}=new Function(engine+';return {traceShot};')();
  assert.deepEqual(h.app.shotForecast(),traceShot(m.ball,m.goalX(0),m.lastRestart));
 }
});
test('local forecast cache cannot follow the wrong owner and leaves solo pointer previews uncached',()=>{
 const h=localAimHarness(),m=h.app.match;const before=h.app.shotForecast();
 m.giveBall(m.players[20]);h.app.render(0);const k=h.app.localShotPreview();
 assert.deepEqual(h.app.shotForecast(),m.previewKick(m.owner,k.target,k.power,k.loft));assert.ok(h.app.shotForecast()!==before);
 h.chooseMode('menu');h.chooseMode('practice');h.flush();const s=h.app.match;placeShot(s,180,0,0,1);h.app.camera.update(s.snapshot(),0,false,true);h.app.render(0);
 const p=s.owner,c=h.elements.get('game');
 assert.equal(h.app.shotForecast(),null,'solo keyboard idle preview remains absent');
 const a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(s.goalX(0),FIELD.cy);
 c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
 const intent=h.app.pointerAim(h.app.drag);
 assert.ok(intent.shot,'fixture supplies a solo shot preview');
 {const first=h.app.shotForecast();assert.deepEqual(first,s.previewKick(p,intent.target,intent.power,false));assert.ok(first!==h.app.shotForecast(),'solo pointer path remains unchanged');}
 c.handlers.pointercancel(pointerEvent(h,b.x,b.y));assert.equal(s.pendingKick,null);
});


test('ordinary goalward pointer drags beyond a forward teammate launch long shots instead of directional assist passes',()=>{
 for(const hz of [60,120])for(const seconds of [0,1,2.5]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
  h.chooseMode('practice');h.flush();h.tick(100);let frame=0;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<hz;i++)tick();
  h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<hz*seconds;i++)tick();h.window.handlers.keyup(keyEvent('w'));
  const m=h.app.match,p=m.owner,a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(m.goalX(0),FIELD.cy);
  assert.equal(p.team,0);c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
  const forecast=h.app.shotForecast();assert.ok(forecast);
  c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.shot,true);assert.equal(m.pendingKick.target.receiverId,null);assert.equal(m.pendingKick.duration,.14);
  while(m.pendingKick)tick();
  assert.equal(m.shots[0],1);assert.ok(m.flight.shot);assert.ok(Math.hypot(m.ball.vx,m.ball.vy)>300);
  assert.equal(m.passes[0],1,'only the intentional kickoff E was a pass');
 }
});
test('explicit teammate endpoints stay passes on the same ray as a long or attacking-third shot',()=>{
 for(const width of [508,1180])for(const period of [1,2])for(const range of [200,450,570]){
  for(const destination of ['goal','teammate']){
   const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:757});
   h.chooseMode('practice');h.flush();const m=h.app.match,f=placeShot(m,range,0,0,period),r=m.players[6];
   r.x=f.p.x+f.d*80;r.y=FIELD.cy;
   h.app.camera.update(m.snapshot(),0,false,true);h.app.render(0);
   const a=h.app.camera.project(f.p.x,f.p.y),b=h.app.camera.project(destination==='goal'?f.goal:r.x,FIELD.cy);
   c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));
   const intent=h.app.pointerAim(h.app.drag);
   assert.equal(intent.shot,destination==='goal');
   c.handlers.pointerup(pointerEvent(h,b.x,b.y));
   assert.equal(m.pendingKick.shot,destination==='goal');
   assert.equal(m.pendingKick.target.receiverId,destination==='goal'?null:r.id);
  }
 }
});
test('long shooting classification preserves weak wide backward cancelled and throw-in pointer intent',()=>{
 for(const kind of ['weak','wide','backward','cancel','throw']){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
  h.chooseMode('practice');h.flush();const m=h.app.match,f=placeShot(m,500,0);
  h.app.camera.update(m.snapshot(),0,false,true);h.app.render(0);
  if(kind==='throw')m.setPiece='Throw-in';
  const a=h.app.camera.project(f.p.x,f.p.y),b=h.app.camera.project(f.goal,kind==='wide'?FIELD.bottom+200:FIELD.cy);
  let dx=b.x-a.x,dy=b.y-a.y;
  if(kind==='weak'){const n=Math.hypot(dx,dy);dx=dx/n*25;dy=dy/n*25;}
  if(kind==='backward'){dx=-dx;dy=-dy;}
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,a.x+dx,a.y+dy));
  if(kind!=='cancel')assert.equal(h.app.pointerAim(h.app.drag).shot,false);
  if(kind==='cancel'){c.handlers.pointercancel(pointerEvent(h,a.x+dx,a.y+dy));assert.equal(m.pendingKick,null);}
 }
});
function pressingAssignmentFixture(team=0,period=1,mode='local'){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],mode);m.period=period;m.kickoff(1-team);
 const d=m.direction(team),own=m.ownGoalX(team),o=m.players[(1-team)*11+9],selected=m.players[team*11+8],front=m.players[team*11+3],rear=m.players[team*11+10];
 for(const q of m.players){q.x=550;q.y=FIELD.top+20+q.slot*8;}
 o.x=own+d*182;o.y=FIELD.cy;o.angle=d>0?Math.PI:0;m.giveBall(o);o.receiveAt=-10;o.think=10;
 selected.x=o.x-d*30;selected.y=o.y;front.x=o.x-d*90;front.y=o.y;rear.x=o.x+d*50;rear.y=o.y;
 m.selectPlayer(team,selected.id);
 const input=mode==='local'?{teams:[{dx:0,dy:0},{dx:0,dy:0}]}:{dx:0,dy:0};
 return {m,d,o,selected,front,rear,input};
}
test('human defensive support excludes controlled players and steps goal-side cover toward a nearby carrier',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const f=pressingAssignmentFixture(team,period),{m,o,selected,front,rear,input}=f,old={x:selected.x,y:selected.y},moves=[];
  const move=m.move.bind(m);m.move=(p,x,y,s,dt)=>{moves.push({id:p.id,x,y,s});move(p,x,y,s,dt);};
  const gap=distance(front,o);m.step(1/hz,input);
  const press=moves.find(a=>a.id===front.id),cover=moves.find(a=>a.id===rear.id);
  assert.ok(press);assert.equal(press.s,128);assert.ok(distance(press,o)<gap,'nearby goal-side player closes rather than retreats');
  assert.ok(distance(front,o)<gap);assert.equal(cover.s,85,'second automatic defender covers instead of piling onto the ball');
  assert.deepEqual({x:selected.x,y:selected.y},old,'idle human control is never overridden');
  assert.equal(m.activeFor(team),selected.id);assert.deepEqual(m.fouls,[0,0]);
  input.teams[team]={dx:0,dy:-1};m.step(1/hz,input);
  assert.ok(selected.y<old.y,'manual movement remains responsive');
 }
 const f=pressingAssignmentFixture(0,1,'practice'),gap=distance(f.front,f.o);f.m.step(1/60,f.input);assert.ok(distance(f.front,f.o)<gap);
});
test('defensive support does not abandon shape for distant threats or change unassisted AI assignments',()=>{
 for(const manual of [false,true]){
  const f=pressingAssignmentFixture(0,1,manual?'practice':'cup'),{m,front,rear,selected}=f,moves=[];
  if(manual){front.x=1020;front.y=FIELD.top+20;}
  const move=m.move.bind(m);m.move=(p,x,y,s,dt)=>{moves.push({id:p.id,x,y,s});move(p,x,y,s,dt);};
  m.step(1/60,manual?f.input:null);
  assert.ok(moves.find(a=>a.id===front.id).s!==128,'distant defender is not promoted to primary presser');
  if(!manual)assert.equal(moves.find(a=>a.id===selected.id).s,128,'fully automatic side keeps nearest primary presser');
  else assert.ok(moves.find(a=>a.id===rear.id),'nearer available player supplies pressure');
 }
});


test('ordinary long pointer shots clear the forward teammate and continue to real opponents or the keeper',()=>{
 for(const [hz,seconds] of [[30,0],[60,1],[120,2.5]]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
  h.chooseMode('practice');h.flush();h.tick(100);let frame=0;const m=h.app.match;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<hz;i++)tick();
  h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<hz*seconds;i++)tick();h.window.handlers.keyup(keyEvent('w'));
  const p=m.owner,q=m.players[9],before={x:q.x,y:q.y},a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(m.goalX(0),FIELD.cy);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.shot,true);let passed=false,flightFrames=0;
  for(let i=0;i<hz*3&&m.phase==='playing';i++){
   tick();if(m.flight?.shot){flightFrames++;if(m.ball.x<before.x-20)passed=true;}
   if(!m.pendingKick&&m.owner)break;
  }
  assert.ok(passed,'real ball travels beyond the teammate instead of being trapped by him');assert.ok(flightFrames>3);
  assert.ok(Math.abs(q.y-before.y)>8,'teammate actually steps clear instead of becoming collision-immune');
  assert.ok(Math.abs(h.app.drawnPlayers.get(q.id).y-before.y)>5,'rendered teammate follows the actual clearance movement');
  assert.equal(m.owner?.team,1,'a legitimate opponent block or keeper save still ends this central shot');
  if(seconds===2.5)assert.ok(m.owner.keeper,'the nearer approach reaches the keeper');
  assert.equal(m.shots[0],1);
 }
});
test('automatic shot-lane clearance moves teammates during wind-up in both directions without overriding manual movement',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'local'),180,0,team,period),{m,p,d,goal}=f,q=m.players[team*11+6];
  q.x=p.x+d*65;q.y=p.y;const before={x:q.x,y:q.y};
  m.kick(p,{x:goal+d*20,y:FIELD.cy,shot:true},1);
  const input={teams:[{dx:0,dy:0},{dx:0,dy:0}]};
  m.step(1/hz,input);assert.ok(Math.abs(q.y-before.y)>0,'movement starts before contact');
  const side=q.shotLane.side,id=q.shotLane.id;
  while(m.pendingKick)m.step(Math.min(1/hz,m.pendingKick.remaining),input);
  assert.equal(m.activeFor(team),q.id,'existing post-contact control handoff remains');
  const at={x:q.x,y:q.y};input.teams[team]={dx:d,dy:0};m.step(1/hz,input);
  assert.ok((q.x-at.x)*d>0,'actual input overrides automatic clearance');assert.equal(q.y,at.y);
  assert.equal(q.shotLane,null,'manual movement discards the previous evasive plan');
  input.teams[team]={dx:0,dy:0};m.step(1/hz,input);
  if(q.shotLane?.id===id)assert.equal(q.shotLane.side,side,'same shot does not reverse evasive direction');
  m.kickoff(team);assert.equal(q.shotLane,null);assert.equal(m.pendingKick,null);
 }
});
test('shot avoidance never grants body immunity or changes opposing blocks and deliberate passes',()=>{
 for(const team of [0,1])for(const blockingTeam of [0,1]){
  const f=placeShot(new SoccerMatch(NATIONS[0],NATIONS[2],'local'),180,0,team),{m,p,d,goal}=f,q=m.players[blockingTeam*11+6];
  q.x=p.x+d*65;q.y=p.y;const cover=m.players[(1-team)*11+2];cover.x=goal-d*25;cover.y=FIELD.top+25;m.move=()=>{};
  m.kick(p,{x:goal+d*20,y:FIELD.cy,shot:true},1);
  for(let i=0;i<100&&m.phase==='playing';i++){m.step(1/120,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});if(!m.pendingKick&&m.owner)break;}
  assert.equal(m.owner?.id,q.id,'an immobile body still blocks the shot on either team');
 }
 const {h,c,m,p,r}=passReceptionFixture(),a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
 c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
 assert.equal(m.pendingKick.shot,false);runPassFrames(h);assert.equal(m.owner?.id,r.id);assert.ok(!r.shotLane);
});
test('nearby goal-side support closes before shooting range in a carried attack with a closer trailing teammate',()=>{
 // Isolate the carried-attack geometry: a changed preceding pass must not
 // replace this scenario with a newly protected reception inside shooting range.
 for(const period of [1,2]){
  const f=pressingAssignmentFixture(0,period,'practice'),{m,o,front,rear,selected,d}=f;
  o.x=m.ownGoalX(0)+d*290;o.y=FIELD.cy;o.receiveAt=-10;o.think=0;
  front.x=o.x-d*170;front.y=o.y;rear.x=o.x+d*30;rear.y=o.y;
  selected.x=550;selected.y=100;m.followBall();let early=null;
  for(let i=0;i<240&&m.phase==='playing'&&m.owner?.id===o.id;i++){
   m.step(1/60,f.input);const range=Math.abs(m.ownGoalX(0)-o.x);
   if(range>260&&range<285)early=Math.min(early??Infinity,distance(front,o));
  }
  assert.ok(early!==null&&early<150,'cover steps out before the carrier reaches shooting range');
  assert.ok(distance(front,o)<40,'a closer trailing player must not prevent frontal pressure');
  assert.equal(m.flight?.team,1);assert.equal(m.flight.shot,false,'the pressured attacker releases a pass');
 }
});
test('ordinary counterattack still provides defensive cover while preserving the existing first-touch window',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice',8);m.kick(m.owner,{x:48,y:FIELD.cy},1,false);
 let shot=null;const kick=m.kick.bind(m);
 m.kick=(p,target,power,loft)=>{
  if(p.team===1&&!m.setPiece&&Math.abs(target.x-m.goalX(1))<90){
   const front=m.players.filter(q=>q.team===0&&!q.keeper&&q.id!==m.active&&q.x>=p.x);
   shot={age:m.elapsed-p.receiveAt,pressure:Math.min(...front.map(q=>distance(q,p)))};
  }return kick(p,target,power,loft);
 };
 for(let i=0;i<60*12&&m.phase==='playing'&&!shot;i++)m.step(1/60,{dx:0,dy:0});
 assert.ok(shot);assert.ok(shot.age>.2&&shot.age<.65,'this route is a fresh reception, not the carried-attack fixture');
 assert.ok(shot.pressure<90,'cover approaches while honoring the receiver protection window');
});

test('ordinary attacking-third short pass blends the moving passer into gait instead of sliding on planted feet',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
  h.chooseMode('practice');h.flush();h.tick(100);let frame=0;const m=h.app.match;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<hz;i++)tick();
  h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<hz*2.5;i++)tick();h.window.handlers.keyup(keyEvent('w'));
  const p=m.owner,r=m.players[9],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  assert.ok(distance(p,r)<40,'ordinary approach reaches a short attacking-third passing option');
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,r.id);
  let prior=null,sliding=0,received=false,recovering=false;
  for(let i=0;i<hz*.7;i++){
   tick();if(m.owner?.id===r.id)received=true;
   const q=h.app.drawnPlayers.get(p.id),pose=h.app.playerPose(q,h.app.drawnBall);
   if(prior&&q.strikePhase==='follow'&&pose.footRun<.01)sliding+=distance(q,prior);
   if(q.strikePhase==='follow'&&q.strike>.55&&q.strike<.85&&q.speed>30){
    assert.ok(pose.footRun>0);recovering=true;
   }
   prior={...q};
  }
  assert.ok(received);assert.equal(m.passes[0],2);assert.ok(recovering);
  assert.ok(sliding<3,'near-planted translation is bounded at '+hz+' Hz: '+sliding);
 }
});
test('follow-through locomotion blending preserves stationary kicks and exact contact with continuous limbs',()=>{
 const h=uiHarness(html);h.chooseMode('practice');h.flush();const base=h.app.match.snapshot().players[9];
 for(const speed of [0,30,73.32,110])for(const stride of [0,1,2]){
  let prior=null;
  for(let i=0;i<=1000;i++){
   const strike=.3+i*.0007,q={...base,speed,stride,receive:0,strike,strikePhase:'follow',strikeId:1},
     pose=h.app.playerPose(q,null),still=h.app.playerPose({...q,speed:0},null),skeleton=h.app.playerSkeleton(q,pose);
   assert.ok(pose.running>=0&&pose.running<=h.app.gaitAmplitude(speed)+1e-12);
   if(strike<=.48){assert.equal(pose.running,0);assert.equal(pose.kick,still.kick,'contact extension unchanged');}
   if(speed===0)assert.equal(pose.running,0,'stationary follow-through does not invent running');
   if(strike>.48&&speed>0)assert.ok(pose.kick<=still.kick+1e-12,'leg extension yields as running resumes');
   const limbs=skeleton.legs.flatMap(l=>[l.knee,l.ankle]).concat(skeleton.arms.flatMap(a=>[a.elbow,a.hand]));
   if(prior)assert.ok(Math.max(...limbs.map((v,j)=>Math.hypot(...v.map((n,k)=>n-prior[j][k]))))<.15,'continuous limb blend');
   prior=limbs;
  }
  const ending={...base,speed,stride,receive:0,strike:.999999,strikePhase:'follow'},idle={...ending,strike:0,strikePhase:'idle'};
  assert.ok(Math.abs(h.app.playerPose(ending,null).footRun-h.app.playerPose(idle,null).footRun)<1e-8);
 }
});
test('moving follow-through uses the same smooth pose in local halves recorded replay pause and reset',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const h=localAimHarness(1180,757,team,period),m=h.app.match,f=placeShot(m,210,0,team,period),r=m.players[team*11+6];
  r.x=f.p.x+f.d*35;r.y=f.p.y+8;
  const cover=m.players[(1-team)*11+2];cover.x=f.goal-f.d*25;cover.y=FIELD.top+25;m.followBall();
  m.kick(f.p,{...r,pass:true,receiverId:r.id},.4,false);h.tick(100);let recorded=null;
  for(let i=1;i<=36;i++){
   h.draws.length=0;h.app.drawnPaths.length=0;h.tick(100+i*1000/60);
   const q=h.app.drawnPlayers.get(f.p.id);
   if(q.strikePhase==='follow'&&q.strike>.6&&q.strike<.85&&q.speed>20){
    assert.ok(h.app.playerPose(q,h.app.drawnBall).footRun>0);recorded=m.history.slice();
   }
  }
  assert.ok(recorded,'local passer moves during follow-through');
  const frame=recorded.find(s=>{const p=s.players[f.p.id];return p.strikePhase==='follow'&&p.strike>.55&&p.strike<.85&&p.speed>20;});
  assert.ok(frame);const q=frame.players[f.p.id];
  assert.ok(h.app.playerPose(q,frame.ball).footRun>0,'recorded pose receives the same rendering correction');
  h.click('menuBtn');const snapshot=JSON.stringify(m.snapshot());h.tick(2000);assert.equal(JSON.stringify(m.snapshot()),snapshot);
  h.click('resumePause');h.click('menuBtn');h.click('restartMatch');h.flush();
  assert.ok(h.app.match.snapshot().players.every(p=>p.strikePhase==='idle'));
 }
});


test('ordinary attacking-third passes keep support running forward instead of reversing at release and reception',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
  h.chooseMode('practice');h.flush();h.tick(100);let frame=0;const m=h.app.match;
  const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
  h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<hz;i++)tick();
  h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<hz*2.5;i++)tick();h.window.handlers.keyup(keyEvent('w'));
  const p=m.owner,r=m.players[9],a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(r.x,r.y);
  c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
  assert.equal(m.pendingKick.target.receiverId,r.id);
  let prior=h.app.drawnPlayers.get(8),backward=0,turning=0,received=false;
  for(let i=0;i<hz*.4;i++){
   tick();const q=h.app.drawnPlayers.get(8);
   backward+=Math.max(0,(q.x-prior.x)*-m.direction(0));
   turning+=Math.abs(Math.atan2(Math.sin(q.angle-prior.angle),Math.cos(q.angle-prior.angle)));
   prior={...q};if(m.owner?.id===r.id)received=true;
  }
  assert.ok(received);assert.equal(m.passes[0],2);
  assert.ok(backward<.05,'support should not retreat merely because the pass is airborne');
  assert.ok(turning<.15,'displayed support heading stays coherent through pass flight');
 }
});
test('both teams retain their attacking formation during a teammate pass in either half',()=>{
 const shape=new Function(engine+';return formation;')();
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const p=m.owner,r=m.players[team*11+6],support=m.players[team*11+1],d=m.direction(team);
  m.kick(p,{...r,receiverId:r.id,pass:true},.6,false);advanceToContact(m);
  assert.equal(m.owner,null);assert.equal(m.flight.team,team);assert.equal(m.flight.shot,false);
  const ballX=m.ball.x,dt=1/hz,target={},move=m.move.bind(m);
  m.move=(q,x,y,s,step)=>{if(q.id===support.id)Object.assign(target,{x,y,s});move(q,x,y,s,step);};
  m.step(dt,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  const expected=m.ownGoalX(team)+d*(shape[support.slot][0]+.09)*(FIELD.right-FIELD.left)+(ballX-550)*.24+Math.sin(m.elapsed*.7+support.slot)*10;
  assert.equal(target.s,94);assert.ok(Math.abs(target.x-expected)<1e-8,'attacking offset retained throughout delivery');
 }
});
test('real turnovers switch support shape immediately while shots loose balls and stopped phases retain existing behavior',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const kind of ['interception','shot','loose','restart']){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const p=m.owner,r=m.players[team*11+6],support=m.players[team*11+1];
  m.kick(p,kind==='shot'?{x:m.goalX(team)+m.direction(team)*20,y:FIELD.cy,shot:true}:{...r,receiverId:r.id,pass:true},.6,false);
  advanceToContact(m);
  if(kind==='interception'){const other=m.players[(1-team)*11+9];m.giveBall(other);assert.equal(m.flight,null);}
  if(kind==='loose')m.flight=null;
  if(kind==='restart')m.stopForRestart({type:'Throw-in',team:1-team,x:550,y:FIELD.top});
  const targets=[],move=m.move.bind(m);
  m.move=(q,x,y,s,dt)=>{if(q.id===support.id)targets.push({x,y,s});move(q,x,y,s,dt);};
  m.step(1/60,{teams:[{dx:0,dy:0},{dx:0,dy:0}]});
  if(kind==='restart'){assert.equal(targets.length,0);assert.equal(m.phase,'restart');}
  else{assert.equal(targets.length,1);assert.equal(targets[0].s,88,'only own pass flight retains attack');}
  m.kickoff(team);assert.equal(m.flight,null);assert.equal(m.setPiece,'Kick-off');
 }
});


test('automatic pass clearance accounts for nearby moving opponents without changing manual choices or collision reach',()=>{
 for(const team of [0,1]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.players[team*11+9],q=m.players[team*11+6],safe=m.players[team*11+5],o=m.players[(1-team)*11+6];
  const place=(p,x,y)=>{p.x=team?1100-x:x;p.y=team?636-y:y;};
  for(const a of m.players){place(a,a.team===team?1000:950,a.team===team?80:500);a.speed=0;}
  place(p,550,318);place(q,390,318);place(safe,650,200);place(o,470,350);m.giveBall(p);
  assert.equal(m.bestPass(p).id,q.id);assert.ok(!m.groundPassBlocked(p,q));
  assert.ok(!m.groundPassBlocked(p,q,true));assert.equal(m.bestPass(p,true).id,q.id);
  o.speed=66;const before=JSON.stringify(m);
  assert.ok(m.groundPassBlocked(p,q,true));assert.equal(m.bestPass(p,true).id,safe.id);
  assert.equal(JSON.stringify(m),before,'planning never changes physics or possession');
  assert.ok(!m.groundPassBlocked(p,q),'actual nineteen-unit capture lane is unchanged');
  place(o,470,318+19.1);assert.ok(!m.groundPassBlocked(p,q));
  place(o,470,318+18.9);assert.ok(m.groundPassBlocked(p,q));
  place(o,470,318+35.6);assert.ok(!m.groundPassBlocked(p,q,true),'projection is bounded to a quarter-second');
  place(o,470,350);assert.ok(m.kick(p,{...q,pass:true,receiverId:q.id},.6));
  assert.equal(m.pendingKick.target.receiverId,q.id,'manual intent can still choose the contested teammate');
 }
});
test('automatic pass planning retains the open-lane fallback when every option has approaching pressure',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local'),p=m.players[9],q=m.players[6],safe=m.players[5],a=m.players[17],b=m.players[18];
 for(const r of m.players){r.x=r.team?950:1000;r.y=r.team?500:80;r.speed=0;}
 Object.assign(p,{x:550,y:318});Object.assign(q,{x:390,y:318});Object.assign(safe,{x:650,y:200});
 Object.assign(a,{x:470,y:350,speed:100});Object.assign(b,{x:623,y:278,speed:100});m.giveBall(p);
 assert.ok(!m.groundPassBlocked(p,q));assert.ok(m.groundPassBlocked(p,q,true));
 assert.ok(!m.groundPassBlocked(p,safe));assert.ok(m.groundPassBlocked(p,safe,true));
 assert.equal(m.bestPass(p,true).id,m.bestPass(p).id,'do not disable passing when no generously clear lane exists');
});

test('human defensive-third cover protects the goal lane without moving the selected player or accelerating pressure',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120])for(const wing of [-1,0,1]){
  const f=pressingAssignmentFixture(team,period),{m,o,front,rear,selected,input}=f;
  o.y+=wing*70;front.y+=wing*70;rear.y+=wing*70;selected.y+=wing*70;m.followBall();
  const before={x:selected.x,y:selected.y},moves=[],move=m.move.bind(m);
  m.move=(p,x,y,s,dt)=>{moves.push({id:p.id,x,y,s,bx:m.ball.x,by:m.ball.y});return move(p,x,y,s,dt);};
  m.step(1/hz,input);
  const cover=moves.find(v=>v.id===rear.id),press=moves.find(v=>v.id===front.id);
  assert.equal(cover.s,85);assert.equal(press.s,128);
  const gx=m.ownGoalX(team),gy=FIELD.cy;
  const cross=(cover.x-cover.bx)*(gy-cover.by)-(cover.y-cover.by)*(gx-cover.bx);
  assert.ok(Math.abs(cross)<1e-7,'cover remains between the ball and own goal, on either wing');
  assert.ok(Math.abs(cover.x-gx)<Math.abs(cover.bx-gx),'cover is goal-side');
  assert.deepEqual({x:selected.x,y:selected.y},before);
  input.teams[team]={dx:0,dy:1};m.step(1/hz,input);
  assert.ok(selected.y>before.y,'human movement still overrides automatic coverage');
 }
});
test('goal-lane cover leaves midfield fully automatic sides and stopped restarts unchanged',()=>{
 for(const kind of ['midfield','automatic','restart']){
  const f=pressingAssignmentFixture(0,1,'practice'),{m,o,front,rear,selected}=f,moves=[];
  if(kind==='midfield'){for(const p of [o,front,rear,selected])p.x-=220;m.followBall();}
  if(kind==='restart')m.stopForRestart({type:'Throw-in',team:1,x:550,y:FIELD.top});
  const move=m.move.bind(m);m.move=(p,x,y,s,dt)=>{moves.push({id:p.id,x,y,s,by:m.ball.y});return move(p,x,y,s,dt);};
  m.step(1/60,kind==='automatic'?null:f.input);
  if(kind==='restart'){assert.equal(moves.length,0);continue;}
  const cover=moves.find(v=>v.s===85);assert.ok(cover);
  const p=m.players[cover.id];
  assert.equal(cover.y,clampForTest(cover.by+(p.slot%2?65:-65),FIELD.top+25,FIELD.bottom-25));
 }
 function clampForTest(x,a,b){return Math.max(a,Math.min(b,x));}
});
function ordinarySavedForwardShotCounter(hz=60,delay=.4){

 const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
 h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;let frame=0;
 const tick=()=>{h.tick(100+(++frame)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
 h.window.handlers.keydown(keyEvent('e'));for(let i=0;i<hz;i++)tick();
 h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<hz*2.5;i++)tick();h.window.handlers.keyup(keyEvent('w'));
 if(m.owner?.team!==0)return {saved:false,end:'lost possession before shot'};
 const p=m.owner,a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(m.players[9].x,m.players[9].y);
 c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
 for(let j=0;j<Math.round(delay*hz);j++)tick();h.window.handlers.keydown(keyEvent(' '));h.window.handlers.keyup(keyEvent(' '));
 while(m.phase==='playing'&&!m.handOwner&&frame<400*hz/60)tick();
 const saved=m.handOwner===11,start=m.elapsed,shots=[],receipts=[],receive=m.giveBall.bind(m),kick=m.kick.bind(m),samples=[];
 m.giveBall=q=>{receipts.push({at:m.elapsed-start,team:q.team,id:q.id,x:q.x,y:q.y});return receive(q);};
 m.kick=(q,target,power,loft)=>{
 if(q.team===1&&!m.setPiece&&(target.shot||Math.abs(target.x-m.goalX(1))<90)){
 const defenders=m.players.filter(r=>r.team===0&&!r.keeper&&r.id!==m.active).map(r=>({id:r.id,dist:distance(r,q),front:r.x>q.x,x:r.x,y:r.y,speed:r.speed})).sort((a,b)=>a.dist-b.dist);
 shots.push({at:m.elapsed-start,x:q.x,y:q.y,age:m.elapsed-q.receiveAt,protection:m.protection,defenders:defenders.slice(0,4)});
 }return kick(q,target,power,loft);};
 for(let i=0;i<1800&&m.phase==='playing';i++){
 m.step(1/60,{dx:0,dy:0});
 if(i%30===0&&m.owner?.team===1&&!m.owner.keeper)samples.push({at:m.elapsed-start,owner:m.owner.id,x:m.owner.x,y:m.owner.y,age:m.elapsed-m.owner.receiveAt,frontGap:Math.min(...m.players.filter(q=>q.team===0&&!q.keeper&&q.id!==m.active&&q.x>=m.owner.x).map(q=>distance(q,m.owner)))});
 if(m.owner?.team===0)break;
 }
 return {saved,start,end:m.phase,owner:m.owner?.id,score:m.score,shots,receipts,samples,active:m.active};

}
test('ordinary saved-shot counters retain a covering defender who can block without stopping fair shots',()=>{
 for(const hz of [30,60,120]){
  const r=ordinarySavedForwardShotCounter(hz,.4);
  assert.ok(r.saved);assert.equal(r.shots.length,1,'attacker still gets a genuine shot');
  assert.equal(r.owner,3,'covering defender actually receives the blocked shot');
  assert.deepEqual(r.score,[0,0]);
  assert.ok(r.receipts.some(v=>v.team===0&&v.id===3));
 }
 const chance=ordinarySavedForwardShotCounter(60,.2);
 assert.ok(chance.saved);assert.equal(chance.shots.length,1);assert.equal(chance.end,'goal');
 assert.deepEqual(chance.score,[0,1],'earlier unblocked opportunity still scores');
});

test('ordinary consecutive passes clear supporting players once without alternating formation reversals',()=>{
 for(const [hz,width] of [[30,508],[60,1180],[120,508]]){
  const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height:757});
  h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match,decisions=[],poses=[],received=[];
  const avoid=m.avoidPassLane.bind(m),give=m.giveBall.bind(m);
  m.avoidPassLane=(p,dt)=>{const id=m.pendingKick?.id??m.flight?.id,r=avoid(p,dt);if(id===3&&p.id===2)decisions.push(r);return r;};
  m.giveBall=p=>{received.push(p.id);return give(p);};
  for(let frame=1;frame<=hz*3;frame++){
   if(frame%hz===1){h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));}
   h.tick(100+frame*1000/hz);
   if(m.elapsed>=2.2&&m.elapsed<=2.55)poses.push({...h.app.drawnPlayers.get(2)});
   h.draws.length=0;h.app.drawnPaths.length=0;
  }
  assert.deepEqual(received.slice(0,3),[6,3,1]);assert.equal(m.passes[0],3);
  assert.ok(decisions.some(Boolean));assert.ok(decisions.some(v=>!v));
  const flips=decisions.slice(1).filter((v,i)=>v!==decisions[i]).length;
  assert.ok(flips<=2,'one clearance phase, then normal support after the ball passes');
  const turning=poses.slice(1).reduce((sum,p,i)=>sum+Math.abs(Math.atan2(Math.sin(p.angle-poses[i].angle),Math.cos(p.angle-poses[i].angle))),0);
  assert.ok(turning<2.5,'rendered support no longer oscillates between opposing headings');
 }
});
function passClearanceFixture(team,period){
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
 const p=m.players[team*11+9],receiver=m.players[team*11+6],support=m.players[team*11+5],own=m.ownGoalX(team),d=m.direction(team);
 for(const q of m.players){q.x=550;q.y=FIELD.top+20;}
 Object.assign(p,{x:own+d*180,y:FIELD.cy,angle:d>0?0:Math.PI});
 Object.assign(receiver,{x:own+d*480,y:FIELD.cy});
 Object.assign(support,{x:own+d*300,y:FIELD.cy+3});
 m.giveBall(p);assert.ok(m.kick(p,{...receiver,receiverId:receiver.id,pass:true},.6,false));
 return {m,p,receiver,support,d};
}
test('pass clearance keeps its chosen side across the entry boundary and resets with delivery identity',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const {m,p,receiver,support,d}=passClearanceFixture(team,period);
  assert.ok(m.avoidPassLane(support,1/hz));const plan={...support.passLane};
  support.y=FIELD.cy+34;
  assert.ok(m.avoidPassLane(support,1/hz),'clearing the entry boundary does not resume conflicting formation movement');
  assert.equal(support.passLane.side,plan.side);
  support.y=FIELD.cy-.1;
  assert.ok(m.avoidPassLane(support,1/hz));assert.equal(support.passLane.side,plan.side,'minor lane rotation cannot flip the committed side');
  m.pendingKick.id++;support.y=FIELD.cy-3;
  assert.ok(m.avoidPassLane(support,1/hz));assert.ok(support.passLane.side!==plan.side,'new delivery chooses its own clearance side');
  m.pendingKick=null;m.flight=null;
  assert.ok(!m.avoidPassLane(support,1/hz));assert.equal(support.passLane,null);
  assert.ok(m.kick(p,{...receiver,receiverId:receiver.id,pass:true},.6,false));
  assert.ok(m.avoidPassLane(support,1/hz));
  m.ball.x=support.x+d*5;
  assert.ok(!m.avoidPassLane(support,1/hz));assert.equal(support.passLane,null,'ball passing the player releases cover immediately');
  m.kickoff(team);assert.ok(m.players.every(q=>q.passLane===null));
 }
});
test('pass clearance excludes receivers opponents keepers and shot deliveries',()=>{
 for(const kind of ['receiver','opponent','keeper','shot','turnover']){
  const {m,receiver,support}=passClearanceFixture(0,1);
  assert.ok(m.avoidPassLane(support,1/60));
  let p=support;
  if(kind==='receiver')p=receiver;
  if(kind==='opponent'){p=m.players[16];Object.assign(p,{x:support.x,y:support.y});}
  if(kind==='keeper'){p=m.players[0];Object.assign(p,{x:support.x,y:support.y});}
  if(kind==='shot')m.pendingKick.shot=true;
  if(kind==='turnover')m.giveBall(m.players[16]);
  const old={x:p.x,y:p.y};assert.ok(!m.avoidPassLane(p,1/60));assert.equal(p.passLane,null);
  assert.deepEqual({x:p.x,y:p.y},old);
 }
});

test('arrival tolerance settles the rendered gait while preserving movement planning and responsive restart',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const p=m.players[team*11+9];for(const q of m.players){q.x=200;q.y=FIELD.top+15+q.slot*3;}
  Object.assign(p,{x:550,y:318,gaitSpeed:90});m.giveBall(p);
  const input={teams:[{dx:0,dy:0},{dx:0,dy:0}]};input.teams[team]={target:{x:550.5,y:318}};
  let previous=p.gaitSpeed;const stride=p.stride;
  for(let i=0;i<hz/2;i++){
   m.step(1/hz,input);assert.equal(p.x,550);assert.equal(p.y,318);assert.equal(p.stride,stride);
   assert.ok(p.gaitSpeed<previous,'settling remains smooth');previous=p.gaitSpeed;
   assert.ok(Math.abs(p.speed-.5*hz)<1e-8,'planning speed is intentionally unchanged');
  }
  assert.ok(p.gaitSpeed<.1);assert.ok(m.snapshot().players[p.id].speed<.1);
  assert.ok(m.history[m.history.length-1].players[p.id].speed<.2,'replay records the settled pose');
  input.teams[team]={dx:1,dy:0};m.step(1/hz,input);
  assert.ok(p.x>550);assert.ok(p.stride>stride);assert.ok(p.gaitSpeed>1,'running resumes on the next input tick');
 }
});
test('ordinary pass clearance settles a stationary supporting player without changing actual reception',()=>{
 for(const hz of [30,60,120]){
  const h=uiHarness(html);h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;
  let sample=null;
  for(let frame=1;frame<=hz*2.45;frame++){
   if(frame%hz===1){h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));}
   h.tick(100+frame*1000/hz);
   if(m.elapsed>2.40){const p=m.players[2];sample={x:p.x,y:p.y,planned:p.speed,gait:p.gaitSpeed,pose:h.app.playerPose(h.app.drawnPlayers.get(2),h.app.drawnBall)};}
   h.draws.length=0;h.app.drawnPaths.length=0;
  }
  assert.ok(sample);assert.ok(sample.planned>20);assert.ok(sample.gait<sample.planned,'stationary clearance no longer sustains a running-speed floor');
  assert.equal(m.passes[0],3);
 }
});
test('arrival animation correction preserves simulation and bounds camera lead across ordinary solo local and shootout inputs',()=>{
 const baseline=html.replace('const poseSpeed=moved?p.speed:0;','const poseSpeed=p.speed;');
 const state=m=>JSON.stringify(m,(key,value)=>['gaitSpeed','bodyLean','turnLean','fromGait','history','replayFrames'].includes(key)?undefined:value);
 for(const [mode,hz,seconds] of [['practice',30,3],['practice',60,3],['practice',120,3],['local',60,1],['local',120,1],['shootout',60,1],['shootout',120,1]]){
  const a=uiHarness(html),b=uiHarness(baseline);
  for(const h of [a,b]){
   h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:hz===60?1180:508,height:757});
   h.chooseMode(mode==='local'?'multi':mode);if(mode==='local')h.click('startLocal');h.flush();h.tick(100);
  }
  for(let frame=1;frame<=hz*seconds;frame++){
   for(const h of [a,b]){
    if(frame%hz===1){const key=mode==='practice'?'e':mode==='local'?'f':' ';h.window.handlers.keydown(keyEvent(key));h.window.handlers.keyup(keyEvent(key));}
    h.tick(100+frame*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;
   }
   assert.equal(state(a.app.match),state(b.app.match),'positions, physics, decisions, ownership, timers and random state are unchanged');
   const ca=a.app.camera,cb=b.app.camera;
   assert.deepEqual(['zoom','yaw','tilt'].map(k=>ca[k]),['zoom','yaw','tilt'].map(k=>cb[k]));
   assert.ok(Math.hypot((ca.x-cb.x)*ca.zoom,(ca.y-cb.y)*ca.zoom)<1,'pose-speed camera lead changes remain below one screen pixel');
  }
  a.click('menuBtn');const frozen=a.app.match.snapshot();a.tick(10000);
  assert.equal(JSON.stringify(a.app.match.snapshot()),JSON.stringify(frozen),'pause never advances the settling animation');
  a.click('resumePause');a.click('menuBtn');a.click('restartMatch');a.flush();
  assert.ok(a.app.match.players.every(p=>p.gaitSpeed===0),'restart clears the previous gait');
 }
});

test('AI kickoffs reach varied safe outfield outlets across the full roster both teams and both halves',()=>{
 
const failures=[],outlets=new Set();let total=0;
for(let nation=0;nation<NATIONS.length;nation++)for(const period of [1,2])for(const team of [0,1]){
 const m=new SoccerMatch(NATIONS[nation],NATIONS[(nation+3)%NATIONS.length],'practice',23+nation*7);m.period=period;
 for(let repeat=0;repeat<3;repeat++){
  m.kickoff(team);let target=null,receipt=null;const release=m.releaseKick.bind(m),give=m.giveBall.bind(m);
  m.releaseKick=a=>{const v=release(a);target=m.flight?.receiverId;return v;};
  m.giveBall=p=>{if(target!==null&&!receipt)receipt={id:p.id,team:p.team,keeper:p.keeper};return give(p);};
  for(let i=0;i<360&&!receipt&&m.phase==='playing';i++)m.step(1/60,team===1?{dx:0,dy:0}:null);
  total++;if(!receipt||receipt.id!==target||receipt.team!==team||receipt.keeper)failures.push({nation,period,team,repeat,target,receipt,phase:m.phase});
  if(receipt)outlets.add(receipt.id%11);m.releaseKick=release;m.giveBall=give;
 }
}
assert.equal(total,384);assert.deepEqual(failures,[]);assert.deepEqual([...outlets].sort(),[5,6,7]);
});
test('AI ground kickoff delivery retains legal positioning timing and actual reception at 30 60 and 120 Hz',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const hz of [30,60,120]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.period=period;m.kickoff(team);
  const input=team===1?{dx:0,dy:0}:null,shape=m.players.map(p=>({x:p.x,y:p.y}));
  let target=null,received=null,contact=null;const release=m.releaseKick.bind(m),give=m.giveBall.bind(m);
  m.releaseKick=a=>{assert.equal(a.loft,false);const r=release(a);target=m.flight.receiverId;contact=m.elapsed;assert.equal(m.ball.vz,0);return r;};
  m.giveBall=p=>{if(target!==null&&!received)received=p;return give(p);};
  for(let i=0;i<hz*4&&!received;i++){
   m.step(1/hz,input);
   if(m.setPiece){assertSpreadKickoff(m);assert.deepEqual(m.players.map(p=>({x:p.x,y:p.y})),shape);}
  }
  assert.ok(contact>=1.175-1/hz-1e-8&&contact<1.21);assert.equal(received?.id,target);assert.equal(received?.keeper,false);assert.equal(received?.team,team);
  assert.equal(m.passes[team],1);assert.equal(m.setPiece,null);assert.ok(m.minute>0);
 }
});
test('kickoff outlet variety never overrides pressure clear lanes or advances random state',()=>{
 for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.period=period;m.kickoff(1);const p=m.owner,marker=m.players[9];
  marker.x=550-m.direction(1)*2;marker.y=FIELD.cy-92;m.enforceRestart();
  assert.equal(m.kickoffPass(p).id,18);m.kickoffOutlets[1][18]=99;
  const seed=m.seed;assert.equal(m.kickoffPass(p).id,18,'safer opposite outlet wins despite extensive prior use');assert.equal(m.seed,seed);
  // Adversarial planner fixture: cover the eligible lanes, independently of legal kickoff positioning.
  m.kickoff(1);const options=m.players.filter(q=>q.team===1&&!q.keeper&&q.id!==p.id&&distance(q,p)>=25&&distance(q,p)<=240);
  options.forEach((q,i)=>{m.players[i+1].x=(p.x+q.x)/2;m.players[i+1].y=(p.y+q.y)/2;m.players[i+1].speed=0;});
  assert.equal(m.kickoffPass(p),null,'no forced recipient when every lane is blocked');
  options.forEach((q,i)=>{m.players[i+1].x=q.x;m.players[i+1].y=q.y;});
  assert.equal(m.kickoffPass(p),null,'a clear lane cannot make a tightly marked receiver safe');
  m.players.slice(1,options.length+1).forEach(q=>{q.x=m.goalX(1);q.y=FIELD.top+15;});
  assert.ok(m.kickoffPass(p),'a safe option becomes available again');
 }
});
test('kickoff outlet history records contact once and resets only with a new match',()=>{
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.kickoff(1);const p=m.owner,q=m.kickoffPass(p);
 const seed=m.seed;for(let i=0;i<10;i++)assert.equal(m.kickoffPass(p).id,q.id);
 assert.equal(m.seed,seed);assert.deepEqual(m.kickoffOutlets,[{},{}]);
 m.kick(p,q,.75,false);m.pendingKick=null;assert.deepEqual(m.kickoffOutlets,[{},{}],'cancelled wind-up is not a used outlet');
 m.kick(p,q,.75,false);advanceToContact(m);assert.equal(m.kickoffOutlets[1][q.id],1);
 m.kickoff(1);assert.equal(m.kickoffOutlets[1][q.id],1);assert.ok(m.kickoffPass(m.owner).id!==q.id);
 m.phase='half';m.resumeHalf();assert.equal(m.kickoffOutlets[1][q.id],1);
 const fresh=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');assert.deepEqual(fresh.kickoffOutlets,[{},{}]);
});
test('a normal pointer goal automatic replay exit and opponent kickoff reach the intended midfielder',()=>{
 
const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:508,height:757});
h.chooseMode('practice');h.flush();const m=h.app.match,start=m.owner.id;
h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));
let received=false,shot=false,anchor=null,launch=null,reception=null;
const release=m.releaseKick.bind(m),give=m.giveBall.bind(m);
m.releaseKick=a=>{const kind=m.setPiece,r=release(a);if(kind==='Kick-off'&&a.player>=11)launch={at:m.elapsed,receiver:m.flight.receiverId,loft:a.loft};return r;};
m.giveBall=p=>{if(launch&&!reception)reception={id:p.id,keeper:p.keeper,team:p.team};return give(p);};
for(let frame=0;frame<1800&&!reception;frame++){
 if(m.phase==='playing'&&!shot){
  if(!received&&m.owner?.team===0&&m.owner.id!==start){received=true;anchor=h.app.camera.project(m.owner.x,m.owner.y);c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y));}
  if(received&&m.owner?.team===0){
   const p=m.owner,at=h.app.camera.project(p.x,p.y),range=p.x-FIELD.left;
   const dest=h.app.camera.project(range<180?FIELD.left:p.x-100,range<180?FIELD.cy+45:p.y-35);
   const len=Math.hypot(dest.x-at.x,dest.y-at.y),q={x:anchor.x+(dest.x-at.x)/len*160,y:anchor.y+(dest.y-at.y)/len*160};
   c.handlers.pointermove(pointerEvent(h,q.x,q.y));
   if(range<180){c.handlers.pointerup(pointerEvent(h,q.x,q.y));shot=true;}
  }
 }
 m.step(1/60,h.app.input());h.app.syncMatch();h.app.render(1/60);h.draws.length=0;h.app.drawnPaths.length=0;
}
assert.equal(m.score[0],1);assert.ok(launch);assert.equal(launch.loft,false);assert.equal(reception?.id,launch.receiver);assert.equal(reception?.keeper,false);assert.equal(reception?.team,1);
});
test('normal Cup clock halftime and Resume lead to an actual outfield opponent kickoff reception',()=>{
 
const h=uiHarness(html);h.elements.get('game').getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});
h.chooseMode('cup');h.click('startMatch');h.flush();h.tick(100);const m=h.app.match;
let half=false,launch=null,reception=null,frames=0;const release=m.releaseKick.bind(m),give=m.giveBall.bind(m);
m.releaseKick=a=>{const kind=m.setPiece,r=release(a);if(m.period===2&&kind==='Kick-off'&&a.player>=11&&!launch)launch={at:m.elapsed,receiver:m.flight.receiverId,loft:a.loft};return r;};
m.giveBall=p=>{if(launch&&!reception)reception={id:p.id,keeper:p.keeper,team:p.team};return give(p);};
for(let frame=1;frame<=6000&&!reception;frame++){
 frames=frame;
 if(m.phase==='playing'&&m.setPiece==='Kick-off'&&m.owner?.team===0&&!m.pendingKick){h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));}
 h.tick(100+frame*1000/30);h.draws.length=0;h.app.drawnPaths.length=0;
 if(m.phase==='half'){half=true;h.click('resume');}
}
assert.ok(half);assert.equal(m.period,2);assert.ok(m.minute>45);assert.ok(launch);assert.equal(launch.loft,false);assert.equal(reception?.id,launch.receiver);assert.equal(reception?.keeper,false);
});
test('AI kickoff change leaves goal kicks throw-ins corners and free kicks equivalent',()=>{
 const old=engine.replace("const kickoff=this.setPiece==='Kick-off',receiver=kickoff?this.kickoffPass(p):this.setPiece==='Goal Kick'?this.goalKickPass(p):this.bestPass(p);if(receiver)this.kick(p,receiver,.75,!kickoff);","const receiver=this.setPiece==='Goal Kick'?this.goalKickPass(p):this.bestPass(p);if(receiver)this.kick(p,receiver,.75,true);");
 const Baseline=new Function(old+';return SoccerMatch;')();
 for(const period of [1,2])for(const type of ['Goal Kick','Throw-in','Corner Kick','Direct Free Kick','Indirect Free Kick','Penalty Kick']){
  const a=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),b=new Baseline(NATIONS[0],NATIONS[2],'practice');
  for(const m of [a,b]){
   m.period=period;m.kickoff(0);
   const d=m.direction(1),r={type,team:1,x:type==='Goal Kick'?m.ownGoalX(1)+d*24:type==='Corner Kick'?m.goalX(1)-d*6:550,y:type==='Throw-in'||type==='Corner Kick'?FIELD.top:FIELD.cy};
   m.stopForRestart(r);m.takeRestart();
  }
  for(let i=0;i<300;i++){a.step(1/60,{dx:0,dy:0});b.step(1/60,{dx:0,dy:0});assert.equal(JSON.stringify(a),JSON.stringify(b),'unrelated restart remains identical');}
 }
});

function separationFixture(MatchClass,aPoint,bPoint,swap=false){
 const m=new MatchClass(NATIONS[0],NATIONS[2],'practice');m.giveBall(m.players[0]);m.ball.owner=null;m.ball.z=100;m.ball.x=550;m.ball.y=318;
 const a=m.players[swap?20:9],b=m.players[swap?9:20];
 for(const p of m.players){p.x=400+p.slot*25;p.y=250+p.team*130;p.cooldown=1;}
 Object.assign(a,aPoint);Object.assign(b,bPoint);m.lastRestart={type:'Throw-in',team:a.team,taker:a.id};
 return {m,a,b};
}
test('separation at throw-in and corner boundaries never teleports a stationary restart taker inward',()=>{
 const points=[
  [{x:550,y:FIELD.top},{x:550,y:FIELD.top+20}],
  [{x:550,y:FIELD.bottom},{x:550,y:FIELD.bottom-20}],
  [{x:FIELD.left,y:318},{x:FIELD.left+20,y:318}],
  [{x:FIELD.right,y:318},{x:FIELD.right-20,y:318}],
  [{x:FIELD.left+6,y:FIELD.top+6},{x:FIELD.left+20,y:FIELD.top+20}],
  [{x:FIELD.right-6,y:FIELD.bottom-6},{x:FIELD.right-20,y:FIELD.bottom-20}]
 ];
 for(const [ap,bp] of points)for(const swap of [false,true])for(const hz of [30,60,120]){
  const {m,a,b}=separationFixture(SoccerMatch,ap,bp,swap),push=(24-distance(a,b))*3/hz;
  m.step(1/hz,{dx:0,dy:0});
  assert.ok(distance(a,ap)<=push+1e-8,'restart taker moves only by the separation correction');
  assert.ok(distance(b,bp)<=push+1e-8);
  for(const p of [a,b]){assert.ok(p.x>=FIELD.left&&p.x<=FIELD.right);assert.ok(p.y>=FIELD.top&&p.y<=FIELD.bottom);}
 }
});
test('separation retains identical behavior for ordinary interior collisions',()=>{
 let old=engine;
 for(const p of ['a','b']){
  old=old.replace('Math.min(FIELD.left+12,'+p+'.x),Math.max(FIELD.right-12,'+p+'.x)','FIELD.left+12,FIELD.right-12');
  old=old.replace('Math.min(FIELD.top+12,'+p+'.y),Math.max(FIELD.bottom-12,'+p+'.y)','FIELD.top+12,FIELD.bottom-12');
 }
 const Baseline=new Function(old+';return SoccerMatch;')();
 for(const hz of [30,60,120])for(const swap of [false,true]){
  const a=separationFixture(SoccerMatch,{x:550,y:180},{x:567,y:187},swap);
  const b=separationFixture(Baseline,{x:550,y:180},{x:567,y:187},swap);
  for(let i=0;i<12;i++){a.m.step(1/hz,{dx:0,dy:0});b.m.step(1/hz,{dx:0,dy:0});assert.equal(JSON.stringify(a.m),JSON.stringify(b.m));}
 }
});
function normalTouchlineThrow(challenge=false){

const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});
h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;let f=0;
const tick=()=>{h.tick(100+(++f)*1000/60);h.draws.length=0;h.app.drawnPaths.length=0;};
h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<45;i++)tick();
h.window.handlers.keydown(keyEvent('a'));for(let i=0;i<210;i++)tick();h.window.handlers.keyup(keyEvent('a'));h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<180;i++)tick();h.window.handlers.keyup(keyEvent('w'));
if(m.owner?.team!==0)return {stage:'lost before exit',owner:m.owner?.id,phase:m.phase};
const p=m.owner,a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x,FIELD.top-160),anchor={x:a.x,y:a.y};
c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));const intent=h.app.pointerAim(h.app.drag);c.handlers.pointerup(pointerEvent(h,b.x,b.y));
const painted=[],trace=[],restarts=[],receipts=[],contacts=[],release=m.releaseKick.bind(m),give=m.giveBall.bind(m),stop=m.stopForRestart.bind(m);
m.stopForRestart=(r,...args)=>{restarts.push({at:m.elapsed,...r});return stop(r,...args);};
m.releaseKick=k=>{const kind=m.setPiece,r=release(k);contacts.push({at:m.elapsed,type:kind,player:k.player,target:m.flight?.target,receiver:m.flight?.receiverId,loft:k.loft});return r;};
m.giveBall=q=>{receipts.push({at:m.elapsed,id:q.id,team:q.team,keeper:q.keeper});return give(q);};
const check=m.checkChallenges.bind(m);m.checkChallenges=(before,dt)=>{if(contacts.some(q=>q.type==='Throw-in'))trace.push({at:m.elapsed,before,players:m.players.map(q=>({id:q.id,x:q.x,y:q.y,speed:q.speed,kickAt:q.kickAt})),active:m.active,ball:{...m.ball}});return check(before,dt);};
let challenged=false;for(let i=0;i<900;i++){tick();if(challenge&&!challenged&&contacts.some(q=>q.type==='Throw-in')){challenged=true;h.window.handlers.keydown(keyEvent('tab'));h.window.handlers.keydown(keyEvent('d'));h.window.handlers.keydown(keyEvent('w'));}if(contacts.some(q=>q.type==='Throw-in'))painted.push({at:m.elapsed,p:{...h.app.drawnPlayers.get(19)}});if(restarts.length>=2||contacts.some(q=>q.type==='Throw-in')&&receipts.some(q=>q.at>contacts.find(q=>q.type==='Throw-in').at))break;}
return {painted,trace,lastFoul:m.lastFoul,start:{x:p.x,y:p.y},intent,restarts,contacts,receipts,phase:m.phase,ball:m.ball};

}
test('ordinary midfield throw-in keeps the painted taker on the line and reaches the receiver without a spurious foul',()=>{
 const r=normalTouchlineThrow(),contact=r.contacts.find(q=>q.type==='Throw-in');
 assert.ok(contact);assert.equal(r.restarts.length,1);assert.equal(r.lastFoul,null);
 assert.equal(r.receipts[r.receipts.length-1].id,contact.receiver);
 const frames=r.painted.filter(q=>q.at<=contact.at+.12);assert.ok(frames.length>=5);
 assert.ok(frames.every(q=>Math.abs(q.p.y-FIELD.top)<1e-8),'canvas frame trace has no twelve-unit inward jump');
});
test('deliberate keyboard contact after the same throw-in remains a genuine late-challenge foul',()=>{
 const r=normalTouchlineThrow(true);
 assert.equal(r.lastFoul?.reason,'Late challenge');assert.equal(r.lastFoul?.offender,5);assert.equal(r.lastFoul?.victim,19);
 assert.equal(r.trace[r.trace.length-1].active,5,'offender is now deliberately human controlled');
 assert.equal(r.restarts[r.restarts.length-1].type,'Direct Free Kick');
});

function normalBylineGoalKick(aFrames=330,wFrames=120,lower=false,hz=60,source=html){
 const html=source;
 
const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});
h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;let f=0;
const tick=()=>{h.tick(100+(++f)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<Math.round(45*hz/60);i++)tick();
h.window.handlers.keydown(keyEvent('a'));for(let i=0;i<Math.round(aFrames*hz/60);i++)tick();h.window.handlers.keyup(keyEvent('a'));h.window.handlers.keydown(keyEvent(lower?'s':'w'));for(let i=0;i<Math.round(wFrames*hz/60);i++)tick();h.window.handlers.keyup(keyEvent(lower?'s':'w'));
if(m.owner?.team!==0)return {stage:'lost before exit',owner:m.owner?.id,phase:m.phase};
const p=m.owner,startPosition={id:p.id,x:p.x,y:p.y},a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(FIELD.left-160,p.y),anchor={x:a.x,y:a.y};
c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));const intent=h.app.pointerAim(h.app.drag);c.handlers.pointerup(pointerEvent(h,b.x,b.y));
const restarts=[],receipts=[],contacts=[],release=m.releaseKick.bind(m),give=m.giveBall.bind(m),stop=m.stopForRestart.bind(m);
m.stopForRestart=(r,...args)=>{restarts.push({at:m.elapsed,...r});return stop(r,...args);};
m.releaseKick=k=>{const kind=m.setPiece,r=release(k);contacts.push({at:m.elapsed,type:kind,player:k.player,target:m.flight?.target,receiver:m.flight?.receiverId,loft:k.loft,ball:{...m.ball},players:m.players.map(q=>({id:q.id,x:q.x,y:q.y}))});return r;};
m.giveBall=q=>{receipts.push({at:m.elapsed,id:q.id,team:q.team,keeper:q.keeper,x:q.x,y:q.y,ball:{...m.ball}});return give(q);};
for(let i=0;i<15*hz;i++){tick();if(restarts.length>=2||contacts.some(q=>q.type==='Goal Kick')&&receipts.some(q=>q.at>contacts.find(q=>q.type==='Goal Kick').at))break;}
return {start:startPosition,intent,restarts,contacts,receipts,phase:m.phase,ball:m.ball};

}

test('normal byline exits produce AI goal kicks to reachable unmarked midfield outlets',()=>{
 for(const [a,w,lower,hz] of [[330,120,false,30],[345,120,false,60],[330,120,true,60],[330,150,true,120]]){
  const r=normalBylineGoalKick(a,w,lower,hz),contact=r.contacts.find(c=>c.type==='Goal Kick');
  assert.ok(contact,'normal pointer exit awarded a goal kick');
  assert.equal(contact.player,11);assert.equal(contact.loft,true);
  assert.equal(contact.ball.vz,252.5,'unchanged loft and power');
  const receiver=contact.players.find(p=>p.id===contact.receiver);
  assert.ok(distance(contact.ball,receiver)<=430);
  const received=r.receipts.find(q=>q.at>contact.at);
  assert.equal(received?.id,contact.receiver,'intended teammate actually receives');
  assert.equal(received.team,1);assert.equal(received.keeper,false);
 }
});
test('AI goal-kick planning respects pressure and retains long clearances when nearby outlets are marked',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice');m.period=period;m.kickoff(team);
  const d=m.direction(team),p=m.players[team*11],near=m.players[team*11+6],far=m.players[team*11+8];
  m.stopForRestart({type:'Goal Kick',team,x:m.ownGoalX(team)+d*24,y:318});m.takeRestart();
  for(const q of m.players){q.x=m.ownGoalX(team)+d*34;q.y=318;}
  p.x=m.ownGoalX(team)+d*24;p.y=318;near.x=p.x+d*275;near.y=318;far.x=p.x+d*530;far.y=318;
  for(const q of m.players.filter(q=>q.team!==team)){q.x=p.x+d*440;q.y=FIELD.top+20;}
  assert.equal(m.bestPass(p).id,far.id,'unbounded progress ranking favours a distant forward');
  assert.equal(m.goalKickPass(p).id,near.id,'nearer open build-up receiver');
  const marker=m.players[(1-team)*11+1];marker.x=near.x;marker.y=near.y+20;
  assert.equal(m.goalKickPass(p).id,m.bestPass(p).id,'marked nearby outlet is not forced');
  marker.y=near.y+40;
  assert.equal(m.goalKickPass(p).id,near.id);
 }
});
test('AI goal-kick choice does not modify collisions or guarantee a reception',()=>{
 for(const team of [0,1])for(const period of [1,2]){
  const m=new SoccerMatch(NATIONS[0],NATIONS[2],'local');m.period=period;m.kickoff(team);
  const p=m.players[team*11],d=m.direction(team),receiver=m.players[team*11+6],blocker=m.players[(1-team)*11+6];
  m.stopForRestart({type:'Goal Kick',team,x:m.ownGoalX(team)+d*24,y:318});m.takeRestart();
  for(const q of m.players){q.x=550;q.y=FIELD.top+25;}
  p.x=m.ownGoalX(team)+d*24;p.y=318;receiver.x=p.x+d*275;receiver.y=318;
  const selected=m.goalKickPass(p);assert.equal(selected.id,receiver.id);
  m.kick(p,selected,.75,true);advanceToContact(m);
  // Fixture: a defender deliberately occupies the later landing path.
  const advance=new Function(engine+';return advanceFreeBall;')();
  const predicted={...m.ball};for(let i=0;i<84;i++)advance(predicted,1/120);
  blocker.x=predicted.x;blocker.y=predicted.y;blocker.cooldown=0;
  m.selectPlayer(1-team,blocker.id);
  let intercepted=false;
  for(let i=0;i<180&&!m.owner&&m.phase==='playing';i++){m.step(1/120,{dx:0,dy:0});if(m.owner?.id===blocker.id)intercepted=true;}
  assert.ok(intercepted,'normal opposing-player capture remains possible');
 }
});

test('goal-kick outlet preference leaves other AI restarts and local human restarts unchanged',()=>{
 const old=engine.replace("this.setPiece==='Goal Kick'?this.goalKickPass(p):this.bestPass(p)","this.bestPass(p)");
 const Baseline=new Function(old+';return SoccerMatch;')();
 for(const mode of ['practice','local'])for(const period of [1,2])
 for(const type of ['Kick-off','Goal Kick','Throw-in','Corner Kick','Direct Free Kick','Indirect Free Kick','Penalty Kick']){
  if(mode==='practice'&&type==='Goal Kick')continue;
  const a=new SoccerMatch(NATIONS[0],NATIONS[2],mode),b=new Baseline(NATIONS[0],NATIONS[2],mode);
  for(const m of [a,b]){
   m.period=period;m.kickoff(1);
   if(type!=='Kick-off'){
    const d=m.direction(1);
    m.stopForRestart({type,team:1,x:type==='Goal Kick'?m.ownGoalX(1)+d*24:type==='Corner Kick'?m.goalX(1)-d*6:550,y:type==='Throw-in'||type==='Corner Kick'?FIELD.top:FIELD.cy});
    m.takeRestart();
   }
   if(mode==='local'){
    const p=m.owner,target=m.bestPass(p,type!=='Throw-in');
    m.kick(p,target,.6,false);
   }
  }
  for(let i=0;i<240;i++){a.step(1/60,{dx:0,dy:0});b.step(1/60,{dx:0,dy:0});assert.equal(JSON.stringify(a),JSON.stringify(b),'unrelated action identical');}
 }
});

function normalThrowArmSequence(hz=60,width=1180,height=757,lower=false,source=html){
 const html=source;

const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width,height});
h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;let f=0;
const tick=()=>{h.tick(100+(++f)*1000/hz);h.draws.length=0;h.app.drawnPaths.length=0;};
h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<Math.round(hz*.75);i++)tick();
h.window.handlers.keydown(keyEvent(lower?'s':'w'));for(let i=0;i<hz*3;i++)tick();h.window.handlers.keyup(keyEvent(lower?'s':'w'));
if(m.owner?.team!==0)return {stage:'lost before exit',owner:m.owner?.id,phase:m.phase};
const p=m.owner,a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x,lower?FIELD.bottom+160:FIELD.top-160),anchor={x:a.x,y:a.y};
c.handlers.pointerdown(pointerEvent(h,anchor.x,anchor.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));const intent=h.app.pointerAim(h.app.drag);c.handlers.pointerup(pointerEvent(h,b.x,b.y));
const frames=[],restarts=[],receipts=[],contacts=[],release=m.releaseKick.bind(m),give=m.giveBall.bind(m),stop=m.stopForRestart.bind(m);
m.stopForRestart=(r,...args)=>{restarts.push({at:m.elapsed,...r});return stop(r,...args);};
m.releaseKick=k=>{const kind=m.setPiece,r=release(k);contacts.push({at:m.elapsed,type:kind,player:k.player,target:m.flight?.target,receiver:m.flight?.receiverId,loft:k.loft,ball:{...m.ball},players:m.players.map(q=>({id:q.id,x:q.x,y:q.y}))});return r;};
m.giveBall=q=>{receipts.push({at:m.elapsed,id:q.id,team:q.team,keeper:q.keeper,x:q.x,y:q.y});return give(q);};
for(let i=0;i<hz*15;i++){tick();const contact=contacts.find(q=>q.type==='Throw-in');if(contact){const p=h.app.drawnPlayers.get(contact.player),pose=h.app.playerPose(p,h.app.drawnBall),world=h.app.playerWorldTransform(p,pose),hands=h.app.playerSkeleton(p,pose).arms.map(a=>world(a.hand)),screen=hands.map(q=>h.app.camera.project(...q));frames.push({at:m.elapsed-contact.at,p:{...p},hands,screen,ball:{...h.app.drawnBall}});}if(restarts.length>=2||contacts.some(q=>q.type==='Throw-in')&&receipts.some(q=>q.at>contacts.find(q=>q.type==='Throw-in').at))break;}
return {frames,start:{x:p.x,y:p.y},intent,restarts,contacts,receipts,phase:m.phase,ball:m.ball};

}

function beforeThrowRecovery(){return html.replace("const rawKick=(p.strike!==undefined?strikePose(p.strike):posePulse(p.kick||0))*settle;\n  const throwProgress=p.throwing&&p.strikePhase==='follow'?clamp((p.strike-.3)/.7,0,1):0;\n  const throwing=p.throwing?1-poseEase(throwProgress):0;","const rawKick=(p.strike!==undefined?strikePose(p.strike):posePulse(p.kick||0))*settle,throwing=p.throwing?1:0;").replace('cycle,stride,kick:throwing?0:kick,throwing,throwProgress,save,receive,hold,','cycle,stride,kick:throwing?0:kick,throwing,save,receive,hold,').replace("if(pose.throwing){\n      // Follow the released ball with both arms, then ease back to the live pose.\n      // The throw's contact clock and physical ball are unchanged.\n      const reach=Math.sin(Math.PI*(pose.throwProgress||0));\n      const throwElbow=[side*5,-2+reach*4,31],throwHand=[side*1.8,-1+reach*8,36];\n      for(let i=0;i<3;i++){elbow[i]+=(throwElbow[i]-elbow[i])*pose.throwing;hand[i]+=(throwHand[i]-hand[i])*pose.throwing;}\n    }","if(pose.throwing){elbow[0]=side*5;elbow[1]=-2;elbow[2]=31;hand[0]=side*1.8;hand[1]=-1;hand[2]=36;}");}

test('ordinary throw-ins lower both arms continuously after release at 30 60 and 120 Hz',()=>{
 for(const [hz,lower] of [[30,false],[60,false],[120,false],[60,true]]){
  const r=normalThrowArmSequence(hz,1180,757,lower),contact=r.contacts.find(c=>c.type==='Throw-in');
  assert.ok(contact);assert.equal(r.receipts[r.receipts.length-1].id,contact.receiver);
  assert.ok(r.frames.some(f=>f.p.throwing)&&r.frames.some(f=>!f.p.throwing));
  let movement=0;
  for(let i=1;i<r.frames.length;i++){
   const a=r.frames[i-1],b=r.frames[i];if(b.at>.6)break;
   for(const side of [0,1]){
    const delta=Math.hypot(...b.hands[side].map((v,j)=>v-a.hands[side][j]));
    assert.ok(delta<120/hz,'no single-frame overhead-to-rest hand drop');
    if(side===0)movement+=delta;
   }
  }
  assert.ok(movement>8,'follow-through actually returns the arms to rest');
 }
});
test('throw recovery changes rendered arms only while contacts receptions ball and player frames remain identical',()=>{
 const before=normalThrowArmSequence(60,1180,757,false,beforeThrowRecovery()),after=normalThrowArmSequence();
 assert.deepEqual(after.contacts,before.contacts);assert.deepEqual(after.receipts,before.receipts);
 assert.deepEqual(after.restarts,before.restarts);
 assert.deepEqual(after.frames.map(f=>({at:f.at,p:f.p,ball:f.ball})),before.frames.map(f=>({at:f.at,p:f.p,ball:f.ball})));
 const jump=r=>Math.max(...r.frames.slice(1).map((b,i)=>Math.hypot(...b.hands[0].map((v,j)=>v-r.frames[i].hands[0][j]))));
 assert.ok(jump(before)>10);assert.ok(jump(after)<1);
});
test('local throw follow-through stays continuous in replay and pause and clears on restart in both halves',()=>{
 for(const team of [0,1])for(const period of [1,2])for(const [width,height] of [[1180,757],[333,596]]){
  const h=localAimHarness(width,height,team,period),m=h.app.match;
  m.stopForRestart({type:'Throw-in',team,x:550,y:team===0?FIELD.top:FIELD.bottom});m.takeRestart();h.app.syncMatch();h.app.render(0);
  const p=m.owner,r=m.players[team*11+6];r.x=p.x+m.direction(team)*150;r.y=p.y+(team===0?150:-150);
  h.window.handlers.keydown(keyEvent(team===0?'f':'k'));h.window.handlers.keyup(keyEvent(team===0?'f':'k'));
  assert.ok(m.pendingKick);advanceToContact(m);const records=[m.snapshot()];
  for(let i=0;i<30;i++){m.step(1/120,h.app.input());records.push(m.snapshot());}
  h.app.render(0);const q=h.app.drawnPlayers.get(p.id),pose=h.app.playerPose(q,h.app.drawnBall);
  assert.ok(pose.throwing>0&&pose.throwing<1);
  const hands=h.app.playerSkeleton(q,pose).arms.map(a=>a.hand);
  h.click('menuBtn');const snapshot=JSON.stringify(m.snapshot());h.tick(3000);h.app.render(0);
  assert.equal(JSON.stringify(m.snapshot()),snapshot);
  const paused=h.app.drawnPlayers.get(p.id);
  assert.deepEqual(h.app.playerSkeleton(paused,h.app.playerPose(paused,h.app.drawnBall)).arms.map(a=>a.hand),hands);
  h.click('resumePause');
  for(let i=0;i<25;i++){m.step(1/120,h.app.input());records.push(m.snapshot());}
  let prior=null;
  for(let i=0;i<=120;i++){
   const frame=h.app.replaySample(records,i/120),q=frame.players[p.id],pose=h.app.playerPose(q,frame.ball),arms=h.app.playerSkeleton(q,pose).arms;
   const points=arms.flatMap(a=>a.hand);assert.ok(points.every(Number.isFinite));
   if(prior)assert.ok(Math.hypot(...points.map((v,j)=>v-prior[j]))<1.2,'recorded recovery has no pose-flag snap');
   prior=points;
  }
  h.click('menuBtn');h.click('restartMatch');h.flush();h.app.render(0);
  assert.ok(h.app.match.snapshot().players.every(p=>!p.throwing));
 }
});

function normalFoulPoseSequence(source=html,recordState=false){
const html=source;const h=uiHarness(html),c=h.elements.get('game');c.getBoundingClientRect=()=>({left:0,top:0,width:1180,height:757});
h.chooseMode('practice');h.flush();h.tick(100);const m=h.app.match;let frame=0;
const frames=[],events=[];let foul=null;
const tick=()=>{h.tick(100+(++frame)*1000/60);if(m.lastFoul){foul||={...m.lastFoul};const p=h.app.drawnPlayers.get(foul.victim),pose=h.app.playerPose(p,h.app.drawnBall);frames.push({frame,time:frame/60,elapsed:m.elapsed,phase:m.phase,setPiece:m.setPiece,raw:p.fouled,pose:pose.fouled,owner:m.ball.owner,state:recordState?JSON.stringify(m,(k,v)=>['foulAt','fouled','history','replayFrames'].includes(k)?undefined:v):null,head:h.app.playerWorldTransform(p,pose)([0,0,30])});}h.draws.length=0;h.app.drawnPaths.length=0;};
h.window.handlers.keydown(keyEvent('e'));h.window.handlers.keyup(keyEvent('e'));for(let i=0;i<45;i++)tick();
h.window.handlers.keydown(keyEvent('w'));for(let i=0;i<30;i++)tick();h.window.handlers.keyup(keyEvent('w'));
const p=m.owner,a=h.app.camera.project(p.x,p.y),b=h.app.camera.project(p.x,FIELD.top-160);
c.handlers.pointerdown(pointerEvent(h,a.x,a.y));c.handlers.pointermove(pointerEvent(h,b.x,b.y));c.handlers.pointerup(pointerEvent(h,b.x,b.y));
for(let i=0;i<1000;i++){tick();if(foul&&m.elapsed-foul.at>.8)break;}
return {foul,frames,score:m.score,phase:m.phase,ball:m.ball};
}

test('a normal late challenge reacts during its notice rather than on the free-kick taker afterward',()=>{
 const r=normalFoulPoseSequence();
 assert.equal(r.foul.reason,'Late challenge');
 const stopped=r.frames.filter(f=>f.phase==='restart'),resumed=r.frames.filter(f=>f.phase==='playing');
 assert.ok(stopped.length>60);assert.ok(Math.max(...stopped.map(f=>f.pose))>.95);
 assert.ok(stopped.slice(-20).every(f=>f.pose===0),'reaction settles before restart');
 assert.ok(resumed.length>20&&resumed.every(f=>f.pose===0),'no delayed foul pose during free-kick setup');
 assert.ok(stopped.every(f=>f.elapsed===r.foul.at),'notice still freezes simulation time');
 assert.equal(resumed[0].setPiece,'Direct Free Kick');
});
test('foul presentation preserves normal-input physical state decisions clocks and restart timing',()=>{
 const old=html.replace("    // A stopped foul reaction has finished before the restart is set up.\n    for(const p of this.players)p.foulAt=-100;\n",'').replace('  shot=restartFoulFrame(shot,match,restartCountdown);','');
 const a=normalFoulPoseSequence(old,true),b=normalFoulPoseSequence(html,true);
 assert.deepEqual(a.foul,b.foul);assert.deepEqual(a.ball,b.ball);assert.deepEqual(a.score,b.score);
 assert.deepEqual(a.frames.map(f=>({frame:f.frame,phase:f.phase,state:f.state})),b.frames.map(f=>({frame:f.frame,phase:f.phase,state:f.state})));
 assert.ok(a.frames.filter(f=>f.phase==='restart').every(f=>f.pose===0));
 assert.ok(Math.max(...a.frames.filter(f=>f.phase==='playing').map(f=>f.pose))>.95);
});
test('foul reaction presentation is bounded at 30 60 and 120 Hz in both local halves and viewports',()=>{
 for(const hz of [30,60,120])for(const team of [0,1])for(const period of [1,2])for(const penalty of [false,true]){
  const [width,height]=team===0?[1180,757]:[333,596],h=localAimHarness(width,height,team,period),m=h.app.match;
  const p=m.players[team*11+9],offender=m.players[(1-team)*11+9];
  p.x=penalty?m.goalX(team)-m.direction(team)*70:550;p.y=318;
  m.giveBall(p);m.foul(offender,p,'Late challenge');h.app.syncMatch();h.tick(100);
  let peak=0;for(let frame=1;frame<=Math.ceil(hz*1.3);frame++){
   h.tick(100+frame*1000/hz);const q=h.app.drawnPlayers.get(p.id),pose=h.app.playerPose(q,h.app.drawnBall);
   assert.ok(Number.isFinite(pose.fouled));
   if(m.phase==='restart')peak=Math.max(peak,pose.fouled);
   else assert.equal(pose.fouled,0);
   h.draws.length=0;h.app.drawnPaths.length=0;
  }
  assert.ok(peak>.95);assert.equal(m.setPiece,penalty?'Penalty Kick':'Direct Free Kick');
  assert.equal(m.players[p.id].foulAt,-100);
  const history=m.history.slice();assert.ok(history.every(s=>s.players.every(p=>p.fouled===0)));
  h.click('menuBtn');const snapshot=JSON.stringify(m.snapshot());h.tick(5000);assert.equal(JSON.stringify(m.snapshot()),snapshot);
  h.click('resumePause');h.click('menuBtn');h.click('restartMatch');h.flush();
  assert.ok(h.app.match.snapshot().players.every(p=>p.fouled===0));
 }
});
test('foul notice rendering does not mutate snapshots or replay completed reactions on advantage recall',()=>{
 const source=html.slice(html.indexOf('function restartFoulFrame('),html.indexOf('function playerPose('));
 const paint=new Function('clamp',source+';return restartFoulFrame;')((v,a,b)=>Math.max(a,Math.min(b,v)));
 const m=new SoccerMatch(NATIONS[0],NATIONS[2],'practice'),p=m.players[9],opponent=m.players[20];
 m.giveBall(p);m.foul(opponent,p,'Late challenge');const snapshot=m.snapshot(),before=JSON.stringify(snapshot);
 const painted=paint(snapshot,m,.9);
 assert.ok(painted.players[p.id].fouled>0&&painted.players[p.id].fouled<1);
 assert.equal(JSON.stringify(snapshot),before);
 for(const phase of ['playing','paused','replay','goal','half','full'])assert.equal(paint(snapshot,{...m,phase},.9),snapshot);
 assert.equal(paint(snapshot,{...m,restart:{type:'Throw-in'}},.9),snapshot);
 assert.equal(paint(snapshot,{...m,elapsed:m.elapsed+2},1.2).players[p.id].fouled,0,'recalled advantage is not a new foul contact');
 m.takeRestart();assert.ok(m.snapshot().players.every(p=>p.fouled===0));
});
