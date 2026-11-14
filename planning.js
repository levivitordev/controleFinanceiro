function monthCode(index){
  return Math.floor(index/12)+'-'+String(index%12+1).padStart(2,'0');
}
function monthPlan(records,month){
  const active=records.filter(r=>r.start<=month);
  const salary=active.filter(r=>r.kind==='salary').sort((a,b)=>b.start.localeCompare(a.start))[0];
  const totals={income:salary?.cents||0,expense:0,reserve:0};
  const categories=new Map(), bills=[], limits=new Map();
  function expense(category,cents){
    totals.expense+=cents;
    categories.set(category,(categories.get(category)||0)+cents);
  }
  for(const r of active){
    const category=r.category||'Outros';
    if(r.kind==='bill'){
      if(r.end && month>=r.end)continue;
      const change=r.months?.[month];
      const amount=change?.cents??r.cents;
      expense(category,amount);
      bills.push({r,amount,paid:change?.paid===true});
    }else if(r.kind==='limit'){
      if(!limits.has(category)||limits.get(category).start<r.start)limits.set(category,r);
    }else if(r.kind!=='salary'){
      const i=serial(month)-serial(r.start);
      if(i>=r.count)continue;
      const amount=installment(r,i);
      if(r.kind==='expense')expense(category,amount);
      else totals[r.kind]+=amount;
    }
  }
  return {salary,totals,bills,limits,categories,balance:totals.income-totals.expense-totals.reserve};
}
function action(label,fn){
  const button=node('button',label);
  button.onclick=fn;
  return button;
}
let planningType, selectedBill;
function planningForm(type){
  planningType=type;
  $('planForm').reset();
  const bill=type==='bill';
  $('planTitle').textContent=bill?'Nova conta recorrente':'Limite mensal por categoria';
  $('billNameLabel').hidden=$('dayLabel').hidden=!bill;
  $('billName').required=$('due').required=bill;
  $('planDialog').showModal();
}
function renderPlan(plan,records){
  const month=$('month').value;
  const options=new Set(['Alimentação','Moradia','Transporte','Saúde','Lazer','Outros',...records.map(r=>r.category).filter(Boolean)]);
  $('categoryOptions').replaceChildren(...Array.from(options,c=>node('option',c)));
  $('bills').replaceChildren();$('limits').replaceChildren();
  for(const {r,amount,paid} of plan.bills.sort((a,b)=>a.r.day-b.r.day)){
    const day=Math.min(r.day,new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate());
    const item=node('article',''),label=node('div',r.description);
    label.append(node('small',(paid?'Paga':'Prevista')+' · Dia '+day+' · '+(r.category||'Outros')));
    item.append(label,node('b',money(amount)),action('Atualizar mês',()=>{
      selectedBill=r.id;$('billTitle').textContent=r.description;$('actual').value=(amount/100).toFixed(2);
      $('paid').value=paid?'yes':'no';$('billDialog').showModal();
    }),action('Encerrar',()=>{
      if(confirm('Encerrar esta conta após o mês selecionado?'))persist(read().map(row=>row.id===r.id?{...row,end:monthCode(serial(month)+1)}:row));
    }));
    $('bills').append(item);
  }
  for(const [category,r] of plan.limits){
    const used=plan.categories.get(category)||0;
    const item=node('article',''),label=node('div',category);
    label.append(node('small',money(used)+' usados de '+money(r.cents)));
    item.append(label,node('b',used>r.cents?'Excedeu '+money(used-r.cents):'Restam '+money(r.cents-used)));
    $('limits').append(item);
  }
  if(!plan.bills.length)$('bills').textContent='Nenhuma conta recorrente neste mês.';
  if(!plan.limits.size)$('limits').textContent='Escolha uma categoria para acompanhar seu limite mensal.';
}
function previewPurchase(){
  if(!$('simulation').open)return;
  const cents=Math.round(Number(fields.amount.value)*100), count=Number(fields.count.value);
  const target=$('projection');target.replaceChildren();
  if(!fields.start.value || !Number.isInteger(count)||count<1||count>120||!(cents>0)){
    target.textContent='Informe o valor, o mês e a quantidade de parcelas.';return;
  }
  const records=read().filter(r=>r.id!==editing);
  for(let i=0;i<count;i++){
    const month=monthCode(serial(fields.start.value)+i);
    const cost=installment({cents,count},i);
    const balance=monthPlan(records,month).balance-cost;
    const row=node('article','');
    row.append(node('span',month.split('-').reverse().join('/')+' · '+money(cost)),node('b',(balance<0?'Faltam ':'Sobram ')+money(Math.abs(balance))));
    target.append(row);
  }
}
function bindPlanning(){
  $('newBill').onclick=()=>planningForm('bill');
  $('newLimit').onclick=()=>planningForm('limit');
  $('planForm').onsubmit=e=>{
    e.preventDefault();
    const rows=read(), start=$('month').value;
    const typed=$('planCategory').value.trim();
    if(!typed)return;
    const category=Array.from($('categoryOptions').options,o=>o.value).find(c=>c.toLocaleLowerCase()===typed.toLocaleLowerCase())||typed;
    const bill=planningType==='bill';
    const record={id:crypto.randomUUID(),kind:planningType,start,category,description:bill?$('billName').value.trim():category,cents:Math.round(Number($('planAmount').value)*100),count:1};
    if(bill)record.day=Number($('due').value);
    try{persist([...rows.filter(r=>bill||r.kind!=='limit'||r.category!==category||r.start!==start),record]);$('planDialog').close()}catch{alert('Confira os dados da conta ou limite.')}
  };
  $('billForm').onsubmit=e=>{
    e.preventDefault();
    const month=$('month').value,change={paid:$('paid').value==='yes',cents:Math.round(Number($('actual').value)*100)};
    persist(read().map(r=>r.id===selectedBill?{...r,months:{...r.months,[month]:change}}:r));
    $('billDialog').close();
  };
  $('simulation').ontoggle=previewPurchase;
  $('form').addEventListener('input',previewPurchase);
}
