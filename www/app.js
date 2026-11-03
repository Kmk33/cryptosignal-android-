import { validEvents, analyze } from "./hybrid-engine.js";
import { motor5Score, MOTOR5_DEFAULTS } from "./motor5.js";
import { motor2Evaluate } from "./motor2.js";
import { BinanceSpotFeed } from "./binance-feed.js";
import { scoreMotor1Micro, motor1CandleAlert, MOTOR1_DEFAULTS } from "./motor1.js";
import { bootstrapHistory } from "./history-loader.js";
import { analyzeTechnical } from "./technical-analysis.js";

(() => {
  const conn=document.getElementById("connection"),markets=document.getElementById("markets");
  const pairs=document.getElementById("pairs"),updated=document.getElementById("updated");
  const candidates=document.getElementById("candidates"),historyStatus=document.getElementById("history-status");
  const state=new Map(),historyStarted=new Set(),historyErrors=new Map(),historyRetryAt=new Map(),historyAttempts=new Map();let tickers=[],historyBusy=false,historyUniverse=new Set(),motor2Universe=new Set(),latestRanked=[];
  const fmt=n=>Number(n).toLocaleString("tr-TR",{maximumFractionDigits:n>=100?2:6});
  function get(symbol){if(!state.has(symbol))state.set(symbol,{candles1m:[],candles5:[],candles1h:[],candles4h:[],trades:[],spreads:[],snapshot:{},diagnostics:{}});return state.get(symbol);}
  function render(data){
    tickers=data.filter(x=>x.s.endsWith("USDT")&&Number(x.q)>0);
    const top=[...tickers].sort((a,b)=>Number(b.q)-Number(a.q)).slice(0,20);
    pairs.textContent=tickers.length.toLocaleString("tr-TR");
    updated.textContent=new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    markets.innerHTML=top.map(x=>{const pct=Number(x.P),cls=pct>=0?"up":"down";return `<div class="market"><span class="symbol">${x.s.replace("USDT","")}<small style="color:#718196;font-weight:500"> / USDT</small></span><span class="quote">${fmt(Number(x.c))}</span><span class="change ${cls}">${pct>=0?"+":""}${pct.toFixed(2)}%</span></div>`;}).join("")||'<div class="empty">Henüz Spot verisi yok.</div>';
    scheduleHistory();
  }
  function scheduleHistory(){
    if(historyBusy)return;
    // Motor 5 universe: top 200 Spot USDT symbols above 1M quote volume.
    // Motor 2 is bootstrapped only for the top 150 above its original 1.5M floor.
    const selected=[...tickers].filter(t=>Number(t.q)>=1_000_000).sort((a,b)=>Number(b.q)-Number(a.q)).slice(0,200);
    historyUniverse=new Set(selected.map(t=>t.s));
    const pending=selected.map(t=>t.s).filter(s=>!historyStarted.has(s)&&(historyRetryAt.get(s)||0)<=Date.now());if(!pending.length)return;
    pending.forEach(s=>historyStarted.add(s));historyBusy=true;
    const motor2Set=new Set(selected.filter(t=>Number(t.q)>=1_500_000).slice(0,150).map(t=>t.s));
    motor2Universe=motor2Set;
    historyStatus.textContent=`Geçmiş mumlar yükleniyor · ${historyStarted.size} sembol`;
    bootstrapHistory(pending,{concurrency:3,includeMotor2:s=>motor2Set.has(s),onSymbol(data){const x=get(data.symbol);x.candles1m=data.m1||[];x.candles5=data.m5;if(data.h1.length){x.candles1h=data.h1;x.candles4h=data.h4;}historyErrors.delete(data.symbol);historyRetryAt.delete(data.symbol);historyAttempts.delete(data.symbol);},onError(err){historyErrors.set(err.symbol,err.error);historyStarted.delete(err.symbol);const attempt=(historyAttempts.get(err.symbol)||0)+1;historyAttempts.set(err.symbol,attempt);historyRetryAt.set(err.symbol,Date.now()+Math.min(300_000,15_000*2**Math.min(attempt-1,4)));}})
      .then(result=>{historyStatus.textContent=`Geçmiş veri: ${historyStarted.size} hazır · ${historyErrors.size} hatalı / tekrar denenecek`;calculate();})
      .finally(()=>{historyBusy=false;});
  }
  function status(s){
    if(s.kind==="ticker"&&s.state==="connected")conn.innerHTML='<i style="background:#20c997;box-shadow:0 0 10px #20c997"></i> CANLI SPOT';
    else if(s.state==="error"||s.state==="parse_error")conn.innerHTML='<i style="background:#ff647c"></i> AKIŞ HATASI';
    else if(s.state==="reconnecting")conn.innerHTML='<i style="background:#d69b39"></i> YENİDEN BAĞLANIYOR';
  }
  function event(e){
    const x=get(e.symbol);
    if(e.type==="kline"&&e.closed){const target=e.interval==="1m"?x.candles1m:e.interval==="5m"?x.candles5:e.interval==="1h"?x.candles1h:e.interval==="4h"?x.candles4h:null;if(target){const i=target.findIndex(c=>c.ts===e.candle.ts);if(i>=0)target[i]=e.candle;else target.push(e.candle);if(target.length>130)target.shift();}}
    else if(e.type==="trade"){x.trades.push(e);const cutoff=Date.now()-70_000;x.trades=x.trades.filter(t=>t.timestamp>=cutoff);}
    else if(e.type==="bookTicker"){x.snapshot.bid=e.bid;x.snapshot.ask=e.ask;x.snapshot.bid_depth=e.bidQty*e.bid;x.snapshot.ask_depth=e.askQty*e.ask;x.snapshot.price=(e.bid+e.ask)/2;x.snapshot.book_updated_at=Date.now();x.spreads.push({timestamp:Date.now(),bps:e.bid>0&&e.ask>0?(e.ask-e.bid)/((e.ask+e.bid)/2)*10000:9999});x.spreads=x.spreads.filter(v=>v.timestamp>Date.now()-70_000);}
    else if(e.type==="depth"){x.snapshot.bid_depth=e.bids.slice(0,5).reduce((a,l)=>a+Number(l[0])*Number(l[1]),0);x.snapshot.ask_depth=e.asks.slice(0,5).reduce((a,l)=>a+Number(l[0])*Number(l[1]),0);x.snapshot.depth_updated_at=Date.now();}
  }
  function calculate(){
    const events=[],tickerMap=new Map(tickers.map(t=>[t.s,t]));
    const technicalBySymbol=new Map();
    for(const [symbol,x] of state){
      const ticker=tickerMap.get(symbol);
      if(!ticker||!historyUniverse.has(symbol))continue;
      const q24=Number(ticker.q||0);
      const now=Date.now();
      const m1=q24>=5_000_000?scoreMotor1Micro({trades:x.trades,spreadSamples:x.spreads,nowMs:now}):{status:"BELOW_M1_24H_VOLUME",score:null};
      const m1Candle=q24>=5_000_000?motor1CandleAlert(x.candles5):null;
      // Prefer the source's confirmed candle alert when both M1 modes fire;
      // otherwise retain the directionless micro candidate as an early watch.
      if(m1Candle&&x.candles5.at(-1)?.close_time&&now-x.candles5.at(-1).close_time<=10*60_000)events.push({symbol,market:"spot",motor_source:"Motor 1",direction:"up",score:m1Candle.score,timestamp_ms:x.candles5.at(-1).close_time,source_event_id:`M1_CANDLE_${symbol}_${x.candles5.at(-1)?.ts||0}`,candidate_type:"M1_CANDLE_VOLUME_BREAKOUT",price_change_pct:m1Candle.price_change_pct,volume_ratio:m1Candle.volume_ratio});
      else if(m1.status==="CANDIDATE")events.push({symbol,market:"spot",motor_source:"Motor 1",direction:"unknown",score:m1.score,timestamp_ms:now,source_event_id:`M1_MICRO_${symbol}_${Math.floor(now/5000)}`,candidate_type:m1.triggerEligible?"trigger_eligible_unconfirmed":"early_candidate",recent_notional:m1.recentNotional});
      const tradeWindow=x.trades.filter(t=>t.timestamp>=now-70_000);
      const bookFresh=now-(x.snapshot.book_updated_at||0)<=10_000;
      const depthFresh=now-(x.snapshot.depth_updated_at||0)<=10_000;
      const liveSnapshot={...x.snapshot,bid:bookFresh?x.snapshot.bid:0,ask:bookFresh?x.snapshot.ask:0,bid_depth:depthFresh?x.snapshot.bid_depth:0,ask_depth:depthFresh?x.snapshot.ask_depth:0,quote_volume_24h:q24,buy_volume:tradeWindow.filter(t=>!t.buyerMaker).reduce((a,t)=>a+t.notional,0),sell_volume:tradeWindow.filter(t=>t.buyerMaker).reduce((a,t)=>a+t.notional,0)};
      const m5=motor5Score({symbol,candles:x.candles5,snapshot:liveSnapshot,timestamp_ms:x.candles5.at(-1)?.close_time||now});
      if(m5.signal&&x.candles5.at(-1)?.close_time&&now-x.candles5.at(-1).close_time<=10*60_000)events.push({...m5.signal,source_event_id:`M5_${symbol}_${x.candles5.at(-1).ts}`,candidate_type:"MOTOR5_SPOT_CANDIDATE"});
      const m2=motor2Universe.has(symbol)?motor2Evaluate(x.candles4h,x.candles1h):{ready:false,passed:false,reason:"OUTSIDE_M2_UNIVERSE"};
      if(m2.ready&&m2.passed&&m2.closed_1h_timestamp_ms&&now-m2.closed_1h_timestamp_ms<=65*60_000)events.push({symbol,market:"spot",motor_source:"Motor 2",direction:"up",score:m2.filters_passed/m2.filters_total*100,filters_passed:m2.filters_passed,filters_total:m2.filters_total,timestamp_ms:m2.closed_1h_timestamp_ms,source_event_id:`M2_${symbol}_${m2.closed_1h_timestamp_ms}`,candidate_type:"COINSIFTER_ALL_FILTERS_PASSED"});
      const technical=analyzeTechnical(x.candles5,x.candles1m);if(technical.ready)technicalBySymbol.set(symbol,technical);
      x.diagnostics={m1:m1.status,m2:m2.ready?(m2.passed?"ALL_FILTERS_PASSED":"FILTERS_NOT_PASSED"):m2.reason,m5:m5.status};
    }
    const valid=validEvents(events,"spot",Date.now()).accepted,ranked=analyze(valid);
    latestRanked=ranked.map(row=>({...row,technical:technicalBySymbol.get(row.symbol)||null}));
    window.CryptoSignalDiagnostics={symbols:state.size,ranked:latestRanked,motors:{m1:"LIVE_TRADE_FLOW",m2:"HISTORICAL_KLINES_AND_LIVE_CLOSED_CANDLES",m5:"LIVE_CANDLE_BOOK_TRADE"},history:{loaded:historyStarted.size,errors:historyErrors.size,retry_pending:[...historyRetryAt.values()].filter(t=>t>Date.now()).length}};
    renderCandidates(latestRanked);
  }
  function renderCandidates(rows){
    if(!rows.length){candidates.innerHTML='<div class="empty">Henüz doğrulanmış motor adayı yok. Veriler geldikçe otomatik güncellenir.</div>';return;}
    candidates.innerHTML=rows.slice(0,25).map((r,i)=>{const motor=r.motors.join(" + "),dir=r.direction==="up"?"YUKARI":r.direction==="down"?"AŞAĞI":r.direction.toUpperCase(),cls=r.direction==="up"?"up":r.direction==="down"?"down":"wait",pump=r.technical?.pump_pressure_label||"VERİ BEKLİYOR";return `<button class="candidate" data-index="${i}" type="button"><div><b>${r.symbol.replace("USDT","")}</b><small>${motor} · Pump baskısı ${pump}</small></div><div class="candidate-dir ${cls}">${dir}</div><div class="candidate-score">${r.rank_score.toFixed(1)}<small>RADAR</small></div></button>`;}).join("");
    candidates.querySelectorAll("button[data-index]").forEach(btn=>btn.addEventListener("click",()=>showAnalysis(rows[Number(btn.dataset.index)])));
    if(rows.length)showAnalysis(rows[0]);
  }
  function showAnalysis(row){
    const x=state.get(row.symbol),a=row.technical;if(!x||!a)return;
    document.getElementById("analysis-empty").hidden=true;document.getElementById("analysis-detail").hidden=false;
    document.getElementById("analysis-symbol").textContent=row.symbol;
    document.getElementById("analysis-trend").textContent=`${a.trend} TREND · Pump baskısı ${a.pump_pressure_label} (${a.pump_pressure_score}/100)`;
    const metrics=[['Fiyat',fmt(a.price)],['RSI 5m',a.rsi?.toFixed(1)??'—'],['EMA20',a.ema20?fmt(a.ema20):'—'],['EMA50',a.ema50?fmt(a.ema50):'—'],['1m değişim',a.short_move_1m_pct===null?'—':`${a.short_move_1m_pct.toFixed(2)}%`],['1m hacim',a.short_volume_ratio_1m===null?'—':`${a.short_volume_ratio_1m.toFixed(2)}x`],['5m hacim',`${a.volume_ratio_5m.toFixed(2)}x`],['ATR',a.atr_pct===null?'—':`${a.atr_pct.toFixed(2)}%`]];
    document.getElementById("analysis-metrics").innerHTML=metrics.map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('');
    const plan=a.plan;document.getElementById("trade-plan").innerHTML=[['Alış izleme',`${fmt(plan.entry_low)} – ${fmt(plan.entry_high)}`],['Zarar-kes',fmt(plan.stop_loss)],['Hedef 1',fmt(plan.target1)],['Hedef 2',fmt(plan.target2)],['Risk/Getiri',plan.risk_reward?`${plan.risk_reward.toFixed(2)}R`:'Direnç bekleniyor'],['Durum',plan.validity==='BREAKOUT_RETEST_WAIT'?'Kırılım sonrası retest bekle':'Teyit bekleniyor']].map(([k,v])=>`<div><small>${k}</small><b>${v}</b></div>`).join('');
    document.getElementById("patterns").innerHTML=`<b>Formasyonlar</b>${a.patterns.length?a.patterns.map(p=>`<div class="pattern"><strong>${p.name}</strong><small>${p.detail}</small></div>`).join(''):'<p>Belirgin formasyon yok; yeni kapanmış mumlar bekleniyor.</p>'}<p>Destek: ${a.supports.map(z=>fmt(z.price)).join(' · ')||'—'} | Direnç: ${a.resistances.map(z=>fmt(z.price)).join(' · ')||'—'}</p><p>Pump sinyalleri: ${a.pump_reasons.join(' · ')||'Henüz güçlü ivme yok'}</p>`;
    drawChart(document.getElementById('price-chart'),x.candles5.slice(-70),a);
  }
  function drawChart(canvas,candles,a){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b121c';ctx.fillRect(0,0,w,h);if(!candles.length)return;const lo=Math.min(...candles.map(c=>c.low),...(a.supports||[]).map(x=>x.price)),hi=Math.max(...candles.map(c=>c.high),...(a.resistances||[]).map(x=>x.price)),pad=(hi-lo)*.12||hi*.01,min=lo-pad,max=hi+pad,y=v=>h-24-(v-min)/(max-min)*(h-48),step=(w-40)/candles.length,cw=Math.max(3,step*.58);ctx.strokeStyle='#243447';ctx.lineWidth=1;for(let i=0;i<5;i++){const yy=20+i*(h-40)/4;ctx.beginPath();ctx.moveTo(35,yy);ctx.lineTo(w-8,yy);ctx.stroke();}candles.forEach((c,i)=>{const x=36+i*step+step/2,up=c.close>=c.open;ctx.strokeStyle=up?'#20c997':'#ff647c';ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(x,y(c.high));ctx.lineTo(x,y(c.low));ctx.stroke();const top=y(Math.max(c.open,c.close)),bottom=y(Math.min(c.open,c.close));ctx.fillRect(x-cw/2,top,cw,Math.max(2,bottom-top));});const line=(v,color,label)=>{if(!v)return;ctx.strokeStyle=color;ctx.setLineDash([7,5]);ctx.beginPath();ctx.moveTo(35,y(v));ctx.lineTo(w-8,y(v));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.font='bold 16px sans-serif';ctx.fillText(`${label} ${fmt(v)}`,42,Math.max(16,y(v)-6));};(a.supports||[]).slice(0,2).forEach(z=>line(z.price,'#20c997','DESTEK'));(a.resistances||[]).slice(0,2).forEach(z=>line(z.price,'#ff8a24','DİRENÇ'));}
  const feed=new BinanceSpotFeed({onStatus:status,onTicker:render,onEvent:event});
  window.addEventListener("beforeunload",()=>feed.stop());
  window.CryptoSignalEngine={validEvents,analyze,analyzeTechnical,motor5Score,MOTOR5_DEFAULTS,motor2Evaluate,BinanceSpotFeed,scoreMotor1Micro,motor1CandleAlert,MOTOR1_DEFAULTS,bootstrapHistory};
  feed.start();setInterval(calculate,5000);
})();
