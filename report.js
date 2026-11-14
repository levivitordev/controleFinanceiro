function loadScript(src){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.onload=resolve;script.onerror=reject;script.src=src;document.head.append(script);
  });
}
let resources;
function reportAssets(){
  if(!resources)resources=Promise.all([
    loadScript('vendor/pdf-lib.min.js'),loadScript('vendor/fontkit.umd.min.js'),
    ...['regular','semibold'].map(async weight=>{
      const response=await fetch('vendor/inter-'+weight+'.ttf');
      if(!response.ok)throw Error('Fonte indisponível');
      return response.arrayBuffer();
    })
  ]).catch(error=>{resources=null;throw error});
  return resources;
}
async function monthlyPdf(rows,month){
  const [,,regularBytes,boldBytes]=await reportAssets();
  const {PDFDocument,rgb}=window.PDFLib;
  const doc=await PDFDocument.create();doc.registerFontkit(window.fontkit);
  const regular=await doc.embedFont(regularBytes),bold=await doc.embedFont(boldBytes);
  const plan=monthPlan(rows,month);
  const [year,m]=month.split('-').map(Number);
  const date=new Date(year,m-1,1);
  const period=date.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const ink=rgb(.08,.19,.27),blue=rgb(.15,.38,.55),soft=rgb(.93,.96,.98),white=rgb(1,1,1),muted=rgb(.27,.36,.43);
  doc.setTitle('Prumo | '+period);doc.setAuthor('Prumo');
  let page,y;
  function label(str,x,base,size=10,font=regular,color=ink,right=false){
    page.drawText(str,{x:right?x-font.widthOfTextAtSize(str,size):x,y:base,size,font,color});
  }
  function rect(x,base,width,height,color){page.drawRectangle({x,y:base,width,height,color})}
  function newPage(){
    page=doc.addPage([595,842]);y=745;
    label('Prumo',42,789,22,bold);label('Orçamento pessoal',553,794,10,regular,muted,true);
    rect(42,772,511,1,blue);
  }
  newPage();
  label('Relatório mensal',42,y-4,25,bold);label(period,553,y,12,regular,blue,true);y-=27;
  rect(42,y-70,511,70,ink);
  label(plan.balance<0?'Falta para cobrir o mês':'Disponível para gastar',58,y-22,11,regular,white);
  label(money(Math.abs(plan.balance)),58,y-53,24,bold,white);y-=70;
  rect(42,y-54,511,54,soft);
  [['Receitas',plan.totals.income],['Gastos e parcelas',plan.totals.expense],['Reserva planejada',plan.totals.reserve]].forEach(([name,value],i)=>{
    const x=56+i*170;label(name,x,y-18,9,regular,muted);
    const amount=money(value);label(amount,x,y-39,Math.min(14,146/bold.widthOfTextAtSize(amount,1)),bold);
  });y-=75;
  function wrap(value,width,font,size){
    const lines=[];let line='';
    for(const word of value.trim().split(/\s+/)){
      const next=line?line+' '+word:word;
      if(font.widthOfTextAtSize(next,size)<=width){line=next;continue}
      if(line)lines.push(line);line='';
      for(const ch of word){
        if(line&&font.widthOfTextAtSize(line+ch,size)>width){lines.push(line);line=''}
        line+=ch;
      }
    }
    if(line)lines.push(line);return lines;
  }
  const supported=new Set(regular.getCharacterSet());
  async function renderLine(str,x,base,size,font,color){
    if(Array.from(str).every(ch=>supported.has(ch.codePointAt(0)))){label(str,x,base,size,font,color);return}
    const canvas=document.createElement('canvas');canvas.width=1125;canvas.height=48;
    const ctx=canvas.getContext('2d');ctx.font=(font===bold?'650 ':'400 ')+size*3+'px Inter, sans-serif';
    ctx.fillStyle='#163046';ctx.fillText(str,0,36,1125);
    const image=await doc.embedPng(canvas.toDataURL());page.drawImage(image,{x,y:base-4,width:375,height:16});
  }
  async function section(title,items,empty){
    function header(continued){
      label(title+(continued?' (continuação)':''),42,y,15,bold,blue);y-=14;
      rect(42,y-1,511,1,soft);y-=15;
    }
    if(y<135)newPage();
    header(false);
    if(!items.length){label(empty,42,y,10,regular,muted);y-=28;return}
    for(const [name,detail,amount] of items){
      const names=wrap(name,365,bold,10.5),notes=wrap(detail,365,regular,9);
      const height=14*names.length+12*notes.length+12;
      if(y-height<46){newPage();header(true)}
      label(money(amount),553,y,10.5,bold,ink,true);
      for(const text of names){await renderLine(text,42,y,10.5,bold,ink);y-=14}
      for(const text of notes){await renderLine(text,42,y,9,regular,muted);y-=12}
      rect(42,y+3,511,.5,soft);y-=12;
    }
    y-=9;
  }
  const categories=Array.from(new Set([...plan.categories.keys(),...plan.limits.keys()]),category=>{
    const spent=plan.categories.get(category)||0,limit=plan.limits.get(category);
    const remaining=limit?limit.cents-spent:0;
    const note=limit?'Limite '+money(limit.cents)+' · '+(remaining<0?'Excedido em ':'Restam ')+money(Math.abs(remaining)):'';
    return [category,note,spent];
  }).sort((a,b)=>b[2]-a[2]);
  await section('Gastos por categoria',categories,'Nenhum gasto ou limite neste mês.');
  const bills=plan.bills.slice().sort((a,b)=>a.r.day-b.r.day).map(({r,paid,amount})=>{
    const day=Math.min(r.day,new Date(year,m,0).getDate());
    return [r.description,(paid?'Paga':'Prevista')+' · Vencimento em '+String(day).padStart(2,'0')+'/'+month.slice(5),amount];
  });
  await section('Contas recorrentes',bills,'Nenhuma conta recorrente neste mês.');
  const entries=plan.salary?[['Renda mensal','Receita recorrente',plan.salary.cents]]:[];
  for(const r of rows){
    if(!['expense','income','reserve'].includes(r.kind))continue;
    const i=serial(month)-serial(r.start);
    if(i<0||i>=r.count)continue;
    const notes=[kinds[r.kind]];
    if(r.kind==='expense')notes.push(r.category||'Outros');
    if(r.count>1)notes.push('Parcela '+(i+1)+' de '+r.count);
    entries.push([r.description,notes.join(' · '),installment(r,i)]);
  }
  await section('Lançamentos do mês',entries,'Nenhum lançamento neste mês.');
  const pages=doc.getPages();
  pages.forEach((sheet,i)=>{page=sheet;rect(42,43,511,.6,soft);label('Prumo   /   '+period,42,26,9,regular,muted);label((i+1)+' de '+pages.length,553,26,9,regular,muted,true)});
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

