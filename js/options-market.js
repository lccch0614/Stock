// Deterministic simulated implied volatility and bid/ask quotes.
function optionIV(st,k,days,market=state.market,day=state.day){
 const m=Math.log(k/st.price),term=days<=14?.055:days<=30?.025:0,regime=market==='熊市'?.085:market==='牛市'?-.012:0;
 const shock=Math.min(.11,Math.abs(st.momentum||0)*2.5),skew=Math.max(0,-m)*.22+Math.abs(m)*.08;
 const earnings=day%60>=48&&day%60<=60?.035:0;
 return clamp(st.vol+term+regime+shock+skew+earnings,.06,1.8);
}
function optionQuote(t,kind,strike,expiry,overrideDays=null){return optionQuoteAt(state,t,kind,strike,expiry,overrideDays)}
function optionQuoteAt(account,t,kind,strike,expiry,overrideDays=null){
 const st=account.stocks[t];if(!st)throw Error('Unknown ticker');const days=Math.max(0,overrideDays??(expiry-account.day));
 const iv=optionIV(st,strike,days,account.market,account.day),m=optionMetrics(st.price,strike,days,kind,iv);
 const width=Math.max(.02,m.price*.035,st.price*.00035)* (days<8?1.2:1);
 // At expiry the payoff is settled; do not allow new trades on an expired contract.
 const bid=round(Math.max(0,m.price-width/2)),ask=round(Math.max(bid+.01,m.price+width/2));
 return {...m,days,bid,ask,mid:round((bid+ask)/2),strike,expiry,ticker:t,kind};
}
function optionsChain(t,days,steps=5){const st=state.stocks[t],center=Math.max(1,Math.round(st.price/5)*5);return Array.from({length:2*steps+1},(_,i)=>Math.max(1,center+(i-steps)*5)).filter((k,i,a)=>a.indexOf(k)===i).map(k=>({strike:k,call:optionQuote(t,'call',k,state.day+days),put:optionQuote(t,'put',k,state.day+days)}))}
