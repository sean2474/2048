import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAuthDatabase } from "./helpers/pglite";
import { readFile, readdir } from "node:fs/promises";

test("friend requests, private paginated messages and spectator permissions are enforced in PostgreSQL", async t => {
  const db = await createAuthDatabase(); t.after(() => db.close());
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, dir), "utf8"));
  const [a,b,c] = [randomUUID(),randomUUID(),randomUUID()];
  await db.query("insert into auth.users(id,raw_user_meta_data) values($1,'{\"name\":\"Alice\"}'),($2,'{\"name\":\"Bob\"}'),($3,'{\"name\":\"Carol\"}')", [a,b,c]);
  const as = async (role: string, user: string, fn: () => Promise<unknown>) => {
    await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.aal','aal2',false)", [user]);
    try { return await fn(); } finally { await db.exec("reset role"); }
  };
  const action = (user: string, target: string, action: string) => as("authenticated",user,() => db.query("select public.friend_action($1,$2)",[target,action]));
  const send = (user: string, target: string, body: string, id=randomUUID()) => as("authenticated",user,() => db.query("select public.send_direct_message($1,$2,$3)",[target,body,id]));
  const allowed = async (ranked=false, viewer=c) => {
    let result = false;
    await as("service_role","",async () => { result=(await db.query<{ allowed: boolean }>("select public.can_spectate($1,$2,$3) allowed",[viewer,a,ranked])).rows[0].allowed; });
    return result;
  };
  await as("anon","",()=>assert.rejects(db.query("select public.social_players()"),/permission denied/));
  await as("authenticated",a,async () => {
    const found = (await db.query<{ name: string; icon_id: string }>("select * from public.social_players('Bo')")).rows;
    assert.deepEqual(found.map(p=>[p.name,p.icon_id]),[["Bob","fox"]]);
    assert.equal((await db.query("select * from public.social_players('B')")).rows.length,1);
    await assert.rejects(db.query("select * from public.social_players(' ')"),/Search needs/);
    await assert.rejects(db.query("insert into public.friendships(low_id,high_id,requested_by) values($1,$2,$1)",[a,b]),/permission denied/);
    await assert.rejects(db.query("select public.can_spectate($1,$2,true)",[a,b]),/permission denied/);
  });
  await assert.rejects(action(a,a,"request"),/Invalid friend action/);
  await action(a,b,"request"); await action(a,b,"request");
  await assert.rejects(action(a,b,"accept"),/No incoming request/);
  await assert.rejects(send(a,b,"pending"),/Friends only/);
  await action(b,a,"accept");
  assert.equal(await allowed(false,b),true); assert.equal(await allowed(),false);
  const requestId=randomUUID();
  await send(a,b," hello ",requestId); await send(a,b,"hello",requestId);
  await as("authenticated",c,async () => {
    assert.equal((await db.query("select * from public.direct_messages")).rows.length,0);
    assert.equal((await db.query("select * from public.friendships")).rows.length,0);
    assert.equal((await db.query("select * from public.social_messages($1)",[a])).rows.length,0);
  });
  await as("authenticated",b,async () => {
    assert.equal(Number((await db.query<{ unread: number }>("select * from public.social_players()")).rows[0].unread),1);
    const thread=(await db.query<{ body: string }>("select * from public.social_messages($1)",[a])).rows;
    assert.deepEqual(thread.map(m=>m.body),["hello"]);
    assert.equal(Number((await db.query<{ unread: number }>("select * from public.social_players()")).rows[0].unread),0);
  });
  await assert.rejects(send(a,b," "),/Invalid message/);
  await assert.rejects(send(a,b,"x".repeat(1001)),/Invalid message/);
  await action(b,a,"remove");
  assert.equal(await allowed(false,b),false);
  await assert.rejects(send(a,b,"removed"),/Friends only/);
  await action(b,a,"request"); await action(a,b,"accept");
  for(let i=0;i<29;i++) await send(a,b,`message ${i}`);
  await assert.rejects(send(a,b,"too many"),/Message rate limit/);
  await db.exec("update public.direct_messages set created_at=now()-interval '2 minutes'");
  for(let i=0;i<25;i++) await send(a,b,`next ${i}`);
  await as("authenticated",b,async () => {
    const latest=(await db.query<{ id: number }>("select * from public.social_messages($1)",[a])).rows;
    assert.equal(latest.length,50);
    const older=(await db.query<{ id: number }>("select * from public.social_messages($1,$2)",[a,latest[49].id])).rows;
    assert.equal(older.length,5); assert.ok(Number(older[0].id)<Number(latest[49].id));
  });
  await db.query("insert into public.player_ratings(player_id,display_name,wins,placement_games,tier,season_id) values($1,'Alice',10,10,'Silver',(select id from public.rank_seasons where ends_at is null))",[a]);
  assert.equal(await allowed(true),true); assert.equal(await allowed(false),false);
  await db.query("update public.players set suspended_at=now(),suspension_reason='Test' where id=$1",[b]);
  await assert.rejects(send(b,a,"suspended"),/Account unavailable/);
  assert.equal(await allowed(true,b),false);
  await db.query("delete from auth.users where id=$1",[a]);
  assert.equal((await db.query("select * from public.direct_messages")).rows.length,0);
  assert.equal((await db.query("select * from public.friendships")).rows.length,0);
});
