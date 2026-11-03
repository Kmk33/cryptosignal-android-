// CoinSifter indicator port for configured Motor 2 rules.
// CoinSifter uses iloc[-2] on raw exchange rows; this app removes forming candles upstream, so use the final retained row.
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
export function ema(values,period) {
  if(values.length===0)return [];
  const k=2/(period+1),out=[values[0]];
  for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));
  return out;
}
export function rsiWilder(closes,period=14) {
  if(closes.length<=period)return null;
  // Match CoinSifter pandas implementation: diff() creates a leading zero
  // gain/loss, rolling(period) first becomes valid at index=period-1,
  // then Wilder smoothing starts at index=period.
  const gains=[0],losses=[0];
  for(let i=1;i<closes.length;i++){const d=closes[i]-closes[i-1];gains.push(Math.max(d,0));losses.push(Math.max(-d,0));}
  const mean=a=>a.slice(0,period).reduce((x,y)=>x+y,0)/period;
  let ag=mean(gains),al=mean(losses);
  for(let i=period;i<gains.length;i++){ag=(ag*(period-1)+gains[i])/period;al=(al*(period-1)+losses[i])/period;}
  if(al===0)return ag===0?null:100;
  return 100-100/(1+ag/al);
}
export function macd(closes) {
  const f=ema(closes,12),s=ema(closes,26),line=f.map((v,i)=>v-s[i]),sig=ema(line,9);
  return {line,signal:sig,hist:line.map((v,i)=>v-sig[i])};
}
// REST bootstrap and WebSocket adapter both retain closed candles only.
// Therefore the latest array element is already the last closed candle.
function closedIndex(length){return length-1;}
export function motor2Evaluate(klines4h,klines1h) {
  // Binance kline arrays: [openTime, open, high, low, close, volume, closeTime, quoteVolume, ...]
  const parse=rows=>rows.map(r=>({close:finite(Array.isArray(r)?r[4]:r.close),volume:finite(Array.isArray(r)?r[5]:r.volume),open_time:finite(Array.isArray(r)?r[0]:r.ts),close_time:finite(Array.isArray(r)?r[6]:r.close_time)})).filter(x=>x.close!==null&&x.volume!==null);
  const h4=parse(klines4h),h1=parse(klines1h);
  if(h4.length<60||h1.length<35)return {ready:false,passed:false,reason:"INSUFFICIENT_CLOSED_CANDLES",checks:[]};
  const i4=closedIndex(h4.length),i1=closedIndex(h1.length);
  const c4=h4.slice(0,i4+1).map(x=>x.close),c1=h1.slice(0,i1+1).map(x=>x.close);
  const r=rsiWilder(c4,14), e=ema(c4,50), m=macd(c1);
  const volWindow=h1.slice(Math.max(0,i1-19),i1+1).map(x=>x.volume??0);
  const currentVol=h1[i1].volume??0;
  const avg=volWindow.length===20?volWindow.reduce((a,b)=>a+b,0)/20:0;
  const volumeRatio=avg>0?currentVol/avg:0;
  const checks=[
    {name:"RSI_4H_14_45_72",passed:r!==null&&r>=45&&r<=72,value:r},
    {name:"PRICE_ABOVE_EMA50_4H",passed:c4.at(-1)>e[i4],value:{price:c4.at(-1),ema50:e[i4]}},
    {name:"MACD_BULLISH_1H",passed:m.line[i1]>m.signal[i1],value:{macd:m.line[i1],signal:m.signal[i1]}},
    {name:"VOLUME_1H_GE_1_3X",passed:volumeRatio>=1.3,value:volumeRatio}
  ];
  return {ready:true,passed:checks.every(x=>x.passed),filters_passed:checks.filter(x=>x.passed).length,filters_total:4,checks,closed_4h_timestamp_ms:h4[i4].close_time??h4[i4].open_time,closed_1h_timestamp_ms:h1[i1].close_time??h1[i1].open_time};
}
