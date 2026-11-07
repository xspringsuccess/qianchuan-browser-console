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
const dateTime=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'--':date.toLocaleString('zh-CN',{hour12:false});};
const boardNames={overall:'乘方',universal:'全域',standard:'标准',brand:'品牌'};
const homeSpendFields={overall:'overall_spend',universal:'universal_spend',standard:'standard_spend',brand:'brand_spend'};
let planAccount='',planBoard='',planPage=1,activeTab='accounts';
const planPageSize=20;
const planSort=(left,right)=>{
  if(left.spend==null&&right.spend==null)return left.name.localeCompare(right.name,'zh-CN');
  if(left.spend==null)return 1;
  if(right.spend==null)return -1;
  return Number(right.spend)-Number(left.spend)||left.name.localeCompare(right.name,'zh-CN');
};
function showActiveTab(){
  document.querySelectorAll('[data-tab-panel]').forEach(panel=>{panel.hidden=panel.dataset.tabPanel!==activeTab;});
  document.querySelectorAll('[data-tab][role="tab"]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.tab===activeTab));});
  document.querySelectorAll('aside [data-tab]').forEach(link=>{link.setAttribute('aria-current',String(link.dataset.tab===activeTab));});
}
function render(){
  const rules=state.rules||[],accounts=state.accounts||[],plans=state.plans||[],evaluations=state.evaluations||[];
  const targetName=(scope,id)=>scope==='account'?(accounts.find(item=>item.account_id===id)?.label||`账户 ···${String(id).slice(-4)}`):(plans.find(item=>item.plan_id===id)?.name||`计划 ···${String(id).slice(-4)}`);
  const sortedAccounts=[...accounts].sort((left,right)=>{
    const leftSpend=left.home_spend?.total_spend??left.spend;
    const rightSpend=right.home_spend?.total_spend??right.spend;
    if(leftSpend==null&&rightSpend==null)return left.label.localeCompare(right.label,'zh-CN');
    if(leftSpend==null)return 1;
    if(rightSpend==null)return -1;
    return Number(rightSpend)-Number(leftSpend)||left.label.localeCompare(right.label,'zh-CN');
  });
  const accountCards=sortedAccounts.length?sortedAccounts.map(item=>{
    const verified=item.metrics_scope==='whole_account';
    const home=item.home_spend;
    const boardRows=Object.entries(boardNames).map(([key,label])=>{
      const count=item.boards?.find(board=>board.board===key)?.plan_count;
      const coverage=home?.total_spend===0?'账户今日零消耗，已跳过计划采集':key==='standard'||key==='brand'?'计划入口待验证':count==null?'计划未读到':`本次读取 ${count} 条`;
      return `<small>${label} · 首页消耗 ${money(home?.[homeSpendFields[key]])} · ${coverage}</small>`;
    }).join('');
    return `<div class="device account-card"><div class="device-head"><b>${esc(item.label)}</b><span class="badge ${verified?'green':'gray'}">${verified?'整账户口径':'整账户 ROI 待核实'}</span></div><div class="metric-grid"><div class="metric-item primary"><span>今日消耗</span><strong>${money(home?.total_spend??item.spend)}</strong></div><div class="metric-item"><span>日预算</span><strong>${money(item.budget)}</strong></div><div class="metric-item"><span>净 ROI</span><strong>${metric(item.net_roi)}</strong></div></div>${home?`<small class="secondary-line">统计日 ${esc(home.report_date)} · 采集于 ${esc(new Date(home.captured_at).toLocaleTimeString('zh-CN'))}</small>`:''}<div class="account-breakdown">${boardRows}</div></div>`;
  }).join(''):'<div class="empty">尚未同步账户数据。</div>';
  const filteredPlans=plans.filter(item=>(!planAccount||item.account_id===planAccount)&&(!planBoard||item.board===planBoard)).sort(planSort);
  const planPages=Math.max(1,Math.ceil(filteredPlans.length/planPageSize));
  planPage=Math.min(planPage,planPages);
  const visiblePlans=filteredPlans.slice((planPage-1)*planPageSize,planPage*planPageSize);
  const planFilters=`<div class="form-row"><label>账户<select id="plan-account"><option value="">全部账户</option>${accounts.map(item=>`<option value="${esc(item.account_id)}" ${item.account_id===planAccount?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label><label>投放板块<select id="plan-board"><option value="">全部板块</option>${Object.entries(boardNames).map(([key,label])=>`<option value="${key}" ${key===planBoard?'selected':''}>${label}</option>`).join('')}</select></label></div>`;
  const planCards=planFilters+(visiblePlans.length?visiblePlans.map(item=>`<div class="device plan-card"><div class="device-head"><b>${esc(item.name)}</b><span class="badge gray">${item.latest===0?'历史快照':esc(boardNames[item.board]||'板块待核实')}</span></div><small class="secondary-line">${esc(accounts.find(account=>account.account_id===item.account_id)?.label||'千川账户')}${item.product_mode?` · ${esc(item.product_mode)}`:''}</small><div class="metric-grid"><div class="metric-item primary"><span>今日消耗</span><strong>${money(item.spend)}</strong></div><div class="metric-item"><span>日预算</span><strong>${money(item.budget)}</strong></div><div class="metric-item"><span>净 ROI</span><strong>${metric(item.net_roi)}</strong></div></div><small class="secondary-line">采集时间：${esc(dateTime(item.captured_at))}</small></div>`).join(''):'<div class="empty">此范围没有已读取的计划。</div>')+`<div class="pagination"><span>共 ${filteredPlans.length} 条 · 第 ${planPage}/${planPages} 页，按消耗降序</span><div class="actions"><button data-action="plan-prev" ${planPage<=1?'disabled':''}>上一页</button><button data-action="plan-next" ${planPage>=planPages?'disabled':''}>下一页</button></div></div>`;
  const ruleCards=rules.length?rules.map(rule=>{
    const evaluation=evaluations.find(item=>item.rule_id===rule.id);
    const scopeUnverified=rule.action!=='set_budget_daily'&&rule.target_scope==='account'&&accounts.find(item=>item.account_id===rule.target_id)?.metrics_scope!=='whole_account';
    const matched=!scopeUnverified&&evaluation?.matched;
    const reason=scopeUnverified?'待核实整账户今日消耗与净 ROI':evaluation?.reason;
    const description=rule.action==='set_budget_daily'?`每天 ${esc(rule.config.schedule_time||'00:00')} 设为 ${money(rule.config.target_budget)}`:`进度 ≥ ${esc(rule.config.progress)}% ${rule.config.condition_logic==='any'?'或':'且'} 净 ROI &gt; ${esc(rule.config.roi)} · 建议追加 ${money(rule.config.increment)}`;
    return `<div class="device"><div class="device-head"><b>${esc(rule.name)}</b><span class="badge ${matched?'green':'gray'}">${scopeUnverified?'统计口径待核实':matched?'预演命中':'未命中/未预演'}</span></div><small>${rule.target_scope==='account'?'账户':'计划'}：${esc(targetName(rule.target_scope,rule.target_id))}</small><small>${description}</small>${reason?`<small>${esc(reason)}</small>`:''}</div>`;
  }).join(''):'<div class="empty">尚无规则。当前只能保存未启用草稿，不会操作千川。</div>';
  $('#content').innerHTML=`<div class="grid"><section class="panel"><h2>本机执行器</h2><p>看板已通过一次性会话连接到本机；账户数据只写入本机 SQLite。</p><div class="status-row"><span>执行器连接</span><span class="badge green">在线</span></div><div class="status-row"><span>千川页面</span><span class="badge ${state.browser_state==='qianchuan_open'?'green':'gray'}">${esc(labels[state.browser_state]||state.browser_state)}</span></div><div class="status-row"><span>已同步账户 / 计划</span><span>${accounts.length} / ${plans.length}</span></div><div class="status-row"><span>真实网页写入</span><span class="badge gray">关闭</span></div><div class="actions"><button data-action="refresh">刷新界面</button><button class="primary" data-action="sync">同步只读数据</button><button data-action="new-rule" ${accounts.length||plans.length?'':'disabled'}>新增规则草稿</button></div></section><section class="panel"><h2>版本隔离</h2><p>本版本不使用 Cloudflare，不连接开放平台 API 版，也不读取 MCP Key、APP ID 或 OAuth Token。</p><div class="status-row"><span>网页托管</span><span>GitHub Pages</span></div><div class="status-row"><span>执行位置</span><span>你的电脑</span></div><div class="status-row"><span>规则模式</span><span>只读预演</span></div></section></div><nav class="content-tabs" role="tablist"><button data-tab="accounts" role="tab">账户</button><button data-tab="plans" role="tab">计划</button><button data-tab="rules" role="tab">规则</button></nav><section class="panel tab-panel" data-tab-panel="accounts"><h2>账户快照</h2>${accountCards}</section><section class="panel tab-panel" data-tab-panel="plans"><h2>计划快照（${filteredPlans.length} 条）</h2>${planCards}</section><section class="panel tab-panel" data-tab-panel="rules"><h2>规则草稿与预演</h2><div class="rule-cards">${ruleCards}</div></section>`;
  showActiveTab();
  $('#plan-account').onchange=event=>{planAccount=event.target.value;planPage=1;render();renderPreviews();};
  $('#plan-board').onchange=event=>{planBoard=event.target.value;planPage=1;render();renderPreviews();};
}
function renderPreviews(){
  if(state.browser_state==='login_required')$('#content').insertAdjacentHTML('afterbegin','<section class="panel spaced"><h2>请先登录千川</h2><p>请在本机执行器打开的千川标签页完成登录，再点击“同步只读数据”。下方账户及计划为此前保存的快照。</p></section>');
  const previews=(state.previews||[]).map(item=>{
    if(item.effective_state==='pending_review'&&item.payload.action!=='set_budget_daily'&&item.payload.target_scope==='account'&&state.accounts?.find(account=>account.account_id===item.payload.account_id)?.metrics_scope!=='whole_account')return {...item,effective_state:'scope_unverified'};
    return item;
  });
  const statusLabels={pending_review:'待核对 · 尚未执行',cancelled:'已取消',expired:'已过期',superseded:'数据或规则已更新',scope_unverified:'统计口径待核实'};
  const cards=previews.map(item=>{const p=item.payload,daily=p.action==='set_budget_daily';return `<div class="device"><div class="device-head"><b>${esc(p.target_name)}</b><span class="badge ${item.effective_state==='pending_review'?'green':'gray'}">${esc(statusLabels[item.effective_state]||item.effective_state)}</span></div><small>${esc(p.rule_name)} · ${daily?'每日固定预算':'账户日预算'}</small><p>${money(p.current_budget)} → <strong>${money(p.new_budget)}</strong>${daily?'':`（增加 ${money(p.increment)}）`}</p><small>${esc(p.reason)}</small><small>数据时间：${esc(new Date(p.captured_at).toLocaleString('zh-CN'))}</small><div class="actions"><button data-preview-open="${esc(item.id)}">查看完整预览</button>${item.effective_state==='pending_review'?`<button data-preview-cancel="${esc(item.id)}">取消预览</button>`:''}</div></div>`}).join('');
  const ruleSection=$('#content [data-tab-panel="rules"]');
  ruleSection.insertAdjacentHTML('beforeend',`<div class="spaced" id="activity"><h2>待执行操作预览</h2><p>生成预览会重新读取千川数据。预览有效期 5 分钟；更新数据或规则后，需要重新生成。当前仅供核对，尚未提交到千川。</p>${cards||'<div class="empty">尚无操作预览。可在下方规则中点击“生成操作预览”。</div>'}</div>`);
  const cardsInRules=ruleSection?.querySelectorAll('.rule-cards > .device')||[];
  for(const [index,rule] of(state.rules||[]).entries()){
    const unverified=rule.action!=='set_budget_daily'&&rule.target_scope==='account'&&state.accounts?.find(item=>item.account_id===rule.target_id)?.metrics_scope!=='whole_account';
    if(!unverified)cardsInRules[index]?.insertAdjacentHTML('beforeend',`<div class="actions"><button data-preview-rule="${esc(rule.id)}">重新同步并生成操作预览</button></div>`);
  }
}
async function connect(){try{state=await api('state');render();renderPreviews();}catch(error){disconnected(error.message);}}
function previewDialog(id){
  const item=state.previews.find(item=>item.id===id);if(!item)return;const p=item.payload;
  const daily=p.action==='set_budget_daily';
  $('#dialog').innerHTML=`<h2>原生日预算调整预览</h2><p>以下为本次拟执行的具体操作，尚未修改千川。</p><div class="status-row"><span>目标层级</span><b>${esc(p.target_scope==='account'?'账户':'单条计划')}</b></div><p>${esc(p.target_name)}</p><small>账户 ID</small><code>${esc(p.account_id)}</code>${p.target_scope==='plan'?`<small>计划 ID</small><code>${esc(p.target_id)}</code>`:''}<div class="status-row"><span>当前日预算</span><b>${money(p.current_budget)}</b></div>${daily?`<div class="status-row"><span>计划生效时间</span><b>每天 ${esc(p.schedule_time||'00:00')}</b></div>`:`<div class="status-row"><span>追加金额</span><b>${money(p.increment)}</b></div>`}<div class="status-row"><span>${daily?'设定日预算':'调整后日预算'}</span><b>${money(p.new_budget)}</b></div><p>${esc(p.reason)}</p><p>${esc(p.impact)}</p><small>有效期至：${esc(new Date(item.expires_at).toLocaleString('zh-CN'))}</small><p>真实网页提交功能尚未开放，本预览不能执行。</p><div class="actions"><button data-action="close">关闭</button></div>`;
  $('#dialog').showModal();
}
document.addEventListener('click',async event=>{
  const tab=event.target.closest('[data-tab]');
  if(tab){event.preventDefault();activeTab=tab.dataset.tab;showActiveTab();return;}
  const button=event.target.closest('[data-preview-rule],[data-preview-open],[data-preview-cancel]');if(!button)return;
  if(button.dataset.previewOpen){previewDialog(button.dataset.previewOpen);return;}
  button.disabled=true;const label=button.textContent;button.textContent='处理中…';
  try{if(button.dataset.previewCancel){await api('previews/cancel',{id:button.dataset.previewCancel});await connect();toast('预览已取消');}else{const result=await api('previews',{rule_id:button.dataset.previewRule});await connect();previewDialog(result.id);}}
  catch(error){toast(error.message);await connect();}
  finally{button.disabled=false;button.textContent=label;}
});
function ruleDialog(){
  const accounts=state.accounts||[],plans=state.plans||[];
  const accountOptions=accounts.map(item=>`<option value="${esc(item.account_id)}">${esc(item.label)}</option>`).join('');
  const plansFor=accountId=>plans.filter(item=>item.account_id===accountId);
  const planOptions=accountId=>{
    const matches=plansFor(accountId);
    return matches.length?matches.map(item=>`<option value="${esc(item.plan_id)}">${esc(item.name)} · ${esc(item.plan_id.slice(-4))}</option>`).join(''):'<option value="" disabled>此账户还没有已同步的计划</option>';
  };
  const firstAccount=accounts[0]?.account_id||'';
  $('#dialog').innerHTML=`<h2>新增规则草稿</h2><p>规则只保存在本机，并强制保持未启用。</p><form id="rule-form"><label>规则名称<input name="name" value="账户预算自动追加" maxlength="100" required></label><label>规则类型<select name="action" id="rule-action"><option value="increase_budget">消耗达标后追加预算</option><option value="set_budget_daily">每天 00:00 设置固定账户预算</option></select></label><label>层级<select name="target_scope"><option value="account">账户</option><option value="plan">计划</option></select></label><div class="form-row" id="account-target-row"><label>账户<select name="target_id" id="account-target" required>${accountOptions}</select></label></div><div class="form-row" id="plan-target-row" hidden><label>账户<select name="plan_account_id" id="plan-account-target">${accountOptions}</select></label><label>计划<select name="target_id" id="plan-target" required>${planOptions(firstAccount)}</select></label></div><div id="threshold-fields"><div class="form-row"><label>预算使用率（%）<input name="progress" type="number" value="95" min="0.01" max="100" step="0.01"></label><label>净 ROI 严格大于<input name="roi" type="number" value="2.5" min="0" step="0.01"></label></div><div class="form-row"><label>条件关系<select name="condition_logic"><option value="all">且（全部满足）</option><option value="any">或（满足任一项）</option></select></label></div><div class="form-row"><label>追加预算（元）<input name="increment" type="number" value="1000" min="0.01" step="0.01"></label><label>冷却时间（分钟）<input name="cooldown_minutes" type="number" value="5" min="1"></label></div></div><div class="form-row" id="fixed-budget-field" hidden><label>目标账户日预算（元）<input name="target_budget" type="number" min="0.01" step="0.01" required disabled></label><label>计划时间<input value="00:00" disabled></label></div><div class="actions"><button type="button" data-action="close">取消</button><button class="primary" type="submit">保存未启用草稿</button></div></form>`;
  $('#dialog').showModal();
  const form=$('#rule-form'),scope=form.elements.target_scope,action=form.elements.action,accountRow=$('#account-target-row'),planRow=$('#plan-target-row'),accountTarget=$('#account-target'),planAccount=$('#plan-account-target'),planTarget=$('#plan-target'),thresholdFields=$('#threshold-fields'),fixedBudgetField=$('#fixed-budget-field'),fixedBudget=form.elements.target_budget;
  const updateScope=()=>{
    const scheduled=action.value==='set_budget_daily';
    if(scheduled)scope.value='account';
    scope.disabled=scheduled;
    const isPlan=scope.value==='plan';
    accountRow.hidden=isPlan;
    planRow.hidden=!isPlan;
    accountTarget.disabled=isPlan;
    planAccount.disabled=!isPlan;
    planTarget.disabled=!isPlan;
    thresholdFields.hidden=scheduled;
    fixedBudgetField.hidden=!scheduled;
    fixedBudget.disabled=!scheduled;
  };
  scope.addEventListener('change',updateScope);
  action.addEventListener('change',()=>{if(action.value==='set_budget_daily'&&form.elements.name.value==='账户预算自动追加')form.elements.name.value='凌晨账户固定预算';updateScope();});
  planAccount.addEventListener('change',()=>{planTarget.innerHTML=planOptions(planAccount.value);});
  updateScope();
  form.addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));delete data.plan_account_id;data.target_scope=scope.value;data.enabled=false;try{await api('rules',data);$('#dialog').close();await connect();toast('规则草稿已保存到本机');}catch(error){toast(error.message);}});
}
document.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;if(button.dataset.action==='connect'||button.dataset.action==='refresh')await connect();if(button.dataset.action==='plan-prev'){planPage=Math.max(1,planPage-1);render();renderPreviews();}if(button.dataset.action==='plan-next'){planPage+=1;render();renderPreviews();}if(button.dataset.action==='sync'){button.disabled=true;button.textContent='同步中…';try{const result=await api('sync',{});await connect();toast(`已同步 ${result.accounts} 个账户、${result.plans} 条计划`);}catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='同步只读数据';}}if(button.dataset.action==='new-rule')ruleDialog();if(button.dataset.action==='close')$('#dialog').close();});
if(token){connect();setInterval(()=>connect(),15000);}else disconnected();

