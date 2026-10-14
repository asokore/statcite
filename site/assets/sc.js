/* sc.js: motion pause, off-screen pause, section bars, ruler, progress. No network. */
(function(){
"use strict";
var d=document,w=window,R=d.documentElement,C="classList";
var Q=function(s){return [].slice.call(d.querySelectorAll(s));};
var raf=w.requestAnimationFrame?w.requestAnimationFrame.bind(w):function(f){setTimeout(f,16);};
var mq=function(q){return !!w.matchMedia&&w.matchMedia(q).matches;};
var ls=function(v){try{if(v)localStorage.setItem("sc-motion",v);else return localStorage.getItem("sc-motion");}catch(e){return null;}};
var mk=function(t,c,p){var e=d.createElement(t);e.className=c;if(p)p.appendChild(e);return e;};
var at=function(f){return "calc(24px + (100% - 48px) * "+f.toFixed(4)+")";};
var cl=function(v){return Math.min(1,Math.max(0,v));};

/* Motion toggle: #motion is a checkbox (checked = paused) or a button with aria-pressed. */
var M=d.getElementById("motion"),cb=M&&M.type==="checkbox";
function pause(p,save){
R[C].toggle("sc-paused",p);
if(cb)M.checked=p;else if(M)M.setAttribute("aria-pressed",String(p));
if(save)ls(p?"paused":"on");
}
if(M){
var s=ls();
pause(s?s==="paused":cb?M.checked:R[C].contains("sc-paused"));
M.addEventListener(cb?"change":"click",function(){pause(cb?M.checked:M.getAttribute("aria-pressed")!=="true",1);});
}

/* Pause off-screen and in a hidden tab. */
if(w.IntersectionObserver){
var io=new IntersectionObserver(function(es){es.forEach(function(e){e.target[C].toggle("is-offscreen",!e.isIntersecting);});});
Q(".hero,.ticker").forEach(function(el){io.observe(el);});
}
function vis(){R[C].toggle("sc-hidden",d.hidden);}
d.addEventListener("visibilitychange",vis);vis();

if(d.body.dataset.ruler==="off")return;

/* Targets: sections with a bar, else section[id], else h2[id]. */
var T=Q("section[id]").filter(function(s){return s.querySelector(":scope>.sbar");});
if(!T.length)T=Q("section[id]");
if(!T.length)T=Q("h2[id]");
T=T.map(function(el){
var bar=el.querySelector(":scope>.sbar"),h=el.tagName==="H2"?el:el.querySelector("h2,h3");
return {el:el,bar:bar,fam:el.getAttribute("data-fam"),a:0,b:1,lab:el.getAttribute("data-label")||(bar&&bar.getAttribute("data-label"))||
(h?h.textContent.replace(/^\s*\d+\.\s*/,"").trim().slice(0,18):"")};
});

/* Ruler on wide long pages, hairline on narrow ones. Nothing in either is focusable. */
var ru=mk("aside","ruler"),pg=mk("div","progress"),tk=mk("div","ticks",ru),bd=mk("div","bands",ru);
ru.setAttribute("aria-hidden","true");pg.setAttribute("aria-hidden","true");
for(var k=0;k<=50;k++){
var t=mk("i",k%5?"":"major",tk);t.style.top=at(k/50);
if(k%5===0)t.setAttribute("data-v",String(k*2));
}
/* Needle text: data-t via ::after, out of innerText */
var nd=mk("div","needle",ru),pc=mk("span","pct",nd),lb=mk("span","label",nd);
var put=function(e,v){e.dataset.t=v;};
var built,max=1,wide,cur=null,qd,nh=44;
T.forEach(function(o){
o.band=mk("span","band",bd);
if(o.fam)o.band.setAttribute("data-fam",o.fam);
o.band.addEventListener("mouseenter",function(){put(lb,o.lab);});
o.band.addEventListener("mouseleave",function(){put(lb,cur?cur.lab:"");});
});
ru.addEventListener("click",function(ev){
var o=T.filter(function(x){return x.band===ev.target;})[0],be=mq("(prefers-reduced-motion: no-preference)")?"smooth":"auto",r;
if(o){
o.el.scrollIntoView({behavior:be,block:"start"});
try{history.replaceState(null,"","#"+o.el.id);}catch(e){/* no history */}
}else{
r=ru.getBoundingClientRect();
w.scrollTo({top:cl((ev.clientY-r.top-24)/(r.height-48))*max,behavior:be});
}
});

function layout(){
var se=d.scrollingElement||R,ih=w.innerHeight,sy=w.pageYOffset,sh=se.scrollHeight;
var f=function(y){return cl((y-56)/max);};
max=Math.max(1,sh-ih);
wide=mq("(min-width: 1160px)")&&sh>=1.5*ih;
if(!built){d.body.appendChild(ru);d.body.appendChild(pg);built=1;}
ru.style.display=wide?"":"none";
pg.style.display=!wide&&sh>ih+1?"":"none";
nh=nd.offsetHeight||44;
var y=T.map(function(o){var r=o.el.getBoundingClientRect();return [r.top+sy,r.bottom+sy];});
T.forEach(function(o,i){
o.a=f(y[i][0]);
o.b=o.el.tagName==="H2"?(T[i+1]?f(y[i+1][0]):1):f(y[i][1]);
if(o.b<=o.a)o.b=Math.min(1,o.a+.005);
o.band.style.top=at(o.a);
o.band.style.height="calc((100% - 48px) * "+(o.b-o.a).toFixed(4)+")";
});
update();
}

function update(){
qd=0;
var p=cl(w.pageYOffset/max),now=null;
T.forEach(function(o){if(p>=o.a&&(p<o.b||p===1))now=o;});
if(now!==cur){
[cur,now].forEach(function(o,n){if(o){o.band[C].toggle("is-active",!!n);if(o.bar)o.bar[C].toggle("is-active",!!n);}});
cur=now;put(lb,cur?cur.lab:"");
}
if(wide){
nd.style.transform="translateY("+Math.round(24+p*(w.innerHeight-48)-nh/2)+"px)";
put(pc,String(Math.round(p*100)));
}else pg.style.transform="scaleX("+p.toFixed(4)+")";
}

w.addEventListener("scroll",function(){if(!qd){qd=1;raf(update);}},{passive:true});
w.addEventListener("resize",layout);
w.addEventListener("load",layout);
if(w.ResizeObserver)new ResizeObserver(function(){raf(layout);}).observe(d.body);
else d.addEventListener("toggle",layout,true);
layout();
})();
