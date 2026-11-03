import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTechnical,ema,rsi,atr} from '../www/technical-analysis.js';
function candles(n=100){let out=[];for(let i=0;i<n;i++){const close=100+i*.12+Math.sin(i/4)*.7;out.push({ts:i*300000,open:close-.15,high:close+.5,low:close-.5,close,volume:1000,quote_volume:100000+(i===n-1?300000:0),close_time:(i+1)*300000-1});}return out;}
test('EMA RSI ATR are finite for sufficient history',()=>{const c=candles();assert.ok(Number.isFinite(ema(c.map(x=>x.close),20).at(-1)));assert.ok(Number.isFinite(rsi(c.map(x=>x.close))));assert.ok(atr(c)>0);});
test('technical analysis emits bounded pump pressure and structured risk plan',()=>{const c=candles(),m1=candles(60);const a=analyzeTechnical(c,m1);assert.equal(a.ready,true);assert.ok(a.pump_pressure_score>=0&&a.pump_pressure_score<=100);assert.ok(a.plan.stop_loss<a.price);assert.ok(a.plan.target1>a.price);assert.ok(Array.isArray(a.supports)&&Array.isArray(a.resistances));});
test('technical analysis refuses insufficient closed candle history',()=>{assert.equal(analyzeTechnical(candles(20),[]).ready,false);});
