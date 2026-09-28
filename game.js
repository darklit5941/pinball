(() => {
'use strict';
const $ = s => document.querySelector(s), canvas = $('#game'), ctx = canvas.getContext('2d');
const W = 600, H = 800, C = ['#65f8de','#ff69ad','#f8d377'];
const input = {left:false,right:false};
let demo = new URLSearchParams(location.search).has('demo'), demoDelay=0;
const difficulties={easy:{name:'簡單',lives:5,hp:-1,window:12,save:10,speed:.75,roar:4},normal:{name:'普通',lives:3,hp:0,window:8,save:7,speed:1,roar:3},hard:{name:'困難',lives:2,hp:2,window:5,save:4,speed:1.3,roar:2}};
const difficultyFor=level=>level<=10?'easy':level<=20?'normal':'hard';const settings=()=>difficulties[difficultyFor(reactor?.level||1)];const bestKey=()=> 'flux-dino-campaign-30';
let state='ready', score=0, best=0, lives=3, time=0, combo=0, lastHit=-99;
let balls=[], ball=null, nextId=0, launchPending=false, saveUntil=0, newLife=true;
let particles=[], texts=[], shake=0, toastTime=0, muted=false, audio=null;
let reactor, locks=0, multiball=false, jackpotSide=0, jackpotCount=0, relay=0, relayUntil=0, routesMade=0;
const flippers=[{x:178,y:688,len:95,a:.48,side:1},{x:422,y:688,len:95,a:Math.PI-.48,side:-1}];
const bumps=[{x:205,y:332,r:28,color:C[0]},{x:395,y:332,r:28,color:C[1]}];
// The lower walls meet the pivot caps: no unplayable gaps behind the flippers.
const walls=[[178,688,37,585],[37,585,37,175],[37,175,65,105],[65,105,140,65],[140,65,460,65],[460,65,535,110],[535,110,563,185],[563,185,563,585],[563,585,422,688],[85,470,155,590],[155,590,108,570],[515,470,445,590],[445,590,492,570]];
// Elevated rails are isolated from the playfield after a successful entrance shot.
const paths=[[[110,430],[85,325],[80,195],[115,125],[220,92],[365,100],[472,160],[506,290],[478,460],[430,580],[380,650]],[[490,430],[514,320],[510,195],[457,137],[355,132],[240,174],[137,275],[112,400],[145,536],[190,610],[220,650]]];
try{best=Number(localStorage.getItem(bestKey()))||0}catch{}
$('#best').textContent=best.toLocaleString();
const bosses=[
 {name:'三角龍',en:'TRICERATOPS',zone:'蕨林入口',color:'#79e8a3',hp:3,mode:'direct',shape:1,rule:'擊碎角盾，再命中一次擊退；受擊會反衝。'},
 {name:'劍龍',en:'STEGOSAURUS',zone:'琥珀峽谷',color:'#ffc16b',hp:4,mode:'route',shape:2,rule:'先打進任一球道，讓背甲露出限時弱點，再攻擊中央。'},
 {name:'迅猛龍',en:'VELOCIRAPTOR',zone:'暴雨獵場',color:'#bc9aff',hp:3,mode:'moving',shape:3,rule:'Boss 會左右疾走；預判位置，擊破護甲後再命中。'},
 {name:'暴龍',en:'TYRANNOSAURUS',zone:'火山王座',color:'#ff7f73',hp:5,mode:'roar',shape:4,rule:'怒吼後短暫露出弱點；避開封閉期，準備下一次進攻。'},
 {name:'甲龍',en:'ANKYLOSAURUS',zone:'玄武岩堡壘',color:'#93bcdc',hp:4,mode:'left',shape:2,rule:'厚甲免傷；打進左環道，才會露出側腹弱點。'},
 {name:'梁龍',en:'DIPLODOCUS',zone:'巨木河谷',color:'#74d9cb',hp:4,mode:'right',shape:1,rule:'打進右坡道，引導巨獸低頭，再攻擊中央。'},
 {name:'棘龍',en:'SPINOSAURUS',zone:'潮汐沼澤',color:'#80b8ff',hp:5,mode:'alternate',shape:4,rule:'交替命中 Boss 的左半與右半；同側連擊無效。'},
 {name:'厚頭龍',en:'PACHYCEPHALOSAURUS',zone:'碎石高原',color:'#f3b18b',hp:4,mode:'combo',shape:3,rule:'先累積 4 連擊，再趁連擊尚未中斷時攻擊。'},
 {name:'副櫛龍',en:'PARASAUROLOPHUS',zone:'回聲湖畔',color:'#dd9fdc',hp:5,mode:'bumpers',shape:1,rule:'打亮左右兩顆彈跳器才能造成一次傷害，每次需重新充能。'},
 {name:'南方巨獸龍',en:'GIGANOTOSAURUS',zone:'終焉火山',color:'#ff687c',hp:6,mode:'final',shape:4,rule:'先完成球道，再於怒吼後的弱點時間攻擊移動中的 Boss。'}
];
let transition=0;
function boss(){return bosses[(reactor.level-1)%10]}
function bossPhase(){return (time-reactor.entered)%8}
function bossX(){return ['moving','final'].includes(boss().mode)?300+Math.sin((time-reactor.entered)*1.7*settings().speed)*76:300}
function vulnerable(b){const mode=boss().mode;const exposed=time<reactor.exposedUntil,roar=bossPhase()>=8-settings().roar;if(['route','left','right'].includes(mode))return exposed;if(mode==='roar')return roar;if(mode==='final')return roar&&exposed;if(mode==='combo')return combo>=4&&time-lastHit<4;if(mode==='bumpers')return reactor.charged.every(Boolean);if(mode==='alternate')return !b||(b.x<bossX()?0:1)===reactor.nextSide;return true}
function bossHint(){const mode=boss().mode;if(['route','left','right'].includes(mode))return vulnerable()?'弱點開啟 '+Math.max(0,reactor.exposedUntil-time).toFixed(1)+'s':'先打進'+(mode==='left'?'左環道':mode==='right'?'右坡道':'任一球道')+'解除防禦';if(['roar','final'].includes(mode)){const wait=8-settings().roar-bossPhase();return (mode==='final'&&time>=reactor.exposedUntil?'先完成球道 · ':'')+(wait<=0?'怒吼後弱點 '+(8-bossPhase()).toFixed(1)+'s':wait<=1?'⚠ 怒吼蓄力！':'怒吼倒數 '+wait.toFixed(1)+'s')}if(mode==='alternate')return '下一擊：Boss '+(reactor.nextSide===0?'左半側':'右半側');if(mode==='combo')return '連擊 '+combo+' / 4 · '+(vulnerable()?'現在攻擊！':'先擊中彈跳器');if(mode==='bumpers')return '彈跳器充能 '+reactor.charged.filter(Boolean).length+' / 2';return mode==='moving'?'預判左右移動，瞄準獵手':'正面擊破角盾 · 留意受擊反衝'}
function bossStep(){if(!['roar','final'].includes(boss().mode))return;const cycle=Math.floor((time-reactor.entered)/8);if(bossPhase()>=8-settings().roar&&reactor.roared!==cycle){reactor.roared=cycle;reactor.wave=.6;toast('ROAR / 弱點開啟 '+settings().roar+' 秒！');sound(70,.35,'sawtooth',.025);shake=8;for(const b of balls){if(!b.route&&b.held<0&&b.y<480){b.vx+=(b.x<300?-1:1)*130*settings().speed;b.vy=Math.min(750,b.vy+150*settings().speed)}}}}
function finishCampaign(){state='won';multiball=false;const record=score>best&&!demo;if(record){best=score;try{localStorage.setItem(bestKey(),best)}catch{}$('#best').textContent=best.toLocaleString()}showOverlay(settings().name+' / 30 OF 30','恐龍島，征服完成！','總分 '+score.toLocaleString()+' · 30 關遠征全數完成','再次遠征 ↗');sound(1040,.45,'triangle')}
function drawDinosaur(){const x=bossX(),y=250,kind=boss().shape,color=boss().color;
 circle(x,y,49,vulnerable()?color+'18':'#263446',true);circle(x,y,51,vulnerable()?color:'#5c7185');
 ctx.save();ctx.translate(x,y);ctx.fillStyle=reactor.flash>0?'#ffffff':color;ctx.strokeStyle='#0b1720';ctx.lineWidth=2;
 const poly=points=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill();ctx.stroke()};
 if(kind===1){poly([[-34,-18],[-20,-38],[2,-33],[13,-20],[32,-13],[37,7],[16,19],[-8,17],[-20,30],[-35,12]]);ctx.fillStyle='#efffee';poly([[5,-18],[13,-42],[18,-13]]);poly([[24,-7],[45,-18],[34,4]]);poly([[-12,-24],[-8,-44],[0,-23]]);circle(20,0,3,'#0b1720',true)}
 else if(kind===2){poly([[-43,16],[-21,3],[-15,-12],[10,-15],[22,-4],[37,-1],[43,10],[33,17],[19,17],[18,30],[8,30],[7,18],[-9,18],[-14,30],[-24,30],[-22,15]]);for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#ffe1a3':color;poly([[-23+i*12,-8],[-25+i*12,-31-(i===1?6:0)],[-10+i*12,-12]])}circle(34,6,2.5,'#0b1720',true)}
 else if(kind===3){poly([[-45,17],[-10,-2],[5,-24],[28,-30],[42,-21],[38,-9],[20,-7],[11,10],[26,17],[14,22],[3,18],[-4,31],[-17,33],[-11,10],[-23,13]]);circle(29,-19,3,'#0b1720',true);ctx.fillStyle='#f8ebff';poly([[22,-8],[26,0],[30,-9]])}
 else{poly([[-42,29],[-18,5],[-8,-12],[-7,-35],[28,-37],[42,-26],[43,-7],[16,-4],[12,8],[24,11],[21,17],[8,15],[12,35],[-4,35],[-10,18],[-20,31]]);circle(25,-24,4,'#0b1720',true);ctx.fillStyle='#fff7db';for(let i=0;i<4;i++)poly([[13+i*7,-9],[17+i*7,0],[20+i*7,-9]])}
 if((reactor.level-1)%10>=4){ctx.fillStyle=color;const species=(reactor.level-1)%10;if(species===4){circle(-35,16,10,color,true);for(let j=0;j<4;j++)poly([[-25+j*12,-10],[-20+j*12,-23],[-15+j*12,-10]])}if(species===5){poly([[5,12],[8,-40],[16,-48],[29,-43],[24,-34],[18,-31],[20,12]])}if(species===6){poly([[-27,4],[-22,-43],[-13,-54],[-4,-38],[3,-5]])}if(species===7)circle(24,-24,13,color,true);if(species===8)poly([[16,-20],[-20,-48],[-32,-47],[8,-10]]);if(species===9){poly([[-16,-20],[-24,-36],[-9,-30]]);poly([[1,-35],[6,-49],[13,-35]])}}
 ctx.restore();
 for(let i=0;i<reactor.max;i++){const a=i/reactor.max*Math.PI*2-Math.PI/2;ctx.beginPath();ctx.arc(x,y,61,a+.1,a+Math.PI*2/reactor.max-.1);ctx.strokeStyle=i<reactor.armor?color:'#304253';ctx.lineWidth=i<reactor.armor?7:2;ctx.stroke()}
 label(boss().en,x,164,12,color);label(reactor.armor===0?'FINISH SHOT':vulnerable()?'WEAK POINT':'GUARDED',x,185,10,vulnerable()?color:'#8c9ca8');
 if(['roar','final'].includes(boss().mode)&&bossPhase()>=7-settings().roar&&bossPhase()<8-settings().roar)circle(x,y,75+Math.sin(time*24)*5,C[2]);
 if(reactor.wave>0){ctx.globalAlpha=reactor.wave/.6;circle(x,y,70+(.6-reactor.wave)*420,color);ctx.globalAlpha=1}
}

function resetReactor(level=1){const hp=Math.max(2,bosses[(level-1)%10].hp+difficulties[difficultyFor(level)].hp);reactor={level,armor:hp,max:hp,flash:0,last:-99,entered:time,exposedUntil:0,roared:-1,wave:0,nextSide:0,charged:[false,false]}}
resetReactor();
function makeBall(x,y,vx=0,vy=0){return {id:nextId++,x,y,vx,vy,r:9,trail:[],route:null,held:-1,lastShot:-99,coreLast:-99,sling:[-99,-99]}}
function sound(freq=440,duration=.08,type='sine',vol=.035){if(muted)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(freq*.65,audio.currentTime+duration);g.gain.setValueAtTime(vol,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function toast(s){$('#toast').textContent=s;toastTime=2}
function burst(x,y,color,n=20){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=50+Math.random()*260;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.35+Math.random()*.4,color})}}
function reward(points,message,x=300,y=250){score+=points;toast(message+' +'+points.toLocaleString());burst(x,y,C[2],40);sound(780,.25,'triangle');shake=7}
function multiplier(){return Math.min(5,1+Math.floor(combo/4))}
function hit(x,y,base,color){combo=time-lastHit<4?combo+1:1;lastHit=time;const points=base*multiplier()*(multiball?2:1);score+=points;texts.push({x,y,text:'+'+points,life:1,color});burst(x,y,color);shake=multiball?5:2;sound(330+combo%8*80,.1,'triangle')}
function ui(){ 
 $('#score').textContent=String(score).padStart(6,'0');$('#balls').innerHTML='● '.repeat(Math.max(0,lives))+'<small>剩餘彈珠</small>';
 $('#combo').innerHTML='×'+multiplier()+' <small>連擊倍率</small>';$('#status').textContent=state==='paused'?'PAUSED':multiball?'MULTIBALL':state==='playing'?'LIVE SESSION':'STANDBY';
 $('#mode').textContent=multiball?'三球超載 · 場上 '+balls.length+' 球':'左環道 → 右坡道 → 核心';
 $('#challenge-level').textContent='STAGE '+reactor.level+' / 30 · '+boss().name+' · '+settings().name;
 $('#challenge-title').textContent=bossHint();$('#stage-zone').textContent=boss().zone;$('#stage-rule').textContent=boss().rule;document.querySelectorAll('.stage-stop').forEach((el,i)=>{el.classList.toggle('active',i===(reactor.level-1)%10);el.classList.toggle('cleared',i<(reactor.level-1)%10||state==='won');el.textContent=String(Math.floor((reactor.level-1)/10)*10+i+1).padStart(2,'0')});
 const values=[relay===1?'接右坡道':relay===2?'接中央核心':routesMade+' 次',multiball?balls.length+' 球':locks+' / 2',reactor.armor===0?'最後一擊':reactor.armor+' HP'];
 const notes=[relay>0?Math.max(0,relayUntil-time).toFixed(1)+'s · 接力中':'磁力送回右擋板',multiball?'命中亮燈球道拿大獎':'鎖滿兩球 → 三球超載',reactor.armor===0?'命中弱點，擊退 Boss':'觀察 Boss 弱點時機'];
 document.querySelectorAll('.mission').forEach((el,i)=>{el.querySelector('strong').textContent=values[i];el.querySelector('small').textContent=notes[i];el.classList.toggle('complete',i===0?relay>0:i===1?multiball:reactor.armor===0)});
 $('#boss-progress').textContent=relay===2?'接力最後一擊：中央核心！成功額外 +3,000':relay===1?'磁力接力：下一球瞄準右側金色坡道':multiball?'JACKPOT '+(1000+jackpotCount*500).toLocaleString()+' · 最後剩一球即結束超載':'提早揮擊打向對側；晚揮擊打向同側。按住可接住慢球。';
 $('#core-count').textContent=(reactor.max-reactor.armor)+' / '+reactor.max;
 document.querySelectorAll('.core-dots i').forEach((el,i)=>el.classList.toggle('lit',(reactor.max-reactor.armor)/reactor.max>i/3));
 $('#left').classList.toggle('pressed',input.left);$('#right').classList.toggle('pressed',input.right)
}
function prepare(fresh=true){balls=[makeBall(535,550)];ball=balls[0];ball.routeReady=false;launchPending=true;newLife=fresh;toast('SPACE / 發射彈珠')}
function start(){score=0;lives=difficulties.easy.lives;combo=0;time=0;lastHit=-99;locks=0;multiball=false;jackpotCount=0;relay=0;routesMade=0;particles=[];texts=[];saveUntil=0;resetReactor();transition=0;input.left=input.right=false;flippers.forEach((f,i)=>{f.a=i===0?.48:Math.PI-.48;f.last=-99});state='playing';$('#pause').textContent='暫停遊戲 II';$('#overlay').classList.add('hidden');prepare();ui();sound(300,.15)}
function launch(){if(state==='ready'||state==='over'||state==='won'){start();return}if(state==='paused'){pause();return}if(launchPending){launchPending=false;balls[0].vx=-145;balls[0].vy=-1060;if(newLife){saveUntil=time+settings().save;newLife=false}toast(time<saveUntil?'BALL SAVE · '+Math.ceil(saveUntil-time)+' SEC':'再發射！');sound(180,.3,'sawtooth',.025)}}
function showOverlay(k,title,copy,button){$('#overlay-kicker').textContent=k;$('#overlay-title').textContent=title;$('#overlay-copy').textContent=copy;$('#start').textContent=button;$('#overlay').classList.remove('hidden')}
function pause(){if(!['playing','paused'].includes(state))return;state=state==='playing'?'paused':'playing';$('#pause').textContent=state==='paused'?'繼續遊戲 ▶':'暫停遊戲 II';if(state==='paused')showOverlay('TAKE A BREATH','休息一下。','P 或空白鍵繼續挑戰。','繼續遊戲 ↗');else $('#overlay').classList.add('hidden');ui()}
function drain(b){
 if(time<saveUntil){b.x=300;b.y=590;b.vx=(b.id%2?1:-1)*130;b.vy=-620;b.trail=[];b.route=null;b.held=-1;toast('BALL SAVE / 救球');return}
 balls=balls.filter(other=>other!==b);burst(b.x,780,C[1],25);sound(100,.3,'sawtooth',.025);
 if(multiball&&balls.length<=1){multiball=false;locks=0;toast('超載結束 · 再次鎖球！')}
 if(balls.length)return;
 lives--;combo=0;relay=0;
 if(lives>0){prepare();toast('還有 '+lives+' 顆球 · SPACE 發射')}else{state='over';const record=score>best&&!demo;if(record){best=score;try{localStorage.setItem(bestKey(),best)}catch{}$('#best').textContent=best.toLocaleString()}showOverlay(record?'NEW PERSONAL BEST':'ONE MORE RUN?',record?'新紀錄，漂亮！':'下一次，再深入一點。','得分 '+score.toLocaleString()+' · 到達恐龍關卡 '+reactor.level+' · 完成球道 '+routesMade+' 次','再玩一次 ↗')}
}
function beginMultiball(){if(multiball)return;multiball=true;locks=0;jackpotSide=0;jackpotCount=0;saveUntil=Math.max(saveUntil,time+Math.max(3,settings().save-1));balls.push(makeBall(260,180,-150,190),makeBall(340,180,150,190));toast('ϟ MULTIBALL / 三球超載！');sound(120,.5,'sawtooth');burst(300,180,C[2],65);shake=12}
function enterRoute(b,side){if(['route','final'].includes(boss().mode)||(boss().mode==='left'&&side===0)||(boss().mode==='right'&&side===1))reactor.exposedUntil=time+settings().window;b.route={side,t:0,phase:'rail',hold:0};b.held=-1;b.trail=[];routesMade++;hit(b.x,b.y,side===0?250:400,C[side===0?0:2]);
 if(multiball&&side===jackpotSide){reward(1000+jackpotCount*500,'JACKPOT');jackpotCount++;jackpotSide=1-jackpotSide}
 if(side===0){relay=1;relayUntil=time+14;toast('LEFT ORBIT / 磁力送往右擋板')}
 else{if(relay===1&&time<relayUntil){relay=2;relayUntil=time+14;reward(1000,'RELAY ×2 / 下一擊：中央')}
 if(!multiball){locks++;toast('ENERGY LOCK '+locks+'/2');if(locks===2)beginMultiball()}}
}
function railPoint(side,t){const path=paths[side];const lengths=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1]));let remaining=Math.max(0,Math.min(1,t))*lengths.reduce((a,b)=>a+b,0);for(let i=0;i<lengths.length;i++){if(remaining<=lengths[i]||i===lengths.length-1){const u=remaining/lengths[i];return [path[i][0]+(path[i+1][0]-path[i][0])*u,path[i][1]+(path[i+1][1]-path[i][1])*u]}remaining-=lengths[i]}}
function advanceRoute(b,dt){const r=b.route;if(r.phase==='rail'){r.t=Math.min(1,r.t+dt/1.65);[b.x,b.y]=railPoint(r.side,r.t);if(r.t===1){r.phase='magnet';r.hold=.45;sound(520,.13);burst(b.x,b.y,C[0],12)}}else{r.hold-=dt;if(r.hold<=0){b.route=null;b.vx=0;b.vy=75;toast('MAGNET RELEASE / 接住，再瞄準')}}}
function reactorHit(b){if(time-b.coreLast<.35)return;b.coreLast=time;reactor.flash=.22;if(!vulnerable(b)){toast(bossHint());sound(140,.1,'square',.015);return}
 if(relay===2&&time<relayUntil){reward(3000,'FLUX RELAY / 三段接力完成');relay=0}
 if(boss().mode==='alternate')reactor.nextSide=1-reactor.nextSide;if(boss().mode==='bumpers')reactor.charged=[false,false];
 if(reactor.armor>0){reactor.armor--;hit(bossX(),250,300,boss().color);toast(reactor.armor?boss().name+' 受傷 / '+reactor.armor+' HP':'弱點擊破！再命中一次擊退 '+boss().name)}
 else{const level=reactor.level;reward(5000*level,boss().name+' 擊退 / +1 球');lives=Math.min(5,lives+1);if(level===30){finishCampaign();return}resetReactor(level+1);transition=2.5;relay=0;for(const moving of balls){moving.held=-1;moving.route={side:moving.id%2,t:.65,phase:'rail',hold:0};[moving.x,moving.y]=railPoint(moving.route.side,.65);moving.trail=[]}}
}
// Passive contacts preserve tangential motion, so a released flipper feeds the centre drain.
function segment(b,ax,ay,bx,by,r=0,restitution=.8){const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((b.x-ax)*dx+(b.y-ay)*dy)/(dx*dx+dy*dy)));const px=ax+t*dx,py=ay+t*dy;let nx=b.x-px,ny=b.y-py,d=Math.hypot(nx,ny);const rr=b.r+r;if(d>=rr)return null;if(d<.001){nx=0;ny=-1}else{nx/=d;ny/=d}b.x=px+nx*(rr+.4);b.y=py+ny*(rr+.4);const vn=b.vx*nx+b.vy*ny;if(vn<0){b.vx-=(1+restitution)*vn*nx;b.vy-=(1+restitution)*vn*ny}return {t,nx,ny}}
function shotVelocity(f,t){const angle=-Math.PI/2+f.side*(.5-t)*1.8,speed=900+120*t;return {vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed}}
function updateBall(b,dt){
 if(b.route){advanceRoute(b,dt);return}
 if(b.held>=0){const i=b.held,f=flippers[i];b.x=f.x+f.side*35;b.y=f.y-38;b.vx=b.vy=0;if(!input[i===0?'left':'right']){b.held=-1;b.vx=f.side*110;b.vy=65;b.x=f.x+f.side*44;b.lastShot=time}return}
 if(b.y<200)b.routeReady=true;
 const oldY=b.y;b.vy+=680*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
 // Mouth width is visible; slow misses remain on the normal field instead of teleporting.
 for(let side=0;side<2;side++){const x=side===0?110:490;if(b.routeReady!==false&&oldY>=430&&b.y<430&&Math.abs(b.x-x)<35&&b.vy<-(side===0?280:400)){enterRoute(b,side);return}}
 for(const w of walls)segment(b,...w,5);
 for(const core of bumps){let dx=b.x-core.x,dy=b.y-core.y,d=Math.hypot(dx,dy);if(d<core.r+b.r){const nx=dx/(d||1),ny=dy/(d||1);b.x=core.x+nx*(core.r+b.r+1);b.y=core.y+ny*(core.r+b.r+1);const speed=Math.max(460,Math.hypot(b.vx,b.vy)*1.02);b.vx=nx*speed;b.vy=ny*speed;hit(core.x,core.y,100,core.color);core.flash=.18;reactor.charged[bumps.indexOf(core)]=true}}
 const targetX=bossX(),dx=b.x-targetX,dy=b.y-250,d=Math.hypot(dx,dy);if(d<53){const open=reactor.armor===0;if(!open||b.vy<0){reactorHit(b);if(b.route||state==='won')return}const nx=dx/(d||1),ny=dy/(d||1);b.x=targetX+nx*54;b.y=250+ny*54;const v=Math.min(1000,Math.max(430,Math.hypot(b.vx,b.vy))+(boss().mode==='direct'?120*settings().speed:0));b.vx=nx*v;b.vy=ny*v}
 for(let i=0;i<2;i++){const f=flippers[i],speed=Math.hypot(b.vx,b.vy),contact=segment(b,f.x,f.y,f.x+Math.cos(f.a)*f.len,f.y+Math.sin(f.a)*f.len,12,.2);if(!contact)continue;
 if(f.rising&&contact.ny<.25&&time-b.lastShot>.12){const v=shotVelocity(f,contact.t);b.vx=v.vx;b.vy=v.vy;b.lastShot=time;hit(b.x,b.y,50,C[0]);toast(contact.t>.6?'LATE SHOT / 同側球道':contact.t<.35?'EARLY SHOT / 對側球道':'CENTER SHOT / 中央突破')}
 else if(f.active&&!f.rising&&contact.ny<-.3&&contact.t<.6&&speed<390){b.held=i;sound(180,.05);toast('CRADLE / 放開讓球滾動，再揮擊')}
 }
 for(let i=0;i<2;i++){const s={x:i===0?111:489,y:531,side:i===0?1:-1};if(Math.hypot(b.x-s.x,b.y-s.y)<36&&time-b.sling[i]>.25){b.sling[i]=time;b.vx=s.side*420;b.vy=-440;hit(s.x,s.y,25,C[1])}}
 const speed=Math.hypot(b.vx,b.vy);if(speed>1200){b.vx*=1200/speed;b.vy*=1200/speed}
 if(b.y>H+25){drain(b);return}
 if(b.x<0||b.x>W||b.y<-80){b.x=Math.max(48,Math.min(552,b.x));b.y=Math.max(80,b.y);b.vx*=-.6;b.vy=Math.abs(b.vy)}
}
function update(dt){if(state!=='playing')return;if(transition>0){transition=Math.max(0,transition-dt);return}time+=dt;bossStep();reactor.wave=Math.max(0,reactor.wave-dt);if(time-lastHit>4)combo=0;if(relay&&time>relayUntil)relay=0;
 for(let i=0;i<2;i++){const f=flippers[i],pressed=input[i===0?'left':'right'],target=i===0?(pressed?-.48:.48):(pressed?Math.PI+.48:Math.PI-.48);const old=f.a;f.a+=(target-f.a)*Math.min(1,dt*24);f.active=pressed;f.rising=pressed&&Math.abs(f.a-old)>.004}
 if(!launchPending)for(const b of [...balls]){if(!balls.includes(b)||state!=='playing'||transition>0)continue;ball=b;updateBall(b,dt);b.trail.push({x:b.x,y:b.y});if(b.trail.length>18)b.trail.shift()}
 ball=balls[0]||null;
 for(const b of bumps)b.flash=Math.max(0,(b.flash||0)-dt);reactor.flash=Math.max(0,reactor.flash-dt);
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);for(const t of texts){t.y-=45*dt;t.life-=dt}texts=texts.filter(t=>t.life>0);shake*=.96;toastTime=Math.max(0,toastTime-dt)
}
function line(x1,y1,x2,y2,color,width=2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke()}
function circle(x,y,r,color,fill=false){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx[fill?'fillStyle':'strokeStyle']=color;ctx.lineWidth=2;ctx[fill?'fill':'stroke']()}
function label(s,x,y,size=12,color='#63788f'){ctx.fillStyle=color;ctx.font=`${size}px monospace`;ctx.textAlign='center';ctx.fillText(s,x,y)}
function drawRails(){for(let side=0;side<2;side++){const color=C[side===0?0:2],path=paths[side];ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.lineWidth=19;ctx.strokeStyle='#080f1a';ctx.lineJoin='round';ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle=color+'65';ctx.stroke();
 for(let t=.02;t<1;t+=.08){const [x,y]=railPoint(side,(t+time*.07)%1);circle(x,y,2,color,true)}
 const x=side===0?110:490;line(x-36,430,x+36,430,color,4);line(x,454,x,422,color,3);line(x,422,x-8,433,color,3);line(x,422,x+8,433,color,3);label(side===0?'ORBIT':'LOCK RAMP',x,478,10,color);
 if(multiball&&jackpotSide===side){label('JACKPOT',x,402,12,C[2]);circle(x,430,43+Math.sin(time*7)*3,C[2])}
 const end=path[path.length-1];circle(end[0],end[1],18,color+'65');label('MAG',end[0],end[1]-24,8,color)
}}
function draw(){ui();ctx.clearRect(0,0,W,H);ctx.save();if(shake>.3&&!matchMedia('(prefers-reduced-motion: reduce)').matches)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
 const bg=ctx.createRadialGradient(300,330,20,300,330,450);bg.addColorStop(0,multiball?'#193d3c':boss().color+'26');bg.addColorStop(1,'#0a101b');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#7fa0ba15';for(let x=20;x<W;x+=25)for(let y=20;y<H;y+=25)ctx.fillRect(x,y,1.5,1.5);
 for(const w of walls){line(...w,'#21384c',14);line(...w,multiball?C[0]:'#527f96',2)}
 drawRails();label('D I N O / E X P E D I T I O N',300,65,13,'#a7c2cc');
 for(const b of bumps){ctx.shadowBlur=12;ctx.shadowColor=b.color;circle(b.x,b.y,b.r+5,b.color+'55');circle(b.x,b.y,b.r,b.flash>0?'#ffffff':'#192d3a',true);circle(b.x,b.y,b.r,b.color);ctx.shadowBlur=0;label('ϟ',b.x,b.y+7,24,b.color)}
 drawDinosaur();
 if(relay===2){line(300,450,300,380,C[2],3);label('RELAY FINISH',300,410,12,C[2])}
 for(const side of [-1,1]){const x=300+side*185;ctx.beginPath();ctx.moveTo(x+side*20,464);ctx.lineTo(x-side*44,574);ctx.lineTo(x+side*8,551);ctx.closePath();ctx.fillStyle='#ff69ad12';ctx.fill();ctx.strokeStyle=C[1];ctx.lineWidth=2;ctx.stroke()}
 label(multiball?'M U L T I B A L L':'A I M . L I N K . B R E A K .',300,503,multiball?23:11,multiball?C[0]:'#6b8c9f');label('×'+multiplier(),300,555,44,combo>0?C[0]:'#294253');label(combo>0?combo+' HIT COMBO':'EARLY / CENTER / LATE',300,578,10,'#7395a4');
 for(const f of flippers){const x=f.x+Math.cos(f.a)*f.len,y=f.y+Math.sin(f.a)*f.len;ctx.shadowBlur=f.active?18:5;ctx.shadowColor=C[0];line(f.x,f.y,x,y,'#274c55',27);line(f.x,f.y,x,y,f.active?'#c4fff2':C[0],18);ctx.shadowBlur=0;circle(f.x,f.y,5,'#244853',true);for(const t of [.25,.5,.8])circle(f.x+(x-f.x)*t,f.y+(y-f.y)*t,2,'#24514f',true)}
 label(launchPending?'SPACE TO LAUNCH':time<saveUntil?'BALL SAVE '+Math.ceil(saveUntil-time)+'s':'▼ DRAIN ▼',300,768,11,time<saveUntil?C[0]:'#7d687d');
 for(const b of balls){for(let i=0;i<b.trail.length;i++)circle(b.trail[i].x,b.trail[i].y,b.r*i/b.trail.length,C[0]+Math.floor(i/b.trail.length*65).toString(16).padStart(2,'0'),true);ctx.shadowColor=b.route?C[2]:C[0];ctx.shadowBlur=18;const g=ctx.createRadialGradient(b.x-3,b.y-4,1,b.x,b.y,10);g.addColorStop(0,'white');g.addColorStop(.5,'#d7f9ff');g.addColorStop(1,'#728eab');circle(b.x,b.y,b.r,g,true);ctx.shadowBlur=0;if(b.held>=0)circle(b.x,b.y,15,C[0])}
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.75);circle(p.x,p.y,2.5,p.color,true)}ctx.globalAlpha=1;for(const t of texts){ctx.globalAlpha=Math.max(0,t.life);label(t.text,t.x,t.y,18,t.color)}ctx.globalAlpha=1;if(transition>0){ctx.fillStyle='#07101de8';ctx.fillRect(0,100,W,340);label('STAGE '+reactor.level+' / '+boss().zone,300,190,19,boss().color);label(boss().name,300,265,42,boss().color);label(boss().rule,300,325,12,'#e1ebe5');label('準備迎戰…',300,375,15,'#9bacbc')}ctx.restore();$('#toast').style.opacity=toastTime>0?1:0
}
let helpResume=false;
const helpDialog=$('#help-dialog');
function openHelp(){if(helpDialog.open)return;input.left=input.right=false;helpResume=state==='playing';if(helpResume)pause();helpDialog.showModal()}
function closeHelp(){helpDialog.close()}
$('#help-open').onclick=openHelp;$('#help-close').onclick=closeHelp;$('#help-done').onclick=closeHelp;
helpDialog.addEventListener('close',()=>{if(helpResume&&state==='paused')pause();helpResume=false;$('#help-open').focus()});
helpDialog.addEventListener('click',e=>{if(e.target===helpDialog){const r=helpDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeHelp()}});
function takeControl(){if(!demo)return;demo=false;input.left=input.right=false;$('#demo-banner')?.remove();toast('YOUR TURN / 換你接手')}
$('#start').onclick=()=>state==='paused'?pause():start();$('#launch').onclick=()=>{takeControl();launch()};$('#pause').onclick=pause;$('#sound').onclick=()=>{muted=!muted;$('#sound').textContent='音效 '+(muted?'OFF':'ON');if(!muted)sound()};
window.addEventListener('keydown',e=>{if(helpDialog.open)return;if(!['ArrowLeft','ArrowRight','Space','KeyP','KeyA','KeyD'].includes(e.code))return;e.preventDefault();if(e.code!=='KeyP')takeControl();if(['ArrowLeft','KeyA'].includes(e.code))input.left=true;if(['ArrowRight','KeyD'].includes(e.code))input.right=true;if(!e.repeat){if(e.code==='Space')launch();if(e.code==='KeyP')pause()}});
window.addEventListener('keyup',e=>{if(['ArrowLeft','KeyA'].includes(e.code))input.left=false;if(['ArrowRight','KeyD'].includes(e.code))input.right=false});
for(const dir of ['left','right']){const el=$('#'+dir);el.addEventListener('pointerdown',e=>{e.preventDefault();takeControl();el.setPointerCapture(e.pointerId);input[dir]=true;sound(160,.03)});for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,()=>input[dir]=false)}
window.addEventListener('blur',()=>{input.left=input.right=false;if(state==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});
function autoplay(dt){if(!demo||state==='paused')return;demoDelay+=dt;if(state==='over'||state==='won'){if(demoDelay>3){start();demoDelay=0}return}if(launchPending){if(demoDelay>1.2){launch();demoDelay=0}return}demoDelay=0;
 for(let i=0;i<2;i++){const candidates=balls.filter(b=>!b.route&&((i===0&&b.x<300)||(i===1&&b.x>300)));input[i===0?'left':'right']=candidates.some(b=>b.held<0&&b.y>659&&b.y<724&&b.vy>30)}
}
if(demo){muted=true;$('#sound').textContent='音效 OFF';const banner=document.createElement('button');banner.id='demo-banner';banner.textContent='自動試玩中 · 按左右鍵或點此接手';banner.onclick=takeControl;$('.machine').prepend(banner);start()}
let prev=0,acc=0;function frame(ts){const dt=Math.min((ts-prev)/1000,.035);prev=ts;autoplay(dt);acc+=dt;while(acc>=1/180){update(1/180);acc-=1/180}draw();requestAnimationFrame(frame)}
ui();requestAnimationFrame(frame);
})();
