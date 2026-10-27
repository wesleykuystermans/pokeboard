import { TYPES,GYMS,POKE,BY_NAME,BY_NUMBER,EVOLVE,ADV,STARTER_IDS,BALL_ORDER } from './data.mjs';

function unpackCard(c){return c.n?{...BY_NUMBER[c.n],id:c.id}:c}
function packCard(c){return c.kind==='pokemon'?{n:BY_NAME[c.name].number,id:c.id}:c}
export function createEngine(saved){
 let S=null;
 const render=()=>{};
 const setTimeout=()=>{};
 const current=()=>S.players[S.current];
 function begin(){S.phase='move';S.roll=0;S.selected=null;S.battled=false;S.captured=false;S.dueled=false;S.duel=null;log('▶ '+current().name+' begint.');}
 function log(message){S.log.unshift(message);S.log.length=Math.min(80,S.log.length)}
 function countCatch(pk,p){const number=BY_NAME[pk.name].number;const i=S.players.indexOf(p||current());S.catches[i][number]=(S.catches[i][number]||0)+1}
 function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a}
function card(name,kind,extra){return Object.assign({id:Math.random().toString(36).slice(2),name,kind},extra||{})}
const ball=n=>card(n,"ball"), coin=n=>card(n,"coin");
function gymNumber(pos){return [...GYMS].indexOf(pos)+1}
function badgeCard(pos){return card("Gymbadge "+gymNumber(pos),"badge",{gym:pos,terrain:S.board[pos]})}
function xy(i){return [Math.floor(i/6),i%6]} function distance(a,b){let A=xy(a),B=xy(b);return Math.abs(A[0]-B[0])+Math.abs(A[1]-B[1])}
function hasPokemon(p){return p.hand.some(c=>c.kind==="pokemon")}
function canCatch(b,r){return b==="Yellow Ball"||(b==="Blue Ball"&&r!=="Rare")||(b==="Red Ball"&&r==="Common")}
function owned(p){return [...p.hand,...p.deck,...p.discard]}
function countOwned(p,name,kind){return owned(p).filter(c=>c.kind===kind&&c.name===name).length}
function takeOwned(p,name,kind,n){
 if(countOwned(p,name,kind)<n)return false;
 for(let pile of [p.hand,p.discard,p.deck])for(let i=pile.length-1;i>=0&&n;i--)if(pile[i].kind===kind&&pile[i].name===name){pile.splice(i,1);n--}
 S.selected=null;return true;
}
function availableEvolutions(name){return (EVOLVE[name]||[]).filter(next=>S.generations.has(BY_NAME[next].generation))}
function evolve(name,p,next){
 p=p||current();next=next||availableEvolutions(name)[0];if(!availableEvolutions(name).includes(next)||!takeOwned(p,name,"pokemon",2))return false;
 p.hand.push(card(next,"pokemon",{types:BY_NAME[next].types,score:BY_NAME[next].score,rarity:BY_NAME[next].rarity}));
 log("✨ "+p.name+" evolueert 2 × "+name+" tot "+next+".");render();return true;
}
function exchange(from,p){
 p=p||current();let n=from==="Copper"?3:from==="Silver"?2:0,to=from==="Copper"?"Silver":"Gold";
 if(!n||p.hand.filter(c=>c.kind==="coin"&&c.name===from).length<n)return false;
 for(let i=p.hand.length-1;i>=0&&n;i--)if(p.hand[i].kind==="coin"&&p.hand[i].name===from){p.hand.splice(i,1);n--}
 S.selected=null;p.discard.push(coin(to));log("🪙 "+p.name+" wisselt munten om voor 1 "+to+". Die munt kan pas in een volgende beurt worden gebruikt.");render();return true;
}

function drawToFive(p){while(p.hand.length<5){if(!p.deck.length){p.deck=shuffle(p.discard);p.discard=[]}if(!p.deck.length)break;p.hand.push(p.deck.pop())}}
function nextWild(){if(!S.wild.length)S.wild=shuffle(S.wildPool);return Object.assign({},S.wild.pop(),{id:"wild"+Math.random()})}
function refill(){
 const commonPool=S.wildPool.filter(p=>p.rarity==="Common"),minimum=commonPool.length?2:0;
 const commonCount=()=>S.market.filter(p=>p.rarity==="Common").length;
 // Normalize old saved games too, preserving every card when the guarantee already holds.
 while(S.market.length>5-Math.max(0,minimum-commonCount())){let i=S.market.findLastIndex(p=>p.rarity!=="Common");if(i<0)break;S.market.splice(i,1)}
 while(S.market.length<5){let pk=commonCount()<minimum?Object.assign({},commonPool[Math.floor(Math.random()*commonPool.length)],{id:"wild"+Math.random()}):nextWild();S.market.push(pk)}
}

function typeMultiplier(a,b){let adv=a.types.some(t=>(ADV[t]||[]).some(x=>b.types.includes(x)));let disadv=b.types.some(t=>(ADV[t]||[]).some(x=>a.types.includes(x)));if(adv&&!disadv)return 2;if(disadv&&!adv)return .5;return 1}
function combatPower(pk,foe,playerPokemon){
 let terrain=playerPokemon&&pk.types.includes(S.board[current().pos])?2:1;
 let type=typeMultiplier(pk,foe);
 let mult;
 if(terrain===2||type===2) mult=2; else if(type===.5) mult=.5; else mult=1;
 return {value:Math.round(pk.score*mult),terrain,type,mult};
}
function chosenIndex(p){if(p===current()&&S.selected!==null&&p.hand[S.selected]&&p.hand[S.selected].kind==="pokemon")return S.selected;let best=-1,score=-1;p.hand.forEach((c,i)=>{if(c.kind==="pokemon"&&c.score>score){best=i;score=c.score}});return best}
function battle(gym,p){
 p=p||current();if(S.winner||(gym&&(!GYMS.has(p.pos)||p.gymBadges.has(p.pos))))return false;
 let pi=chosenIndex(p);if(pi<0)return false;let foe=nextWild();if(p.ai)pi=aiPokemonIndex(p,foe);
 let mine=p.hand.splice(pi,1)[0];p.discard.push(mine);S.selected=null;S.battled=true;
 let a=combatPower(mine,foe,true), f=combatPower(foe,mine,false), foePower=f.value*(gym?2:1);
 let reason=a.terrain===2?"zonebonus "+S.board[p.pos]+" ×2":a.type===2?"typevoordeel ×2":a.type===.5?"typenadeel ×½":"neutraal";
 log("⚔️ "+mine.name+": "+mine.score+" → "+a.value+" ("+reason+") vs "+foe.name+": "+foePower+(gym?" (Gym ×2)":"")+".");
 if(a.value>=foePower){if(gym){p.gymBadges.add(p.pos);p.badges=p.gymBadges.size;p.discard.push(badgeCard(p.pos));log("🏅 "+p.name+" wint de badge van gym "+gymNumber(p.pos)+" ("+p.badges+"/6).");if(p.badges===6){S.winner=p;S.phase="won";log("🎉 "+p.name+" wint Pokéboard met zes badges!")}}else{let r=foe.rarity==="Common"?"Copper":"Silver";p.discard.push(coin(r));log("🏆 "+p.name+" wint een "+r+" Coin voor een "+foe.rarity+" Pokémon.")}}else log("💥 "+p.name+" verliest.");
 render();return true;
}
function duelTargets(){let p=current();return S.players.map((x,i)=>i).filter(i=>i!==S.current&&S.players[i].pos===p.pos&&hasPokemon(S.players[i]))}
function duelAvailability(){let p=current(),others=S.players.filter((x,i)=>i!==S.current&&x.pos===p.pos);if(S.dueled)return"Je hebt deze beurt al een trainerduel gevochten.";if(!hasPokemon(p))return"Je hebt een Pokémon in je hand nodig voor een trainerduel.";if(!others.length)return"Land op hetzelfde vakje als een andere trainer om hem uit te dagen.";if(!others.some(hasPokemon))return"De trainer op dit vakje heeft momenteel geen Pokémon in zijn hand.";return"Trainer op jouw vakje: klik op Trainerduel om uit te dagen."}
function startDuel(target){
 let p=current(),pi=p.ai?aiPokemonIndex(p):chosenIndex(p),targets=duelTargets();
 if(S.winner||S.phase!=="action"||S.dueled||pi<0||!targets.length)return false;
 S.duel={attacker:S.current,pi,targets,defender:null,stage:"target"};S.phase="duel";
 if(targets.includes(target))chooseDuelTarget(target);
 else if(targets.length===1)chooseDuelTarget(targets[0]);
 else render();
 return true;
}
function chooseDuelTarget(i){
 if(S.phase!=="duel"||!S.duel||S.duel.stage!=="target"||!S.duel.targets.includes(i))return false;
 S.duel.defender=i;S.duel.stage="defender";
 let foe=S.players[i];
 if(foe.ai)return resolveDuel(aiPokemonIndex(foe,current().hand[S.duel.pi]));
 render();return true;
}
function resolveDuel(di){
 if(S.phase!=="duel"||!S.duel||S.duel.stage!=="defender")return false;
 let attacker=S.players[S.duel.attacker],defender=S.players[S.duel.defender],aiAttacker=attacker.ai;
 let mine=attacker.hand[S.duel.pi],theirs=defender.hand[di];
 if(!mine||mine.kind!=="pokemon"||!theirs||theirs.kind!=="pokemon")return false;
 let a=combatPower(mine,theirs,true).value,d=combatPower(theirs,mine,true).value;
 let winner=a>d?attacker:defender,loser=winner===attacker?defender:attacker;
 if(loser===attacker)attacker.discard.push(attacker.hand.splice(S.duel.pi,1)[0]);else defender.discard.push(defender.hand.splice(di,1)[0]);
 let reward=winner.badges>loser.badges?"Copper":winner.badges===loser.badges?"Silver":"Gold";
 winner.discard.push(coin(reward));S.dueled=true;S.duel=null;S.selected=null;S.phase="action";S.privacy=null;
 log("🥊 "+attacker.name+" ("+mine.name+" "+a+") vs "+defender.name+" ("+theirs.name+" "+d+"): "+winner.name+" wint een "+reward+" Coin"+(a===d?" (gelijkstand voor de verdediger)":"")+".");
 render();if(aiAttacker)setTimeout(aiWrapup,350);return true;
}
function cancelDuel(){if(S.phase!=="duel"||!S.duel)return;S.duel=null;S.phase="action";S.privacy=null;render();if(current().ai)setTimeout(aiWrapup,350)}
function capture(i,p){p=p||current();let pk=S.market[i];if(!pk||!pk.types.includes(S.board[p.pos]))return false;let bi=-1;for(let j=0;j<p.hand.length;j++)if(p.hand[j].kind==="ball"&&canCatch(p.hand[j].name,pk.rarity)&&(bi<0||BALL_ORDER[p.hand[j].name]<BALL_ORDER[p.hand[bi].name]))bi=j;if(bi<0)return false;let used=p.hand.splice(bi,1)[0];p.discard.push(Object.assign({},pk,{id:"caught"+Math.random()}));S.market.splice(i,1);S.captured=true;refill();countCatch(pk,p);log("✨ "+p.name+" vangt "+pk.name+" met "+used.name+".");render();return true}
function buy(k,p){p=p||current();let i=p.hand.findIndex(c=>c.kind==="coin"&&c.name===k);if(i<0)return false;p.hand.splice(i,1);let b=k==="Copper"?"Red Ball":k==="Silver"?"Blue Ball":"Yellow Ball";p.discard.push(ball(b));log("🛒 "+p.name+" koopt "+b+".");render();return true}
function finish(){if(!S||!["action","shop"].includes(S.phase))return;let p=current();p.discard.push(...p.hand);p.hand=[];drawToFive(p);log("⏹ "+p.name+" beëindigt de beurt en trekt "+p.hand.length+" nieuwe kaarten voor de volgende ronde en verdediging.");S.current=(S.current+1)%S.players.length;S.privacy=null;begin()}

 function load(st){
  S=structuredClone(st);S.generations=new Set(S.generations);
  for(const p of S.players){p.gymBadges=new Set(p.gymBadges);for(const pile of ['hand','deck','discard'])p[pile]=p[pile].map(unpackCard)}
  S.wildPool=POKE.filter(p=>S.generations.has(p.generation)&&p.types.some(t=>S.board.includes(t))).flatMap(p=>Array(p.rarity==='Common'?3:p.rarity==='Medium'?2:1).fill(p));
  S.wild=S.wild.map(p=>typeof p==='number'?BY_NUMBER[p]:p);
  S.market=S.market.map(unpackCard);S.winner=Number.isInteger(st.winner)?S.players[st.winner]:null;
 }
 if(saved)load(saved);
 function initialize(names,generationList){
  const generations=new Set(generationList);
  const available=POKE.filter(p=>generations.has(p.generation));const availableTypes=new Set(available.flatMap(p=>p.types));
  const board=shuffle(TYPES.filter(t=>availableTypes.has(t)).flatMap(t=>[t,t,t])).slice(0,18);
  const wildPool=available.filter(p=>p.types.some(t=>board.includes(t))).flatMap(p=>Array(p.rarity==='Common'?3:p.rarity==='Medium'?2:1).fill(p));
  const starters=shuffle([...generations].flatMap(g=>STARTER_IDS[g]));
  S={board,wild:[],wildPool,market:[],generations,players:names.map((name,i)=>({name,ai:false,difficulty:'normal',pos:[6,11,1,16][i],deck:shuffle([ball('Red Ball'),ball('Red Ball'),ball('Red Ball'),ball('Red Ball'),card(BY_NUMBER[starters[i%starters.length]].name,'pokemon',{...BY_NUMBER[starters[i%starters.length]]})]),discard:[],hand:[],gymBadges:new Set(),badges:0})),current:0,phase:'move',privacy:null,roll:0,selected:null,battled:false,captured:false,dueled:false,duel:null,winner:null,log:[],catches:names.map(()=>({}))};
  S.players.forEach(drawToFive);refill();begin();return publicState();
 }
 function serialize(){
  const st={...S,generations:[...S.generations],wild:S.wild.map(p=>p.number),market:S.market.map(packCard),players:S.players.map(p=>({...p,gymBadges:[...p.gymBadges],hand:p.hand.map(packCard),deck:p.deck.map(packCard),discard:p.discard.map(packCard)})),winner:S.winner?S.players.indexOf(S.winner):null};
  delete st.wildPool;return st;
 }
 function publicState(){
  const st=serialize();delete st.wild;
  st.market=S.market;st.players=S.players.map(p=>({...p,gymBadges:[...p.gymBadges],hand:p.hand.map(c=>({...c})),deck:[],discard:[],deckCount:p.deck.length,discardCount:p.discard.length,ownedCounts:Object.fromEntries(owned(p).filter(c=>c.kind==='pokemon').map(c=>[c.name,countOwned(p,c.name,'pokemon')]))}));
  return structuredClone(st);
 }
 function apply(seat,cmd){
  if(!S||S.winner)throw new Error('Dit spel is afgelopen.');
  if(!cmd||typeof cmd.type!=='string')throw new Error('Ongeldige actie.');
  if(cmd.type==='defend'){
   if(S.phase!=='duel'||S.duel?.stage!=='defender'||S.duel.defender!==seat)throw new Error('Jij bent niet aan het verdedigen.');
   const di=S.players[seat].hand.findIndex(c=>c.id===cmd.cardId&&c.kind==='pokemon');
   if(di<0||!resolveDuel(di))throw new Error('Kies een Pokémon uit je hand.');return;
  }
  if(seat!==S.current)throw new Error('Wacht tot je aan de beurt bent.');
  const p=current();const requirePhase=(...phases)=>{if(!phases.includes(S.phase))throw new Error('Deze actie kan nu niet.');};
  const choose=()=>{const i=p.hand.findIndex(c=>c.id===cmd.cardId&&c.kind==='pokemon');if(i<0)throw new Error('Kies een Pokémon uit je hand.');S.selected=i;return i;};
  switch(cmd.type){
   case 'roll':requirePhase('move');S.roll=1+Math.floor(Math.random()*6);S.phase='destination';log('🎲 '+p.name+' gooit '+S.roll+'.');break;
   case 'move':requirePhase('destination');if(!Number.isInteger(cmd.tile)||cmd.tile<0||cmd.tile>17||distance(p.pos,cmd.tile)<1||distance(p.pos,cmd.tile)>S.roll)throw new Error('Kies een bereikbare tegel.');p.pos=cmd.tile;S.phase='action';log('📍 '+p.name+' → '+S.board[p.pos]);break;
   case 'capture':requirePhase('action');if(S.captured)throw new Error('Je hebt deze beurt al gevangen.');{const i=S.market.findIndex(c=>c.id===cmd.cardId);if(i<0||!capture(i))throw new Error('Je hebt een passende tegel en bal nodig.');}break;
   case 'wild':case 'gym':requirePhase('action');if(S.battled)throw new Error('Je hebt deze beurt al een battle gedaan.');choose();if(!battle(cmd.type==='gym'))throw new Error('Deze gymbattle kan niet.');break;
   case 'duel':requirePhase('action');choose();if(!startDuel(cmd.target))throw new Error('Er staat geen beschikbare tegenstander op jouw tegel.');break;
   case 'duelTarget':requirePhase('duel');if(S.duel?.stage!=='target'||!S.duel.targets.includes(cmd.target))throw new Error('Ongeldige tegenstander.');chooseDuelTarget(cmd.target);break;
   case 'cancelDuel':requirePhase('duel');cancelDuel();break;
   case 'shop':requirePhase('action');S.phase='shop';break;
   case 'buy':requirePhase('shop');if(!['Copper','Silver','Gold'].includes(cmd.coin)||!buy(cmd.coin))throw new Error('Die munt zit niet in je hand.');break;
   case 'exchange':requirePhase('shop');if(!['Copper','Silver'].includes(cmd.coin)||!exchange(cmd.coin))throw new Error('Onvoldoende munten in je hand.');break;
   case 'evolve':requirePhase('action','shop');if(!BY_NAME[cmd.name]||!evolve(cmd.name,p,cmd.next))throw new Error('Die evolutie is niet beschikbaar.');break;
   case 'finish':requirePhase('action','shop');finish();break;
   default:throw new Error('Onbekende actie.');
  }
 }
 return {initialize,serialize,publicState,apply};
}
