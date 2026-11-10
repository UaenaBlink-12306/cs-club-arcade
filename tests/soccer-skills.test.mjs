import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html=readFileSync(new URL('../public/soccer-skills/index.html',import.meta.url),'utf8')
const engine=html.split('// BEGIN SOCCER ENGINE')[1].split('// END SOCCER ENGINE')[0]
const {SoccerMatch,NATIONS,FIELD,distance}=new Function(engine+';return {SoccerMatch,NATIONS,FIELD,distance};')()


function uiHarness(html){
  const elements=new Map(),timers=new Map();let tid=0,animation=null;
  const drawing=new Proxy({}, {get:(_,key)=>key==='canvas'?{}:(()=>{}),set:()=>true});
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
    script+'\nreturn {get match(){return match},get view(){return view},get round(){return round},get champion(){return champion},setTeam,startMatch,syncMatch,continueCup,frame};'
  )(document,window,(fn)=>{timers.set(++tid,fn);return tid;},id=>timers.delete(id),fn=>{animation=fn;});
  return {app,elements,go,penalties,document,window,flush(){let n=0;while(timers.size&&n++<50){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}},
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
 assert.ok(h.app.match.ball.vy>0);assert.ok(Math.abs(h.app.match.ball.vx)<.01);
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
