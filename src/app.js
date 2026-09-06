import { WorksheetKernel, parse, astToMathML, resultMath, escapeXML, formatNumber, BUILTIN_NAMES, UNITS, identifierMath, dependencies } from './kernel.js';
import { DocumentStore, validateDocument, createRegion, createId, beamExample, numericalExample, blankExample, PAGE_WIDTH, PAGE_HEIGHT, PAGE_GAP, GRID, APP_VERSION } from './document.js';
import { ViewportRenderer, SceneBatch, PALETTE, clipLine } from './renderer.js';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const esc=escapeXML;
const SVG_NS='http://www.w3.org/2000/svg';
const icons={
  save:'<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>',
  undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',redo:'<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4M12 17h.01"/>',
  document:'<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h4M9 12h6M9 16h6"/>',text:'<path d="M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3"/>',
  plot:'<path d="M4 3v17h17M6 16l5-7 4 4 5-9"/>',image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-6 5 7"/>',
  grid:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  'panel-left':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>', 'panel-right':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  fit:'<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 12h10m-8-2-2 2 2 2m6-4 2 2-2 2"/>',
  fullscreen:'<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  external:'<path d="M13 3h8v8M21 3l-11 11M9 4H4v16h16v-5"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  export:'<path d="M12 3v12m-4-8 4-4 4 4M4 13v8h16v-8"/>',import:'<path d="M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',check:'<path d="m5 12 4 4L19 6"/>',copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  print:'<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6zM17 11h1"/>',page:'<path d="M6 3h12v18H6zM12 8v8M8 12h8"/>',play:'<path d="m8 4 12 8-12 8V4Z"/>',
  folder:'<path d="M3 6h7l2 3h9v12H3V6Z"/>',download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',slider:'<path d="M3 7h18M3 17h18"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>'
};
function icon(name){return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.document}</svg>`;}
function fillIcons(root=document){root.querySelectorAll('[data-icon]').forEach(n=>{n.innerHTML=icon(n.dataset.icon);if(n.tagName==='BUTTON'&&!n.hasAttribute('aria-label'))n.setAttribute('aria-label',n.title||n.dataset.icon);});}
fillIcons();
const STORAGE_KEY='axiom-worksheet.document.v1';
const SETTINGS_KEY='axiom-worksheet.settings.v1';
let initial=beamExample(),settings={grid:true,snap:true,margins:false,auto:true,zoom:.85,outline:true,inspector:true};
let restoreWarning='';
try{const saved=localStorage.getItem(STORAGE_KEY);if(saved)initial=validateDocument(JSON.parse(saved));const prefs=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');for(const key of ['grid','snap','margins','auto','outline','inspector'])if(typeof prefs[key]==='boolean')settings[key]=prefs[key];if(Number.isFinite(prefs.zoom))settings.zoom=Math.max(.4,Math.min(1.6,prefs.zoom));}catch(e){restoreWarning=e.name==='SecurityError'?'Local storage is unavailable here. Save a worksheet file to preserve changes.':'The saved worksheet could not be restored. The example was opened instead.';}
const store=new DocumentStore(initial);
let results={},variables=[],selected=new Set([initial.regions.some(r=>r.id==='load')?'load':initial.regions.find(r=>r.type==='math')?.id].filter(Boolean));
let inspectorTab='region',activeRibbon='Math',editing=null,clipboard=[],insertPoint=null,drag=null,latestCalculation=null,calculationStale=true;
let paintPending=false,calcDebounce,saveDebounce,worker=null,workerBusy=false,pendingCalculation=null,calculationGeneration=0,workerTimeout,localKernel=null,workerFallback=false,disposed=false;
const regionNodes=new Map(),pageNodes=new Map(),batch=new SceneBatch();
const canvasArea=$('#canvas-area'),scrollViewport=$('#scroll-viewport');
let rendererStatus={mode:'initializing'};
const renderer=new ViewportRenderer($('#gpu-canvas'),state=>{
  rendererStatus=state;$('#workspace').classList.add('renderer-ready');$('#engine-status').innerHTML=`<span class="gpu-dot"></span>${esc(state.description||state.mode)}`;$('#engine-status').title=state.reason||'GPU-accelerated worksheet geometry and plots';if(state.error)toast('GPU validation: '+state.error,true);schedulePaint();
});
const current=()=>store.get([...selected][0]);
const isTyping=target=>target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]');
function toast(message,error=false){
  const host=$('#toasts');
  if([...host.children].some(node=>node.textContent===message))return;
  while(host.children.length>=3)host.firstElementChild.remove();
  const node=document.createElement('div');node.className='toast'+(error?' error-toast':'');node.textContent=message;
  host.append(node);setTimeout(()=>node.remove(),error?7000:4000);
}
let storageWarningShown=Boolean(restoreWarning);
function persistSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{}}
function persistDocument(){clearTimeout(saveDebounce);$('#save-state').textContent='Saving locally…';saveDebounce=setTimeout(()=>{try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store.document));storageWarningShown=false;$('#save-state').textContent='Saved on this device';}catch(e){$('#save-state').textContent='Save to a file';if(!storageWarningShown){storageWarningShown=true;toast('Local storage is full or unavailable. Use File → Save to keep this worksheet.',true);}}},350);}
function setupWorker(){
  try{
    worker=new Worker(new URL('./worker.js', import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{clearTimeout(workerTimeout);workerBusy=false;if(data.id===calculationGeneration){if(data.fatal)calculationError(data.fatal);else applyCalculation(data);}if(pendingCalculation)dispatchCalculation();};
    worker.onerror=()=>{clearTimeout(workerTimeout);worker?.terminate();worker=null;workerBusy=false;workerFallback=true;localKernel=new WorksheetKernel();toast('Worker unavailable; calculations are running on the main thread.',true);pendingCalculation={id:calculationGeneration,document:structuredClone(store.document)};dispatchCalculation();};
  }catch{worker=null;workerFallback=true;localKernel=new WorksheetKernel();}
}
function requestCalculate(force=false){
  calculationStale=true;$('#pages').classList.add('stale');const id=++calculationGeneration;clearTimeout(calcDebounce);pendingCalculation=null;
  if(!settings.auto&&!force){$('#calculation-state').innerHTML='<span class="status-dot busy"></span>Manual calculation · results may be stale';return;}
  $('#calculation-state').innerHTML='<span class="status-dot busy"></span>Calculating…';
  calcDebounce=setTimeout(()=>{pendingCalculation={id,document:structuredClone(store.document)};dispatchCalculation();},force?0:100);
}
function dispatchCalculation(){
  if(workerBusy||!pendingCalculation||disposed)return;const job=pendingCalculation;pendingCalculation=null;workerBusy=true;
  if(worker){worker.postMessage({type:'calculate',...job});workerTimeout=setTimeout(()=>{worker.terminate();worker=null;workerBusy=false;calculationError('Calculation exceeded the 5-second worker budget. Simplify the expression and recalculate.');setupWorker();if(pendingCalculation)dispatchCalculation();},5000);}
  else setTimeout(()=>{try{const data={id:job.id,...(localKernel||=new WorksheetKernel()).calculate(job.document)};if(job.id===calculationGeneration)applyCalculation(data);}catch(e){calculationError(e.message);}finally{workerBusy=false;if(pendingCalculation)dispatchCalculation();}},0);
}
function calculationError(message){$('#calculation-state').innerHTML='<span class="status-dot error-dot"></span>Calculation interrupted';toast(message,true);}
function applyCalculation(data){
  results=data.results;variables=data.variables;latestCalculation=data;calculationStale=false;$('#pages').classList.remove('stale');
  for(const r of store.document.regions)if(r.id!==editing?.id)renderRegion(r);
  renderVariables();renderInspector();schedulePaint();
  $('#calculation-state').innerHTML=`<span class="status-dot ${data.errors?'error-dot':''}"></span>${data.errors?`${data.errors} region error${data.errors===1?'':'s'}`:'All regions calculated'}`;
  $('#calculation-state').title=`${data.duration.toFixed(2)} ms in ${workerFallback?'main thread':'Web Worker'} · ${data.cacheHits} cached regions`;
}
function schedulePaint(){if(paintPending)return;paintPending=true;requestAnimationFrame(()=>{paintPending=false;paint();});}
function paint(){
  const bounds=canvasArea.getBoundingClientRect();renderer.resize(bounds.width,bounds.height);batch.reset();const z=settings.zoom;let visiblePage=0,bestVisible=-Infinity;
  for(const [index,page]of pageNodes){const p=page.getBoundingClientRect(),x=p.left-bounds.left,y=p.top-bounds.top,w=p.width,h=p.height;const visible=Math.min(bounds.height,y+h)-Math.max(0,y);page.classList.toggle('visible-page',visible>0);if(visible>bestVisible){bestVisible=visible;visiblePage=index;}if(y>bounds.height||y+h<0||x>bounds.width||x+w<0)continue;
    batch.rect(x,y,w,h,'#ffffff');
    if(settings.grid){const step=GRID*z*(z<.65?2:1),left=x+30*z,right=x+w-30*z,top=y+48*z,bottom=y+h-42*z;
      for(let gx=left;gx<right;gx+=step)if(gx>=0&&gx<=bounds.width)batch.line(gx,Math.max(0,top),gx,Math.min(bounds.height,bottom),.35,'#dfe8dd',.55);
      for(let gy=top;gy<bottom;gy+=step)if(gy>=0&&gy<=bounds.height)batch.line(Math.max(0,left),gy,Math.min(bounds.width,right),gy,.35,'#dfe8dd',.55);
    }
    if(settings.margins){batch.line(x+60*z,y+45*z,x+60*z,y+h-40*z,.6,'#abbba4',.8);batch.line(x+w-60*z,y+45*z,x+w-60*z,y+h-40*z,.6,'#abbba4',.8);}
  }
  for(const r of store.document.regions){
    if(r.type!=='plot')continue;const p=results[r.id]?.plot,node=regionNodes.get(r.id);if(!p||!node)continue;const b=node.getBoundingClientRect(),bx=b.left-bounds.left,by=b.top-bounds.top;if(by>bounds.height||by+b.height<0)continue;
    const g=plotGeometry(r,p),gx=bx+g.left*z,gy=by+g.top*z,gw=g.width*z,gh=g.height*z;batch.rect(bx+1,by+1,b.width-2,b.height-2,'#ffffff',1);
    for(const tick of niceTicks(p.yMin,p.yMax)){const py=by+g.py(tick)*z;batch.line(gx,py,gx+gw,py,.7,'#e2e9df');}
    for(const tick of niceTicks(p.xMin,p.xMax)){const px=bx+g.px(tick)*z;batch.line(px,gy,px,gy+gh,.6,'#e7ece4');}
    batch.line(gx,gy,gx,gy+gh,.8,'#a8b6a2');batch.line(gx,gy+gh,gx+gw,gy+gh,.8,'#a8b6a2');
    p.series.forEach((s,trace)=>{for(let i=1;i<s.points.length;i++){const a=s.points[i-1],b=s.points[i];if(a[1]===null||b[1]===null||Math.abs(a[1]-b[1])>(p.yMax-p.yMin)*.65)continue;const line=clipLine(bx+g.px(a[0])*z,by+g.py(a[1])*z,bx+g.px(b[0])*z,by+g.py(b[1])*z,{x:gx,y:gy,w:gw,h:gh});if(line)batch.line(...line,2.15*z,PALETTE[trace%PALETTE.length]);}});
  }
  renderer.render(batch);$('#current-page').textContent=`Page ${visiblePage+1} of ${store.document.pages}`;
}
function niceTicks(min,max,count=5){if(!(max>min))return [];const raw=(max-min)/count,base=10**Math.floor(Math.log10(raw)),ratio=raw/base,step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*base;const ticks=[];for(let n=Math.ceil(min/step)*step;n<=max+step*1e-6&&ticks.length<30;n+=step)ticks.push(Math.abs(n)<step*1e-8?0:n);return ticks;}
function plotGeometry(r,p){const left=55,right=22,top=47,bottom=44,width=Math.max(30,r.w-left-right),height=Math.max(30,r.h-top-bottom);return {left,right,top,bottom,width,height,px:x=>left+(x-p.xMin)/(p.xMax-p.xMin)*width,py:y=>top+(p.yMax-y)/(p.yMax-p.yMin)*height};}
function plotSvg(r,p){
  const g=plotGeometry(r,p);let content=`<text class="plot-title" x="${g.left}" y="20">${esc(r.label||'XY plot')}</text>`;
  p.series.forEach((s,i)=>{const x=Math.max(g.left,r.w-20-p.series.length*115+i*115);content+=`<line x1="${x}" y1="17" x2="${x+15}" y2="17" stroke="${PALETTE[i%8]}" stroke-width="2"/><text class="legend-text" x="${x+21}" y="20">${esc(s.label.slice(0,15))}</text>`;});
  const clip=`plot-clip-${r.id}`;content+=`<defs><clipPath id="${clip}"><rect x="${g.left}" y="${g.top}" width="${g.width}" height="${g.height}"/></clipPath></defs>`;
  for(const t of niceTicks(p.yMin,p.yMax)){const y=g.py(t);content+=`<line class="print-trace" x1="${g.left}" y1="${y}" x2="${g.left+g.width}" y2="${y}" stroke="#e2e9df" stroke-width=".7"/><text x="${g.left-12}" y="${y+3.5}" text-anchor="end">${esc(formatNumber(t,3))}</text>`;}
  for(const t of niceTicks(p.xMin,p.xMax)){const x=g.px(t);content+=`<line class="print-trace" x1="${x}" y1="${g.top}" x2="${x}" y2="${g.top+g.height}" stroke="#e7ece4" stroke-width=".6"/><text x="${x}" y="${g.top+g.height+20}" text-anchor="middle">${esc(formatNumber(t,3))}</text>`;}
  content+=`<text x="${g.left-12}" y="${g.top-9}" text-anchor="end">${esc(p.yUnit||'y')}</text><text x="${g.left+g.width/2}" y="${r.h-4}" text-anchor="middle">${esc(r.id==='deflection-plot'?'Span':r.variable||'x')}${p.xUnit?' ('+esc(p.xUnit)+')':''}</text>`;
  content+=`<path class="print-trace" d="M${g.left},${g.top}V${g.top+g.height}H${g.left+g.width}" fill="none" stroke="#a8b6a2" stroke-width=".8"/>`;
  p.series.forEach((s,i)=>{let path='',pen=false,lastY;for(const [x,y]of s.points){if(y===null){pen=false;continue;}if(lastY!==undefined&&Math.abs(y-lastY)>(p.yMax-p.yMin)*.65)pen=false;path+=`${pen?'L':'M'}${g.px(x).toFixed(3)},${g.py(y).toFixed(3)} `;pen=true;lastY=y;}content+=`<path class="print-trace" clip-path="url(#${clip})" d="${path}" fill="none" stroke="${PALETTE[i%8]}" stroke-width="2.15" stroke-linejoin="round"/>`;});
  return `<svg class="plot-svg" xmlns="${SVG_NS}" viewBox="0 0 ${r.w} ${r.h}" role="img" aria-label="${esc(r.label||'Function plot')}">${content}</svg><div class="plot-hover-target" aria-hidden="true"></div>`;
}
function beamSvg(){
  const span=results.length?.formatted?.text||'L',load=results.load?.formatted?.text||'q';let arrows='';for(let x=95;x<=712;x+=47)arrows+=`<path d="M${x} 31v32m-4-7 4 7 4-7"/>`;
  let hatch='';for(let y=50;y<89;y+=8)hatch+=`<path d="M61 ${y} 49 ${y+9}"/>`;
  return `<svg viewBox="0 0 780 120" role="img" aria-label="Cantilever beam under a uniformly distributed load"><g fill="none" stroke="#b2c8b3" stroke-width="1.15">${arrows}<path d="M93 30h621"/></g><text x="412" y="18" text-anchor="middle" fill="#7f9b82" font-size="11" font-family="var(--font)">q = ${esc(load)}</text><g fill="none" stroke="#687e6b" stroke-width="1.3">${hatch}<path d="M62 47v43" stroke-width="3"/><path d="M63 69h653" stroke-width="3.5"/></g><path d="M65 73C284 74 485 86 716 88" stroke="#b8d0b4" stroke-width="1.4" stroke-dasharray="5 4" fill="none"/><g stroke="#c0cdb9" fill="none" stroke-width="1"><path d="M64 96v17M716 96v17M64 105h283M433 105h283m-7-3 7 3-7 3M71 102l-7 3 7 3"/></g><text x="390" y="109" text-anchor="middle" fill="#8a9e82" font-family="var(--font)" font-size="11">L = ${esc(span)}</text><circle cx="716" cy="69" r="3" fill="#6c826e"/></svg>`;
}
function equationMarkup(r){
  const result=results[r.id];if(!r.source.trim())return '<span style="color:#a5b9a4;font-size:16px">Enter a calculation…</span>';
  let s;try{s=parse(r.source);}catch(e){return `<span class="error-message">${esc(e.message)}</span>`;}
  let input=s.k==='assign'?`${astToMathML(s.target)}<mo>≔</mo>${astToMathML(s.value)}`:astToMathML(s.value);
  const numeric=result?.formatted&&result.source===r.source&&!result.error;
  const refs=[...dependencies(s.value)];const derived=s.k!=='assign'||refs.some(n=>!UNITS.has(n)&&!['pi','π','e','true','false'].includes(n));
  if(numeric&&result.formatted.kind!=='function'&&derived)input+=`<mo class="math-equals">${result.formatted.kind==='symbolic'?'→':'='}</mo><mstyle class="math-result">${resultMath(result.formatted)}</mstyle>`;
  else if(s.k!=='assign'&&!result?.error)input+='<mo class="math-equals">=</mo><mtext class="math-result">…</mtext>';
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"><mrow>${input}</mrow></math>`;
}
function renderRegion(r){
  const node=regionNodes.get(r.id);if(!node)return;node.style.left=r.x+'px';node.style.top=r.y+'px';node.style.width=r.w+'px';node.style.height=r.h+'px';
  node.className=`region ${r.type}${selected.has(r.id)?' selected':''}${results[r.id]?.error?' error':''}${r.color!=='default'?' color-'+r.color:''}${editing?.id===r.id?' editing':''}`;
  node.setAttribute('aria-selected',String(selected.has(r.id)));node.setAttribute('aria-label',r.label||r.text?.slice(0,100)||r.source||r.type+' region');
  if(editing?.id===r.id)return;
  let body='';const result=results[r.id];
  if(r.type==='math')body=`${r.label?`<div class="region-label">${esc(r.label)}</div>`:''}<div class="math-content">${equationMarkup(r)}</div>${result?.error?`<div class="error-message"><span class="error-badge">${esc(result.code||'ERROR')}</span>${esc(result.error)}</div>`:''}`;
  else if(r.type==='text')body=`<div class="text-content text-${r.style||'body'}">${esc(r.text)}</div>`;
  else if(r.type==='diagram')body=beamSvg();
  else if(r.type==='image')body=`<img src="${esc(r.data)}" alt="${esc(r.alt||'Worksheet image')}" draggable="false">`;
  else if(r.type==='plot')body=result?.plot?plotSvg(r,result.plot):`<div class="${result?.error?'error-message':'inspector-hint'}" style="padding:35px">${esc(result?.error||'Calculating plot samples…')}</div>`;
  else if(r.type==='slider')body=`<div class="slider-content"><div class="slider-header"><strong>${esc(r.variable)}</strong><span class="slider-value">${esc(formatNumber(r.value))} ${esc(r.unit)}</span></div><input type="range" class="parameter-slider" aria-label="${esc(r.label||r.variable)}" min="${r.min}" max="${r.max}" step="${r.step}" value="${r.value}"><div class="slider-limits"><span>${r.min}</span><span>${esc(r.label||'Interactive parameter')}</span><span>${r.max}</span></div></div>${result?.error?`<div class="error-message">${esc(result.error)}</div>`:''}`;
  node.innerHTML=body+'<span class="region-drag" title="Drag to move region">⠿</span><span class="resize-handle" title="Resize region"></span><span class="region-index">'+(store.document.regions.indexOf(r)+1)+'</span>';
  if(r.type==='math')requestAnimationFrame(()=>{const math=node.querySelector('.math-content');if(!math)return;math.style.fontSize='23px';if(math.scrollWidth>math.clientWidth){const size=Math.max(16,23*math.clientWidth/math.scrollWidth);math.style.fontSize=size+'px';}});
}
function renderDocument(){
  const d=store.document;document.title=`Axiom Worksheet — ${d.name}`;
  for(const selector of ['#document-title','#nav-title','#breadcrumb-name'])$(selector).textContent=d.name;
  $('#tab-title').textContent=d.name+'.axw';$('#page-summary').textContent=`${d.pages} page${d.pages>1?'s':''} · engineering`;
  $('#region-count').textContent=`${d.regions.length} regions`;$('#undo-button').disabled=!store.undoStack.length;$('#redo-button').disabled=!store.redoStack.length;
  for(const [i,node]of pageNodes)if(i>=d.pages){node.remove();pageNodes.delete(i);}
  for(let i=0;i<d.pages;i++){
    let page=pageNodes.get(i);if(!page){page=document.createElement('section');page.className='page';page.dataset.page=i;page.setAttribute('aria-label','Worksheet page '+(i+1));page.innerHTML='<div class="page-header"></div><div class="page-footer"></div>';$('#pages').append(page);pageNodes.set(i,page);}page.style.top=i*(PAGE_HEIGHT+PAGE_GAP)+'px';
    page.querySelector('.page-header').innerHTML=i?`<span>${esc(d.name)}</span><span>ENGINEERING WORKSHEET</span>`:'';
    page.querySelector('.page-footer').innerHTML=`<span class="footer-brand">AXIOM WORKSHEET</span><span>Calculation note · ${esc(d.name)}</span><span class="page-number">${String(i+1).padStart(2,'0')} / ${String(d.pages).padStart(2,'0')}</span>`;
  }
  const active=new Set(d.regions.map(r=>r.id));for(const [id,node]of regionNodes)if(!active.has(id)){node.remove();regionNodes.delete(id);selected.delete(id);}
  for(const r of d.regions){let node=regionNodes.get(r.id);if(!node){node=document.createElement('div');node.dataset.region=r.id;node.setAttribute('role','group');regionNodes.set(r.id,node);}const parent=pageNodes.get(r.page||0);if(node.parentNode!==parent)parent.append(node);renderRegion(r);}
  updateZoomLayout();renderOutline();renderVariables();renderInspector();updateViewButtons();schedulePaint();
}
function updateZoomLayout(){const total=store.document.pages*(PAGE_HEIGHT+PAGE_GAP)-PAGE_GAP;$('#pages').style.height=total+'px';$('#pages').style.transform=`scale(${settings.zoom})`;$('#paper-stage').style.width=PAGE_WIDTH*settings.zoom+'px';$('#paper-stage').style.height=total*settings.zoom+'px';$('#scroll-content').style.minWidth=PAGE_WIDTH*settings.zoom+76+'px';$('#zoom-slider').value=settings.zoom*100;$('#zoom-value').textContent=Math.round(settings.zoom*100)+'%';}
function zoomTo(value,anchor=null){
  value=Math.max(.4,Math.min(1.6,value));const old=settings.zoom,rect=scrollViewport.getBoundingClientRect(),point=anchor||{x:rect.width/2,y:Math.min(rect.height/2,300)},scrollX=scrollViewport.scrollLeft,scrollY=scrollViewport.scrollTop;
  settings.zoom=value;updateZoomLayout();scrollViewport.scrollLeft=(scrollX+point.x)*value/old-point.x;scrollViewport.scrollTop=(scrollY+point.y-32)*value/old-point.y+32;persistSettings();schedulePaint();
}
function fitWidth(){zoomTo(Math.min(1.15,(scrollViewport.clientWidth-94)/PAGE_WIDTH),{x:0,y:0});scrollViewport.scrollLeft=0;}
function updateViewButtons(){
  $('.workbench').classList.toggle('no-outline',!settings.outline);$('.workbench').classList.toggle('no-inspector',!settings.inspector);$('#grid-button').classList.toggle('active',settings.grid);
  $$('[data-toggle]').forEach(b=>b.classList.toggle('active',!!settings[b.dataset.toggle]));
}
function renderOutline(){
  const headings=store.document.regions.filter(r=>r.type==='text'&&r.style==='section').sort((a,b)=>a.page-b.page||a.y-b.y);$('#outline-count').textContent=headings.length;
  $('#outline').innerHTML=headings.map((r,i)=>`<button data-select-region="${r.id}" class="${i===0?'active':''}"><span class="outline-number">${String(i+1).padStart(2,'0')}</span><span>${esc(r.text.replace(/^\d+\s+/,''))}</span></button>`).join('')||'<div class="inspector-hint" style="padding:0 10px">Add a section heading to build an outline.</div>';
}
function friendlyName(name){const parts=name.split('_'),map={delta:'δ',sigma:'σ',theta:'θ',omega:'ω',alpha:'α',beta:'β'};return esc(map[parts[0]]||parts[0])+(parts.length>1?`<sub>${esc(parts.slice(1).join('_'))}</sub>`:'');}
function renderVariables(){
  const unique=[...new Map(variables.map(v=>[v.name,v])).values()];$('#variables-count').textContent=unique.length;
  $('#variable-list').innerHTML=unique.map(v=>`<button class="variable-item" data-select-region="${v.regionId}" title="${esc(v.name+' = '+v.formatted.text)}"><span class="variable-name">${friendlyName(v.name)}</span><span class="variable-value">${esc(v.formatted.kind==='function'?'function':v.formatted.text)}</span></button>`).join('')||'<p class="inspector-hint">Define a variable with :=</p>';
}
function selectRegion(id,add=false,scroll=false){
  if(editing&&editing.id!==id)finishEditing(true);if(!add)selected.clear();if(id){if(add&&selected.has(id))selected.delete(id);else selected.add(id);}
  for(const [key,node]of regionNodes){node.classList.toggle('selected',selected.has(key));node.setAttribute('aria-selected',String(selected.has(key)));}
  renderInspector();if(scroll&&id){regionNodes.get(id)?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});$$('#outline button').forEach(b=>b.classList.toggle('active',b.dataset.selectRegion===id));}schedulePaint();
}
function field(label,key,value,type='text',extra=''){return `<div class="field"><label>${esc(label)}</label><input data-field="${key}" type="${type}" value="${esc(value??'')}" ${extra}></div>`;}
function renderInspector(){
  const body=$('#inspector-body');if(body.contains(document.activeElement)&&isTyping(document.activeElement))return;
  $$('[data-inspector]').forEach(b=>b.classList.toggle('active',b.dataset.inspector===inspectorTab));
  if(inspectorTab==='worksheet'){
    body.innerHTML=`<div class="inspector-title-row"><span class="inspector-type-icon">∴</span><div><strong>Worksheet settings</strong><small>Axiom document · v1</small></div></div><div class="inspector-label">DOCUMENT</div>${field('Worksheet title','doc:name',store.document.name)}${field('Default significant digits','doc:precision',store.document.precision,'number','min="2" max="12"')}<div class="inspector-label">CALCULATION</div><div class="field"><label>Calculation mode</label><select data-setting="auto"><option value="true" ${settings.auto?'selected':''}>Automatic</option><option value="false" ${!settings.auto?'selected':''}>Manual · press F9</option></select></div><div class="inspector-notice">SI dimensions are preserved internally. Set a display unit on any numeric region to convert its output.</div><div class="inspector-label">CANVAS</div><div class="field"><label>Grid snapping</label><select data-setting="snap"><option value="true" ${settings.snap?'selected':''}>On · 10 px</option><option value="false" ${!settings.snap?'selected':''}>Off</option></select></div><div class="field"><label>Page guides</label><select data-setting="margins"><option value="false" ${!settings.margins?'selected':''}>Hidden</option><option value="true" ${settings.margins?'selected':''}>Show margins</option></select></div><div class="inspector-label">DOCUMENT STATISTICS</div><p class="inspector-hint">${store.document.pages} pages · ${store.document.regions.length} regions<br>${variables.length} definitions<br>${latestCalculation?latestCalculation.duration.toFixed(2)+' ms last calculation':'Waiting for calculation'}<br>${latestCalculation?.cacheHits||0} regions reused from cache</p><div class="inspector-action-row"><button class="secondary-button" data-action="add-page">${icon('page')}Add page</button><button class="secondary-button" data-action="rename">Rename</button></div>`;return;
  }
  const r=current();
  if(!r){body.innerHTML=`<div class="empty-inspector"><div class="empty-icon">ƒx</div><strong>Your calculation, in focus.</strong><p>Select a region to edit its expression, units, precision, and position.</p><p>Double-click blank space on a page to add a new calculation.</p></div><button class="secondary-button" data-action="math">+ Insert math region</button>`;return;}
  if(selected.size>1){body.innerHTML=`<div class="inspector-title-row"><span class="inspector-type-icon">▧</span><div><strong>${selected.size} regions selected</strong><small>Move as a group</small></div></div><div class="inspector-action-row"><button class="secondary-button" data-action="duplicate">Duplicate</button><button class="secondary-button danger-button" data-action="delete">Delete</button></div><div class="inspector-label">ALIGNMENT</div><div class="inspector-action-row"><button class="secondary-button" data-action="align-left">Align left</button><button class="secondary-button" data-action="align-top">Align top</button></div><p class="inspector-hint">Shift-click to add or remove regions. Use arrow keys to move the selection. Shift + arrow moves 10 pixels.</p>`;return;}
  const result=results[r.id],types={math:['ƒx','Math region'],text:['T','Text region'],plot:['⌁','XY plot'],slider:['≡','Parameter slider'],diagram:['⌁','Beam diagram'],image:['▧','Image region']};
  let html=`<div class="inspector-title-row"><span class="inspector-type-icon">${types[r.type][0]}</span><div><strong>${esc(r.label||types[r.type][1])}</strong><small>${types[r.type][1]} · page ${r.page+1}</small></div></div>`;
  if(r.type==='math'){
    html+=`<div class="inspector-label">EXPRESSION <span class="subtle">Edit source</span></div><div class="field"><textarea data-field="source" spellcheck="false" aria-label="Math expression">${esc(r.source)}</textarea></div>`;
    if(result?.error)html+=`<div class="result-card error-result"><div class="result-eyebrow">${esc(result.code||'ERROR')}</div><div class="result-number">${esc(result.error)}</div></div>`;
    else if(result?.formatted){const f=result.formatted;html+=`<div class="result-card"><div class="result-eyebrow">${f.kind==='function'?'FUNCTION DEFINITION':f.kind==='symbolic'?'SYMBOLIC RESULT':'CALCULATED RESULT'}${calculationStale?' · STALE':''}</div><div class="result-number ${['matrix','function','symbolic'].includes(f.kind)?'small':''}">${f.kind==='scalar'?`${esc(f.boolean?(f.magnitude?'true':'false'):formatNumber(f.magnitude,r.precision))}<span class="result-unit">${esc(f.unit)}</span>`:esc(f.text)}</div><div class="result-footnote">${icon('check')} ${result.dependencies?.length?'Dependencies resolved':'Dimensionally consistent'}</div></div>`;}
    html+=`<div class="inspector-label">DISPLAY</div>${field('Region label','label',r.label)}<div class="field-row">${field('Output unit','outputUnit',r.outputUnit)}${field('Significant digits','precision',r.precision,'number','min="2" max="12"')}</div><div class="inspector-label">HIGHLIGHT</div><div class="swatches">${['default','green','blue','amber'].map(c=>`<button class="swatch ${r.color===c?'active':''}" data-color="${c}" title="${c} highlight" aria-label="${c} highlight"></button>`).join('')}</div>`;
    if(result?.dependencies?.length)html+=`<div class="inspector-label">DEPENDS ON</div><div class="dependency-chips">${[...new Set(result.dependencies)].map(n=>{const v=variables.find(v=>v.name===n);return `<button class="dependency-chip" ${v?`data-select-region="${v.regionId}"`:''}>${friendlyName(n)}</button>`;}).join('')}</div>`;
  }else if(r.type==='text'){
    html+=`<div class="inspector-label">TEXT</div><div class="field"><textarea data-field="text" rows="5" aria-label="Text content">${esc(r.text)}</textarea></div><div class="field"><label>Paragraph style</label><select data-field="style">${['body','title','subtitle','section','eyebrow','caption','callout'].map(s=>`<option value="${s}" ${r.style===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`).join('')}</select></div><p class="inspector-hint">Section headings automatically appear in the worksheet outline.</p>`;
  }else if(r.type==='plot'){
    html+=`<div class="inspector-label">PLOT SETUP</div>${field('Plot title','label',r.label)}<div class="field-row">${field('Variable','variable',r.variable)}${field('Samples / trace','samples',r.samples,'number','min="64" max="2048"')}</div><div class="field-row">${field('X minimum','xMin',r.xMin)}${field('X maximum','xMax',r.xMax)}</div><div class="field-row">${field('X unit','xUnit',r.xUnit)}${field('Y unit','yUnit',r.yUnit)}</div><div class="field-row">${field('Y min · blank = auto','yMin',r.yMin||'')}${field('Y max · blank = auto','yMax',r.yMax||'')}</div><div class="inspector-label">TRACES <button data-action="add-trace" class="icon-button tiny" title="Add trace">+</button></div>`;
    r.traces.forEach((t,i)=>{html+=`<div class="trace-editor"><div class="trace-title"><span style="color:${PALETTE[i%8]}">● &nbsp;Trace ${i+1}</span><button data-remove-trace="${i}" title="Remove trace" ${r.traces.length===1?'disabled':''}>×</button></div>${field('Expression',`trace:${i}:expression`,t.expression)}${field('Legend',`trace:${i}:label`,t.label)}</div>`;});
    if(result?.error)html+=`<p class="error-message">${esc(result.error)}</p>`;
  }else if(r.type==='slider'){
    html+=`<div class="inspector-label">PARAMETER</div>${field('Variable name','variable',r.variable)}${field('Label','label',r.label)}<div class="field-row">${field('Value','value',r.value,'number')}${field('Unit','unit',r.unit)}</div><div class="field-row">${field('Minimum','min',r.min,'number')}${field('Maximum','max',r.max,'number')}</div>${field('Step','step',r.step,'number','min="0.000000000001"')}<p class="inspector-hint">The slider defines a variable at this position in the worksheet. Regions below it can use the value.</p>`;
  }else if(r.type==='image')html+=`<div class="inspector-label">ACCESSIBILITY</div>${field('Alternative text','alt',r.alt)}<button class="secondary-button" data-action="replace-image">Replace image</button>`;
  else html+='<p class="inspector-hint">An annotated cantilever diagram. Span and loading annotations follow the example’s input regions.</p>';
  html+=`<div class="inspector-divider"></div><div class="inspector-label">POSITION & SIZE <span class="subtle">px</span></div><div class="field-row">${field('X','x',r.x,'number')}${field('Y','y',r.y,'number')}</div><div class="field-row">${field('Width','w',r.w,'number','min="100" max="860"')}${field('Height','h',r.h,'number','min="36" max="1192"')}</div>${field('Page','page',r.page+1,'number',`min="1" max="${store.document.pages}"`)}<div class="inspector-action-row"><button class="secondary-button" data-action="duplicate">${icon('copy')}Duplicate</button><button class="secondary-button danger-button" data-action="delete">${icon('trash')}Delete</button></div>`;
  body.innerHTML=html;
}
function ribbonButton(action,label,glyph,options={}){
  const attrs=options.template?`data-template="${esc(options.template)}"`:`data-action="${action}"`;
  return `<button class="ribbon-button ${options.primary?'primary':''}" ${attrs} title="${esc(options.title||label)}">${icons[glyph]?icon(glyph):`<span class="ribbon-symbol">${glyph}</span>`}<span>${label}</span></button>`;
}
const group=(label,content)=>`<div class="ribbon-group"><div class="ribbon-items">${content}</div><div class="ribbon-group-label">${label}</div></div>`;
const opGrid=(items)=>`<div class="ribbon-operator-grid">${items.map(([label,text,title])=>`<button data-insert="${esc(text)}" title="${esc(title||text)}">${label}</button>`).join('')}</div>`;
function renderRibbon(){
  $$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===activeRibbon);b.setAttribute('aria-selected',String(b.dataset.tab===activeRibbon));});let html='';
  if(activeRibbon==='Math'){
    html+=group('Calculation',ribbonButton('calculate','Calculate','=',{primary:true,title:'Recalculate worksheet (F9)'})+`<div class="ribbon-small-stack"><button data-action="auto">${icon('check')}${settings.auto?'Automatic':'Manual'}</button><button data-action="errors">${icon('info')}Check errors</button></div>`);
    html+=group('Regions',ribbonButton('math','Math','ƒx')+ribbonButton('text','Text','text')+ribbonButton('plot','XY plot','plot')+ribbonButton('image','Image','image'));
    html+=group('Operators',opGrid([['≔',':=','Define a variable'],['=','=','Evaluate'],['÷','/','Fraction'],['xⁿ','^','Power'],['√','sqrt()','Square root'],['|x|','abs()','Absolute value'],['≤','<=','Less than or equal'],['Σ','sum()','Sum']]));
    html+=group('Symbols',opGrid([['π','pi','Pi'],['α','alpha','Alpha'],['β','beta','Beta'],['δ','delta','Delta'],['θ','theta','Theta'],['σ','sigma','Sigma'],['ω','omega','Omega'],['λ','lambda','Lambda']]));
    html+=group('Structures',ribbonButton('matrix','Matrix','▦')+ribbonButton('function','Function','ƒ(x)')+ribbonButton('solve','Solve','{ }'));
    html+=group('Units',`<div class="ribbon-unit-box"><button data-action="units">SI system <span>⌄</span></button><button data-action="units" style="border:0;background:none;padding-left:0;color:#819079">Browse units ↗</button></div>`);
    html+=group('Interactive',ribbonButton('slider','Parameter','slider'));
  }else if(activeRibbon==='Matrices'){
    html+=group('Insert',ribbonButton('matrix','Matrix','▦',{primary:true})+ribbonButton('vector','Vector','[ ]')+ribbonButton('import-csv','Import CSV','import'));
    html+=group('Linear algebra',ribbonButton('','Determinant','det',{template:'det([4,1;2,3])'})+ribbonButton('','Inverse','A⁻¹',{template:'inv([4,1;2,3])'})+ribbonButton('','Transpose','Aᵀ',{template:'transpose([1,2;3,4])'})+ribbonButton('','Linear solve','Ax=b',{template:'lsolve([4,1;2,3],[9;13])'}));
    html+=group('Vectors',ribbonButton('','Dot product','a·b',{template:'dot([1,2,3],[4,5,6])'})+ribbonButton('','Norm','‖x‖',{template:'norm([3,4])'})+ribbonButton('','Range','a..b',{template:'range(0,10,1)'}));
    html+=group('Statistics',ribbonButton('','Mean','x̄',{template:'mean([1,2,3,4,5])'})+ribbonButton('','Deviation','σ',{template:'stdev([1,2,3,4,5])'})+ribbonButton('','Median','x̃',{template:'median([1,3,5,7])'}));
  }else if(activeRibbon==='Calculus'){
    html+=group('Numerical calculus',ribbonButton('','Integral','∫',{template:'integrate(sin(x),x,0,pi)',primary:true})+ribbonButton('','Derivative','ⅆ/ⅆx',{template:'deriv(sin(x),x,0)'})+ribbonButton('solve','Find root','f(x)=0'));
    html+=group('Symbolic algebra',ribbonButton('','Differentiate','∂',{template:'diff(x^3 + sin(x),x)'})+ribbonButton('','Simplify','→',{template:'simplify((x*1) + 0)'})+ribbonButton('function','Function','ƒ(x)'));
    html+=group('Aggregation',ribbonButton('','Summation','Σ',{template:'sum(range(1,100,1))'})+ribbonButton('','Product','Π',{template:'prod([1,2,3,4,5])'})+ribbonButton('','Conditional','if',{template:'if(3 > 2, 10, 0)'}));
    html+=group('Reference',ribbonButton('functions','Functions','ƒ')+ribbonButton('help','Syntax guide','help'));
  }else if(activeRibbon==='Plots'){
    html+=group('Insert a plot',ribbonButton('plot','XY plot','plot',{primary:true})+ribbonButton('slider','Parameter','slider'));
    html+=group('Trace tools',ribbonButton('add-trace','Add trace','+')+ribbonButton('plot-reset','Auto scale','fit')+ribbonButton('export-svg','Export SVG','export'));
    html+=group('Examples',ribbonButton('','Sine wave','∿',{template:'sin(x)'})+ribbonButton('waves','Wave sandbox','plot')+ribbonButton('beam','Beam example','document'));
    html+=group('Plot properties',ribbonButton('focus-inspector','Axes & units','settings')+ribbonButton('calculate','Resample','redo'));
  }else if(activeRibbon==='Document'){
    html+=group('Regions',ribbonButton('text','Text block','text',{primary:true})+ribbonButton('heading','Heading','H₁')+ribbonButton('caption','Caption','Tₓ')+ribbonButton('callout','Design note','info'));
    html+=group('Page',ribbonButton('add-page','Add page','page')+ribbonButton('image','Image','image')+ribbonButton('rename','Rename','document'));
    html+=group('Arrange',ribbonButton('align-left','Align left','⫷')+ribbonButton('align-top','Align top','⊤')+ribbonButton('duplicate','Duplicate','copy')+ribbonButton('delete','Delete','trash'));
    html+=group('Output',ribbonButton('save','Save','save')+ribbonButton('export','Export','export')+ribbonButton('print','Print / PDF','print'));
  }else{
    html+=group('Workspace',ribbonButton('toggle-outline','Navigator','panel-left')+ribbonButton('toggle-inspector','Inspector','panel-right')+ribbonButton('fullscreen','Full screen','fullscreen'));
    html+=group('Guides',ribbonButton('grid',settings.grid?'Grid on':'Grid off','grid',{primary:settings.grid})+ribbonButton('snap',settings.snap?'Snap on':'Snap off','⊞')+ribbonButton('margins','Margins','▣'));
    html+=group('Zoom',ribbonButton('zoom-in','Zoom in','+')+ribbonButton('zoom-out','Zoom out','−')+ribbonButton('actual-size','100%','1:1')+ribbonButton('fit','Fit width','fit'));
    html+=group('Diagnostics',ribbonButton('engine','Rendering engine','settings')+ribbonButton('errors','Region errors','info')+ribbonButton('help','Help','help'));
  }
  $('#ribbon').innerHTML=html;
}
function findInsertion(type,preferred){
  const base=preferred||insertPoint;let page=base?.page??Math.max(0,store.document.pages-1),x=base?.x??60,y=base?.y??100;const size=createRegion(type);let w=size.w,h=size.h;
  x=Math.max(20,Math.min(PAGE_WIDTH-w-20,x));y=Math.max(55,y);
  for(let attempt=0;attempt<store.document.regions.length+105;attempt++){
    if(y+h>PAGE_HEIGHT-50){page++;y=70;if(page>=100)throw Error('The 100-page document limit has been reached.');}
    const overlap=store.document.regions.filter(r=>(r.page||0)===page&&x<r.x+r.w+10&&x+w+10>r.x&&y<r.y+r.h+12&&y+h+12>r.y).sort((a,b)=>a.y-b.y)[0];
    if(!overlap)return {page,x:Math.round(x/GRID)*GRID,y:Math.round(y/GRID)*GRID};y=overlap.y+overlap.h+22;
  }
  throw Error('Could not find room for a new region.');
}
function insertRegion(type,options={},edit=false,preferred=null){
  finishEditing(true);const position=findInsertion(type,preferred);const region=createRegion(type,{...position,...options});
  if(region.x+region.w>PAGE_WIDTH-20)region.x=Math.max(20,PAGE_WIDTH-region.w-20);
  if(region.y+region.h>PAGE_HEIGHT-40){region.page++;region.y=70;}
  store.transaction('Insert '+type,d=>{d.pages=Math.max(d.pages,region.page+1);d.regions.push(region);});insertPoint=null;selectRegion(region.id,false,true);if(edit)setTimeout(()=>startEditing(region.id),0);return region;
}
function startEditing(id,replaceText){
  const r=store.get(id);if(!r||!['math','text'].includes(r.type))return;
  if(editing?.id===id)return;finishEditing(true);selectRegion(id);store.begin();editing={id,initial:r.type==='math'?r.source:r.text};
  const node=regionNodes.get(id);node.classList.add('editing');const input=document.createElement('textarea');input.className='region-editor';input.spellcheck=false;input.setAttribute('aria-label',r.type==='math'?'Edit math expression':'Edit text region');input.value=replaceText??editing.initial;
  node.append(input);const helper=document.createElement('div');helper.className='editor-helper';helper.textContent=r.type==='math'?'Enter to apply   ·   Esc to cancel   ·   := to define   ·   Tab to complete':'Ctrl/⌘ + Enter to apply   ·   Esc to cancel';node.append(helper);
  input.addEventListener('input',()=>{const item=store.get(id);if(!item)return;if(item.type==='math')item.source=input.value;else item.text=input.value;requestCalculate();autocomplete(input,node);});
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finishEditing(false);scrollViewport.focus({preventScroll:true});}
    else if(event.key==='Enter'&&(r.type==='math'&&!event.shiftKey||event.ctrlKey||event.metaKey)){event.preventDefault();event.stopPropagation();finishEditing(true);scrollViewport.focus({preventScroll:true});}
    else if(event.key==='Tab'){const suggestion=node.querySelector('.autocomplete button');if(suggestion){event.preventDefault();completeEditor(suggestion.dataset.completion);}else{event.preventDefault();finishEditing(true);const ordered=[...store.document.regions].filter(r=>['math','text'].includes(r.type)).sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x);const i=ordered.findIndex(r=>r.id===id);const next=ordered[(i+(event.shiftKey?-1:1)+ordered.length)%ordered.length];if(next)startEditing(next.id);}}
  });
  input.focus({preventScroll:true});if(replaceText!==undefined){r.type==='math'?r.source=replaceText:r.text=replaceText;input.setSelectionRange(input.value.length,input.value.length);requestCalculate();}else input.setSelectionRange(0,input.value.length);
}
function autocomplete(input,node){
  node.querySelector('.autocomplete')?.remove();if(current()?.type!=='math')return;const before=input.value.slice(0,input.selectionStart),word=before.match(/[\p{L}_][\p{L}\p{N}_]*$/u)?.[0];if(!word||word.length<2)return;
  const candidates=[...new Set([...variables.map(v=>v.name),...BUILTIN_NAMES,...UNITS.keys()])].filter(n=>n.startsWith(word)&&n!==word).slice(0,6);if(!candidates.length)return;
  const list=document.createElement('div');list.className='autocomplete';list.innerHTML=candidates.map(name=>`<button data-completion="${esc(name)}">${esc(name)}<span>${BUILTIN_NAMES.includes(name)?'function':UNITS.has(name)?'unit':'variable'}</span></button>`).join('');node.append(list);
}
function completeEditor(name){const input=regionNodes.get(editing?.id)?.querySelector('.region-editor');if(!input)return;const before=input.value.slice(0,input.selectionStart),word=before.match(/[\p{L}_][\p{L}\p{N}_]*$/u)?.[0]||'';const text=BUILTIN_NAMES.includes(name)?name+'()':name;input.setRangeText(text,input.selectionStart-word.length,input.selectionEnd,'end');if(text.endsWith('()'))input.setSelectionRange(input.selectionStart-1,input.selectionStart-1);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.parentElement.querySelector('.autocomplete')?.remove();}
function finishEditing(commit){
  if(!editing)return;const id=editing.id,node=regionNodes.get(id),input=node?.querySelector('.region-editor'),r=store.get(id);if(input&&r){if(r.type==='math')r.source=input.value;else r.text=input.value;}
  editing=null;node?.querySelector('.region-editor')?.remove();node?.querySelector('.editor-helper')?.remove();node?.querySelector('.autocomplete')?.remove();node?.classList.remove('editing');
  if(commit)store.commit('Edit region');else store.cancel();const fresh=store.get(id);if(fresh)renderRegion(fresh);requestCalculate();renderInspector();
}
function insertAtCaret(text){
  let r=current();if(!editing&&r?.type==='math'){startEditing(r.id);const input=regionNodes.get(r.id)?.querySelector('.region-editor');if(input)input.setSelectionRange(input.value.length,input.value.length);}
  if(editing){const input=regionNodes.get(editing.id)?.querySelector('.region-editor');if(!input)return;const start=input.selectionStart;input.setRangeText(text,start,input.selectionEnd,'end');if(text.endsWith('()'))input.setSelectionRange(start+text.length-1,start+text.length-1);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
  else insertRegion('math',{source:text},true);
}
function deleteSelection(){if(!selected.size)return;finishEditing(true);const ids=new Set(selected);selected.clear();store.transaction(`Delete ${ids.size} region(s)`,d=>{d.regions=d.regions.filter(r=>!ids.has(r.id));});}
function duplicateSelection(){if(!selected.size)return;finishEditing(true);const originals=store.document.regions.filter(r=>selected.has(r.id)),newIds=[];store.transaction('Duplicate regions',d=>{for(const original of originals){const r=structuredClone(original);r.id=createId();r.x=Math.min(PAGE_WIDTH-r.w-20,r.x+20);r.y+=30;if(r.y+r.h>PAGE_HEIGHT-40){r.page++;r.y=70;d.pages=Math.max(d.pages,r.page+1);}d.regions.push(r);newIds.push(r.id);}});selected=new Set(newIds);renderDocument();}
function alignSelection(axis){if(selected.size<2){toast('Select at least two regions with Shift-click.');return;}const items=store.document.regions.filter(r=>selected.has(r.id)),target=Math.min(...items.map(r=>r[axis]));store.transaction('Align regions',()=>items.forEach(r=>r[axis]=target));}
function updateProperty(key,value){
  const r=current();
  if(key.startsWith('doc:')){const field=key.slice(4);store.document[field]=field==='precision'?Math.max(2,Math.min(12,Math.round(Number(value)||5))):String(value).slice(0,120)||'Untitled worksheet';return;}
  if(!r)return;
  if(key.startsWith('trace:')){const [,index,part]=key.split(':');if(r.traces?.[Number(index)])r.traces[Number(index)][part]=String(value);return;}
  if(['x','y','w','h','page','precision','samples','value','min','max','step'].includes(key)){
    if(String(value).trim()===''||!Number.isFinite(Number(value)))return;value=Number(value);
    if(key==='w')value=Math.max(r.type==='plot'?280:100,Math.min(860,value));if(key==='h')value=Math.max(r.type==='plot'?160:36,Math.min(PAGE_HEIGHT-90,value));if(key==='page')value=Math.max(0,Math.min(store.document.pages-1,Math.round(value)-1));if(key==='precision')value=Math.max(2,Math.min(12,Math.round(value)));if(key==='samples')value=Math.max(64,Math.min(2048,Math.round(value)));if(key==='step')value=Math.max(1e-12,value);
  }
  r[key]=value;r.x=Math.max(20,Math.min(PAGE_WIDTH-r.w-20,r.x));r.y=Math.max(50,Math.min(PAGE_HEIGHT-r.h-24,r.y));
  if(r.type==='slider'){if(r.max<=r.min)r.max=r.min+1;r.value=Math.max(r.min,Math.min(r.max,r.value));r.step=Math.min(r.step,r.max-r.min);}
}
function modal(title,body,buttons=[]){finishEditing(true);$('#modal-title').textContent=title;$('#modal-body').innerHTML=body;$('#modal-footer').innerHTML=buttons.map((b,i)=>`<button class="${b.primary?'primary-button':'secondary-button'}" data-modal-button="${i}">${esc(b.label)}</button>`).join('');$('#modal-footer').onclick=e=>{const b=e.target.closest('[data-modal-button]');if(b)try{buttons[Number(b.dataset.modalButton)].action();}catch(error){toast(error.message,true);}};if(!$('#modal').open)$('#modal').showModal();fillIcons($('#modal'));}
const closeModal=()=>$('#modal').close();
function examplesDialog(){modal('A blank page. Endless possibilities.',`<p style="margin:0 0 20px">Start a worksheet or explore a working calculation. The current document remains available through Undo.</p><div class="modal-grid"><button class="example-card" data-example="beam"><div class="example-icon">⌁</div><strong>Cantilever beam</strong><small>Dimension-aware engineering.<br>Inputs, live plots, and verification.</small></button><button class="example-card" data-example="numerical"><div class="example-icon">∫</div><strong>Numerical sandbox</strong><small>Matrices, calculus, statistics,<br>and interactive wave parameters.</small></button><button class="example-card wide" data-example="blank"><div class="example-icon">+</div><div><strong>Blank worksheet</strong><small>A clean page for your next idea.</small></div></button></div>`);}
function loadExample(name){closeModal();finishEditing(true);selected.clear();results={};variables=[];insertPoint=null;store.replace(name==='beam'?beamExample():name==='numerical'?numericalExample():blankExample());scrollViewport.scrollTo(0,0);selectRegion(store.document.regions.find(r=>r.type==='math')?.id||null);requestCalculate(true);toast('Worksheet opened. Undo restores the previous document.');}
function renameDialog(){modal('Rename worksheet',`<div class="field"><label>Worksheet name</label><input id="rename-input" value="${esc(store.document.name)}" maxlength="120" autofocus></div>`,[{label:'Cancel',action:closeModal},{label:'Rename',primary:true,action:()=>{const name=$('#rename-input').value.trim();if(!name)throw Error('Enter a worksheet name.');store.transaction('Rename worksheet',d=>d.name=name);closeModal();}}]);$('#rename-input').select();}
function matrixDialog(){
  modal('Insert a matrix',`<div class="field-row">${field('Rows','unused',2,'number','id="matrix-rows" min="1" max="8"')}${field('Columns','unused',2,'number','id="matrix-cols" min="1" max="8"')}</div><div class="field"><label>Variable name · optional</label><input id="matrix-name" value="A_mat"></div><div id="matrix-input-grid" class="matrix-grid"></div><p>Entries may contain numbers or dimensional expressions. All entries must have compatible units. Matrix indices begin at 0.</p>`,[{label:'Cancel',action:closeModal},{label:'Insert matrix',primary:true,action:()=>{const rows=Number($('#matrix-rows').value),cols=Number($('#matrix-cols').value),inputs=$$('#matrix-input-grid input');const content=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>inputs[i*cols+j].value.trim()||'0').join(', ')).join('; ');const name=$('#matrix-name').value.trim();if(name&&!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name))throw Error('Use a valid variable name.');const source=(name?name+' := ':'')+'['+content+']';parse(source);closeModal();insertRegion('math',{source,label:'Matrix',w:440,h:Math.max(100,rows*31+40)});}}]);
  const grid=()=>{const rows=Math.max(1,Math.min(8,Math.round(Number($('#matrix-rows').value)||1))),cols=Math.max(1,Math.min(8,Math.round(Number($('#matrix-cols').value)||1)));$('#matrix-rows').value=rows;$('#matrix-cols').value=cols;$('#matrix-input-grid').style.gridTemplateColumns=`repeat(${cols},1fr)`;$('#matrix-input-grid').innerHTML=Array.from({length:rows*cols},(_,i)=>`<input aria-label="Row ${Math.floor(i/cols)+1}, column ${i%cols+1}" value="${rows===2&&cols===2?[4,1,2,3][i]:Math.floor(i/cols)===i%cols?1:0}">`).join('');};$('#matrix-rows').addEventListener('change',grid);$('#matrix-cols').addEventListener('change',grid);grid();
}
function solveDialog(){modal('Find a bracketed root',`<p>Solve f(x) = 0 with a bracketed bisection method. The bounds must enclose a sign change.</p><div class="field"><label>Expression</label><input id="solve-expression" value="x^3 - x - 2"></div><div class="field-row"><div class="field"><label>Variable</label><input id="solve-variable" value="x"></div><div class="field"><label>Result name</label><input id="solve-name" value="x_root"></div></div><div class="field-row"><div class="field"><label>Lower bound</label><input id="solve-low" value="1"></div><div class="field"><label>Upper bound</label><input id="solve-high" value="2"></div></div>`,[{label:'Cancel',action:closeModal},{label:'Insert root calculation',primary:true,action:()=>{const expr=$('#solve-expression').value,v=$('#solve-variable').value.trim(),name=$('#solve-name').value.trim();if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(v))throw Error('Enter a valid variable name.');const source=(name?name+' := ':'')+`root(${expr},${v},${$('#solve-low').value},${$('#solve-high').value})`;parse(source);closeModal();insertRegion('math',{source,label:'Bracketed root',w:570,h:92});}}]);}
function unitsDialog(){const units=[['Length','m mm cm km um in ft yd mile'],['Mass & time','kg g lb s ms min hr day'],['Force & pressure','N kN MN lbf Pa kPa MPa GPa bar psi ksi'],['Energy & power','J kJ W kW MW'],['Electrical','A mA V mV kV ohm kohm C F uF nF H Hz kHz MHz'],['Other','K mol cd rad deg pct rpm']];modal('Units & dimensions',`<p>Click a unit to insert it into the active expression, or set it as the selected region’s display unit.</p><div class="field"><label>Apply as</label><select id="unit-mode"><option value="display">Output display unit</option><option value="insert">Insert into expression</option></select></div>${units.map(([name,list])=>`<div class="help-section">${name}</div><div class="units-grid">${list.split(' ').map(u=>`<button class="unit-button" data-unit="${u}">${esc(u)}</button>`).join('')}</div>`).join('')}<p>Compound units: kN/m, mm^4, kg*m/s^2. Angles are dimensionless. Absolute temperature uses K; affine °C/°F conversion is not implemented.</p>`);}
function helpDialog(){
  modal('Axiom Worksheet · a living engineering notebook',`<p>Define variables, document your assumptions, and make your calculations readable. All calculations run on your device.</p><div class="help-section">Writing mathematics</div><div class="help-code">L := 3 m                     Define a quantity\nforce := 12 kN               Units stay attached\nforce / (25 mm)^2 -> MPa      Convert an evaluation\nf(x) := sin(x) + x^2          Define a function\nA_mat := [4,1;2,3]            Enter a matrix\nlsolve(A_mat,[9;13])          Solve A · x = b\nroot(x^2-2,x,0,2)             Bracketed root\nintegrate(sin(x),x,0,pi)      Numerical integration\ndiff(x^3 + sin(x),x)          Symbolic derivative</div><div class="help-section">Editing & navigation</div><div class="help-grid">${[['Edit a region','Double-click'],['Apply math edit','Enter'],['Cancel editing','Esc'],['Define a variable',':='],['Autocomplete','Tab'],['Command palette','Ctrl/⌘ K'],['Save document','Ctrl/⌘ S'],['Undo','Ctrl/⌘ Z'],['Redo','Ctrl/⌘ Shift Z'],['Recalculate','F9'],['Duplicate','Ctrl/⌘ D'],['Multiple selection','Shift-click'],['Move selection','Arrow keys'],['Larger movement','Shift + Arrow'],['Zoom at pointer','Ctrl/⌘ + wheel'],['Print or PDF','Ctrl/⌘ P']].map(([a,b])=>`<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div><div class="help-section">Calculation contract</div><p>Regions evaluate by page, then vertical position, then horizontal position. Definitions are visible below their position. Functions capture the values in scope at their definition. Matrices use zero-based indices; * is matrix multiplication, ^ is elementwise power, and hadamard(A,B) is elementwise multiplication. stdev is sample standard deviation.</p><div class="help-section">Rendering & scope</div><p>WebGPU renders page surfaces, grids, and sampled plot curves. Native MathML and DOM render accessible equations, text, and controls. A Canvas 2D backend keeps documents usable when WebGPU is unavailable. Numeric calculations use JavaScript binary64 in a worker, not GPU float32.</p><p>Axiom v${APP_VERSION} is an independently implemented Mathcad-inspired application, not Mathcad or a compatibility layer. It does not read .mcd/.mcdx files. Complex arithmetic, a general-purpose CAS, ODE solvers, 3D plots, structured equation-caret editing, and engineering certification are not included in this build.</p>`,[{label:'Start calculating',primary:true,action:closeModal}]);
}
function functionsDialog(){const templates={sin:'sin(pi/4)',cos:'cos(pi/4)',tan:'tan(pi/4)',exp:'exp(1)',ln:'ln(10)',sqrt:'sqrt(2)',abs:'abs(-5)',min:'min([1,2,3])',max:'max([1,2,3])',sum:'sum(1..10)',prod:'prod([1,2,3,4])',mean:'mean([1,2,3])',median:'median([1,2,3])',stdev:'stdev([1,2,3])',det:'det([4,1;2,3])',inv:'inv([4,1;2,3])',lsolve:'lsolve([4,1;2,3],[9;13])',integrate:'integrate(sin(x),x,0,pi)',deriv:'deriv(sin(x),x,0)',root:'root(x^2-2,x,0,2)',diff:'diff(x^3,x)',simplify:'simplify(x*1+0)',range:'range(0,10,.5)',if:'if(3>2,1,0)'};modal('Function library',`<p>Insert a working example and replace its arguments.</p><div class="units-grid" style="grid-template-columns:repeat(3,1fr)">${Object.entries(templates).map(([name,source])=>`<button class="unit-button" data-function-template="${esc(source)}" title="${esc(source)}">${name}</button>`).join('')}</div>`);}
function exportDialog(){modal('Export worksheet',`<p>Your worksheet is stored locally. Choose a portable format.</p><div class="modal-grid"><button class="example-card" data-export="json"><div class="example-icon">{ }</div><strong>Axiom document</strong><small>Editable .axw file with source, layout,<br>images, and plot settings.</small></button><button class="example-card" data-export="html"><div class="example-icon">▤</div><strong>HTML report</strong><small>Read-only, self-contained report<br>with vector plots and native math.</small></button><button class="example-card" data-export="csv"><div class="example-icon">▦</div><strong>Results CSV</strong><small>Expressions, calculated values,<br>units, and error diagnostics.</small></button><button class="example-card" data-export="print"><div class="example-icon">⎙</div><strong>Print / save as PDF</strong><small>Paginated A4 output through<br>your browser’s print dialog.</small></button></div>${calculationStale?'<p class="error-message">Results are currently stale. Recalculate before exporting a report.</p>':''}`);}
function downloadText(name,content,mime='text/plain'){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const safeName=()=>store.document.name.replace(/[\\/:*?"<>|]/g,'-').slice(0,100)||'worksheet';
function saveFile(){finishEditing(true);downloadText(safeName()+'.axw',JSON.stringify(store.document,null,2),'application/json');toast('Editable worksheet saved.');}
function ensureFresh(){if(calculationStale)throw Error('Recalculate the worksheet before exporting results. Press F9 and export again.');}
function exportCSV(){ensureFresh();const cell=s=>{s=String(s??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};const rows=[['Page','Region','Label','Expression','Result','Unit','Error']];for(const r of [...store.document.regions].sort((a,b)=>a.page-b.page||a.y-b.y||a.x-b.x)){const result=results[r.id];if(!result||r.type==='plot')continue;rows.push([r.page+1,r.id,r.label,result.source||r.source,result.formatted?.text||'',result.formatted?.unit||'',result.error||'']);}downloadText(safeName()+'.csv','\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
function reportMarkup(){
  finishEditing(true);ensureFresh();const pages=$('#pages').cloneNode(true);pages.querySelectorAll('.region-drag,.resize-handle,.region-index,.plot-hover-target,.region-editor,.editor-helper,.autocomplete').forEach(n=>n.remove());pages.querySelectorAll('.selected,.editing').forEach(n=>n.classList.remove('selected','editing'));pages.querySelectorAll('[data-region]').forEach(n=>{n.removeAttribute('aria-selected');n.classList.remove('error');});pages.querySelectorAll('.parameter-slider').forEach(n=>n.setAttribute('disabled',''));
  return pages.innerHTML;
}
function exportHTML(){const markup=reportMarkup(),style=document.querySelector('#axiom-style')?.textContent||'';downloadText(safeName()+'.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(store.document.name)} — Axiom report</title><style>${style}\nbody{overflow:auto;background:#edf1e9;padding:30px 10px}.report{width:900px;margin:0 auto}.report .page{position:relative!important;top:auto!important;left:auto!important;background:white;margin:0 0 25px}.print-trace{display:block}.region{content-visibility:visible!important}.report .region:hover{background:transparent;border-color:transparent}@media print{body{padding:0}.report{width:auto}.report .page{margin:0}}</style></head><body><main class="report">${markup}</main></body></html>`,'text/html');toast('Self-contained HTML report exported.');}
function exportSVG(){ensureFresh();const r=current();if(r?.type!=='plot'||!results[r.id]?.plot){toast('Select an XY plot first.');return;}const div=document.createElement('div');div.innerHTML=plotSvg(r,results[r.id].plot);const svg=div.querySelector('svg');svg.querySelectorAll('.print-trace').forEach(n=>{n.removeAttribute('class');});const style=document.createElementNS(SVG_NS,'style');style.textContent='text{font-family:Arial,sans-serif;fill:#788e77;font-size:10px}.plot-title{font-size:12px;fill:#415d45}.legend-text{font-size:9px}';svg.prepend(style);const rect=document.createElementNS(SVG_NS,'rect');rect.setAttribute('width','100%');rect.setAttribute('height','100%');rect.setAttribute('fill','white');svg.insertBefore(rect,style.nextSibling);svg.setAttribute('width',r.w);svg.setAttribute('height',r.h);downloadText(safeName()+'-plot.svg',new XMLSerializer().serializeToString(svg),'image/svg+xml');}
function printWorksheet(){finishEditing(true);if(calculationStale){requestCalculate(true);toast('Recalculating. Open Print again when calculation completes.');return;}closeModal();window.print();}
function engineDialog(){modal('Engine diagnostics',`<div class="help-code">Axiom Worksheet ${APP_VERSION}\nRenderer: ${renderer.mode}\nWebGPU exposed: ${!!navigator.gpu}\nSecure context: ${window.isSecureContext}\nAntialiasing: ${renderer.mode==='webgpu'?'4× MSAA + analytic edge fringe':'Canvas 2D'}\nVisible-frame vertices: ${renderer.vertexCount.toLocaleString()}\nVisible-frame draw calls: ${renderer.drawCalls}\nCPU geometry submission: ${(renderer.cpuSubmitMs||0).toFixed(3)} ms\nCalculation worker: ${workerFallback?'main-thread fallback':'module Web Worker'}\nLast calculation: ${latestCalculation?.duration.toFixed(3)||'—'} ms\nReused math regions: ${latestCalculation?.cacheHits??'—'}\nDocument regions: ${store.document.regions.length}\nNumeric representation: IEEE 754 binary64\nGPU geometry representation: IEEE 754 binary32</div>${rendererStatus.reason?`<p>${esc(rendererStatus.reason)}</p>`:''}<p>Submission time is a CPU measurement, not GPU execution time. Rendering is invalidation-driven: an idle worksheet does not run a continuous frame loop. Page geometry and plot traces are batched into a single GPU draw call.</p><p>Fallback verification: append <code>?renderer=canvas</code> to the app URL. Use localhost or HTTPS to enable WebGPU.</p>`,[{label:'Close',primary:true,action:closeModal}]);}
function errorsDialog(){const failures=store.document.regions.filter(r=>results[r.id]?.error);modal('Worksheet diagnostics',failures.length?`<p>${failures.length} region${failures.length===1?'':'s'} need attention.</p>${failures.map(r=>`<button class="command-result" data-error-region="${r.id}"><span class="command-symbol">!</span><span><strong>${esc(r.label||r.source||'Region')}</strong><br><small>${esc(results[r.id].error)}</small></span></button>`).join('')}`:'<div class="result-card"><div class="result-eyebrow">CALCULATION COMPLETE</div><div class="result-number" style="font-size:22px">All regions calculated</div><p>No evaluation errors were reported. This checks expression evaluation, not engineering correctness.</p></div>');}
let imageReplacement=null;
const actions={
  home:examplesDialog,examples:examplesDialog,new:examplesDialog,
  file:()=>modal('File',`<div class="modal-grid"><button class="example-card" data-action="new"><div class="example-icon">+</div><strong>New worksheet</strong><small>Choose a blank page or a working example.</small></button><button class="example-card" data-action="open"><div class="example-icon">↥</div><strong>Open worksheet</strong><small>Load an editable .axw or .json file.</small></button><button class="example-card" data-export="json"><div class="example-icon">↓</div><strong>Save worksheet</strong><small>Keep a portable copy of your work.</small></button><button class="example-card" data-action="export"><div class="example-icon">↗</div><strong>Export</strong><small>HTML report, CSV, or print / PDF.</small></button></div>`),
  open:()=>{closeModal();$('#open-file').click();},save:saveFile,undo:()=>{finishEditing(true);store.undo();},redo:()=>{finishEditing(true);store.redo();},rename:renameDialog,
  math:()=>insertRegion('math',{source:'',label:''},true),text:()=>insertRegion('text',{},true),plot:()=>insertRegion('plot'),image:()=>{imageReplacement=null;$('#image-file').click();},'replace-image':()=>{imageReplacement=current()?.id;$('#image-file').click();},
  matrix:matrixDialog,vector:()=>insertRegion('math',{source:'vector_data := [1,2,3]',label:'Vector',h:94},true),function:()=>insertRegion('math',{source:'f(x) := x^2',label:'User-defined function',w:480},true),solve:solveDialog,slider:()=>insertRegion('slider'),
  heading:()=>applyTextStyle('section','New section'),caption:()=>applyTextStyle('caption','Add a caption or reference.'),callout:()=>applyTextStyle('callout','DESIGN NOTE\nDocument an assumption, insight, or important result.'),
  calculate:()=>{finishEditing(true);requestCalculate(true);},auto:()=>{settings.auto=!settings.auto;persistSettings();renderRibbon();renderInspector();requestCalculate(settings.auto);toast(settings.auto?'Automatic calculation enabled.':'Manual calculation enabled. Press F9 to calculate.');},
  'toggle-outline':()=>toggleView('outline'),'toggle-inspector':()=>toggleView('inspector'),grid:()=>toggleView('grid'),snap:()=>toggleView('snap'),margins:()=>toggleView('margins'),
  'focus-inspector':()=>{settings.inspector=true;inspectorTab='region';updateViewButtons();renderInspector();schedulePaint();},
  fit:fitWidth,'zoom-in':()=>zoomTo(settings.zoom+.1),'zoom-out':()=>zoomTo(settings.zoom-.1),'actual-size':()=>zoomTo(1),
  fullscreen:async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){toast('Full-screen mode was not available: '+e.message,true);}},
  top:()=>scrollViewport.scrollTo({top:0,behavior:'smooth'}),
  'add-page':()=>{if(store.document.pages>=100)throw Error('The document already contains 100 pages.');store.transaction('Add page',d=>d.pages++);pageNodes.get(store.document.pages-1)?.scrollIntoView({behavior:'smooth',block:'start'});},
  duplicate:duplicateSelection,delete:deleteSelection,'align-left':()=>alignSelection('x'),'align-top':()=>alignSelection('y'),
  'add-trace':()=>{const r=current();if(r?.type!=='plot'){toast('Select an XY plot first.');return;}if(r.traces.length>=8)throw Error('A plot supports up to 8 traces.');store.transaction('Add plot trace',()=>r.traces.push({expression:`0.5*(${r.traces[0].expression})`,label:'Trace '+(r.traces.length+1)}));},
  'plot-reset':()=>{const r=current();if(r?.type!=='plot'){toast('Select an XY plot first.');return;}store.transaction('Auto-scale plot',()=>{r.yMin='';r.yMax='';});},
  units:unitsDialog,functions:functionsDialog,help:helpDialog,engine:engineDialog,errors:errorsDialog,commands:openCommands,export:exportDialog,'export-svg':exportSVG,'export-csv':exportCSV,'export-html':exportHTML,print:printWorksheet,
  'close-modal':closeModal,'import-csv':()=>$('#csv-file').click(),beam:()=>loadExample('beam'),waves:()=>{loadExample('numerical');setTimeout(()=>selectRegion('wave-plot',false,true),100);},
  copy:()=>copySelection(false),cut:()=>copySelection(true),paste:()=>pasteRegions(clipboard),'edit-region':()=>current()&&startEditing(current().id)
};
function runAction(name){try{const action=actions[name];if(action)action();}catch(error){toast(error.message,true);}}
function toggleView(key){settings[key]=!settings[key];persistSettings();updateViewButtons();renderRibbon();renderInspector();schedulePaint();}
function applyTextStyle(style,text){const r=current();if(r?.type==='text')store.transaction('Change text style',()=>r.style=style);else insertRegion('text',{style,text,h:style==='callout'?110:48},true);}
function copySelection(cut){if(!selected.size)return;finishEditing(true);clipboard=store.document.regions.filter(r=>selected.has(r.id)).map(r=>structuredClone(r));navigator.clipboard?.writeText('AXIOM_REGIONS:'+JSON.stringify(clipboard)).catch(()=>{});if(cut)deleteSelection();toast(`${clipboard.length} region${clipboard.length===1?'':'s'} copied.`);}
function pasteRegions(items){
  if(!Array.isArray(items)||!items.length){toast('Copy one or more regions first, or use Ctrl/⌘ V to paste from the clipboard.');return;}
  const validated=validateDocument({format:'axiom-worksheet',version:1,name:'Clipboard',pages:1,regions:items.map(r=>({...r,id:createId()}))}).regions;
  const ids=[];store.transaction('Paste regions',d=>{for(const region of validated){region.x=Math.min(PAGE_WIDTH-region.w-20,region.x+20);region.y+=30;if(region.y+region.h>PAGE_HEIGHT-40){region.page++;region.y=70;}if(region.page>=100)throw Error('The 100-page document limit has been reached.');d.pages=Math.max(d.pages,region.page+1);d.regions.push(region);ids.push(region.id);}});selected=new Set(ids);renderDocument();if(ids.length)regionNodes.get(ids[0])?.scrollIntoView({block:'center'});
}
const commandDefinitions=[
  ['New worksheet','new','Document','+'],['Open worksheet','open','Document','↥'],['Save editable worksheet','save','Document','↓'],['Export worksheet','export','Document','↗'],['Print / Save as PDF','print','Document','⎙'],['Rename worksheet','rename','Document','T'],['Insert math region','math','Insert','ƒx'],['Insert text region','text','Insert','T'],['Insert section heading','heading','Insert','H₁'],['Insert XY plot','plot','Insert','⌁'],['Insert matrix','matrix','Insert','▦'],['Insert parameter slider','slider','Insert','≡'],['Define a function','function','Math','ƒ'],['Find a root','solve','Math','{ }'],['Browse units','units','Math','m'],['Function library','functions','Math','ƒ'],['Import numeric CSV','import-csv','Data','▦'],['Recalculate worksheet','calculate','Calculation','='],['Undo last change','undo','Edit','↶'],['Redo change','redo','Edit','↷'],['Duplicate selection','duplicate','Edit','▧'],['Delete selection','delete','Edit','×'],['Add a page','add-page','Document','+'],['Toggle grid','grid','View','▦'],['Fit page width','fit','View','↔'],['Toggle navigator','toggle-outline','View','▤'],['Toggle inspector','toggle-inspector','View','▥'],['Rendering diagnostics','engine','Tools','⚙'],['Check region errors','errors','Tools','!'],['Help & keyboard shortcuts','help','Help','?'],['Cantilever beam example','beam','Examples','⌁'],['Interactive wave example','waves','Examples','∿']
];
let commandItems=[],commandIndex=0;
function openCommands(){finishEditing(true);if($('#modal').open)closeModal();if(!$('#command-dialog').open)$('#command-dialog').showModal();$('#command-input').value='';commandIndex=0;renderCommands();$('#command-input').focus();}
function renderCommands(){const query=$('#command-input').value.toLowerCase().trim();commandItems=commandDefinitions.filter(c=>c[0].toLowerCase().includes(query)).map(c=>({label:c[0],action:c[1],kind:c[2],symbol:c[3]}));if(query){for(const r of store.document.regions)if((r.label+' '+r.source+' '+r.text).toLowerCase().includes(query))commandItems.push({label:r.label||r.source||r.text.slice(0,60),region:r.id,kind:'Page '+(r.page+1),symbol:r.type==='math'?'ƒx':'¶'});}commandItems=commandItems.slice(0,50);commandIndex=Math.max(0,Math.min(commandItems.length-1,commandIndex));$('#command-results').innerHTML=commandItems.map((c,i)=>`<button class="command-result ${i===commandIndex?'selected':''}" data-command-index="${i}"><span class="command-symbol">${esc(c.symbol)}</span><span>${esc(c.label)}</span><span class="command-kind">${esc(c.kind)}</span></button>`).join('')||'<p style="padding:16px;color:#98aa8c">No matching command or region.</p>';}
function executeCommand(index){const c=commandItems[index];if(!c)return;$('#command-dialog').close();if(c.region)selectRegion(c.region,false,true);else runAction(c.action);}
$('#command-input').addEventListener('input',()=>{commandIndex=0;renderCommands();});
$('#command-dialog').addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();commandIndex=(commandIndex+(e.key==='ArrowDown'?1:-1)+commandItems.length)%Math.max(1,commandItems.length);renderCommands();$('#command-results .selected')?.scrollIntoView({block:'nearest'});}else if(e.key==='Enter'){e.preventDefault();executeCommand(commandIndex);}});
function showContextMenu(e,id){e.preventDefault();if(id&&!selected.has(id))selectRegion(id);const menu=$('#context-menu');menu.innerHTML=id?'<button data-action="edit-region">Edit region <small>Enter</small></button><button data-action="copy">Copy <small>Ctrl/⌘ C</small></button><button data-action="cut">Cut <small>Ctrl/⌘ X</small></button><button data-action="duplicate">Duplicate <small>Ctrl/⌘ D</small></button><hr><button data-action="delete" class="danger-button">Delete <small>Delete</small></button>':'<button data-action="math">Insert math region <small>ƒx</small></button><button data-action="text">Insert text region <small>T</small></button><button data-action="plot">Insert XY plot <small>⌁</small></button><button data-action="paste">Paste regions <small>Ctrl/⌘ V</small></button>';menu.hidden=false;menu.style.left=Math.min(innerWidth-205,e.clientX)+'px';menu.style.top=Math.min(innerHeight-215,e.clientY)+'px';}
// Delegated controls keep region creation/removal O(1) in listener count.
document.addEventListener('click',e=>{
  const target=e.target.closest('button');if(!target)return;
  try{
    if(target.dataset.tab){activeRibbon=target.dataset.tab;renderRibbon();}
    else if(target.dataset.inspector){inspectorTab=target.dataset.inspector;renderInspector();}
    else if(target.dataset.selectRegion)selectRegion(target.dataset.selectRegion,e.shiftKey,true);
    else if(target.dataset.errorRegion){closeModal();selectRegion(target.dataset.errorRegion,false,true);}
    else if(target.dataset.example)loadExample(target.dataset.example);
    else if(target.dataset.functionTemplate){closeModal();insertRegion('math',{source:target.dataset.functionTemplate,h:100,w:570});}
    else if(target.dataset.template){insertRegion('math',{source:target.dataset.template,h:100,w:520});}
    else if(target.hasAttribute('data-insert'))insertAtCaret(target.dataset.insert);
    else if(target.dataset.completion)completeEditor(target.dataset.completion);
    else if(target.dataset.unit){const mode=$('#unit-mode').value;closeModal();const r=current();if(mode==='display'&&r?.type==='math')store.transaction('Set display unit',()=>r.outputUnit=target.dataset.unit);else insertAtCaret(' '+target.dataset.unit);}
    else if(target.dataset.export){const kind=target.dataset.export;if(kind==='json'){closeModal();saveFile();}else if(kind==='html'){exportHTML();closeModal();}else if(kind==='csv'){exportCSV();closeModal();}else if(kind==='print')printWorksheet();}
    else if(target.dataset.color){const r=current();if(r)store.transaction('Highlight region',()=>r.color=target.dataset.color);}
    else if(target.hasAttribute('data-remove-trace')){const r=current();if(r?.type==='plot'&&r.traces.length>1)store.transaction('Remove trace',()=>r.traces.splice(Number(target.dataset.removeTrace),1));}
    else if(target.hasAttribute('data-command-index'))executeCommand(Number(target.dataset.commandIndex));
    else if(target.dataset.action)runAction(target.dataset.action);
  }catch(error){toast(error.message,true);}
  if(!target.closest('#context-menu')||target.dataset.action)$('#context-menu').hidden=true;
});
$('#inspector-body').addEventListener('focusin',e=>{if(e.target.dataset.field)store.begin();});
$('#inspector-body').addEventListener('input',e=>{
  const field=e.target.dataset.field;if(!field)return;store.begin();updateProperty(field,e.target.value);
  const r=current();if(r)renderRegion(r);if(!['x','y','w','h'].includes(field))requestCalculate();schedulePaint();
});
$('#inspector-body').addEventListener('change',e=>{if(e.target.dataset.setting){settings[e.target.dataset.setting]=e.target.value==='true';persistSettings();renderRibbon();updateViewButtons();schedulePaint();if(e.target.dataset.setting==='auto')requestCalculate();}});
$('#inspector-body').addEventListener('focusout',e=>{if(e.target.dataset.field){store.commit('Edit region property');requestCalculate();}});
$('#inspector-body').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();e.target.blur();}else if(e.key==='Escape'){store.cancel();e.target.blur();renderDocument();}});
$('#zoom-slider').addEventListener('input',e=>zoomTo(Number(e.target.value)/100));
scrollViewport.addEventListener('scroll',schedulePaint,{passive:true});
scrollViewport.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=scrollViewport.getBoundingClientRect();zoomTo(settings.zoom*Math.exp(-e.deltaY*.0015),{x:e.clientX-r.left,y:e.clientY-r.top});}},{passive:false});
function pagePosition(e,page){const r=page.getBoundingClientRect();return {page:Number(page.dataset.page),x:(e.clientX-r.left)/settings.zoom,y:(e.clientY-r.top)/settings.zoom};}
scrollViewport.addEventListener('dblclick',e=>{
  if(isTyping(e.target))return;const node=e.target.closest('[data-region]');if(node){const r=store.get(node.dataset.region);if(['math','text'].includes(r.type))startEditing(r.id);else{settings.inspector=true;inspectorTab='region';updateViewButtons();renderInspector();}return;}
  const page=e.target.closest('.page');if(page){insertPoint=pagePosition(e,page);insertRegion('math',{source:''},true,insertPoint);}
});
scrollViewport.addEventListener('contextmenu',e=>{const node=e.target.closest('[data-region]'),page=e.target.closest('.page');if(page&&!node)insertPoint=pagePosition(e,page);showContextMenu(e,node?.dataset.region);});
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('[data-insert],[data-completion]')){e.preventDefault();return;}
  if(!e.target.closest('#context-menu'))$('#context-menu').hidden=true;
  if(editing&&!e.target.closest('.region.editing')&&!e.target.closest('#inspector-body'))finishEditing(true);
});
scrollViewport.addEventListener('pointerdown',e=>{
  if(e.button!==0||isTyping(e.target)||e.target.closest('.region-editor,.autocomplete'))return;
  const node=e.target.closest('[data-region]');
  if(!node){const page=e.target.closest('.page');if(page){insertPoint=pagePosition(e,page);selectRegion(null);scrollViewport.focus({preventScroll:true});}return;}
  const id=node.dataset.region,r=store.get(id);if(e.shiftKey){selectRegion(id,true);return;}if(!selected.has(id))selectRegion(id);scrollViewport.focus({preventScroll:true});
  if(e.target.closest('.plot-hover-target')||r.type==='slider'&&!e.target.closest('.region-drag,.resize-handle'))return;
  const resize=!!e.target.closest('.resize-handle');drag={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,resize,started:false,items:store.document.regions.filter(r=>selected.has(r.id)).map(r=>({id:r.id,x:r.x,y:r.y,w:r.w,h:r.h,page:r.page}))};node.setPointerCapture(e.pointerId);e.preventDefault();
});
document.addEventListener('pointermove',e=>{
  if(!drag||drag.pointer!==e.pointerId)return;const dx=(e.clientX-drag.startX)/settings.zoom,dy=(e.clientY-drag.startY)/settings.zoom;if(!drag.started&&Math.hypot(dx,dy)<3)return;
  if(!drag.started){store.begin();drag.started=true;}const snap=n=>settings.snap&&!e.altKey?Math.round(n/GRID)*GRID:Math.round(n);
  if(drag.resize){const start=drag.items.find(r=>r.id===drag.id),r=store.get(drag.id);r.w=Math.max(r.type==='plot'?280:100,Math.min(PAGE_WIDTH-r.x-20,snap(start.w+dx)));r.h=Math.max(r.type==='plot'?160:36,Math.min(PAGE_HEIGHT-r.y-24,snap(start.h+dy)));renderRegion(r);}
  else{let gx=snap(dx),gy=snap(dy);for(const item of drag.items){gx=Math.max(20-item.x,Math.min(PAGE_WIDTH-item.x-item.w-20,gx));gy=Math.max(50-item.y,Math.min(PAGE_HEIGHT-item.y-item.h-24,gy));}for(const item of drag.items){const r=store.get(item.id);r.x=item.x+gx;r.y=item.y+gy;renderRegion(r);}}
  schedulePaint();
});
document.addEventListener('pointerup',e=>{if(!drag||drag.pointer!==e.pointerId)return;if(drag.started)store.commit(drag.resize?'Resize region':'Move regions');drag=null;renderInspector();});
document.addEventListener('pointercancel',()=>{if(drag?.started)store.cancel();drag=null;});
scrollViewport.addEventListener('focusout',e=>{if(e.target.classList.contains('region-editor'))setTimeout(()=>{if(editing&&!regionNodes.get(editing.id)?.contains(document.activeElement)&&!document.activeElement?.closest('[data-insert]'))finishEditing(true);},0);});
scrollViewport.addEventListener('input',e=>{
  if(!e.target.classList.contains('parameter-slider'))return;const r=store.get(e.target.closest('[data-region]').dataset.region);store.begin();r.value=Number(e.target.value);e.target.closest('.slider-content').querySelector('.slider-value').textContent=formatNumber(r.value)+' '+r.unit;requestCalculate();
});
scrollViewport.addEventListener('change',e=>{if(e.target.classList.contains('parameter-slider'))store.commit('Change parameter');});
scrollViewport.addEventListener('pointermove',e=>{
  const target=e.target.closest('.plot-hover-target'),tooltip=$('#plot-tooltip');if(!target||drag?.started){tooltip.hidden=true;return;}const node=target.closest('[data-region]'),r=store.get(node.dataset.region),p=results[r.id]?.plot;if(!p)return;
  const rect=node.getBoundingClientRect(),g=plotGeometry(r,p),local=(e.clientX-rect.left)/settings.zoom,x=p.xMin+(local-g.left)/g.width*(p.xMax-p.xMin),index=Math.max(0,Math.min(p.series[0].points.length-1,Math.round((x-p.xMin)/(p.xMax-p.xMin)*(p.series[0].points.length-1))));
  const xv=p.series[0].points[index][0];tooltip.innerHTML=`<strong>${esc(r.variable||'x')} = ${esc(formatNumber(xv,5))} ${esc(p.xUnit)}</strong>${p.series.map((s,i)=>`<div style="color:${PALETTE[i%8]}">${esc(s.label)}: ${s.points[index][1]===null?'undefined':esc(formatNumber(s.points[index][1],5))} ${esc(p.yUnit)}</div>`).join('')}`;const area=canvasArea.getBoundingClientRect();tooltip.style.left=Math.min(area.width-195,e.clientX-area.left+14)+'px';tooltip.style.top=Math.max(5,e.clientY-area.top-tooltip.offsetHeight-14)+'px';tooltip.hidden=false;
});
scrollViewport.addEventListener('pointerleave',()=>$('#plot-tooltip').hidden=true);
document.addEventListener('keydown',e=>{
  if($('#command-dialog').open||$('#modal').open)return;
  const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
  if(mod&&key==='s'){e.preventDefault();saveFile();return;}
  if(mod&&key==='k'){e.preventDefault();openCommands();return;}
  if(mod&&key==='p'){e.preventDefault();printWorksheet();return;}
  if(mod&&key==='o'){e.preventDefault();runAction('open');return;}
  if(e.key==='F9'){e.preventDefault();runAction('calculate');return;}
  if(isTyping(e.target))return;
  if(mod&&key==='z'){e.preventDefault();runAction(e.shiftKey?'redo':'undo');return;}
  if(mod&&key==='y'){e.preventDefault();runAction('redo');return;}
  if(mod&&key==='d'){e.preventDefault();duplicateSelection();return;}
  if(mod&&key==='a'){e.preventDefault();selected=new Set(store.document.regions.map(r=>r.id));renderDocument();return;}
  if(mod&&e.shiftKey&&key==='m'){e.preventDefault();runAction('math');return;}
  if(mod&&e.shiftKey&&key==='t'){e.preventDefault();runAction('text');return;}
  if(e.key==='Escape'){selectRegion(null);$('#context-menu').hidden=true;return;}
  if(e.key==='Delete'||e.key==='Backspace'){if(selected.size){e.preventDefault();deleteSelection();}return;}
  if(e.key==='Enter'||e.key==='F2'){const r=current();if(r&&['math','text'].includes(r.type)){e.preventDefault();startEditing(r.id);}return;}
  if(e.key.startsWith('Arrow')&&selected.size){e.preventDefault();const step=e.shiftKey?10:1,dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;store.transaction('Nudge regions',d=>d.regions.filter(r=>selected.has(r.id)).forEach(r=>{r.x=Math.max(20,Math.min(PAGE_WIDTH-r.w-20,r.x+dx));r.y=Math.max(50,Math.min(PAGE_HEIGHT-r.h-24,r.y+dy));}));return;}
  if(!mod&&!e.altKey&&e.key.length===1&&e.key!==' '&&!e.target.closest('button')){e.preventDefault();const r=current();if(r?.type==='math')startEditing(r.id,e.key);else insertRegion('math',{source:e.key},true);}
});
document.addEventListener('copy',e=>{if(isTyping(e.target)||!selected.size||$('#modal').open)return;clipboard=store.document.regions.filter(r=>selected.has(r.id)).map(r=>structuredClone(r));e.clipboardData.setData('text/plain','AXIOM_REGIONS:'+JSON.stringify(clipboard));e.preventDefault();});
document.addEventListener('cut',e=>{if(isTyping(e.target)||!selected.size||$('#modal').open)return;clipboard=store.document.regions.filter(r=>selected.has(r.id)).map(r=>structuredClone(r));e.clipboardData.setData('text/plain','AXIOM_REGIONS:'+JSON.stringify(clipboard));e.preventDefault();deleteSelection();});
document.addEventListener('paste',e=>{
  if(isTyping(e.target)||$('#modal').open||$('#command-dialog').open)return;const text=e.clipboardData.getData('text/plain');if(!text)return;e.preventDefault();try{if(text.startsWith('AXIOM_REGIONS:'))pasteRegions(JSON.parse(text.slice(14)));else{try{parse(text);insertRegion('math',{source:text.slice(0,20000),h:100,w:550});}catch{insertRegion('text',{text:text.slice(0,20000),h:Math.min(400,50+text.split('\n').length*24)});}}}catch(error){toast(error.message,true);}
});
$('#open-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>12e6)throw Error('The worksheet exceeds the 12 MB import limit.');const document=validateDocument(JSON.parse(await file.text()));finishEditing(true);selected.clear();results={};variables=[];store.replace(document);scrollViewport.scrollTo(0,0);requestCalculate(true);toast('Worksheet opened. Undo restores the previous document.');}catch(error){toast('Could not open worksheet: '+error.message,true);}
});
$('#image-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type))throw Error('Choose a PNG, JPEG, WebP or GIF image.');if(file.size>6e6)throw Error('Images are limited to 6 MB.');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read image.'));reader.readAsDataURL(file);});const image=new Image();image.src=data;await image.decode();if(imageReplacement&&store.get(imageReplacement)){store.transaction('Replace image',()=>{store.get(imageReplacement).data=data;});}else{const w=Math.min(680,image.naturalWidth),h=Math.min(700,w*image.naturalHeight/image.naturalWidth);insertRegion('image',{data,alt:file.name,w:Math.max(100,w),h:Math.max(50,h)});}imageReplacement=null;}catch(error){toast(error.message,true);}
});
export function parseCSV(text){
  if(text.length>2e6)throw Error('CSV import is limited to 2 MB.');const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field.length===0)quoted=!quoted;else throw Error('Malformed quoted CSV field.');}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}if(quoted)throw Error('Unterminated CSV quote.');row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
$('#csv-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>2e6)throw Error('CSV import is limited to 2 MB.');let rows=parseCSV((await file.text()).replace(/^\ufeff/,''));const isNumeric=row=>row.every(s=>s.trim()!==''&&Number.isFinite(Number(s.trim())));if(rows.length&& !isNumeric(rows[0]))rows=rows.slice(1);if(!rows.length||rows.some(r=>r.length!==rows[0].length||!isNumeric(r)))throw Error('Use a rectangular, numeric CSV table. One header row is allowed.');if(rows.length*rows[0].length>16384)throw Error('CSV tables are limited to 16,384 cells.');const source='table_data := ['+rows.map(r=>r.map(v=>String(Number(v))).join(',')).join(';')+']';if(source.length>20000)throw Error('The resulting matrix expression exceeds 20,000 characters.');insertRegion('math',{source,label:file.name,w:700,h:Math.min(500,60+rows.length*28)});toast(`Imported ${rows.length} × ${rows[0].length} numeric table.`);}catch(error){toast(error.message,true);}
});
store.subscribe((d,kind)=>{
  if(kind==='undo'||kind==='redo'||kind==='cancel')editing=null;
  renderDocument();persistDocument();requestCalculate();
});
const resizeObserver=new ResizeObserver(()=>schedulePaint());resizeObserver.observe(canvasArea);
window.addEventListener('resize',schedulePaint);
window.addEventListener('beforeunload',()=>{finishEditing(true);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(store.document));}catch{}});
window.addEventListener('pagehide',()=>{disposed=true;worker?.terminate();renderer.dispose();resizeObserver.disconnect();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
setupWorker();renderRibbon();renderDocument();requestCalculate(true);
renderer.initialize(new URLSearchParams(location.search).get('renderer')==='canvas');
if(restoreWarning)toast(restoreWarning,true);
// Small diagnostics surface for automation and extensions; document values are cloned on read.
window.axiom=Object.freeze({version:APP_VERSION,getDocument:()=>structuredClone(store.document),getResults:()=>structuredClone(results),getDiagnostics:()=>({renderer:renderer.mode,rendererStatus,worker:!workerFallback,calculationStale,duration:latestCalculation?.duration,errors:latestCalculation?.errors,cacheHits:latestCalculation?.cacheHits,vertices:renderer.vertexCount,drawCalls:renderer.drawCalls}),calculate:()=>requestCalculate(true),select:id=>selectRegion(id,false,true),loadExample,executeAction:runAction});
