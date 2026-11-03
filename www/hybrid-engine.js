// Faithful JavaScript port of crypto_multi_motor_hub/hybrid_analysis_v2.py core.
// Read-only ranking: no order execution, no synthetic signals.
export const MAX_AGE_MS = 15 * 60_000;
export const FUTURE_TOLERANCE_MS = 60_000;

export function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function normalizeSymbol(v) {
  return String(v ?? "").trim().toUpperCase().replace(/[\/_-]/g, "");
}
export function normalizeMarket(v) {
  const s=String(v ?? "").trim().toLowerCase();
  return s==="spot" || s==="linear" ? s : "unknown";
}
export function timestampMs(row) {
  let v=row.timestamp_ms ?? row.timestamp;
  const n=num(v);
  if(n!==null) return Math.trunc(n>0 && n<100_000_000_000 ? n*1000 : n);
  if(typeof v==="string") {
    const parsed=Date.parse(v);
    return Number.isFinite(parsed)?parsed:null;
  }
  return null;
}
export function motorId(row) {
  const raw=String(row.motor_source ?? row.motor ?? "").trim().toLowerCase();
  if(raw.includes("motor 1")||raw.includes("motor1")) return "Motor 1";
  if(raw.includes("motor 2")||raw.includes("motor2")||raw.includes("coinsifter")) return "Motor 2";
  if(raw.includes("motor 3")||raw.includes("motor3")) return "Motor 3";
  if(raw.includes("motor 5")||raw.includes("motor5")) return "Motor 5";
  return String(row.motor_source ?? row.motor ?? "Unknown");
}
export function validEvents(rows, expectedMarket, nowMs, maxAgeMs=MAX_AGE_MS) {
  const accepted=[]; let rejected=0;
  for(const raw of rows) {
    const s={...raw}, sym=normalizeSymbol(s.symbol);
    const market=normalizeMarket(s.market ?? expectedMarket), ts=timestampMs(s);
    if(!sym || market!==expectedMarket || ts===null) { rejected++; continue; }
    const age=nowMs-ts;
    if(age < -FUTURE_TOLERANCE_MS || age > maxAgeMs) { rejected++; continue; }
    s.symbol=sym; s.market=market; s.timestamp_ms=ts;
    s.motor_source=motorId(s);
    const d=String(s.direction ?? "unknown").trim().toLowerCase();
    s.direction=(d==="up"||d==="down")?d:"unknown";
    accepted.push(s);
  }
  return {accepted,rejected};
}
export function eventKey(s) {
  for(const k of ["source_event_id","event_id","source_signal"])
    if(s[k]!==null && s[k]!==undefined && s[k]!=="") return String(s[k]);
  return ["screener_type","entry_type","candidate_type","timestamp_ms","price"]
    .map(k=>String(s[k]??"")).join("|");
}
export function sourceScore(row) {
  let score=num(row.score);
  if(score===null) score=num(row.normalized_score);
  if(score===null) score=num(row.raw_motor_score);
  if(score!==null) return Math.max(0,Math.min(100,score));
  if(motorId(row)==="Motor 2") {
    const passed=num(row.filters_passed), total=num(row.filters_total);
    if(passed!==null && total!==null && total>0)
      return Math.max(0,Math.min(100,passed/total*100));
  }
  if(motorId(row)==="Motor 3") {
    const ratio=num(row.rvol ?? row.volume_ratio);
    if(ratio!==null) {
      const kind=String(row.screener_type ?? row.source_signal ?? "").toUpperCase();
      const threshold=kind.includes("SPIKE_RVOL")?5:3;
      return Math.max(0,Math.min(100,ratio/(threshold*2)*100));
    }
  }
  return null;
}
export function analyze(spotRows, linearRows=[], liquidations=[], funding=[]) {
  const groups=new Map();
  for(const s of [...spotRows,...linearRows]) {
    const k=`${s.symbol}\u0000${s.market}`;
    if(!groups.has(k)) groups.set(k,[]);
    groups.get(k).push(s);
  }
  const results=[];
  for(const events of groups.values()) {
    const unique=new Map();
    for(const e of events) {
      const k=`${e.motor_source}\u0000${eventKey(e)}`, old=unique.get(k);
      if(!old || e.timestamp_ms>old.timestamp_ms) unique.set(k,e);
    }
    const eventRows=[...unique.values()].sort((a,b)=>b.timestamp_ms-a.timestamp_ms);
    const byMotor=new Map();
    for(const e of eventRows) {
      const old=byMotor.get(e.motor_source);
      if(!old || e.timestamp_ms>old.timestamp_ms) byMotor.set(e.motor_source,e);
    }
    const votes=[...byMotor.values()], motors=[...byMotor.keys()].sort();
    const dirs=new Set(votes.filter(x=>x.direction==="up"||x.direction==="down").map(x=>x.direction));
    const hasUnknown=votes.some(x=>x.direction!=="up"&&x.direction!=="down");
    let direction,status;
    if(dirs.size>1){direction="conflict";status="conflict";}
    else if(dirs.size===1) {
      direction=[...dirs][0];
      status=votes.length===1?"single_motor":hasUnknown?"partial":"same_direction";
    } else {direction="unknown";status="unknown";}
    const scores=votes.map(sourceScore).filter(x=>x!==null);
    const mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
    const coverage=Math.min(motors.length,4)/4;
    const bonus=status==="same_direction"?10:status==="conflict"?-10:0;
    const rank=Math.max(0,Math.min(100,mean*coverage+bonus));
    const nums=(keys)=>eventRows.map(x=>keys.map(k=>num(x[k])).find(v=>v!==null)).filter(v=>v!==null);
    const moves=nums(["price_change_pct"]), volumes=nums(["volume_ratio","rvol"]), spreads=nums(["spread_pct"]);
    const warnings=[];
    if(status==="conflict") warnings.push("DIRECTION_CONFLICT");
    if(spreads.length&&Math.max(...spreads)>.5) warnings.push("HIGH_SPREAD");
    if(moves.length&&Math.max(...moves.map(Math.abs))>=10) warnings.push("MOVE_MAY_BE_EXTENDED");
    const max=(a)=>a.length?Math.max(...a):null;
    const item={
      symbol:eventRows[0].symbol, market:eventRows[0].market,
      rank_score:Math.round(rank*100)/100, motor_count:motors.length, motors,
      direction,direction_status:status,mean_motor_score:Math.round(mean*100)/100,
      event_count:eventRows.length,
      event_types:[...new Set(eventRows.map(x=>String(x.screener_type??x.source_signal??x.candidate_type??"signal")))].sort(),
      max_volume_ratio:max(volumes),max_abs_price_change_pct:max(moves.map(Math.abs)),
      max_spread_pct:max(spreads),latest_signal_timestamp_ms:max(eventRows.map(x=>x.timestamp_ms)),
      warnings,votes,events:eventRows
    };
    if(item.market==="linear") {
      const liqs=liquidations.filter(x=>normalizeSymbol(x.symbol)===item.symbol);
      const funds=funding.filter(x=>normalizeSymbol(x.symbol)===item.symbol);
      item.motor4_context={
        role:"context_only_not_a_vote",liquidation_count:liqs.length,
        liquidation_value_usd:Math.round(liqs.reduce((a,x)=>a+(num(x.value_usd)||0),0)*10000)/10000,
        liquidation_events:liqs,funding_open_interest:funds.at(-1)||null
      };
    }
    results.push(item);
  }
  const tier=x=>x.direction_status==="same_direction"&&x.motor_count>=3?1:
    x.direction_status==="same_direction"&&x.motor_count===2?2:x.motor_count>=2?3:4;
  for(const x of results)x.consensus_tier=tier(x);
  results.sort((a,b)=>tier(a)-tier(b)||b.motor_count-a.motor_count||
    b.rank_score-a.rank_score||b.latest_signal_timestamp_ms-a.latest_signal_timestamp_ms||
    a.symbol.localeCompare(b.symbol));
  return results;
}
