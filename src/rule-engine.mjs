export const SNAPSHOT_MAX_AGE_MS=5*60*1000;
export const ACCOUNT_SCOPE_UNVERIFIED='整账户统计口径待核实，暂不能触发账户预算规则';
const finite=value=>typeof value==='number'&&Number.isFinite(value);

export function evaluateRule(rule,target,now=Date.now()){
  const config=rule.config||JSON.parse(rule.config_json);
  const fail=reason=>({matched:false,reason,proposed_action:null});
  if(!target)return fail('未找到目标，请在专用浏览器中打开对应账户后同步');
  if(rule.target_scope==='account'&&target.metrics_scope!=='whole_account')return fail(ACCOUNT_SCOPE_UNVERIFIED);
  const captured=Date.parse(target.captured_at);
  if(!Number.isFinite(captured)||now-captured>SNAPSHOT_MAX_AGE_MS||captured>now+1000)return fail('数据已过期，请重新同步');
  if(!finite(target.budget)||target.budget<=0)return fail('目标日预算缺失或不限预算，不能计算追加金额');
  if(!finite(target.spend)||target.spend<0||!finite(target.net_roi))return fail('目标消耗或净 ROI 不完整');
  if(rule.target_scope==='plan'&&!target.budget_editable)return fail('千川页面未允许编辑该计划预算');
  if(rule.action!=='increase_budget')return fail('该操作尚未完成网页执行适配');
  if(!finite(config.progress)||config.progress<=0||config.progress>100||!finite(config.roi)||config.roi<0||!finite(config.increment)||config.increment<=0)return fail('规则参数无效');
  const progress=target.spend/target.budget*100;
  const reason=`预算进度 ${progress.toFixed(2)}%，净 ROI ${target.net_roi.toFixed(2)}`;
  if(progress<config.progress||target.net_roi<=config.roi)return fail(`${reason}，未命中规则`);
  const newBudget=Math.round((target.budget+config.increment)*100)/100;
  if(!Number.isFinite(newBudget)||newBudget<=target.budget||newBudget>Number.MAX_SAFE_INTEGER/100)return fail('追加后的预算金额无效');
  return {matched:true,reason:`${reason}，命中规则`,proposed_action:{action:'increase_budget',increment:config.increment,current_budget:target.budget,new_budget:newBudget}};
}

export function findRuleTarget(db,rule){
  return rule.target_scope==='account'?db.raw.prepare('SELECT * FROM browser_accounts_with_scope WHERE account_id=?').get(rule.target_id):db.raw.prepare('SELECT * FROM browser_plans WHERE plan_id=?').get(rule.target_id);
}
