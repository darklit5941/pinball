const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const noop=()=>{},elements={};
const ctx=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
const el=k=>elements[k]||={textContent:'',style:{},classList:{add:noop,remove:noop,toggle:noop},querySelector:q=>el(k+q),listeners:{},addEventListener(type,fn){this.listeners[type]=fn},focus:noop,showModal(){this.open=true},close(){this.open=false;this.listeners.close?.()},getContext:()=>ctx};
const sandbox={URLSearchParams,location:{search:''},console,Math,document:{querySelector:el,querySelectorAll:q=>q==='.mission'?[el('m0'),el('m1'),el('m2')]:[],addEventListener:noop},window:{addEventListener:noop},localStorage:{getItem:()=>0,setItem:noop},requestAnimationFrame:noop,matchMedia:()=>({matches:true})};
const source=fs.readFileSync(require.resolve('../game.js'),'utf8').replace('ui();requestAnimationFrame(frame);',`globalThis.p={start,launch,update,draw,pause,input,flippers,shotVelocity,enterRoute,reactorHit,drain,beginMultiball,makeBall,resetReactor,bossX,vulnerable,bossStep,boss,settings,difficultyFor,
 readyHit(b){reactor.exposedUntil=time+20;reactor.charged=[true,true];combo=4;lastHit=time;b.x=bossX()+(reactor.nextSide===0?-10:10);},
 drop(x,y,vx=0,vy=100){start();lives=3;reactor.armor=reactor.max=3;muted=true;saveUntil=0;launchPending=false;balls=[makeBall(x,y,vx,vy)];ball=balls[0]},
 setTime(t){time=t},get:()=>({balls,lives,launchPending,state,score,time,saveUntil,reactor,locks,multiball,relay,jackpotSide,jackpotCount})};`);
vm.runInNewContext(source,sandbox);const p=sandbox.p;
function step(seconds,check=noop){for(let i=0;i<seconds*180;i++){p.update(1/180);check(p.get());if(p.get().launchPending)break}}
for(const x of [285,300,315]){p.drop(x,620);step(3);assert.equal(p.get().lives,2,`centre ${x}`)}
for(const x of [95,120,150,450,480,505]){p.drop(x,610);let reached=false;step(8,s=>{if(s.launchPending)return;for(const b of s.balls){if(b.y>660&&b.y<725&&b.x>165&&b.x<435)reached=true;if(b.y>725)assert(b.x>190&&b.x<410,`rear escape ${x}`)}});assert(reached);assert.equal(p.get().lives,2)}
for(const [x,key] of [[230,'left'],[370,'right']]){p.drop(x,670,0,220);p.input[key]=true;let saved=false;step(.4,s=>{if(s.balls[0].vy<-300)saved=true});assert(saved)}
console.log('PASS: 3 centre drains, 6 guided returns, 2 timed saves');
// Contact locations give genuinely different trajectories, mirrored across both sides.
for(const f of p.flippers){const early=p.shotVelocity(f,.2),middle=p.shotVelocity(f,.5),late=p.shotVelocity(f,.8);assert(early.vx*f.side>300);assert(Math.abs(middle.vx)<1);assert(late.vx*f.side<-300);assert(early.vy<-700)}
// Rail entry is detected by the real physics crossing; ball follows rail then releases opposite.
p.drop(110,432,0,-650);step(.02);assert(p.get().balls[0].route);step(2.1);let b=p.get().balls[0];assert(!b.route);assert(b.x>350&&b.x<410);assert.equal(p.get().relay,1);
// A slow failed ramp shot must remain on the playfield.
p.drop(490,432,0,-100);step(.05);assert(!p.get().balls[0].route);
// Two locks create three distinct balls; a jackpot alternates its lit destination.
p.drop(490,432,0,-650);step(.02);assert.equal(p.get().locks,1);p.enterRoute(p.get().balls[0],1);assert.equal(p.get().balls.length,3);assert(p.get().multiball);
p.enterRoute(p.get().balls[0],0);assert.equal(p.get().jackpotCount,1);assert.equal(p.get().jackpotSide,1);
p.setTime(10);p.drain(p.get().balls[1]);assert.equal(p.get().lives,3);assert.equal(p.get().balls.length,2);p.drain(p.get().balls[1]);assert(!p.get().multiball);assert.equal(p.get().lives,3);p.drain(p.get().balls[0]);assert.equal(p.get().lives,2);
// Three armour hits open the core; a separate fourth hit breaks it and advances the level.
p.drop(300,400);for(let i=0;i<3;i++){p.setTime(i+1);p.reactorHit(p.get().balls[0])}assert.equal(p.get().reactor.armor,0);assert.equal(p.get().reactor.level,1);p.setTime(4);p.reactorHit(p.get().balls[0]);assert.equal(p.get().reactor.level,2);assert.equal(p.get().lives,4);
// Relay requires the two routes in order followed by the core, then pays only once.
p.drop(300,600);p.enterRoute(p.get().balls[0],0);p.enterRoute(p.get().balls[0],1);assert.equal(p.get().relay,2);const before=p.get().score;p.reactorHit(p.get().balls[0]);assert.equal(p.get().relay,0);assert(p.get().score>=before+3000);
// Save never grants a new seven-second window on drain.
p.start();p.launch();const deadline=p.get().saveUntil;p.setTime(6);p.drain(p.get().balls[0]);assert.equal(p.get().saveUntil,deadline);p.setTime(11);p.drain(p.get().balls[0]);assert.equal(p.get().lives,4);
p.drop(300,600);p.pause();const frozen=p.get().time;p.update(1);assert.equal(p.get().time,frozen);p.pause();assert.equal(p.get().state,'playing');
// Exercise rendering and extended multiball simulation with finite state assertions.
p.drop(300,500);p.beginMultiball();for(let i=0;i<180*30;i++){p.input.left=i%85<40;p.input.right=i%100<50;p.update(1/180);if(i%6===0)p.draw();for(const b of p.get().balls)assert([b.x,b.y,b.vx,b.vy].every(Number.isFinite));if(p.get().launchPending)p.launch();if(p.get().state==='over')break}
console.log('PASS: aiming, rail travel, missed ramp, locks, jackpots, multiball lives, armour, relay, finite save, pause, render/simulation');

// A normal launch cannot immediately award a free ramp lock.
p.start();p.launch();step(.2);assert.equal(p.get().locks,0);
// Slow magnet deliveries can be cradled; releasing the key frees the ball.
p.drop(380,645,0,70);p.flippers[1].a=Math.PI+.48;p.input.right=true;step(.15);assert.equal(p.get().balls[0].held,1);p.input.right=false;step(.02);assert.equal(p.get().balls[0].held,-1);
console.log('PASS: no free opening lock, cradle and release');

// Help pauses live play and restores only the state that was active before opening.
p.start();elements['#help-open'].onclick();assert.equal(p.get().state,'paused');assert(elements['#help-dialog'].open);const helpTime=p.get().time;p.update(1);assert.equal(p.get().time,helpTime);elements['#help-close'].onclick();assert.equal(p.get().state,'playing');
p.pause();elements['#help-open'].onclick();elements['#help-done'].onclick();assert.equal(p.get().state,'paused');
console.log('PASS: instructions dialog pauses play, resumes correctly, preserves existing pause');

// Thirty sequential stages: ten species, three fixed difficulty tiers, no selector.
p.start();assert.equal(p.get().reactor.level,1);assert.equal(p.get().lives,5);
const hp=[],windows=[],seen=[];
for(let stage=1;stage<=30;stage++){
 assert.equal(p.get().reactor.level,stage);
 assert.equal(p.difficultyFor(stage),stage<=10?'easy':stage<=20?'normal':'hard');
 hp.push(p.get().reactor.max);windows.push(p.settings().window);seen.push(p.boss().name);p.draw();
 const count=p.get().reactor.max+1;
 for(let n=0;n<count;n++){
  const b=p.get().balls[0];
  // Time in separate roar cycles to cover every possible HP count.
  p.setTime(p.get().reactor.entered+n*8+7.1);p.readyHit(b);p.reactorHit(b);
 }
 if(stage<30){assert.equal(p.get().reactor.level,stage+1);assert.equal(p.get().state,'playing');const t=p.get().time;p.update(.2);assert.equal(p.get().time,t)}
}
assert.equal(new Set(seen.slice(0,10)).size,10);assert(hp[0]<hp[10]&&hp[10]<hp[20]);assert(windows[0]>windows[10]&&windows[10]>windows[20]);assert.equal(p.get().state,'won');assert.equal(p.get().reactor.level,30);p.draw();p.start();assert.equal(p.get().reactor.level,1);
// Specific gating mechanics must actually reject incorrect attacks.
for(const level of [5,6,15,16,25,26]){p.drop(300,600);p.resetReactor(level);const before=p.get().reactor.armor,b=p.get().balls[0],side=level%10===5?0:1;p.setTime(1);p.reactorHit(b);assert.equal(p.get().reactor.armor,before);p.enterRoute(b,1-side);assert(!p.vulnerable(b));p.enterRoute(b,side);assert(p.vulnerable(b));p.setTime(2);p.reactorHit(b);assert.equal(p.get().reactor.armor,before-1);}
p.drop(300,600);p.resetReactor(7);b=p.get().balls[0];b.x=310;p.setTime(1);const armor=p.get().reactor.armor;p.reactorHit(b);assert.equal(p.get().reactor.armor,armor);b.x=290;p.setTime(2);p.reactorHit(b);assert.equal(p.get().reactor.armor,armor-1);assert.equal(p.get().reactor.nextSide,1);
p.drop(300,600);p.resetReactor(8);assert(!p.vulnerable());p.readyHit(p.get().balls[0]);assert(p.vulnerable());p.setTime(5);assert(!p.vulnerable());
p.drop(300,600);p.resetReactor(9);assert(!p.vulnerable());p.readyHit(p.get().balls[0]);assert(p.vulnerable());p.reactorHit(p.get().balls[0]);assert(!p.vulnerable());
p.drop(300,600);p.resetReactor(30);p.setTime(7);assert(!p.vulnerable());p.enterRoute(p.get().balls[0],0);assert(p.vulnerable());p.setTime(8.2);assert(!p.vulnerable());
console.log('PASS: all 30 sequential stages, tier boundaries, ten distinct bosses, escalating parameters, specialized shields, final victory, restart at stage 1');
