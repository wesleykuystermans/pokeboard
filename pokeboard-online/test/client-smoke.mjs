import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {JSDOM,VirtualConsole} from 'jsdom';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const mf=new Miniflare(convertV4MiniflareOptions({modules:['worker.mjs','engine.mjs','data.mjs'].map(file=>({type:'ESModule',path:new URL('../src/'+file,import.meta.url).pathname,contents:readFileSync(new URL('../src/'+file,import.meta.url),'utf8')})),modulesRoot:new URL('../src/',import.meta.url).pathname,compatibilityDate:'2026-10-01',durableObjects:{ROOMS:{className:'GameRoom',useSQLite:true}},cf:false}));
const sockets=[];const errors=[];const doms=[];
const wait=async fn=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Timeout: '+fn.toString())};
function device(){
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url:'https://game.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.confirm=()=>true;w.crypto.randomUUID=()=>crypto.randomUUID();
  w.fetch=(url,options)=>mf.dispatchFetch(new URL(url,'https://game.test/').href,options);
  w.WebSocket=class {
   constructor(url,protocols){this.readyState=0;sockets.push(this);mf.dispatchFetch(String(url).replace(/^ws/,'http'),{headers:{Upgrade:'websocket','Sec-WebSocket-Protocol':protocols.join(',')}}).then(response=>{
    if(response.status!==101)throw new Error('WebSocket upgrade failed: '+response.status);
    this.ws=response.webSocket;this.ws.addEventListener('message',e=>this.onmessage?.({data:e.data}));this.ws.addEventListener('close',()=>{this.readyState=3;this.onclose?.()});this.ws.accept();this.readyState=1;this.onopen?.();
   }).catch(e=>{errors.push(e.message);this.onerror?.()});}
   send(message){this.ws.send(message)}close(){if(this.readyState===3)return;this.readyState=3;this.ws?.close(1000);}
  };
 }});doms.push(dom);return dom.window;
}
try{
 const host=device(),guest=device();const h=s=>host.document.querySelector(s),g=s=>guest.document.querySelector(s);
 h('#onlineName').value='Wes';h('#count').value='2';h('#onlineCreate').click();await wait(()=>/Kamer [A-Z2-9]{6}/.test(h('#onlineCodeLabel').textContent));
 const code=h('#onlineCodeLabel').textContent.split(' ')[1];
 g('#onlineName').value='Vriend';g('#onlineCode').value=code;g('#onlineJoin').click();try{await wait(()=>h('#onlinePlayers').children.length===2)}catch(e){console.log('Client diagnostics',h('#onlineStatus').textContent,g('#onlineStatus').textContent,errors,sockets.map(s=>s.readyState));throw e;}
 h('#onlineStart').click();await wait(()=>!h('#game').classList.contains('hidden')&&!g('#game').classList.contains('hidden'));
 await wait(()=>h('#roll').disabled===false);assert(g('#roll').disabled);
 h('#roll').click();await wait(()=>h('#board .valid'));assert(g('#roll').disabled);
 h('#board .valid').click();await wait(()=>h('#end').disabled===false);
 h('#end').click();await wait(()=>g('#roll').disabled===false);assert(h('#roll').disabled);
 h('#onlineLocal').click();assert(!h('#setup').classList.contains('hidden'));h('#onlineResume').click();await wait(()=>!h('#game').classList.contains('hidden'));
 assert(h('#turn').textContent.includes('Vriend'));assert.equal(h('#onlinePlayers').children.length,2);
 assert.deepEqual(errors,[]);console.log('Pass: two real DOM clients create/join/start, enforce turn controls, roll/move/end, and resume without adding a seat.');
}finally{for(const s of sockets)s.close();for(const d of doms)d.window.close();await mf.dispose()}
