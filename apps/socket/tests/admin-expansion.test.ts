import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const ADMIN='11111111-1111-4111-8111-111111111111', A='22222222-2222-4222-8222-222222222222';
test('admin exploration validates authority, dates, filters, stable cursors, legacy and deleted accounts', async t => {
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
 const dir=new URL('../../../supabase/migrations/',import.meta.url);
 for(const f of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(f,dir),'utf8'));
 await db.query(`insert into auth.users(id,email) values($1,'admin@test.invalid'),($2,'player@test.invalid')`,[ADMIN,A]);
 await db.query('insert into public.admin_roles values($1)',[ADMIN]);
 const rpc=async(sql:string,args:unknown[]=[]) => (await db.query<{value:any}>(`select ${sql} as value`,args)).rows[0].value;
 await db.exec('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)",[A]);
 for(const sql of ['public.admin_matches()','public.admin_audit_entries()','public.admin_players_filtered()','public.admin_match(null)']) await assert.rejects(rpc(sql),/Admin access required/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)",[ADMIN]);
 assert.deepEqual((await rpc('public.admin_matches()')).matches,[]);
 assert.deepEqual((await rpc('public.admin_audit_entries()')).entries,[]);
 await assert.rejects(rpc("public.admin_matches(p_mode=>'invalid')"),/Invalid match filter/);
 await assert.rejects(rpc("public.admin_matches(p_from=>null)"),/Invalid match filter/);
 await assert.rejects(rpc("public.admin_matches(p_from=>current_date-100)"),/Invalid match filter/);
 await assert.rejects(rpc("public.admin_matches(p_before_time=>now())"),/Invalid match filter/);
 await assert.rejects(rpc("public.admin_match('not-a-uuid')"),/uuid/);
 await assert.rejects(rpc("public.admin_audit_entries(p_action=>'delete')"),/Invalid audit filter/);
 await assert.rejects(rpc("public.admin_players_filtered(p_status=>'oops')"),/Invalid player search/);
 assert.equal((await rpc("public.admin_players_filtered(p_status=>'admin')")).total,1);
 const newcomer=(await rpc('public.admin_player($1)',[A])).player;
 assert.equal(newcomer.rating,1200); assert.equal(newcomer.tier,null);
 assert.equal(newcomer.placementGames,0); assert.equal(newcomer.peakRating,null);
 assert.equal("promotionTarget" in newcomer,false);
 await rpc("public.admin_set_suspension($1,true,'정지 🧩')",[A]);
 assert.equal((await rpc("public.admin_players_filtered(p_status=>'suspended')")).total,1);
 assert.equal((await rpc("public.admin_players_filtered(p_status=>'active')")).total,1);
 await db.exec('reset role');
 await db.exec(`insert into public.matches(id,started_at,ended_at,reason,winner_slot,mode)
 select md5(n::text)::uuid,now()-interval '1 minute',now(),'draw',null,'legacy' from generate_series(1,55)n;
 insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result)
 select id,1,null,'Deleted snapshot',0,2,'draw' from public.matches;
 insert into public.match_participants(match_id,slot,player_id,display_name,score,max_tile,result,telemetry)
 select id,2,'${A}','Player',0,2,'draw','{"moves":0,"charged":{"xblock":0,"hardblock":0},"sent":{"xblock":0,"hardblock":0},"received":{"xblock":0,"hardblock":0}}' from public.matches;`);
 await db.exec('set role authenticated');
 const page=await rpc('public.admin_matches()'); assert.equal(page.matches.length,50); assert.equal(page.hasMore,true);
 const tail=await rpc('public.admin_matches(p_before_time=>$1,p_before_id=>$2)',[page.nextCursor.time,page.nextCursor.id]);
 assert.equal(tail.matches.length,5); assert.equal(tail.hasMore,false); assert.equal(new Set([...page.matches,...tail.matches].map(x=>x.id)).size,55);
 const match=await rpc('public.admin_match($1)',[page.matches[0].id]);
 assert.equal(match.participants[0].playerId,null); assert.equal(match.participants[0].telemetry,null); assert.equal(match.participants[1].telemetry.moves,0); assert.equal(match.mode,'legacy');
 const audit=await rpc('public.admin_audit_entries(p_player_id=>$1)',[A]); assert.equal(audit.entries[0].reason,'정지 🧩');
 const overview=await rpc("public.admin_overview(7,'all')"); assert.equal(overview.daily.length,8); assert.ok(overview.periodStart); assert.ok(overview.periodEnd);
 await db.exec('reset role');
 await db.exec(`insert into public.admin_audit(player_id,actor_id,action,reason,created_at)
 select '${A}','${ADMIN}','unsuspend','Audit '||n,now()-interval '1 minute' from generate_series(1,55)n;
 insert into public.matches(id,started_at,ended_at,reason,winner_slot,mode) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','2026-01-01T14:59:59Z','2026-01-01T14:59:59Z','draw',null,'legacy'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','2026-01-01T15:00:00Z','2026-01-01T15:00:00Z','draw',null,'legacy'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3','2026-01-02T15:00:00Z','2026-01-02T15:00:00Z','draw',null,'legacy');`);
 await db.exec('set role authenticated');
 const day=await rpc("public.admin_matches(p_from=>'2026-01-02',p_to=>'2026-01-02')");
 assert.deepEqual(day.matches.map((m:any)=>m.id),['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2']);
 assert.equal((await rpc("public.admin_matches(p_match_id=>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')")).matches.length,1);
 const audits=await rpc('public.admin_audit_entries()');assert.equal(audits.entries.length,50);assert.equal(audits.hasMore,true);
 const remaining=await rpc('public.admin_audit_entries(p_before_time=>$1,p_before_id=>$2)',[audits.nextCursor.time,audits.nextCursor.id]);assert.equal(remaining.entries.length,6);assert.equal(remaining.hasMore,false);
 await db.exec('reset role');
 await db.query('delete from auth.users where id=$1',[A]);
 await db.exec('set role authenticated');
 const deleted=await rpc('public.admin_audit_entries(p_player_id=>$1)',[A]);assert.equal(deleted.entries[0].playerExists,false);assert.equal(deleted.entries[0].playerId,A);
 await db.exec('reset role');
 await db.exec(`insert into public.matches(id,started_at,ended_at,reason,winner_slot,mode)
 select md5(('large-'||n)::text)::uuid,now(),now(),'draw',null,'legacy' from generate_series(1,10000)n;`);
 await db.exec('set role authenticated');assert.equal((await rpc('public.admin_matches()')).matches.length,50);
 await db.exec('reset role'); await db.query('delete from public.admin_roles where user_id=$1',[ADMIN]); await db.exec('set role authenticated');
 await assert.rejects(rpc('public.admin_matches()'),/Admin access required/);
});
