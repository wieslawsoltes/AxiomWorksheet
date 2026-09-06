import test from 'node:test';
import assert from 'node:assert/strict';
import { execute, formatValue, WorksheetKernel, parse, evaluateAST, differentiate, astToMathML } from '../src/kernel.js';
const val = s => execute(s).value;
const near = (actual, expected, tol=1e-9) => assert.ok(Math.abs(actual-expected)<=tol*Math.max(1,Math.abs(expected)), `${actual} ≠ ${expected}`);
const bad = (s, code) => assert.throws(()=>val(s), e=>e.code===code);
for(const [source, expected] of [
  ['2+3*4',14],['(2+3)*4',20],['2^3^2',512],['-2^2',-4],['(-2)^2',4],['2^-3',.125],['2pi',2*Math.PI],['3(2+4)',18],['6!',720],['2e3 + .5',2000.5],['sin(30 deg)',.5],['cos(pi)',-1],['ln(exp(3))',3],['sqrt(81)',9],['abs(-4)',4],['round(2.6)',3],['if(2>1,42,1/0)',42],['mean([1,2,3,4])',2.5],['median([1,9,3,4])',3.5],['stdev([1,2,3])',1],['sum(1..10)',55],['sum(range(0,1,.1))',5.5],['prod([1,2,3,4])',24],['[10,20,30][1]',20],['[1,2;3,4][1,0]',3],['dot([1,2,3],[4,5,6])',32],['norm([3,4])',5],['det([1,2;3,4])',-2],['det([0,2;3,4])',-6],['det([1,2;2,4])',0],['rows(eye(3))',3],['cols(zeros(2,4))',4],['atan2(1 m,1 m)',Math.PI/4],['integrate(sin(x),x,0,pi)',2],['integrate(x^2,x,0,3)',9],['integrate(exp(x),x,1,0)',1-Math.E],['root(x^2-2,x,0,2)',Math.SQRT2],['root(x,x,0,2)',0],['deriv(sin(x),x,0)',1]
]) test(source,()=>near(val(source).v,expected));
test('quantity conversion',()=>near(formatValue(val('25.4 mm'),'in').magnitude,1));
test('derived dimensional conversion',()=>near(formatValue(val('5 kg * 2 m / s^2'),'N').magnitude,10));
test('fractional dimensional power',()=>near(formatValue(val('sqrt(4 m^2)'),'m').magnitude,2));
test('dimensioned numerical integration',()=>near(formatValue(val('integrate(3 N,x,0 m,2 m)'),'J').magnitude,6));
test('dimensioned root',()=>near(formatValue(val('root(x^2-4 m^2,x,0 m,3 m)'),'m').magnitude,2));
test('matrix product',()=>assert.deepEqual(val('[1,2;3,4]*[5;6]').v,[[17],[39]]));
test('matrix inverse',()=>{const x=val('inv([4,7;2,6])').v;near(x[0][0],.6);near(x[0][1],-.7);near(x[1][0],-.2);near(x[1][1],.4);});
test('pivoted linear solve',()=>assert.deepEqual(val('lsolve([0,1;2,3],[2;8])').v,[[1],[2]]));
test('scaled tiny nonsingular matrix',()=>near(val('det([1e-20,0;0,2e-20])').v,2e-40,1e-45));
test('dimensioned linear solve',()=>{const v=val('lsolve([2,0;0,4]*N/m,[4;8]*N)');assert.equal(formatValue(v,'m').text,'[2; 2] m');});
test('transpose postfix',()=>assert.deepEqual(val("[1,2;3,4]'").v,[[1,3],[2,4]]));
test('vectorized trigonometry',()=>near(val('sin([0,pi/2])').v[0][1],1));
test('elementwise powers',()=>assert.deepEqual(val('[1,2;3,4]^2').v,[[1,4],[9,16]]));
test('symbolic derivative evaluates correctly',()=>{const d=differentiate(parse('x^3 + sin(x)').value,'x');const env=new Map([['x',val('2')]]);near(evaluateAST(d,env).v,12+Math.cos(2));});
test('symbolic quotient and chain rules',()=>{const v=execute('diff(exp(x^2)/(x+1),x)').value;const env=new Map([['x',val('1')]]);near(evaluateAST(v.ast,env).v,.75*Math.E);});
test('source-unit conversion operator',()=>{const v=execute('2 m -> cm');near(formatValue(v.value,'cm').magnitude,200);assert.ok(v.statement.unit);});
test('functions capture definition-time environment',()=>{const env=new Map();execute('a := 3',env);execute('f(x) := a*x^2',env);execute('a := 10',env);near(execute('f(2)',env).value.v,12);});
for(const [source,code] of [['1 m+1 s','UNITS'],['sin(2 m)','UNITS'],['1/0','DIV_ZERO'],['sqrt(-1)','DOMAIN'],['unknown+1','UNDEFINED'],['[1,2;3]','SHAPE'],['inv([1,2;2,4])','SINGULAR'],['root(x^2+1,x,-1,1)','BRACKET'],['range(0,1,0)','DOMAIN'],['range(0,100000)','LIMIT'],['[1,2][9]','INDEX'],['sin()','ARGUMENT'],['a.constructor(1)','SYNTAX'],['f(x,x):=x','SYNTAX'],['1 m < 2 s','UNITS']])test('reject '+source,()=>bad(source,code));
test('MathML escapes identifiers',()=>assert.ok(astToMathML(parse('delta_max := 2').target).includes('<msub>')));
test('worksheet order and incremental invalidation',()=>{
  const k=new WorksheetKernel();const d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 2'},{id:'b',type:'math',x:0,y:30,source:'b := 3*a'},{id:'c',type:'math',x:0,y:60,source:'b+1'}]};
  near(k.calculate(d).results.c.formatted.magnitude,7);assert.equal(k.calculate(d).cacheHits,3);d.regions[0].source='a := 4';const r=k.calculate(d);near(r.results.c.formatted.magnitude,13);assert.equal(r.cacheHits,0);
});
test('invalid definitions do not leave stale downstream values',()=>{const k=new WorksheetKernel(),d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 3'},{id:'b',type:'math',x:0,y:20,source:'a*2'}]};k.calculate(d);d.regions[0].source='a := 1/0';const r=k.calculate(d);assert.equal(r.errors,2);assert.equal(r.results.b.code,'DEPENDENCY');});
test('function invalidation follows captured dependencies',()=>{const k=new WorksheetKernel(),d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 3'},{id:'f',type:'math',x:0,y:20,source:'f(x) := a*x'},{id:'r',type:'math',x:0,y:40,source:'f(2)'}]};near(k.calculate(d).results.r.formatted.magnitude,6);d.regions[0].source='a := 7';near(k.calculate(d).results.r.formatted.magnitude,14);});
test('reading order is page, y, then x',()=>{const r=new WorksheetKernel().calculate({regions:[{id:'b',type:'math',page:0,x:100,y:0,source:'a*2'},{id:'a',type:'math',page:0,x:0,y:0,source:'a := 9'}]});near(r.results.b.formatted.magnitude,18);});
test('plot sample units',()=>{const r=new WorksheetKernel().calculate({regions:[{id:'p',type:'plot',x:0,y:0,xMin:'0 m',xMax:'2 m',xUnit:'m',yUnit:'mm',expression:'x/1000'}]});assert.equal(r.errors,0);near(r.results.p.plot.series[0].points.at(-1)[1],2);});
test('beam physical result',()=>{const env=new Map();for(const s of ['L := 3 m','qload := 4 kN/m','E := 210 GPa','b := 100 mm','h := 180 mm','I := b*h^3/12','y(x) := qload*x^2*(6*L^2-4*L*x+x^2)/(24*E*I)'])execute(s,env);near(formatValue(execute('y(L)',env).value,'mm').magnitude,3.968253968253968);});
test('reject discontinuous root bracket',()=>bad('root(tan(x),x,1,2)','CONVERGENCE'));
test('dimensioned derivative with explicit step',()=>near(formatValue(val('deriv(sin(x/mm),x,0 m,0.001 mm)'),'1/m').magnitude,1000));
test('syntax-invalid shadowing definitions block downstream evaluation',()=>{const k=new WorksheetKernel(),d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 1'},{id:'b',type:'math',x:0,y:20,source:'a := ('},{id:'r',type:'math',x:0,y:40,source:'a*2'}]};const r=k.calculate(d);assert.equal(r.errors,2);assert.equal(r.results.r.code,'DEPENDENCY');});
test('reversed plot y bounds rejected',()=>{const r=new WorksheetKernel().calculate({regions:[{id:'p',type:'plot',x:0,y:0,xMin:'0',xMax:'2',yMin:'5',yMax:'1',expression:'x'}]});assert.equal(r.results.p.code,'DOMAIN');});
test('plot results are dependency cached',()=>{const k=new WorksheetKernel(),d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 2'},{id:'p',type:'plot',x:0,y:20,xMin:'0',xMax:'2',expression:'a*x'}]};k.calculate(d);assert.equal(k.calculate(d).plotCacheHits,1);d.regions[0].source='a := 3';const r=k.calculate(d);assert.equal(r.plotCacheHits,0);near(r.results.p.plot.series[0].points.at(-1)[1],6);});
test('symbolic expression budgets are enforced',()=>{assert.throws(()=>differentiate(parse('x^x').value,'x',{steps:50000}),e=>e.code==='LIMIT');});

test('invalid slider definitions poison downstream shadowed values',()=>{const d={regions:[{id:'a',type:'math',x:0,y:0,source:'a := 3'},{id:'s',type:'slider',x:0,y:20,variable:'a',value:2,unit:'unknown_unit'},{id:'r',type:'math',x:0,y:40,source:'a+1'}]};const r=new WorksheetKernel().calculate(d);assert.equal(r.errors,2);assert.equal(r.results.r.code,'DEPENDENCY');});
