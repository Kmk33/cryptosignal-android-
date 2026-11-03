import test from "node:test";
import assert from "node:assert/strict";

class AppFakeWS {
  static all=[];
  constructor(url){this.url=url;AppFakeWS.all.push(this);}
  close(){this.onclose?.();}
}

test("mobile app boots, exposes engine and renders ticker snapshot",async()=>{
  AppFakeWS.all=[];
  const ids=["connection","markets","pairs","updated","candidates","history-status"];
  const elements=Object.fromEntries(ids.map(id=>[id,{textContent:"",innerHTML:""}]));
  globalThis.document={getElementById:id=>elements[id]};
  globalThis.window={addEventListener(){}};
  globalThis.WebSocket=AppFakeWS;
  globalThis.setInterval=()=>0;
  await import(`../www/app.js?smoke=${Date.now()}`);
  assert.ok(window.CryptoSignalEngine);
  assert.equal(AppFakeWS.all.length,1);
  AppFakeWS.all[0].onmessage({data:JSON.stringify([{s:"BTCUSDT",q:"100",c:"65000",P:"1.25"}])});
  assert.match(elements.markets.innerHTML,/BTC/);
  assert.equal(elements.pairs.textContent,"1");
  window.CryptoSignalEngine.BinanceSpotFeed && assert.ok(true);
});
