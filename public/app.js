const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels={browser_open:'浏览器已打开',qianchuan_open:'已检测到千川页面',login_required:'千川需要登录',outside_qianchuan:'未停留在千川页面',browser_closed:'浏览器已关闭'};
const apiBase='http://127.0.0.1:8798';
let token=sessionStorage.getItem('executor_token')||'',state=null,timer;
if(location.hash.startsWith('#token=')){token=location.hash.slice(7);sessionStorage.setItem('executor_token',token);history.replaceState(null,'',location.pathname+location.search);}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,5000);}
async function api(path,data){
  if(!token)throw new Error('请从“启动千川网页执行器”打开本页面');
  const options={method:data?'POST':'GET',headers:{Authorization:`Bearer ${token}`},mode:'cors',targetAddressSpace:'loopback'};
  if(data){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data);}
  const response=await fetch(`${apiBase}/api/${path}`,options),result=await response.json();if(!response.ok)throw new Error(result.error||'本机执行器连接失败');return result;
}
function disconnected(message='执行器尚未连接'){const action=token?'<button class="primary" data-action="connect">重新连接本机执行器</button>':'<button class="primary" disabled>请先启动本机执行器</button>';$('#content').innerHTML=`<div class="grid"><section class="panel"><h2>${esc(message)}</h2><p>请双击本机项目中的“启动千川网页执行器”，并使用它自动打开的新页面。直接打开本网址不会携带本机会话令牌。</p><div class="actions">${action}</div></section><section class="panel"><h2>隐私边界</h2><p>GitHub Pages 只提供静态界面。账户、规则、Cookie、验证码和执行记录全部保存在你的电脑。</p></section></div>`;}
const money=value=>value==null?'--':`¥${Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2})}`;
const metric=value=>value==null?'--':Number(value).toFixed(2);
function render(){
  const rules=state.rules||[],accounts=state.accounts||[],plans=state.plans||[],evaluations=state.evaluations||[];
  const targetName=(scope,id)=>scope==='account'?(accounts.find(item=>item.account_id===id)?.label||`账户 ···${String(id).slice(-4)}`):(plans.find(item=>item.plan_id===id)?.name||`计划 ···${String(id).slice(-4)}`);
  const accountCards=accounts.length?accounts.map(item=>{
    const verified=item.metrics_scope==='whole_account';
    const summary=verified?`今日消耗 ${money(item.spend)} · 预算使用率 ${metric(item.progress)}% · 净 ROI ${metric(item.net_roi)}`:`页面消耗 ${money(item.spend)} · 页面净 ROI ${metric(item.net_roi)}`;
    return `<div class="device"><div class="device-head"><b>${esc(item.label)}</b><span class="badge ${verified?'green':'gray'}">${verified?'整账户口径':'统计口径待核实'}</span></div><small>日预算 ${money(item.budget)} · ${summary}</small></div>`;
  }).join(''):'<div class="empty">尚未同步账户数据。</div>';
  const planCards=plans.length?plans.slice(0,100).map(item=>`<div class="device"><div class="device-head"><b>${esc(item.name)}</b><span class="badge ${item.budget_editable?'green':'gray'}">${item.budget_editable?'预算可编辑':'只读'}</span></div><small>${esc(accounts.find(account=>account.account_id===item.account_id)?.label||'千川账户')} · 预算 ${money(item.budget)} · 消耗 ${money(item.spend)} · 进度 ${metric(item.progress)}% · 净 ROI ${metric(item.net_roi)}</small></div>`).join(''):'<div class="empty">尚未同步计划数据。</div>';
  const ruleCards=rules.length?rules.map(rule=>{
    const evaluation=evaluations.find(item=>item.rule_id===rule.id);
    const scopeUnverified=rule.target_scope==='account'&&accounts.find(item=>item.account_id===rule.target_id)?.metrics_scope!=='whole_account';
    const matched=!scopeUnverified&&evaluation?.matched;
    const reason=scopeUnverified?'待核实整账户今日消耗与净 ROI':evaluation?.reason;
    return `<div class="device"><div class="device-head"><b>${esc(rule.name)}</b><span class="badge ${matched?'green':'gray'}">${scopeUnverified?'统计口径待核实':matched?'预演命中':'未命中/未预演'}</span></div><small>${rule.target_scope==='account'?'账户':'计划'}：${esc(targetName(rule.target_scope,rule.target_id))}</small><small>进度 ≥ ${esc(rule.config.progress)}% · 净 ROI &gt; ${esc(rule.config.roi)} · 建议追加 ${money(rule.config.increment)}</small>${reason?`<small>${esc(reason)}</small>`:''}</div>`;
  }).join(''):'<div class="empty">尚无规则。当前只能保存未启用草稿，不会操作千川。</div>';
  $('#content').innerHTML=`<div class="grid"><section class="panel"><h2>本机执行器</h2><p>看板已通过一次性会话连接到本机；账户数据只写入本机 SQLite。</p><div class="status-row"><span>执行器连接</span><span class="badge green">在线</span></div><div class="status-row"><span>千川页面</span><span class="badge ${state.browser_state==='qianchuan_open'?'green':'gray'}">${esc(labels[state.browser_state]||state.browser_state)}</span></div><div class="status-row"><span>已同步账户 / 计划</span><span>${accounts.length} / ${plans.length}</span></div><div class="status-row"><span>真实网页写入</span><span class="badge gray">关闭</span></div><div class="actions"><button data-action="refresh">刷新界面</button><button class="primary" data-action="sync">同步只读数据</button><button data-action="new-rule" ${accounts.length||plans.length?'':'disabled'}>新增规则草稿</button></div></section><section class="panel"><h2>版本隔离</h2><p>本版本不使用 Cloudflare，不连接开放平台 API 版，也不读取 MCP Key、APP ID 或 OAuth Token。</p><div class="status-row"><span>网页托管</span><span>GitHub Pages</span></div><div class="status-row"><span>执行位置</span><span>你的电脑</span></div><div class="status-row"><span>规则模式</span><span>只读预演</span></div></section></div><section class="panel" style="margin-top:18px"><h2>账户快照</h2>${accountCards}</section><section class="panel" style="margin-top:18px"><h2>计划快照（最多显示 100 条）</h2>${planCards}</section><section class="panel" style="margin-top:18px"><h2>规则草稿与预演</h2>${ruleCards}</section>`;
}
function renderPreviews(){
  if(state.browser_state==='login_required')$('#content').insertAdjacentHTML('afterbegin','<section class="panel spaced"><h2>请先登录千川</h2><p>请在本机执行器打开的千川标签页完成登录，再点击“同步只读数据”。下方账户及计划为此前保存的快照。</p></section>');
  const previews=(state.previews||[]).map(item=>{
    if(item.effective_state==='pending_review'&&item.payload.target_scope==='account'&&state.accounts?.find(account=>account.account_id===item.payload.account_id)?.metrics_scope!=='whole_account')return {...item,effective_state:'scope_unverified'};
    return item;
  });
  const statusLabels={pending_review:'待核对 · 尚未执行',cancelled:'已取消',expired:'已过期',superseded:'数据或规则已更新',scope_unverified:'统计口径待核实'};
  const cards=previews.map(item=>{const p=item.payload;return `<div class="device"><div class="device-head"><b>${esc(p.target_name)}</b><span class="badge ${item.effective_state==='pending_review'?'green':'gray'}">${esc(statusLabels[item.effective_state]||item.effective_state)}</span></div><small>${esc(p.rule_name)} · ${esc(p.target_scope==='account'?'账户日预算':'计划日预算')}</small><p>${money(p.current_budget)} → <strong>${money(p.new_budget)}</strong>（增加 ${money(p.increment)}）</p><small>${esc(p.reason)}</small><small>数据时间：${esc(new Date(p.captured_at).toLocaleString('zh-CN'))}</small><div class="actions"><button data-preview-open="${esc(item.id)}">查看完整预览</button>${item.effective_state==='pending_review'?`<button data-preview-cancel="${esc(item.id)}">取消预览</button>`:''}</div></div>`}).join('');
  const statusGrid=$('#content .grid');
  statusGrid.insertAdjacentHTML('afterend',`<section class="panel spaced" id="activity"><h2>待执行操作预览</h2><p>生成预览会重新读取千川数据。预览有效期 5 分钟；更新数据或规则后，需要重新生成。当前仅供核对，尚未提交到千川。</p>${cards||'<div class="empty">尚无操作预览。可在下方规则中点击“生成操作预览”。</div>'}</section>`);
  statusGrid.id='status';
  const ruleSection=[...document.querySelectorAll('#content section')].find(node=>node.querySelector('h2')?.textContent==='规则草稿与预演');if(ruleSection)ruleSection.id='rules';
  const cardsInRules=ruleSection?.querySelectorAll('.device')||[];
  for(const [index,rule] of(state.rules||[]).entries()){
    const unverified=rule.target_scope==='account'&&state.accounts?.find(item=>item.account_id===rule.target_id)?.metrics_scope!=='whole_account';
    if(!unverified)cardsInRules[index]?.insertAdjacentHTML('beforeend',`<div class="actions"><button data-preview-rule="${esc(rule.id)}">重新同步并生成操作预览</button></div>`);
  }
}
async function connect(){try{state=await api('state');render();renderPreviews();}catch(error){disconnected(error.message);}}
function previewDialog(id){
  const item=state.previews.find(item=>item.id===id);if(!item)return;const p=item.payload;
  $('#dialog').innerHTML=`<h2>原生日预算调整预览</h2><p>以下为本次拟执行的具体操作，尚未修改千川。</p><div class="status-row"><span>目标层级</span><b>${esc(p.target_scope==='account'?'账户':'单条计划')}</b></div><p>${esc(p.target_name)}</p><small>账户 ID</small><code>${esc(p.account_id)}</code>${p.target_scope==='plan'?`<small>计划 ID</small><code>${esc(p.target_id)}</code>`:''}<div class="status-row"><span>当前日预算</span><b>${money(p.current_budget)}</b></div><div class="status-row"><span>追加金额</span><b>${money(p.increment)}</b></div><div class="status-row"><span>调整后日预算</span><b>${money(p.new_budget)}</b></div><p>${esc(p.reason)}</p><p>${esc(p.impact)}</p><small>有效期至：${esc(new Date(item.expires_at).toLocaleString('zh-CN'))}</small><p>真实网页提交功能尚未开放，本预览不能执行。</p><div class="actions"><button data-action="close">关闭</button></div>`;
  $('#dialog').showModal();
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-preview-rule],[data-preview-open],[data-preview-cancel]');if(!button)return;
  if(button.dataset.previewOpen){previewDialog(button.dataset.previewOpen);return;}
  button.disabled=true;const label=button.textContent;button.textContent='处理中…';
  try{if(button.dataset.previewCancel){await api('previews/cancel',{id:button.dataset.previewCancel});await connect();toast('预览已取消');}else{const result=await api('previews',{rule_id:button.dataset.previewRule});await connect();previewDialog(result.id);}}
  catch(error){toast(error.message);await connect();}
  finally{button.disabled=false;button.textContent=label;}
});
function ruleDialog(){const options=(scope)=>scope==='account'?(state.accounts||[]).map(item=>`<option value="${esc(item.account_id)}">${esc(item.label)}</option>`).join(''):(state.plans||[]).map(item=>`<option value="${esc(item.plan_id)}">${esc(item.name)} · ${esc(item.plan_id.slice(-4))}</option>`).join('');$('#dialog').innerHTML=`<h2>新增规则草稿</h2><p>草稿只保存在本机，并强制保持未启用。</p><form id="rule-form"><label>规则名称<input name="name" value="账户预算自动追加" maxlength="100" required></label><div class="form-row"><label>层级<select name="target_scope"><option value="account">账户</option><option value="plan">计划</option></select></label><label>目标<select name="target_id" required>${options('account')}</select></label></div><div class="form-row"><label>预算使用率（%）<input name="progress" type="number" value="95" min="0.01" max="100" step="0.01"></label><label>净 ROI 严格大于<input name="roi" type="number" value="2.5" min="0" step="0.01"></label></div><div class="form-row"><label>追加预算（元）<input name="increment" type="number" value="1000" min="0.01" step="0.01"></label><label>冷却时间（分钟）<input name="cooldown_minutes" type="number" value="5" min="1"></label></div><div class="actions"><button type="button" data-action="close">取消</button><button class="primary" type="submit">保存未启用草稿</button></div></form>`;$('#dialog').showModal();const form=$('#rule-form');form.target_scope.addEventListener('change',()=>form.target_id.innerHTML=options(form.target_scope.value));form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.action='increase_budget';data.enabled=false;try{await api('rules',data);$('#dialog').close();await connect();toast('规则草稿已保存到本机');}catch(error){toast(error.message);}});}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;if(button.dataset.action==='connect'||button.dataset.action==='refresh')await connect();if(button.dataset.action==='sync'){button.disabled=true;button.textContent='同步中…';try{const result=await api('sync',{});await connect();toast(`已同步 ${result.accounts} 个账户、${result.plans} 条计划`);}catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='同步只读数据';}}if(button.dataset.action==='new-rule')ruleDialog();if(button.dataset.action==='close')$('#dialog').close();});
if(token){connect();setInterval(()=>connect(),15000);}else disconnected();
