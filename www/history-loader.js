// Public Binance Spot REST bootstrap. Closed candles only; globally paced requests.
const BASES=["https://api.binance.com","https://api1.binance.com","https://api2.binance.com"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Binance Spot REST request-weight budget: keep this app comfortably below the
// common 1,200 weight/minute IP limit (klines <= 500 rows cost 2 weight).
let nextRequestAt=0;
async function paceRequest(){
  const now=Date.now(),wait=Math.max(0,nextRequestAt-now);
  nextRequestAt=Math.max(now,nextRequestAt)+115;
  if(wait)await sleep(wait);
}
async function requestKlines(symbol,interval,limit,fetchImpl=globalThis.fetch){
  let lastError;
  for(const base of BASES){
    try{
      await paceRequest();
      const url=`${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
      const response=await fetchImpl(url,{cache:"no-store"});
      if(!response.ok)throw new Error(`HTTP_${response.status}`);
      const rows=await response.json();
      if(!Array.isArray(rows))throw new Error("INVALID_KLINE_RESPONSE");
      const now=Date.now();
      const normalized=rows.filter(r=>Array.isArray(r)&&r.length>=8&&Number(r[6])<now).map(r=>({
        ts:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),
        close:Number(r[4]),volume:Number(r[5]),quote_volume:Number(r[7]),close_time:Number(r[6])
      })).filter(c=>[c.ts,c.open,c.high,c.low,c.close,c.volume,c.quote_volume,c.close_time].every(Number.isFinite)&&c.close>0&&c.high>=c.low);
      if(!normalized.length)throw new Error("NO_CLOSED_KLINES");
      return normalized;
    }catch(error){lastError=error;}
  }
  throw lastError||new Error("BINANCE_REST_UNAVAILABLE");
}
export async function loadSymbolHistory(symbol,{fetchImpl=globalThis.fetch,includeMotor2=true}={}){
  const jobs=[requestKlines(symbol,"1m",60,fetchImpl),requestKlines(symbol,"5m",120,fetchImpl)];
  if(includeMotor2)jobs.push(requestKlines(symbol,"1h",40,fetchImpl),requestKlines(symbol,"4h",70,fetchImpl));
  const values=await Promise.all(jobs);
  return {symbol,m1:values[0],m5:values[1],h1:includeMotor2?values[2]:[],h4:includeMotor2?values[3]:[]};
}
export async function bootstrapHistory(symbols,{concurrency=4,onSymbol=()=>{},onError=()=>{},fetchImpl=globalThis.fetch,includeMotor2=()=>true}={}){
  const queue=[...new Set(symbols)],results=[];let cursor=0;
  async function worker(){
    while(cursor<queue.length){const symbol=queue[cursor++];
      try{const data=await loadSymbolHistory(symbol,{fetchImpl,includeMotor2:includeMotor2(symbol)});results.push(data);onSymbol(data);}
      catch(error){onError({symbol,error:String(error)});}
    }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(concurrency,queue.length||1))},worker));
  return {loaded:results.length,failed:queue.length-results.length,results};
}
