/** Retained viewport composition: one dynamically-sized vertex buffer, one draw, 4× MSAA. */
export const PALETTE = ['#19866b','#7c70c8','#d59a3b','#458dba','#d66778','#5c9c53','#4c5875','#ba744e'];
function rgba(color, alpha=1) {
  const n=parseInt(color.replace('#',''),16);return [(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,alpha];
}
export class SceneBatch {
  constructor(){this.data=new Float32Array(65536);this.used=0;this.commands=[];}
  reset(){this.used=0;this.commands.length=0;}
  vertex(x,y,c){if(this.used+6>this.data.length){const bigger=new Float32Array(this.data.length*2);bigger.set(this.data);this.data=bigger;}const o=this.used,a=this.data;a[o]=x;a[o+1]=y;a[o+2]=c[0];a[o+3]=c[1];a[o+4]=c[2];a[o+5]=c[3];this.used+=6;}
  quad(x1,y1,x2,y2,x3,y3,x4,y4,c1,c2=c1,c3=c1,c4=c1){this.vertex(x1,y1,c1);this.vertex(x2,y2,c2);this.vertex(x3,y3,c3);this.vertex(x1,y1,c1);this.vertex(x3,y3,c3);this.vertex(x4,y4,c4);}
  rect(x,y,w,h,color,alpha=1){if(w<=0||h<=0)return;const c=rgba(color,alpha);this.quad(x,y,x+w,y,x+w,y+h,x,y+h,c);this.commands.push({type:'rect',x,y,w,h,color,alpha});}
  line(x1,y1,x2,y2,width=1,color='#dde3e2',alpha=1){
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<1e-7)return;const nx=-dy/len,ny=dx/len,r=width/2,c=rgba(color,alpha),t=rgba(color,0),aa=.65;
    const ax=x1+nx*r,ay=y1+ny*r,bx=x2+nx*r,by=y2+ny*r,cx=x2-nx*r,cy=y2-ny*r,ex=x1-nx*r,ey=y1-ny*r;
    this.quad(ax,ay,bx,by,cx,cy,ex,ey,c);
    this.quad(ax+nx*aa,ay+ny*aa,bx+nx*aa,by+ny*aa,bx,by,ax,ay,t,t,c,c);
    this.quad(ex,ey,cx,cy,cx-nx*aa,cy-ny*aa,ex-nx*aa,ey-ny*aa,c,c,t,t);
    this.commands.push({type:'line',x1,y1,x2,y2,width,color,alpha});
  }
}
const WGSL = `
struct Viewport { size: vec2f, padding: vec2f };
@group(0) @binding(0) var<uniform> viewport: Viewport;
struct VertexOut { @builtin(position) position: vec4f, @location(0) color: vec4f };
@vertex fn vs(@location(0) position: vec2f, @location(1) color: vec4f) -> VertexOut {
  var out: VertexOut;
  out.position = vec4f(position.x / viewport.size.x * 2.0 - 1.0, 1.0 - position.y / viewport.size.y * 2.0, 0.0, 1.0);
  out.color = color;
  return out;
}
@fragment fn fs(in: VertexOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a);
}`;
export class ViewportRenderer {
  constructor(canvas,onStatus=()=>{}){this.canvas=canvas;this.onStatus=onStatus;this.mode='initializing';this.width=1;this.height=1;this.dpr=1;this.bufferBytes=0;this.drawCalls=0;this.vertexCount=0;this.disposed=false;this.lastScene=null;}
  async initialize(forceFallback=false){
    if(forceFallback||!navigator.gpu){this.fallback(forceFallback?'Canvas 2D selected':'WebGPU is unavailable in this browser');return;}
    try{
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw new Error('No compatible GPU adapter');
      this.device=await adapter.requestDevice();if(this.disposed){this.device.destroy();return;}
      this.device.lost.then(info=>{if(!this.disposed)this.fallback(`GPU device lost: ${info.message||info.reason}`);});
      this.device.addEventListener('uncapturederror',e=>{this.onStatus({mode:this.mode,error:e.error.message});});
      this.context=this.canvas.getContext('webgpu');if(!this.context)throw new Error('WebGPU canvas context unavailable');
      this.format=navigator.gpu.getPreferredCanvasFormat();this.context.configure({device:this.device,format:this.format,alphaMode:'premultiplied'});
      const shader=this.device.createShaderModule({label:'Axiom viewport WGSL',code:WGSL});
      const info=await shader.getCompilationInfo();if(info.messages.some(m=>m.type==='error'))throw new Error(info.messages.filter(m=>m.type==='error').map(m=>m.message).join('\n'));
      this.pipeline=this.device.createRenderPipeline({label:'Axiom antialiased 2D mesh',layout:'auto',vertex:{module:shader,entryPoint:'vs',buffers:[{arrayStride:24,attributes:[{shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x4'}]}]},fragment:{module:shader,entryPoint:'fs',targets:[{format:this.format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha'}}}]},primitive:{topology:'triangle-list'},multisample:{count:4}});
      this.uniform=this.device.createBuffer({label:'Viewport size',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
      this.bindGroup=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniform}}]});
      this.mode='webgpu';this.resize(this.width,this.height,this.dpr,true);this.onStatus({mode:'webgpu',description:'WebGPU · 4× MSAA'});
      if(this.lastScene)this.render(this.lastScene);
    }catch(error){this.fallback(error.message);}
  }
  fallback(reason){
    if(this.mode==='canvas2d')return;
    this.msaa?.destroy();this.vertexBuffer?.destroy();this.uniform?.destroy();this.context?.unconfigure?.();
    // Canvas context types are immutable: a lost WebGPU canvas must be replaced.
    const replacement=this.canvas.cloneNode(false);replacement.width=this.canvas.width;replacement.height=this.canvas.height;this.canvas.replaceWith(replacement);this.canvas=replacement;
    this.ctx=this.canvas.getContext('2d',{alpha:true,desynchronized:true});this.mode='canvas2d';this.onStatus({mode:'canvas2d',description:'Canvas 2D fallback',reason});this.resize(this.width,this.height,this.dpr,true);if(this.lastScene)this.render(this.lastScene);
  }
  resize(width,height,dpr=window.devicePixelRatio||1,force=false){
    width=Math.max(1,width);height=Math.max(1,height);dpr=Math.min(3,Math.max(1,dpr));
    if(!force&&width===this.width&&height===this.height&&dpr===this.dpr)return;
    this.width=width;this.height=height;this.dpr=dpr;const max=this.device?.limits.maxTextureDimension2D||16384;
    this.canvas.width=Math.min(max,Math.ceil(width*dpr));this.canvas.height=Math.min(max,Math.ceil(height*dpr));this.canvas.style.width=width+'px';this.canvas.style.height=height+'px';
    if(this.mode==='webgpu'){
      this.msaa?.destroy();this.msaa=this.device.createTexture({label:'Viewport 4× MSAA',size:[this.canvas.width,this.canvas.height],sampleCount:4,format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT});
      this.device.queue.writeBuffer(this.uniform,0,new Float32Array([width,height,0,0]));
    }
  }
  render(batch){
    this.lastScene=batch;if(this.disposed)return;const start=performance.now();
    if(this.mode==='webgpu'){
      try{
        const required=batch.used*4;
        if(required>this.bufferBytes){this.vertexBuffer?.destroy();this.bufferBytes=Math.max(65536,2**Math.ceil(Math.log2(required)));this.vertexBuffer=this.device.createBuffer({label:'Retained 2D mesh',size:this.bufferBytes,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
        if(required)this.device.queue.writeBuffer(this.vertexBuffer,0,batch.data,0,batch.used);
        const encoder=this.device.createCommandEncoder({label:'Axiom frame'}),pass=encoder.beginRenderPass({colorAttachments:[{view:this.msaa.createView(),resolveTarget:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'discard',clearValue:{r:0,g:0,b:0,a:0}}]});
        if(required){pass.setPipeline(this.pipeline);pass.setBindGroup(0,this.bindGroup);pass.setVertexBuffer(0,this.vertexBuffer);pass.draw(batch.used/6);}pass.end();this.device.queue.submit([encoder.finish()]);this.drawCalls=required?1:0;this.vertexCount=batch.used/6;
      }catch(e){this.fallback(e.message);return;}
    }else if(this.mode==='canvas2d'){
      const c=this.ctx;if(!c)return;c.setTransform(this.canvas.width/this.width,0,0,this.canvas.height/this.height,0,0);c.clearRect(0,0,this.width,this.height);
      for(const command of batch.commands){c.globalAlpha=command.alpha;if(command.type==='rect'){c.fillStyle=command.color;c.fillRect(command.x,command.y,command.w,command.h);}else{c.strokeStyle=command.color;c.lineWidth=command.width;c.lineCap='round';c.beginPath();c.moveTo(command.x1,command.y1);c.lineTo(command.x2,command.y2);c.stroke();}}c.globalAlpha=1;this.drawCalls=batch.commands.length;this.vertexCount=0;
    }
    this.cpuSubmitMs=performance.now()-start;
  }
  dispose(){this.disposed=true;this.msaa?.destroy();this.vertexBuffer?.destroy();this.uniform?.destroy();this.device?.destroy();}
}
/** Liang–Barsky clipping, performed before tessellation to avoid pathological coordinates. */
export function clipLine(x0,y0,x1,y1,rect) {
  const dx=x1-x0,dy=y1-y0,p=[-dx,dx,-dy,dy],q=[x0-rect.x,rect.x+rect.w-x0,y0-rect.y,rect.y+rect.h-y0];let t0=0,t1=1;
  for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return null;}else{const r=q[i]/p[i];if(p[i]<0){if(r>t1)return null;t0=Math.max(t0,r);}else{if(r<t0)return null;t1=Math.min(t1,r);}}}
  return [x0+t0*dx,y0+t0*dy,x0+t1*dx,y0+t1*dy];
}
