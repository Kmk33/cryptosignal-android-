import test from "node:test";
import assert from "node:assert/strict";
import {validEvents,analyze,sourceScore} from "../www/hybrid-engine.js";
const now=1_800_000_000_000;
const ev=(motor,direction,score,id,extra={})=>({
 symbol:"BTCUSDT",market:"spot",timestamp_ms:now-1000,
 motor_source:motor,direction,score,source_event_id:id,...extra
});
test("rejects stale, wrong-market and malformed rows",()=>{
 const r=validEvents([
  ev("Motor 1","up",80,"fresh"),
  {...ev("Motor 2","up",80,"old"),timestamp_ms:now-16*60_000},
  {...ev("Motor 3","up",80,"linear"),market:"linear"},
  {...ev("Motor 5","up",80,"bad"),timestamp_ms:"not-a-date"}
 ],"spot",now);
 assert.equal(r.accepted.length,1);assert.equal(r.rejected,3);
});
test("one motor gets one vote even with multiple distinct events",()=>{
 const rows=[ev("Motor 1","up",90,"AVWAP"),ev("Motor 1","up",95,"SPIKE_RVOL")];
 const out=analyze(rows)[0];
 assert.equal(out.motor_count,1);assert.equal(out.event_count,2);
 assert.equal(out.consensus_tier,4);
});
test("two agreeing motors rank above single motor",()=>{
 const out=analyze([ev("Motor 1","up",90,"a"),ev("Motor 2","up",80,"b")]);
 assert.equal(out[0].direction_status,"same_direction");
 assert.equal(out[0].consensus_tier,2);
 assert.equal(out[0].rank_score,52.5);
});
test("conflicting directions are explicitly penalized",()=>{
 const out=analyze([ev("Motor 1","up",90,"a"),ev("Motor 2","down",80,"b")])[0];
 assert.equal(out.direction,"conflict");assert.ok(out.warnings.includes("DIRECTION_CONFLICT"));
 assert.equal(out.rank_score,32.5);
});
test("Motor 4 liquidation context cannot increase motor votes",()=>{
 const rows=[
  {...ev("Motor 1","up",90,"a"),market:"linear"},
  {...ev("Motor 2","up",80,"b"),market:"linear"}
 ];
 const out=analyze([],rows,[{symbol:"BTCUSDT",value_usd:123}],[])[0];
 assert.equal(out.motor_count,2);assert.equal(out.motor4_context.role,"context_only_not_a_vote");
 assert.equal(out.motor4_context.liquidation_count,1);
});
test("Motor 3 event scores preserve AVWAP and SPIKE_RVOL thresholds",()=>{
 assert.equal(sourceScore({motor_source:"Motor 3",screener_type:"AVWAP",rvol:3}),50);
 assert.equal(sourceScore({motor_source:"Motor 3",screener_type:"SPIKE_RVOL",rvol:5}),50);
});
