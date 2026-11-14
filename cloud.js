const cloudKey='prumo-access';
const checkpoint='prumo-cloud-checkpoint';
let running=false;
let conflict=null;
const statusText=text=>{$('syncStatus').textContent=text};
function setLocal(rows){
  localStorage.setItem(key,JSON.stringify(rows));
  render();
}
async function api(method,body){
  const response=await fetch('/api/orcamento',{method,cache:'no-store',headers:{
    Authorization:'Bearer '+localStorage.getItem(cloudKey),'Content-Type':'application/json'
  },body:body?JSON.stringify(body):undefined});
  if(!response.ok)throw Object.assign(Error(),{status:response.status});
  return response.json();
}
async function sync(){
  if(!localStorage.getItem(cloudKey)||running||conflict)return;
  running=true;
  statusText('Sincronizando…');
  try{
    const remote=await api('GET');
    if(!valid(remote.rows))throw Error();
    const local=read(), previous=localStorage.getItem(checkpoint);
    const equal=JSON.stringify(local)===JSON.stringify(remote.rows);
    const localChanged=previous===null?local.length>0:JSON.stringify(local)!==previous;
    const remoteChanged=previous===null?remote.rows.length>0:JSON.stringify(remote.rows)!==previous;
    if(!equal && localChanged && remoteChanged){
      conflict=remote;
      $('resolve').hidden=false;
      statusText('Há duas versões. Exporte a cópia local antes de escolher qual manter.');
      return;
    }
    if(!equal && localChanged){
      await api('PUT',{rows:local,revision:remote.revision});
    }else if(!equal)setLocal(remote.rows);
    const saved=JSON.stringify(localChanged?local:remote.rows);
    localStorage.setItem(checkpoint,saved);
    statusText('Salvo neste navegador e na nuvem privada.');
    if(JSON.stringify(read())!==saved)setTimeout(sync,0);
  }catch(e){
    statusText(e.status===401?'Chave inválida. Abra Acesso pessoal e confira a chave.':'Cópia local preservada. A sincronização será tentada novamente.');
  }finally{running=false}
}
$('access').onclick=()=>$('accessDialog').showModal();
$('accessForm').onsubmit=e=>{
  e.preventDefault();localStorage.setItem(cloudKey,$('accessKey').value.trim());
  $('accessKey').value='';$('accessDialog').close();sync();
};
$('resolve').onclick=()=>$('conflicts').showModal();
async function resolveConflict(useLocal){
  if(running||!conflict)return;
  running=true;
  try{
    const rows=useLocal?read():conflict.rows;
    if(useLocal)await api('PUT',{rows,revision:conflict.revision});
    else setLocal(rows);
    localStorage.setItem(checkpoint,JSON.stringify(rows));
    conflict=null;$('resolve').hidden=true;$('conflicts').close();
  }catch{conflict=null;$('conflicts').close();$('resolve').hidden=true}
  finally{running=false;sync()}
}
$('useLocal').onclick=()=>resolveConflict(true);
$('useRemote').onclick=()=>resolveConflict(false);
window.addEventListener('online',sync);
window.addEventListener('focus',sync);
setInterval(sync,60000);
sync();

