/* share.js: the Share button, its dialog, and the card renderer.
   One canvas renderer draws every card: the 9:16 story built here when someone
   shares, the live-verification result card, and the 1200x630 link previews,
   which tools/gen-share-cards.mjs renders through this same file so the two
   can never drift. No network beyond the page's own fonts. */
(function(){
"use strict";
var d=document,w=window;

var K={bg:"#0e0f13",bg2:"#15171d",card:"#171a21",line:"#262a33",lineS:"#626b7c",text:"#e8eaf0",text2:"#a3a9b8",text3:"#7c8494",
accent:"#3fd68f",wb:"#4da3ff",imf:"#b48cff",ecb:"#f2b544",carib:"#3fd68f",
match:"#3fd68f",close:"#f2b544",mismatch:"#ff6b6b",cannot_verify:"#a3a9b8"};
var FD=function(s){return "800 "+s+"px \"Orbit Display\", \"Arial Black\", system-ui, sans-serif";};
var FS=function(s){return "italic 400 "+s+"px \"Orbit Serif\", Georgia, serif";};
var FM=function(s){return "400 "+s+"px \"Orbit Mono\", ui-monospace, Consolas, monospace";};
var FB=function(s,b){return (b?"600 ":"400 ")+s+"px -apple-system, BlinkMacSystemFont, \"Segoe UI\", Inter, Roboto, sans-serif";};

/* Page cards carry copy only. A number baked into an image goes stale the
   day the data changes, and nothing would test it. */
var PAGES={
"/":{slug:"home",tag:"MCP server · REST API · free",head:[["Economic figures your AI can "],["check and cite",1],["."]],
 sub:"Every figure ships with a citation you can paste: source, series, licence and retrieval date.",
 share:"StatCite checks an economic figure against the official series and hands back a citation you can paste."},
"/guide":{slug:"guide",tag:"Guide",head:[["How to check an economic statistic "],["before you publish it",1]],
 sub:"The four ways a number goes wrong, and how to check one by hand or in a single call.",
 share:"How to check an economic statistic before you publish it."},
"/docs":{slug:"docs",tag:"Documentation",head:[["MCP tools, REST API and the "],["indicator registry",1]],
 sub:"Full reference for every tool, parameter and citation field.",
 share:"StatCite documentation: MCP tools, REST API and the indicator registry."},
"/bench":{slug:"bench",tag:"Benchmark",head:[["The AI Economic-Statistics "],["Accuracy",1],[" Benchmark"]],
 sub:"Pre-registered, with ground truth audited against primary sources.",
 share:"How accurately do AI models state official economic statistics from memory?"},
"/sources":{slug:"sources",tag:"Sources",head:[["Data sources and the "],["licence ledger",1]],
 sub:"Every source served or refused, with its licence verdict and the basis for it.",
 share:"Every data source behind StatCite, with its licence verdict."},
"/privacy":{slug:"privacy",tag:"Privacy",head:[["What StatCite "],["does and does not",1],[" collect"]],
 sub:"No accounts, no API keys, and no free-text queries or claimed values kept.",
 share:"StatCite privacy policy."},
"/terms":{slug:"terms",tag:"Terms",head:[["Terms of "],["Service",1]],
 sub:"Data accuracy and revisions, fair use, and what may be reused.",
 share:"StatCite terms of service."}
};
function pageKey(p){
p=String(p||"/").replace(/index\.html$/,"").replace(/\.html$/,"");
if(p.length>1)p=p.replace(/\/+$/,"");
return PAGES[p]?p:null;
}

/* Drawing helpers */
function rr(c,x,y,wd,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+wd,y,x+wd,y+h,r);c.arcTo(x+wd,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+wd,y,r);c.closePath();}
function alpha(hex,a){var n=parseInt(hex.slice(1),16);return "rgba("+(n>>16)+","+(n>>8&255)+","+(n&255)+","+a+")";}
function glow(c,x,y,r,col,a){var g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,alpha(col,a));g.addColorStop(1,alpha(col,0));c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);}
function bg(c,W,H){c.fillStyle=K.bg;c.fillRect(0,0,W,H);glow(c,W*.92,H*.06,W*.75,K.accent,.11);glow(c,W*.05,H*.98,W*.7,K.wb,.09);}
function mark(c,x,y,s){
var u=s/32;c.save();c.translate(x,y);c.scale(u,u);
rr(c,0,0,32,32,7);c.fillStyle="#12241c";c.fill();
c.strokeStyle=K.accent;c.lineWidth=3;c.lineCap="round";c.beginPath();
[[8,22,14],[13.5,22,10],[19,22,16],[24.5,22,7]].forEach(function(b){c.moveTo(b[0],b[1]);c.lineTo(b[0],b[2]);});
c.stroke();c.beginPath();c.arc(24.5,7,2.6,0,7);c.fillStyle="#6fb4ff";c.fill();c.restore();
}
function brand(c,x,y,s){mark(c,x,y,s);c.font=FD(Math.round(s*.68));c.fillStyle=K.text;c.textBaseline="middle";c.fillText("StatCite",x+s*1.3,y+s/2+1);c.textBaseline="alphabetic";}
function spaced(c,t,x,y,ls){for(var i=0;i<t.length;i++){c.fillText(t[i],x,y);x+=c.measureText(t[i]).width+ls;}return x;}
function spacedW(c,t,ls){var s=0;for(var i=0;i<t.length;i++)s+=c.measureText(t[i]).width+ls;return s-ls;}
function eyebrow(c,t,x,y,s,col){c.font=FM(s);c.fillStyle=col||K.accent;return spaced(c,t.toUpperCase(),x,y,s*.12);}

/* Word-wrap mixed runs: [[text, accent?], ...]. Accent runs set in the italic serif, a touch larger. */
function layoutRuns(c,runs,size,maxW){
var words=[];
runs.forEach(function(r){String(r[0]).split(/(\s+)/).forEach(function(p){if(p)words.push({t:p,a:!!r[1],sp:/^\s+$/.test(p)});});});
var lines=[[]],lw=0;
words.forEach(function(wd){
c.font=wd.a?FS(Math.round(size*1.14)):FD(size);
var ww=c.measureText(wd.t).width;
if(wd.sp){if(lw>0){lines[lines.length-1].push({t:" ",a:wd.a,w:ww});lw+=ww;}return;}
if(lw+ww>maxW&&lw>0){var L=lines[lines.length-1];while(L.length&&L[L.length-1].t===" ")lw-=L.pop().w;lines.push([]);lw=0;}
lines[lines.length-1].push({t:wd.t,a:wd.a,w:ww});lw+=ww;
});
return lines;
}
function fitRuns(c,runs,size,min,maxW,maxLines){
var L;for(;size>=min;size-=2){L=layoutRuns(c,runs,size,maxW);if(L.length<=maxLines)break;}
return {lines:L,size:Math.max(size,min)};
}
function drawRuns(c,F,x,y,lh,col){
F.lines.forEach(function(L,i){var xx=x;L.forEach(function(r){
c.font=r.a?FS(Math.round(F.size*1.14)):FD(F.size);c.fillStyle=r.a?K.accent:col;c.fillText(r.t,xx,y+i*lh);xx+=r.w;});});
return y+(F.lines.length-1)*lh;
}
/* Plain wrap for one font, with an ellipsis past maxLines. */
function wrap(c,t,font,maxW,maxLines){
c.font=font;var ws=String(t||"").split(/\s+/).filter(Boolean),lines=[],cur="";
ws.forEach(function(wd){
while(c.measureText(wd).width>maxW&&wd.length>1){var k=wd.length-1;while(k>1&&c.measureText(wd.slice(0,k)).width>maxW)k--;if(cur){lines.push(cur);cur="";}lines.push(wd.slice(0,k));wd=wd.slice(k);}
var n=cur?cur+" "+wd:wd;if(c.measureText(n).width>maxW&&cur){lines.push(cur);cur=wd;}else cur=n;});
if(cur)lines.push(cur);
if(lines.length>maxLines){lines=lines.slice(0,maxLines);var l=lines[maxLines-1];while(l&&c.measureText(l+"…").width>maxW)l=l.replace(/\s*\S+$/,"");lines[maxLines-1]=l+"…";}
return lines;
}
function drawLines(c,lines,x,y,lh,col){c.fillStyle=col;lines.forEach(function(l,i){c.fillText(l,x,y+i*lh);});return y+(lines.length-1)*lh;}

/* The orbit: rings, comet arcs and source cards, as on the homepage hero. */
var ORB=[["World Bank","wb"],["IMF","imf"],["ECB","ecb"],["BIS","ecb"],["ECCB","carib"],["CBB","carib"],["verify_stat","accent"],["verify_claims","accent"]];
/* Four inner cards at quarter turns fall between the eight outer ones, so no two overlap. */
var ORB_IN=[["inflation_cpi","wb"],["match","match"],["govt_debt_gdp","imf"],["BRB","carib"]];
function ring(c,cx,cy,rx,ry,tilt,s,phase){
c.save();c.translate(cx,cy);c.rotate(tilt);
c.lineWidth=Math.max(1.5,s*.05);c.strokeStyle=K.line;c.beginPath();c.ellipse(0,0,rx,ry,0,0,7);c.stroke();
c.setLineDash([s*.04,s*.22]);c.strokeStyle=alpha(K.lineS,.55);c.beginPath();c.ellipse(0,0,rx+s*.18,ry+s*.18,0,0,7);c.stroke();c.setLineDash([]);
[K.wb,K.imf,K.ecb,K.accent].forEach(function(col,k){
var a0=phase+k*Math.PI/2,span=.55,n=24;
for(var i=0;i<n;i++){c.strokeStyle=alpha(col,.06+.8*Math.pow(i/n,2));c.lineWidth=s*(.05+.06*i/n);c.beginPath();c.ellipse(0,0,rx,ry,0,a0+span*i/n,a0+span*(i+1)/n+.002);c.stroke();}
var t=a0+span;c.beginPath();c.arc(rx*Math.cos(t),ry*Math.sin(t),s*.12,0,7);c.fillStyle=col;c.fill();
});
c.restore();
}
function chip(c,label,fam,x,y,s){
c.font=FM(Math.round(s*.36));var tw=c.measureText(label).width,h=s*.86,wd=tw+s*1.05,col=K[fam]||K.accent;
rr(c,x-wd/2,y-h/2,wd,h,h*.28);c.fillStyle=K.card;c.fill();c.lineWidth=Math.max(1.5,s*.045);c.strokeStyle=alpha(col,.7);c.stroke();
c.beginPath();c.arc(x-wd/2+s*.36,y,s*.11,0,7);c.fillStyle=col;c.fill();
c.fillStyle=K.text;c.textBaseline="middle";c.fillText(label,x-wd/2+s*.62,y+1);c.textBaseline="alphabetic";
}
function orbit(c,cx,cy,rx,ry,s,tilt){
ring(c,cx,cy,rx*.62,ry*.62,tilt,s,1.1);ring(c,cx,cy,rx,ry,tilt,s,.2);
var put=function(list,f,ph){list.forEach(function(it,i){var t=ph+i/list.length*Math.PI*2,x=rx*f*Math.cos(t),y=ry*f*Math.sin(t);
chip(c,it[0],it[1],cx+x*Math.cos(tilt)-y*Math.sin(tilt),cy+x*Math.sin(tilt)+y*Math.cos(tilt),s);});};
put(ORB,1,-.35);put(ORB_IN,.62,0);
}
function pill(c,t,x,y,s,col){
c.font=FM(s);var tw=c.measureText(t).width,h=s*2.1,wd=tw+s*1.6;
rr(c,x,y,wd,h,h/2);c.fillStyle=alpha(col,.1);c.fill();c.lineWidth=2;c.strokeStyle=col;c.stroke();
c.fillStyle=col;c.textBaseline="middle";c.fillText(t,x+s*.8,y+h/2+1);c.textBaseline="alphabetic";return wd;
}
function host(u){return String(u).replace(/^https?:\/\//,"").replace(/[?#].*$/,"").replace(/\/$/,"");}

/* 1200x630 link preview */
function drawOG(c,P,url){
var W=1200,H=630;bg(c,W,H);
orbit(c,1010,330,360,250,44,-.2);
var g=c.createLinearGradient(0,0,W,0);g.addColorStop(0,alpha(K.bg,1));g.addColorStop(.62,alpha(K.bg,1));g.addColorStop(.8,alpha(K.bg,.3));g.addColorStop(1,alpha(K.bg,0));
c.fillStyle=g;c.fillRect(0,0,W,H);
brand(c,72,60,46);
eyebrow(c,P.tag,74,172,19);
var F=fitRuns(c,P.head,64,40,700,3),y=drawRuns(c,F,72,172+F.size*1.12,F.size*1.08,K.text);
drawLines(c,wrap(c,P.sub,FB(25),660,2),74,y+52,34,K.text2);
var pw=pill(c,host(url),72,H-104,22,K.accent);
c.font=FM(18);c.fillStyle=K.text3;spaced(c,"FREE · NO KEY · MCP + REST",72+pw+26,H-104+24,2);
}

/* 1080x1920 story. Instagram and WhatsApp cover roughly the top 250 px and
   the bottom 340 px with their own controls, so nothing that matters sits there. */
function drawStory(c,P,url){
var W=1080,H=1920;bg(c,W,H);
brand(c,84,268,64);
orbit(c,540,690,470,280,64,-.18);
glow(c,540,690,230,K.bg,1);mark(c,540-80,690-80,160);
eyebrow(c,P.tag,88,1050,28);
var F=fitRuns(c,P.head,84,56,904,3),y=drawRuns(c,F,84,1050+F.size*1.15,F.size*1.06,K.text);
y=drawLines(c,wrap(c,P.sub,FB(36),900,2),88,y+70,48,K.text2);
pill(c,host(url),84,Math.min(y+50,1490),34,K.accent);
}

/* Live-verification result story, drawn from the /v1/verify response itself. */
var VWORD={match:"MATCH",close:"CLOSE",mismatch:"MISMATCH",cannot_verify:"CANNOT VERIFY"};
/* Two decimals from 1 up, three significant digits below 1 so a small value
   never prints as 0, m and bn from a million, and an exponent past a trillion
   or below 0.0001. The bounds sit at the rounding edge, so 999,999,999 reads
   1bn rather than 1,000m. */
function num(v){
if(typeof v!=="number"||!isFinite(v))return "n/a";
var a=Math.abs(v),sg=v<0?-1:1;
if(a>=999995e6||(a>0&&a<1e-4))return v.toExponential(2);
if(a>=999995e3)return num(v/1e9)+"bn";
if(a>=999995)return num(v/1e6)+"m";
if(a<1)return (sg*a*(1+1e-12)).toLocaleString("en-GB",{maximumSignificantDigits:3});
return (sg*Math.round((a+1e-9)*100)/100).toLocaleString("en-GB",{maximumFractionDigits:2});
}
function glyph(c,k,x,y,s,col){
c.save();c.translate(x,y);c.strokeStyle=col;c.lineWidth=s*.14;c.lineCap="round";c.lineJoin="round";c.beginPath();
if(k==="match"){c.moveTo(-s*.38,0);c.lineTo(-s*.1,s*.28);c.lineTo(s*.42,-s*.3);}
else if(k==="mismatch"){c.moveTo(-s*.3,-s*.3);c.lineTo(s*.3,s*.3);c.moveTo(s*.3,-s*.3);c.lineTo(-s*.3,s*.3);}
else if(k==="close"){[-.15,.15].forEach(function(o){c.moveTo(-s*.4,s*o);c.bezierCurveTo(-s*.15,s*(o-.2),s*.15,s*(o+.2),s*.4,s*o);});}
else{c.moveTo(-s*.3,0);c.lineTo(s*.3,0);}
c.stroke();c.restore();
}
function drawResult(c,R,url,compact){
var W=1080,H=1920,v=VWORD[R.verdict]?R.verdict:"cannot_verify",col=K[v];bg(c,W,H);
ring(c,900,1860,460,190,-.12,60,3.6);
brand(c,84,268,64);
c.font=FM(26);var lt="LIVE VERIFICATION";c.fillStyle=K.text3;spaced(c,lt,W-84-spacedW(c,lt,3),310,3);
/* Verdict stamp */
c.font=FD(76);var vw=c.measureText(VWORD[v]).width;rr(c,84,400,vw+190,140,70);c.fillStyle=alpha(col,.12);c.fill();c.lineWidth=3;c.strokeStyle=col;c.stroke();
glyph(c,v,84+80,470,64,col);c.fillStyle=col;c.textBaseline="middle";c.fillText(VWORD[v],84+140,474);c.textBaseline="alphabetic";
/* What was checked */
var cn=(R.country&&R.country.name)||"",sn=(R.series&&R.series.name)||"",unit=(R.series&&R.series.unit)||"";
var cs=compact?60:72,ch=compact?220:250;
var y=drawLines(c,wrap(c,cn,FD(cs),900,2),84,660,cs*1.1,K.text);
y=drawLines(c,wrap(c,sn,FB(40),900,2),86,y+66,52,K.text2);
c.font=FM(34);c.fillStyle=K.text3;spaced(c,String(R.period||""),88,y+62,3);
/* The two numbers */
var top=y+120;
[["CLAIMED",num(R.claimed_value),K.text],["OFFICIAL",num(R.official_value),col]].forEach(function(b,i){
var x=84+i*462;rr(c,x,top,444,ch,22);c.fillStyle=K.card;c.fill();c.lineWidth=2;c.strokeStyle=i?alpha(col,.6):K.line;c.stroke();
c.font=FM(26);c.fillStyle=K.text3;spaced(c,b[0],x+34,top+62,3);
var t=b[1],fs=110;c.font=FD(fs);while(c.measureText(t).width>380&&fs>50){fs-=6;c.font=FD(fs);}
c.fillStyle=b[2];c.fillText(t,x+32,top+ch-60);
});
y=top+ch;
if(unit&&compact!==2){y=drawLines(c,wrap(c,unit,FB(30),900,1),88,y+50,40,K.text3);}
/* The service's own explanation, then the receipt. A long country or series
   name drops the explanation, so the link stays clear of the reply bar. */
if(!compact)y=drawLines(c,wrap(c,R.explanation,FB(32),900,3),88,y+62,44,K.text2);
if(R.is_projection)y=drawLines(c,wrap(c,"The official figure is an IMF estimate or projection.",FB(30),900,2),88,y+50,40,K.ecb);
var ci=R.citation||{},src=[ci.source,ci.dataset].filter(Boolean).join(", ");
var by=Math.max(y+(compact===2?36:60),1270);
c.font=FM(24);c.fillStyle=K.text3;spaced(c,"SOURCE",88,by,3);
y=drawLines(c,wrap(c,src,FB(32,1),900,2),88,by+48,42,K.text);
var meta=[ci.series_id,ci.retrieved_at?"retrieved "+ci.retrieved_at:""].filter(Boolean).join(" · ");
y=drawLines(c,wrap(c,meta,FM(26),900,2),88,y+44,36,K.text2);
pill(c,"Check any figure at "+host(url),84,Math.max(y+56,1440),30,K.accent);
return y;
}

/* Render to a fresh canvas once the kit fonts are in, or after 2.5 s without them. */
var fontsReady;
function ready(){
if(!fontsReady){
var fs=d.fonts,need=fs&&fs.load?[fs.load(FD(80),"StatCite"),fs.load(FS(80),"cite"),fs.load(FM(30),"MATCH")]:[];
fontsReady=Promise.race([Promise.all(need).catch(function(){}),new Promise(function(r){setTimeout(r,2500);})]);
}
return fontsReady;
}
function render(spec){
return ready().then(function(){
var cv=d.createElement("canvas"),og=spec.kind==="og";
cv.width=og?1200:1080;cv.height=og?630:1920;
var c=cv.getContext("2d");
if(spec.kind==="result"){if(drawResult(c,spec.data,spec.url)>1440&&drawResult(c,spec.data,spec.url,1)>1440)drawResult(c,spec.data,spec.url,2);}
else (og?drawOG:drawStory)(c,PAGES[spec.page]||PAGES["/"],spec.url);
return cv;
});
}
function toBlob(cv){return new Promise(function(res){cv.toBlob(function(b){res(b);},"image/png");});}
function dataUrl(b){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsDataURL(b);});}

/* The dialog */
var dlg,els={},cur=null;
function el(t,cls,txt,p){var e=d.createElement(t);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;if(p)p.appendChild(e);return e;}
function hint(t){els.hint.textContent=t||"";}
function copy(t){
if(navigator.clipboard&&navigator.clipboard.writeText)return navigator.clipboard.writeText(t).then(function(){return true;},function(){return false;});
return Promise.resolve(false);
}
function build(){
dlg=el("dialog","share-dlg");dlg.setAttribute("aria-labelledby","share-h");
var x=el("button","share-x","×",dlg);x.type="button";x.setAttribute("aria-label","Close");x.addEventListener("click",shut);
dlg.addEventListener("close",back);
el("h2","",null,dlg).id="share-h";
els.h=dlg.querySelector("#share-h");
els.prev=el("img","share-prev",null,dlg);els.prev.alt="";els.prev.width=1080;els.prev.height=1920;
var acts=el("div","share-acts",null,dlg);
els.story=el("button","btn primary","Share to Instagram or WhatsApp story",acts);els.story.type="button";
els.save=el("a","btn primary","Save story image",acts);els.save.setAttribute("download","statcite-story.png");
els.link=el("button","btn ghost","Share link",acts);els.link.type="button";
var row=el("div","share-row",null,acts);
els.wa=el("a","btn ghost","WhatsApp",row);els.x=el("a","btn ghost","X",row);els.li=el("a","btn ghost","LinkedIn",row);
[els.wa,els.x,els.li].forEach(function(a){a.target="_blank";a.rel="noopener noreferrer";});
els.copy=el("button","btn ghost","Copy link",acts);els.copy.type="button";
els.hint=el("p","share-hint","",dlg);els.hint.setAttribute("role","status");
els.story.addEventListener("click",function(){
if(!cur||!cur.file)return;
var f=cur.file,u=cur.url;
/* Files only. Text or a URL beside the image is reported to keep Instagram's
   story target out of the share sheet on some phones, so the link goes to the
   clipboard for a link sticker instead. */
hint(cur.copied?"Link copied. In Instagram, add it with the Link sticker. In WhatsApp Status, paste it as the caption.":"Pick Instagram or WhatsApp, then Story or Status.");
navigator.share({files:[f]}).catch(function(e){if(e&&e.name!=="AbortError")hint("Your browser would not share the image. Save it instead and post it from your gallery.");});
});
els.link.addEventListener("click",function(){
if(!cur)return;navigator.share({title:cur.title,text:cur.text,url:cur.url}).catch(function(){});
});
/* A result copies its sentence with the link, so a bare paste still says what
   was checked. The WhatsApp route sends the same two parts in the same order.
   The clipboard then holds more than a URL, so copied turns false and the story
   flow stops offering it for a Link sticker. */
function copied(c){return function(ok){if(ok&&c.result){c.copied=false;c.sentence=true;}if(c===cur)hint(ok?(c.result?"Result and link copied.":"Link copied."):"Copy failed. The link is "+c.url);};}
els.copy.addEventListener("click",function(){if(cur)copy(cur.result?cur.text+" "+cur.url:cur.url).then(copied(cur));});
els.save.addEventListener("click",function(e){
if(!els.save.getAttribute("href")){e.preventDefault();hint("The image is still being made.");return;}
hint("Downloading the image. Post it as a story from your phone, and add the link with a sticker.");
});
d.body.appendChild(dlg);
}
function shut(){
if(dlg.close){try{dlg.close();}catch(e){dlg.removeAttribute("open");}}else dlg.removeAttribute("open");
back();
}
function back(){if(opener&&opener.focus&&d.contains(opener))opener.focus();opener=null;}
var opener=null;
function open(spec){
if(!dlg)build();
opener=spec.from||d.activeElement;
var url=spec.url||canonical(),title=spec.title||d.title,text=spec.text||title;
cur={url:url,title:title,text:text,file:null,copied:false,result:spec.kind==="result"};
var mine=cur;
els.h.textContent=spec.heading||"Share this page";
/* The story button only where a phone share sheet with story targets exists. */
var touch=!!(w.matchMedia&&w.matchMedia("(pointer: coarse)").matches),files=false;
try{files=touch&&!!navigator.canShare&&!!w.File&&navigator.canShare({files:[new File(["x"],"s.png",{type:"image/png"})]});}catch(e){files=false;}
/* There, the link goes to the clipboard now, inside the tap that opened the
   dialog, for the Link sticker. Once a share sheet takes focus, some browsers
   refuse the clipboard. Elsewhere only Copy link writes to it. */
if(files)copy(url).then(function(ok){mine.copied=ok&&!mine.sentence;});
/* Every button keeps its place while the image is made, so nothing moves under a finger. */
els.story.hidden=!files;els.story.disabled=true;els.save.hidden=false;els.save.className=files?"btn ghost":"btn primary";
els.link.hidden=!navigator.share;
els.copy.textContent=cur.result?"Copy result and link":"Copy link";
els.prev.removeAttribute("src");els.save.removeAttribute("href");
hint("Making the story image…");
els.wa.href="https://wa.me/?text="+encodeURIComponent(text+" "+url);
els.x.href="https://x.com/intent/post?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(url);
els.li.href="https://www.linkedin.com/sharing/share-offsite/?url="+encodeURIComponent(url);
if(dlg.showModal)dlg.showModal();else dlg.setAttribute("open","");
render(spec.kind==="result"?spec:{kind:"story",page:spec.page,url:url}).then(toBlob).then(function(b){
if(mine!==cur)return;
if(!b)throw 0;
var f=new File([b],"statcite-story.png",{type:"image/png"}),story=files&&navigator.canShare({files:[f]});
return dataUrl(b).then(function(data){
if(mine!==cur)return;
els.prev.src=data;els.save.href=data;
els.prev.alt=spec.kind==="result"?"Story image of this verification result":"Story image for this page";
if(story)cur.file=f;
els.story.disabled=!story;if(!story){els.story.hidden=true;els.save.className="btn primary";}
hint(story?(mine.copied?"The link is copied, ready for a Link sticker.":mine.sentence?"Result and link copied.":""):"Save the image, then post it as a story from your phone's gallery.");
});
}).catch(function(){if(mine===cur)hint("The story image could not be drawn here. The link options still work.");});
}
function canonical(){var l=d.querySelector('link[rel="canonical"]');return l?l.href:location.href.split("#")[0];}

w.StatCiteShare={render:render,open:open,pages:PAGES,pageKey:pageKey};
if(d.documentElement.hasAttribute("data-card-render"))return;

/* Styles live here so the share layer ships and caches as one file, and sc.css
   stays inside its size cap. */
var css=".share-open{display:inline-flex;align-items:center;gap:7px;padding:3px 12px 4px;border:1px solid var(--line-strong);border-radius:20px;background:none;color:var(--accent);cursor:pointer;font:calc(12.5px/.66)/1.05 var(--mono);font-variant-caps:all-small-caps;font-synthesis-small-caps:none;letter-spacing:.07em}"+
".share-open::before{content:\"\";width:12px;height:12px;background:currentColor;-webkit-mask:var(--sg) center/contain no-repeat;mask:var(--sg) center/contain no-repeat}"+
".share-open,.share-result{--sg:url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>\")}"+
".share-open:hover{border-color:var(--accent)}"+
".share-dlg{width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:22px;border:1px solid var(--line-strong);border-radius:var(--r-3);background:var(--bg-2);color:var(--text)}"+
".share-dlg::backdrop{background:rgb(0 0 0/.65)}"+
".share-dlg h2{font:800 21px var(--font-display);margin:0 40px 14px 0}"+
".share-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border:1px solid var(--line-strong);border-radius:50%;background:none;color:var(--text);font-size:20px;line-height:1;cursor:pointer}"+
".share-prev{display:block;width:132px;height:auto;aspect-ratio:9/16;margin:0 auto 16px;border:1px solid var(--line);border-radius:10px;background:var(--bg)}"+
".share-acts{display:grid;gap:9px}.share-acts .btn{width:100%;text-align:center;cursor:pointer;font-family:inherit;line-height:1.3}.share-acts .btn.ghost,.share-result{background:none;color:var(--text)}"+
".share-acts [hidden]{display:none}.share-acts .btn:disabled{opacity:.55;cursor:progress}.share-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.share-row .btn{padding:11px 6px}"+
".share-hint{margin-top:12px;font-size:14px;line-height:1.45;color:var(--text-2);min-height:2.9em}"+
".share-result{display:inline-flex;align-items:center;gap:8px;margin-top:14px;cursor:pointer;font-family:inherit;background:none}"+
".share-result::before{content:\"\";width:15px;height:15px;background:currentColor;-webkit-mask:var(--sg) center/contain no-repeat;mask:var(--sg) center/contain no-repeat}";
var st=d.createElement("style");st.textContent=css;d.head.appendChild(st);

/* The nav button, on every page that has a card. 404 and unknown paths get none. */
var key=pageKey(location.pathname),links=d.querySelector("nav .links");
if(key&&links){
var b=el("button","share-open","Share",links);b.type="button";b.setAttribute("aria-haspopup","dialog");
b.addEventListener("click",function(){var P=PAGES[key];open({page:key,text:P.share,title:d.title,from:b});});
}

/* Live verifier: index.html fires sc:verdict with the response and the query.
   A shared link carries the same query, so it lands on the page and re-runs
   the check live against the current series. */
var form=d.getElementById("try-form");
if(!form)return;
d.addEventListener("sc:verdict",function(e){
var R=e.detail&&e.detail.body,q=e.detail&&e.detail.query,card=d.querySelector("#try-result .card");
if(!R||!card||!q||!{match:1,close:1,mismatch:1}[R.verdict])return;
var url=location.origin+"/?"+q+"#try",cn=(R.country&&R.country.name)||"",sn=(R.series&&R.series.name)||"";
var text=cn+", "+sn+", "+R.period+": claimed "+num(R.claimed_value)+", official "+(R.is_projection?"estimate or projection ":"")+num(R.official_value)+". Verdict: "+R.verdict+". Checked with StatCite.";
var btn=el("button","btn ghost share-result","Share this result",card);btn.type="button";
btn.addEventListener("click",function(){open({kind:"result",data:R,url:url,text:text,title:"StatCite verification",heading:"Share this result",from:btn});});
});
var P=new URLSearchParams(location.search),ind=P.get("indicator"),sel=d.getElementById("try-indicator"),yr=d.getElementById("try-period"),pv=+P.get("period");
if(ind&&sel&&yr&&[].some.call(sel.options,function(o){return o.value===ind;})&&P.get("country")&&/^\d{4}$/.test(P.get("period")||"")&&pv>=+yr.min&&pv<=+yr.max&&isFinite(parseFloat(P.get("value")))){
sel.value=ind;
d.getElementById("try-country").value=P.get("country").slice(0,60);
d.getElementById("try-period").value=P.get("period");
d.getElementById("try-value").value=String(parseFloat(P.get("value")));
if(form.requestSubmit)form.requestSubmit();else form.dispatchEvent(new Event("submit",{cancelable:true}));
}
})();
