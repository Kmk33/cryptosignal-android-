// Binance public Spot feed. No credentials and no order endpoints.
export const FEED_DEFAULTS = Object.freeze({
  maxSymbols:200, minM1QuoteVolume:5_000_000, minM5QuoteVolume:1_000_000,
  streamsPerSocket:240, reconnectMs:3000, maxReconnectMs:30000
});
export class BinanceSpotFeed {
  constructor({WebSocketImpl=globalThis.WebSocket,onStatus=()=>{},onTicker=()=>{},onEvent=()=>{},cfg={}}={}) {
    this.WS=WebSocketImpl;this.onStatus=onStatus;this.onTicker=onTicker;this.onEvent=onEvent;
    this.cfg={...FEED_DEFAULTS,...cfg};this.sockets=[];this.symbols=[];this.tickers=new Map();this.retry=0;this.closed=false;this.rebuildTimer=null;
  }
  start(){this.closed=false;this.connectTicker();}
  stop(){this.closed=true;if(this.rebuildTimer){clearTimeout(this.rebuildTimer);this.rebuildTimer=null;}try{this.tickerSocket?.close(1000,"user stop");}catch{}for(const ws of this.sockets){ws._intentionalClose=true;try{ws.close(1000,"user stop");}catch{}}this.sockets=[];}
  connectTicker(){
    if(this.closed)return;
    const ws=new this.WS("wss://stream.binance.com:443/ws/!ticker@arr");
    this.tickerSocket=ws;
    ws.onopen=()=>{this.retry=0;this.onStatus({kind:"ticker",state:"connected"});};
    ws.onmessage=e=>{try{const arr=JSON.parse(e.data);if(!Array.isArray(arr))return;
      this.tickers.clear();
      for(const t of arr)if(t.s?.endsWith("USDT")&&Number.isFinite(Number(t.q)))this.tickers.set(t.s,t);
      this.onTicker([...this.tickers.values()]);
      this.refreshSubscriptions();
    }catch(err){this.onStatus({kind:"ticker",state:"parse_error",error:String(err)});}};
    ws.onerror=()=>this.onStatus({kind:"ticker",state:"error"});
    ws.onclose=()=>{this.onStatus({kind:"ticker",state:"reconnecting"});if(!this.closed)setTimeout(()=>this.connectTicker(),Math.min(this.cfg.maxReconnectMs,this.cfg.reconnectMs*2**Math.min(this.retry++,4)));};
  }
  refreshSubscriptions(){
    const ranked=[...this.tickers.values()].filter(t=>Number(t.q)>=this.cfg.minM5QuoteVolume)
      .sort((a,b)=>Number(b.q)-Number(a.q)).slice(0,this.cfg.maxSymbols);
    const next=ranked.map(t=>t.s).sort();
    if(next.join(",")===this.symbols.join(","))return;
    this.symbols=next;this.rebuildMarketSockets();
  }
  rebuildMarketSockets(){
    for(const ws of this.sockets){ws._intentionalClose=true;try{ws.close(1000,"subscription refresh");}catch{}}
    this.sockets=[];
    const streamsPerSymbol=s=>[
      `${s.toLowerCase()}@kline_1m`,`${s.toLowerCase()}@kline_5m`,`${s.toLowerCase()}@kline_1h`,
      `${s.toLowerCase()}@kline_4h`,`${s.toLowerCase()}@aggTrade`,
      `${s.toLowerCase()}@bookTicker`,`${s.toLowerCase()}@depth5@100ms`
    ];
    const perSocket=Math.max(1,Math.floor(this.cfg.streamsPerSocket/7));
    for(let i=0;i<this.symbols.length;i+=perSocket){
      const symbols=this.symbols.slice(i,i+perSocket),streams=symbols.flatMap(streamsPerSymbol);
      const ws=new this.WS("wss://stream.binance.com:443/stream?streams="+streams.join("/"));
      this.sockets.push(ws);
      ws.onopen=()=>this.onStatus({kind:"market",state:"connected",symbols:symbols.length,streams:streams.length});
      ws.onmessage=e=>{try{const packet=JSON.parse(e.data);this.handle(packet.data??packet);}catch(err){this.onStatus({kind:"market",state:"parse_error",error:String(err)});}};
      ws.onerror=()=>this.onStatus({kind:"market",state:"error"});
      ws.onclose=()=>{
        if(ws._intentionalClose||this.closed)return;
        this.onStatus({kind:"market",state:"reconnecting"});
        if(!this.rebuildTimer)this.rebuildTimer=setTimeout(()=>{
          this.rebuildTimer=null;this.rebuildMarketSockets();
        },this.cfg.reconnectMs);
      };
    }
  }
  handle(d){
    if(d.e==="kline"&&d.k){const k=d.k;this.onEvent({type:"kline",interval:k.i,symbol:k.s,closed:!!k.x,candle:{ts:Number(k.t),open:Number(k.o),high:Number(k.h),low:Number(k.l),close:Number(k.c),volume:Number(k.v),quote_volume:Number(k.q),close_time:Number(k.T)}});}
    else if(d.e==="aggTrade")this.onEvent({type:"trade",symbol:d.s,price:Number(d.p),quantity:Number(d.q),notional:Number(d.p)*Number(d.q),buyerMaker:!!d.m,timestamp:Number(d.T)});
    else if(d.e==="bookTicker")this.onEvent({type:"bookTicker",symbol:d.s,bid:Number(d.b),bidQty:Number(d.B),ask:Number(d.a),askQty:Number(d.A),timestamp:Number(d.u)});
    else if(d.e==="depthUpdate")this.onEvent({type:"depth",symbol:d.s,bids:d.b||[],asks:d.a||[],timestamp:Number(d.E)});
  }
}
