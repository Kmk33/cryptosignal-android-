// Port of motor5_spot_screener/app/screener.py score_signal.
// Defaults exactly match app/config.py; no thresholds relaxed.
export const MOTOR5_DEFAULTS = Object.freeze({
  min_score:7.0, min_24h_quote_volume:1_000_000.0, max_spread_bps:35.0,
  min_price_move_pct:0.35, volume_z_threshold:3.0, imbalance_threshold:0.20
});
export function motor5Score(input, cfg=MOTOR5_DEFAULTS) {
  const n=v => v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
  const candles=input.candles||[];
  if(candles.length<20) return {status:"INSUFFICIENT_CANDLES",signal:null};
  const snap=input.snapshot||{};
  const price=n(snap.price)||0, qv=n(snap.quote_volume_24h)||0;
  if(price<=0||qv<cfg.min_24h_quote_volume) return {status:"LIQUIDITY_REJECT",signal:null};
  const closed=candles[candles.length-1], old=candles[candles.length-4];
  const move=old?.close>0?(closed.close/old.close-1)*100:0;
  const history=candles.slice(0,-1).map(c=>n(c.quote_volume)).filter(x=>x!==null);
  const current=n(closed.quote_volume)||0;
  const sorted=[...history].sort((a,b)=>a-b);
  const median=a=>{if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  const med=median(sorted);
  const deviations=history.map(x=>Math.abs(x-med)).sort((a,b)=>a-b);
  const mad=median(deviations)||Math.max(med*.01,1);
  const vz=.6745*(current-med)/mad;
  const bid=n(snap.bid)||0, ask=n(snap.ask)||0;
  const spread=bid>0&&ask>0?(ask-bid)/((ask+bid)/2)*10000:9999;
  const bd=n(snap.bid_depth)||0, ad=n(snap.ask_depth)||0;
  const buy=n(snap.buy_volume)||0, sell=n(snap.sell_volume)||0;
  const ti=(buy+sell)?(buy-sell)/(buy+sell):0;
  const bi=(bd+ad)?(bd-ad)/(bd+ad):0;
  let pump=0,dump=0;const reasons=[];
  if(move>=cfg.min_price_move_pct){pump+=2;reasons.push(`price_move_up_${move.toFixed(2)}pct`);}
  if(move<=-cfg.min_price_move_pct){dump+=2;reasons.push(`price_move_down_${move.toFixed(2)}pct`);}
  if(vz>=cfg.volume_z_threshold){pump+=2;dump+=2;reasons.push(`volume_z_${vz.toFixed(2)}`);}
  if(ti>=cfg.imbalance_threshold){pump+=2;reasons.push(`trade_imbalance_${ti.toFixed(3)}`);}
  if(ti<=-cfg.imbalance_threshold){dump+=2;reasons.push(`trade_imbalance_${ti.toFixed(3)}`);}
  if(bi>=cfg.imbalance_threshold){pump+=1;reasons.push(`book_imbalance_${bi.toFixed(3)}`);}
  if(bi<=-cfg.imbalance_threshold){dump+=1;reasons.push(`book_imbalance_${bi.toFixed(3)}`);}
  if(spread>cfg.max_spread_bps)return {status:"SPREAD_REJECT",signal:null,metrics:{move,vz,ti,bi,spread}};
  const score=Math.max(pump,dump);
  let direction=null;
  if(pump>=cfg.min_score&&pump>dump&&move>0)direction="up";
  else if(dump>=cfg.min_score&&dump>pump&&move<0)direction="down";
  if(!direction)return {status:"NO_SIGNAL",signal:null,metrics:{move,vz,ti,bi,spread,pump,dump}};
  return {status:"SIGNAL",signal:{
    symbol:input.symbol,market:"spot",motor_source:"Motor 5",direction,
    score:Math.max(0,Math.min(100,score/7*100)),raw_motor_score:score,
    price_change_pct:move,volume_z:vz,trade_imbalance:ti,book_imbalance:bi,
    spread_pct:spread/100,price,timestamp_ms:input.timestamp_ms||Date.now(),reasons
  },metrics:{move,vz,ti,bi,spread,pump,dump}};
}
