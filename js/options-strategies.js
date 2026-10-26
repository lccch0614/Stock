'use strict';
// All amounts are simulated USD. One contract represents 100 shares.
const STRATEGIES = {
  long_call: {name:'買入 Call', kind:'call', legs:[[1,'low']], protection:'none'},
  long_put: {name:'買入 Put', kind:'put', legs:[[1,'low']], protection:'none'},
  covered_call: {name:'備兌認購 · Covered Call',kind:'call',legs:[[-1,'low']],protection:'shares'},
  cash_secured_put: {name:'現金擔保認沽 · Cash-secured Put',kind:'put',legs:[[-1,'low']],protection:'cash'},
  covered_put: {name:'備兌認沽 · Covered Put',kind:'put',legs:[[-1,'low']],protection:'shorts'},
  bull_call: {name:'牛市認購價差 · Bull Call',kind:'call',legs:[[1,'low'],[-1,'high']],protection:'debit'},
  bear_put: {name:'熊市認沽價差 · Bear Put',kind:'put',legs:[[-1,'low'],[1,'high']],protection:'debit'},
  bull_put: {name:'牛市認沽價差 · Bull Put',kind:'put',legs:[[1,'low'],[-1,'high']],protection:'credit'},
  bear_call: {name:'熊市認購價差 · Bear Call',kind:'call',legs:[[-1,'low'],[1,'high']],protection:'credit'}
};
const fail = msg => ({ok:false,msg});
function groupLegs(id){return state.options.filter(o=>o.groupId===id)}
function optionGroups(){return state.optionGroups||[]}
function protectedShares(t,kind='shares'){
  return optionGroups().filter(g=>g.ticker===t&&STRATEGIES[g.strategy].protection===kind).reduce((a,g)=>a+g.qty*100,0);
}
function reservedSellShares(t,exclude=null){return state.orders.filter(o=>o.id!==exclude&&o.status==='open'&&o.side==='sell'&&o.ticker===t).reduce((a,o)=>a+o.qty,0)}
function freeShares(t,exclude=null){return Math.max(0,(state.positions[t]?.qty||0)-protectedShares(t)-reservedSellShares(t,exclude))}
function optionCollateral(){return round(optionGroups().reduce((a,g)=>{
  const def=STRATEGIES[g.strategy],legs=groupLegs(g.id);
  if(!legs.length)return a;
  const strikes=legs.map(o=>o.strike);
  if(def.protection==='cash'||def.protection==='shorts')return a+strikes[0]*100*g.qty;
  if(def.protection==='credit')return a+(Math.max(...strikes)-Math.min(...strikes))*100*g.qty;
  return a;
},0))}
function accountLocks(excludeOrder=null){
  const shortProceeds=round(Object.values(state.shorts).reduce((a,p)=>a+p.proceeds,0));
  const shortMargin=round(shortLiability()*.5),orders=reservedBuyOrders(excludeOrder),options=optionCollateral();
  return {shortProceeds,shortMargin,orders,options,total:round(shortProceeds+shortMargin+orders+options)};
}
function availableRaw(excludeOrder=null){return round(state.cash-accountLocks(excludeOrder).total)}
function availableFunds(excludeOrder=null){return Math.max(0,availableRaw(excludeOrder))}
// Execute on a private copy. An error or rejected leg leaves cash, IDs and logs untouched.
function atomic(action){
  const original=state;state=JSON.parse(JSON.stringify(state));
  try {const result=action();if(!result?.ok){state=original;return result||fail('交易未執行')}
    if(!Number.isFinite(state.cash))throw Error('現金數值無效');return result;
  } catch(e){state=original;return fail('交易取消：'+e.message)}
}
function strategyPreview(strategy,t,low,high,days,qty){
  const def=STRATEGIES[strategy];
  if(!def||!state.stocks[t]||!Number.isSafeInteger(qty)||qty<1||qty>100000||![7,14,30,60,90].includes(days)||!Number.isFinite(low)||low<=0||low>1e7||
    (def.legs.length===2&&(!Number.isFinite(high)||high<=low||high>1e7)))return fail('策略、股數、到期日或行使價無效；高行使價須大於低行使價');
  const expiry=state.day+days;
  const legs=def.legs.map(([side,key])=>{const strike=key==='low'?low:high,q=optionQuote(t,def.kind,strike,expiry);return {ticker:t,kind:def.kind,strike,expiry,side,qty,entry:side===1?q.ask:q.bid,entryFee:1}});
  const fees=qty*legs.length,cashFlow=round(-legs.reduce((a,o)=>a+o.side*o.entry*100*qty,0)-fees);
  const width=def.legs.length===2?(high-low)*100*qty:0;
  const collateral=['cash','shorts'].includes(def.protection)?low*100*qty:def.protection==='credit'?width:0;
  if(def.protection==='debit'&&cashFlow>=0)return fail('報價未形成淨支出價差，請改選行使價');
  if(def.protection==='credit'&&(cashFlow<=0||cashFlow>=width))return fail('價差權利金不足以支付費用，或報價超出價差寬度');
  const payout=px=>legs.reduce((a,o)=>a+o.side*Math.max(0,o.kind==='call'?px-o.strike:o.strike-px)*100*qty,0);
  let loss,profit;
  if(def.legs.length===2){const outcomes=[payout(0)+cashFlow,payout(low)+cashFlow,payout(high)+cashFlow,payout(high*2)+cashFlow];loss=-Math.min(...outcomes);profit=Math.max(...outcomes)}
  else if(strategy==='long_call'){loss=-cashFlow;profit=Infinity}
  else if(strategy==='long_put'){loss=-cashFlow;profit=low*100*qty+cashFlow}
  else if(strategy==='cash_secured_put'){loss=low*100*qty-cashFlow;profit=cashFlow}
  else if(strategy==='covered_call'){const basis=state.positions[t]?.cost||state.stocks[t].price;loss=basis*100*qty-cashFlow;profit=(low-basis)*100*qty+cashFlow}
  else {loss=Infinity;profit=((state.shorts[t]?.cost||state.stocks[t].price)-low)*100*qty+cashFlow}
  return {ok:true,strategy,ticker:t,expiry,qty,legs,fees,cashFlow,collateral,capital:round(Math.max(0,collateral-cashFlow)),maxLoss:Math.max(0,loss),maxProfit:profit,protection:def.protection};
}
function strategyOpen(strategy,t,low,high,days,qty){
  const p=strategyPreview(strategy,t,low,high,days,qty);if(!p.ok)return p;
  if(p.protection==='shares'&&freeShares(t)<qty*100)return fail('未鎖定的正股不足：每張 Covered Call 須持有 100 股；請先取消相關賣出掛單');
  if(p.protection==='shorts'&&(state.shorts[t]?.qty||0)-protectedShares(t,'shorts')<qty*100)return fail('未鎖定的沽空持股不足：每張 Covered Put 須先沽空 100 股');
  if(availableRaw()+p.cashFlow-p.collateral < -0.001)return fail('扣除掛單、沽空及期權抵押後，可用資金不足');
  return atomic(()=>{
    const id=unique('GRP');
    state.optionGroups.push({id,strategy,ticker:t,expiry:p.expiry,qty,openedDay:state.day});
    for(const leg of p.legs){state.options.push({...leg,id:unique('OPT'),groupId:id})}
    state.cash=round(state.cash+p.cashFlow);
    state.derivativeTransactions.push({id:unique('D'),groupId:id,day:state.day,action:p.legs.length===2?'STRATEGY_OPEN':p.legs[0].side<0?'SELL_TO_OPEN':'BUY_'+p.legs[0].kind.toUpperCase(),ticker:t,qty,price:round((p.cashFlow+p.fees)/(100*qty)),fee:p.fees,realized:-p.fees,legs:p.legs});
    addLedger('STRATEGY_OPEN',p.cashFlow,`${STRATEGIES[strategy].name} ${qty} 組 ${t}`);
    recordPlanOpen('option',t,{groupId:id,cost:p.capital,risk:Number.isFinite(p.maxLoss)?p.maxLoss:p.capital});
    return {ok:true,id,msg:`${STRATEGIES[strategy].name} 已整組開倉；${p.cashFlow>=0?'淨收入':'淨支出'} ${money(Math.abs(p.cashFlow))}`};
  });
}
function optionOpen(t,kind,strike,days,qty){return strategyOpen('long_'+kind,t,strike,null,days,qty)}
function optionSellOpen(t,kind,strike,days,qty,protection){
  const strategy=kind==='call'&&protection==='shares'?'covered_call':kind==='put'&&protection==='cash'?'cash_secured_put':kind==='put'&&protection==='shorts'?'covered_put':null;
  return strategy?strategyOpen(strategy,t,strike,null,days,qty):fail('禁止裸賣期權；請選擇備兌、現金擔保或完整價差');
}
function groupMetrics(id){
  const g=optionGroups().find(x=>x.id===id);if(!g)return null;
  const legs=groupLegs(id),greeks={delta:0,gamma:0,theta:0,vega:0};let value=0,entry=0,fees=0;
  for(const o of legs){const q=optionQuote(o.ticker,o.kind,o.strike,o.expiry),expired=o.expiry<=state.day;
    const mark=expired?Math.max(0,o.kind==='call'?state.stocks[o.ticker].price-o.strike:o.strike-state.stocks[o.ticker].price):o.side===1?q.bid:q.ask;
    value+=o.side*mark*100*o.qty;entry+=o.side*o.entry*100*o.qty;fees+=o.entryFee*o.qty;
    for(const key of Object.keys(greeks))greeks[key]+=o.side*q[key]*100*o.qty;
  }
  return {...greeks,value:round(value),pnl:round(value-entry-fees),closePnl:round(value-entry-fees-legs.length*g.qty),entry:round(entry),fees};
}
function optionValue(){return round(optionGroups().reduce((a,g)=>a+groupMetrics(g.id).value,0))}
function portfolioGreeks(){return optionGroups().reduce((a,g)=>{const m=groupMetrics(g.id);for(const key of ['delta','gamma','theta','vega'])a[key]+=m[key];a.pnl+=m.pnl;return a},{delta:0,gamma:0,theta:0,vega:0,pnl:0})}
function strategyClose(id,qty,forced=false,liquidateShares=false){
  const g=optionGroups().find(x=>x.id===id),legs=groupLegs(id);
  if(!g||!Number.isSafeInteger(qty)||qty<1||qty>g.qty||g.expiry<=state.day)return fail('策略不存在、數量無效或已到期');
  const quotes=legs.map(o=>optionQuote(o.ticker,o.kind,o.strike,o.expiry));
  const flow=round(legs.reduce((a,o,i)=>a+o.side*(o.side===1?quotes[i].bid:quotes[i].ask)*100*qty,0)-legs.length*qty);
  return atomic(()=>{
    if(liquidateShares){if(g.strategy!=='covered_call')return fail('此策略沒有抵押正股');
      const pos=state.positions[g.ticker],n=qty*100,p=quote(state.stocks[g.ticker],'sell'),f=fee(n,p),value=round(n*p-f);
      state.cash=round(state.cash+value);pos.qty-=n;
      state.transactions.push({id:unique('T'),day:state.day,ticker:g.ticker,side:'sell',qty:n,price:p,fee:f,realized:round(value-n*pos.cost)});
      if(!pos.qty)delete state.positions[g.ticker];addLedger('SELL',value,'整組平倉時賣出備兌股票');
    }
    state.cash=round(state.cash+flow);
    const realized=round(flow-legs.reduce((a,o)=>a+o.side*o.entry*100*qty,0));
    for(const o of state.options.filter(o=>o.groupId===id))o.qty-=qty;
    state.options=state.options.filter(o=>o.qty>0);const draft=state.optionGroups.find(x=>x.id===id);draft.qty-=qty;
    state.optionGroups=state.optionGroups.filter(x=>x.qty>0);
    if(!forced&&availableRaw() < -0.001)return fail('平倉後現金不足以維持其餘抵押；備兌認購可選擇連股票整組平倉');
    state.derivativeTransactions.push({id:unique('D'),groupId:id,day:state.day,action:legs.length===2?'STRATEGY_CLOSE':legs[0].side<0?'BUY_TO_CLOSE':'SELL_TO_CLOSE',ticker:g.ticker,qty,price:round((flow+legs.length*qty)/(100*qty)),fee:legs.length*qty,realized,combinedRealized:round(realized-legs.reduce((a,o)=>a+o.entryFee*qty,0))});
    addLedger('STRATEGY_CLOSE',flow,`${STRATEGIES[g.strategy].name} ${qty} 組整組平倉`);
    evaluatePlans();return {ok:true,msg:`策略已整組平倉，期權損益（連開平倉費）${money(state.derivativeTransactions.at(-1).combinedRealized)}`};
  });
}
function optionClose(id,qty){const o=state.options.find(o=>o.id===id);if(!o)return fail('找不到合約');if(groupLegs(o.groupId).length>1)return fail('價差不可拆腿，請整組平倉');return strategyClose(o.groupId,qty)}
function settleOptions(){
  for(const group of [...optionGroups()]){
    if(group.expiry>state.day)continue;
    const result=atomic(()=>{
      const legs=groupLegs(group.id),qty=group.qty,st=state.stocks[group.ticker];
      // Covered calls remain cash-settled: sell the locked shares at spot to fund ITM settlement.
      if(group.strategy==='covered_call'&&st.price>legs[0].strike){
        const n=qty*100,pos=state.positions[group.ticker];if(!pos||pos.qty<n)throw Error('備兌股票不足');
        const value=round(st.price*n);state.cash=round(state.cash+value);pos.qty-=n;
        state.transactions.push({id:unique('T'),day:state.day,ticker:group.ticker,side:'sell',qty:n,price:st.price,fee:0,realized:round(value-n*pos.cost),reason:'COVERED_CALL_SETTLEMENT'});
        if(!pos.qty)delete state.positions[group.ticker];addLedger('COLLATERAL_SALE',value,'到期按現價出售備兌股票以支付現金結算（無額外成交費）');
      }
      const flow=round(legs.reduce((a,o)=>a+o.side*Math.max(0,o.kind==='call'?st.price-o.strike:o.strike-st.price)*100*qty,0));
      state.cash=round(state.cash+flow);
      const realized=round(flow-legs.reduce((a,o)=>a+o.side*o.entry*100*qty,0));
      state.options=state.options.filter(o=>o.groupId!==group.id);state.optionGroups=state.optionGroups.filter(g=>g.id!==group.id);
      state.derivativeTransactions.push({id:unique('D'),groupId:group.id,day:state.day,action:'OPTION_EXPIRY',ticker:group.ticker,qty,price:flow/(100*qty),fee:0,realized,combinedRealized:round(realized-legs.reduce((a,o)=>a+o.entryFee*qty,0))});
      addLedger('OPTION_EXPIRY',flow,`${STRATEGIES[group.strategy].name} 整組現金結算`);evaluatePlans();
      return {ok:true};
    });
    if(!result.ok)throw Error(result.msg);
  }
}
