import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseHomeSpend} from '../src/qianchuan-collector.mjs';

test('homepage spend cards retain cents and distinguish zero from unread values',()=>{
  assert.deepEqual(parseHomeSpend(`账户整体消耗(元)
1,234
.56
乘方计划消耗（元）
1,200.12
标准投放消耗(元)
0
.00
全域投放消耗(元)
34.44
品牌投放消耗(元)
--`),{
    total_spend:1234.56,overall_spend:1200.12,standard_spend:0,universal_spend:34.44,brand_spend:null
  });
});
