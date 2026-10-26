'use strict';
let saveBlocked=false,storageWarning='';
function saveData(){return JSON.stringify(state)}
function validId(x){return typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x)}
function finite(x){return typeof x==='number'&&Number.isFinite(x)}
function positiveQty(x){return Number.isSafeInteger(x)&&x>0&&x<=1e9}
function validate(s){
 try {
  const tickers=SYMBOLS.map(x=>x[0]),known=t=>tickers.includes(t),nonnegative=x=>finite(x)&&x>=0;
  if(!s||![1,2,3,4,5].includes(s.version)||!Number.isSafeInteger(s.day)||s.day<0||!finite(s.cash)||!Number.isSafeInteger(s.rng)||!Number.isSafeInteger(s.seq)||s.seq<0||!Number.isSafeInteger(s.level)||s.level<1||s.level>4||!s.stocks||Object.keys(s.stocks).length!==15||!s.positions)return false;
  if(!['orders','transactions','history','news'].every(k=>Array.isArray(s[k]))||!Array.isArray(s.completed)||!Array.isArray(s.unlocks))return false;
  if(!tickers.every(t=>{const st=s.stocks[t];return st&&st.ticker===t&&finite(st.price)&&st.price>0&&finite(st.vol)&&st.vol>0&&['anchor','start','prior','baseGrowth','beta','eps','revenue','debt','quality','momentum'].every(k=>finite(st[k]))&&Array.isArray(st.historical)&&st.historical.length&&st.historical.every(h=>['day','open','high','low','close','volume'].every(k=>finite(h[k]))) }))return false;
  if(!Object.entries(s.positions).every(([t,p])=>known(t)&&p&&positiveQty(p.qty)&&nonnegative(p.cost)))return false;
  if(s.shorts&&!Object.entries(s.shorts).every(([t,p])=>known(t)&&p&&positiveQty(p.qty)&&nonnegative(p.cost)&&nonnegative(p.proceeds)&&!s.positions[t]))return false;
  if(!s.orders.every(o=>o&&validId(o.id)&&known(o.ticker)&&['buy','sell'].includes(o.side)&&['limit','stop'].includes(o.type)&&['open','filled','rejected','cancelled'].includes(o.status)&&positiveQty(o.qty)&&finite(o.limit)&&o.limit>0&&nonnegative(o.reserved)))return false;
  if(!s.transactions.every(t=>t&&validId(t.id)&&known(t.ticker)&&positiveQty(t.qty)&&['buy','sell'].includes(t.side)&&['price','fee','realized'].every(k=>finite(t[k]))))return false;
  if(!s.history.length||!s.history.every(h=>Number.isSafeInteger(h.day)&&h.day>=0&&finite(h.equity))||!s.news.every(n=>Number.isSafeInteger(n.day)&&typeof n.title==='string'&&typeof n.body==='string'))return false;
  if(s.ledger&&!Array.isArray(s.ledger))return false;
  if(s.derivativeTransactions&&(!Array.isArray(s.derivativeTransactions)||!s.derivativeTransactions.every(d=>d&&validId(d.id)&&known(d.ticker)&&typeof d.action==='string'&&['qty','price','fee','realized'].every(k=>finite(d[k])))))return false;
  const opts=s.options||[];if(!Array.isArray(opts)||!opts.every(o=>o&&validId(o.id)&&known(o.ticker)&&['call','put'].includes(o.kind)&&positiveQty(o.qty)&&finite(o.strike)&&o.strike>0&&Number.isSafeInteger(o.expiry)&&o.expiry>=0&&nonnegative(o.entry)&&(s.version<3?(o.side===undefined||o.side===1):[1,-1].includes(o.side)&&validId(o.groupId)&&nonnegative(o.entryFee))))return false;
  if(new Set(opts.map(o=>o.id)).size!==opts.length)return false;
  if(s.version<3)return true;
  if(!Array.isArray(s.optionGroups)||new Set(s.optionGroups.map(g=>g.id)).size!==s.optionGroups.length)return false;
  if(!opts.every(o=>s.optionGroups.some(g=>g.id===o.groupId)))return false;
  const shareLocks={},shortLocks={};
  for(const g of s.optionGroups){
    const def=STRATEGIES[g.strategy],legs=opts.filter(o=>o.groupId===g.id);
    if(!validId(g.id)||!def||!positiveQty(g.qty)||!known(g.ticker)||!Number.isSafeInteger(g.expiry)||legs.length!==def.legs.length||!legs.every(o=>o.ticker===g.ticker&&o.expiry===g.expiry&&o.qty===g.qty&&o.kind===def.kind))return false;
    const sorted=[...legs].sort((a,b)=>a.strike-b.strike);
    if(!sorted.every((o,i)=>o.side===def.legs[i][0])||(legs.length===2&&sorted[0].strike>=sorted[1].strike))return false;
    if(def.protection==='shares')shareLocks[g.ticker]=(shareLocks[g.ticker]||0)+g.qty*100;
    if(def.protection==='shorts')shortLocks[g.ticker]=(shortLocks[g.ticker]||0)+g.qty*100;
  }
  if(!Object.entries(shareLocks).every(([t,n])=>n<=(s.positions[t]?.qty||0))||!Object.entries(shortLocks).every(([t,n])=>n<=(s.shorts[t]?.qty||0)))return false;
  for(const t of tickers){if((shareLocks[t]||0)+s.orders.filter(o=>o.status==='open'&&o.side==='sell'&&o.ticker===t).reduce((a,o)=>a+o.qty,0)>(s.positions[t]?.qty||0))return false}
  if(s.version>=4&&!validateSecretary(s.secretary,s.day,s.seq))return false;
  if(s.version===5&&!validateCareer(s.career,s.day,s.seq))return false;
  return true;
 } catch {return false}
}
function migrate(input){
 const s=JSON.parse(JSON.stringify(input)),legacy=s.version<3;
 s.shorts ||= {};s.options ||= [];s.derivativeTransactions ||= [];s.ledger ||= [];s.optionGroups ||= [];
 if(legacy){s.optionGroups=[];for(const o of s.options){o.side=1;o.entryFee=1;o.groupId='MIG-'+o.id;s.optionGroups.push({id:o.groupId,strategy:'long_'+o.kind,ticker:o.ticker,expiry:o.expiry,qty:o.qty,openedDay:s.day})}}
 s.tutorial = s.tutorial&&['new','active','skipped','completed'].includes(s.tutorial.status)&&Number.isSafeInteger(s.tutorial.step)&&s.tutorial.step>=0&&s.tutorial.step<=8?s.tutorial:{status:'new',step:0};
 s.lastBorrowDay=Number.isSafeInteger(s.lastBorrowDay)?s.lastBorrowDay:s.day;
 if(s.version<4||!s.secretary)s.secretary=newSecretary(closingBaseline(snapshotAccount(s)));
 for(const r of s.secretary.reports)if(typeof r.read!=='boolean')r.read=r.day<=s.secretary.readThrough;
 if(s.version<5||!s.career)s.career=newCareer(s.day);
 s.version=5;s.gameVersion='2.5.0';return s;
}
async function openDB(){
 if(!window.indexedDB)return null;
 return new Promise(res=>{try{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('saves'))req.result.createObjectStore('saves')};req.onsuccess=()=>res(req.result);req.onerror=()=>res(null);req.onblocked=()=>res(null)}catch{res(null)}});
}
function persist(){
 if(typeof tutorialSession!=='undefined'&&tutorialSession)return Promise.resolve(true);
 const snapshot=saveData();
 const job=saveQueue.then(async()=>{
  if(saveBlocked)return false;
  try{
   if(db)await new Promise((res,rej)=>{const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(snapshot,'main');tx.oncomplete=res;tx.onabort=()=>rej(tx.error||Error('transaction aborted'));tx.onerror=()=>rej(tx.error)});
   else localStorage.setItem(STORAGE,snapshot);
   storageWarning='';return true;
  }catch(e){console.error(e);storageWarning='存檔失敗；請匯出 JSON 備份。';toast(storageWarning);return false}
 });
 saveQueue=job.catch(()=>false);return job;
}
async function loadSave(){
 try{
  let val=null;
  if(db)val=await new Promise((res,rej)=>{const tx=db.transaction('saves','readonly'),req=tx.objectStore('saves').get('main');req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});
  // Retain the old keys and import a localStorage fallback when IndexedDB is newly available.
  if(!val)val=localStorage.getItem(STORAGE);
  if(val){const parsed=JSON.parse(val);if(!validate(parsed))throw Error('存檔格式不完整或版本不兼容');const next=migrate(parsed);if(!validate(next))throw Error('遷移後存檔驗證失敗');state=next;return true}
 }catch(e){saveBlocked=true;storageWarning='無法讀取舊存檔，已停止自動覆寫。請先匯出原始備份，再匯入有效存檔或重新開始。';console.warn('load error',e)}
 return false;
}
function download(){
 const blob=new Blob([saveData()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`stock-tycoon-v2.5.0-day-${state.day}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已啟動 JSON 備份下載，請保留下載檔案');return true;
}
async function resetCareer({confirmed=false,exportBackup=false,seed=Date.now()>>>0}={}){
 if(!confirmed)return fail('已取消重新開始');
 if(typeof tutorialSession!=='undefined'&&tutorialSession)return fail('請先退出教學，再重新開始');
 setSpeed(0);await saveQueue;
 const previous=state,blocked=saveBlocked;
 if(exportBackup){try{if(saveBlocked)return fail('舊存檔未成功讀取，請先使用「匯出原始備份」');if(download()===false)return fail('備份未啟動，已取消重啟')}catch(e){return fail('無法匯出備份，已取消重啟：'+e.message)}}
 state=initial(seed||1);saveBlocked=false;
 if(!await persist()){state=previous;saveBlocked=blocked;render();return fail('新生涯未能儲存，已保留目前帳戶')}
 selectedReportDay=null;briefPage=0;holdingsPanelOpen=false;view='home';ticker='NVXT';derivativeTicker='NVXT';optionKind='call';optionDte=30;optionStrike=0;selectedStrategy='bull_call';strategyLow=0;strategyHigh=0;strategyQty=1;chartRange=30;orderSide='buy';orderType='market';pnlIVShift=0;pnlDaysAhead=0;
 render();return {ok:true,msg:'新生涯已開始：$10,000 · Day 0'};
}
async function downloadRawSave(){
 try{let raw;if(db)raw=await new Promise((res,rej)=>{const req=db.transaction('saves','readonly').objectStore('saves').get('main');req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});if(!raw)raw=localStorage.getItem(STORAGE);if(!raw)throw Error('找不到原始存檔');const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='stock-tycoon-original-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已啟動原始存檔下載')}catch(e){toast('備份失敗：'+e.message)}
}
