import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/engine.mjs';
import {BY_NAME} from '../src/data.mjs';
const pk=name=>({...BY_NAME[name],id:crypto.randomUUID()});
const item=(name,kind='ball')=>({name,kind,id:crypto.randomUUID()});
function initialized(){const e=createEngine();e.initialize(['Wes','Vriend'],[1]);return e;}
function prepared(change){const e=initialized();const s=e.serialize();change(s);return createEngine(s);}
test('All generation selections start with two red-ball options; future draws stay private',()=>{
 for(let g=1;g<=9;g++)for(let i=0;i<40;i++){
  const e=createEngine();e.initialize(['A','B','C','D'],[g]);const s=e.publicState();
  assert(s.market.filter(p=>p.rarity==='Common').length>=2);assert(s.market.every(p=>p.types.some(t=>s.board.includes(t))));
  assert(!('wild' in s));assert(!('wildPool' in s));assert(s.players.every(p=>p.deck.length===0&&p.hand.length===5));
 }
});
test('Only the active player can roll and move; clients cannot set dice or move illegally',()=>{
 const e=initialized();assert.throws(()=>e.apply(1,{type:'roll'}));e.apply(0,{type:'roll',roll:99});const s=e.publicState();assert(s.roll>=1&&s.roll<=6);
 assert.throws(()=>e.apply(0,{type:'roll'}));assert.throws(()=>e.apply(0,{type:'move',tile:99}));assert.throws(()=>e.apply(0,{type:'move',tile:s.players[0].pos}));
 e.apply(0,{type:'move',tile:s.players[0].pos+1});assert.equal(e.publicState().phase,'action');
});
test('Capture uses the lowest ball and refills Commons; only one capture per turn',()=>{
 const e=prepared(s=>{s.phase='action';s.board[s.players[0].pos]='Grass';s.players[0].hand=[item('Yellow Ball'),item('Red Ball')];s.market=[pk('Bulbasaur'),pk('Charmander'),pk('Ivysaur'),pk('Venusaur'),pk('Blastoise')];});
 const target=e.publicState().market[0];e.apply(0,{type:'capture',cardId:target.id});const s=e.publicState();
 assert.equal(s.players[0].hand[0].name,'Yellow Ball');assert(s.market.filter(p=>p.rarity==='Common').length>=2);assert.equal(s.market.length,5);
 assert.equal(s.catches[0][1],1);assert.throws(()=>e.apply(0,{type:'capture',cardId:s.market[0].id}));
 const reloaded=createEngine(e.serialize());assert.deepEqual(reloaded.publicState(),s);
});
test('Exchange output cannot be spent immediately; shopping closes battle actions',()=>{
 const e=prepared(s=>{s.phase='action';s.players[0].hand=[item('Copper','coin'),item('Copper','coin'),item('Copper','coin')];});
 e.apply(0,{type:'shop'});e.apply(0,{type:'exchange',coin:'Copper'});
 assert.throws(()=>e.apply(0,{type:'buy',coin:'Silver'}));assert.throws(()=>e.apply(0,{type:'wild'}));assert.equal(e.publicState().players[0].discardCount,1);
});
test('A defender can choose only from their hand; loser is not refilled',()=>{
 const e=prepared(s=>{s.phase='action';s.players[1].pos=s.players[0].pos;s.board[s.players[0].pos]='Normal';s.players[0].hand=[pk('Mewtwo')];s.players[1].hand=[item('Red Ball'),pk('Caterpie')];});
 e.apply(0,{type:'duel',cardId:e.publicState().players[0].hand[0].id});assert.throws(()=>e.apply(0,{type:'defend',cardId:e.publicState().players[1].hand[1].id}));
 assert.throws(()=>e.apply(1,{type:'defend',cardId:'not-in-hand'}));assert.throws(()=>e.apply(1,{type:'finish'}));
 e.apply(1,{type:'defend',cardId:e.publicState().players[1].hand[1].id});const s=e.publicState();assert(s.dueled);assert.equal(s.players[1].hand.length,1);assert.equal(s.players[0].hand.length,1);
 assert.equal(s.players[0].discardCount,1);assert.throws(()=>e.apply(0,{type:'duel',cardId:s.players[0].hand[0].id}));
});
test('Evolution can use all owned piles; finishing draws defense hand immediately',()=>{
 const e=prepared(s=>{s.phase='action';s.players[0].hand=[pk('Bulbasaur'),item('Red Ball')];s.players[0].discard=[pk('Bulbasaur')];s.players[0].deck=[];});
 e.apply(0,{type:'evolve',name:'Bulbasaur',next:'Ivysaur'});assert(e.publicState().players[0].hand.some(p=>p.name==='Ivysaur'));
 e.apply(0,{type:'finish'});assert.equal(e.publicState().current,1);assert.equal(e.publicState().players[0].hand.length,2);
});
