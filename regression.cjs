const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..');
const ctx=vm.createContext({console,Math,Date,Number,Object,Array,JSON,window:{},document:{getElementById:()=>({textContent:'',classList:{remove(){},add(){}}})},setTimeout:()=>0,clearTimeout:()=>0});
for(const file of ['core','trading','market','storage'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),ctx,{filename:file});
const go=s=>vm.runInContext(s,ctx);
function test(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
test('initial portfolio and 15 companies',()=>{assert.equal(go('equity()'),10000);assert.equal(go('Object.keys(state.stocks).length'),15)});
test('buy debits cash, adds position',()=>{assert(go("trade('NVXT','buy',10).ok"));assert.equal(go('state.positions.NVXT.qty'),10);assert(go('state.cash<10000'));assert(go('equity()<10000'))});
test('reject short without permission',()=>{assert.equal(go("trade('NVXT','sell',11).ok"),false)});
test('sell updates holdings and realised P&L',()=>{assert(go("trade('NVXT','sell',5).ok"));assert.equal(go('state.positions.NVXT.qty'),5);assert.equal(go('state.transactions.length'),2);assert(Number.isFinite(go('state.transactions[1].realized')))});
test('reject unaffordable purchase',()=>{assert.equal(go("trade('NVXT','buy',999999).ok"),false)});
test('replay deterministic RNG',()=>{go('state=initial(9123)');const a=go('Array.from({length:35},()=>{advanceDay();return state.stocks.NVXT.price})');go('state=initial(9123)');const b=go('Array.from({length:35},()=>{advanceDay();return state.stocks.NVXT.price})');assert.deepEqual(Array.from(a),Array.from(b))});
test('400 days maintain positive finite prices',()=>{go('state=initial(2027);for(let i=0;i<400;i++)advanceDay()');assert.equal(go('state.day'),400);assert(go('Object.values(state.stocks).every(st=>st.price>0&&Number.isFinite(st.price))'))});
test('v1 save format remains compatible',()=>{assert(go('validate(initial())'));assert.equal(go('state.version'),1)});
