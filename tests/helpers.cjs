const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function setup(seed=20271025){const local=new Map(),c=vm.createContext({console,Math,Date,Number,Object,Array,JSON,Blob,URL,window:{},document:{getElementById:()=>({textContent:'',classList:{add(){},remove(){}},close(){},scrollIntoView(){}})},setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},localStorage:{setItem:(k,v)=>local.set(k,v),getItem:k=>local.get(k)||null}});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const [,src] of html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)){if(src.includes('bootstrap'))continue;vm.runInContext(fs.readFileSync(path.join(root,src),'utf8'),c,{filename:src})}const g=s=>vm.runInContext(s,c);g(`state=migrate(initial(${seed}));render=()=>{}`);return {c,g,local}}
module.exports={setup,root};
