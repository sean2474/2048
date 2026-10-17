import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { CatalogSchema, CosmeticInputSchema, AchievementInputSchema } from "schema/catalog";
const ADMIN="11111111-1111-4111-8111-111111111111", A="22222222-2222-4222-8222-222222222222", B="33333333-3333-4333-8333-333333333333";
const migration="20261017160000_content_catalog.sql", migrations=new URL("../../../supabase/migrations/",import.meta.url);
const icon={kind:"icon",id:"new-icon",name:"새 아이콘 🧩 O'Brien",description:"New reward",imagePath:"icons/new-icon.webp",color:"#123456",acquisition:"coins",price:150,status:"draft",sortOrder:0};
const reward={id:"wins-100",name:"100 wins",description:"Win 100 eligible games",metric:"wins",target:100,reward:{kind:"icon",iconId:"new-icon"},status:"draft",sortOrder:0};
async function database(t: {after:(callback:()=>Promise<void>)=>void}, beforeUpgrade?: (db: PGlite) => Promise<void>) {
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb default '{"mimetype":"image/webp"}');alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
 for(const f of(await readdir(migrations)).filter(f=>f.endsWith('.sql')&&f<migration).sort())await db.exec(await readFile(new URL(f,migrations),'utf8'));
 await db.query("insert into auth.users(id) values($1),($2),($3)",[ADMIN,A,B]);await db.query("insert into public.admin_roles(user_id) values($1)",[ADMIN]);
 await db.query("update public.player_wallets set balance=2000 where player_id=$1",[A]);
 await db.query("insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values($1,'skin','kitty',1200)",[A]);
 await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'checkin-7')",[A]);
 await db.query("insert into public.player_preferences(player_id,skin_id) values($1,'kitty')",[A]);
 if(beforeUpgrade) await beforeUpgrade(db);
 await db.exec(await readFile(new URL(migration,migrations),'utf8'));
 await db.exec("insert into storage.objects(bucket_id,name) values('catalog-assets','icons/new-icon.webp')");
 const as=async<T>(role:string,id:string,fn:()=>Promise<T>)=>{await db.exec(`set role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);try{return await fn();}finally{await db.exec('reset role');}};
 const rpc=async(name:string,args:unknown[]=[]) => (await db.query<{v:any}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args)).rows[0].v;
 const save=(item:object,revision=0)=>rpc('admin_save_cosmetic',['icon',JSON.stringify(item),revision]);
 return{db,as,rpc,save};
}
test('catalog input validation rejects unsafe assets, arbitrary CSS and unsupported achievement rules',()=>{
 assert.equal(CosmeticInputSchema.safeParse(icon).success,true);
 for(const imagePath of['https://evil.test/a.svg','../a.png','a//b.png','x.svg?script','data:image/svg+xml,hi'])assert.equal(CosmeticInputSchema.safeParse({...icon,imagePath}).success,false);
 for(const price of[-1,0,1.2,NaN,Infinity])assert.equal(CosmeticInputSchema.safeParse({...icon,price}).success,false);
 for(const bad of[null,[],{}, {...icon,id:'a'.repeat(10000)}, {...icon,kind:'ability'}])assert.equal(CosmeticInputSchema.safeParse(bad).success,false);
 assert.equal(AchievementInputSchema.safeParse(reward).success,true);
 assert.equal(AchievementInputSchema.safeParse({...reward,metric:'rank_tier',target:7}).success,false);
 assert.equal(AchievementInputSchema.safeParse({...reward,target:0}).success,false);
});
test('catalog migration preserves purchases, unlocks and equipment; public/admin reads and immutable versioned edits',async t=>{
 const {db,as,rpc,save}=await database(t);
 assert.equal((await db.query<{n:number}>('select count(*)::int n from public.cosmetic_purchases')).rows[0].n,1);
 assert.equal((await db.query<{skin_id:string}>('select skin_id from public.player_preferences')).rows[0].skin_id,'kitty');
 await as('anon','',async()=>{const catalog=CatalogSchema.parse(await rpc('content_catalog'));assert.equal(catalog.skins.length,28);assert.equal(catalog.profileIcons.length,14);assert.equal(catalog.achievements.length,10);await assert.rejects(rpc('admin_content_catalog'),/permission denied/);});
 await as('authenticated',A,async()=>{await assert.rejects(save(icon),/Admin access required/);await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('catalog-assets','icons/hack.webp')"),/row-level security/);await assert.rejects(db.query('select * from private.cosmetic_catalog'),/permission denied/);});
 await as('authenticated',ADMIN,async()=>{
  const draft=await save(icon);assert.equal(draft.revision,1);assert.equal(draft.publishedOnce,false);
  assert.equal((await rpc('content_catalog')).profileIcons.some((x:any)=>x.id===icon.id),false);
  await assert.rejects(save({...icon,status:'published'},0),/changed|revision/i);
  const published=await save({...icon,status:'published'},1);assert.equal(published.revision,2);assert.equal(published.publishedOnce,true);
  await assert.rejects(save({...icon,status:'published',acquisition:'free',price:0},2),/acquisition/i);
  const archived=await save({...icon,status:'archived',price:300},2);assert.equal(archived.revision,3);
  assert.equal((await rpc('content_catalog')).profileIcons.find((x:any)=>x.id===icon.id).status,'archived');
  for(const patch of[{imagePath:'https://evil.test/x.png'},{id:'BAD'},{price:-1},{status:'gone'},{color:'red;url(https://evil.test)'}])await assert.rejects(save({...icon,...patch},3),/Invalid/);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name,metadata) values('catalog-assets','icons/disguised.webp','{\"mimetype\":\"image/svg+xml\"}')"),/row-level security/);
  await db.query("insert into storage.objects(bucket_id,name) values('catalog-assets','icons/uuid.webp')");
  assert.equal((await db.query("update storage.objects set name='replaced.webp' returning name")).rows.length,0);
  assert.equal((await db.query('delete from storage.objects returning name')).rows.length,0);
 });
 await as('authenticated',A,async()=>{await assert.rejects(rpc('purchase_cosmetic',['icon',icon.id,150]),/Unknown item/);await db.query("update public.player_preferences set skin_id='dawn-oath' where player_id=$1",[A]);});
});
test('dynamic purchases and reusable milestone conditions preserve historical rewards and remain server-owned',async t=>{
 const {db,as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await save({...icon,status:'published'});
  await save({...icon,id:'earned-icon',acquisition:'achievement',price:0,status:'published'});
  const item=await rpc('admin_save_achievement',[JSON.stringify({...reward,target:1,reward:{kind:'icon',iconId:'earned-icon'},status:'published'}),0]);assert.equal(item.revision,1);
  await assert.rejects(rpc('admin_save_achievement',[JSON.stringify({...reward,target:1,reward:{kind:'icon',iconId:'fox'},status:'published'}),1]),/reward/i);
 });
 await as('authenticated',A,async()=>{
  const bought=await rpc('purchase_cosmetic',['icon','new-icon',150]);assert.equal(bought.balance,1850);
  assert.equal((await rpc('purchase_cosmetic',['icon','new-icon',150])).purchased,false);
  await db.query("update public.player_preferences set icon_id='new-icon' where player_id=$1",[A]);
  await assert.rejects(db.query("update public.player_preferences set icon_id='earned-icon' where player_id=$1",[A]),/Achievement required/);
  await assert.rejects(db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'wins-100')",[A]),/permission denied/);
 });
 await as('service_role','',()=>rpc('record_match',['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10-17T00:00:00Z','2026-10-17T00:01:00Z','surrender',1,JSON.stringify([{userId:A,score:16,maxTile:8},{userId:B,score:0,maxTile:2}]),'casual']));
 await as('authenticated',A,async()=>{
  assert.ok((await rpc('achievement_state')).unlocks.some((x:any)=>x.achievementId==='wins-100'));
  await db.query("update public.player_preferences set icon_id='earned-icon' where player_id=$1",[A]);
 });
 await as('authenticated',ADMIN,async()=>{
  await rpc('admin_save_achievement',[JSON.stringify({...reward,target:100,reward:{kind:'icon',iconId:'earned-icon'},status:'archived'}),1]);
  await save({...icon,id:'earned-icon',acquisition:'achievement',price:0,status:'archived'},1);
  await save({...icon,status:'archived'},1);
 });
 await as('authenticated',A,async()=>{
  await db.query("update public.player_preferences set icon_id='new-icon' where player_id=$1",[A]);
  await db.query("update public.player_preferences set icon_id='earned-icon' where player_id=$1",[A]);
  assert.ok((await rpc('sync_achievements')).unlocks.some((x:any)=>x.achievementId==='wins-100'));
 });
});

test('published images must exist and all direct RPC inputs fail closed',async t=>{
 const {as,rpc,save,db}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await assert.rejects(save({...icon,status:'published',imagePath:'icons/missing.webp'}),/uploaded|asset/i);
  for(const value of[null,[],{},42,'bad',{...icon,price:1.5},{...icon,price:1e100},{...icon,name:''},{...icon,imagePath:'../bad.png'},{...icon,unknown:true}])await assert.rejects(save(value as object),/Invalid/);
  const skin={kind:'skin',id:'new-board',name:'Board',description:'',status:'published',sortOrder:0,acquisition:'free',price:0,rarity:'rare',tokens:{boardBackground:'#123456',emptyBackground:'#123456',tileRadius:'0.5rem',boardImagePath:'boards/new.webp'}};
  await assert.rejects(rpc('admin_save_cosmetic',['skin',JSON.stringify(skin),0]),/uploaded|asset/i);
  for(const patch of[{boardBackground:'url(https://evil.test)'},{tileRadius:'1rem; color:red'},{character:'unknown'},{tilePalette:[]},{tilePattern:'bad'}])await assert.rejects(rpc('admin_save_cosmetic',['skin',JSON.stringify({...skin,tokens:{...skin.tokens,...patch}}),0]),/Invalid/);
  await db.query("insert into storage.objects(bucket_id,name) values('catalog-assets','boards/new.webp')");
  assert.equal((await rpc('admin_save_cosmetic',['skin',JSON.stringify(skin),0])).tokens.boardImagePath,'boards/new.webp');
  for(const value of[null,[],{},42,{...reward,target:0},{...reward,metric:'unknown'},{...reward,metric:'rank_tier',target:7},{...reward,reward:{kind:'icon',iconId:null}},{...reward,reward:{kind:'icon',iconId:'missing'}},{...reward,unknown:true}])await assert.rejects(rpc('admin_save_achievement',[JSON.stringify(value),0]),/Invalid/);
 });
});
test('edited milestones use uncapped historical progress and permanently keep earlier unlocks',async t=>{
 const {db,as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await save({...icon,id:'history-icon',acquisition:'achievement',price:0,status:'published'});
  await rpc('admin_save_achievement',[JSON.stringify({...reward,reward:{kind:'icon',iconId:'history-icon'},status:'published'}),0]);
 });
 await db.exec(`insert into public.matches(id,started_at,ended_at,reason,winner_slot,mode,achievement_eligible) select md5(('catalog-'||n)::text)::uuid,now()-interval '1 minute',now(),'surrender',1,'casual',true from generate_series(1,10001)n;
 insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result) select id,1,'${A}','Player',16,16,'win' from public.matches;`);
 await as('authenticated',A,async()=>{
  assert.equal((await rpc('achievement_state')).wins,10001);
  const state=await rpc('sync_achievements');assert.ok(state.unlocks.some((x:any)=>x.achievementId==='wins-100'));
  assert.equal((await rpc('sync_achievements')).unlocks.length,state.unlocks.length);
 });
 await as('authenticated',ADMIN,async()=>{
  await rpc('admin_save_achievement',[JSON.stringify({...reward,target:20000,reward:{kind:'icon',iconId:'history-icon'},status:'published'}),1]);
  const seeded=(await rpc('admin_content_catalog')).achievements.find((x:any)=>x.id==='wins-10');
  const {revision,publishedOnce,updatedAt,...input}=seeded;
  await rpc('admin_save_achievement',[JSON.stringify({...input,target:20000}),revision]);
 });
 await as('authenticated',B,async()=>{assert.equal((await rpc('sync_achievements')).unlocks.length,0);});
 await db.query("insert into public.matches(id,started_at,ended_at,reason,mode,achievement_eligible) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now(),now(),'draw','casual',true)");
 await db.query("insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,$1,'B',16,16,'win')",[B]);
 await db.query('select private.award_match_achievements($1)',[B]);
 assert.equal((await db.query<{n:number}>("select count(*)::int n from public.achievement_unlocks where player_id=$1 and achievement_id='wins-10'",[B])).rows[0].n,0);
 await as('authenticated',A,async()=>{await db.query("update public.player_preferences set icon_id='history-icon' where player_id=$1",[A]);assert.ok((await rpc('achievement_state')).unlocks.some((x:any)=>x.achievementId==='wins-100'));});
});

test('legacy deployed cosmetics retain their previous guards, ownership and equipped IDs',async t=>{
 const {db,as,rpc}=await database(t,async db=>{
  for(const [table,column,id] of[['player_preferences','skin_id','legacy-earned'],['player_preferences','icon_id','legacy-paid'],['achievement_unlocks','achievement_id','legacy-ach']]){
   const constraint=table+'_'+column+'_check';
   const expression=(await db.query<{expr:string}>('select pg_get_expr(conbin,conrelid) expr from pg_constraint where conname=$1',[constraint])).rows[0].expr;
   await db.exec(`alter table public.${table} drop constraint ${constraint},add constraint ${constraint} check((${expression}) or ${column}='${id}')`);
  }
  const guard=(await db.query<{body:string}>("select pg_get_functiondef('private.require_achievement_equipment()'::regprocedure) body")).rows[0].body;
  assert.ok(guard.includes("begin\n"));
  await db.exec(guard.replace("begin\n", "begin\n if new.skin_id='legacy-earned' and not exists(select 1 from public.achievement_unlocks where player_id=new.player_id and achievement_id='legacy-ach') then raise exception 'Legacy achievement required';end if;\n"));
  await db.exec("insert into private.cosmetic_catalog(kind,item_id,price) values('icon','legacy-paid',150)");
  await db.query("insert into public.achievement_unlocks(player_id,achievement_id) values($1,'legacy-ach')",[A]);
  await db.query("insert into public.cosmetic_purchases(player_id,kind,item_id,price_paid) values($1,'icon','legacy-paid',150)",[A]);
  await db.query("update public.player_preferences set skin_id='legacy-earned',icon_id='legacy-paid' where player_id=$1",[A]);
 });
 await as('anon','',async()=>{const catalog=CatalogSchema.parse(await rpc('content_catalog'));assert.equal(catalog.skins.find(x=>x.id==='legacy-earned')?.status,'archived');});
 await as('authenticated',A,async()=>{
  await db.query("update public.player_preferences set skin_id='classic',icon_id='fox' where player_id=$1",[A]);
  await db.query("update public.player_preferences set skin_id='legacy-earned',icon_id='legacy-paid' where player_id=$1",[A]);
 });
 await as('authenticated',B,async()=>{
  await assert.rejects(db.query("insert into public.player_preferences(player_id,skin_id) values($1,'legacy-earned')",[B]),/Legacy achievement required/);
  await assert.rejects(db.query("insert into public.player_preferences(player_id,icon_id) values($1,'legacy-paid')",[B]),/Purchase required/);
 });
});
test('default cosmetics and published achievement rewards cannot be archived underneath active content',async t=>{
 const {as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await save({...icon,id:'active-reward',acquisition:'achievement',price:0,status:'published'});
  await rpc('admin_save_achievement',[JSON.stringify({...reward,id:'active-achievement',reward:{kind:'icon',iconId:'active-reward'},status:'published'}),0]);
  await assert.rejects(save({...icon,id:'active-reward',acquisition:'achievement',price:0,status:'archived'},1),/achievement/i);
  const catalog=await rpc('admin_content_catalog');
  for(const [kind,source] of[['skin',catalog.skins.find((x:any)=>x.id==='classic')],['icon',catalog.profileIcons.find((x:any)=>x.id==='fox')]]){
   const {revision,publishedOnce,updatedAt,...input}=source;
   await assert.rejects(rpc('admin_save_cosmetic',[kind,JSON.stringify({...input,status:'archived'}),revision]),/default/i);
  }
  await save({...icon,id:'never-published',status:'archived'});
  assert.equal((await rpc('content_catalog')).profileIcons.some((x:any)=>x.id==='never-published'),false);
 });
});
test('concurrent catalog edits and purchase retries cannot overwrite newer content or charge twice',async t=>{
 const {db,as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await save({...icon,status:'published'});
  const edits=await Promise.allSettled([save({...icon,status:'published',name:'First edit'},1),save({...icon,status:'published',name:'Second edit'},1)]);
  assert.equal(edits.filter(x=>x.status==='fulfilled').length,1);
  assert.match((edits.find(x=>x.status==='rejected') as PromiseRejectedResult).reason.message,/changed/);
  assert.equal((await rpc('admin_content_catalog')).profileIcons.find((x:any)=>x.id===icon.id).revision,2);
 });
 await as('authenticated',A,async()=>{
  const purchases=await Promise.all([rpc('purchase_cosmetic',['icon',icon.id,150]),rpc('purchase_cosmetic',['icon',icon.id,150]),rpc('purchase_cosmetic',['icon',icon.id,150])]);
  assert.equal(purchases.filter(x=>x.purchased).length,1);assert.ok(purchases.every(x=>x.balance===1850));
  await db.exec('begin');await rpc('purchase_cosmetic',['icon','owl',150]);await db.exec('rollback');
  assert.equal((await rpc('cosmetic_state')).balance,1850);
 });
 await as('authenticated',B,async()=>{
  await assert.rejects(rpc('purchase_cosmetic',['icon',icon.id,150]),/Not enough coins/);
  assert.equal((await rpc('cosmetic_state')).balance,0);
  assert.deepEqual((await rpc('cosmetic_state')).purchases,[]);
 });
});
test('attendance, tile and rank events reuse catalog thresholds without redeployment',async t=>{
 const {db,as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  await save({...icon,id:'event-reward',acquisition:'achievement',price:0,status:'published'});
  for(const [metric,target] of [['attendance_streak',2],['highest_tile',16],['rank_tier',1]] as const)await rpc('admin_save_achievement',[JSON.stringify({...reward,id:'event-'+metric.replaceAll('_','-'),metric,target,reward:{kind:'icon',iconId:'event-reward'},status:'published'}),0]);
 });
 await db.query("select private.check_in_at($1,'2026-10-16T00:00:00Z')",[A]);
 await db.query("select private.check_in_at($1,'2026-10-17T00:00:00Z')",[A]);
 await as('service_role','',()=>rpc('record_match',['cccccccc-cccc-4ccc-8ccc-cccccccccccc','2026-10-17T00:00:00Z','2026-10-17T00:01:00Z','draw',null,JSON.stringify([{userId:A,score:16,maxTile:16},{userId:B,score:0,maxTile:2}]),'casual']));
 await db.query("insert into public.season_ratings(season_id,player_id,display_name,rating,placement_games,tier,peak_rating) select id,$1,'A',900,10,'Bronze',900 from public.rank_seasons",[A]);
 await as('authenticated',A,async()=>{
  const state=await rpc('achievement_state');assert.equal(state.attendance.bestStreak,2);
  for(const metric of ['attendance-streak','highest-tile','rank-tier'])assert.ok(state.unlocks.some((x:any)=>x.achievementId==='event-'+metric),metric);
 });
});
test('existing solo milestones and equipment migrate as editable catalog entries with trusted event hooks',async t=>{
 const {db,as,rpc}=await database(t,async db=>{
  await db.exec(`create table public.solo_records(player_id uuid,board_size integer,elapsed_ms integer);
   create table public.solo_endless_records(player_id uuid,max_tile integer);
   alter function private.achievement_progress(uuid) rename to achievement_progress_solo_fixture;
   create function private.achievement_progress(p_player uuid) returns jsonb language sql stable security definer set search_path='' as $$
   select private.achievement_progress_solo_fixture(p_player)||jsonb_build_object('soloBestMs',(select elapsed_ms from public.solo_records where player_id=p_player and board_size=4),'soloHighestTile',coalesce((select max_tile from public.solo_endless_records where player_id=p_player),0))$$;`);
  await db.query('insert into public.solo_records values($1,4,350000)',[A]);
 });
 await as('anon','',async()=>{
  const catalog=CatalogSchema.parse(await rpc('content_catalog'));assert.equal(catalog.skins.length,36);assert.equal(catalog.achievements.length,18);
  assert.equal(catalog.skins.find(x=>x.id==='storm-fox')?.tokens.character,'fox');
 });
 await as('authenticated',A,async()=>{
  const state=await rpc('sync_achievements');
  for(const id of ['solo-first','solo-10min','solo-6min'])assert.ok(state.unlocks.some((x:any)=>x.achievementId===id));
  assert.equal(state.unlocks.some((x:any)=>x.achievementId==='solo-4min'),false);
  await db.query("update public.player_preferences set skin_id='golden-flash' where player_id=$1",[A]);
 });
 await db.query('update public.solo_records set elapsed_ms=100000 where player_id=$1',[A]);
 await db.query('insert into public.solo_endless_records values($1,8192)',[A]);
 await as('authenticated',A,async()=>{
  const state=await rpc('achievement_state');for(const id of ['solo-4min','solo-2min','endless-2048','endless-4096','endless-8192'])assert.ok(state.unlocks.some((x:any)=>x.achievementId===id),id);
 });
 await as('authenticated',B,async()=>{
  const state=await rpc('sync_achievements');assert.equal(state.unlocks.some((x:any)=>x.achievementId.startsWith('solo-')),false);
  await assert.rejects(db.query("insert into public.player_preferences(player_id,skin_id) values($1,'chrono-dragon')",[B]),/Achievement required/);
 });
});
test('new achievements can reuse existing attendance and rank rewards without stale hardcoded gates',async t=>{
 const {db,as,rpc}=await database(t);
 await as('authenticated',ADMIN,async()=>{
  for(const item of[
   {...reward,id:'reuse-dawn',target:1,reward:{kind:'skin',skinId:'dawn-oath'},status:'published'},
   {...reward,id:'reuse-rank',target:1,reward:{kind:'set',skinId:'rank-bronze',iconId:'rank-bronze'},status:'published'},
  ])await rpc('admin_save_achievement',[JSON.stringify(item),0]);
 });
 await as('service_role','',()=>rpc('record_match',['dddddddd-dddd-4ddd-8ddd-dddddddddddd','2026-10-17T00:00:00Z','2026-10-17T00:01:00Z','surrender',2,JSON.stringify([{userId:A,score:0,maxTile:2},{userId:B,score:16,maxTile:8}]),'casual']));
 await as('authenticated',B,async()=>{
  const state=await rpc('achievement_state');assert.equal(state.unlocks.some((x:any)=>x.achievementId==='checkin-7'||x.achievementId==='rank-bronze'),false);
  assert.ok(state.unlocks.some((x:any)=>x.achievementId==='reuse-dawn'));assert.ok(state.unlocks.some((x:any)=>x.achievementId==='reuse-rank'));
  await db.query("insert into public.player_preferences(player_id,skin_id) values($1,'dawn-oath')",[B]);
  await db.query("update public.player_preferences set skin_id='rank-bronze',icon_id='rank-bronze' where player_id=$1",[B]);
 });
});
test('the reserved guest avatar cannot become a purchasable or earned catalog icon',async t=>{
 assert.equal(CosmeticInputSchema.safeParse({...icon,id:'guest'}).success,false);
 const {as,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{await assert.rejects(save({...icon,id:'guest'}),/Invalid|reserved/i);});
});

test('coin purchases require the displayed price and never silently charge a changed catalog price',async t=>{
 const {as,rpc,save}=await database(t);
 await as('authenticated',ADMIN,async()=>{await save({...icon,status:'published'});await save({...icon,status:'published',price:300},1);});
 await as('authenticated',A,async()=>{
  for(const quoted of[150,null,-1])await assert.rejects(rpc('purchase_cosmetic',['icon',icon.id,quoted]),/Price changed|Price confirmation required/);
  await assert.rejects(rpc('purchase_cosmetic',['icon',icon.id]),/Price confirmation required/);
  assert.equal((await rpc('cosmetic_state')).balance,2000);
  assert.equal((await rpc('purchase_cosmetic',['icon',icon.id,300])).balance,1700);
  const retry=await rpc('purchase_cosmetic',['icon',icon.id,150]);assert.equal(retry.balance,1700);assert.equal(retry.purchased,false);
 });
});
test('legacy two-argument buyers may only use the migration-time price, never a newly increased price',async t=>{
 const {db,as,rpc,save}=await database(t);
 await as('authenticated',A,async()=>{assert.equal((await rpc('purchase_cosmetic',['icon','owl'])).balance,1850);});
 await as('authenticated',ADMIN,async()=>{await save({...icon,id:'owl',status:'published',price:300},1);});
 await db.query('update public.player_wallets set balance=1000 where player_id=$1',[B]);
 await as('authenticated',B,async()=>{
  await assert.rejects(rpc('purchase_cosmetic',['icon','owl']),/Price changed|Price confirmation required/);
  assert.equal((await rpc('cosmetic_state')).balance,1000);
  assert.equal((await rpc('purchase_cosmetic',['icon','owl',300])).balance,700);
 });
});
