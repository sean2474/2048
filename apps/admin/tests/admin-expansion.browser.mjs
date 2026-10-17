import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, cp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url); const {chromium}=require('playwright');
const ROOT=resolve(import.meta.dirname,'../../..');
const ADMIN='11111111-1111-4111-8111-111111111111',PLAYER='22222222-2222-4222-8222-222222222222',MATCH='33333333-3333-4333-8333-333333333333';
const user={id:ADMIN,aud:'authenticated',role:'authenticated',email:'fixture-admin@example.invalid',is_anonymous:false,app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const telemetry={moves:0,charged:{xblock:0,hardblock:0},sent:{xblock:0,hardblock:0},received:{xblock:0,hardblock:0}};
const match={id:MATCH,startedAt:'2026-10-16T14:59:00Z',endedAt:'2026-10-16T15:00:00Z',mode:'legacy',reason:'draw',durationSeconds:60,participants:[{slot:1,playerId:null,name:'Deleted snapshot',score:0,maxTile:2,result:'draw',ratingBefore:null,ratingAfter:null,ratingDelta:null,telemetry:null},{slot:2,playerId:PLAYER,name:'Fixture Player',score:0,maxTile:2,result:'draw',ratingBefore:1200,ratingAfter:1200,ratingDelta:0,telemetry}]};
const player={id:PLAYER,name:'Fixture Player',username:'fixture',email:'player@example.invalid',createdAt:'2026-01-01T00:00:00Z',suspendedAt:null,suspensionReason:null,rating:1200,gamesPlayed:0,wins:0,losses:0,draws:0,isAdmin:false,tier:null,placementGames:0};
const snapshot={startedAt:'2026-10-16T14:00:00Z',collectedAt:'2026-10-16T15:10:00Z',sessions:3,rooms:{ready:1,playing:1,reconnecting:0},queues:{casual:{count:0,oldestWaitMs:0},ranked:{count:1,oldestWaitMs:4000},friend:1},storage:{pending:[{id:MATCH,endedAt:'2026-10-16T15:00:00Z'}],pendingCount:1,blockedRankedAccounts:2,lastRemoteSuccessAt:null,readErrorAt:null,writeErrorAt:null}};

// All auth, RPC and socket data stays on a disposable local fixture server.
test('admin P0 browser journey, URL filters, KST, failures, mobile and protected proxy', {timeout:180000}, async t=>{
 const state={admin:true,matchError:false,empty:false,opsError:false,opsCalls:0,seasonError:false,calls:[]};
 const seasons=[{id:1,name:'Fixture season',starts_at:'2026-10-01T00:00:00Z',ends_at:null,created_by:ADMIN,transition_reason:'Fixture launch'},{id:0,name:'Previous season',starts_at:'2026-09-01T00:00:00Z',ends_at:'2026-10-01T00:00:00Z',created_by:ADMIN,transition_reason:'Archive'}];
 const backend=createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers',req.headers['access-control-request-headers']??'authorization,apikey,content-type,x-client-info,x-supabase-api-version');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  let body='';for await(const chunk of req)body+=chunk; const args=body?JSON.parse(body):{};
  const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.url?.startsWith('/auth/v1/user'))return send(user);
  if(req.url==='/health')return send({ok:true});
  if(req.url==='/admin/operations'){state.opsCalls++;assert.match(req.headers.authorization??'',/^Bearer /);return state.opsError?send({error:'unavailable'},503):send(snapshot);}
  const name=req.url?.split('/').at(-1);state.calls.push({name,args});
  if(name==='is_game_admin')return send(state.admin);
  if(name==='admin_matches'){
   if(state.matchError)return send({code:'42501',message:'Admin access required'},403);
   if(args.p_match_id==='invalid')return send({code:'22P02',message:'Invalid UUID'},400);
   return send({matches:state.empty?[]:[match],hasMore:!args.p_before_time,nextCursor:{time:match.endedAt,id:MATCH}});
  }
  if(name==='admin_match')return send(match);
  if(name==='admin_audit_entries')return send({entries:[{id:MATCH,createdAt:match.endedAt,actorId:ADMIN,playerId:PLAYER,actorExists:false,playerExists:true,action:'suspend',reason:'Fixture audit note'}],hasMore:false,nextCursor:null});
  if(name==='admin_players_filtered')return send({total:1,players:[player]});
  if(name==='admin_player')return send({player,matches:[],audit:[]});
  if(name==='admin_set_suspension'){player.suspendedAt=args.p_suspended?new Date().toISOString():null;player.suspensionReason=args.p_reason;return send(null);}
  if(name==='admin_rank_seasons')return send(seasons);
  if(name==='admin_rollover_season'){
    if(state.seasonError)return send({code:'40001',message:'Season changed'},409);
    seasons[0].ends_at=new Date().toISOString();seasons.unshift({id:2,name:args.p_name,starts_at:new Date().toISOString(),ends_at:null,created_by:ADMIN,transition_reason:args.p_reason});return send(2);
  }
  if(name==='admin_overview')return send({periodDays:7,periodStart:'2026-10-09T15:00:00Z',periodEnd:'2026-10-16T15:00:00Z',totals:{matches:0,rankedMatches:0,players:0,avgDurationSeconds:null,avgScore:null,telemetryParticipants:0,unmeasuredParticipants:0,avgMoves:null},daily:[{date:'2026-10-17',matches:0}],tiers:[],modes:[],reasons:[],attacks:[]});
  return send(null);
 });
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));t.after(()=>{ backend.closeAllConnections(); return new Promise(r=>backend.close(r)); });
 const backendURL=`http://127.0.0.1:${backend.address().port}`;
 const temp=await mkdtemp(join(tmpdir(),'2048-admin-browser-'));t.after(()=>rm(temp,{recursive:true,force:true}));
 const app=join(temp,'apps/admin');await mkdir(app,{recursive:true});await mkdir(join(temp,'packages'));
 for(const file of ['src','next.config.ts','tsconfig.json','package.json','postcss.config.mjs'])await cp(join(ROOT,'apps/admin',file),join(app,file),{recursive:true});
 await symlink(join(ROOT,'apps/admin/node_modules'),join(app,'node_modules'));await symlink(join(ROOT,'packages/ui'),join(temp,'packages/ui'));await symlink(join(ROOT,'packages/schema'),join(temp,'packages/schema'));
 // webpack can compile the disposable copy without modifying the active dev app's .next.
 const portServer=createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const child=spawn(process.execPath,[join(ROOT,'apps/admin/node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(port)],{cwd:app,env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:backendURL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-public-key',ADMIN_SOCKET_URL:backendURL,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 t.after(async()=>{if(child.exitCode!==null)return;child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));});
 const origin=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){try{if((await fetch(`${origin}/login`)).status===200)break;}catch{}await new Promise(r=>setTimeout(r,300));if(i===99)throw Error(logs);}
 const browser=await chromium.launch({channel:"chrome",headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({locale:'en-US',timezoneId:'America/Los_Angeles',viewport:{width:1440,height:900}});
 const expires=Math.floor(Date.now()/1000)+3600;const jwt=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:ADMIN,exp:expires,role:'authenticated'})).toString('base64url')}.fixture`;
 const session={access_token:jwt,refresh_token:'fixture',expires_at:expires,expires_in:3600,token_type:'bearer',user};
 await context.addCookies([{name:'sb-2048-admin-auth',value:`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,url:origin},{name:'duo.locale',value:'en',url:origin}]);
 const evidence=join(ROOT,'docs/admin-p0');await mkdir(evidence,{recursive:true});
 const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message)); page.on('console',m=>{if(m.type()==='error')logs+='\nBrowser: '+m.text();});
 await page.goto(`${origin}/matches?mode=legacy`);try { await page.getByRole('link',{name:MATCH,exact:true}).waitFor({timeout:10000}); } catch { throw Error((await page.locator('body').innerText())+'\n'+JSON.stringify(state.calls)+'\n'+logs.slice(-5000)); }
 assert.match(await page.locator('tbody').innerText(),/KST/);assert.match(await page.locator('tbody').innerText(),/10\/17\/2026/);
 await page.getByRole('link',{name:'Next',exact:true}).click();await page.waitForURL(/before=/);await page.getByRole('link',{name:MATCH,exact:true}).waitFor();
 const listURL=page.url();
 await page.getByLabel('Player UUID',{exact:true}).fill(PLAYER);
 const previousCalls=state.calls.filter(c=>c.name==='admin_matches').length;
 await Promise.all([
  page.waitForResponse(response=>response.url().includes('/matches?')&&response.request().headers()['rsc']==='1'),
  page.getByRole('button',{name:'Refresh',exact:true}).click(),
 ]);
 assert.equal(page.url(),listURL,'refresh preserves the current cursor and does not submit edited filters');
 assert.ok(state.calls.filter(c=>c.name==='admin_matches').length>previousCalls);
 assert.equal(state.calls.filter(c=>c.name==='admin_matches').at(-1).args.p_player_id,null,'refresh retains the active filter');
 await page.getByRole('link',{name:MATCH,exact:true}).click();await page.getByRole('heading',{name:'Match detail'}).waitFor();await page.getByRole('heading',{name:'Deleted snapshot'}).waitFor();
 assert.match(await page.locator('main').innerText(),/Not measured/);assert.match(await page.locator('main').innerText(),/0 \/ 0 \/ 0/);
 await page.getByRole('link',{name:'Back to matches'}).click();await page.waitForURL(listURL);
 await page.goto(`${origin}/matches?match=invalid`);await page.locator('.admin-error[role="alert"]').waitFor();assert.match(await page.locator('.admin-error[role="alert"]').innerText(),/Check UUIDs/);
 state.empty=true;await page.goto(`${origin}/matches`);await page.getByRole('link',{name:'Check pending storage'}).waitFor();state.empty=false;
 state.matchError=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.locator('.admin-error[role="alert"]').waitFor();assert.match(await page.locator('.admin-error[role="alert"]').innerText(),/Administrator access required/);state.matchError=false;
 await page.goto(`${origin}/audit?player=${PLAYER}`);await page.getByText('Fixture audit note').waitFor();assert.equal(await page.getByRole('link',{name:ADMIN,exact:true}).count(),0);
 await page.goto(`${origin}/players?q=Fixture&status=active&offset=0`);await page.getByRole('link',{name:/Fixture Player/}).waitFor();assert.equal(await page.locator('main select').inputValue(),'active');
 assert.match(await page.locator('tbody').innerText(),/Evaluating/);const playersURL=page.url();await page.getByRole('link',{name:/Fixture Player/}).click();await page.getByRole('link',{name:'View all matches'}).waitFor();
 await page.getByLabel('Reason for suspension').fill('Fixture access review');await page.getByRole('button',{name:'Suspend player…',exact:true}).click();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.tagName==='FORM');
 await page.getByRole('button',{name:'Suspend player…',exact:true}).click();await page.getByRole('button',{name:'Confirm suspension',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByText('Player suspended from new matches. The reason was recorded in the audit log.').waitFor();await page.getByLabel('Reason for restoring access').waitFor();
 assert.equal(state.calls.filter(c=>c.name==='admin_set_suspension').length,1);
 await page.getByRole('link',{name:'Back to players'}).click();await page.waitForURL(playersURL);
 await page.goto(`${origin}/operations`);await page.getByText('A result has waited more than two minutes.').waitFor();assert.ok(state.opsCalls>0);
 state.opsError=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText(/Showing the last successful snapshot/).waitFor();await page.getByText(/Public health endpoint responded/).waitFor();await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText(/Two or more refreshes failed/).waitFor();state.opsError=false;
 state.admin=false;const calls=state.opsCalls;assert.equal((await context.request.get(`${origin}/api/operations`)).status(),403);assert.equal(state.opsCalls,calls);state.admin=true;
 await page.goto(`${origin}/`);await page.getByRole('link',{name:'Storage needs attention. Open Operations for details.'}).waitFor();
 await page.goto(`${origin}/seasons`);await page.getByText(/Elo and established tiers carry over between seasons/).waitFor();assert.doesNotMatch(await page.locator('main').innerText(),/halfway|5 placements|2 wins before/);await page.getByLabel('New season name').fill('Next fixture season');await page.getByLabel('Transition reason').fill('Fixture transition');
 await page.getByRole('button',{name:'Review season transition'}).click();await page.getByRole('alertdialog').getByText(/Elo and historical records are preserved/).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(state.calls.filter(c=>c.name==='admin_rollover_season').length,0);
 await page.getByRole('button',{name:'Review season transition'}).click();await page.getByRole('button',{name:'Confirm season transition'}).evaluate(button=>{button.click();button.click();});
 await page.getByText('The new season is active. Previous results remain available.').waitFor();assert.equal(state.calls.filter(c=>c.name==='admin_rollover_season').length,1);
 state.seasonError=true;await page.getByLabel('New season name').fill('Conflict fixture');await page.getByLabel('Transition reason').fill('Stale request');await page.getByRole('button',{name:'Review season transition'}).click();await page.getByRole('button',{name:'Confirm season transition'}).click();await page.locator('.admin-error[role="alert"]').waitFor();assert.equal(await page.getByRole('button',{name:'Confirm season transition'}).isDisabled(),true);await page.getByRole('button',{name:'Cancel',exact:true}).click();
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});await page.goto(`${origin}/matches`);await page.getByRole('link',{name:MATCH,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);await page.screenshot({path:join(evidence,`matches-${width}.png`),fullPage:true});await page.goto(`${origin}/seasons`);await page.getByLabel('New season name').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`season overflow at ${width}`);await page.screenshot({path:join(evidence,`seasons-${width}.png`),fullPage:true});}
 assert.equal((await browser.newContext().then(c=>c.request.get(`${origin}/api/operations`))).status(),401);
 assert.deepEqual(pageErrors,[]);assert.ok(state.calls.some(c=>c.name==='admin_matches'&&c.args.p_before_id===MATCH));
});
