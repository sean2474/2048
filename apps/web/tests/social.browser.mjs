import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { mockAccount } from "./browser-fixtures.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { io } = createRequire(require.resolve("../../socket/package.json"))("socket.io-client");
const { createGameServer } = require("../../socket/src/server.ts");
const { createMatch } = require("../../socket/src/matchmaking.ts");
const { rooms, playerAccounts } = require("../../socket/src/state.ts");
const { joinRoom, broadcast, endGame } = require("../../socket/src/game.ts");
const origin="http://[::1]:3001";
const artifacts=new URL("../../../docs/social/",import.meta.url).pathname;
const ids=["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"];

test("friend search, requests, persistent messages, retry and live spectating work on desktop and mobile", { timeout:120000 }, async () => {
  const browser=await chromium.launch({channel:"chrome",headless:true});
  let relationship=null, requester=null, failSend=false;
  const messages=[];
  const accountId=token=>token.startsWith("1000") ? token : JSON.parse(Buffer.from(token.split(".")[1],"base64url")).sub;
  const server=createGameServer({ resolveAccount:async token=>({id:accountId(token),name:"타일친구"}), readFriends:async token=>relationship==="friend"?ids.filter(id=>id!==accountId(token)):[], canSpectate:async ()=>relationship==="friend" });
  server.io.engine.opts.allowUpgrades=false;
  await new Promise(resolve=>server.httpServer.listen(0,"127.0.0.1",resolve));
  const socketOrigin=`http://127.0.0.1:${server.httpServer.address().port}`;
  const sockets=[];
  const errors=[];
  await mkdir(artifacts,{recursive:true});
  try {
    const pages=[];
    for(let i=0;i<2;i++) {
      const context=await browser.newContext({locale:"ko-KR",viewport:{width:i?375:1440,height:900}});
      await context.route("**/socket.io/**",async route=>{
        const url=new URL(route.request().url());
        const response=await route.fetch({url:`${socketOrigin}${url.pathname}${url.search}`});
        await route.fulfill({response,headers:{...response.headers(),"access-control-allow-origin":"*"}});
      });
      const page=await context.newPage(); pages.push(page); page.on("pageerror",error=>errors.push(error.message));
      await mockAccount(page,ids[i]);
      await page.route("**/rest/v1/rpc/*",async route=>{
        const name=new URL(route.request().url()).pathname.split("/").pop(), body=route.request().postDataJSON()??{};
        let data=null;
        if(name==="social_players") data=relationship || body.p_query || body.p_target ? [{ id:ids[1-i],name:"타일친구",icon_id:"owl",relationship:relationship==="pending"?(requester===ids[i]?"outgoing":"incoming"):relationship,unread:0 }] : [];
        else if(name==="friend_action") { if(body.p_action==="request") { relationship="pending"; requester=ids[i]; } else relationship=body.p_action==="accept"?"friend":null; }
        else if(name==="social_messages") data=messages.filter(m=>!body.p_before || m.id<body.p_before).slice(-50).reverse();
        else if(name==="send_direct_message") {
          if(failSend) return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({message:"Test offline"})});
          messages.push({id:messages.length+1,sender_id:ids[i],body:body.p_body,created_at:new Date().toISOString()});
        } else return route.fallback();
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
      });
      await page.goto(`${origin}/friends`);
    }
    const [a,b]=pages;
    await a.getByLabel("닉네임 검색 (1~32자)").fill("타일친구");
    await a.getByRole("button",{name:"검색",exact:true}).click();
    await a.getByRole("button",{name:"친구 추가",exact:true}).click();
    await a.getByText("친구 요청을 보냈어요.").waitFor();
    await b.reload(); await b.getByRole("button",{name:"수락",exact:true}).click();
    await b.getByRole("heading",{name:"타일친구님과의 대화"}).waitFor();
    await a.reload();
    await a.getByRole("button",{name:"타일친구님에게 메시지"}).click();
    await a.getByLabel("메시지",{exact:true}).fill("다음 판 같이 할래?");
    failSend=true;
    await a.getByRole("button",{name:"메시지 보내기"}).click();
    await a.getByText("메시지를 보내지 못했어요.",{exact:false}).waitFor();
    assert.equal(await a.getByLabel("메시지",{exact:true}).inputValue(),"다음 판 같이 할래?");
    failSend=false; await a.getByRole("button",{name:"메시지 보내기"}).click();
    await a.getByText("다음 판 같이 할래?",{exact:true}).waitFor();
    // Without a realtime connection, the periodic refresh still delivers new messages.
    await b.getByText("다음 판 같이 할래?",{exact:true}).waitFor({timeout:35000});
    await b.getByLabel("메시지",{exact:true}).fill("좋아! 이번 판 먼저 관전할게.");
    await b.getByRole("button",{name:"메시지 보내기"}).click();
    await b.getByText("좋아! 이번 판 먼저 관전할게.",{exact:true}).waitFor();
    await a.reload(); await a.getByRole("button",{name:"타일친구님에게 메시지"}).click();
    await a.getByText("좋아! 이번 판 먼저 관전할게.",{exact:true}).waitFor();
    for(const [index,page] of pages.entries()) {
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),page.viewportSize().width);
      await page.screenshot({path:`${artifacts}/friends-${index?"mobile":"desktop"}.png`,fullPage:true});
    }
    for(const id of ids) {
      const socket=io(socketOrigin,{transports:["websocket"],auth:{sessionToken:randomBytes(32).toString("hex"),accessToken:id},autoConnect:false});
      sockets.push(socket);
      await new Promise((resolve,reject)=>{socket.once("connect",resolve);socket.once("connect_error",reject);socket.connect();});
    }
    const pids=ids.map(id=>[...playerAccounts].find(([,account])=>account?.id===id)[0]);
    createMatch(...pids,server.io,"matchFound"); const room=[...rooms.values()][0];
    for(const pid of pids) joinRoom(pid,room.id,server.io);
    await b.getByRole("link",{name:"타일친구님 관전"}).click();
    await b.getByText("실시간 관전 중",{exact:false}).waitFor().catch(async error => { console.error(await b.locator("main").innerText()); throw error; });
    assert.equal(await b.locator("[data-ability-control]").isDisabled(),true);
    room.state[pids[0]].score=128; broadcast(room,server.io);
    await b.getByTestId("your-score").filter({hasText:"128"}).waitFor();
    assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth),375);
    await b.screenshot({path:`${artifacts}/watch-mobile.png`,fullPage:true});
    endGame(room,pids[0],"surrender",server.io);
    await b.getByText("타일친구님이 승리했어요.",{exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  } finally {
    sockets.forEach(s=>s.disconnect());
    for (const context of browser.contexts()) await context.unrouteAll({ behavior: "ignoreErrors" });
    await browser.close(); await server.close();
  }
});
