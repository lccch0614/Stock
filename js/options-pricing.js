// European cash-settled theoretical options model; per-share Greeks.
const OPTIONS_RATE=.025;
function optPhi(x){return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI)}
function optCdf(x){const sign=x<0?-1:1,z=Math.abs(x)/Math.sqrt(2),t=1/(1+.3275911*z);let erf=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-z*z);return (1+sign*erf)/2}
function optionMetrics(s,k,days,kind,iv,r=OPTIONS_RATE){
 if(!['call','put'].includes(kind)||![s,k,days,iv,r].every(Number.isFinite)||s<=0||k<=0||days<0||iv<0)throw Error('Invalid option model inputs');
 const intrinsic=Math.max(0,kind==='call'?s-k:k-s),T=days/252;
 if(T===0||iv===0){let discounted=k*Math.exp(-r*T),value=T===0?intrinsic:Math.max(0,kind==='call'?s-discounted:discounted-s);return {price:value,delta:kind==='call'?(s>discounted?1:s<discounted?0:.5):(s<discounted?-1:s>discounted?0:-.5),gamma:0,theta:0,vega:0,iv};}
 const v=iv*Math.sqrt(T),d1=(Math.log(s/k)+(r+.5*iv*iv)*T)/v,d2=d1-v;
 const call=kind==='call',price=call?s*optCdf(d1)-k*Math.exp(-r*T)*optCdf(d2):k*Math.exp(-r*T)*optCdf(-d2)-s*optCdf(-d1);
 const delta=call?optCdf(d1):optCdf(d1)-1,gamma=optPhi(d1)/(s*v),vega=s*optPhi(d1)*Math.sqrt(T)*.01;
 const annualTheta=-(s*optPhi(d1)*iv)/(2*Math.sqrt(T))+(call?-1:1)*r*k*Math.exp(-r*T)*optCdf(call?d2:-d2);
 return {price:Math.max(0,price),delta,gamma,theta:annualTheta/252,vega,iv};
}
