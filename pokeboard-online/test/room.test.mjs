import {test} from 'node:test';import assert from 'node:assert/strict';
import {GameRoom} from '../src/worker.mjs';
function context(store=new Map()){return {store,storage:{get:async k=>store.get(k),put:async obj=>Object.entries(obj).forEach(([k,v])=>store.set(k,v)),setAlarm:async()=>{},deleteAll:async()=>store.clear()},blockConcurrencyWhile:fn=>fn(),getWebSockets:()=>[]};}
const req=(path,body,token)=>new Request('https://game.test/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
async function setup(){const ctx=context(),room=new GameRoom(ctx,{});const host=await(await room.fetch(req('create',{code:'ABC234',name:'Wes',capacity:2,generations:[1]}))).json();const guest=await(await room.fetch(req('join',{name:'Vriend'}))).json();return {ctx,room,host,guest};}
test('Rooms authenticate seats, enforce host start and capacity, and survive reconstruction',async()=>{
 const {ctx,room,host,guest}=await setup();assert.equal((await room.fetch(req('state'))).status,401);assert.equal((await room.fetch(req('join',{name:'Third'}))).status,400);
 assert.equal((await room.fetch(req('action',{id:'guest-start-0001',revision:1,command:{type:'start'}},guest.token))).status,400);
 const start=await(await room.fetch(req('action',{id:'host-start-00001',revision:1,command:{type:'start'}},host.token))).json();assert(start.room.state);
 const restored=new GameRoom(context(ctx.store),{});const result=await(await restored.fetch(req('state',null,guest.token))).json();assert.deepEqual(result.room,start.room);
 assert(!JSON.stringify(result).includes(host.token));assert(!JSON.stringify(result).includes('tokenHash'));
});
test('Retries are idempotent; parallel stale commands never apply twice',async()=>{
 const {room,host}=await setup();const start={id:'start-unique-0001',revision:1,command:{type:'start'}};
 await room.fetch(req('action',start,host.token));const retry=await(await room.fetch(req('action',start,host.token))).json();assert.equal(retry.room.revision,2);
 const commands=[1,2].map(n=>room.fetch(req('action',{id:'roll-unique-000'+n,revision:2,command:{type:'roll'}},host.token)));
 const responses=await Promise.all(commands);assert.deepEqual(responses.map(r=>r.status),[200,400]);const s=await(await room.fetch(req('state',null,host.token))).json();assert.equal(s.room.revision,3);assert.equal(s.room.state.phase,'destination');
});
test('Simultaneous joining cannot overfill a room',async()=>{
 const ctx=context(),room=new GameRoom(ctx,{});await room.fetch(req('create',{code:'ABC234',name:'Host',capacity:2,generations:[1]}));
 const rs=await Promise.all([room.fetch(req('join',{name:'A'})),room.fetch(req('join',{name:'B'}))]);assert.deepEqual(rs.map(r=>r.status),[200,400]);
});
