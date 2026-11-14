'use strict';
const $ = id => document.getElementById(id);
const fields = $('form').elements;
const money = cents => (cents / 100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const key = 'saldo-pessoal-v1';
const now = new Date();
$('month').value = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
let editing = null;
const kinds = {income:'Receita',expense:'Despesa',reserve:'Reserva',salary:'Renda mensal'};
function valid(rows){
  return Array.isArray(rows) && new Set(rows.map(r=>r?.id)).size===rows.length && rows.every(r=>r && typeof r.id==='string' && typeof r.description==='string' && r.description.trim() && Object.hasOwn(kinds,r.kind) && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.start) && Number.isSafeInteger(r.cents) && (r.cents>0 || (r.cents===0 && r.kind==='salary')) && r.cents<=99999999900 && Number.isInteger(r.count) && r.count>=1 && r.count<=120 && (r.kind==='expense'||r.count===1));
}
function read(){
  const rows=JSON.parse(localStorage.getItem(key)||'[]');
  if(!valid(rows)) throw Error('Dados inválidos');
  return rows;
}
function persist(rows){
  if(!valid(rows))throw Error('Lançamento inválido');
  localStorage.setItem(key,JSON.stringify(rows));
  render();
}
function serial(month){const [year,m]=month.split('-').map(Number);return year*12+m-1}
function installment(r,i){return Math.floor(r.cents/r.count)+(i<r.cents%r.count?1:0)}
function node(tag,value){const el=document.createElement(tag);el.textContent=value;return el}
function line(parent,r,i,upcoming){
  const item=node('article',''), label=node('div',r.description);
  const date=serial(r.start)+i;
  label.append(node('small',kinds[r.kind]+(r.count>1?' · Parcela '+(i+1)+' de '+r.count:'')+' · '+String(date%12+1).padStart(2,'0')+'/'+Math.floor(date/12)));
  item.append(label,node('b',money(installment(r,i))));
  if(!upcoming){
    const controls=node('div',''), edit=node('button','Editar'), del=node('button','Excluir');
    edit.onclick=()=>openForm(r);
    del.onclick=()=>{if(confirm('Excluir '+r.description+' e todas as suas parcelas?'))persist(read().filter(x=>x.id!==r.id))};
    controls.append(edit,del);item.append(controls);
  }
  parent.append(item);
}
function render(){
  if(!$('month').value)return;
  const selected=serial($('month').value), totals={income:0,expense:0,reserve:0}, future=[];
  $('entries').replaceChildren();$('future').replaceChildren();
  const records=read();
  const salary=records.filter(r=>r.kind==='salary' && r.start<=$('month').value).sort((a,b)=>b.start.localeCompare(a.start))[0];
  totals.income=salary?.cents??0;
  $('salaryValue').textContent=money(totals.income);
  $('salaryButton').textContent=salary?'Ajustar renda mensal':'Definir renda mensal';
  for(const r of records){
    if(r.kind==='salary') continue;
    const i=selected-serial(r.start);
    if(i>=0&&i<r.count){totals[r.kind]+=installment(r,i);line($('entries'),r,i,false)}
    if(r.count>1)for(let j=Math.max(0,i+1);j<r.count;j++)future.push([r,j]);
  }
  future.sort(([a,i],[b,j])=>serial(a.start)+i-serial(b.start)-j).forEach(([r,i])=>line($('future'),r,i,true));
  if(!future.length)$('future').textContent='Suas próximas parcelas aparecerão aqui.';
  if(!$('entries').children.length)$('entries').textContent='Seus gastos e outros lançamentos aparecerão aqui.';
  const balance=totals.income-totals.expense-totals.reserve;
  const committed=totals.expense+totals.reserve;
  const ratio=totals.income?Math.round(committed*100/totals.income):0;
  $('progress').value=totals.income?Math.min(100,ratio):committed?100:0;
  $('commitment').textContent=money(committed);
  $('ratio').textContent=totals.income?ratio+'% da renda': 'Sem renda no mês';
  $('warning').textContent=balance<0?'Faltam '+money(-balance)+' para cobrir este mês.':'';
  $('caption').textContent='Disponível para gastar';
  $('balance').textContent=money(Math.max(0,balance));
  $('income').textContent=money(totals.income);$('spent').textContent=money(totals.expense);$('saved').textContent=money(totals.reserve);
}
function toggleCount(){fields.count.disabled=fields.kind.value!=='expense';if(fields.count.disabled)fields.count.value=1}
function openForm(r){
  editing=r?.id??null;$('form').reset();$('title').textContent=r?'Editar lançamento':'Novo lançamento';
  fields.start.value=r?.start??$('month').value;
  if(r){fields.description.value=r.description;fields.kind.value=r.kind;fields.amount.value=(r.cents/100).toFixed(2);fields.count.value=r.count}
  toggleCount();$('editor').showModal();
}
$('form').onsubmit=e=>{
  e.preventDefault();
  const record={id:editing??crypto.randomUUID(),description:fields.description.value.trim(),kind:fields.kind.value,start:fields.start.value,cents:Math.round(Number(fields.amount.value)*100),count:Number(fields.count.value)};
  try{const rows=read();persist(editing?rows.map(r=>r.id===editing?record:r):[...rows,record]);$('editor').close()}catch{alert('Não foi possível salvar. Confira a descrição e o armazenamento do navegador.')}
};
$('salaryButton').onclick=()=>{
  const month=$('month').value;
  if(!month)return;
  const active=read().filter(r=>r.kind==='salary' && r.start<=month).sort((a,b)=>b.start.localeCompare(a.start))[0];
  $('salaryAmount').value=active?(active.cents/100).toFixed(2):'';
  $('effective').textContent='Vale a partir de '+month.split('-').reverse().join('/')+' e se repete nos meses seguintes.';
  $('salaryDialog').showModal();
};
$('salaryForm').onsubmit=e=>{
  e.preventDefault();
  const start=$('month').value;
  const rows=read().filter(r=>!(r.kind==='salary' && r.start===start));
  const record={id:crypto.randomUUID(),kind:'salary',description:'Renda mensal',start,count:1,cents:Math.round(Number($('salaryAmount').value)*100)};
  try{persist([...rows,record]);$('salaryDialog').close()}catch{alert('Não foi possível salvar a renda mensal.')}
};
fields.kind.onchange=toggleCount;$('add').onclick=()=>openForm();$('cancel').onclick=()=>$('editor').close();$('month').onchange=render;
$('backup').onclick=()=>{const a=node('a','');a.href=URL.createObjectURL(new Blob([JSON.stringify(read())],{type:'application/json'}));a.download='saldo-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('restore').onclick=()=>$('file').click();
$('file').onchange=async e=>{
  try{const rows=JSON.parse(await e.target.files[0].text());if(!valid(rows))throw Error();if(confirm('Substituir os lançamentos atuais por '+rows.length+' registros da cópia?'))persist(rows)}catch{alert('Não foi possível restaurar essa cópia.')}finally{e.target.value=''}
};
window.addEventListener('storage',render);
try{render()}catch{alert('Armazenamento indisponível ou dados inválidos. Verifique o navegador ou restaure uma cópia.')}

const preference=window.matchMedia('(prefers-color-scheme: dark)');
function updateThemeButton(){
  const choice=document.documentElement.dataset.theme;
  const dark=choice ? choice==='dark' : preference.matches;
  $('theme').setAttribute('aria-pressed',String(dark));
  $('theme').textContent=dark?'☾  Modo escuro':'☀  Modo claro';
}
$('theme').onclick=()=>{
  const theme=$('theme').getAttribute('aria-pressed')==='true'?'light':'dark';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('saldo-theme',theme)}catch{}
  updateThemeButton();
};
preference.addEventListener('change',updateThemeButton);
updateThemeButton();
