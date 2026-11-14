let pdfLibrary;
function loadPdfLibrary(){
  if(!pdfLibrary)pdfLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='vendor/pdf-lib.min.js';
    script.onload=()=>resolve(window.PDFLib);
    script.onerror=()=>{pdfLibrary=null;script.remove();reject(Error('Biblioteca indisponível'))};
    document.head.append(script);
  });
  return pdfLibrary;
}
async function monthlyPdf(rows,month){
  const {PDFDocument,StandardFonts,rgb}=await loadPdfLibrary();
  const doc=await PDFDocument.create();
  const regular=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.08,.19,.27),blue=rgb(.15,.38,.55),rule=rgb(.8,.87,.92);
  const period=month.split('-').reverse().join('/');
  doc.setTitle('Prumo - Relatório mensal '+period);
  let page,y;
  function newPage(){
    page=doc.addPage([595,842]);y=742;
    page.drawText('Prumo',{x:40,y:790,font:bold,size:24,color:ink});
    page.drawText('RELATÓRIO MENSAL   /   '+period,{x:329,y:795,size:12,font:bold,color:blue});
    page.drawLine({start:{x:40,y:772},end:{x:555,y:772},color:rule,thickness:1});
  }
  function ensure(height){if(!page||y-height<48)newPage()}
  function heading(label){
    ensure(60);y-=9;page.drawText(label,{x:40,y,font:bold,size:15,color:blue});y-=24;
  }
  // Use the browser font for descriptions outside the built-in PDF font's character set.
  async function line(label,value=''){
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    ctx.font='22px Inter, sans-serif';
    let built='';
    async function draw(text,first){
      ensure(18);
      try{regular.encodeText(text);page.drawText(text,{x:40,y,font:regular,size:11,color:ink})}
      catch{
        canvas.width=800;canvas.height=36;ctx.font='22px Inter, sans-serif';ctx.fillStyle='#163046';ctx.fillText(text,0,24);
        const image=await doc.embedPng(canvas.toDataURL());page.drawImage(image,{x:40,y:y-6,width:400,height:18});
      }
      if(first&&value)page.drawText(value,{x:555-bold.widthOfTextAtSize(value,11),y,font:bold,size:11,color:ink});
      y-=17;
    }
    let first=true;
    for(const letter of label.replace(/\s+/g,' ')){
      if(ctx.measureText(built+letter).width>740){await draw(built,first);first=false;built=''}
      built+=letter;
    }
    await draw(built,first);
  }
  const plan=monthPlan(rows,month);
  heading('Resumo do orçamento');
  for(const [label,total] of [['Receitas',plan.totals.income],['Gastos e parcelas',plan.totals.expense],['Reserva planejada',plan.totals.reserve],[plan.balance<0?'Falta para cobrir o mês':'Disponível para gastar',Math.abs(plan.balance)]])await line(label,money(total));
  heading('Lançamentos do mês');
  let count=0;
  if(plan.salary){await line('Renda mensal',money(plan.salary.cents));count++}
  for(const r of rows){
    if(!['income','expense','reserve'].includes(r.kind))continue;
    const index=serial(month)-serial(r.start);
    if(index<0||index>=r.count)continue;
    const details=[kinds[r.kind],r.description];
    if(r.kind==='expense')details.push(r.category||'Outros');
    if(r.count>1)details.push('Parcela '+(index+1)+' de '+r.count);
    await line(details.join(' · '),money(installment(r,index)));count++;
  }
  if(!count)await line('Nenhum lançamento neste mês.');
  heading('Contas recorrentes');
  for(const {r,paid,amount} of plan.bills){
    const [year,m]=month.split('-').map(Number);
    const due=Math.min(r.day,new Date(year,m,0).getDate());
    await line(r.description+' · '+(paid?'Paga':'Prevista')+' · Dia '+due,money(amount));
  }
  if(!plan.bills.length)await line('Nenhuma conta recorrente neste mês.');
  heading('Gastos por categoria');
  for(const category of new Set([...plan.categories.keys(),...plan.limits.keys()])){
    const limit=plan.limits.get(category);
    await line(category+(limit?' · Limite '+money(limit.cents):''),money(plan.categories.get(category)||0));
  }
  if(!plan.categories.size&&!plan.limits.size)await line('Nenhum gasto ou limite neste mês.');
  doc.getPages().forEach((p,i)=>p.drawText('Prumo   /   '+period+'                                         '+(i+1)+' de '+doc.getPageCount(),{x:40,y:25,font:regular,size:9,color:blue}));
  return doc.save();
}
$('downloadPdf').onclick=async()=>{
  const button=$('downloadPdf'),month=$('month').value;
  if(!month){$('pdfStatus').textContent='Selecione um mês para baixar o relatório.';return}
  button.disabled=true;$('pdfStatus').textContent='Gerando PDF…';
  try{
    const data=await monthlyPdf(read(),month);
    const url=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));
    const a=document.createElement('a');a.href=url;a.download='Prumo-'+month+'.pdf';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('pdfStatus').textContent='Relatório gerado.';
  }catch{$('pdfStatus').textContent='Falha ao gerar o relatório. Tente novamente.'}
  finally{button.disabled=false}
};
