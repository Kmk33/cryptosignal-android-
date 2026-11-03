import test from "node:test";
import assert from "node:assert/strict";
import {BinanceSpotFeed} from "../www/binance-feed.js";
import {scoreMotor1Micro,motor1CandleAlert} from "../www/motor1.js";
class FakeWS {
 constructor(url){this.url=url;FakeWS.all.push(this);}
 send(){}
 close(){this.closeCalled=true;this.onclose?.();}
}
FakeWS.all=[];
test("Binance feed creates ticker connection without credentials",()=>{
 FakeWS.all=[];const feed=new BinanceSpotFeed({WebSocketImpl:FakeWS});
 feed.start();assert.match(FakeWS.all[0].url,/!ticker@arr/);
 feed.stop();
});
test("stop closes ticker and market sockets and prevents reconnect",()=>{
 FakeWS.all=[];const feed=new BinanceSpotFeed({WebSocketImpl:FakeWS});
 feed.start();const ticker=feed.tickerSocket;feed.stop();
 assert.equal(feed.closed,true);assert.equal(feed.sockets.length,0);
 assert.ok(ticker);assert.equal(ticker.closeCalled,true);
});
test("market subscription splits 200 symbols below 1024 streams per socket",()=>{
 FakeWS.all=[];const feed=new BinanceSpotFeed({WebSocketImpl:FakeWS});
 feed.closed=false;feed.symbols=Array.from({length:200},(_,i)=>`COIN${i}USDT`);
 feed.rebuildMarketSockets();
 assert.equal(FakeWS.all.length,6);
 for(const ws of FakeWS.all){const streams=decodeURIComponent(ws.url).split("/").filter(x=>x.includes("@"));assert.ok(streams.length<=240);assert.ok(streams.some(x=>x.includes("@kline_1m")));}
 feed.stop();
});
test("Motor 1 micro score requires 30k USDT in the recent window",()=>{
 const r=scoreMotor1Micro({trades:[],spreadSamples:[],nowMs:1_800_000_000_000});
 assert.equal(r.status,"BELOW_NOTIONAL");assert.equal(r.recentNotional,0);
});
test("Motor 1 candle alert retains 3x volume and +1.5% threshold",()=>{
 const candles=Array.from({length:13},(_,i)=>({open:100,high:101,close:100,volume:60000}));
 candles[12]={open:100,high:103,close:102,volume:181000};
 const r=motor1CandleAlert(candles);assert.ok(r);assert.ok(r.volume_ratio>3);assert.ok(r.price_change_pct>1.5);
});
test("Motor 1 candle alert does not trigger below strict threshold",()=>{
 const candles=Array.from({length:13},()=>({open:100,high:101,close:100,volume:60000}));
 candles[12]={open:100,high:102,close:101.4,volume:181000};
 assert.equal(motor1CandleAlert(candles),null);
});

test("feed parses kline, aggTrade and bookTicker into normalized events",()=>{
 FakeWS.all=[];const seen=[];
 const feed=new BinanceSpotFeed({WebSocketImpl:FakeWS,onEvent:e=>seen.push(e)});
 feed.handle({e:"kline",s:"ETHUSDT",k:{i:"5m",x:true,t:1000,o:"10",h:"12",l:"9",c:"11",v:"5",q:"55"}});
 feed.handle({e:"aggTrade",s:"ETHUSDT",p:"11",q:"2",m:false,T:2000});
 feed.handle({e:"bookTicker",s:"ETHUSDT",b:"10.9",B:"3",a:"11",A:"4",u:3});
 assert.equal(seen.length,3);
 assert.equal(seen[0].candle.quote_volume,55);
 assert.equal(seen[1].notional,22);
 assert.equal(seen[2].ask,11);
 feed.stop();
});
