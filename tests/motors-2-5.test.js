import test from "node:test";
import assert from "node:assert/strict";
import {motor5Score,MOTOR5_DEFAULTS} from "../www/motor5.js";
import {ema,rsiWilder,motor2Evaluate} from "../www/motor2.js";
test("Motor 5 defaults preserve strict source thresholds",()=>{
 assert.equal(MOTOR5_DEFAULTS.min_score,7);
 assert.equal(MOTOR5_DEFAULTS.min_24h_quote_volume,1_000_000);
 assert.equal(MOTOR5_DEFAULTS.max_spread_bps,35);
 assert.equal(MOTOR5_DEFAULTS.min_price_move_pct,.35);
 assert.equal(MOTOR5_DEFAULTS.volume_z_threshold,3);
 assert.equal(MOTOR5_DEFAULTS.imbalance_threshold,.2);
});
test("Motor 5 rejects wide spread and thin 24h volume",()=>{
 const candles=Array.from({length:25},(_,i)=>({close:100+i*.3,quote_volume:1000+i*3}));
 assert.equal(motor5Score({candles,snapshot:{price:108,quote_volume_24h:2e6,bid:99,ask:101}}).status,"SPREAD_REJECT");
 assert.equal(motor5Score({candles,snapshot:{price:108,quote_volume_24h:999999,bid:107,ask:107.01}}).status,"LIQUIDITY_REJECT");
});
test("Motor 5 does not fabricate signal below minimum score",()=>{
 const candles=Array.from({length:25},(_,i)=>({close:100+i*.01,quote_volume:1000+i}));
 const r=motor5Score({symbol:"ABCUSDT",candles,snapshot:{price:100.24,quote_volume_24h:2e6,bid:100.2,ask:100.21}});
 assert.equal(r.status,"NO_SIGNAL");
});
test("EMA and Wilder RSI return finite values",()=>{
 assert.ok(Math.abs(ema([1,2,3],2)[2]-2.5555555555)<1e-8);
 assert.equal(rsiWilder(Array.from({length:20},(_,i)=>i+1)),100);
});
test("Motor 2 waits for enough history and uses configured closed-candle filters",()=>{
 assert.equal(motor2Evaluate([],[]).reason,"INSUFFICIENT_CLOSED_CANDLES");
 const make=(n,step)=>Array.from({length:n},(_,i)=>[i*1000,0,0,0,String(100+i*step),0,0,String(1000)]);
 const r=motor2Evaluate(make(70,.2),make(50,.3));
 assert.equal(r.ready,true);assert.equal(r.filters_total,4);
 assert.ok(r.checks.every(x=>typeof x.passed==="boolean"));
});
test("Motor 2 RSI mirrors CoinSifter flat-series NaN behavior",()=>{
 assert.equal(rsiWilder(Array(30).fill(100)),null);
});
test("Motor 2 uses latest retained closed candles and requires configured history",()=>{
 const h4=Array.from({length:70},(_,i)=>[i*1000,0,0,0,String(100+i),1,i*1000+999,1]);
 const h1=Array.from({length:50},(_,i)=>[i*1000,0,0,0,String(100+i),1,i*1000+999,1]);
 const result=motor2Evaluate(h4,h1);
 assert.equal(result.ready,true);
 assert.equal(result.closed_4h_timestamp_ms,h4[h4.length-1][6]);
 assert.equal(result.closed_1h_timestamp_ms,h1[h1.length-1][6]);
});
