import {createEngine} from './engine.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const digest=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
function nameOf(value){const n=String(value||'').replace(/[<>\x00-\x1f]/g,'').trim();if(!n||n.length>30)throw new Error('Vul een naam in van maximaal 30 tekens.');return n;}
async function bodyOf(request){if(Number(request.headers.get('content-length'))>8192)throw new Error('Verzoek te groot.');const s=await request.text();if(s.length>8192)throw new Error('Verzoek te groot.');return JSON.parse(s);}
const TTL=30*24*60*60*1000;
export default {
 async fetch(request,env){
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const origin=request.headers.get('Origin');const allowed=[u.origin,...(env.ALLOWED_ORIGINS||'https://wesleykuystermans.github.io').split(',')];
  if(origin&&!allowed.includes(origin))return json({error:'Deze website heeft geen toegang.'},403);
  const cors={'Access-Control-Allow-Origin':origin||u.origin,'Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   if(u.pathname==='/api/health')return json({ok:true,version:'0.24-online'});
   let response;
   if(u.pathname==='/api/rooms'&&request.method==='POST'){
    const body=await bodyOf(request);let attempts=0;
    do{
     const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const bytes=crypto.getRandomValues(new Uint8Array(6));const code=[...bytes].map(b=>alphabet[b%alphabet.length]).join('');
     const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
     response=await stub.fetch(new Request(u.origin+'/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,code})}));
    }while(response.status===409&&++attempts<3);
   }else{
    const m=u.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|state|action|ws))?$/);
    if(!m)return json({error:'Onbekende kamer of route.'},404);
    const target=new URL('/'+(m[2]||'state'),u.origin);
    response=await env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(new Request(target,request));
   }
   if(response.status===101)return response;
   const headers=new Headers(response.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);
   return new Response(response.body,{status:response.status,headers});
  }catch{return json({error:'De server kon dit verzoek niet verwerken. Probeer opnieuw.'},400)}
 }
};

export class GameRoom {
 constructor(ctx,env){
  this.ctx=ctx;this.env=env;this.room=null;this.tail=Promise.resolve();
  this.ready=ctx.blockConcurrencyWhile(async()=>{
   const manifest=await ctx.storage.get('manifest');if(manifest){const parts=await Promise.all(Array.from({length:manifest.chunks},(_,i)=>ctx.storage.get('chunk:'+i)));this.room=JSON.parse(parts.join(''));}
  });
 }
 enqueue(fn){const result=this.tail.then(fn);this.tail=result.catch(()=>{});return result;}
 async persist(){
  const s=JSON.stringify(this.room);const chunks=s.match(/[\s\S]{1,50000}/g)||[''];const entries=Object.fromEntries(chunks.map((v,i)=>['chunk:'+i,v]));entries.manifest={chunks:chunks.length};
  await this.ctx.storage.put(entries);try{await this.ctx.storage.setAlarm(this.room.expiresAt)}catch{}
 }
 view(){return {code:this.room.code,revision:this.room.revision,capacity:this.room.capacity,generations:this.room.generations,players:this.room.players.map((p,i)=>({seat:i,name:p.name})),state:this.room.game?createEngine(this.room.game).publicState():null};}
 broadcast(message){const value=JSON.stringify(message);for(const ws of this.ctx.getWebSockets()){try{ws.send(value)}catch{}}}
 async authenticate(request){
  const raw=request.headers.get('Authorization')?.replace(/^Bearer /,'')||request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(x=>x.trim()).find(x=>x.startsWith('pb-token.'))?.slice(9);
  if(!raw)return -1;const h=await digest(raw);return this.room.players.findIndex(p=>p.tokenHash===h);
 }
 async command(seat,input){
  const previous=structuredClone(this.room);
  try{return await this.applyCommand(seat,input)}catch(e){this.room=previous;throw e;}
 }
 async applyCommand(seat,input){
  if(!input||typeof input.id!=='string'||input.id.length>80||input.id.length<8)throw new Error('Ongeldige actiecode.');
  const key=seat+':'+input.id;
  if(this.room.recent.includes(key))return {type:'update',ack:input.id,duplicate:true,room:this.view()};
  if(input.revision!==this.room.revision)throw new Error('De spelstand is intussen gewijzigd. Probeer opnieuw.');
  if(input.command?.type==='start'){
   if(seat!==0)throw new Error('Alleen de kamermaker kan starten.');if(this.room.game)throw new Error('Het spel is al gestart.');if(this.room.players.length<2)throw new Error('Wacht op minstens één vriend.');
   const engine=createEngine();engine.initialize(this.room.players.map(p=>p.name),this.room.generations);this.room.game=engine.serialize();
  }else{
   if(!this.room.game)throw new Error('Het spel is nog niet gestart.');
   const engine=createEngine(this.room.game);engine.apply(seat,input.command);this.room.game=engine.serialize();
  }
  this.room.revision++;this.room.commands++;this.room.expiresAt=Date.now()+TTL;this.room.recent.push(key);if(this.room.recent.length>100)this.room.recent.shift();
  await this.persist();const update={type:'update',ack:input.id,room:this.view()};this.broadcast(update);return update;
 }
 async fetch(request){
  await this.ready;
  return this.enqueue(async()=>{
   const previous=structuredClone(this.room);
   try{
    const path=new URL(request.url).pathname;
    if(path==='/create'&&request.method==='POST'){
     if(this.room)return json({error:'Kamer bestaat al.'},409);
     const b=await bodyOf(request);const name=nameOf(b.name);const capacity=Number(b.capacity||4);const generations=[...new Set(b.generations||[1])];
     if(![2,3,4].includes(capacity)||!generations.length||generations.some(g=>!Number.isInteger(g)||g<1||g>9))throw new Error('Ongeldige spelinstellingen.');
     const t=token();this.room={code:b.code,capacity,generations,revision:0,players:[{name,tokenHash:await digest(t)}],game:null,recent:[],commands:0,expiresAt:Date.now()+TTL};await this.persist();return json({token:t,seat:0,room:this.view()});
    }
    if(!this.room||Date.now()>this.room.expiresAt)return json({error:'Deze kamer bestaat niet meer.'},404);
    if(path==='/join'&&request.method==='POST'){
     if(this.room.game)throw new Error('Dit spel is al gestart. Gebruik op je eigen toestel de knop om te hervatten.');if(this.room.players.length>=this.room.capacity)throw new Error('Deze kamer is vol.');
     const b=await bodyOf(request);const name=nameOf(b.name);const t=token();const seat=this.room.players.length;
     this.room.players.push({name,tokenHash:await digest(t)});this.room.revision++;this.room.expiresAt=Date.now()+TTL;await this.persist();const room=this.view();this.broadcast({type:'update',room});return json({token:t,seat,room});
    }
    const seat=await this.authenticate(request);if(seat<0)return json({error:'Je hebt geen toegang tot deze plek. Gebruik je eigen toestel om te hervatten.'},401);
    if(path==='/ws'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
     if(this.ctx.getWebSockets().length>=16)throw new Error('Te veel verbindingen. Sluit enkele oude tabbladen.');
     const pair=new WebSocketPair();const [client,server]=Object.values(pair);this.ctx.acceptWebSocket(server);server.serializeAttachment({seat});server.send(JSON.stringify({type:'update',room:this.view()}));
     return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'pokeboard'}});
    }
    if(path==='/state'&&request.method==='GET')return json({room:this.view()});
    if(path==='/action'&&request.method==='POST')return json(await this.command(seat,await bodyOf(request)));
    return json({error:'Onbekende actie.'},404);
   }catch(e){this.room=previous;return json({error:e.message||'Actie mislukt.',room:this.room?this.view():null},400)}
  });
 }
 async webSocketMessage(ws,message){
  await this.ready;return this.enqueue(async()=>{
   try{if(typeof message!=='string'||message.length>8192)throw new Error('Ongeldig bericht.');const {seat}=ws.deserializeAttachment();if(!this.room)throw new Error('Deze kamer bestaat niet meer.');const result=await this.command(seat,JSON.parse(message));if(result.duplicate)ws.send(JSON.stringify(result));}
   catch(e){try{ws.send(JSON.stringify({type:'error',error:e.message,room:this.room?this.view():null}))}catch{}}
  });
 }
 webSocketClose(ws,code,reason){try{ws.close(code===1006?1000:code,reason)}catch{}}
 webSocketError(ws){try{ws.close(1011,'Verbinding verbroken')}catch{}}
 async alarm(){await this.ready;return this.enqueue(async()=>{if(this.room&&this.room.expiresAt>Date.now()){await this.ctx.storage.setAlarm(this.room.expiresAt);return;}for(const ws of this.ctx.getWebSockets())try{ws.close(1000,'Kamer verlopen')}catch{}await this.ctx.storage.deleteAll();this.room=null;});}
}
