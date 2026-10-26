'use strict';
const MISSION_CATALOG={
 buffer5:{category:'risk',title:'五日資金紀律',days:8,goal:5,xp:100,description:'連續 5 個收市保持可用資金 ≥ 淨值 20%，且沒有抵押缺口。'},
 limitPlan:{category:'execution',title:'按預算執行限價單',days:12,goal:1,xp:120,description:'接任後建立正股計劃，以限價單成交，累計投入不超預算。'},
 verticalPlan:{category:'strategy',title:'完成有界風險價差',days:20,goal:1,xp:160,description:'接任後建立期權計劃，完整價差開倉風險 ≤ 當時淨值 15%，預算內整組結束並完成收市復盤。'},
 buffer8:{category:'risk',title:'八日穩健管理',days:12,goal:8,xp:150,requires:'buffer5',description:'連續 8 個收市保留 30% 可用資金，歷史回撤不超過 20%。'},
 limitReview:{category:'execution',title:'限價交易完整復盤',days:20,goal:1,xp:180,requires:'limitPlan',description:'接任後的新計劃以限價單成交，在預算內平倉，完成收市復盤。'},
 verticalSmall:{category:'strategy',title:'小額價差紀律',days:20,goal:1,xp:200,requires:'verticalPlan',description:'接任後的新期權計劃，完整價差風險 ≤ 淨值 8%，在預算內結束並復盤。'}
};
const CATEGORY_NAMES={risk:'資金管理',execution:'交易執行',strategy:'策略運用'};
function newCareer(day=0){return {startedDay:day,evaluatedDay:day,xp:0,missions:[],plans:[],activePlanId:null}}
function ensureCareer(s=state){return s.career||(s.career=newCareer(s.day))}
function drawdownOf(history){let peak=0,dd=0;for(const h of history){peak=Math.max(peak,h.equity);if(peak>0)dd=Math.max(dd,(peak-h.equity)/peak)}return dd}
function accountRisk(s=state){
 const byTicker={},add=(t,v)=>byTicker[t]=(byTicker[t]||0)+Math.max(0,v);let mark=0,unbounded=false;
 const covered={};
 for(const g of s.optionGroups||[]){
  const legs=s.options.filter(o=>o.groupId===g.id),spot=s.stocks[g.ticker].price,n=g.qty*100;
  const value=legs.reduce((a,o)=>{const q=optionQuoteAt(s,o.ticker,o.kind,o.strike,o.expiry);return a+o.side*(o.expiry<=s.day?q.price:o.side===1?q.bid:q.ask)*100*o.qty},0);mark+=value;
  const payoff=px=>legs.reduce((a,o)=>a+o.side*Math.max(0,o.kind==='call'?px-o.strike:o.strike-px)*100*o.qty,0);
  const strikes=legs.map(o=>o.strike),lo=Math.min(...strikes),hi=Math.max(...strikes);
  if(g.strategy==='covered_call'){covered[g.ticker]=(covered[g.ticker]||0)+n;add(g.ticker,spot*n+value)}
  else if(g.strategy==='covered_put'){unbounded=true;/* short stock is counted below once */}
  else {const minimum=Math.min(payoff(0),payoff(lo),payoff(hi),payoff(hi*2));add(g.ticker,value-minimum)}
 }
 let stocks=0,shorts=0;
 for(const [t,p] of Object.entries(s.positions)){stocks+=p.qty*s.stocks[t].price;add(t,(p.qty-(covered[t]||0))*s.stocks[t].price)}
 for(const [t,p] of Object.entries(s.shorts)){const v=p.qty*s.stocks[t].price;shorts+=v;add(t,v);unbounded=true}
 const net=round(s.cash+stocks-shorts+mark),dd=drawdownOf([...s.history,{equity:net}]);
 const amounts=Object.values(byTicker),largest=Math.max(0,...amounts),ratio=net>0?largest/net:null,total=round(amounts.reduce((a,v)=>a+v,0));
 const score=net<=0?0:Math.round(clamp(85-Math.max(0,(ratio||0)-.2)*55-dd*80,0,100));
 const scenarios=[-.1,.1].map(shock=>{
  let delta=(stocks-shorts)*shock;
  for(const o of s.options){const st=s.stocks[o.ticker],days=Math.max(0,o.expiry-s.day),iv=optionIV(st,o.strike,days,s.market,s.day),base=optionMetrics(st.price,o.strike,days,o.kind,iv).price,next=optionMetrics(st.price*(1+shock),o.strike,days,o.kind,iv).price;delta+=o.side*(next-base)*100*o.qty}
  return {shock,pnl:round(delta),equity:round(net+delta)};
 });
 const recent=s.history.filter(h=>h.day>0&&h.day>=s.day-19&&h.day<=s.day);if(s.day===0){}else if(recent.at(-1)?.day!==s.day)recent.push({day:s.day,equity:net});else recent[recent.length-1]={day:s.day,equity:net};
 return {equity:net,score,drawdown:dd,recentDrawdown:drawdownOf(recent),recentDays:new Set(recent.map(h=>h.day)).size,byTicker:Object.entries(byTicker).map(([ticker,amount])=>({ticker,amount:round(amount)})),total,largest:round(largest),ratio,unbounded,scenarios};
}
function careerRequirements(s=state,net=accountRisk(s).equity){
 const risk=accountRisk(s),c=ensureCareer(s),won=category=>c.missions.some(m=>m.status==='completed'&&MISSION_CATALOG[m.key].category===category);
 if(s.level===1)return [{label:'帳戶淨值達 $20,000',done:net>=20000},{label:'完成 10 個交易日',done:s.day>=10},{label:'完成 10 筆正股交易',done:s.transactions.length>=10},{label:'首次交易',done:s.completed.includes('first')},{label:'限價單成交',done:s.completed.includes('limit')},{label:'風險評分達 50',done:risk.score>=50}];
 if(s.level===2)return [{label:'帳戶淨值達 $50,000',done:net>=50000},{label:'完成 30 個交易日',done:s.day>=30},{label:'完成 2 筆衍生品交易',done:s.derivativeTransactions.length>=2},{label:'風險評分達 55',done:risk.score>=55}];
 if(s.level===3)return [{label:'帳戶淨值達 $100,000',done:net>=100000},{label:'完成 60 個交易日',done:s.day>=60},...Object.keys(CATEGORY_NAMES).map(k=>({label:'完成'+CATEGORY_NAMES[k]+'類任務',done:won(k)})),{label:'最近 20 日回撤 ≤ 20%（需 20 個收市）',done:risk.recentDays>=20&&risk.recentDrawdown<=.2},{label:'沒有現金抵押缺口',done:cashAvailableFor(s)>=0}];
 return [];
}
function cashAvailableFor(s){
 const short=Object.entries(s.shorts).reduce((a,[t,p])=>a+p.proceeds+p.qty*s.stocks[t].price*.5,0),orders=s.orders.filter(o=>o.status==='open'&&o.side==='buy').reduce((a,o)=>a+o.reserved,0);
 const options=(s.optionGroups||[]).reduce((a,g)=>{const d=STRATEGIES[g.strategy],ls=s.options.filter(o=>o.groupId===g.id),ks=ls.map(o=>o.strike);return a+(['cash','shorts'].includes(d.protection)?ks[0]*100*g.qty:d.protection==='credit'?(Math.max(...ks)-Math.min(...ks))*100*g.qty:0)},0);
 return round(s.cash-short-orders-options);
}
function acceptMission(key){const c=ensureCareer(),def=MISSION_CATALOG[key];if(!def)return fail('任務不存在');if(c.missions.some(m=>m.key===key&&m.status!=='abandoned'&&m.status!=='expired'))return fail('此任務已接取或完成');if(c.missions.filter(m=>m.status==='active').length>=2)return fail('最多同時進行兩項任務');if(def.requires&&!c.missions.some(m=>m.key===def.requires&&m.status==='completed'))return fail('請先完成前置任務');c.missions=c.missions.filter(m=>m.key!==key);c.missions.push({key,status:'active',acceptedDay:state.day,dueDay:state.day+def.days,startSeq:state.seq,progress:0,review:'由下一個收市開始計算。',lastDay:state.day,completedDay:null});return {ok:true,msg:'已接取：'+def.title}}
function abandonMission(key){const m=ensureCareer().missions.find(m=>m.key===key&&m.status==='active');if(!m)return fail('任務未在進行中');m.status='abandoned';m.review='玩家已放棄，可重新接取。';return {ok:true,msg:'已放棄任務'}}
function createPlan({ticker:t,instrument,intent='觀察後執行',budget,holdDays=7,takeProfit=.2,stopLoss=.1}={}){
 const c=ensureCareer();if(!state.stocks[t]||!['stock','short','option'].includes(instrument)||typeof intent!=='string'||intent.length>200||!Number.isFinite(budget)||budget<.01||budget>1e12||!Number.isSafeInteger(holdDays)||holdDays<1||holdDays>90||![takeProfit,stopLoss].every(x=>Number.isFinite(x)&&x>0&&x<=10))return fail('請填寫有效計劃、正數預算、1–90 日及退出比例');
 evaluatePlans();
 if(c.plans.filter(p=>['draft','open'].includes(p.status)).length>=12)return fail('最多保留 12 張未結束計劃');
 if(c.plans.some(p=>p.ticker===t&&p.instrument===instrument&&['draft','open'].includes(p.status)))return fail('此股票及工具已有未結束計劃');
 if(instrument==='stock'&&state.positions[t]||instrument==='short'&&state.shorts[t])return fail('此工具已有持倉，請先平倉再建立新計劃');
 if(c.plans.length>=100){const i=c.plans.findIndex(p=>['closed','cancelled'].includes(p.status));if(i<0)return fail('計劃記錄已滿');c.plans.splice(i,1)}
 const id=unique('PLAN');c.plans.push({id,ticker:t,instrument,intent:intent.trim()||'觀察後執行',budget:round(budget),holdDays,takeProfit,stopLoss,createdDay:state.day,startSeq:state.seq,status:'draft',groupId:null,openedDay:null,closedDay:null,usedBudget:0,budgetBreached:false,riskAtOpen:0,equityAtOpen:0,pnl:0,reviewPending:false,reviewedDay:null,orderId:null,trigger:null,review:'等待同股票、同工具的下一筆開倉。'});c.activePlanId=id;return {ok:true,id,msg:'交易計劃已建立；下一筆相符開倉會連結計劃'};
}
function plannedOrder(t,side){return side==='buy'?ensureCareer().plans.find(p=>p.id===ensureCareer().activePlanId&&p.status==='draft'&&p.instrument==='stock'&&p.ticker===t)?.id||null:null}
function cancelPlan(id){const p=ensureCareer().plans.find(p=>p.id===id&&p.status==='draft');if(!p)return fail('只有未開倉計劃可以取消');p.status='cancelled';if(ensureCareer().activePlanId===id)ensureCareer().activePlanId=null;return {ok:true,msg:'計劃已取消'}}
function recordPlanOpen(instrument,t,{groupId=null,cost=0,risk=cost,orderId=null}={}){
 const c=ensureCareer(),order=state.orders.find(o=>o.id===orderId),selected=orderId?order?.planId:c.activePlanId;
 const p=c.plans.find(p=>p.instrument===instrument&&p.ticker===t&&(p.status==='open'&&instrument!=='option'||p.status==='draft'&&p.id===selected));if(!p)return;
 if(p.status==='draft'){p.openedDay=state.day;p.status='open';p.groupId=groupId;p.equityAtOpen=accountRisk().equity;p.riskAtOpen=round(risk);p.orderId=orderId;if(c.activePlanId===p.id)c.activePlanId=null}
 p.usedBudget=round(p.usedBudget+Math.max(0,cost));p.budgetBreached ||= p.usedBudget>p.budget+.005;p.review=p.budgetBreached?'累計投入超出預算；請檢視持倉規模。':'已按計劃開倉，等候收市監察。';
}
function evaluatePlans(daily=false){const c=ensureCareer();for(const p of c.plans){if(p.status==='closed'&&daily&&p.reviewPending){p.reviewedDay=state.day;p.reviewPending=false}if(p.status!=='open')continue;let exists=false;
 if(p.instrument==='option'){const g=state.optionGroups.find(g=>g.id===p.groupId);exists=!!g;p.pnl=exists?round(groupMetrics(g.id).closePnl+state.derivativeTransactions.filter(d=>d.groupId===p.groupId&&d.action!=='STRATEGY_OPEN'&&d.combinedRealized!==undefined).reduce((a,d)=>a+d.combinedRealized,0)):round(state.derivativeTransactions.filter(d=>d.groupId===p.groupId).reduce((a,d)=>a+d.realized,0))}
 else if(p.instrument==='stock'){exists=!!state.positions[p.ticker];const trades=state.transactions.filter(t=>t.ticker===p.ticker&&eventSeq(t)>p.startSeq);p.pnl=round(trades.reduce((a,t)=>a+(t.side==='buy'?-1:1)*t.qty*t.price-t.fee,0)+(exists?state.positions[p.ticker].qty*quote(state.stocks[p.ticker],'sell')-fee(state.positions[p.ticker].qty,quote(state.stocks[p.ticker],'sell')):0))}
 else {exists=!!state.shorts[p.ticker];const tx=state.derivativeTransactions.filter(d=>d.ticker===p.ticker&&eventSeq(d)>p.startSeq&&['SHORT','COVER','FORCED_COVER'].includes(d.action));p.pnl=round(tx.reduce((a,d)=>a+(d.action==='SHORT'?1:-1)*d.qty*d.price-d.fee,0)-(exists?state.shorts[p.ticker].qty*quote(state.stocks[p.ticker],'buy')+fee(state.shorts[p.ticker].qty,quote(state.stocks[p.ticker],'buy')):0)+state.ledger.filter(l=>l.type==='BORROW_FEE'&&eventSeq(l)>p.startSeq&&l.description.includes(p.ticker)).reduce((a,l)=>a+l.amount,0))}
 p.reviewedDay=state.day;
 if(!exists){p.status='closed';p.closedDay=state.day;p.reviewPending=!daily;p.reviewedDay=daily?state.day:null;p.review=(p.budgetBreached?'超出預算；':'預算合規；')+'持倉已平倉或到期。投資結果 '+money(p.pnl)+'，與執行紀律分開評估。';continue}
 const base=Math.max(.01,p.usedBudget),reason=p.pnl/base>=p.takeProfit?'止盈提醒':p.pnl/base<=-p.stopLoss?'止蝕提醒':state.day-p.openedDay>=p.holdDays?'持有期限到期':null;
 if(reason&&!p.trigger)p.trigger={day:state.day,reason};p.review=p.budgetBreached?'累計投入超出預算；請檢視。':p.trigger?p.trigger.reason+'已觸發，等待玩家決定。':'預算合規；尚未觸發退出條件。';
 }}
function evaluateCareerDay(){const c=ensureCareer();if(c.evaluatedDay>=state.day)return false;evaluatePlans(true);
 for(const m of c.missions){if(m.status!=='active')continue;const def=MISSION_CATALOG[m.key];if(state.day>m.dueDay){m.status='expired';m.review='限期已過，可重新接取。';continue}
 if(def.category==='risk'){const threshold=m.key==='buffer8'?.3:.2,good=equity()>0&&availableRaw()>=Math.max(0,equity()*threshold)&&(m.key!=='buffer8'||accountRisk().drawdown<=.2);m.progress=good?(m.lastDay===state.day-1?m.progress:0)+1:0;m.review=good?'本日資金緩衝達標。':'本日未達標，連續日數重計。'}
 else {const qualifying=c.plans.filter(p=>p.createdDay>=m.acceptedDay&&p.startSeq>m.startSeq&&p.openedDay!==null&&!p.budgetBreached&&p.reviewedDay===state.day);
 const found=qualifying.find(p=>def.category==='execution'?p.instrument==='stock'&&p.orderId&&state.orders.some(o=>o.id===p.orderId&&o.type==='limit'&&o.status==='filled')&&(m.key!=='limitReview'||p.status==='closed'):p.instrument==='option'&&p.status==='closed'&&p.equityAtOpen>0&&p.riskAtOpen<=p.equityAtOpen*(m.key==='verticalSmall'?.08:.15)+.005&&state.derivativeTransactions.some(d=>d.groupId===p.groupId&&d.action==='STRATEGY_OPEN'&&d.legs?.length===2));m.progress=found?1:0;m.review=found?'計劃及成交紀錄符合條件；投資損益不影響紀律評核。':'等候接任後的新計劃與相符成交／結束復盤。'}
 m.lastDay=state.day;if(m.progress>=def.goal){m.status='completed';m.completedDay=state.day;c.xp+=def.xp;m.review+=' 任務完成，獲得 '+def.xp+' XP（沒有現金獎勵）。'}
 }
 c.evaluatedDay=state.day;return true;
}
function careerSnapshot(s=state){const c=ensureCareer(s);return {xp:c.xp,missions:c.missions.map(m=>({...m,title:MISSION_CATALOG[m.key].title,category:MISSION_CATALOG[m.key].category,remaining:Math.max(0,m.dueDay-s.day)})),plans:c.plans.filter(p=>p.status!=='cancelled').slice(-30).map(p=>({id:p.id,ticker:p.ticker,instrument:p.instrument,intent:p.intent,budget:p.budget,usedBudget:p.usedBudget,budgetBreached:p.budgetBreached,status:p.status,reviewPending:p.reviewPending,pnl:p.pnl,trigger:p.trigger,review:p.review}))}}
function validateCareer(c,day,seq){try{
 const integer=x=>Number.isSafeInteger(x)&&x>=0,number=x=>typeof x==='number'&&Number.isFinite(x),text=x=>typeof x==='string'&&x.length<=2000;
 if(!c||!integer(c.startedDay)||c.startedDay>day||!integer(c.evaluatedDay)||c.evaluatedDay>day||!integer(c.xp)||!Array.isArray(c.missions)||c.missions.length>6||!Array.isArray(c.plans)||c.plans.length>100)return false;
 if(new Set(c.missions.map(m=>m.key)).size!==c.missions.length||c.missions.filter(m=>m.status==='active').length>2)return false;
 for(const m of c.missions){const d=MISSION_CATALOG[m.key];if(!d||!['active','completed','abandoned','expired'].includes(m.status)||!integer(m.acceptedDay)||m.acceptedDay>day||m.dueDay!==m.acceptedDay+d.days||!integer(m.startSeq)||m.startSeq>seq||!integer(m.progress)||m.progress>d.goal||!text(m.review)||!integer(m.lastDay)||m.lastDay>day||(m.completedDay!==null&&(!integer(m.completedDay)||m.completedDay>day))||m.status==='completed'&&(m.progress<d.goal||m.completedDay===null))return false}
 if(c.xp!==c.missions.filter(m=>m.status==='completed').reduce((a,m)=>a+MISSION_CATALOG[m.key].xp,0)||new Set(c.plans.map(p=>p.id)).size!==c.plans.length||c.plans.filter(p=>['draft','open'].includes(p.status)).length>12)return false;
 for(const p of c.plans){if(!validId(p.id)||!SYMBOLS.some(t=>t[0]===p.ticker)||!['stock','short','option'].includes(p.instrument)||!text(p.intent)||p.intent.length>200||!['draft','open','closed','cancelled'].includes(p.status)||!['budget','usedBudget','riskAtOpen','equityAtOpen','pnl','takeProfit','stopLoss'].every(k=>number(p[k]))||p.budget<=0||p.budget>1e12||p.usedBudget<0||p.riskAtOpen<0||p.takeProfit<=0||p.takeProfit>10||p.stopLoss<=0||p.stopLoss>10||typeof p.reviewPending!=='boolean'||typeof p.budgetBreached!=='boolean'||p.budgetBreached!==(p.usedBudget>p.budget+.005)||!integer(p.holdDays)||p.holdDays<1||p.holdDays>90||!integer(p.createdDay)||p.createdDay>day||!integer(p.startSeq)||p.startSeq>seq||!text(p.review))return false;
 if(!['openedDay','closedDay','reviewedDay'].every(k=>p[k]===null||integer(p[k])&&p[k]>=p.createdDay&&p[k]<=day)||p.groupId!==null&&!validId(p.groupId)||p.orderId!==null&&!validId(p.orderId)||p.trigger!==null&&(!integer(p.trigger.day)||p.trigger.day>day||!['止盈提醒','止蝕提醒','持有期限到期'].includes(p.trigger.reason)))return false;
 if(['open','closed'].includes(p.status)&&(p.openedDay===null||p.instrument==='option'&&p.groupId===null)||p.status==='closed'&&(p.closedDay===null||p.reviewedDay===null&&!p.reviewPending))return false;
 }
 return c.activePlanId===null||c.plans.some(p=>p.id===c.activePlanId&&p.status==='draft');
 }catch{return false}}
function validateRiskSnapshot(r){try{const n=x=>typeof x==='number'&&Number.isFinite(x);return r&&['equity','score','drawdown','recentDrawdown','recentDays','total','largest'].every(k=>n(r[k]))&&r.score>=0&&r.score<=100&&r.drawdown>=0&&r.recentDrawdown>=0&&Number.isSafeInteger(r.recentDays)&&r.recentDays>=0&&r.recentDays<=20&&(r.ratio===null||n(r.ratio)&&r.ratio>=0)&&typeof r.unbounded==='boolean'&&Array.isArray(r.byTicker)&&r.byTicker.length<=15&&r.byTicker.every(v=>SYMBOLS.some(s=>s[0]===v.ticker)&&n(v.amount)&&v.amount>=0)&&Array.isArray(r.scenarios)&&r.scenarios.length===2&&r.scenarios.every((v,i)=>v.shock===[-.1,.1][i]&&n(v.pnl)&&n(v.equity))}catch{return false}}
function validateDecisionSnapshot(d,day){try{const n=x=>typeof x==='number'&&Number.isFinite(x),text=x=>typeof x==='string'&&x.length<=2000;return d&&Number.isSafeInteger(d.xp)&&d.xp>=0&&Array.isArray(d.missions)&&d.missions.length<=6&&d.missions.every(m=>MISSION_CATALOG[m.key]&&m.title===MISSION_CATALOG[m.key].title&&m.category===MISSION_CATALOG[m.key].category&&['active','completed','expired','abandoned'].includes(m.status)&&Number.isSafeInteger(m.progress)&&m.progress>=0&&m.progress<=MISSION_CATALOG[m.key].goal&&Number.isSafeInteger(m.remaining)&&m.remaining>=0&&text(m.review))&&Array.isArray(d.plans)&&d.plans.length<=30&&d.plans.every(p=>validId(p.id)&&SYMBOLS.some(s=>s[0]===p.ticker)&&['stock','short','option'].includes(p.instrument)&&text(p.intent)&&text(p.review)&&['draft','open','closed'].includes(p.status)&&['budget','usedBudget','pnl'].every(k=>n(p[k]))&&p.budget>0&&p.usedBudget>=0&&typeof p.budgetBreached==='boolean'&&(p.trigger===null||Number.isSafeInteger(p.trigger.day)&&p.trigger.day<=day&&['止盈提醒','止蝕提醒','持有期限到期'].includes(p.trigger.reason)))}catch{return false}}
