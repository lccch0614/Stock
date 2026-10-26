'use strict';
const {setup,root}=require('../tests/helpers.cjs'),{POLICY,chooseEntry}=require('./policy-public.cjs'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const out=process.env.PLAYTHROUGH_OUTPUT?path.resolve(process.env.PLAYTHROUGH_OUTPUT):path.join(__dirname,'result');if(fs.existsSync(out))throw Error('A recorded run already exists; use a clean copy for an explicit replay. Never overwrite a trial to select a winner.');fs.mkdirSync(out);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const manifest={recordedAt:new Date().toISOString(),engineVersion:'2.5.0',seed:20271025,initialCash:10000,policy:POLICY,policySHA256:hash(path.join(__dirname,'policy-public.cjs')),runnerSHA256:hash(__filename),engineSHA256:Object.fromEntries(fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')).map(f=>[f,hash(path.join(root,'js',f))])),method:'Single forward-only programmatic playthrough of the actual game engine. Not 60 manually clicked browser days. Fixed default seed; no market re-rolls or future data in policy. Replay only for audit.'};
fs.writeFileSync(path.join(out,'manifest-before-run.json'),JSON.stringify(manifest,null,2));
const {g}=setup(manifest.seed),initial=g('saveData()'),openingPrices=Object.fromEntries(g('snapshotAccount().quotes').map(q=>[q.ticker,q.price])),journal=[],positions=new Map(),actions=[];let achievedDay=null;
fs.writeFileSync(path.join(out,'initial-save.json'),initial);
function snap(){return JSON.parse(g('JSON.stringify(snapshotAccount())'))}
function record(action,result,extra={}){assert.ok(result.ok,result.msg);actions.push({day:g('state.day'),action,result:JSON.parse(JSON.stringify(result)),...extra})}
function close(id,reason){const p=positions.get(id),row=snap().rows.find(r=>r.key===id);if(!row)return;record('CLOSE',g(`strategyClose(${JSON.stringify(id)},${row.qty})`),{ticker:row.ticker,qty:row.qty,reason,pnlEstimate:row.closePnl});positions.delete(id)}
function liquidate(reason){for(const row of snap().rows.filter(r=>r.type==='option'))close(row.key,reason)}
function finishRow(){const s=snap();journal.push({day:s.day,equity:s.equity,cash:s.cash,available:s.available,lockedCash:s.lockedCash,liquidationEquity:s.equity-s.rows.filter(r=>r.type==='option').reduce((a,r)=>a+r.legs.length*r.qty,0),openGroups:s.rows.filter(r=>r.type==='option').map(r=>({id:r.key,ticker:r.ticker,strategy:r.strategy,qty:r.qty,pnl:r.closePnl})),prices:s.quotes.map(q=>({ticker:q.ticker,price:q.price})),riskScore:s.risk.score})}
for(let day=0;day<=POLICY.limit;day++){
 assert.equal(g('state.day'),day);
 let s=snap();for(const id of positions.keys())if(!s.rows.some(r=>r.key===id))positions.delete(id);
 const liquidation=s.equity-s.rows.filter(r=>r.type==='option').reduce((a,r)=>a+r.legs.length*r.qty,0);
 if(liquidation>=POLICY.target){liquidate('Target liquidation equity reached');achievedDay=day;finishRow();break}
 if(day===POLICY.limit){liquidate('Day 60 deadline');finishRow();break}
 for(const row of s.rows.filter(r=>r.type==='option')){const p=positions.get(row.key);if(!p)throw Error('Untracked group');if(row.closePnl>=p.credit*POLICY.profitCapture||row.closePnl<=-p.maxLoss*POLICY.lossFraction)close(row.key,row.closePnl>0?'80% credit captured':'80% planned max loss reached')}
 for(const ticker of POLICY.symbols){
  s=snap();if(s.rows.some(r=>r.ticker===ticker)||s.equity<=0||day>POLICY.limit-POLICY.dte)continue;
  const e=chooseEntry(s,ticker,openingPrices);if(!e)continue;
  const args=[e.strategy,e.ticker,e.low,e.high,e.days];const one=g(`strategyPreview(${args.map(JSON.stringify).join(',')},1)`);if(!one.ok||one.cashFlow<=0||one.capital<=0)continue;
  const budget=Math.max(0,Math.min(s.equity*POLICY.riskPerSymbol,s.available-s.equity*POLICY.cashBuffer)),qty=Math.floor(budget/one.capital);if(qty<1)continue;
  const preview=g(`strategyPreview(${args.map(JSON.stringify).join(',')},${qty})`);assert.ok(preview.ok&&Number.isFinite(preview.maxLoss));
  record('PLAN',g(`createPlan({ticker:${JSON.stringify(ticker)},instrument:'option',budget:${preview.capital},holdDays:7,takeProfit:.5,stopLoss:.8,intent:'固定規則期權挑戰；按公開股價相對開市價選擇完整信用價差'})`),{ticker,budget:preview.capital});
  const r=g(`strategyOpen(${args.map(JSON.stringify).join(',')},${qty})`);record('OPEN',r,{...e,qty,credit:preview.cashFlow,maxLoss:preview.maxLoss,collateral:preview.collateral,quotePrice:s.quotes.find(q=>q.ticker===ticker).price});positions.set(r.id,{credit:preview.cashFlow,maxLoss:preview.maxLoss});
 }
 finishRow();g('advanceDay()');assert.ok(g('validate(state)'),'Save invalid after day '+g('state.day'));
 assert.equal(g('state.transactions.length+Object.keys(state.positions).length+Object.keys(state.shorts).length'),0,'Only options permitted');
}
const final=snap(),finalSave=g('saveData()'),dt=JSON.parse(g('JSON.stringify(state.derivativeTransactions)')),ledger=JSON.parse(g('JSON.stringify(state.ledger)'));
assert.equal(final.rows.length,0);assert.ok(g('validate(state)'));assert.equal(g('state.transactions.length'),0);assert.ok(dt.every(d=>['STRATEGY_OPEN','STRATEGY_CLOSE','OPTION_EXPIRY'].includes(d.action)));assert.ok(ledger.every(l=>['STRATEGY_OPEN','STRATEGY_CLOSE','OPTION_EXPIRY'].includes(l.type)));assert.equal(g('state.career.xp'),0);assert.ok(Math.abs(ledger.reduce((a,l)=>a+l.amount,10000)-final.cash)<.011);
let peak=10000,dd=0;for(const row of journal){peak=Math.max(peak,row.equity);dd=Math.max(dd,(peak-row.equity)/peak)}
const summary={...manifest,finishedAt:new Date().toISOString(),achieved:final.cash>=POLICY.target,achievedDay,finalDay:final.day,finalCash:final.cash,finalEquity:final.equity,returnPct:final.cash/10000-1,maxDailyDrawdown:dd,openingGroups:dt.filter(d=>d.action==='STRATEGY_OPEN').length,closingGroups:dt.filter(d=>d.action==='STRATEGY_CLOSE').length,expiryGroups:dt.filter(d=>d.action==='OPTION_EXPIRY').length,fees:dt.reduce((a,d)=>a+d.fee,0),stockTrades:0,shortStockTrades:0,cashInjections:0,remainingPositions:0,finalSaveSHA256:crypto.createHash('sha256').update(finalSave).digest('hex'),ledgerReconciled:true,notes:['Final liquidation may occur after the latest frozen day-close briefing; those final trades remain in the save ledger and journal.','Maximum daily drawdown uses recorded daily equity including final liquidation, not intraday risk.','No claim of actual Lv.2 promotion: original stock/limit career prerequisites remain. Goal measures account capital only.']};
for(const [file,data] of Object.entries({'summary.json':summary,'journal.json':journal,'actions.json':actions,'derivative-transactions.json':dt,'ledger.json':ledger}))fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2)+'\n');fs.writeFileSync(path.join(out,'final-save.json'),finalSave);
fs.writeFileSync(path.join(out,'daily-equity.csv'),'day,equity,cash,available,lockedCash,liquidationEquity,openGroups\n'+journal.map(r=>[r.day,r.equity,r.cash,r.available,r.lockedCash,r.liquidationEquity,r.openGroups.length].join(',')).join('\n')+'\n');
console.log(JSON.stringify({achieved:summary.achieved,day:final.day,cash:final.cash,returnPct:summary.returnPct,fees:summary.fees,openingGroups:summary.openingGroups,maxDailyDrawdown:dd},null,2));
