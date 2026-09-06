import { WorksheetKernel } from './kernel.js';
const kernel = new WorksheetKernel();
self.onmessage = ({data}) => {
  if(data.type!=='calculate')return;
  try {self.postMessage({id:data.id,...kernel.calculate(data.document)});}
  catch(error){self.postMessage({id:data.id,fatal:error.message});}
};
