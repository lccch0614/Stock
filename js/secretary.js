'use strict';
const REPORT_LIMIT=90,TASK_LIMIT=100;
const copyData=x=>JSON.parse(JSON.stringify(x));
const eventSeq=x=>Number(String(x.id).split('-').at(-1))||0;
function newSecretary(baseline){return {settings:{mode:'pause'},baseline,reports:[],tasks:[],readThrough:0,dropped:0}}
function snapshotAccount(s=state){
 const rows=[],locks=[];let stockMark=0,shortMark=0,optionMark=0,shortProceeds=0,shortMargin=0,optionCash=0,orderCash=0;
 const sharesLocked=t=>(s.optionGroups||[]).filter(g=>g.ticker===t&&STRATEGIES[g.strategy].protection==='shares').reduce((a,g)=>a+g.qty*100,0);
 for(const [t,p] of Object.entries(s.positions)){
  const st=s.stocks[t],mark=round(p.qty*st.price),pnl=round(mark-p.qty*p.cost);stockMark+=mark;
  rows.push({key:'stock-'+t,type:'stock',ticker:t,name:st.name,qty:p.qty,cost:p.cost,price:st.price,change:st.lastReturn||0,mark,pnl,pnlPct:null,locked:sharesLocked(t)});
  rows.at(-1).pnlPct=p.cost>0?pnl/(p.qty*p.cost):null;
 }
 for(const [t,p] of Object.entries(s.shorts)){
  const st=s.stocks[t],mark=round(-p.qty*st.price),pnl=round((p.cost-st.price)*p.qty);shortMark+=mark;shortProceeds+=p.proceeds;shortMargin+=p.qty*st.price*.5;
  rows.push({key:'short-'+t,type:'short',ticker:t,name:st.name,qty:p.qty,cost:p.cost,price:st.price,change:st.lastReturn||0,mark,pnl,pnlPct:p.cost>0?pnl/(p.cost*p.qty):null,coverEstimate:round(p.qty*quoteForStock(st,'buy')+fee(p.qty,quoteForStock(st,'buy')))});
  locks.push({id:'short-'+t,ticker:t,label:t+' 沽空所得及 50% 保證金',cash:round(p.proceeds+p.qty*st.price*.5),shares:0});
 }
 for(const g of s.optionGroups||[]){
  const legs=s.options.filter(o=>o.groupId===g.id).map(o=>{const q=optionQuoteAt(s,o.ticker,o.kind,o.strike,o.expiry);return {side:o.side,kind:o.kind,strike:o.strike,qty:o.qty,entry:o.entry,entryFee:o.entryFee,bid:q.bid,ask:q.ask,mark:o.expiry<=s.day?q.price:o.side===1?q.bid:q.ask,delta:q.delta,gamma:q.gamma,theta:q.theta,vega:q.vega}});
  const mark=round(legs.reduce((a,o)=>a+o.side*o.mark*100*o.qty,0)),entry=round(legs.reduce((a,o)=>a+o.side*o.entry*100*o.qty,0)),openFees=legs.reduce((a,o)=>a+o.entryFee*o.qty,0),closeFee=legs.length*g.qty;
  optionMark+=mark;const def=STRATEGIES[g.strategy],strikes=legs.map(o=>o.strike),cash=round((def.protection==='cash'||def.protection==='shorts'?strikes[0]*100:def.protection==='credit'?(Math.max(...strikes)-Math.min(...strikes))*100:0)*g.qty);
  optionCash+=cash;
  if(cash||def.protection==='shares'||def.protection==='shorts')locks.push({id:g.id,ticker:g.ticker,label:STRATEGIES[g.strategy].name,cash,shares:['shares','shorts'].includes(def.protection)?g.qty*100:0,shareType:def.protection==='shorts'?'沽空股':'正股'});
  const row={key:g.id,groupId:g.id,type:'option',ticker:g.ticker,strategy:g.strategy,name:STRATEGIES[g.strategy].name,qty:g.qty,price:s.stocks[g.ticker].price,expiry:g.expiry,dte:Math.max(0,g.expiry-s.day),legs,mark,pnl:round(mark-entry-openFees),closeCash:round(mark-closeFee),closePnl:round(mark-entry-openFees-closeFee),collateral:cash};
  for(const k of ['delta','gamma','theta','vega'])row[k]=legs.reduce((a,o)=>a+o.side*o[k]*100*o.qty,0);
  rows.push(row);
 }
 for(const o of s.orders.filter(o=>o.status==='open')){if(o.side==='buy')orderCash+=o.reserved;locks.push({id:o.id,ticker:o.ticker,label:o.ticker+' '+(o.side==='buy'?'買單預留':'賣單鎖股'),cash:o.reserved,shares:o.side==='sell'?o.qty:0,shareType:'正股'})}
 const totalLocks=round(shortProceeds+shortMargin+orderCash+optionCash),net=round(s.cash+stockMark+shortMark+optionMark),raw=round(s.cash-totalLocks);
 let peak=10000,dd=0;for(const h of [...s.history,{equity:net}]){peak=Math.max(peak,h.equity);dd=Math.max(dd,(peak-h.equity)/Math.max(1,peak))}
 const nominal=rows.filter(r=>r.type!=='option').map(r=>({ticker:r.ticker,type:r.type,value:Math.abs(r.mark),ratio:net>0?Math.abs(r.mark)/net:null})).sort((a,b)=>b.value-a.value);
 const target=s.level<4?levelRequirement(s.level+1):null,tasks=careerRequirements(s,net);
 return {risk:accountRisk(s),decision:careerSnapshot(s),day:s.day,seq:s.seq,cash:s.cash,equity:net,marks:{stock:round(stockMark),short:round(shortMark),option:round(optionMark)},rows,locks,lockedCash:totalLocks,available:Math.max(0,raw),raw,shortLiability:round(-shortMark),maintenance:shortMark<0?net/-shortMark:null,drawdown:dd,concentration:nominal[0]||null,level:s.level,career:{target,gap:target?round(Math.max(0,target-net)):0,tasks},orders:s.orders.filter(o=>o.status==='open').map(o=>({id:o.id,ticker:o.ticker,side:o.side,qty:o.qty,reserved:o.reserved})),market:s.market,news:s.news.filter(n=>n.day<=s.day).slice(0,6).map(n=>({day:n.day,title:n.title,body:n.body})),quotes:Object.values(s.stocks).map(st=>({ticker:st.ticker,name:st.name,price:st.price,change:st.lastReturn||0}))};
}
function quoteForStock(st,side){return round(st.price+(side==='buy'?1:-1)*Math.max(.01,round(st.price*.0007))/2)}
function riskScoreForSnapshot(s,net){return accountRisk(s).score}
function closingBaseline(snap){return {day:snap.day,seq:snap.seq,equity:snap.equity,cash:snap.cash,marks:copyData(snap.marks)}}
function ensureSecretary(s=state){if(!s.secretary)s.secretary=newSecretary(closingBaseline(snapshotAccount(s)));return s.secretary}
function adviceKey(prefix,value){const key=prefix+'-'+value;if(key.length<=60)return key;let hash=2166136261;for(const ch of key)hash=Math.imul(hash^ch.charCodeAt(0),16777619);return key.slice(0,45)+'-'+(hash>>>0).toString(36)}
function advisorRecommendations(snap){
 // Pure rule engine: this function only receives published closing data, never RNG or future events.
 const advice=[];const add=(id,priority,title,reason,condition,action,target,check)=>advice.push({id,priority,title,reason,condition,action,target,check});
 if(snap.equity<=0||snap.raw<0||(snap.maintenance!==null&&snap.maintenance<.35))add('funds','high','先處理資金與保證金緩衝',`可用資金 ${money(snap.available)}；扣抵押後餘額 ${money(snap.raw)}。`,'下一回合仍有抵押缺口，或維持比例接近 30% 時，先檢查減倉及取消買單。','檢查抵押明細與掛單',{view:'portfolio'},{type:'funds',value:snap.available});
 const expiring=snap.rows.filter(r=>r.type==='option'&&r.dte<=3).sort((a,b)=>a.dte-b.dte||a.key.localeCompare(b.key))[0];
 if(expiring)add(adviceKey('expiry',expiring.key),'high','檢查即將到期的 '+expiring.ticker+' 策略',`剩 ${expiring.dte} 個交易日；現在整組平倉現金流估計 ${money(expiring.closeCash)}（已扣平倉費）。`,'下一回合仍持有且距離到期不多於 3 日時，比較整組平倉與現金結算。','前往整組持倉檢查',{view:'advanced',ticker:expiring.ticker,groupId:expiring.key},{type:'expiry',groupId:expiring.key});
 if(snap.concentration?.ratio>.4){const c=snap.concentration;add('concentration-'+c.ticker,'medium','檢查 '+c.ticker+' 持倉集中度',`此${c.type==='short'?'沽空':'正股'}名義市值佔淨值 ${(c.ratio*100).toFixed(1)}%。`,'下一回合仍高於 40% 時，評估減少集中或保留現金；40% 是本遊戲提醒門檻。','查看持倉及可售股數',{view:c.type==='short'?'advanced':'trade',ticker:c.ticker},{type:'concentration',ticker:c.ticker,value:c.ratio})}
 if(snap.available<Math.max(100,Math.max(0,snap.equity)*.1)&&!advice.some(a=>a.id==='funds'))add('funds','medium','保留下一回合現金緩衝',`可用資金 ${money(snap.available)}，低於淨值 10% 或 $100 的提醒線。`,'有新交易前先檢查掛單、費用及抵押；10% 是遊戲規劃提醒，並非券商規則。','檢查資金佔用',{view:'portfolio'},{type:'funds',value:snap.available});
 if(snap.drawdown>=.15)add('drawdown','medium','重新檢視回撤與持倉規模',`歷史最大回撤 ${(snap.drawdown*100).toFixed(1)}%。`,'若仍有集中或槓桿風險，先調整下一筆交易預算，避免以加碼追回虧損。','檢視風險與交易紀錄',{view:'portfolio'},{type:'manual'});
 if(advice.length<3){const missing=snap.career.tasks.filter(t=>!t.done);if(missing.length)add('career','low','為下一級訂一個可執行目標',`距離資產門檻尚欠 ${money(snap.career.gap)}；未完成：${missing.slice(0,2).map(t=>t.label).join('、')}。`,'資金及風險條件容許時，選一項任務制定計劃；晉級不保證盈利。','查看生涯條件',{view:'career'},{type:'career',level:snap.level})}
 if(advice.length<3)add('observe','low',snap.rows.length?'觀察報價，維持原有交易計劃':'先觀察市場，再決定第一筆交易',`目前市場為${snap.market}，可用資金 ${money(snap.available)}。`,'先看下一交易日公開行情與新聞；交易前寫下資金上限、費用及退出條件，訊號不足可觀望。','查看市場與新聞',{view:'market'},{type:'manual'});
 return advice.slice(0,3);
}
function taskReview(task,snap){
 if(task.status==='done')return {status:'done',text:'玩家已標記處理完成；請繼續留意相關風險。'};
 if(task.status==='skipped')return {status:'skipped',text:'玩家已略過此項建議。'};
 const c=task.check;
 if(c.type==='expiry'&&!snap.rows.some(r=>r.key===c.groupId))return {status:'done',text:'原策略已平倉或到期結算，相關到期提醒已解除。'};
 if(c.type==='funds'&&snap.raw>=0&&snap.available>=Math.max(100,snap.equity*.1))return {status:'done',text:'可用資金已回到遊戲提醒線以上。'};
 if(c.type==='concentration'){
  const rows=snap.rows.filter(r=>r.type!=='option'&&r.ticker===c.ticker),ratio=snap.equity>0?rows.reduce((a,r)=>a+Math.abs(r.mark),0)/snap.equity:Infinity;
  if(ratio<=.4)return {status:'done',text:'該股票名義持倉已回到淨值 40% 或以下。'};
  return {status:'pending',text:ratio<c.value?'集中度下降，但仍高於 40% 提醒線。':'集中風險仍需檢查。'};
 }
 if(c.type==='career'&&snap.level>c.level)return {status:'done',text:'已達成生涯晉級。'};
 return {status:'pending',text:'仍待玩家檢視或處理；沒有因價格變化自動執行交易。'};
}
function finalizeDailyReport(){
 const sec=ensureSecretary();if(sec.reports.some(r=>r.day===state.day)||sec.baseline.day>=state.day)return null;
 const snap=snapshotAccount(),base=sec.baseline,ledgers=state.ledger.filter(e=>eventSeq(e)>base.seq),trades=state.transactions.filter(e=>eventSeq(e)>base.seq),derivatives=state.derivativeTransactions.filter(e=>eventSeq(e)>base.seq);
 const stockFees=round(trades.reduce((a,t)=>a+t.fee,0)),shortActions=['SHORT','COVER','FORCED_COVER'],shortFees=round(derivatives.filter(t=>shortActions.includes(t.action)).reduce((a,t)=>a+t.fee,0)),optionFees=round(derivatives.filter(t=>!shortActions.includes(t.action)).reduce((a,t)=>a+t.fee,0));
 const sum=types=>round(ledgers.filter(l=>types.includes(l.type)).reduce((a,l)=>a+l.amount,0)),borrow=round(-sum(['BORROW_FEE'])),fees=round(stockFees+shortFees+optionFees+borrow);
 const stock=round(snap.marks.stock-base.marks.stock+sum(['BUY','SELL','COLLATERAL_SALE'])+stockFees),short=round(snap.marks.short-base.marks.short+sum(['SHORT','COVER','BORROW_FEE'])+shortFees+borrow),option=round(snap.marks.option-base.marks.option+sum(['STRATEGY_OPEN','STRATEGY_CLOSE','OPTION_EXPIRY','OPTION_BUY','OPTION_CLOSE'])+optionFees),pnl=round(snap.equity-base.equity),adjustment=round(pnl-stock-short-option+fees);
 const reviews=[];
 for(const t of sec.tasks){if(t.dueDay>state.day||(t.status!=='pending'&&t.reviewedDay>=t.updatedDay))continue;const result=taskReview(t,snap);reviews.push({id:t.id,title:t.title,...result});t.status=result.status;t.reviewedDay=state.day;t.reviewText=result.text}
 const report={id:'DAY-'+state.day,read:false,day:state.day,fromDay:base.day,baselineEquity:base.equity,pnl,returnPct:base.equity>0?pnl/base.equity:null,cashChange:round(snap.cash-base.cash),contributions:{stock,short,option,fees,borrow,adjustment},snapshot:snap,tradeCount:trades.length+derivatives.length,events:[...trades.map(t=>({id:t.id,day:t.day,ticker:t.ticker,action:t.side==='buy'?'買入正股':'賣出正股',qty:t.qty,price:t.price,fee:t.fee})),...derivatives.map(t=>({id:t.id,day:t.day,ticker:t.ticker,action:t.action,qty:t.qty,price:t.price,fee:t.fee}))].sort((a,b)=>eventSeq(a)-eventSeq(b)).slice(-100),borrowCount:ledgers.filter(l=>l.type==='BORROW_FEE').length,reviews,advice:advisorRecommendations(snap)};
 sec.reports.push(copyData(report));if(sec.reports.length>REPORT_LIMIT){sec.dropped+=sec.reports.length-REPORT_LIMIT;sec.reports.splice(0,sec.reports.length-REPORT_LIMIT)}
 sec.baseline=closingBaseline(snap);return report;
}
function addAdviceTask(day,adviceId){
 const sec=ensureSecretary(),report=sec.reports.find(r=>r.day===day),advice=report?.advice.find(a=>a.id===adviceId);if(!advice)return fail('找不到建議');
 const id='TASK-'+day+'-'+advice.id;if(sec.tasks.some(t=>t.id===id))return fail('此建議已加入待辦');
 const same=sec.tasks.find(t=>t.status==='pending'&&t.adviceId===advice.id);if(same)return fail('同類建議仍在待辦清單，請先檢視');
 if(day!==sec.reports.at(-1)?.day)return fail('舊簡報僅供回顧，請使用最新簡報建立待辦');
 if(sec.tasks.length>=TASK_LIMIT){const old=sec.tasks.findIndex(t=>t.status!=='pending'&&t.reviewedDay>=t.updatedDay);if(old<0)return fail('待辦已達 100 項，請先處理現有項目');sec.tasks.splice(old,1)}
 sec.tasks.push({id,adviceId:advice.id,sourceDay:day,dueDay:state.day+1,title:advice.title,reason:advice.reason,condition:advice.condition,target:copyData(advice.target),check:copyData(advice.check),status:'pending',updatedDay:state.day,reviewedDay:-1});return {ok:true,msg:'已加入下一交易日待辦'};
}
function updateAdviceTask(id,status){const t=ensureSecretary().tasks.find(t=>t.id===id);if(!t||!['pending','done','skipped'].includes(status))return fail('待辦狀態無效');t.status=status;t.updatedDay=state.day;t.reviewedDay=-1;return {ok:true,msg:'待辦狀態已更新'}}
function readReport(day){const sec=ensureSecretary(),r=sec.reports.find(r=>r.day===day);if(!r)return false;r.read=true;sec.readThrough=Math.max(sec.readThrough,day);return true}
function validateSecretary(sec,day,seq){
 try{
  const number=x=>typeof x==='number'&&Number.isFinite(x),integer=x=>Number.isSafeInteger(x)&&x>=0,text=x=>typeof x==='string'&&x.length<=2000,known=t=>SYMBOLS.some(x=>x[0]===t),list=(x,max=500)=>Array.isArray(x)&&x.length<=max;
  const check=c=>c&&['funds','expiry','concentration','manual','career'].includes(c.type)&&(c.type!=='expiry'||validId(c.groupId))&&(c.type!=='funds'||number(c.value))&&(c.type!=='concentration'||known(c.ticker)&&number(c.value))&&(c.type!=='career'||[1,2,3,4].includes(c.level));
  const target=t=>t&&['portfolio','advanced','trade','market','career'].includes(t.view)&&(!t.ticker||known(t.ticker))&&(!t.groupId||validId(t.groupId));
  const marks=m=>m&&['stock','short','option'].every(k=>number(m[k]));
  function snapshot(s){
   if(!s||!integer(s.day)||!integer(s.seq)||!['cash','equity','lockedCash','available','raw','shortLiability','drawdown'].every(k=>number(s[k]))||!marks(s.marks)||![1,2,3,4].includes(s.level)||!text(s.market)||(s.maintenance!==null&&!number(s.maintenance)))return false;
   if(!list(s.rows)||!s.rows.every(r=>r&&validId(r.key)&&known(r.ticker)&&text(r.name)&&positiveQty(r.qty)&&['price','mark','pnl'].every(k=>number(r[k]))&&(
    ['stock','short'].includes(r.type)?['cost','change'].every(k=>number(r[k]))&&(r.pnlPct===null||number(r.pnlPct)):
    r.type==='option'&&validId(r.groupId)&&STRATEGIES[r.strategy]&&integer(r.expiry)&&integer(r.dte)&&['closeCash','closePnl','collateral','delta','gamma','theta','vega'].every(k=>number(r[k]))&&list(r.legs,2)&&r.legs.length>0&&r.legs.every(l=>l&&[1,-1].includes(l.side)&&['call','put'].includes(l.kind)&&positiveQty(l.qty)&&['strike','entry','entryFee','bid','ask','mark','delta','gamma','theta','vega'].every(k=>number(l[k])))
   )))return false;
   if(!list(s.locks)||!s.locks.every(l=>l&&validId(l.id)&&known(l.ticker)&&text(l.label)&&number(l.cash)&&l.cash>=0&&integer(l.shares)&&(!l.shareType||text(l.shareType))))return false;
   if(!list(s.orders)||!s.orders.every(o=>o&&validId(o.id)&&known(o.ticker)&&['buy','sell'].includes(o.side)&&positiveQty(o.qty)&&number(o.reserved)))return false;
   if(!list(s.news,6)||!s.news.every(n=>n&&integer(n.day)&&n.day<=s.day&&text(n.title)&&text(n.body)))return false;
   if(!list(s.quotes,15)||s.quotes.length!==15||!s.quotes.every(q=>q&&known(q.ticker)&&text(q.name)&&number(q.price)&&number(q.change)))return false;
   if(s.concentration&&(!known(s.concentration.ticker)||!['stock','short'].includes(s.concentration.type)||!number(s.concentration.value)||(s.concentration.ratio!==null&&!number(s.concentration.ratio))))return false;
   if(!s.career||(s.career.target!==null&&!number(s.career.target))||!number(s.career.gap)||!list(s.career.tasks,8)||!s.career.tasks.every(t=>t&&text(t.label)&&typeof t.done==='boolean'))return false;
   if(s.risk&&!validateRiskSnapshot(s.risk)||s.decision&&!validateDecisionSnapshot(s.decision,s.day))return false;
   return true;
  }
  if(!sec||!['pause','continuous'].includes(sec.settings?.mode)||!integer(sec.readThrough)||sec.readThrough>day||!integer(sec.dropped)||!list(sec.reports,REPORT_LIMIT)||!list(sec.tasks,TASK_LIMIT))return false;
  const b=sec.baseline;if(!b||!integer(b.day)||b.day>day||!integer(b.seq)||b.seq>seq||!number(b.equity)||!number(b.cash)||!marks(b.marks))return false;
  let previous=0;
  for(const r of sec.reports){
   if(!r||(r.read!==undefined&&typeof r.read!=='boolean')||!integer(r.day)||r.day<=previous||r.day>day||r.id!=='DAY-'+r.day||!integer(r.fromDay)||r.fromDay>=r.day||!number(r.pnl)||!number(r.baselineEquity)||!number(r.cashChange)||(r.returnPct!==null&&!number(r.returnPct))||!['stock','short','option','fees','borrow','adjustment'].every(k=>number(r.contributions?.[k]))||!snapshot(r.snapshot)||r.snapshot.day!==r.day||!integer(r.tradeCount)||!integer(r.borrowCount)||!list(r.events,100)||!list(r.reviews,TASK_LIMIT)||!list(r.advice,3))return false;
   previous=r.day;const c=r.contributions;if(Math.abs(r.snapshot.equity-r.baselineEquity-r.pnl)>.015||Math.abs(c.stock+c.short+c.option-c.fees+c.adjustment-r.pnl)>.015)return false;
   if(!r.events.every(e=>e&&validId(e.id)&&known(e.ticker)&&text(e.action)&&integer(e.day)&&e.day<=r.day&&['qty','price','fee'].every(k=>number(e[k]))))return false;
   if(!r.reviews.every(t=>t&&validId(t.id)&&text(t.title)&&text(t.text)&&['pending','done','skipped'].includes(t.status)))return false;
   if(!r.advice.every(a=>a&&validId(a.id)&&text(a.title)&&text(a.reason)&&text(a.condition)&&text(a.action)&&['high','medium','low'].includes(a.priority)&&target(a.target)&&check(a.check)))return false;
  }
  if(sec.reports.length&&sec.reports.at(-1).day!==b.day)return false;
  if(new Set(sec.tasks.map(t=>t.id)).size!==sec.tasks.length||!sec.tasks.every(t=>t&&validId(t.id)&&validId(t.adviceId)&&text(t.title)&&text(t.reason)&&text(t.condition)&&(!t.reviewText||text(t.reviewText))&&target(t.target)&&check(t.check)&&['pending','done','skipped'].includes(t.status)&&integer(t.sourceDay)&&t.sourceDay<=day&&integer(t.dueDay)&&t.dueDay>t.sourceDay&&integer(t.updatedDay)&&t.updatedDay<=day&&Number.isSafeInteger(t.reviewedDay)&&t.reviewedDay>=-1&&t.reviewedDay<=day))return false;
  return true;
 }catch{return false}
}
