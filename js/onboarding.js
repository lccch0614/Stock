'use strict';
let tutorialSession=null,resetInProgress=false;
const LESSONS=[
 {title:'買入你的第一隻股票',body:'股票代表公司的一部分。買入會扣除成交價及交易費；淨值則包括現金與股票市值。先用 5 股 NVXT 練習，檢查成本後確認買入。',action:'前往買入股票',view:'trade',event:'stock-buy'},
 {title:'賣出與實現損益',body:'股價變化造成未實現損益。賣出才會記錄實現損益，並支付賣出費。限價單可能不成交；止蝕賣單遇到跳空亦可能在更低價格成交。把剛才的股票賣出至少 1 股。',action:'前往賣出股票',view:'trade',event:'stock-sell'},
 {title:'沽空：先賣後買',body:'沽空希望價格下跌。賣出所得會被鎖定，另需 50% 初始保證金，每天收取借股費。股價上升可能造成無上限損失。練習沽空 1 股 AURB。',action:'前往沽空',view:'advanced',event:'short-open'},
 {title:'回補及維持保證金',body:'買入回補才能結束沽空。當淨值低於沽空負債的 30%，系統會強制回補；急升仍可能令現金變負。現在用同一張表格回補 AURB。',action:'前往回補',view:'advanced',event:'short-cover'},
 {title:'Call、Put 與時間價值',body:'Call 是看升的買權；Put 是看跌的賣權。每張代表 100 股：報價 $2 即權利金 $200，另有費用。行使價 K、到期日 DTE、波動率 IV 都會影響價格。多倉按 Ask 買入、Bid 平倉。用期權鏈選擇 AURB 的 Call 並買入 1 張。',action:'前往買入 Call',view:'advanced',event:'option-open'},
 {title:'風險小測驗',body:'Delta 衡量價格敏感度；Gamma 是 Delta 的變化率；Theta 是每交易日時間損耗；Vega 是 IV 上升 1 百分點的敏感度。長倉期權可損失全部權利金；賣出期權必須有抵押。哪一項仍可能出現無上限損失？',quiz:true},
 {title:'四種價差與保護型賣出',body:'牛市 Call：買低 K、賣高 K；熊市 Put：買高 K、賣低 K，均為淨支出。牛市 Put：賣高 K、買低 K；熊市 Call：賣低 K、買高 K，均為淨收入。兩腿同股、同到期、等量成交，最大到期損失受限制。備兌 Call 鎖股票；現金擔保 Put 鎖 K × 100 現金。請選四種價差之一開倉，查看淨收入／支出及抵押。',action:'前往建立價差',view:'advanced',event:'strategy'},
 {title:'整組平倉及畢業',body:'價差不得逐腿拆開，以免留下裸賣風險。整組 P&L 與 Greeks 會把所有買賣腿相加；空腿使用負號，按 Ask 估計負債。到期損益圖包含開倉費，提早平倉另收每腿每張 $1。請在持倉區把剛才的價差整組平倉。',action:'前往整組平倉',view:'advanced',event:'close'}
];
function tutorialBanner(){return !tutorialSession&&['new','active'].includes(state.tutorial.status)?`<div class="card welcome"><div><h2>從第一筆交易開始 · 新手互動教學</h2><p class="muted">8 個實作步驟，學習股票、沽空、期權與價差。使用獨立練習帳戶。</p></div><div class="action-set"><button class="primary" id="tutorial-start">開始練習</button><button id="tutorial-dismiss">稍後再學</button></div></div>`:''}
async function startTutorial(){
 if(tutorialSession){view='tutorial';render();return}
 setSpeed(0);await saveQueue;
 state.tutorial={status:'active',step:0};await persist();
 selectedReportDay=null;briefPage=0;holdingsPanelOpen=false;
 tutorialSession={career:state,view,ticker,derivativeTicker,optionKind,optionDte,optionStrike,selectedStrategy,strategyLow,strategyHigh,strategyQty};
 state=migrate(initial(2300));state.tutorial={status:'active',step:0};
 ticker='NVXT';derivativeTicker='AURB';optionKind='call';optionDte=30;optionStrike=55;selectedStrategy='bull_call';strategyLow=50;strategyHigh=60;strategyQty=1;
 view='tutorial';render();
}
async function exitTutorial(){
 if(!tutorialSession)return;
 setSpeed(0);const step=state.tutorial.step,finished=step>=LESSONS.length,session=tutorialSession;
 selectedReportDay=null;briefPage=0;holdingsPanelOpen=false;state=session.career;state.tutorial={status:finished?'completed':'skipped',step};tutorialSession=null;
 for(const key of ['view','ticker','derivativeTicker','optionKind','optionDte','optionStrike','selectedStrategy','strategyLow','strategyHigh','strategyQty']){
  if(key==='view')view=session[key];if(key==='ticker')ticker=session[key];if(key==='derivativeTicker')derivativeTicker=session[key];if(key==='optionKind')optionKind=session[key];if(key==='optionDte')optionDte=session[key];if(key==='optionStrike')optionStrike=session[key];if(key==='selectedStrategy')selectedStrategy=session[key];if(key==='strategyLow')strategyLow=session[key];if(key==='strategyHigh')strategyHigh=session[key];if(key==='strategyQty')strategyQty=session[key];
 }
 await persist();render();toast(finished?'教學完成，已返回生涯帳戶':'已退出練習，返回生涯帳戶');
}
function tutorialObserve(event,strategy){
 if(!tutorialSession)return;
 const step=state.tutorial.step,lesson=LESSONS[step];if(!lesson||lesson.event!==event)return;
 if((event==='strategy'||event==='close')&&!['bull_call','bear_put','bull_put','bear_call'].includes(strategy))return;
 state.tutorial.step++;view='tutorial';render();toast('練習完成，前往下一步');
}
function tutorialView(){
 if(!tutorialSession)return `<div class="card lesson"><span class="pill">BEGINNER ACADEMY · 8 STEPS</span><h2>把概念變成一次交易</h2><p class="muted">在獨立練習帳戶完成買賣、沽空、買入期權、風險小測驗，以及建立和平倉價差。你可隨時退出；生涯帳戶的資產及交易紀錄會保留。</p><ol>${LESSONS.map(l=>`<li>${l.title}</li>`).join('')}</ol><button class="primary" id="tutorial-start">開始練習</button><p class="muted">本遊戲為簡化模型：虛構價格、歐式現金結算、沒有提早行使。教學可隨時重玩。</p></div>`;
 const step=state.tutorial.step,l=LESSONS[step];
 if(!l)return `<div class="card lesson"><span class="pill">8 / 8 · COMPLETE</span><h2>完成新手教學</h2><p>你已練習買入與賣出股票、沽空與回補、Call、風險辨識和原子價差開平倉。</p><p class="muted">練習帳戶的交易不會帶入生涯。接下來可以用 $10,000 生涯資金自行探索，交易前先檢查最大虧損、費用與抵押。</p><button id="tutorial-exit" class="primary">返回生涯帳戶</button></div>`;
 return `<section class="card lesson"><div class="row"><span class="pill">練習帳戶 · STEP ${step+1} / ${LESSONS.length}</span><button id="tutorial-exit">退出教學</button></div>${bar(step/LESSONS.length*100)}<h2>${l.title}</h2><p>${l.body}</p>${l.quiz?`<div class="quiz"><button data-quiz="wrong">買入一張 Call</button><button data-quiz="right">股票沽空（包括 Covered Put 的沽空腿）</button><button data-quiz="wrong">完整的牛市 Call 價差</button><p id="quiz-feedback" role="status"></p></div>`:`<button class="primary" id="tutorial-go">${l.action} →</button>`}<p class="muted">完成實際成交後才會前進。你也可以查看行情、推進交易日，以及嘗試其他交易。</p></section>`;
}
function renderTutorialDock(){
 const existing=document.getElementById('tutorial-dock');if(existing)existing.remove();
 if(!tutorialSession||view==='tutorial')return;
 const lesson=LESSONS[state.tutorial.step],el=document.createElement('section');el.id='tutorial-dock';el.className='tutorial-dock';
 el.innerHTML=`<b>練習帳戶 · ${lesson?`${state.tutorial.step+1}/8 ${lesson.title}`:'已完成'}</b><p>${lesson?lesson.body:'按「返回教學」結束練習並回到生涯。'}</p><div class="action-set"><button data-nav="tutorial">返回教學</button><button id="tutorial-exit">退出練習</button></div>`;document.getElementById('content').prepend(el);
}
function tutorialGo(){
 const l=LESSONS[state.tutorial.step];if(!l||!l.view)return;
 if(state.tutorial.step===0){ticker='NVXT';orderSide='buy';orderType='market'}
 if(state.tutorial.step===1){ticker='NVXT';orderSide='sell';orderType='market'}
 if(state.tutorial.step>=2){derivativeTicker='AURB';optionStrike=55}
 view=l.view;render();
 if(state.tutorial.step===0){document.getElementById('quantity').value=5;updatePreview()}
 if(state.tutorial.step>=6)document.getElementById(state.tutorial.step===6?'strategy-builder':'options-portfolio')?.scrollIntoView({block:'start',behavior:'smooth'});
}
function showResetDialog(){
 if(tutorialSession){toast('請先退出練習帳戶');return}
 setSpeed(0);
 document.getElementById('dialog-host').innerHTML=`<dialog id="reset-dialog" aria-labelledby="reset-title"><h2 id="reset-title">確認重新開始生涯？</h2><p>目前現金、持倉、掛單、交易紀錄及生涯進度會全部重設為 Day 0、$10,000。</p><p class="muted">此操作無法復原；保留 JSON 備份後可重新匯入舊生涯。</p><label class="check"><input type="checkbox" id="reset-backup" ${saveBlocked?'':'checked'}> 先匯出目前存檔（請保留下載檔案）</label><div class="action-set"><button id="reset-cancel" autofocus>取消</button><button class="sell" id="reset-accept">確認重新開始</button></div></dialog>`;
 document.getElementById('reset-dialog').showModal();
}
async function handleResetAccept(target){
 if(resetInProgress)return;resetInProgress=true;target.disabled=true;
 try{const r=await resetCareer({confirmed:true,exportBackup:document.getElementById('reset-backup').checked});toast(r.msg);if(r.ok)document.getElementById('reset-dialog')?.close()}finally{resetInProgress=false;target.disabled=false}
}
