// Spot Scanner Motor 1 micro-momentum scoring port.
// Constants and scoring weights match scanner.ts. Depth imbalance remains disabled.
export const MOTOR1_DEFAULTS=Object.freeze({
 recentWindowSec:10,baselineWindowSec:60,minNotional10s:30000,
 candidateScore:50,triggerScore:72,triggerCooldownMs:45000,
 enableDepthImbalance:false,depthLevels:5
});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const stddev=(a,m=mean(a))=>a.length?Math.sqrt(mean(a.map(x=>(x-m)**2))):0;
export function scoreMotor1Micro({trades=[],spreadSamples=[],nowMs=Date.now(),cfg=MOTOR1_DEFAULTS}) {
  const sec=Math.floor(nowMs/1000),recentStart=sec-cfg.recentWindowSec+1,baseStart=sec-cfg.baselineWindowSec,baseEnd=sec-cfg.recentWindowSec;
  const bySecond=new Map();
  for(const t of trades){const s=Math.floor(t.timestamp/1000);if(s<baseStart||s>sec)continue;
    const x=bySecond.get(s)||{trades:0,buy:0,sell:0};x.trades++;
    if(t.buyerMaker)x.sell+=t.notional;else x.buy+=t.notional;bySecond.set(s,x);}
  let recentTrades=0,recentBuy=0,recentSell=0;
  for(let s=recentStart;s<=sec;s++){const x=bySecond.get(s);if(x){recentTrades+=x.trades;recentBuy+=x.buy;recentSell+=x.sell;}}
  const recentNotional=recentBuy+recentSell;
  if(recentNotional<cfg.minNotional10s)return {status:"BELOW_NOTIONAL",score:null,recentNotional};
  const baseTps=[],baseCvd=[];
  for(let s=baseStart;s<baseEnd;s++){const x=bySecond.get(s);baseTps.push(x?.trades||0);baseCvd.push(x?(x.buy-x.sell):0);}
  const tpsNow=recentTrades/cfg.recentWindowSec,tpsBase=mean(baseTps),tpsStd=stddev(baseTps,tpsBase);
  const tpsZ=tpsStd>0?(tpsNow-tpsBase)/tpsStd:tpsNow-tpsBase;
  const cvdRate=(recentBuy-recentSell)/cfg.recentWindowSec,cvdBase=mean(baseCvd),cvdStd=stddev(baseCvd,cvdBase);
  const cvdZ=cvdStd>0?(cvdRate-cvdBase)/cvdStd:cvdRate-cvdBase;
  const buyRatio=recentNotional?recentBuy/recentNotional:0;
  const spreads=spreadSamples.filter(x=>x.timestamp>=baseStart*1000&&x.timestamp<=baseEnd*1000).map(x=>x.bps);
  const spreadNow=spreadSamples.filter(x=>x.timestamp>=recentStart*1000&&x.timestamp<=nowMs).at(-1)?.bps||0;
  const spreadBase=mean(spreads.filter(x=>x>0)),spreadCompression=spreadNow>0&&spreadBase>0?(spreadBase-spreadNow)/spreadBase:0;
  let score=clamp(tpsZ,0,6)*18+clamp(cvdZ,0,6)*16+clamp((buyRatio-.5)*120,0,24)+clamp(spreadCompression*30,0,20)+clamp(Math.log10(recentNotional/cfg.minNotional10s+1)*10,0,16);
  if(cfg.enableDepthImbalance)score+=0;
  return {status:score>=cfg.candidateScore?"CANDIDATE":"BELOW_SCORE",score,tpsNow,tpsBaseline:tpsBase,tpsZ,buyRatio,cvdRate,cvdZ,spreadBps:spreadNow,spreadCompression,recentNotional,triggerEligible:score>=cfg.triggerScore};
}
export function motor1CandleAlert(candles) {
  const c=candles||[];if(c.length<13)return null;
  const latest=c.at(-1),prev=c.slice(-13,-1),avg=mean(prev.map(x=>x.volume));
  if(latest.open<=0||latest.volume<=0||avg<50000)return null;
  const ratio=latest.volume/avg,move=(latest.close/latest.open-1)*100;
  if(!(latest.volume>3*avg&&move>1.5))return null;
  return {alert_type:"candle",volume_ratio:ratio,price_change_pct:move,
    score:clamp(Math.log2(Math.max(1,ratio))*20,0,65)+clamp(move*6,0,35)};
}
