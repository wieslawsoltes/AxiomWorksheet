/** Axiom numerical kernel. No eval, Function constructor, DOM or third-party runtime. */
export class MathError extends Error {
  constructor(message, code = 'MATH_ERROR', position = -1) { super(message); this.name = 'MathError'; this.code = code; this.position = position; }
}
const Z = Object.freeze([0, 0, 0, 0, 0, 0, 0]);
const MAX_CELLS = 16384;
const isMatrix = Array.isArray;
const flat = v => isMatrix(v) ? v.flat() : [v];
const map = (v, fn) => isMatrix(v) ? v.map(r => r.map(fn)) : fn(v);
const sameDim = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-10);
const dimAdd = (a, b, scale = 1) => a.map((x, i) => x + b[i] * scale);
const dimScale = (a, s) => a.map(x => x * s);
const finite = n => { if (!Number.isFinite(n)) throw new MathError('The result is not a finite real number.', 'DOMAIN'); return n; };
const scalar = q => { if (!(q instanceof Quantity) || isMatrix(q.v)) throw new MathError('A scalar value is required.', 'TYPE'); return q.v; };
const dimensionless = q => { if (!sameDim(q.d, Z)) throw new MathError('This operation requires a dimensionless value.', 'UNITS'); return q; };
export class Quantity {
  constructor(value, dimensions = Z, boolean = false) {
    if (isMatrix(value) && (!value.length || !isMatrix(value[0]) || !value[0].length || value.length * value[0].length > MAX_CELLS || value.some(r => !isMatrix(r) || r.length !== value[0].length))) throw new MathError('Matrix dimensions are invalid or exceed 16,384 cells.', 'SHAPE');
    flat(value).forEach(finite); this.v = value; this.d = [...dimensions]; this.boolean = boolean;
  }
}
const q = (v, d = Z, boolean = false) => new Quantity(v, d, boolean);
function pair(a, b, fn, broadcast = true) {
  if (!isMatrix(a) && !isMatrix(b)) return finite(fn(a, b));
  if (!isMatrix(a)) { if (!broadcast) throw new MathError('Matrix shapes must match.', 'SHAPE'); return map(b, y => finite(fn(a, y))); }
  if (!isMatrix(b)) { if (!broadcast) throw new MathError('Matrix shapes must match.', 'SHAPE'); return map(a, x => finite(fn(x, b))); }
  if (a.length !== b.length || a[0].length !== b[0].length) throw new MathError('Matrix shapes must match.', 'SHAPE');
  return a.map((r, i) => r.map((v, j) => finite(fn(v, b[i][j]))));
}
function checkQ(v) { if (!(v instanceof Quantity)) throw new MathError('A numeric value is required here.', 'TYPE'); return v; }
function add(a, b, sign = 1) { checkQ(a); checkQ(b); if (!sameDim(a.d, b.d)) throw new MathError(`Incompatible units: ${dimensionText(a.d) || 'dimensionless'} and ${dimensionText(b.d) || 'dimensionless'}.`, 'UNITS'); return q(pair(a.v, b.v, (x, y) => x + sign * y), a.d); }
function mul(a, b) {
  checkQ(a); checkQ(b); const d = dimAdd(a.d, b.d);
  if (!isMatrix(a.v) || !isMatrix(b.v)) return q(pair(a.v, b.v, (x, y) => x * y), d);
  const A = a.v, B = b.v; if (A[0].length !== B.length) throw new MathError(`Cannot multiply ${A.length}×${A[0].length} by ${B.length}×${B[0].length}.`, 'SHAPE');
  const C = Array.from({ length: A.length }, () => Array(B[0].length).fill(0));
  for (let i = 0; i < A.length; i++) for (let k = 0; k < B.length; k++) for (let j = 0; j < B[0].length; j++) C[i][j] += A[i][k] * B[k][j];
  return q(C, d);
}
function div(a, b) { checkQ(a); checkQ(b); return q(pair(a.v, b.v, (x, y) => { if (y === 0) throw new MathError('Division by zero.', 'DIV_ZERO'); return x / y; }), dimAdd(a.d, b.d, -1)); }
function power(a, b) { checkQ(a); const n = scalar(dimensionless(checkQ(b))); return q(map(a.v, x => finite(x ** n)), dimScale(a.d, n)); }
function fact(a) { const n = scalar(dimensionless(a)); if (!Number.isInteger(n) || n < 0 || n > 170) throw new MathError('Factorial requires an integer from 0 to 170.', 'DOMAIN'); let v = 1; for (let i = 2; i <= n; i++) v *= i; return q(v); }

export const UNITS = new Map();
const unit = (names, n, d) => names.split(' ').forEach(name => UNITS.set(name, q(n, d)));
unit('m', 1, [1,0,0,0,0,0,0]); unit('mm', .001, [1,0,0,0,0,0,0]); unit('cm', .01, [1,0,0,0,0,0,0]); unit('km', 1000, [1,0,0,0,0,0,0]); unit('um μm', 1e-6, [1,0,0,0,0,0,0]);
unit('in inch', .0254, [1,0,0,0,0,0,0]); unit('ft', .3048, [1,0,0,0,0,0,0]); unit('yd', .9144, [1,0,0,0,0,0,0]); unit('mile', 1609.344, [1,0,0,0,0,0,0]);
unit('kg', 1, [0,1,0,0,0,0,0]); unit('g', .001, [0,1,0,0,0,0,0]); unit('mg', 1e-6, [0,1,0,0,0,0,0]); unit('lb', .45359237, [0,1,0,0,0,0,0]); unit('tonne', 1000, [0,1,0,0,0,0,0]);
unit('s', 1, [0,0,1,0,0,0,0]); unit('ms', .001, [0,0,1,0,0,0,0]); unit('us', 1e-6, [0,0,1,0,0,0,0]); unit('min', 60, [0,0,1,0,0,0,0]); unit('hr', 3600, [0,0,1,0,0,0,0]); unit('day', 86400, [0,0,1,0,0,0,0]);
unit('A', 1, [0,0,0,1,0,0,0]); unit('mA', .001, [0,0,0,1,0,0,0]); unit('K', 1, [0,0,0,0,1,0,0]); unit('mol', 1, [0,0,0,0,0,1,0]); unit('cd', 1, [0,0,0,0,0,0,1]);
unit('N', 1, [1,1,-2,0,0,0,0]); unit('kN', 1000, [1,1,-2,0,0,0,0]); unit('MN', 1e6, [1,1,-2,0,0,0,0]); unit('lbf', 4.4482216152605, [1,1,-2,0,0,0,0]);
unit('Pa', 1, [-1,1,-2,0,0,0,0]); unit('kPa', 1000, [-1,1,-2,0,0,0,0]); unit('MPa', 1e6, [-1,1,-2,0,0,0,0]); unit('GPa', 1e9, [-1,1,-2,0,0,0,0]); unit('bar', 1e5, [-1,1,-2,0,0,0,0]); unit('psi', 6894.757293168, [-1,1,-2,0,0,0,0]); unit('ksi', 6894757.293168, [-1,1,-2,0,0,0,0]);
unit('J', 1, [2,1,-2,0,0,0,0]); unit('kJ', 1000, [2,1,-2,0,0,0,0]); unit('W', 1, [2,1,-3,0,0,0,0]); unit('kW', 1000, [2,1,-3,0,0,0,0]); unit('MW', 1e6, [2,1,-3,0,0,0,0]);
unit('Hz', 1, [0,0,-1,0,0,0,0]); unit('kHz', 1000, [0,0,-1,0,0,0,0]); unit('MHz', 1e6, [0,0,-1,0,0,0,0]);
unit('C', 1, [0,0,1,1,0,0,0]); unit('V', 1, [2,1,-3,-1,0,0,0]); unit('mV', .001, [2,1,-3,-1,0,0,0]); unit('kV', 1000, [2,1,-3,-1,0,0,0]); unit('ohm Ω', 1, [2,1,-3,-2,0,0,0]); unit('kohm kΩ', 1000, [2,1,-3,-2,0,0,0]);
unit('F', 1, [-2,-1,4,2,0,0,0]); unit('uF μF', 1e-6, [-2,-1,4,2,0,0,0]); unit('nF', 1e-9, [-2,-1,4,2,0,0,0]); unit('H', 1, [2,1,-2,-2,0,0,0]);
unit('rad', 1, Z); unit('deg', Math.PI / 180, Z); unit('pct', .01, Z); unit('rpm', 2*Math.PI/60, [0,0,-1,0,0,0,0]);
const CONSTANTS = new Map([['pi', q(Math.PI)], ['π', q(Math.PI)], ['e', q(Math.E)], ['tau', q(2*Math.PI)], ['true', q(1,Z,true)], ['false',q(0,Z,true)], ['ORIGIN',q(0)]]);
export const BUILTIN_NAMES = ['sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh','exp','ln','log','log10','sqrt','abs','floor','ceil','round','sign','min','max','sum','prod','mean','median','stdev','std','norm','rows','cols','length','transpose','det','inv','lsolve','zeros','ones','eye','range','dot','hadamard','integrate','deriv','root','diff','simplify','if','factorial'];

export function tokenize(source) {
  if (typeof source !== 'string' || source.length > 20000) throw new MathError('Expression is missing or too long.', 'LIMIT');
  source = source.replace(/[×·]/g,'*').replace(/÷/g,'/').replace(/[−–]/g,'-').replace(/≤/g,'<=').replace(/≥/g,'>=').replace(/≠/g,'!=').replace(/→/g,'->').replace(/√/g,'sqrt');
  const out = []; let i = 0;
  while (i < source.length) {
    if (/\s/u.test(source[i])) { i++; continue; }
    const rest = source.slice(i); let m;
    if ((m = rest.match(/^(?:\d+\.(?!\.)\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/))) { out.push({type:'number',value:Number(m[0]),pos:i}); i += m[0].length; }
    else if ((m = rest.match(/^[\p{L}_][\p{L}\p{N}_]*/u))) { out.push({type:'id',value:m[0],pos:i}); i += m[0].length; }
    else if ((m = rest.match(/^(?::=|<=|>=|==|!=|->|\.\.|[+\-*/^(),;\[\]<>!='])/))) { out.push({type:m[0],value:m[0],pos:i}); i += m[0].length; }
    else throw new MathError(`Unexpected character “${source[i]}”.`, 'SYNTAX', i);
    if (out.length > 4000) throw new MathError('Expression has too many tokens.', 'LIMIT');
  }
  out.push({type:'eof',value:'',pos:i}); return out;
}
export function parse(source) {
  const tokens = tokenize(source.trim().replace(/(?<![:<>!=])=\s*$/, '')); let index = 0, depth = 0;
  const peek = () => tokens[index];
  const take = t => { const token = tokens[index]; if (t && token.type !== t) throw new MathError(`Expected “${t}”, found “${token.value || 'end of expression'}”.`, 'SYNTAX',token.pos); index++; return token; };
  function expression(min = 0) {
    if (++depth > 128) throw new MathError('Expression nesting limit exceeded.', 'LIMIT');
    let t = take(), left;
    if (t.type === 'number') left = {k:'num',v:t.value};
    else if (t.type === 'id') left = {k:'id',name:t.value};
    else if (t.type === '-' || t.type === '+') left = {k:'unary',op:t.type,a:expression(35)};
    else if (t.type === '(') { left = expression(); take(')'); }
    else if (t.type === '[') {
      const rows = [[]];
      if (peek().type === ']') throw new MathError('A matrix cannot be empty.','SHAPE');
      for (;;) { rows.at(-1).push(expression()); if (peek().type === ',') take(','); else if (peek().type === ';') {take(';');rows.push([]);} else break; }
      take(']'); if (rows.some(r => r.length !== rows[0].length)) throw new MathError('Every matrix row must have the same number of columns.','SHAPE'); left = {k:'matrix',rows};
    } else throw new MathError(`Expected a value, found “${t.value || 'end of expression'}”.`, 'SYNTAX', t.pos);
    for (;;) {
      t = peek();
      if (t.type === '(' && left.k === 'id' && 60 >= min) {
        take('('); const args=[]; if(peek().type!==')') {do {args.push(expression());if(peek().type!==',') break;take(',');}while(true);}take(')');left={k:'call',name:left.name,args};continue;
      }
      if (t.type === '[' && 60 >= min) {take('[');const args=[expression()];if(peek().type===','){take(',');args.push(expression());}take(']');left={k:'index',a:left,args};continue;}
      if ((t.type==='!'||t.type==="'") && 50>=min) { take(); left={k:'call',name:t.type==='!'?'factorial':'transpose',args:[left]};continue; }
      const implicit = ['number','id','('].includes(t.type);
      const op = implicit?'*':t.type;
      const prec = ({'==':10,'=':10,'!=':10,'<':10,'>':10,'<=':10,'>=':10,'..':15,'+':20,'-':20,'*':30,'/':30,'^':40})[op];
      if (prec === undefined || prec < min) break;
      if (!implicit) take();
      left = {k:'binary',op,a:left,b:expression(prec + (op==='^'?0:1))};
    }
    depth--; return left;
  }
  const left = expression(); let statement;
  if (peek().type === ':=') {
    take(':='); if (left.k!=='id' && !(left.k==='call' && left.args.every(a=>a.k==='id'))) throw new MathError('Define a variable or a function, for example f(x) := x^2.', 'SYNTAX');
    if (left.k==='call' && new Set(left.args.map(a=>a.name)).size !== left.args.length) throw new MathError('Function arguments must be unique.','SYNTAX');
    statement = {k:'assign',target:left,value:expression()};
  } else statement = {k:'evaluate',value:left};
  if (peek().type === '->') {take('->');statement.unit=expression();}
  take('eof'); return statement;
}

function lookup(name, env) {
  if (env.has(name)) { const v=env.get(name); if(v?.error) throw new MathError(`“${name}” depends on an invalid region: ${v.error}`, 'DEPENDENCY'); return v; }
  if (CONSTANTS.has(name)) return CONSTANTS.get(name); if(UNITS.has(name)) return UNITS.get(name);
  throw new MathError(`“${name}” is not defined above this region.`, 'UNDEFINED');
}
function luDecompose(value) {
  const A = value.map(r=>[...r]); const n=A.length;
  if (n !== A[0].length || n>128) throw new MathError('A square matrix of order ≤128 is required.', 'SHAPE');
  const p=Array.from({length:n},(_,i)=>i); let parity=1;
  const scales=A.map(r=>Math.max(...r.map(Math.abs)));
  for(let k=0;k<n;k++) {
    let pivot=k, best=-1; for(let i=k;i<n;i++){const ratio=scales[i] ? Math.abs(A[i][k])/scales[i] : 0;if(ratio>best){best=ratio;pivot=i;}}
    if(A[pivot][k]===0 || !Number.isFinite(A[pivot][k])) return {A,p,parity,singular:true};
    if(pivot!==k){[A[k],A[pivot]]=[A[pivot],A[k]];[p[k],p[pivot]]=[p[pivot],p[k]];[scales[k],scales[pivot]]=[scales[pivot],scales[k]];parity*=-1;}
    for(let i=k+1;i<n;i++){A[i][k]/=A[k][k];for(let j=k+1;j<n;j++) A[i][j]-=A[i][k]*A[k][j];}
  }
  return {A,p,parity,singular:false};
}
function solveLU(lu, B) {
  if(lu.singular) throw new MathError('The matrix is singular and cannot be solved or inverted.', 'SINGULAR');
  const {A,p}=lu,n=A.length;if(B.length!==n)throw new MathError('The right-hand side must have the same number of rows.', 'SHAPE');
  const X=p.map(i=>[...B[i]]);for(let i=0;i<n;i++)for(let k=0;k<i;k++)for(let j=0;j<B[0].length;j++)X[i][j]-=A[i][k]*X[k][j];
  for(let i=n-1;i>=0;i--){for(let k=i+1;k<n;k++)for(let j=0;j<B[0].length;j++)X[i][j]-=A[i][k]*X[k][j];for(let j=0;j<B[0].length;j++)X[i][j]/=A[i][i];}return X;
}
function asMatrix(v) {checkQ(v);if(!isMatrix(v.v))throw new MathError('A matrix or vector is required.','TYPE');return v.v;}
const num = v => ({k:'num',v});
const bin = (op,a,b) => ({k:'binary',op,a,b});
const call = (name,a) => ({k:'call',name,args:[a]});
export function simplify(a, context={steps:0}) {
  if(++context.steps>50000)throw new MathError('Symbolic operation budget exceeded.','LIMIT');
  if(a.k==='unary'){const x=simplify(a.a,context);if(x.k==='num')return num(a.op==='-'?-x.v:x.v);return {...a,a:x};}
  if(a.k==='call')return {...a,args:a.args.map(n=>simplify(n,context))};
  if(a.k!=='binary')return a;
  const x=simplify(a.a,context),y=simplify(a.b,context),zero=v=>v.k==='num'&&v.v===0,one=v=>v.k==='num'&&v.v===1;
  if(x.k==='num'&&y.k==='num'){
    const n=({'+' :()=>x.v+y.v,'-':()=>x.v-y.v,'*':()=>x.v*y.v,'/':()=>x.v/y.v,'^':()=>x.v**y.v})[a.op]?.();if(Number.isFinite(n))return num(n);
  }
  if(a.op==='+'){if(zero(x))return y;if(zero(y))return x;}
  if(a.op==='-'&&zero(y))return x;
  if(a.op==='*'){if(one(x))return y;if(one(y))return x;if(zero(x)||zero(y))return num(0);}
  if(a.op==='/'&&one(y))return x;
  if(a.op==='^'){if(one(y))return x;if(zero(y))return num(1);}
  return {...a,a:x,b:y};
}
export function differentiate(a, variable, context={steps:0}) {
  if(++context.steps>50000)throw new MathError('Symbolic operation budget exceeded.','LIMIT');
  let d;
  if(a.k==='num')d=num(0);else if(a.k==='id')d=num(a.name===variable?1:0);
  else if(a.k==='unary')d={...a,a:differentiate(a.a,variable,context)};
  else if(a.k==='binary'){
    const u=a.a,v=a.b,du=differentiate(u,variable,context),dv=differentiate(v,variable,context);
    if(a.op==='+'||a.op==='-')d=bin(a.op,du,dv);
    else if(a.op==='*')d=bin('+',bin('*',du,v),bin('*',u,dv));
    else if(a.op==='/')d=bin('/',bin('-',bin('*',du,v),bin('*',u,dv)),bin('^',v,num(2)));
    else if(a.op==='^')d=v.k==='num'?bin('*',bin('*',v,bin('^',u,num(v.v-1))),du):bin('*',a,bin('+',bin('*',dv,call('ln',u)),bin('*',v,bin('/',du,u))));
    else throw new MathError(`Symbolic differentiation does not support ${a.op}.`,'SYMBOLIC');
  } else if(a.k==='call'&&a.args.length===1){
    const u=a.args[0],du=differentiate(u,variable,context);
    const outer={sin:()=>call('cos',u),cos:()=>bin('*',num(-1),call('sin',u)),tan:()=>bin('/',num(1),bin('^',call('cos',u),num(2))),exp:()=>call('exp',u),ln:()=>bin('/',num(1),u),sqrt:()=>bin('/',num(1),bin('*',num(2),call('sqrt',u)))}[a.name];
    if(!outer)throw new MathError(`No symbolic derivative rule for “${a.name}”.`,'SYMBOLIC');d=bin('*',outer(),du);
  } else throw new MathError('This symbolic expression is not supported.','SYMBOLIC');
  return simplify(d,context);
}

export function evaluateAST(ast, env = new Map(), context = {steps:0,depth:0}) {
  if(++context.steps>300000)throw new MathError('Calculation operation budget exceeded.','LIMIT');
  const ev=a=>evaluateAST(a,env,context);
  if(ast.k==='num')return q(ast.v);
  if(ast.k==='id')return lookup(ast.name,env);
  if(ast.k==='unary'){const a=checkQ(ev(ast.a));return ast.op==='-'?q(map(a.v,x=>-x),a.d):a;}
  if(ast.k==='matrix'){
    const rows=ast.rows.map(r=>r.map(ev)), d=checkQ(rows[0][0]).d;
    const values=rows.map(r=>r.map(v=>{if(!sameDim(checkQ(v).d,d))throw new MathError('Every matrix entry must have compatible units.','UNITS');return scalar(v);}));return q(values,d);
  }
  if(ast.k==='index'){
    const a=ev(ast.a),A=asMatrix(a),indices=ast.args.map(x=>scalar(dimensionless(checkQ(ev(x)))));
    if(indices.some(i=>!Number.isInteger(i)||i<0))throw new MathError('Indices are zero-based nonnegative integers.','INDEX');
    let [i,j]=indices;if(j===undefined){if(A.length===1){j=i;i=0;}else j=0;}
    if(i>=A.length||j>=A[0].length)throw new MathError('Matrix index is out of bounds.','INDEX');return q(A[i][j],a.d);
  }
  if(ast.k==='binary') {
    const a=checkQ(ev(ast.a)),b=checkQ(ev(ast.b));
    if(ast.op==='+')return add(a,b);if(ast.op==='-')return add(a,b,-1);if(ast.op==='*')return mul(a,b);if(ast.op==='/')return div(a,b);if(ast.op==='^')return power(a,b);
    if(ast.op==='..')return makeRange(a,b,q(scalar(b)>=scalar(a)?1:-1,a.d));
    if(!sameDim(a.d,b.d))throw new MathError('Comparison requires compatible units.','UNITS');
    const x=scalar(a),y=scalar(b);const v=({'<':x<y,'>':x>y,'<=':x<=y,'>=':x>=y,'=':x===y,'==':x===y,'!=':x!==y})[ast.op];return q(v?1:0,Z,true);
  }
  if(ast.k!=='call')throw new MathError('Invalid expression node.','SYNTAX');
  const name=ast.name,args=ast.args;
  const count=(min,max=min)=>{if(args.length<min||args.length>max)throw new MathError(`${name} expects ${min===max?min:`${min}–${max}`} argument${max===1?'':'s'}.`,'ARGUMENT');};
  if(name==='diff'){count(2);if(args[1].k!=='id')throw new MathError('The differentiation variable must be a symbol.','ARGUMENT');return {kind:'symbolic',ast:differentiate(args[0],args[1].name)};}
  if(name==='simplify'){count(1);return {kind:'symbolic',ast:simplify(args[0])};}
  if(name==='if'){count(3);return ev(scalar(dimensionless(checkQ(ev(args[0]))))!==0?args[1]:args[2]);}
  if(['root','integrate','deriv'].includes(name)) {
    if(name==='deriv')count(3,4);else count(4);if(args[1].k!=='id')throw new MathError('Use a symbol as the second argument.','ARGUMENT');
    const a=checkQ(ev(args[2])),b=name==='deriv'?a:checkQ(ev(args[3]));if(!sameDim(a.d,b.d))throw new MathError('Bounds must have compatible units.','UNITS');
    const lo=scalar(a),hi=scalar(b),local=new Map(env); let outputDim=null;
    const f=x=>{local.set(args[1].name,q(x,a.d));const y=checkQ(evaluateAST(args[0],local,context));if(outputDim&&!sameDim(outputDim,y.d))throw new MathError('The expression changes units across its domain.','UNITS');outputDim=y.d;return scalar(y);};
    if(name==='deriv'){let h=Math.pow(Number.EPSILON,1/5)*Math.max(1,Math.abs(lo));if(args[3]){const step=checkQ(ev(args[3]));if(!sameDim(step.d,a.d))throw new MathError('The derivative step must have the same units as its point.','UNITS');h=scalar(step);if(!(h>0))throw new MathError('The derivative step must be positive.','DOMAIN');}const d=(f(lo-2*h)-8*f(lo-h)+8*f(lo+h)-f(lo+2*h))/(12*h);return q(d,dimAdd(outputDim,a.d,-1));}
    if(name==='root'){
      let l=lo,r=hi,fl=f(l),fr=f(r);if(fl===0)return a;if(fr===0)return b;if(Math.sign(fl)===Math.sign(fr))throw new MathError('Root bounds must bracket a sign change.','BRACKET');
      const residualScale=Math.max(Math.abs(fl),Math.abs(fr),Number.MIN_VALUE),xTolerance=1e-12*Math.max(Math.abs(lo),Math.abs(hi),Math.abs(hi-lo),Number.MIN_VALUE);
      for(let i=0;i<160;i++){const mid=l+(r-l)/2,fm=f(mid);if(fm===0)return q(mid,a.d);if(Math.abs(r-l)<=xTolerance){if(Math.abs(fm)>1e-7*residualScale)throw new MathError('The bracket narrowed without a small residual; the function may be discontinuous.','CONVERGENCE');return q(mid,a.d);}if(Math.sign(fm)===Math.sign(fl)){l=mid;fl=fm;}else{r=mid;fr=fm;}}
      throw new MathError('Root solver did not converge.','CONVERGENCE');
    }
    if(lo===hi){f(lo);return q(0,dimAdd(outputDim,a.d));}
    const fa=f(lo),fb=f(hi),mid=(lo+hi)/2,fm=f(mid),whole=(hi-lo)*(fa+4*fm+fb)/6;
    const tolerance=1e-10*Math.max(Math.abs(whole),Math.abs((hi-lo)*fa),Math.abs((hi-lo)*fb),1e-8);
    function adapt(l,r,fl,fc,fr,old,tol,depth){const c=(l+r)/2,lm=(l+c)/2,rm=(c+r)/2,flm=f(lm),frm=f(rm),left=(c-l)*(fl+4*flm+fc)/6,right=(r-c)*(fc+4*frm+fr)/6,delta=left+right-old;if(Math.abs(delta)<=15*tol)return left+right+delta/15;if(depth<=0)throw new MathError('Integration tolerance was not reached.','CONVERGENCE');return adapt(l,c,fl,flm,fc,left,tol/2,depth-1)+adapt(c,r,fc,frm,fr,right,tol/2,depth-1);}
    return q(adapt(lo,hi,fa,fm,fb,whole,tolerance,20),dimAdd(outputDim,a.d));
  }
  if(env.has(name)) {
    const fn=lookup(name,env);if(fn?.kind!=='function')throw new MathError(`“${name}” is a value, not a function. Use * for multiplication.`,'TYPE');count(fn.params.length);
    if(++context.depth>64)throw new MathError('Function call depth exceeded.','LIMIT');
    const local=new Map(fn.env);args.forEach((a,i)=>local.set(fn.params[i],ev(a)));try{return evaluateAST(fn.body,local,context);}finally{context.depth--;}
  }
  const unary={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,exp:Math.exp,ln:Math.log,log:Math.log,log10:Math.log10};
  if(unary[name]){count(1);const a=dimensionless(checkQ(ev(args[0])));return q(map(a.v,x=>finite(unary[name](x))));}
  if(['sqrt','abs','floor','ceil','round','sign','factorial'].includes(name)){count(1);const a=checkQ(ev(args[0]));if(name==='sqrt')return power(a,q(.5));if(name==='factorial')return fact(a);return q(map(a.v,Math[name]),name==='sign'?Z:a.d);}
  if(name==='atan2'){count(2);const a=checkQ(ev(args[0])),b=checkQ(ev(args[1]));if(!sameDim(a.d,b.d))throw new MathError('atan2 arguments require compatible units.','UNITS');return q(Math.atan2(scalar(a),scalar(b)));}
  if(['min','max','sum','prod','mean','median','stdev','std'].includes(name)) {
    count(1,256);const values=args.map(a=>checkQ(ev(a))),d=values[0].d;if(values.some(v=>!sameDim(v.d,d)))throw new MathError('All values must have compatible units.','UNITS');const ns=values.flatMap(v=>flat(v.v));
    let v;if(name==='min')v=Math.min(...ns);else if(name==='max')v=Math.max(...ns);else if(name==='sum')v=ns.reduce((a,b)=>a+b,0);else if(name==='prod')v=ns.reduce((a,b)=>a*b,1);else if(name==='mean')v=ns.reduce((a,b)=>a+b,0)/ns.length;else if(name==='median'){ns.sort((a,b)=>a-b);const i=Math.floor(ns.length/2);v=ns.length%2?ns[i]:(ns[i-1]+ns[i])/2;}else {if(ns.length<2)throw new MathError('Sample standard deviation needs at least two values.','ARGUMENT');const mean=ns.reduce((a,b)=>a+b,0)/ns.length;v=Math.sqrt(ns.reduce((a,b)=>a+(b-mean)**2,0)/(ns.length-1));}return q(v,name==='prod'?dimScale(d,ns.length):d);
  }
  if(['zeros','ones','eye'].includes(name)) {
    count(1,2);const n=scalar(dimensionless(checkQ(ev(args[0])))),m=args[1]?scalar(dimensionless(checkQ(ev(args[1])))):n;
    if(!Number.isInteger(n)||!Number.isInteger(m)||n<1||m<1||n*m>MAX_CELLS)throw new MathError('Invalid matrix dimensions.','SHAPE');return q(Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>name==='eye'?(i===j?1:0):name==='ones'?1:0)));
  }
  if(['transpose','rows','cols','length','norm','det','inv'].includes(name)) {
    count(1);const a=checkQ(ev(args[0])),A=asMatrix(a);
    if(name==='transpose')return q(A[0].map((_,j)=>A.map(r=>r[j])),a.d);
    if(name==='rows')return q(A.length);if(name==='cols')return q(A[0].length);if(name==='length')return q(A.length*A[0].length);if(name==='norm')return q(Math.hypot(...A.flat()),a.d);
    const lu=luDecompose(A);if(name==='det')return q(lu.singular?0:lu.parity*lu.A.reduce((v,r,i)=>v*r[i],1),dimScale(a.d,A.length));
    const identity=A.map((_,i)=>A.map((_,j)=>i===j?1:0));return q(solveLU(lu,identity),dimScale(a.d,-1));
  }
  if(['lsolve','dot','hadamard'].includes(name)) {
    count(2);const a=checkQ(ev(args[0])),b=checkQ(ev(args[1])),A=asMatrix(a),B=asMatrix(b);
    if(name==='lsolve')return q(solveLU(luDecompose(A),B),dimAdd(b.d,a.d,-1));
    if(name==='hadamard')return q(pair(A,B,(x,y)=>x*y,false),dimAdd(a.d,b.d));
    const x=A.flat(),y=B.flat();if(x.length!==y.length)throw new MathError('Vector lengths must match.','SHAPE');return q(x.reduce((s,v,i)=>s+v*y[i],0),dimAdd(a.d,b.d));
  }
  if(name==='range'){count(2,3);const a=checkQ(ev(args[0])),b=checkQ(ev(args[1])),step=args[2]?checkQ(ev(args[2])):q(scalar(b)>=scalar(a)?1:-1,a.d);return makeRange(a,b,step);}
  throw new MathError(`Unknown function “${name}”.`, 'UNDEFINED');
}
function makeRange(a,b,step) {
  if(!sameDim(a.d,b.d)||!sameDim(a.d,step.d))throw new MathError('Range bounds and step must have compatible units.','UNITS');
  const start=scalar(a),end=scalar(b),s=scalar(step);if(!s||(end-start)*s<0)throw new MathError('The range step must point toward its endpoint.','DOMAIN');const count=Math.floor((end-start)/s+1e-10)+1;
  if(count<1||count>MAX_CELLS)throw new MathError('A range may contain at most 16,384 values.','LIMIT');return q([Array.from({length:count},(_,i)=>start+i*s)],a.d);
}
export function execute(source, env = new Map()) {
  const statement=typeof source==='string'?parse(source):source;
  let value;if(statement.k==='assign'&&statement.target.k==='call'){
    value={kind:'function',params:statement.target.args.map(a=>a.name),body:statement.value,env:new Map(env)};
  }else value=evaluateAST(statement.value,env);
  if(statement.k==='assign')env.set(statement.target.name,value);
  return {statement,value};
}
export function dimensionText(d) {
  const names=['m','kg','s','A','K','mol','cd'];return d.map((e,i)=>Math.abs(e)<1e-10?'':`${names[i]}${Math.abs(e-1)<1e-10?'':`^${Number(e.toFixed(8))}`}`).filter(Boolean).join('·');
}
export function formatNumber(n, precision=5) {
  if(n===0||Object.is(n,-0))return '0';const p=Math.max(2,Math.min(12,precision));if(Math.abs(n)>=1e6||Math.abs(n)<1e-4)return n.toExponential(p-1).replace(/\.?0+e/,'e').replace('e+','e');return Number(n.toPrecision(p)).toString();
}
export function formatValue(value, outputUnit='', precision=5, env=new Map()) {
  if(value?.kind==='function')return {kind:'function',text:`(${value.params.join(', ')}) → ${astToText(value.body)}`};
  if(value?.kind==='symbolic')return {kind:'symbolic',text:astToText(value.ast),math:astToMathML(value.ast)};
  checkQ(value);let magnitude=value.v,unitName=outputUnit.trim();
  if(unitName){const u=checkQ(evaluateAST(parse(unitName).value,env));if(!sameDim(value.d,u.d))throw new MathError(`Cannot display ${dimensionText(value.d)||'a dimensionless result'} in ${unitName}.`,'UNITS');const scale=scalar(u);if(scale===0)throw new MathError('The display unit cannot have zero scale.','UNITS');magnitude=map(magnitude,v=>v/scale);}
  else if(!sameDim(value.d,Z)) {const preferred=['N','Pa','J','W','V','ohm','C','F','H','Hz'];unitName=preferred.find(n=>sameDim(UNITS.get(n).d,value.d))||dimensionText(value.d);}
  const matrix=isMatrix(magnitude);const texts=matrix?magnitude.map(r=>r.map(v=>formatNumber(v,precision))):formatNumber(magnitude,precision);
  return {kind:matrix?'matrix':'scalar',magnitude,unit:unitName,dimensions:value.d,text:value.boolean?(value.v?'true':'false'):matrix?`[${texts.map(r=>r.join(', ')).join('; ')}]${unitName?' '+unitName:''}`:`${texts}${unitName?' '+unitName:''}`,numbers:texts,boolean:value.boolean};
}
export function dependencies(ast, locals=new Set(), out=new Set()) {
  if(!ast)return out;
  if(ast.k==='id'&&!locals.has(ast.name))out.add(ast.name);
  if(ast.k==='call'){
    if(!BUILTIN_NAMES.includes(ast.name)&&!locals.has(ast.name))out.add(ast.name);
    if(['diff','simplify'].includes(ast.name))return out;
    if(['integrate','deriv','root'].includes(ast.name)&&ast.args[1]?.k==='id'){const scoped=new Set([...locals,ast.args[1].name]);dependencies(ast.args[0],scoped,out);ast.args.slice(2).forEach(a=>dependencies(a,locals,out));return out;}
    ast.args.forEach(a=>dependencies(a,locals,out));
  }
  if(ast.a)dependencies(ast.a,locals,out);if(ast.b)dependencies(ast.b,locals,out);
  if(ast.rows)ast.rows.flat().forEach(a=>dependencies(a,locals,out));if(ast.k==='index')ast.args.forEach(a=>dependencies(a,locals,out));return out;
}
export function escapeXML(s) {return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
export function astToText(a) {
  if(a.k==='num')return String(a.v);if(a.k==='id')return a.name;if(a.k==='unary')return a.op+`(${astToText(a.a)})`;
  if(a.k==='binary')return `(${astToText(a.a)} ${a.op} ${astToText(a.b)})`;
  if(a.k==='matrix')return `[${a.rows.map(r=>r.map(astToText).join(', ')).join('; ')}]`;
  if(a.k==='index')return `${astToText(a.a)}[${a.args.map(astToText).join(', ')}]`;
  return `${a.name}(${a.args.map(astToText).join(', ')})`;
}
const greek={alpha:'α',beta:'β',gamma:'γ',delta:'δ',Delta:'Δ',theta:'θ',lambda:'λ',sigma:'σ',omega:'ω',rho:'ρ',pi:'π',phi:'φ',tau:'τ'};
export function identifierMath(name) {
  const parts=name.split('_');const base=greek[parts[0]]||parts[0];const el=`<mi${UNITS.has(name)?' mathvariant="normal" class="math-unit"':''}>${escapeXML(base)}</mi>`;
  return parts.length>1?`<msub>${el}<mi>${escapeXML(parts.slice(1).join('_'))}</mi></msub>`:el;
}
export function astToMathML(a, parent=0) {
  if(a.k==='num')return numberMath(a.v);if(a.k==='id')return identifierMath(a.name);
  if(a.k==='matrix')return `<mrow><mo>[</mo><mtable>${a.rows.map(r=>`<mtr>${r.map(c=>`<mtd>${astToMathML(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable><mo>]</mo></mrow>`;
  if(a.k==='unary')return `<mrow><mo>${a.op==='-'?'−':'+'}</mo>${astToMathML(a.a,35)}</mrow>`;
  if(a.k==='index')return `<msub>${astToMathML(a.a)}<mrow>${a.args.map(x=>astToMathML(x)).join('<mo>,</mo>')}</mrow></msub>`;
  if(a.k==='binary') {
    if(a.op==='/')return `<mfrac>${astToMathML(a.a)}${astToMathML(a.b)}</mfrac>`;
    if(a.op==='^')return `<msup>${astToMathML(a.a,41)}${astToMathML(a.b)}</msup>`;
    const p=({'*':30,'+':20,'-':20})[a.op]||10,op=({'*':'·','-':'−','<=':'≤','>=':'≥','!=':'≠'})[a.op]||a.op;
    const content=`${astToMathML(a.a,p)}<mo>${escapeXML(op)}</mo>${astToMathML(a.b,p+(a.op==='-'?1:0))}`;
    return p<parent?`<mrow><mo>(</mo>${content}<mo>)</mo></mrow>`:`<mrow>${content}</mrow>`;
  }
  if(a.k==='call') {
    if(a.name==='sqrt'&&a.args.length===1)return `<msqrt>${astToMathML(a.args[0])}</msqrt>`;
    if(a.name==='abs'&&a.args.length===1)return `<mrow><mo>|</mo>${astToMathML(a.args[0])}<mo>|</mo></mrow>`;
    if(a.name==='integrate'&&a.args.length===4)return `<mrow><msubsup><mo>∫</mo>${astToMathML(a.args[2])}${astToMathML(a.args[3])}</msubsup>${astToMathML(a.args[0])}<mo>ⅆ</mo>${astToMathML(a.args[1])}</mrow>`;
    if(a.name==='diff'&&a.args.length===2)return `<mrow><mfrac><mo>ⅆ</mo><mrow><mo>ⅆ</mo>${astToMathML(a.args[1])}</mrow></mfrac><mo>(</mo>${astToMathML(a.args[0])}<mo>)</mo></mrow>`;
    return `<mrow><mi mathvariant="normal">${escapeXML(a.name)}</mi><mo>(</mo>${a.args.map(x=>astToMathML(x)).join('<mo>,</mo>')}<mo>)</mo></mrow>`;
  }
  return '<mtext>?</mtext>';
}
export function numberMath(n, precision=5) {
  const s=typeof n==='string'?n:formatNumber(n,precision);if(s.includes('e')){const [m,e]=s.split('e');return `<mrow><mn>${escapeXML(m)}</mn><mo>×</mo><msup><mn>10</mn><mn>${Number(e)}</mn></msup></mrow>`;}return `<mn>${escapeXML(s)}</mn>`;
}
export function resultMath(formatted) {
  if(formatted.kind==='symbolic')return formatted.math;
  if(formatted.kind==='function')return '';
  if(formatted.boolean)return `<mtext class="${formatted.magnitude?'math-pass':'math-fail'}">${formatted.magnitude?'true':'false'}</mtext>`;
  let body=formatted.kind==='matrix'?`<mrow><mo>[</mo><mtable>${formatted.numbers.map(r=>`<mtr>${r.map(n=>`<mtd>${numberMath(n)}</mtd>`).join('')}</mtr>`).join('')}</mtable><mo>]</mo></mrow>`:numberMath(formatted.numbers);
  if(formatted.unit){let unitMath;try{unitMath=astToMathML(parse(formatted.unit.replace(/·/g,'*')).value);}catch{unitMath=`<mtext>${escapeXML(formatted.unit)}</mtext>`;}body+=`<mspace width="0.3em"/><mstyle mathvariant="normal" class="math-unit">${unitMath}</mstyle>`;}return `<mrow>${body}</mrow>`;
}

export class WorksheetKernel {
  constructor(){this.cache=new Map();this.plotCache=new Map();this.revision=0;}
  calculate(document) {
    const start=performance.now(),env=new Map(),versions=new Map(),results={},variables=[],active=new Set();let cacheHits=0,plotCacheHits=0,errors=0;
    const regions=[...document.regions].sort((a,b)=>(a.page||0)-(b.page||0)||a.y-b.y||a.x-b.x);
    for(const region of regions){
      if(!['math','plot','slider'].includes(region.type))continue;active.add(region.id);
      try {
        if(region.type==='plot'){
          const sourceKey=JSON.stringify([region.variable,region.xMin,region.xMax,region.xUnit,region.yUnit,region.yMin,region.yMax,region.samples,region.expression,region.traces]);
          const old=this.plotCache.get(region.id);let names=old?.sourceKey===sourceKey?old.names:null;
          if(!names){const deps=new Set();for(const text of [region.xMin||'0',region.xMax||'10',region.xUnit,region.yUnit,region.yMin,region.yMax].filter(Boolean))dependencies(parse(text).value,new Set(),deps);for(const trace of region.traces?.length?region.traces:[{expression:region.expression||'sin(x)'}])dependencies(parse(trace.expression).value,new Set([region.variable||'x']),deps);names=[...deps];}
          const signature=JSON.stringify([sourceKey,names.map(n=>[n,versions.get(n)||'base'])]);
          if(old?.signature===signature){results[region.id]=old.result;plotCacheHits++;}else{const result=this.plot(region,env);this.plotCache.set(region.id,{signature,sourceKey,names,result});results[region.id]=result;}
          continue;
        }
        const source=region.type==='slider'?`${region.variable} := ${region.value} ${region.unit||''}`:region.source;
        if(!source?.trim()){results[region.id]={empty:true};continue;}
        const prior=this.cache.get(region.id),statement=prior?.result.source===source?prior.result.statement:parse(source),locals=statement.target?.k==='call'?new Set(statement.target.args.map(a=>a.name)):new Set();
        const deps=[...dependencies(statement.value,locals)];if(statement.unit)dependencies(statement.unit,locals).forEach(n=>deps.push(n));
        if(region.outputUnit)dependencies(parse(region.outputUnit).value).forEach(n=>deps.push(n));
        const signature=JSON.stringify([source,region.outputUnit||'',region.precision||document.precision||5,deps.map(n=>[n,versions.get(n)||'base'])]);
        let entry=this.cache.get(region.id);const hit=entry?.signature===signature;
        if(entry?.signature===signature){cacheHits++;if(statement.k==='assign')env.set(statement.target.name,entry.value);}
        else{
          const {value}=execute(statement,env),outputUnit=region.outputUnit|| (statement.unit?astToText(statement.unit):'');
          const formatted=formatValue(value,outputUnit,region.precision||document.precision||5,env);
          entry={signature,value,version:++this.revision,result:{statement,formatted,dependencies:deps.filter(n=>versions.has(n)),source,displayUnit:outputUnit}};this.cache.set(region.id,entry);
        }
        results[region.id]={...entry.result,cached:hit};
        if(statement.k==='assign'){const name=statement.target.name;versions.set(name,entry.version);variables.push({name,regionId:region.id,formatted:entry.result.formatted,signature});}
      } catch(error){
        errors++;results[region.id]={error:error.message,code:error.code||'ERROR',position:error.position??-1};
        const failedSource=region.type==='slider'?`${region.variable} := ${region.value} ${region.unit||''}`:region.source||'';
        try{const s=parse(failedSource);if(s.k==='assign'){env.set(s.target.name,{error:error.message});versions.set(s.target.name,'error:'+error.message);}}catch{const name=failedSource.match(/^\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\([^)]*\)\s*)?:=/u)?.[1];if(name){env.set(name,{error:error.message});versions.set(name,'error:'+error.message);}}
      }
    }
    for(const id of this.cache.keys())if(!active.has(id))this.cache.delete(id);
    for(const id of this.plotCache.keys())if(!active.has(id))this.plotCache.delete(id);
    return {results,variables:variables.map(({signature,...rest})=>rest),errors,cacheHits,plotCacheHits,duration:performance.now()-start};
  }
  plot(region,env) {
    const variable=region.variable||'x',a=checkQ(evaluateAST(parse(region.xMin||'0').value,env)),b=checkQ(evaluateAST(parse(region.xMax||'10').value,env));
    if(!sameDim(a.d,b.d))throw new MathError('Plot bounds must have compatible units.','UNITS');
    const low=scalar(a),high=scalar(b);if(!(high>low))throw new MathError('The plot maximum must exceed its minimum.','DOMAIN');
    const xUnit=region.xUnit?checkQ(evaluateAST(parse(region.xUnit).value,env)):q(1,a.d);if(!sameDim(xUnit.d,a.d))throw new MathError('The x-axis unit is incompatible with its bounds.','UNITS');const xScale=scalar(xUnit);if(!(xScale>0))throw new MathError('Plot unit scales must be positive.','UNITS');
    const yUnit=region.yUnit?checkQ(evaluateAST(parse(region.yUnit).value,env)):null;let yd=yUnit?.d,ys=yUnit?scalar(yUnit):1;if(!(ys>0))throw new MathError('Plot unit scales must be positive.','UNITS');
    const traces=region.traces?.length?region.traces:[{expression:region.expression||'sin(x)',label:'f(x)'}];const count=Math.max(64,Math.min(2048,region.samples||512));const local=new Map(env);let minY=Infinity,maxY=-Infinity,invalid=0;
    const series=traces.slice(0,8).map(trace=>{
      const ast=parse(trace.expression).value,points=[];let firstError='';
      for(let i=0;i<=count;i++){
        const x=low+(high-low)*i/count;local.set(variable,q(x,a.d));
        try{const v=checkQ(evaluateAST(ast,local));if(!yd)yd=v.d;if(!sameDim(v.d,yd))throw new MathError('All traces must have compatible y-axis units.','UNITS');const y=scalar(v)/ys;finite(y);minY=Math.min(minY,y);maxY=Math.max(maxY,y);points.push([x/xScale,y]);}
        catch(e){if(e.code==='UNITS'||e.code==='UNDEFINED'||e.code==='TYPE')throw e;firstError ||= e.message;points.push([x/xScale,null]);invalid++;}
      }
      if(points.every(p=>p[1]===null))throw new MathError(firstError||'No finite samples in the requested range.','DOMAIN');
      return {label:trace.label||trace.expression,expression:trace.expression,points};
    });
    if(!Number.isFinite(minY))throw new MathError('The plot contains no finite samples.','DOMAIN');
    const explicitLow=region.yMin?.trim(),explicitHigh=region.yMax?.trim();
    const getBound=s=>{const v=checkQ(evaluateAST(parse(s).value,env));if(!sameDim(v.d,yd))throw new MathError('Y-axis bounds have incompatible units.','UNITS');return scalar(v)/ys;};
    const pad=(maxY-minY||Math.max(Math.abs(minY),1))*.1;
    const yMin=explicitLow?getBound(region.yMin):Math.min(0,minY-pad),yMax=explicitHigh?getBound(region.yMax):maxY+pad;if(!(yMax>yMin))throw new MathError('The y-axis maximum must exceed its minimum.','DOMAIN');
    return {plot:{series,xMin:low/xScale,xMax:high/xScale,yMin,yMax,xUnit:region.xUnit||dimensionText(a.d),yUnit:region.yUnit||dimensionText(yd),invalid}};
  }
}
