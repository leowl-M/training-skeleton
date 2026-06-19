// node test_snap.js — verifica che saldaEstremi ripari le controforme rotte della B
const fs = require("fs"), vm = require("vm"), pc = require("polygon-clipping");
const assert = require("assert");
function ctx() {
  const c = { polygonClipping: pc, Math, console, TAU: Math.PI * 2, noise: () => 0.5, JSON, Object, Array, isNaN, parseInt, parseFloat };
  c.window = c; vm.createContext(c);
  for (const f of ["js/data.js","js/geometry.js","js/state.js","js/base.js","js/engine.js"])
    vm.runInContext(fs.readFileSync(__dirname + "/" + f, "utf8"), c, { filename: f });
  return c;
}
// snapEndpoints = stessa logica di saldaEstremi() (qui senza UI), tol fisso 0.04
const SNAP = `function snap(g,tol){var t2=tol*tol,e=[];g.tratti.forEach(function(tr,ti){if(tr.chiuso||tr.pts.length<2)return;[0,tr.pts.length-1].forEach(function(pi){e.push({ti:ti,p:tr.pts[pi]});});});
for(var a=0;a<e.length;a++)for(var b=a+1;b<e.length;b++){var dx=e[a].p[0]-e[b].p[0],dy=e[a].p[1]-e[b].p[1];if(dx*dx+dy*dy<=t2&&(dx||dy)){e[b].p[0]=e[a].p[0];e[b].p[1]=e[a].p[1];}}
e.forEach(function(en){var best=null,bd=t2;g.tratti.forEach(function(tr,ti){if(ti===en.ti)return;var P=tr.pts,n=P.length,last=tr.chiuso?n:n-1;for(var i=0;i<last;i++){var a=P[i],c=P[(i+1)%n],vx=c[0]-a[0],vy=c[1]-a[1],L2=vx*vx+vy*vy||1,t=((en.p[0]-a[0])*vx+(en.p[1]-a[1])*vy)/L2;t=Math.max(0,Math.min(1,t));var qx=a[0]+vx*t,qy=a[1]+vy*t,d=(en.p[0]-qx)*(en.p[0]-qx)+(en.p[1]-qy)*(en.p[1]-qy);if(d<bd){bd=d;best=[qx,qy];}}});if(best){en.p[0]=best[0];en.p[1]=best[1];}});}`;
const P = `var p=def0();Object.assign(p,{larghezza:100,altezza:100,slant:0,rot:0,mid:50,asc:0,xheight:66.7,desc:100,overshoot:0,penang:0,tang:0,serif:"none",join:"miter",cap:"butt",pen:"ellipse",convex:0,peso:12,contrasto:0});union0=true;`+SNAP;
const holes = (extra) => JSON.parse(vm.runInContext(P + extra + `JSON.stringify(costr("B",p,0,0,1).polys.map(function(x){return x.holes.length;}));`, ctx()));
assert.deepEqual(holes(""), [2], "B pulita = 2 controforme");
assert.deepEqual(holes('HERSHEY.B.tratti[2].pts[0]=[0.20,0.49];'), [0], "gap giunzione = controforme perse");
assert.deepEqual(holes('HERSHEY.B.tratti[2].pts[0]=[0.20,0.49];snap(HERSHEY.B,0.04);'), [2], "snap ripara");
console.log("ok");
