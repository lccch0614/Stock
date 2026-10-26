'use strict';
// This policy receives only published quotes, current portfolio and opening-day quotes.
// It cannot access the engine, RNG, seed, hidden anchors or future prices.
const POLICY=Object.freeze({version:1,limit:60,target:20000,symbols:['BIOV','QBIT','SOLR','NVXT'],riskPerSymbol:.20,cashBuffer:.20,dte:7,width:5,profitCapture:.80,lossFraction:.80});
function chooseEntry(snapshot,ticker,openingPrices){
 const quote=snapshot.quotes.find(q=>q.ticker===ticker);if(!quote)return null;
 const bullish=quote.price<=openingPrices[ticker];
 const shortStrike=bullish?Math.floor(quote.price/5)*5:Math.ceil(quote.price/5)*5;
 if(shortStrike<=5)return null;
 return {strategy:bullish?'bull_put':'bear_call',ticker,low:bullish?shortStrike-5:shortStrike,high:bullish?shortStrike:shortStrike+5,days:7};
}
module.exports={POLICY,chooseEntry};
