const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const context=vm.createContext({console,Math,Date,Number,Object,Array,JSON,setTimeout:()=>0,clearTimeout:()=>0,document:{getElementById:()=>({textContent:'',classList:{add(){},remove(){}}})},window:{}});
const root=path.join(__dirname,'..');for(const name of ['core','trading','market','options-pricing','options-market','derivatives','options-strategies','career-system','secretary','storage'])vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),context,{filename:name});
const g=s=>vm.runInContext(s,context);let passed=0;
function test(label,fn){try{g('state=migrate(initial(2345))');fn();passed++;console.log('PASS',label)}catch(e){console.error('FAIL',label,e);process.exitCode=1}}
const close=(a,b,tol=.02)=>assert.ok(Math.abs(a-b)<tol,`${a} vs ${b}`);
test('call-put parity, positive annual rate',()=>{const C=g("optionMetrics(100,105,30,'call',.3).price"),P=g("optionMetrics(100,105,30,'put',.3).price");close(C-P,100-105*Math.exp(-.025*30/252),.0001)});
test('delta bounds and signs',()=>{assert.ok(g("optionMetrics(100,100,30,'call',.3).delta")>0);assert.ok(g("optionMetrics(100,100,30,'put',.3).delta")<0)});
test('gamma and vega nonnegative',()=>{assert.ok(g("optionMetrics(100,100,30,'call',.3).gamma")>0);assert.ok(g("optionMetrics(100,100,30,'call',.3).vega")>0)});
test('vega approx 1 percentage point finite diff',()=>{const v=g("optionMetrics(100,100,30,'call',.31).price-optionMetrics(100,100,30,'call',.30).price"),greek=g("optionMetrics(100,100,30,'call',.30).vega");close(v,greek,.003)});
test('expiry intrinsic for both sides',()=>{close(g("optionMetrics(115,100,0,'call',.3).price"),15,.0001);close(g("optionMetrics(85,100,0,'put',.3).price"),15,.0001)});
test('chain consistent and bid <= ask',()=>{assert.equal(g("optionsChain('NVXT',30).length"),11);assert.ok(g("optionsChain('NVXT',30).every(r=>r.call.bid<=r.call.ask&&r.put.bid<=r.put.ask)"))});
test('market IV responds to state and term',()=>{const a=g("optionQuote('NVXT','call',130,state.day+30).iv");g("state.market='熊市'");const b=g("optionQuote('NVXT','call',130,state.day+30).iv");assert.ok(b>a)});
test('open uses ask, close uses bid',()=>{const ask=g("optionQuote('NVXT','call',130,30).ask");assert.ok(g("optionOpen('NVXT','call',130,30,1).ok"));close(g('state.options[0].entry'),ask,.00001);const bid=g("optionQuote('NVXT','call',130,30).bid");assert.ok(g('optionClose(state.options[0].id,1).ok'));close(g('state.derivativeTransactions.at(-1).price'),bid,.00001)});
test('existing stocks and shorts still work',()=>{assert.ok(g("trade('MEDX','buy',2).ok"));assert.ok(g("shortOpen('AURB',2).ok"));assert.ok(g('Number.isFinite(equity())'))});
test('expiry idempotent and state financials finite',()=>{assert.ok(g("optionOpen('NVXT','put',130,7,1).ok"));g('state.day=7;settleDerivatives()');const cash=g('state.cash');g('settleDerivatives()');close(g('state.cash'),cash,.00001);assert.ok(g('Number.isFinite(equity())'))});
console.log(`${passed}/10 V2.2 tests passed`);if(passed!==10)process.exitCode=1;
