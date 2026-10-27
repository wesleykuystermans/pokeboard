import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const mf=new Miniflare(convertV4MiniflareOptions({modules:['worker.mjs','engine.mjs','data.mjs'].map(file=>({type:'ESModule',path:new URL('../src/'+file,import.meta.url).pathname,contents:readFileSync(new URL('../src/'+file,import.meta.url),'utf8')})),modulesRoot:new URL('../src/',import.meta.url).pathname,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'GameRoom',useSQLite:true}},cf:false}));
try{
 const request=async(path,body,token)=>{const r=await mf.dispatchFetch('https://game.test/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 const host=await request('rooms',{name:'Wes',capacity:2,generations:[1]});
 const guest=await request('rooms/'+host.room.code+'/join',{name:'Vriend'});
 const connect=async session=>{const r=await mf.dispatchFetch('https://game.test/api/rooms/'+session.room.code+'/ws',{headers:{Upgrade:'websocket','Sec-WebSocket-Protocol':'pokeboard, pb-token.'+session.token}});assert.equal(r.status,101);const ws=r.webSocket;const messages=[];ws.addEventListener('message',e=>messages.push(JSON.parse(e.data)));ws.accept();return {ws,messages};};
 const a=await connect(host),b=await connect(guest);
 const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timeout waiting for update');};
 const start={id:crypto.randomUUID(),revision:1,command:{type:'start'}};a.ws.send(JSON.stringify(start));
 await wait(()=>a.messages.some(m=>m.ack===start.id)&&b.messages.some(m=>m.ack===start.id));
 const state=b.messages.at(-1).room;assert.equal(state.revision,2);assert(state.state.market.filter(p=>p.rarity==='Common').length>=2);
 // A duplicate packet must not restart the game or advance revision.
 a.ws.send(JSON.stringify(start));await wait(()=>a.messages.filter(m=>m.ack===start.id).length===2);
 const roll={id:crypto.randomUUID(),revision:2,command:{type:'roll'}};a.ws.send(JSON.stringify(roll));await wait(()=>b.messages.some(m=>m.ack===roll.id));
 assert.equal(b.messages.at(-1).room.state.phase,'destination');assert.equal(b.messages.at(-1).room.revision,3);
 a.ws.close(1000);b.ws.close(1000);
 const restored=await request('rooms/'+host.room.code+'/state',null,host.token);assert.equal(restored.room.revision,3);
 console.log('Pass: real Cloudflare runtime, SQLite room storage, two WebSocket clients, shared dice update, retry deduplication, reconnect.');
}finally{await mf.dispose()}
