/** Versioned document model and snapshot transactions. Persisted input is always validated. */
export const PAGE_WIDTH = 900;
export const PAGE_HEIGHT = 1272;
export const PAGE_GAP = 28;
export const GRID = 10;
export const APP_VERSION = '0.1.0';
export const createId = () => globalThis.crypto?.randomUUID?.() || `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const copy = value => structuredClone(value);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function createRegion(type, options={}) {
  const defaults={id:createId(),type,page:0,x:60,y:180,w:360,h:76,label:'',source:'',precision:5,outputUnit:'',text:'',style:'body',color:'default'};
  if(type==='text')Object.assign(defaults,{w:780,h:50,text:'Add your engineering notes here.'});
  if(type==='plot')Object.assign(defaults,{w:780,h:300,label:'XY plot',variable:'x',xMin:'0',xMax:'2*pi',xUnit:'',yUnit:'',traces:[{expression:'sin(x)',label:'sin(x)'},{expression:'cos(x)',label:'cos(x)'}],samples:512});
  if(type==='slider')Object.assign(defaults,{w:360,h:94,variable:'a',value:1,min:0,max:10,step:.1,unit:'',label:'Interactive parameter'});
  if(type==='diagram')Object.assign(defaults,{w:780,h:112});
  if(type==='image')Object.assign(defaults,{w:360,h:240,data:'',alt:'Worksheet illustration'});
  return {...defaults,...options};
}
export function createDocument(name='Untitled worksheet') {return {format:'axiom-worksheet',version:1,name,precision:5,pages:1,regions:[],created:new Date().toISOString(),modified:new Date().toISOString()};}
export function validateDocument(input) {
  if(!input||typeof input!=='object'||input.format!=='axiom-worksheet'||input.version!==1)throw new Error('This is not a supported Axiom Worksheet v1 document. Mathcad files are not supported.');
  if(!Array.isArray(input.regions)||input.regions.length>3000)throw new Error('A document may contain at most 3,000 regions.');
  const result=createDocument(String(input.name||'Untitled worksheet').slice(0,120));result.precision=clamp(Number(input.precision)||5,2,12);result.pages=clamp(Math.trunc(Number(input.pages)||1),1,100);
  const ids=new Set(),types=new Set(['math','text','plot','slider','image','diagram']);
  const number=(v,fallback,min,max)=>Number.isFinite(Number(v))?clamp(Number(v),min,max):fallback;
  result.regions=input.regions.map(raw=>{
    if(!raw||!types.has(raw.type))throw new Error('The document contains an unsupported region type.');
    const id=typeof raw.id==='string'&&/^[\w-]{1,100}$/.test(raw.id)?raw.id:createId();if(ids.has(id))throw new Error('Duplicate region identifiers are not allowed.');ids.add(id);
    const r=createRegion(raw.type,{id});
    r.w=number(raw.w,r.w,raw.type==='plot'?280:100,PAGE_WIDTH-40);r.h=number(raw.h,r.h,raw.type==='plot'?160:36,PAGE_HEIGHT-80);r.x=number(raw.x,60,20,PAGE_WIDTH-r.w-20);r.y=number(raw.y,180,50,PAGE_HEIGHT-r.h-24);r.page=Math.trunc(number(raw.page,0,0,99));result.pages=Math.max(result.pages,r.page+1);
    for(const key of ['label','source','outputUnit','text','variable','unit','xMin','xMax','yMin','yMax','xUnit','yUnit','alt'])if(typeof raw[key]==='string')r[key]=raw[key].slice(0,key==='text'?20000:key==='source'?20000:500);
    r.precision=Math.trunc(number(raw.precision,5,2,12));r.style=['body','title','subtitle','section','eyebrow','caption','callout'].includes(raw.style)?raw.style:'body';r.color=['default','green','blue','amber'].includes(raw.color)?raw.color:'default';
    if(raw.type==='slider'){r.min=number(raw.min,0,-1e12,1e12);r.max=number(raw.max,10,r.min+1e-9,1e12);if(r.max<=r.min)r.max=r.min+1;r.value=number(raw.value,1,r.min,r.max);r.step=number(raw.step,.1,1e-12,r.max-r.min);if(!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(r.variable))throw new Error('Invalid slider variable name.');}
    if(raw.type==='plot'){r.samples=Math.trunc(number(raw.samples,512,64,2048));if(Array.isArray(raw.traces))r.traces=raw.traces.slice(0,8).map(t=>({expression:String(t.expression||'sin(x)').slice(0,20000),label:String(t.label||t.expression||'Trace').slice(0,100)}));if(!r.traces.length)r.traces=[{expression:'sin(x)',label:'sin(x)'}];}
    if(raw.type==='image'){if(typeof raw.data!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(raw.data)||raw.data.length>8e6)throw new Error('Only embedded PNG, JPEG, WebP and GIF images up to 6 MB are supported.');r.data=raw.data;}
    return r;
  });
  result.created=typeof input.created==='string'?input.created:result.created;return result;
}
export class DocumentStore {
  constructor(document){this.document=validateDocument(document);this.undoStack=[];this.redoStack=[];this.listeners=new Set();this.transactionStart=null;}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  notify(kind='change'){for(const f of this.listeners)f(this.document,kind);}
  begin(){if(!this.transactionStart)this.transactionStart=copy(this.document);}
  commit(label='Edit worksheet'){
    if(!this.transactionStart)return;
    const before=this.transactionStart;this.transactionStart=null;
    if(JSON.stringify(before)===JSON.stringify(this.document))return;
    this.undoStack.push({document:before,label});if(this.undoStack.length>80)this.undoStack.shift();this.redoStack=[];this.document.modified=new Date().toISOString();this.notify('commit');
  }
  transaction(label,action){this.begin();try{action(this.document);this.commit(label);}catch(e){this.cancel();throw e;}}
  cancel(){if(this.transactionStart){this.document=this.transactionStart;this.transactionStart=null;this.notify('cancel');}}
  undo(){if(this.transactionStart)this.commit();const state=this.undoStack.pop();if(!state)return;this.redoStack.push({document:copy(this.document),label:state.label});this.document=state.document;this.notify('undo');}
  redo(){const state=this.redoStack.pop();if(!state)return;this.undoStack.push({document:copy(this.document),label:state.label});this.document=state.document;this.notify('redo');}
  replace(document){this.transaction('Open worksheet',()=>{this.document=validateDocument(document);});}
  get(id){return this.document.regions.find(r=>r.id===id);}
}
export function beamExample(){
  const d=createDocument('Cantilever beam');
  const add=(type,id,x,y,w,h,extra)=>d.regions.push(createRegion(type,{id,x,y,w,h,...extra}));
  const text=(id,y,text,style='body',h=36)=>add('text',id,60,y,780,h,{text,style});
  const math=(id,x,y,source,label,outputUnit='',w=370,h=80)=>add('math',id,x,y,w,h,{source,label,outputUnit});
  text('eyebrow',64,'STRUCTURAL ENGINEERING  /  CALCULATION NOTE','eyebrow',26);
  text('title',96,'Cantilever beam','title',52);
  text('subtitle',153,'Elastic response under a uniformly distributed load','subtitle',32);
  text('meta',202,'PROJECT  AW–024     /     REVISION  01     /     METHOD  Euler–Bernoulli','caption',26);
  add('diagram','beam-diagram',60,250,780,120,{});
  text('section-inputs',398,'01   Design parameters','section');
  math('length',60,458,'L := 3 m','Span length','m');
  math('load',460,458,'q_load := 4 kN/m','Distributed load','kN/m');
  math('modulus',60,554,'E := 210 GPa','Young’s modulus','GPa');
  math('width',460,554,'b := 100 mm','Section width','mm');
  math('height',60,650,'h := 180 mm','Section height','mm');
  math('inertia',460,650,'I := b*h^3/12','Second moment of area','mm^4');
  text('section-response',754,'02   Deflection response','section');
  math('deflection-function',60,812,'v(x) := q_load*x^2*(6*L^2 - 4*L*x + x^2)/(24*E*I)','Elastic curve','',780,104);
  add('plot','deflection-plot',60,944,780,250,{label:'Deflection along the span',variable:'x',xMin:'0 m',xMax:'L',xUnit:'m',yUnit:'mm',traces:[{expression:'v(x)',label:'Design load'},{expression:'0.6*v(x)',label:'60% load'}]});
  d.pages=2;
  const p2=(type,id,x,y,w,h,extra)=>add(type,id,x,y,w,h,{page:1,...extra});
  p2('text','section-check',60,70,780,36,{text:'03   Serviceability verification',style:'section'});
  p2('text','check-description',60,125,780,58,{text:'Compare the maximum elastic deflection at the free end with the project’s span / 250 serviceability limit.',style:'body'});
  p2('math','tip-deflection',60,210,370,88,{source:'delta_max := v(L)',label:'Maximum tip deflection',outputUnit:'mm',color:'green'});
  p2('math','allowable',460,210,370,88,{source:'delta_allow := L/250',label:'Allowable deflection',outputUnit:'mm'});
  p2('math','utilization',60,330,370,88,{source:'utilization := delta_max/delta_allow',label:'Deflection utilization',outputUnit:'pct'});
  p2('math','verification',460,330,370,88,{source:'delta_max <= delta_allow',label:'Serviceability requirement',color:'green'});
  p2('text','assumptions-heading',60,478,780,36,{text:'04   Assumptions & references',style:'section'});
  p2('text','assumptions',60,541,780,164,{text:'Linear-elastic, homogeneous material. Prismatic rectangular cross-section. Small displacements. Ideal fixed support and a static, uniformly distributed transverse load. Shear deformation is neglected.\n\nDeflection: v(L) = q · L⁴ / (8 · E · I). Second moment: I = b · h³ / 12. Verify these assumptions independently for the intended application.',style:'body'});
  p2('text','note',60,763,780,96,{text:'DESIGN NOTE\nThis worked example demonstrates the calculation engine. It is not a code-compliance check or an independently validated structural design.',style:'callout'});
  p2('text','tip',60,909,780,66,{text:'Try it: return to page 1 and change the span or load. All dependent results and the plot recalculate automatically. Double-click any math region to edit.',style:'caption'});
  return d;
}
export function numericalExample(){
  const d=createDocument('Numerical sandbox');
  const t=(id,y,text,style='section',h=36)=>d.regions.push(createRegion('text',{id,y,text,style,h}));
  const m=(id,x,y,source,label='',extra={})=>d.regions.push(createRegion('math',{id,x,y,source,label,w:370,h:94,...extra}));
  t('sandbox-title',70,'Numerical sandbox','title',54);t('sandbox-sub',140,'Matrices, numerical methods, symbolic algebra and interactive parameters.','subtitle',40);
  t('matrix-heading',224,'01   Linear algebra');
  m('matrix-a',60,285,'A_mat := [4,1;2,3]','Coefficient matrix');m('matrix-b',460,285,'b_vec := [9;13]','Right-hand side');
  m('matrix-solution',60,420,'lsolve(A_mat,b_vec)','Pivoted LU solution');m('matrix-det',460,420,'det(A_mat)','Determinant');
  t('calculus-heading',570,'02   Calculus & symbolic expressions');
  m('integral',60,632,'integrate(sin(t),t,0,pi)','Adaptive Simpson integration');m('root',460,632,'root(t^3-t-2,t,1,2)','Bracketed root solver');
  m('symbolic',60,770,'diff(t^3+sin(t),t)','Symbolic differentiation',{w:780,h:106});
  t('stats-heading',940,'03   Statistics');m('stats',60,1004,'mean([12.1,11.8,12.4,12,11.9])','Sample mean');m('std',460,1004,'stdev([12.1,11.8,12.4,12,11.9])','Sample standard deviation');
  d.pages=2;
  d.regions.push(createRegion('text',{id:'parameter-title',page:1,y:70,text:'04   Parametric exploration',style:'section'}));
  d.regions.push(createRegion('slider',{id:'amplitude',page:1,x:60,y:148,w:370,h:100,variable:'amplitude',label:'Amplitude',value:1,min:.1,max:3,step:.1}));
  d.regions.push(createRegion('slider',{id:'frequency',page:1,x:460,y:148,w:370,h:100,variable:'frequency',label:'Frequency',value:1,min:.1,max:4,step:.1}));
  d.regions.push(createRegion('plot',{id:'wave-plot',page:1,y:300,h:430,xMin:'0',xMax:'4*pi',traces:[{expression:'amplitude*sin(frequency*x)',label:'Signal'},{expression:'amplitude*cos(frequency*x)',label:'Quadrature'}]}));
  return d;
}
export function blankExample(){const d=createDocument();d.regions=[createRegion('text',{y:70,text:'Untitled worksheet',style:'title',h:60}),createRegion('text',{y:145,text:'Your engineering calculations, clearly documented.',style:'subtitle',h:42}),createRegion('math',{id:'first-calculation',y:240,source:'a := 10',label:'Start calculating'})];return d;}
