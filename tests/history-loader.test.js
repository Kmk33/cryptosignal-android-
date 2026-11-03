import test from "node:test";
import assert from "node:assert/strict";
import {loadSymbolHistory,bootstrapHistory} from "../www/history-loader.js";
function fakeFetch(url){
 const u=new URL(url),limit=Number(u.searchParams.get("limit"));
 const rows=Array.from({length:limit},(_,i)=>[i,"1","2","0.5","1.5","10",i===limit-1?Date.now()+60000:Date.now()-60000,"15"]);
 return Promise.resolve({ok:true,json:async()=>rows});
}
test("history loader strips forming candle and normalizes Binance klines",async()=>{
 const data=await loadSymbolHistory("BTCUSDT",{fetchImpl:fakeFetch});
 assert.equal(data.m5.length,119);assert.equal(data.h1.length,39);assert.equal(data.h4.length,69);
 assert.equal(data.m5[0].quote_volume,15);assert.equal(data.m5[0].close,1.5);
});
test("bootstrap processes each symbol and reports counts",async()=>{
 const r=await bootstrapHistory(["BTCUSDT","ETHUSDT"],{fetchImpl:fakeFetch,concurrency:2});
 assert.equal(r.loaded,2);assert.equal(r.failed,0);
});
test("Motor 5-only history avoids unnecessary 1h and 4h requests",async()=>{
 const r=await bootstrapHistory(["BTCUSDT"],{fetchImpl:fakeFetch,includeMotor2:()=>false});
 assert.equal(r.loaded,1);assert.equal(r.results[0].m5.length,119);
 assert.equal(r.results[0].h1.length,0);assert.equal(r.results[0].h4.length,0);
});
