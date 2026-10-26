// V2.3: stock shorts retain restricted proceeds and 50% initial margin.
function shortLiability(){return round(Object.entries(state.shorts||{}).reduce((a,[t,p])=>a+p.qty*state.stocks[t].price,0))}
function shortOpen(t,qty){if(!state.stocks[t]||!Number.isSafeInteger(qty)||qty<=0)return {ok:false,msg:'無效沽空指令'};if(state.positions[t]?.qty)return{ok:false,msg:'請先平掉同一股票的正股好倉'};const p=quote(state.stocks[t],'sell'),notional=round(p*qty),f=fee(qty,p);if(availableFunds()<notional*.5+f)return{ok:false,msg:'所需初始抵押資金不足（50%）'};const sh=state.shorts[t]||{qty:0,cost:0,proceeds:0};sh.cost=round((sh.qty*sh.cost+notional)/(sh.qty+qty));sh.qty+=qty;sh.proceeds=round(sh.proceeds+notional);state.shorts[t]=sh;state.cash=round(state.cash+notional-f);state.derivativeTransactions.push({id:unique('D'),day:state.day,action:'SHORT',ticker:t,qty,price:p,fee:f,realized:-f});addLedger('SHORT',notional-f,`沽空 ${qty} 股 ${t}（所得受限）`);recordPlanOpen('short',t,{cost:round(notional*.5+f),risk:notional});return{ok:true,msg:`已沽空 ${qty} 股 ${t}`}}
function shortCover(t,qty,forced=false){const sh=state.shorts[t];if(!sh||!Number.isSafeInteger(qty)||qty<=0||qty>sh.qty)return{ok:false,msg:'沽空持倉不足'};if(!forced&&sh.qty-protectedShares(t,'shorts')<qty)return {ok:false,msg:'備兌認沽已鎖定沽空股份，請先平掉期權'};const p=quote(state.stocks[t],'buy'),value=round(p*qty),f=fee(qty,p),cost=round(value+f);const proceedsReleased=round(sh.proceeds*qty/sh.qty),released=round(proceedsReleased+state.stocks[t].price*qty*.5);if(!forced&&(state.cash<cost||availableRaw()+released-cost<-.001))return{ok:false,msg:'現金不足以回補；可等待風控結算'};const realized=round((sh.cost-p)*qty-f);sh.proceeds=round(sh.proceeds-proceedsReleased);sh.qty-=qty;if(sh.qty===0)delete state.shorts[t];state.cash=round(state.cash-cost);state.derivativeTransactions.push({id:unique('D'),day:state.day,action:forced?'FORCED_COVER':'COVER',ticker:t,qty,price:p,fee:f,realized});addLedger('COVER',-cost,`回補 ${qty} 股 ${t}`);evaluatePlans();return{ok:true,msg:`已回補 ${qty} 股 ${t}；損益 ${money(realized)}`}}
function erf(x){const sign=x<0?-1:1;x=Math.abs(x);const t=1/(1+.3275911*x);return sign*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x))}
function cdf(x){return .5*(1+erf(x/Math.sqrt(2)))}
function optionPrice(s,k,days,kind,vol){return round(optionMetrics(s,k,Math.max(0,days),kind,Math.max(.06,vol)).price)}

function reservedBuyOrders(exclude=null){return round(state.orders.filter(o=>o.id!==exclude&&o.status==='open'&&o.side==='buy').reduce((a,o)=>a+o.reserved,0))}
function settleDerivatives(){
  settleOptions();
  if(state.lastBorrowDay>=state.day)return;
  for(const [t,sh] of Object.entries(state.shorts)){
    const borrow=round(Math.max(.01,sh.qty*state.stocks[t].price*.03/252));
    state.cash=round(state.cash-borrow);addLedger('BORROW_FEE',-borrow,`${t} 借股成本`);
  }
  state.lastBorrowDay=state.day;
}
function marginReview(){
  let count=0;
  while(Object.keys(state.shorts).length&&equity()<shortLiability()*.30&&count++<20){
    const t=Object.keys(state.shorts).sort((a,b)=>state.shorts[b].qty*state.stocks[b].price-state.shorts[a].qty*state.stocks[a].price)[0];
    // Release protected puts as complete groups before forced stock buyback.
    for(const g of [...optionGroups()].filter(g=>g.ticker===t&&g.strategy==='covered_put'))strategyClose(g.id,g.qty,true);
    for(const o of state.orders.filter(o=>o.status==='open'&&o.side==='buy')){o.status='cancelled';o.reason='維持保證金不足'}
    shortCover(t,state.shorts[t].qty,true);
    state.news.unshift({day:state.day,title:'孖展不足：系統強制回補沽空',body:`已回補 ${t}；相關備兌認沽已整組平倉。`});
  }
}
