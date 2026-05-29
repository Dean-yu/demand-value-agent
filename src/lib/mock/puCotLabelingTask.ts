// =============================================================================
// Mock 示例 3：PU 生产 CoT 标注（思维链评测）
// 业务背景：PU（Product Understanding，商品理解结构化）生产任务中，模型按 4 步 CoT 生成结果
//   需要对前 3 个 step 的 CoT 做过程维度标注，分析模型在哪一步出错，给算法优化方向
// 任务包含 12 题（类目匹配 + 3 个 step 的多选错误 + 3 个 step 的填空备注 + PU 上线判定 + 评分聚合）
// 历史数据：150 条模拟样本（覆盖个护小家电/食品/母婴/美妆/数码/家居 6 类目）
// 来源：基于《PU生产COT标注-SOP_v1》《CoT标注与精标项》整理，并按真实 step 错误类型分布生成
// =============================================================================
/* eslint-disable */

import type {
  EvaluationTask,
  HistoricalLabelRecord,
  MachineAuditRecord,
  QualityResultRecord,
  SampleRecord,
  UploadedFile
} from "../agent/types";

// -----------------------------------------------------------------------------
// 上传材料（SOP 摘要 + 题目级 AI 适配清单 + 标注页面说明）
// -----------------------------------------------------------------------------

const ruleDoc: UploadedFile = {
  id: "f_rule_pucot",
  name: "PU生产COT标注_规则结构化摘要.md",
  type: "text/markdown",
  size: 1733,
  role: "rule_doc",
  contentText: "# PU 生产 CoT 标注 — 规则结构化摘要\n\n> 本文件依据《PU生产COT标注-SOP_v1》与《CoT 标注与精标项》两份原始材料整理。正式评估时仍以原始 SOP 为准。\n\n## 一、任务背景\n在 PU（Product Understanding，商品理解结构化）生产任务中，除对最终 PU 结果做评测外，还需要对**模型生产中的 CoT（思维链）**做过程维度标注，分析模型在哪一步出现错误，为算法优化提供方向。\n\n## 二、需要标注的 3 个 Step（Step4 不标注）\n- **Step1 信息提取**：从商品标题、参数详情、sku 图、item 图、sku 属性列表、锚定 sku 属性中提取关键属性。\n- **Step2 冲突消歧**：按照信息源优先级（锚定 sku 属性 > sku 选项列表 > sku 图 > 参数详情 > item 图 > 标题）解决冲突，保留 context / spec 层关键属性。\n- **Step3 结构编排**：依据参考规则把 Step2 留存的属性组织为 PU 层 + context 层 + spec 层结构。\n- **Step4 参考同款商品补全**：本任务暂不标注。\n\n## 三、错误类型枚举\n| Step | 可选错误类型（多选） | 典型场景 |\n|---|---|---|\n| Step1 | 有逻辑错误 / 有幻觉 / 有关键信息缺失 | 提取到错误属性 / 凭空生成属性 / 漏掉关键属性 |\n| Step2 | 推理有逻辑错误 / 有幻觉 / 有关键信息缺失 | 未按优先级取值 / 出现 Step1 未提取的属性 / 关键属性丢失 |\n| Step3 | 引用规则有误 / 推理有逻辑错误 / 有幻觉 / 有关键信息缺失 | 引用错误规则细则 / 编排归属错误 / 引用规则库不存在 / 关键属性未编排 |\n\n## 四、错误原因备注要求（必须人工填空）\n- 必填，必须明确包含：**位置 / 环节 / 关键属性 / V 值** 等信息；模型能据此找到错误点。\n- 资深作业员根据情况综合判断，凭经验判定备注是否四要素齐全。\n- 示例：「Step1 中提取了颜色：红色，信息源为 item 图，实际 item 图中颜色为绿色」。\n- 示例：「Step2 中保留了源自 item 图的颜色：红色，按优先级应保留 sku 属性中的颜色：紫色」。\n\n## 五、综合评分（0 / 1 / 2）\n| 评分 | 判定标准 |\n|---|---|\n| **2 分** | 全部满足：信息冲突场景 = 0、缺失率 < 5%、问题 Case < 5%、冗余率 ≤ 10% |\n| **1 分** | 除 0 分和 2 分之外的情况 |\n| **0 分** | 任一满足：缺失率 ≥ 10% / 信息冲突场景 ≥ 1 / 问题 Case ≥ 10% / 冗余率 ≥ 20% |\n\n## 六、过程指标（聚合产出）\n- **完整性**：缺失数量 / 缺失原因占比 / 信息总量 / 缺失率（按 整体 / Context / Spec / 图片 维度）\n- **准确性**：信息错误数量 / 信息幻觉数量 / 信息冲突场景数量 + 类型 / 问题 Case 占比\n- **冗余度**：冗余问题数量 / 冗余问题原因占比\n\n## 七、前置 & 跳过规则\n- **类目匹配检查**：基础商品与参考规则的类目不匹配 → 直接标注「不匹配」，本条数据跳过不处理。\n- **Step 解耦**：每个 Step 的评测**默认上个 Step 的结果是正确的**（上个 step 产生的错误不计入本 step）。\n- **同义词豁免**：各点位信息无差异、仅同义词差异 → 取任一即可。\n\n## 八、需要经验判断的边界 Case（必须人工拍板）\n- 同 P 值对应多 V 值场景（例：适用年龄 8 月 / 12 月 / 24 月），Step1 提取其中一个即算正确，老作业员需根据情况综合判断取舍。\n- 「同义词不区分中英文」与「严格按规则的属性命名」需作业员经验判定，视情况慎重取舍。\n- 缺少换算公式时（如通量），Step3 应标注「规则未覆盖」而非「推理错误」，需资深作业员综合判断后拍板。\n- 真实存在但商品信息无法确认时，按「正确」执行，需高级作业员经验把关，慎重核对边界。\n- 图片视觉模糊但人眼可识别的属性，需资深作业员根据情况综合判断是否计入幻觉。\n- 同款商品在不同 SKU 下属性表述差异较大时，需作业员凭经验视情况综合判断。\n"
};

const sopDoc: UploadedFile = {
  id: "f_sop_pucot",
  name: "PU生产COT标注_操作SOP摘要.md",
  type: "text/markdown",
  size: 1104,
  role: "sop_doc",
  contentText: "# PU 生产 CoT 标注操作 SOP（外包培训摘要）\n\n## 一、标注前准备\n1. 仔细阅读《PU 生产 CoT 标注-SOP_v1》全部规则细化部分与存疑 Case 表。\n2. 在标注台打开试标任务链接，完成至少 10 条试标 + 培训对答。\n\n## 二、单条标注流程\n1. **步骤一**：查看【基准商品】信息与【参考规则】类目 → 选「匹配」或「不匹配」。不匹配则任务结束。\n2. **步骤二**：查看【Step1】信息 → 判断 Step1 信息提取是否正确：\n   - 提取完整且正确 → 标【无问题】，继续步骤三；\n   - 提取不完整或错误 → 多选错误原因 + 备注具体错误情形，资深作业员需综合判断填写四要素，继续步骤三。\n3. **步骤三**：查看【Step2】信息 → 依据【Step1】判断 Step2 是否符合消歧规则。\n4. **步骤四**：查看【Step3】信息 → 依据【Step2】判断 Step3 是否符合结构编排规则（强参考【参考规则】）。\n5. **步骤五**：查看【pu_info】最终输出 → 判断 PU 是否可上线（spec 补充规则可不验证存在性，只验 PV 匹配）。\n6. 反向验证：若 PU 结果错误 → 倒推哪个步骤出现错误，需高级作业员综合判断。\n\n## 三、信息源优先级\n锚定 sku 属性 > sku 选项列表 > sku 图 > 参数详情 > item 图 > 标题（仅本任务参考）。\n\n## 四、关键易错点（均需经验判断）\n- **幻觉判定要慎重**：图片上没有文字、但从视觉可获取的信息（如 1 瓶包装）不属于幻觉，需作业员根据情况综合判断。\n- **同义词放过**：各点位无差异、仅同义词差异，模型推理出的同义词也算正确，建议视情况慎重核对。\n- **规则引用错也要标**：即使最终结果正确，但 Step3 引用错误规则推理，仍要标「引用规则有误」，资深作业员凭经验拍板。\n- **关键属性才计缺失**：Step1 中非关键属性的缺失不计入；但若 Step3 用到了，则计入 Step2 缺失，建议作业员综合判断。\n- **类目不匹配直接跳过**：基础商品与参考规则类目不一致 → 不再标注后续步骤。\n- **备注填空必须人工撰写**：备注是自然语言填空，AI 仅能给候选，必须人工根据经验视情况综合判断。\n- **多义场景拍板**：商品信息源之间表述差异较大时，应该由资深作业员根据情况慎重综合判断。\n\n## 五、单条耗时与人天估算\n- 单条目标耗时 **300 秒（5 分钟）**：需要看 6 个信息源 + 模型 3 步 CoT 输出 + 规则比对 + 备注填写。\n- 二标抽样比例 **30%**，终审抽样 **10%**。\n- 单人单日有效工时 6 小时 → 约 **72 条 / 人天**（远低于普通审核任务，因步骤多 + 自由填空 + 大量经验判断点）。\n\n## 六、质量验收\n- 一二标分歧率 ≤ 8%；终审通过率 ≥ 92%。\n- 备注必须包含位置、环节、关键属性、V 值四要素，缺一项判为不合格；建议资深作业员视情况复核。\n"
};

const trainingDoc: UploadedFile = {
  id: "f_train_pucot",
  name: "PU生产COT标注_12题AI适配清单.md",
  type: "text/markdown",
  size: 1105,
  role: "training_manual",
  contentText: "# PU 生产 CoT 标注 — 12 题判定题清单（题目级 AI 适配预判）\n\n| # | 题目 | 类型 | 规则清晰度 | 期望承接方式 |\n|---|---|---|---|---|\n| Q1 | 基础商品与参考规则类目是否匹配 | 单选（匹配/不匹配） | 高 | machine_auto |\n| Q2 | Step1 信息提取是否正确 | 多选（无 / 逻辑错误 / 幻觉 / 关键信息缺失） | 中 | ai_assist |\n| Q3 | Step1 错误原因备注 | 填空（自然语言） | 低 | human_only |\n| Q4 | Step2 冲突消歧是否正确 | 多选（无 / 推理逻辑错误 / 幻觉 / 关键信息缺失） | 中 | ai_assist |\n| Q5 | Step2 错误原因备注 | 填空（自然语言） | 低 | human_only |\n| Q6 | Step3 结构编排是否正确 | 多选（无 / 引用规则有误 / 推理逻辑错误 / 幻觉 / 关键信息缺失） | 中低 | ai_assist |\n| Q7 | Step3 错误原因备注 | 填空（自然语言） | 低 | human_only |\n| Q8 | 最终 PU 是否可上线 | 单选 | 中 | ai_assist |\n| Q9 | 综合表现评分（0 / 1 / 2） | 单选 | 高（按规则聚合） | ai_prefill |\n| Q10 | 完整性子指标聚合 | 计算项 | 高 | machine_auto |\n| Q11 | 准确性子指标聚合 | 计算项 | 高 | machine_auto |\n| Q12 | 冗余度子指标聚合 | 计算项 | 高 | machine_auto |\n\n## 题目级 AI 适配总览\n- **明确可机器化（machine_auto / ai_prefill）**：Q1、Q9、Q10、Q11、Q12 → 5 题；\n- **AI 预标 + 人工核对（ai_assist）**：Q2、Q4、Q6、Q8 → 4 题；\n- **必须人工（human_only）**：Q3、Q5、Q7 → 3 题（错误原因备注全是自然语言填空，AI 仅能给候选）。\n\n## 总体判断\n- 总题目 12 道，其中 7 道（Q2/Q4/Q6 + Q3/Q5/Q7 + Q8）是 CoT 评测的核心难点。\n- AI 可承接「是否正确」的多选判定 + 「评分汇总」+ 「类目匹配」，但「错误原因备注」必须人工。\n- 单条耗时高（300 秒），AI 预标可大幅压缩人工节奏，建议先做试点。\n"
};

const screenshotDoc: UploadedFile = {
  id: "f_screenshot_pucot",
  name: "PU生产COT标注_作业页面说明.md",
  type: "text/markdown",
  size: 593,
  role: "screenshot",
  contentText: "# PU 生产 CoT 标注作业页面（截图说明）\n\n## 页面整体结构\n四栏布局：\n1. **左栏 — 基础商品信息**：item_title / main_image / sku_image / item_kv_pairs / all_sku_pv / cur_sku_pv。\n2. **左中栏 — 参考规则**：当前 PU 类目规则文档（PU 层 / context / spec 属性细则）。\n3. **右中栏 — 模型 CoT 输出**：Step1 信息提取 / Step2 冲突消歧 / Step3 结构编排 / 最终 pu_info。\n4. **右栏 — 做题区**：自上而下 12 题（含 3 道填空），存在联动跳过（类目不匹配则后续全跳过）。\n\n## 对 Agent 的输入价值\n1. 单条作业需要同时浏览 6 个商品信息源 + 1 份规则文档 + 3 步 CoT 输出，单条耗时显著高于普通审核（300 秒）。\n2. Q2/Q4/Q6 的多选错误类型判定需结合规则细化，AI 可基于规则文档 + 商品信息 + CoT 输出做对比，预标价值高。\n3. Q3/Q5/Q7 的备注是自然语言填空，需要明确位置 + 环节 + 关键属性 + V 值四要素，AI 仅能给出候选，必须人工核对。\n4. Q9 综合评分可由 Q2/Q4/Q6 + 缺失率/冗余率聚合，规则机器可实现。\n"
};

// -----------------------------------------------------------------------------
// 150 条样本 + 150 条历史标注 + 38 条质检
// -----------------------------------------------------------------------------

const samplesData: SampleRecord[] = [
  {
    "id": "PUCOT-0001",
    "raw": {
      "sample_id": "PUCOT-0001",
      "item_id": "9000000000001",
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "main_image": "https://img.mock.taobao.com/main/9000000000001.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000001_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000001.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000001_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0002",
    "raw": {
      "sample_id": "PUCOT-0002",
      "item_id": "9000000000002",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000002.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000002_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000002.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000002_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0003",
    "raw": {
      "sample_id": "PUCOT-0003",
      "item_id": "9000000000003",
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "main_image": "https://img.mock.taobao.com/main/9000000000003.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000003_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000003.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000003_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0004",
    "raw": {
      "sample_id": "PUCOT-0004",
      "item_id": "9000000000004",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000004.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000004_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000004.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000004_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0005",
    "raw": {
      "sample_id": "PUCOT-0005",
      "item_id": "9000000000005",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000005.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000005_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000005.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000005_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0006",
    "raw": {
      "sample_id": "PUCOT-0006",
      "item_id": "9000000000006",
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "main_image": "https://img.mock.taobao.com/main/9000000000006.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000006_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000006.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000006_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0007",
    "raw": {
      "sample_id": "PUCOT-0007",
      "item_id": "9000000000007",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000007.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000007_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000007.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000007_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0008",
    "raw": {
      "sample_id": "PUCOT-0008",
      "item_id": "9000000000008",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000008.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000008_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000008.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000008_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0009",
    "raw": {
      "sample_id": "PUCOT-0009",
      "item_id": "9000000000009",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000009.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000009_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:75g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=黄瓜味\",\"净含量=75g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:75g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000009.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000009_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0010",
    "raw": {
      "sample_id": "PUCOT-0010",
      "item_id": "9000000000010",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000010.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000010_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:138g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=138g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:138g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000010.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000010_main.jpg"
    },
    "category": "食品零食",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0011",
    "raw": {
      "sample_id": "PUCOT-0011",
      "item_id": "9000000000011",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000011.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000011_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=30ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000011.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000011_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step2 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0012",
    "raw": {
      "sample_id": "PUCOT-0012",
      "item_id": "9000000000012",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000012.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000012_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000012.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000012_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0013",
    "raw": {
      "sample_id": "PUCOT-0013",
      "item_id": "9000000000013",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000013.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000013_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:白色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=白色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"白色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:白色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"白色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000013.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000013_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0014",
    "raw": {
      "sample_id": "PUCOT-0014",
      "item_id": "9000000000014",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000014.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000014_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000014.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000014_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0015",
    "raw": {
      "sample_id": "PUCOT-0015",
      "item_id": "9000000000015",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000015.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000015_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000015.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000015_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0016",
    "raw": {
      "sample_id": "PUCOT-0016",
      "item_id": "9000000000016",
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "main_image": "https://img.mock.taobao.com/main/9000000000016.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000016_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000016.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000016_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step2 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0017",
    "raw": {
      "sample_id": "PUCOT-0017",
      "item_id": "9000000000017",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000017.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000017_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000017.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000017_main.jpg"
    },
    "category": "食品零食",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0018",
    "raw": {
      "sample_id": "PUCOT-0018",
      "item_id": "9000000000018",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000018.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000018_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000018.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000018_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step2 有幻觉",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0019",
    "raw": {
      "sample_id": "PUCOT-0019",
      "item_id": "9000000000019",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000019.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000019_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000019.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000019_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0020",
    "raw": {
      "sample_id": "PUCOT-0020",
      "item_id": "9000000000020",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000020.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000020_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000020.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000020_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0021",
    "raw": {
      "sample_id": "PUCOT-0021",
      "item_id": "9000000000021",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000021.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000021_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=30ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000021.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000021_main.jpg"
    },
    "category": "美妆护肤",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0022",
    "raw": {
      "sample_id": "PUCOT-0022",
      "item_id": "9000000000022",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000022.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000022_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000022.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000022_main.jpg"
    },
    "category": "个护小家电",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0023",
    "raw": {
      "sample_id": "PUCOT-0023",
      "item_id": "9000000000023",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000023.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000023_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000023.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000023_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0024",
    "raw": {
      "sample_id": "PUCOT-0024",
      "item_id": "9000000000024",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000024.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000024_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:75g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=75g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:75g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000024.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000024_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step2 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0025",
    "raw": {
      "sample_id": "PUCOT-0025",
      "item_id": "9000000000025",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000025.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000025_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000025.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000025_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0026",
    "raw": {
      "sample_id": "PUCOT-0026",
      "item_id": "9000000000026",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000026.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000026_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000026.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000026_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0027",
    "raw": {
      "sample_id": "PUCOT-0027",
      "item_id": "9000000000027",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000027.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000027_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000027.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000027_main.jpg"
    },
    "category": "美妆护肤",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0028",
    "raw": {
      "sample_id": "PUCOT-0028",
      "item_id": "9000000000028",
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "main_image": "https://img.mock.taobao.com/main/9000000000028.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000028_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000028.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000028_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0029",
    "raw": {
      "sample_id": "PUCOT-0029",
      "item_id": "9000000000029",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000029.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000029_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000029.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000029_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0030",
    "raw": {
      "sample_id": "PUCOT-0030",
      "item_id": "9000000000030",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000030.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000030_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:白色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=白色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"白色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:白色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"白色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000030.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000030_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0031",
    "raw": {
      "sample_id": "PUCOT-0031",
      "item_id": "9000000000031",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000031.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000031_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000031.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000031_main.jpg"
    },
    "category": "食品零食",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0032",
    "raw": {
      "sample_id": "PUCOT-0032",
      "item_id": "9000000000032",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000032.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000032_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000032.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000032_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0033",
    "raw": {
      "sample_id": "PUCOT-0033",
      "item_id": "9000000000033",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000033.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000033_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000033.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000033_main.jpg"
    },
    "category": "美妆护肤",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0034",
    "raw": {
      "sample_id": "PUCOT-0034",
      "item_id": "9000000000034",
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "main_image": "https://img.mock.taobao.com/main/9000000000034.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000034_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000034.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000034_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0035",
    "raw": {
      "sample_id": "PUCOT-0035",
      "item_id": "9000000000035",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000035.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000035_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:75g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=75g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:75g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000035.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000035_main.jpg"
    },
    "category": "食品零食",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0036",
    "raw": {
      "sample_id": "PUCOT-0036",
      "item_id": "9000000000036",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000036.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000036_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000036.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000036_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0037",
    "raw": {
      "sample_id": "PUCOT-0037",
      "item_id": "9000000000037",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000037.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000037_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:240ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=240ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:240ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000037.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000037_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0038",
    "raw": {
      "sample_id": "PUCOT-0038",
      "item_id": "9000000000038",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000038.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000038_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000038.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000038_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0039",
    "raw": {
      "sample_id": "PUCOT-0039",
      "item_id": "9000000000039",
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "main_image": "https://img.mock.taobao.com/main/9000000000039.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000039_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000039.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000039_main.jpg"
    },
    "category": "美妆护肤",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0040",
    "raw": {
      "sample_id": "PUCOT-0040",
      "item_id": "9000000000040",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000040.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000040_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000040.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000040_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0041",
    "raw": {
      "sample_id": "PUCOT-0041",
      "item_id": "9000000000041",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000041.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000041_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000041.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000041_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0042",
    "raw": {
      "sample_id": "PUCOT-0042",
      "item_id": "9000000000042",
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "main_image": "https://img.mock.taobao.com/main/9000000000042.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000042_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000042.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000042_main.jpg"
    },
    "category": "食品零食",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0043",
    "raw": {
      "sample_id": "PUCOT-0043",
      "item_id": "9000000000043",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000043.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000043_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000043.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000043_main.jpg"
    },
    "category": "个护小家电",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0044",
    "raw": {
      "sample_id": "PUCOT-0044",
      "item_id": "9000000000044",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000044.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000044_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:75g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=75g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:75g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000044.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000044_main.jpg"
    },
    "category": "食品零食",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0045",
    "raw": {
      "sample_id": "PUCOT-0045",
      "item_id": "9000000000045",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000045.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000045_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000045.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000045_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0046",
    "raw": {
      "sample_id": "PUCOT-0046",
      "item_id": "9000000000046",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000046.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000046_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000046.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000046_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0047",
    "raw": {
      "sample_id": "PUCOT-0047",
      "item_id": "9000000000047",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000047.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000047_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000047.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000047_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0048",
    "raw": {
      "sample_id": "PUCOT-0048",
      "item_id": "9000000000048",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000048.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000048_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000048.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000048_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0049",
    "raw": {
      "sample_id": "PUCOT-0049",
      "item_id": "9000000000049",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000049.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000049_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:2.0m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=贡缎\",\"适用床尺寸=2.0m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:2.0m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000049.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000049_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0050",
    "raw": {
      "sample_id": "PUCOT-0050",
      "item_id": "9000000000050",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000050.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000050_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000050.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000050_main.jpg"
    },
    "category": "母婴用品",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0051",
    "raw": {
      "sample_id": "PUCOT-0051",
      "item_id": "9000000000051",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000051.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000051_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=真皮\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000051.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000051_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0052",
    "raw": {
      "sample_id": "PUCOT-0052",
      "item_id": "9000000000052",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000052.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000052_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.5m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=1.5m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.5m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000052.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000052_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0053",
    "raw": {
      "sample_id": "PUCOT-0053",
      "item_id": "9000000000053",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000053.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000053_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=贡缎\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000053.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000053_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0054",
    "raw": {
      "sample_id": "PUCOT-0054",
      "item_id": "9000000000054",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000054.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000054_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000054.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000054_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0055",
    "raw": {
      "sample_id": "PUCOT-0055",
      "item_id": "9000000000055",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000055.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000055_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000055.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000055_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0056",
    "raw": {
      "sample_id": "PUCOT-0056",
      "item_id": "9000000000056",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000056.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000056_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000056.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000056_main.jpg"
    },
    "category": "数码配件",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0057",
    "raw": {
      "sample_id": "PUCOT-0057",
      "item_id": "9000000000057",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000057.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000057_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000057.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000057_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0058",
    "raw": {
      "sample_id": "PUCOT-0058",
      "item_id": "9000000000058",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000058.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000058_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000058.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000058_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0059",
    "raw": {
      "sample_id": "PUCOT-0059",
      "item_id": "9000000000059",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000059.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000059_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000059.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000059_main.jpg"
    },
    "category": "食品零食",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0060",
    "raw": {
      "sample_id": "PUCOT-0060",
      "item_id": "9000000000060",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000060.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000060_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000060.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000060_main.jpg"
    },
    "category": "个护小家电",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0061",
    "raw": {
      "sample_id": "PUCOT-0061",
      "item_id": "9000000000061",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000061.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000061_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000061.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000061_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0062",
    "raw": {
      "sample_id": "PUCOT-0062",
      "item_id": "9000000000062",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000062.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000062_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:2.0m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=2.0m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:2.0m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000062.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000062_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0063",
    "raw": {
      "sample_id": "PUCOT-0063",
      "item_id": "9000000000063",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000063.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000063_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000063.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000063_main.jpg"
    },
    "category": "个护小家电",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0064",
    "raw": {
      "sample_id": "PUCOT-0064",
      "item_id": "9000000000064",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000064.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000064_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000064.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000064_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0065",
    "raw": {
      "sample_id": "PUCOT-0065",
      "item_id": "9000000000065",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000065.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000065_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:240ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=240ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:240ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000065.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000065_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0066",
    "raw": {
      "sample_id": "PUCOT-0066",
      "item_id": "9000000000066",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000066.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000066_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:2.0m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=2.0m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:2.0m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000066.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000066_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0067",
    "raw": {
      "sample_id": "PUCOT-0067",
      "item_id": "9000000000067",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000067.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000067_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000067.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000067_main.jpg"
    },
    "category": "数码配件",
    "label": "0 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0068",
    "raw": {
      "sample_id": "PUCOT-0068",
      "item_id": "9000000000068",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000068.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000068_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000068.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000068_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0069",
    "raw": {
      "sample_id": "PUCOT-0069",
      "item_id": "9000000000069",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000069.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000069_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000069.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000069_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0070",
    "raw": {
      "sample_id": "PUCOT-0070",
      "item_id": "9000000000070",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000070.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000070_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000070.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000070_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0071",
    "raw": {
      "sample_id": "PUCOT-0071",
      "item_id": "9000000000071",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000071.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000071_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000071.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000071_main.jpg"
    },
    "category": "母婴用品",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0072",
    "raw": {
      "sample_id": "PUCOT-0072",
      "item_id": "9000000000072",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000072.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000072_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=黄瓜味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000072.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000072_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0073",
    "raw": {
      "sample_id": "PUCOT-0073",
      "item_id": "9000000000073",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000073.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000073_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000073.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000073_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step2 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0074",
    "raw": {
      "sample_id": "PUCOT-0074",
      "item_id": "9000000000074",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000074.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000074_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000074.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000074_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0075",
    "raw": {
      "sample_id": "PUCOT-0075",
      "item_id": "9000000000075",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000075.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000075_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000075.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000075_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0076",
    "raw": {
      "sample_id": "PUCOT-0076",
      "item_id": "9000000000076",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000076.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000076_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000076.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000076_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0077",
    "raw": {
      "sample_id": "PUCOT-0077",
      "item_id": "9000000000077",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000077.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000077_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000077.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000077_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0078",
    "raw": {
      "sample_id": "PUCOT-0078",
      "item_id": "9000000000078",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000078.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000078_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000078.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000078_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0079",
    "raw": {
      "sample_id": "PUCOT-0079",
      "item_id": "9000000000079",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000079.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000079_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000079.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000079_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0080",
    "raw": {
      "sample_id": "PUCOT-0080",
      "item_id": "9000000000080",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000080.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000080_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=真皮\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000080.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000080_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0081",
    "raw": {
      "sample_id": "PUCOT-0081",
      "item_id": "9000000000081",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000081.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000081_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000081.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000081_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0082",
    "raw": {
      "sample_id": "PUCOT-0082",
      "item_id": "9000000000082",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000082.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000082_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000082.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000082_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0083",
    "raw": {
      "sample_id": "PUCOT-0083",
      "item_id": "9000000000083",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000083.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000083_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=贡缎\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:贡缎；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=贡缎；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"贡缎\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000083.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000083_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0084",
    "raw": {
      "sample_id": "PUCOT-0084",
      "item_id": "9000000000084",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000084.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000084_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000084.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000084_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0085",
    "raw": {
      "sample_id": "PUCOT-0085",
      "item_id": "9000000000085",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000085.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000085_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:75g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=75g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:75g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=75g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=75g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=75g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"75g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000085.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000085_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0086",
    "raw": {
      "sample_id": "PUCOT-0086",
      "item_id": "9000000000086",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000086.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000086_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000086.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000086_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0087",
    "raw": {
      "sample_id": "PUCOT-0087",
      "item_id": "9000000000087",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000087.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000087_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000087.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000087_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0088",
    "raw": {
      "sample_id": "PUCOT-0088",
      "item_id": "9000000000088",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000088.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000088_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=120ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:120ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=120ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=120ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"120ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000088.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000088_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0089",
    "raw": {
      "sample_id": "PUCOT-0089",
      "item_id": "9000000000089",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000089.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000089_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:240ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=240ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:240ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000089.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000089_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0090",
    "raw": {
      "sample_id": "PUCOT-0090",
      "item_id": "9000000000090",
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "main_image": "https://img.mock.taobao.com/main/9000000000090.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000090_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.5m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.5m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.5m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000090.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000090_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0091",
    "raw": {
      "sample_id": "PUCOT-0091",
      "item_id": "9000000000091",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000091.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000091_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000091.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000091_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0092",
    "raw": {
      "sample_id": "PUCOT-0092",
      "item_id": "9000000000092",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000092.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000092_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000092.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000092_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0093",
    "raw": {
      "sample_id": "PUCOT-0093",
      "item_id": "9000000000093",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000093.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000093_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000093.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000093_main.jpg"
    },
    "category": "家居用品",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0094",
    "raw": {
      "sample_id": "PUCOT-0094",
      "item_id": "9000000000094",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000094.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000094_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000094.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000094_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0095",
    "raw": {
      "sample_id": "PUCOT-0095",
      "item_id": "9000000000095",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000095.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000095_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000095.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000095_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0096",
    "raw": {
      "sample_id": "PUCOT-0096",
      "item_id": "9000000000096",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000096.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000096_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000096.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000096_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0097",
    "raw": {
      "sample_id": "PUCOT-0097",
      "item_id": "9000000000097",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000097.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000097_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000097.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000097_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0098",
    "raw": {
      "sample_id": "PUCOT-0098",
      "item_id": "9000000000098",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000098.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000098_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=真皮\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000098.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000098_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0099",
    "raw": {
      "sample_id": "PUCOT-0099",
      "item_id": "9000000000099",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000099.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000099_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000099.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000099_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0100",
    "raw": {
      "sample_id": "PUCOT-0100",
      "item_id": "9000000000100",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000100.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000100_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000100.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000100_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0101",
    "raw": {
      "sample_id": "PUCOT-0101",
      "item_id": "9000000000101",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000101.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000101_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000101.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000101_main.jpg"
    },
    "category": "个护小家电",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0102",
    "raw": {
      "sample_id": "PUCOT-0102",
      "item_id": "9000000000102",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000102.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000102_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000102.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000102_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step2 有幻觉",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0103",
    "raw": {
      "sample_id": "PUCOT-0103",
      "item_id": "9000000000103",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000103.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000103_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:240ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=240ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:240ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=240ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=240ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"240ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000103.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000103_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0104",
    "raw": {
      "sample_id": "PUCOT-0104",
      "item_id": "9000000000104",
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "main_image": "https://img.mock.taobao.com/main/9000000000104.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000104_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "SK-II小灯泡神仙水均衡净肌套装精华露提亮淡斑",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000104.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000104_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0105",
    "raw": {
      "sample_id": "PUCOT-0105",
      "item_id": "9000000000105",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000105.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000105_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000105.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000105_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0106",
    "raw": {
      "sample_id": "PUCOT-0106",
      "item_id": "9000000000106",
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "main_image": "https://img.mock.taobao.com/main/9000000000106.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000106_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:2.0m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=2.0m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:2.0m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=2.0m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"2.0m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000106.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000106_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0107",
    "raw": {
      "sample_id": "PUCOT-0107",
      "item_id": "9000000000107",
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "main_image": "https://img.mock.taobao.com/main/9000000000107.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000107_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "水星家纺纯棉四件套全棉床单被套北欧轻奢风床上用品1.8m",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000107.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000107_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0108",
    "raw": {
      "sample_id": "PUCOT-0108",
      "item_id": "9000000000108",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000108.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000108_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:混合性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=混合性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"混合性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:混合性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"混合性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000108.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000108_main.jpg"
    },
    "category": "美妆护肤",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0109",
    "raw": {
      "sample_id": "PUCOT-0109",
      "item_id": "9000000000109",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000109.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000109_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000109.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000109_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0110",
    "raw": {
      "sample_id": "PUCOT-0110",
      "item_id": "9000000000110",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000110.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000110_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.5m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=1.5m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.5m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.5m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.5m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000110.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000110_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0111",
    "raw": {
      "sample_id": "PUCOT-0111",
      "item_id": "9000000000111",
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000111.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000111_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "布朗博士防胀气奶瓶宽口径PPSU婴儿奶瓶0-6个月150ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000111.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000111_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step2 有关键信息缺失",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0112",
    "raw": {
      "sample_id": "PUCOT-0112",
      "item_id": "9000000000112",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000112.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000112_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=黑色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000112.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000112_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0113",
    "raw": {
      "sample_id": "PUCOT-0113",
      "item_id": "9000000000113",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000113.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000113_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000113.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000113_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0114",
    "raw": {
      "sample_id": "PUCOT-0114",
      "item_id": "9000000000114",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000114.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000114_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000114.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000114_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0115",
    "raw": {
      "sample_id": "PUCOT-0115",
      "item_id": "9000000000115",
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "main_image": "https://img.mock.taobao.com/main/9000000000115.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000115_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=烤鸡翅味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "乐事原味马铃薯片大包装薯片休闲零食办公室解馋零嘴",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:烤鸡翅味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=烤鸡翅味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"烤鸡翅味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000115.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000115_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0116",
    "raw": {
      "sample_id": "PUCOT-0116",
      "item_id": "9000000000116",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000116.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000116_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:138g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=138g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:138g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000116.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000116_main.jpg"
    },
    "category": "食品零食",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0117",
    "raw": {
      "sample_id": "PUCOT-0117",
      "item_id": "9000000000117",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000117.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000117_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:白色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=白色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"白色\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:白色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"白色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000117.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000117_main.jpg"
    },
    "category": "个护小家电",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0118",
    "raw": {
      "sample_id": "PUCOT-0118",
      "item_id": "9000000000118",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000118.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000118_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000118.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000118_main.jpg"
    },
    "category": "数码配件",
    "label": "0 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0119",
    "raw": {
      "sample_id": "PUCOT-0119",
      "item_id": "9000000000119",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000119.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000119_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=液态硅胶\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:液态硅胶；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=液态硅胶；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"液态硅胶\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000119.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000119_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0120",
    "raw": {
      "sample_id": "PUCOT-0120",
      "item_id": "9000000000120",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000120.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000120_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=真皮\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:真皮；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=真皮；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"真皮\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000120.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000120_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0121",
    "raw": {
      "sample_id": "PUCOT-0121",
      "item_id": "9000000000121",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000121.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000121_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000121.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000121_main.jpg"
    },
    "category": "个护小家电",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0122",
    "raw": {
      "sample_id": "PUCOT-0122",
      "item_id": "9000000000122",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000122.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000122_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000122.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000122_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step2 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0123",
    "raw": {
      "sample_id": "PUCOT-0123",
      "item_id": "9000000000123",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000123.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000123_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:混合性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=混合性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"混合性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:混合性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=混合性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"混合性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000123.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000123_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0124",
    "raw": {
      "sample_id": "PUCOT-0124",
      "item_id": "9000000000124",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000124.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000124_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000124.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000124_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0125",
    "raw": {
      "sample_id": "PUCOT-0125",
      "item_id": "9000000000125",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000125.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000125_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000125.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000125_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0126",
    "raw": {
      "sample_id": "PUCOT-0126",
      "item_id": "9000000000126",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000126.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000126_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:50ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=50ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=50ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"50ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:50ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=50ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"50ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000126.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000126_main.jpg"
    },
    "category": "美妆护肤",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0127",
    "raw": {
      "sample_id": "PUCOT-0127",
      "item_id": "9000000000127",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000127.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000127_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000127.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000127_main.jpg"
    },
    "category": "个护小家电",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0128",
    "raw": {
      "sample_id": "PUCOT-0128",
      "item_id": "9000000000128",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000128.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000128_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=天丝\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:天丝；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=天丝；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"天丝\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000128.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000128_main.jpg"
    },
    "category": "家居用品",
    "label": "0 分 - Step3 引用规则有误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0129",
    "raw": {
      "sample_id": "PUCOT-0129",
      "item_id": "9000000000129",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000129.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000129_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:50ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=50ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=50ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"50ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:50ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=50ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=50ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"50ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000129.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000129_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0130",
    "raw": {
      "sample_id": "PUCOT-0130",
      "item_id": "9000000000130",
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "main_image": "https://img.mock.taobao.com/main/9000000000130.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000130_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=黄瓜味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "三只松鼠夏威夷果坚果年货礼盒装办公室零食",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:黄瓜味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=黄瓜味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"黄瓜味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000130.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000130_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0131",
    "raw": {
      "sample_id": "PUCOT-0131",
      "item_id": "9000000000131",
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "main_image": "https://img.mock.taobao.com/main/9000000000131.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000131_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:白色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+7刷头\",\"颜色=白色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"白色\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "飞利浦电动牙刷HX6730声波震动充电式情侣款全自动智能护龈",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+7刷头；颜色:白色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+7刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+7刷头\"},{\"颜色\":\"白色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000131.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000131_main.jpg"
    },
    "category": "个护小家电",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0132",
    "raw": {
      "sample_id": "PUCOT-0132",
      "item_id": "9000000000132",
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000132.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000132_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:330ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=硅胶\",\"口径=标准款\",\"容量=330ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "贝亲奶瓶玻璃宽口径新生儿婴儿宝宝防胀气奶瓶160ml/240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:硅胶；口径:标准款；容量:330ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=硅胶；口径=标准款；容量=330ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=硅胶；口径=标准款；容量=330ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"硅胶\"},{\"口径\":\"标准款\"},{\"容量\":\"330ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000132.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000132_main.jpg"
    },
    "category": "母婴用品",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0133",
    "raw": {
      "sample_id": "PUCOT-0133",
      "item_id": "9000000000133",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000133.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000133_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:蓝色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=蓝色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"蓝色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:蓝色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=蓝色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"蓝色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000133.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000133_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0134",
    "raw": {
      "sample_id": "PUCOT-0134",
      "item_id": "9000000000134",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000134.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000134_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:138g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=原味\",\"净含量=138g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:原味；净含量:138g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=原味；净含量=138g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=原味；净含量=138g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=原味；净含量=138g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"原味\"},{\"净含量\":\"138g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000134.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000134_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step3 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0135",
    "raw": {
      "sample_id": "PUCOT-0135",
      "item_id": "9000000000135",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000135.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000135_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:200g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=200g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:200g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=200g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=200g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"200g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000135.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000135_main.jpg"
    },
    "category": "食品零食",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0136",
    "raw": {
      "sample_id": "PUCOT-0136",
      "item_id": "9000000000136",
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000136.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000136_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=75ml\",\"适用肤质=干性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "兰蔻小黑瓶肌底液精华液修护补水保湿提亮肤色女30ml",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:75ml；适用肤质:干性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=75ml；适用肤质=干性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=75ml；适用肤质=干性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"75ml\"},{\"适用肤质\":\"干性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000136.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000136_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0137",
    "raw": {
      "sample_id": "PUCOT-0137",
      "item_id": "9000000000137",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000137.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000137_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:薰衣草紫",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=薰衣草紫\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"薰衣草紫\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:薰衣草紫",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=薰衣草紫",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"薰衣草紫\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000137.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000137_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0138",
    "raw": {
      "sample_id": "PUCOT-0138",
      "item_id": "9000000000138",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000138.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000138_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=15ml\",\"适用肤质=油性\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "不匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "跳过",
      "gold_final_score": -1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:15ml；适用肤质:油性；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=15ml；适用肤质=油性；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=15ml；适用肤质=油性；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"15ml\"},{\"适用肤质\":\"油性\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000138.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000138_main.jpg"
    },
    "category": "美妆护肤",
    "label": "类目不匹配-跳过",
    "riskType": "类目不匹配",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0139",
    "raw": {
      "sample_id": "PUCOT-0139",
      "item_id": "9000000000139",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000139.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000139_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=PPSU\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:PPSU；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=PPSU；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=PPSU；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"PPSU\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000139.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000139_main.jpg"
    },
    "category": "母婴用品",
    "label": "0 分 - Step3 有幻觉",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0140",
    "raw": {
      "sample_id": "PUCOT-0140",
      "item_id": "9000000000140",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000140.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000140_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+1刷头\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+1刷头；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+1刷头；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+1刷头\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000140.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000140_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0141",
    "raw": {
      "sample_id": "PUCOT-0141",
      "item_id": "9000000000141",
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "main_image": "https://img.mock.taobao.com/main/9000000000141.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000141_main.jpg",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:敏感肌；功效:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"净含量=30ml\",\"适用肤质=敏感肌\",\"功效=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_面部精华_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "雅诗兰黛小棕瓶第七代精华液修护多效肌肤紧致抗皱保湿",
      "cate_full_name": "美容护肤<面部护理",
      "item_kv_pairs": "品牌:标准款；净含量:30ml；适用肤质:敏感肌；功效:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_cot_step3": "PU 层：面部精华；context：品牌=标准款；spec：净含量=30ml；适用肤质=敏感肌；功效=标准款",
      "model_pu_output": "{\"pu_layer\":\"面部精华\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"净含量\":\"30ml\"},{\"适用肤质\":\"敏感肌\"},{\"功效\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000141.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000141_main.jpg"
    },
    "category": "美妆护肤",
    "label": "1 分 - Step1 有幻觉",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0142",
    "raw": {
      "sample_id": "PUCOT-0142",
      "item_id": "9000000000142",
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "main_image": "https://img.mock.taobao.com/main/9000000000142.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000142_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.2m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=亚麻\",\"适用床尺寸=1.2m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "罗莱家纺天丝四件套60s贡缎冰丝床上用品1.5m/1.8m双人",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:亚麻；适用床尺寸:1.2m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=亚麻；适用床尺寸=1.2m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"亚麻\"},{\"适用床尺寸\":\"1.2m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000142.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000142_main.jpg"
    },
    "category": "家居用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0143",
    "raw": {
      "sample_id": "PUCOT-0143",
      "item_id": "9000000000143",
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "main_image": "https://img.mock.taobao.com/main/9000000000143.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000143_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:白色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=白色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"白色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "欧乐B PRO1 成人电动牙刷 圆头自动充电 牙菌斑高效清洁",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:白色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=白色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"白色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000143.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000143_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step1 提取错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0144",
    "raw": {
      "sample_id": "PUCOT-0144",
      "item_id": "9000000000144",
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "main_image": "https://img.mock.taobao.com/main/9000000000144.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000144_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=粉色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "小米14Pro手机壳磁吸MagSafe液态硅胶超薄全包",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:粉色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=粉色",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=粉色",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"粉色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000144.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000144_main.jpg"
    },
    "category": "数码配件",
    "label": "1 分 - Step1 有关键信息缺失",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0145",
    "raw": {
      "sample_id": "PUCOT-0145",
      "item_id": "9000000000145",
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "main_image": "https://img.mock.taobao.com/main/9000000000145.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000145_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=TPU\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "苹果iPhone15ProMax手机壳液态硅胶磁吸全包防摔保护套",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:TPU；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=TPU；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=TPU；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"TPU\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000145.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000145_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0146",
    "raw": {
      "sample_id": "PUCOT-0146",
      "item_id": "9000000000146",
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "main_image": "https://img.mock.taobao.com/main/9000000000146.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000146_main.jpg",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:104g；包装规格:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"口味=番茄味\",\"净含量=104g\",\"包装规格=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_薯片_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}",
      "pu_online_judgement": "不可上线",
      "gold_final_score": 0,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "良品铺子混合坚果每日坚果儿童孕妇坚果零食大礼包",
      "cate_full_name": "食品/零食/坚果<休闲零食",
      "item_kv_pairs": "品牌:标准款；口味:番茄味；净含量:104g；包装规格:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；口味=番茄味；净含量=104g；包装规格=标准款",
      "model_cot_step3": "PU 层：薯片；context：品牌=标准款；spec：口味=番茄味；净含量=104g；包装规格=标准款",
      "model_pu_output": "{\"pu_layer\":\"薯片\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"口味\":\"番茄味\"},{\"净含量\":\"104g\"},{\"包装规格\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000146.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000146_main.jpg"
    },
    "category": "食品零食",
    "label": "0 分 - Step3 推理有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "hard"
  },
  {
    "id": "PUCOT-0147",
    "raw": {
      "sample_id": "PUCOT-0147",
      "item_id": "9000000000147",
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "main_image": "https://img.mock.taobao.com/main/9000000000147.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000147_main.jpg",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "all_sku_pv": "[\"品牌=标准款\",\"适用机型=标准款\",\"材质=玻璃\",\"颜色=透明\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_手机壳_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "华为Mate60Pro手机壳新款时尚商务真皮防摔保护套男",
      "cate_full_name": "3C数码<手机配件",
      "item_kv_pairs": "品牌:标准款；适用机型:标准款；材质:玻璃；颜色:透明",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step2": "按优先级保留：品牌=标准款；适用机型=标准款；材质=玻璃；颜色=透明",
      "model_cot_step3": "PU 层：手机壳；context：品牌=标准款；spec：适用机型=标准款；材质=玻璃；颜色=透明",
      "model_pu_output": "{\"pu_layer\":\"手机壳\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"适用机型\":\"标准款\"},{\"材质\":\"玻璃\"},{\"颜色\":\"透明\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000147.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000147_main.jpg"
    },
    "category": "数码配件",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0148",
    "raw": {
      "sample_id": "PUCOT-0148",
      "item_id": "9000000000148",
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "main_image": "https://img.mock.taobao.com/main/9000000000148.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000148_main.jpg",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:160ml",
      "all_sku_pv": "[\"品牌=标准款\",\"材质=玻璃\",\"口径=标准款\",\"容量=160ml\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_奶瓶_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}",
      "pu_online_judgement": "可上线",
      "gold_final_score": 2,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "可么多么宽口径PPSU奶瓶婴儿仿母乳防胀气一岁以上240ml",
      "cate_full_name": "母婴用品<奶瓶奶嘴",
      "item_kv_pairs": "品牌:标准款；材质:玻璃；口径:标准款；容量:160ml",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step2": "按优先级保留：品牌=标准款；材质=玻璃；口径=标准款；容量=160ml",
      "model_cot_step3": "PU 层：奶瓶；context：品牌=标准款；spec：材质=玻璃；口径=标准款；容量=160ml",
      "model_pu_output": "{\"pu_layer\":\"奶瓶\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"材质\":\"玻璃\"},{\"口径\":\"标准款\"},{\"容量\":\"160ml\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000148.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000148_main.jpg"
    },
    "category": "母婴用品",
    "label": "2 分 - CoT 无问题",
    "riskType": "无错误",
    "difficultyHint": "easy"
  },
  {
    "id": "PUCOT-0149",
    "raw": {
      "sample_id": "PUCOT-0149",
      "item_id": "9000000000149",
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "main_image": "https://img.mock.taobao.com/main/9000000000149.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000149_main.jpg",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "all_sku_pv": "[\"品牌=标准款\",\"面料材质=全棉\",\"适用床尺寸=1.8m\",\"颜色=标准款\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_四件套_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "富安娜全棉四件套贡缎床上用品纯棉被套床单150*200cm",
      "cate_full_name": "居家布艺<床上用品",
      "item_kv_pairs": "品牌:标准款；面料材质:全棉；适用床尺寸:1.8m；颜色:标准款",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step2": "按优先级保留：品牌=标准款；面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_cot_step3": "PU 层：四件套；context：品牌=标准款；spec：面料材质=全棉；适用床尺寸=1.8m；颜色=标准款",
      "model_pu_output": "{\"pu_layer\":\"四件套\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"面料材质\":\"全棉\"},{\"适用床尺寸\":\"1.8m\"},{\"颜色\":\"标准款\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000149.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000149_main.jpg"
    },
    "category": "家居用品",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step2 消歧错误",
    "difficultyHint": "medium"
  },
  {
    "id": "PUCOT-0150",
    "raw": {
      "sample_id": "PUCOT-0150",
      "item_id": "9000000000150",
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "main_image": "https://img.mock.taobao.com/main/9000000000150.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000150_main.jpg",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "all_sku_pv": "[\"品牌=标准款\",\"型号=标准款\",\"刷头数量=1刷杆+4刷头\",\"颜色=黑色\"]",
      "cur_sku_pv": "品牌=标准款",
      "pu_rule_doc_id": "rule_电动牙刷_v2",
      "category_match": "匹配",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}",
      "pu_online_judgement": "可上线(需修补)",
      "gold_final_score": 1,
      "batch_id": "PU-COT-DEMO-202605"
    },
    "textFields": {
      "item_title": "舒克声波电动牙刷智能护龈型成人款情侣套装节日礼物",
      "cate_full_name": "个护小家电<电动牙刷",
      "item_kv_pairs": "品牌:标准款；型号:标准款；刷头数量:1刷杆+4刷头；颜色:黑色",
      "cur_sku_pv": "品牌=标准款",
      "model_cot_step1": "提取属性：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step2": "按优先级保留：品牌=标准款；型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_cot_step3": "PU 层：电动牙刷；context：品牌=标准款；spec：型号=标准款；刷头数量=1刷杆+4刷头；颜色=黑色",
      "model_pu_output": "{\"pu_layer\":\"电动牙刷\",\"context\":[{\"品牌\":\"标准款\"}],\"spec\":[{\"型号\":\"标准款\"},{\"刷头数量\":\"1刷杆+4刷头\"},{\"颜色\":\"黑色\"}]}"
    },
    "imageFields": {
      "main_image": "https://img.mock.taobao.com/main/9000000000150.jpg",
      "sku_image": "https://img.mock.taobao.com/sku/9000000000150_main.jpg"
    },
    "category": "个护小家电",
    "label": "1 分 - Step1 有逻辑错误",
    "riskType": "Step3 编排错误",
    "difficultyHint": "medium"
  }
];

const historicalLabelsData: HistoricalLabelRecord[] = [
  {
    "sampleId": "PUCOT-0001",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-27T08:18:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0002",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中凭空生成 颜色 信息，原商品所有信息源均未体现 ｜ 信息源参数详情中提到了关键属性 颜色：标准款，在 Step1 中未提取 ｜ Step2 中保留了源自标题的 颜色：未知，按优先级应优先取 sku 选项列表中的 标准款 ｜ Step3 中引用的「'全年装' 对应 '1刷杆+7刷头'」信息，在前置步骤中未出现",
    "operator": "op_203",
    "labelTime": "2026-05-16T05:02:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0003",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 品牌：标准款，在 Step1 中未提取",
    "operator": "op_204",
    "labelTime": "2026-05-23T05:26:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0004",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-09T23:15:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0005",
    "label": "0 分 - Step1 有逻辑错误",
    "reason": "标注员判定：Step1 中将参数详情中的 功效 误提到了 PU 层（与最终复核存在分歧）",
    "operator": "op_203",
    "labelTime": "2026-05-13T11:59:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0006",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 颜色：未知，信息源为 item 图，实际 item 图中 颜色 为 标准款 ｜ 参考规则中关于 颜色 的细则为 3.5，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.8）",
    "operator": "op_205",
    "labelTime": "2026-05-24T12:46:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0007",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-12T15:53:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0008",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-16T15:54:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0009",
    "label": "1 分 - Step3 有关键信息缺失",
    "reason": "Step3 中未对关键属性 包装规格 进行结构编排",
    "operator": "op_203",
    "labelTime": "2026-05-17T05:19:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0010",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-23T08:22:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0011",
    "label": "1 分 - Step2 有幻觉",
    "reason": "Step2 中出现了 功效：标准款，该属性未在 Step1 中提取 ｜ 根据规则 3.1，功效 该属性统一输出为 面部精华，Step3 中未按要求输出",
    "operator": "op_203",
    "labelTime": "2026-05-15T18:10:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0012",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 品牌：标准款，在 Step1 中未提取 ｜ 根据规则 3.4，品牌 应为 PU 层属性，Step3 中 品牌 编排归属错误（归入 spec 层）",
    "operator": "op_205",
    "labelTime": "2026-05-15T20:51:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0013",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 颜色：粉色，信息源为 item 图，实际 item 图中 颜色 为 白色 ｜ Step2 中保留了源自 item 图中的 颜色：粉色，然而 sku 属性中的 颜色 为 白色，按优先级应保留 sku 属性中的 颜色：白色 ｜ 参考规则中关于 颜色 的细则为 3.5，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.1）",
    "operator": "op_201",
    "labelTime": "2026-05-24T17:22:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0014",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-09T09:30:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0015",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中凭空生成 颜色 信息，原商品所有信息源均未体现 ｜ Step1 中将参数详情中的 颜色 误提到了 spec 层 ｜ Step2 中保留了源自 item 图中的 颜色：未知，然而 sku 属性中的 颜色 为 标准款，按优先级应保留 sku 属性中的 颜色：标准款 ｜ Step2 中未保留 Step1 中提取的关键属性 颜色：标准款 ｜ 参考规则中关于 颜色 的细则为 3.6，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.8） ｜ Step3 中引用的「'全年装' 对应 '1刷杆+7刷头'」信息，在前置步骤中未出现",
    "operator": "op_204",
    "labelTime": "2026-05-22T02:37:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0016",
    "label": "1 分 - Step2 有幻觉",
    "reason": "Step2 中出现了 净含量：75g，该属性未在 Step1 中提取 ｜ Step3 中引用的「'75g' 对应 '104g'」信息，在前置步骤中未出现",
    "operator": "op_205",
    "labelTime": "2026-05-24T18:10:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0017",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_204",
    "labelTime": "2026-05-12T07:19:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0018",
    "label": "1 分 - Step2 有幻觉",
    "reason": "Step2 中出现了 保质期：标准款，该属性未在 Step1 中提取",
    "operator": "op_205",
    "labelTime": "2026-05-11T10:51:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0019",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-10T20:26:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0020",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-21T12:06:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0021",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-12T20:32:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0022",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_202",
    "labelTime": "2026-05-18T23:42:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0023",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-13T16:58:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0024",
    "label": "1 分 - Step2 推理有逻辑错误",
    "reason": "Step2 中保留了源自 item 图中的 保质期：未知，然而 sku 属性中的 保质期 为 标准款，按优先级应保留 sku 属性中的 保质期：标准款 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_204",
    "labelTime": "2026-05-08T10:17:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0025",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中提取了 材质：PPSU，实际属性项应为 容量 ｜ Step1 中凭空生成 材质 信息，原商品所有信息源均未体现 ｜ Step3 中分析的属性 材质：玻璃，在 Step2 中未保留 ｜ Step2 中保留了源自标题的 材质：PPSU，按优先级应优先取 sku 选项列表中的 玻璃 ｜ 参考规则中关于 材质 的细则为 3.2，Step3 中关于 材质 属性编排的规则引用错误（误引为 3.6） ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_203",
    "labelTime": "2026-05-12T19:02:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0026",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-11T12:47:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0027",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_202",
    "labelTime": "2026-05-26T04:43:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0028",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中提取了 面料材质：亚麻，信息源为 item 图，实际 item 图中没有该信息 ｜ Step1 中将参数详情中的 面料材质 误提到了 PU 层 ｜ Step2 中保留了源自 item 图中的 面料材质：亚麻，然而 sku 属性中的 面料材质 为 天丝，按优先级应保留 sku 属性中的 面料材质：天丝 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中 ｜ 根据规则 3.8，面料材质 该属性统一输出为 四件套，Step3 中未按要求输出",
    "operator": "op_204",
    "labelTime": "2026-05-08T09:37:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0029",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中将参数详情中的 功效 误提到了 spec 层 ｜ Step2 中未保留 Step1 中提取的关键属性 功效：标准款",
    "operator": "op_202",
    "labelTime": "2026-05-08T15:41:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0030",
    "label": "1 分 - Step3 有幻觉",
    "reason": "Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_204",
    "labelTime": "2026-05-11T11:29:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0031",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-23T12:00:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0032",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 功效：标准款，在 Step1 中未提取",
    "operator": "op_203",
    "labelTime": "2026-05-08T05:48:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0033",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-14T16:03:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0034",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 适用肤质：混合性，在 Step1 中未提取",
    "operator": "op_203",
    "labelTime": "2026-05-13T22:08:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0035",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-27T07:45:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0036",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 功能：未知，信息源为 item 图，实际 item 图中没有该信息 ｜ Step3 中引用的「'全年装' 对应 '1刷杆+7刷头'」信息，在前置步骤中未出现",
    "operator": "op_204",
    "labelTime": "2026-05-26T13:12:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0037",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-25T13:57:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0038",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-17T00:32:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0039",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中凭空生成 功效 信息，原商品所有信息源均未体现 ｜ Step2 中保留了源自标题的 功效：未知，按优先级应优先取 sku 选项列表中的 标准款 ｜ Step2 中未保留 Step1 中提取的关键属性 功效：标准款 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_205",
    "labelTime": "2026-05-24T06:08:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0040",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-16T05:49:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0041",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 颜色：粉色，信息源为 item 图，实际 item 图中没有该信息",
    "operator": "op_201",
    "labelTime": "2026-05-18T19:55:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0042",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中提取了 净含量：104g，信息源为 item 图，实际 item 图中没有该信息 ｜ Step1 中将参数详情中的 净含量 误提到了 PU 层 ｜ Step2 中保留了源自 item 图中的 净含量：104g，然而 sku 属性中的 净含量 为 75g，按优先级应保留 sku 属性中的 净含量：75g ｜ 参考规则中关于 净含量 的细则为 3.8，Step3 中关于 净含量 属性编排的规则引用错误（误引为 3.4） ｜ 根据规则 3.3，净含量 应为 PU 层属性，Step3 中 净含量 编排归属错误（归入 spec 层）",
    "operator": "op_205",
    "labelTime": "2026-05-09T18:29:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0043",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-24T13:53:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0044",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "Step1 中将参数详情中的 品牌 误提到了 spec 层 ｜ Step2 中保留了源自 item 图中的 品牌：未知，然而 sku 属性中的 品牌 为 标准款，按优先级应保留 sku 属性中的 品牌：标准款 ｜ Step2 中未保留 Step1 中提取的关键属性 品牌：标准款 ｜ 根据规则 3.8，品牌 应为 PU 层属性，Step3 中 品牌 编排归属错误（归入 spec 层）",
    "operator": "op_202",
    "labelTime": "2026-05-20T12:38:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0045",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 适用肤质 信息，原商品所有信息源均未体现 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_202",
    "labelTime": "2026-05-27T16:34:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0046",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-11T04:36:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0047",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 颜色：白色，信息源为 item 图，实际 item 图中没有该信息",
    "operator": "op_205",
    "labelTime": "2026-05-25T13:15:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0048",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 适用机型 信息，原商品所有信息源均未体现",
    "operator": "op_201",
    "labelTime": "2026-05-14T19:42:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0049",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 适用床尺寸：1.8m，信息源为 item 图，实际 item 图中没有该信息",
    "operator": "op_205",
    "labelTime": "2026-05-15T08:54:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0050",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_203",
    "labelTime": "2026-05-11T18:19:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0051",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 适用机型：标准款，在 Step1 中未提取",
    "operator": "op_201",
    "labelTime": "2026-05-19T20:29:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0052",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 品牌：未知，信息源为 item 图，实际 item 图中没有该信息",
    "operator": "op_201",
    "labelTime": "2026-05-17T03:56:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0053",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-20T07:51:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0054",
    "label": "0 分 - Step1 有关键信息缺失",
    "reason": "标注员判定：信息源参数详情中提到了关键属性 功能：标准款，在 Step1 中未提取（与最终复核存在分歧）",
    "operator": "op_201",
    "labelTime": "2026-05-21T21:54:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0055",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "信息源参数详情中提到了关键属性 支数：标准款，在 Step1 中未提取 ｜ Step1 中提取了 支数：未知，实际属性项应为 品牌 ｜ Step3 中分析的属性 支数：标准款，在 Step2 中未保留 ｜ Step2 中新增了 Step1 未提取的属性 支数 ｜ 根据规则 3.4，支数 应为 PU 层属性，Step3 中 支数 编排归属错误（归入 spec 层） ｜ Step3 中未对关键属性 支数 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-22T07:24:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0056",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中将参数详情中的 品牌 误提到了 spec 层 ｜ 信息源参数详情中提到了关键属性 品牌：标准款，在 Step1 中未提取 ｜ Step2 中保留了源自 item 图中的 品牌：未知，然而 sku 属性中的 品牌 为 标准款，按优先级应保留 sku 属性中的 品牌：标准款 ｜ Step2 中新增了 Step1 未提取的属性 品牌 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中 ｜ 参考规则中关于 品牌 的细则为 3.7，Step3 中关于 品牌 属性编排的规则引用错误（误引为 3.5）",
    "operator": "op_205",
    "labelTime": "2026-05-13T19:00:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0057",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中将参数详情中的 刷头数量 误提到了 spec 层 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_204",
    "labelTime": "2026-05-19T19:54:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0058",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 口径 信息，原商品所有信息源均未体现",
    "operator": "op_205",
    "labelTime": "2026-05-16T10:37:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0059",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-24T04:41:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0060",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-27T09:16:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0061",
    "label": "1 分 - Step3 有关键信息缺失",
    "reason": "Step3 中未对关键属性 颜色 进行结构编排",
    "operator": "op_203",
    "labelTime": "2026-05-21T17:06:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0062",
    "label": "1 分 - CoT 无问题",
    "reason": "标注员判定：其他原因（与最终复核存在分歧）",
    "operator": "op_201",
    "labelTime": "2026-05-10T06:43:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0063",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "信息源 sku 图中提到了关键属性 型号：标准款，在 Step1 中未提取 ｜ Step1 中将参数详情中的 型号 误提到了 spec 层 ｜ Step2 中新增了 Step1 未提取的属性 型号 ｜ Step2 中保留了源自 item 图中的 型号：未知，然而 sku 属性中的 型号 为 标准款，按优先级应保留 sku 属性中的 型号：标准款 ｜ 参考规则中关于 型号 的细则为 3.1，Step3 中关于 型号 属性编排的规则引用错误（误引为 3.8） ｜ 根据规则 3.5，型号 该属性统一输出为 电动牙刷，Step3 中未按要求输出",
    "operator": "op_203",
    "labelTime": "2026-05-24T19:11:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0064",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 颜色：粉色，实际属性项应为 功能",
    "operator": "op_201",
    "labelTime": "2026-05-20T08:19:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0065",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "信息源参数详情中提到了关键属性 颜色：标准款，在 Step1 中未提取 ｜ Step1 中提取了 颜色：未知，信息源为 item 图，实际 item 图中 颜色 为 标准款 ｜ Step2 中新增了 Step1 未提取的属性 颜色 ｜ Step2 中保留了源自 item 图中的 颜色：未知，然而 sku 属性中的 颜色 为 标准款，按优先级应保留 sku 属性中的 颜色：标准款 ｜ 参考规则中关于 颜色 的细则为 3.8，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.2） ｜ 根据规则 3.6，颜色 应为 PU 层属性，Step3 中 颜色 编排归属错误（归入 spec 层）",
    "operator": "op_203",
    "labelTime": "2026-05-20T22:54:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0066",
    "label": "1 分 - Step3 有关键信息缺失",
    "reason": "标注员判定：Step1 中提取了 颜色：未知，实际属性项应为 支数（与最终复核存在分歧）",
    "operator": "op_201",
    "labelTime": "2026-05-09T20:00:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0067",
    "label": "0 分 - Step3 有关键信息缺失",
    "reason": "Step1 中提取了 品牌：未知，实际属性项应为 功能 ｜ Step2 中保留了源自标题的 品牌：未知，按优先级应优先取 sku 选项列表中的 标准款 ｜ Step3 中未对关键属性 品牌 进行结构编排",
    "operator": "op_203",
    "labelTime": "2026-05-13T19:33:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0068",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "Step1 中提取了 适用月龄：未知，信息源为 item 图，实际 item 图中 适用月龄 为 标准款 ｜ Step3 中分析的属性 适用月龄：标准款，在 Step2 中未保留 ｜ Step2 中新增了 Step1 未提取的属性 适用月龄 ｜ 根据规则 3.4，适用月龄 应为 PU 层属性，Step3 中 适用月龄 编排归属错误（归入 spec 层） ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_204",
    "labelTime": "2026-05-26T06:47:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0069",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 材质：玻璃，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中出现了 材质：PPSU，该属性未在 Step1 中提取",
    "operator": "op_205",
    "labelTime": "2026-05-17T00:03:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0070",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中提取了 材质：玻璃，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中未保留 Step1 中提取的关键属性 材质：PPSU ｜ Step2 中保留了源自标题的 材质：玻璃，按优先级应优先取 sku 选项列表中的 PPSU ｜ Step3 中引用的「'玻璃' 对应 'PPSU'」信息，在前置步骤中未出现",
    "operator": "op_203",
    "labelTime": "2026-05-26T13:44:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0071",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_205",
    "labelTime": "2026-05-25T23:06:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0072",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 品牌：未知，实际属性项应为 品牌",
    "operator": "op_204",
    "labelTime": "2026-05-20T16:50:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0073",
    "label": "1 分 - Step2 推理有逻辑错误",
    "reason": "Step2 中保留了源自 item 图中的 型号：未知，然而 sku 属性中的 型号 为 标准款，按优先级应保留 sku 属性中的 型号：标准款 ｜ 参考规则中关于 型号 的细则为 3.4，Step3 中关于 型号 属性编排的规则引用错误（误引为 3.7）",
    "operator": "op_201",
    "labelTime": "2026-05-19T00:21:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0074",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 香型：未知，信息源为 item 图，实际 item 图中没有该信息 ｜ Step3 中未对关键属性 香型 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-12T06:57:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0075",
    "label": "1 分 - Step3 引用规则有误",
    "reason": "参考规则中关于 颜色 的细则为 3.5，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.8）",
    "operator": "op_204",
    "labelTime": "2026-05-20T05:46:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0076",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-16T08:50:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0077",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 颜色：薰衣草紫，实际属性项应为 套装规格",
    "operator": "op_203",
    "labelTime": "2026-05-12T22:51:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0078",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-14T18:25:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0079",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 口径：未知，实际属性项应为 材质",
    "operator": "op_201",
    "labelTime": "2026-05-16T16:31:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0080",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-21T22:05:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0081",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 适用机型：未知，信息源为 item 图，实际 item 图中没有该信息 ｜ Step3 中未对关键属性 适用机型 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-11T17:10:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0082",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 支数：未知，实际属性项应为 面料材质",
    "operator": "op_201",
    "labelTime": "2026-05-16T09:33:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0083",
    "label": "1 分 - Step3 有幻觉",
    "reason": "标注员判定：信息源 sku 图中提到了关键属性 颜色：标准款，在 Step1 中未提取（与最终复核存在分歧）",
    "operator": "op_204",
    "labelTime": "2026-05-09T04:12:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0084",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-24T23:23:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0085",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 包装规格：标准款，在 Step1 中未提取 ｜ Step2 中出现了 包装规格：标准款，该属性未在 Step1 中提取 ｜ 根据规则 3.4，包装规格 该属性统一输出为 薯片，Step3 中未按要求输出",
    "operator": "op_201",
    "labelTime": "2026-05-16T01:32:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0086",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 颜色：未知，信息源为 item 图，实际 item 图中 颜色 为 标准款",
    "operator": "op_205",
    "labelTime": "2026-05-18T22:09:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0087",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 功效：未知，信息源为 item 图，实际 item 图中没有该信息",
    "operator": "op_205",
    "labelTime": "2026-05-17T21:14:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0088",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "Step1 中凭空生成 材质 信息，原商品所有信息源均未体现 ｜ 信息源 sku 图中提到了关键属性 材质：PPSU，在 Step1 中未提取 ｜ Step2 中出现了 材质：PPSU，该属性未在 Step1 中提取 ｜ 根据规则 3.7，材质 应为 PU 层属性，Step3 中 材质 编排归属错误（归入 spec 层） ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_201",
    "labelTime": "2026-05-15T18:55:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0089",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-23T22:08:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0090",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 支数：标准款，在 Step1 中未提取",
    "operator": "op_202",
    "labelTime": "2026-05-21T11:58:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0091",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中凭空生成 颜色 信息，原商品所有信息源均未体现 ｜ Step2 中出现了 颜色：标准款，该属性未在 Step1 中提取 ｜ 参考规则中关于 颜色 的细则为 3.8，Step3 中关于 颜色 属性编排的规则引用错误（误引为 3.5） ｜ Step3 中未对关键属性 颜色 进行结构编排",
    "operator": "op_204",
    "labelTime": "2026-05-20T02:49:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0092",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 香型 信息，原商品所有信息源均未体现 ｜ 根据规则 3.1，香型 该属性统一输出为 面部精华，Step3 中未按要求输出",
    "operator": "op_201",
    "labelTime": "2026-05-17T09:54:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0093",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_201",
    "labelTime": "2026-05-10T09:37:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0094",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-25T23:47:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0095",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 刷头数量：1刷杆+4刷头，在 Step1 中未提取 ｜ Step2 中出现了 刷头数量：1刷杆+4刷头，该属性未在 Step1 中提取",
    "operator": "op_201",
    "labelTime": "2026-05-09T02:50:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0096",
    "label": "1 分 - Step3 有关键信息缺失",
    "reason": "Step3 中未对关键属性 品牌 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-09T01:32:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0097",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-11T11:28:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0098",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-22T09:50:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0099",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 材质：PPSU，在 Step1 中未提取",
    "operator": "op_205",
    "labelTime": "2026-05-12T04:14:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0100",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 口味 信息，原商品所有信息源均未体现 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_202",
    "labelTime": "2026-05-12T21:30:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0101",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中将参数详情中的 刷头数量 误提到了 spec 层 ｜ 信息源 sku 图中提到了关键属性 刷头数量：1刷杆+7刷头，在 Step1 中未提取 ｜ Step2 中新增了 Step1 未提取的属性 刷头数量 ｜ Step2 中保留了源自 item 图中的 刷头数量：1刷杆+4刷头，然而 sku 属性中的 刷头数量 为 1刷杆+7刷头，按优先级应保留 sku 属性中的 刷头数量：1刷杆+7刷头 ｜ 参考规则中关于 刷头数量 的细则为 3.2，Step3 中关于 刷头数量 属性编排的规则引用错误（误引为 3.3） ｜ Step3 中未对关键属性 刷头数量 进行结构编排",
    "operator": "op_202",
    "labelTime": "2026-05-08T02:12:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0102",
    "label": "1 分 - Step2 有幻觉",
    "reason": "Step2 中新增了 Step1 未提取的属性 口味",
    "operator": "op_202",
    "labelTime": "2026-05-18T12:09:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0103",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中提取了 口径：未知，信息源为 item 图，实际 item 图中 口径 为 标准款 ｜ Step1 中凭空生成 口径 信息，原商品所有信息源均未体现 ｜ Step2 中新增了 Step1 未提取的属性 口径 ｜ Step2 中保留了源自标题的 口径：未知，按优先级应优先取 sku 选项列表中的 标准款 ｜ Step3 中引用的「'全年装' 对应 '1刷杆+7刷头'」信息，在前置步骤中未出现",
    "operator": "op_202",
    "labelTime": "2026-05-26T22:47:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0104",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中将参数详情中的 香型 误提到了 spec 层",
    "operator": "op_202",
    "labelTime": "2026-05-18T03:32:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0105",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-12T09:19:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0106",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 支数：未知，实际属性项应为 面料材质 ｜ 参考规则中关于 支数 的细则为 3.2，Step3 中关于 支数 属性编排的规则引用错误（误引为 3.6）",
    "operator": "op_202",
    "labelTime": "2026-05-20T07:52:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0107",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 颜色：未知，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中保留了源自标题的 颜色：未知，按优先级应优先取 sku 选项列表中的 标准款 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_205",
    "labelTime": "2026-05-17T14:10:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0108",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-23T00:46:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0109",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 品牌：标准款，在 Step1 中未提取 ｜ Step3 中未对关键属性 品牌 进行结构编排",
    "operator": "op_205",
    "labelTime": "2026-05-18T14:24:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0110",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 品牌：未知，实际属性项应为 品牌 ｜ Step3 中未对关键属性 品牌 进行结构编排",
    "operator": "op_204",
    "labelTime": "2026-05-27T00:39:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0111",
    "label": "1 分 - Step2 有关键信息缺失",
    "reason": "Step3 中分析的属性 适用月龄：标准款，在 Step2 中未保留",
    "operator": "op_202",
    "labelTime": "2026-05-16T09:59:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0112",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 适用机型：未知，实际属性项应为 功能",
    "operator": "op_203",
    "labelTime": "2026-05-13T15:22:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0113",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-21T09:47:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0114",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-18T06:34:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0115",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 口味：原味，信息源为 item 图，实际 item 图中没有该信息 ｜ Step3 中分析的属性 口味：番茄味，在 Step2 中未保留 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_203",
    "labelTime": "2026-05-08T19:08:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0116",
    "label": "1 分 - CoT 无问题",
    "reason": "存在少量错误",
    "operator": "op_202",
    "labelTime": "2026-05-27T03:58:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0117",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_203",
    "labelTime": "2026-05-10T15:11:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0118",
    "label": "0 分 - Step3 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 材质：玻璃，在 Step1 中未提取 ｜ Step2 中保留了源自标题的 材质：液态硅胶，按优先级应优先取 sku 选项列表中的 玻璃 ｜ Step3 中未对关键属性 材质 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-17T06:15:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0119",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-16T19:42:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0120",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 材质：真皮，在 Step1 中未提取",
    "operator": "op_202",
    "labelTime": "2026-05-20T07:11:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0121",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_203",
    "labelTime": "2026-05-17T19:16:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0122",
    "label": "1 分 - Step2 有幻觉",
    "reason": "Step2 中出现了 品牌：标准款，该属性未在 Step1 中提取 ｜ 根据规则 3.4，品牌 该属性统一输出为 面部精华，Step3 中未按要求输出",
    "operator": "op_201",
    "labelTime": "2026-05-08T20:24:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0123",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 香型：未知，信息源为 item 图，实际 item 图中 香型 为 标准款 ｜ 参考规则中关于 香型 的细则为 3.5，Step3 中关于 香型 属性编排的规则引用错误（误引为 3.4）",
    "operator": "op_204",
    "labelTime": "2026-05-26T17:53:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0124",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_204",
    "labelTime": "2026-05-11T11:21:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0125",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 适用机型：未知，信息源为 item 图，实际 item 图中 适用机型 为 标准款 ｜ Step2 中新增了 Step1 未提取的属性 适用机型",
    "operator": "op_205",
    "labelTime": "2026-05-15T06:29:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0126",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "Step1 中提取了 净含量：75ml，信息源为 item 图，实际 item 图中没有该信息 ｜ Step1 中提取了 净含量：75ml，信息源为 item 图，实际 item 图中 净含量 为 50ml ｜ Step2 中未保留 Step1 中提取的关键属性 净含量：50ml ｜ 根据规则 3.8，净含量 应为 PU 层属性，Step3 中 净含量 编排归属错误（归入 spec 层） ｜ Step3 中未对关键属性 净含量 进行结构编排",
    "operator": "op_205",
    "labelTime": "2026-05-19T02:12:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0127",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-18T09:11:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0128",
    "label": "0 分 - Step3 引用规则有误",
    "reason": "Step1 中将参数详情中的 支数 误提到了 PU 层 ｜ 信息源参数详情中提到了关键属性 支数：标准款，在 Step1 中未提取 ｜ Step2 中未保留 Step1 中提取的关键属性 支数：标准款 ｜ 参考规则中关于 支数 的细则为 3.5，Step3 中关于 支数 属性编排的规则引用错误（误引为 3.6）",
    "operator": "op_201",
    "labelTime": "2026-05-16T09:26:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0129",
    "label": "1 分 - Step3 推理有逻辑错误",
    "reason": "根据规则 3.1，香型 该属性统一输出为 面部精华，Step3 中未按要求输出",
    "operator": "op_204",
    "labelTime": "2026-05-12T20:08:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0130",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 品牌 信息，原商品所有信息源均未体现 ｜ Step3 中引用的「'全年装' 对应 '1刷杆+7刷头'」信息，在前置步骤中未出现",
    "operator": "op_204",
    "labelTime": "2026-05-26T20:27:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0131",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_202",
    "labelTime": "2026-05-24T06:10:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0132",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中提取了 容量：160ml，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中未保留 Step1 中提取的关键属性 容量：120ml ｜ Step3 中引用的「'120ml' 对应 '160ml'」信息，在前置步骤中未出现",
    "operator": "op_205",
    "labelTime": "2026-05-13T23:25:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0133",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 材质：液态硅胶，在 Step1 中未提取 ｜ Step2 中保留了源自标题的 材质：真皮，按优先级应优先取 sku 选项列表中的 液态硅胶",
    "operator": "op_205",
    "labelTime": "2026-05-22T06:58:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0134",
    "label": "1 分 - Step3 有关键信息缺失",
    "reason": "Step3 中未对关键属性 品牌 进行结构编排",
    "operator": "op_203",
    "labelTime": "2026-05-22T21:26:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0135",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 包装规格：未知，实际属性项应为 净含量 ｜ Step3 中未对关键属性 包装规格 进行结构编排",
    "operator": "op_201",
    "labelTime": "2026-05-20T01:05:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0136",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 品牌 信息，原商品所有信息源均未体现",
    "operator": "op_205",
    "labelTime": "2026-05-11T06:20:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0137",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 型号：标准款，在 Step1 中未提取 ｜ Step3 中分析的属性 型号：标准款，在 Step2 中未保留",
    "operator": "op_205",
    "labelTime": "2026-05-09T23:02:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0138",
    "label": "类目不匹配-跳过",
    "reason": "基础商品与参考规则类目不匹配，按 SOP 跳过本条",
    "operator": "op_201",
    "labelTime": "2026-05-20T19:45:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0139",
    "label": "0 分 - Step3 有幻觉",
    "reason": "Step1 中提取了 容量：240ml，信息源为 item 图，实际 item 图中 容量 为 120ml ｜ Step1 中提取了 容量：240ml，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中未保留 Step1 中提取的关键属性 容量：120ml ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中 ｜ 参考规则中关于 容量 的细则为 3.5，Step3 中关于 容量 属性编排的规则引用错误（误引为 3.7）",
    "operator": "op_202",
    "labelTime": "2026-05-11T03:03:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0140",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中将参数详情中的 适用人群 误提到了 spec 层 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_203",
    "labelTime": "2026-05-15T06:17:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0141",
    "label": "1 分 - Step1 有幻觉",
    "reason": "Step1 中凭空生成 功效 信息，原商品所有信息源均未体现 ｜ Step3 中分析的属性 功效：标准款，在 Step2 中未保留",
    "operator": "op_202",
    "labelTime": "2026-05-15T00:35:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0142",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_205",
    "labelTime": "2026-05-19T22:23:00",
    "taskRound": "final_review"
  },
  {
    "sampleId": "PUCOT-0143",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源参数详情中提到了关键属性 品牌：标准款，在 Step1 中未提取",
    "operator": "op_205",
    "labelTime": "2026-05-16T21:05:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0144",
    "label": "1 分 - Step1 有关键信息缺失",
    "reason": "信息源 sku 图中提到了关键属性 材质：TPU，在 Step1 中未提取 ｜ Step2 中保留了源自标题的 材质：液态硅胶，按优先级应优先取 sku 选项列表中的 TPU ｜ 参考规则中关于 材质 的细则为 3.5，Step3 中关于 材质 属性编排的规则引用错误（误引为 3.6）",
    "operator": "op_202",
    "labelTime": "2026-05-20T19:17:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0145",
    "label": "1 分 - CoT 无问题",
    "reason": "标注员判定：其他原因（与最终复核存在分歧）",
    "operator": "op_201",
    "labelTime": "2026-05-20T09:42:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0146",
    "label": "0 分 - Step3 推理有逻辑错误",
    "reason": "Step1 中提取了 保质期：未知，信息源为 item 图，实际 item 图中没有该信息 ｜ Step2 中未保留 Step1 中提取的关键属性 保质期：标准款 ｜ 根据规则 3.4，保质期 该属性统一输出为 薯片，Step3 中未按要求输出",
    "operator": "op_205",
    "labelTime": "2026-05-11T06:15:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0147",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_201",
    "labelTime": "2026-05-16T06:22:00",
    "taskRound": "second_label"
  },
  {
    "sampleId": "PUCOT-0148",
    "label": "2 分 - CoT 无问题",
    "reason": "Step1/2/3 均无问题，CoT 完整且符合规则",
    "operator": "op_203",
    "labelTime": "2026-05-17T22:22:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0149",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中将参数详情中的 面料材质 误提到了 PU 层 ｜ Step3 中分析的属性 面料材质：亚麻，在 Step2 中未保留",
    "operator": "op_202",
    "labelTime": "2026-05-15T05:10:00",
    "taskRound": "first_label"
  },
  {
    "sampleId": "PUCOT-0150",
    "label": "1 分 - Step1 有逻辑错误",
    "reason": "Step1 中提取了 刷头数量：1刷杆+4刷头，信息源为 item 图，实际 item 图中 刷头数量 为 1刷杆+7刷头 ｜ Step3 中引用的规则 X.x「包装规格按净含量分类」不在规则库中",
    "operator": "op_201",
    "labelTime": "2026-05-19T00:08:00",
    "taskRound": "first_label"
  }
];

const qualityResultsData: QualityResultRecord[] = [
  {
    "sampleId": "PUCOT-0004",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0005",
    "originalLabel": "0 分 - Step1 有逻辑错误",
    "finalLabel": "1 分 - Step1 有逻辑错误",
    "isCorrect": false,
    "errorType": "关键信息缺失漏标",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0006",
    "originalLabel": "1 分 - Step1 有逻辑错误",
    "finalLabel": "1 分 - Step1 有逻辑错误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0008",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0011",
    "originalLabel": "1 分 - Step2 有幻觉",
    "finalLabel": "1 分 - Step2 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0012",
    "originalLabel": "1 分 - Step1 有关键信息缺失",
    "finalLabel": "1 分 - Step1 有关键信息缺失",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0017",
    "originalLabel": "类目不匹配-跳过",
    "finalLabel": "类目不匹配-跳过",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0019",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0020",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0022",
    "originalLabel": "类目不匹配-跳过",
    "finalLabel": "类目不匹配-跳过",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0023",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0027",
    "originalLabel": "类目不匹配-跳过",
    "finalLabel": "类目不匹配-跳过",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0029",
    "originalLabel": "1 分 - Step1 有逻辑错误",
    "finalLabel": "1 分 - Step1 有逻辑错误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0042",
    "originalLabel": "0 分 - Step3 引用规则有误",
    "finalLabel": "0 分 - Step3 引用规则有误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0046",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0049",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": false,
    "errorType": "关键信息缺失漏标",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0050",
    "originalLabel": "类目不匹配-跳过",
    "finalLabel": "类目不匹配-跳过",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0058",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": false,
    "errorType": "规则理解错误",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0062",
    "originalLabel": "1 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": false,
    "errorType": "幻觉/逻辑错误判定不一致",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0066",
    "originalLabel": "1 分 - Step3 有关键信息缺失",
    "finalLabel": "0 分 - Step3 有关键信息缺失",
    "isCorrect": false,
    "errorType": "幻觉/逻辑错误判定不一致",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0075",
    "originalLabel": "1 分 - Step3 引用规则有误",
    "finalLabel": "1 分 - Step3 引用规则有误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0079",
    "originalLabel": "1 分 - Step1 有逻辑错误",
    "finalLabel": "1 分 - Step1 有逻辑错误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0087",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0091",
    "originalLabel": "0 分 - Step3 引用规则有误",
    "finalLabel": "0 分 - Step3 引用规则有误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0092",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0099",
    "originalLabel": "1 分 - Step1 有关键信息缺失",
    "finalLabel": "1 分 - Step1 有关键信息缺失",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0105",
    "originalLabel": "2 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0111",
    "originalLabel": "1 分 - Step2 有关键信息缺失",
    "finalLabel": "1 分 - Step2 有关键信息缺失",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0121",
    "originalLabel": "类目不匹配-跳过",
    "finalLabel": "类目不匹配-跳过",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0122",
    "originalLabel": "1 分 - Step2 有幻觉",
    "finalLabel": "1 分 - Step2 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0123",
    "originalLabel": "1 分 - Step1 有逻辑错误",
    "finalLabel": "1 分 - Step1 有逻辑错误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0128",
    "originalLabel": "0 分 - Step3 引用规则有误",
    "finalLabel": "0 分 - Step3 引用规则有误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_b"
  },
  {
    "sampleId": "PUCOT-0130",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0132",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  },
  {
    "sampleId": "PUCOT-0133",
    "originalLabel": "1 分 - Step1 有关键信息缺失",
    "finalLabel": "1 分 - Step1 有关键信息缺失",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0136",
    "originalLabel": "1 分 - Step1 有幻觉",
    "finalLabel": "1 分 - Step1 有幻觉",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0145",
    "originalLabel": "1 分 - CoT 无问题",
    "finalLabel": "2 分 - CoT 无问题",
    "isCorrect": false,
    "errorType": "关键信息缺失漏标",
    "qualityReason": "一二标对该 CoT step 错误归因存在分歧",
    "reviewer": "qa_a"
  },
  {
    "sampleId": "PUCOT-0146",
    "originalLabel": "0 分 - Step3 推理有逻辑错误",
    "finalLabel": "0 分 - Step3 推理有逻辑错误",
    "isCorrect": true,
    "qualityReason": "二标复核一致",
    "reviewer": "qa_c"
  }
];

// -----------------------------------------------------------------------------
// 机审先验：CoT 评分模型 v0.3 的全量打分（动态合成，避免万行硬编码）
// 不同类目难度不同：
//   食品零食 / 母婴用品 → 模型相对稳定（高置信比例高、命中率 ≥ 0.9）
//   家居用品 / 个护小家电 → 中等
//   美妆护肤 / 数码配件 → 弱类目（结构属性多、规则细，模型置信和命中率明显下降）
// 仍然带 ~6% 的随机口径噪声，避免每条都是同样的 mock
// -----------------------------------------------------------------------------
const machineAuditResultsData: MachineAuditRecord[] = (function buildMachineAudit() {
  const CATEGORY_STRENGTH: Record<string, "strong" | "medium" | "weak"> = {
    食品零食: "strong",
    母婴用品: "strong",
    家居用品: "medium",
    个护小家电: "medium",
    美妆护肤: "weak",
    数码配件: "weak"
  };
  function rnd(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rnd(20260529);
  const out: MachineAuditRecord[] = [];
  for (const s of samplesData) {
    const cat = s.category ?? "未分类";
    const strength = CATEGORY_STRENGTH[cat] ?? "medium";
    const isHard = s.difficultyHint === "hard";

    // confidence 分布 —— puCot 整体偏「机审弱」：CoT 评分模型对过程归因把握有限，
    //   high(≥0.9)/mid(0.7-0.9)/low(<0.7) ≈ 25% / 40% / 35%，符合「机审比例低」的预期。
    const r = rand();
    let conf: number;
    if (strength === "strong") {
      conf = r < 0.42 ? 0.9 + rand() * 0.1 : r < 0.78 ? 0.7 + rand() * 0.2 : 0.4 + rand() * 0.3;
    } else if (strength === "medium") {
      conf = r < 0.22 ? 0.9 + rand() * 0.1 : r < 0.60 ? 0.7 + rand() * 0.2 : 0.4 + rand() * 0.3;
    } else {
      conf = r < 0.08 ? 0.9 + rand() * 0.1 : r < 0.36 ? 0.7 + rand() * 0.2 : 0.4 + rand() * 0.3;
    }
    if (isHard) conf = Math.max(0.4, conf - 0.18);

    // 模型预测的综合评分（0/1/2），匹配 gold 的概率因类目强度而异
    const gold = (s.raw?.gold_final_score as number | undefined) ?? 1;
    const correctP =
      strength === "strong" ? 0.92 : strength === "medium" ? 0.82 : 0.65;
    const correct = rand() < (isHard ? correctP - 0.1 : correctP);
    const otherScores = [0, 1, 2].filter((x) => x !== gold);
    const predicted = correct ? gold : otherScores[Math.floor(rand() * otherScores.length)];
    const machineLabel = `${predicted} 分（模型估计）`;

    // 与历史人工的一致性：80% 一致（强类目更高）
    const agreeP = strength === "strong" ? 0.92 : strength === "medium" ? 0.83 : 0.7;
    const historicalAgreement = rand() < agreeP;

    out.push({
      sampleId: s.id,
      machineLabel,
      confidence: Number(conf.toFixed(3)),
      modelVersion: "cot-eval-v0.3",
      machineReason: correct
        ? "Step1/Step2/Step3 错误归因与人工评分吻合"
        : "模型对 Step 错误归因与人工存在分歧，需人工复核",
      isHitRule: undefined,
      historicalAgreement
    });
  }
  return out;
})();

// -----------------------------------------------------------------------------
// 任务定义
// -----------------------------------------------------------------------------

export const puCotLabelingTask: EvaluationTask = {
  id: "task_pu_cot_labeling_demo",
  title: "PU 生产 CoT 标注 — 模型思维链过程维度评测",
  taskType: "evaluation",
  demandDescription: `PU（Product Understanding，商品理解结构化）生产任务中，模型按 4 个 step 的思维链（CoT）生成最终 PU 结果。除对最终 PU 做结果评测外，需要对模型 CoT 的**过程维度**做标注，分析模型在哪一步出现错误（信息提取 / 冲突消歧 / 结构编排），给算法团队提供优化方向。

## 业务目标
1. 为算法 PU 生产模型提供过程维度的错误归因数据，支撑模型优化；
2. 沉淀典型错误 Case（幻觉 / 逻辑错误 / 关键信息缺失 / 规则引用错误）作为模型训练 / 评测集；
3. 输出综合表现评分（0/1/2）+ 完整性 / 准确性 / 冗余度三组过程指标，作为模型迭代的关键指标；
4. 判断当前 CoT 标注任务是否值得继续投入大规模人工评测，以及哪些题型可以由 AI 预标。

## 任务范围
- 仅标注 Step1（信息提取）/ Step2（冲突消歧）/ Step3（结构编排）三个 step，Step4（同款补全）暂不标注；
- 每个 step 给出「是否正确」+ 多选错误类型 + 备注（必须包含位置 / 环节 / 关键属性 / V 值）；
- 单条平均耗时 **约 300 秒（5 分钟）**：要看 6 个信息源 + 规则文档 + 3 步 CoT 输出 + 备注填写；
- 总题目 12 道：1 道类目匹配 + 3×（是否正确 + 备注） + 1 道 PU 上线 + 1 道综合评分 + 3 道过程指标聚合。

## 希望 Agent 回答的问题
1. 这个 CoT 过程标注任务是否值得继续投入人工评测（Q1 价值）；
2. 12 道判定题哪些可由 AI 免审 / 预标 / 辅助 / 人工主判（Q2/Q3）；
3. 单条 300 秒的高成本是否能通过 AI 预标降到可接受范围；
4. 错误原因备注（Q3/Q5/Q7）是否真的必须人工填写，AI 是否能基于规则给出候选；
5. 综合评分 0/1/2（Q9）能否完全由前面题目自动聚合，不需人工判定？
6. 推荐承接方式：直接承接 / 试点承接 / AI 优先承接 / 改造后承接 / 人工主判 / 不建议承接？

## 前置已就绪（业务上下文清单）
- **决策方 / 责任方**：PU 算法团队（owner: pu_algo_team@taobao），与商品理解平台联合承接；
- **业务 KPI 目标**：将 PU 生产模型综合评分 (0/1/2) 中 2 分占比从当前 41% 提升至 ≥ 60%；Step1 幻觉率从 ~15% 降至 ≤ 8%；
- **本次评测的成功标准 (SLA)**：一二标分歧率 ≤ 8%、终审通过率 ≥ 92%、备注必须含位置/环节/关键属性/V 值四要素（缺一项判不合格）；
- **下游消费方**：① 算法团队（用于训练集 + 错误归因迭代）② 商品理解平台（用于线上 PU 质量监控） ③ 类目规则团队（用于补齐缺失规则）；
- **时间盒**：试点 150 条 7 天完成、放量 2000 条 21 天完成（含培训 + 试标 + 双标 + 终审）；
- **预算口径**：单条预算 ≤ ¥25（300s × 时薪 + 抽检 + 终审），AI 预标接入后单条目标降至 ¥10；
- **机审承接现状**：CoT 评分模型 v0.3 已对 150 条做全量打分，强类目（食品零食/母婴）命中率 0.92、弱类目（美妆护肤/数码配件）仅 0.65，且对自然语言备注（Q3/Q5/Q7）**完全无法承接** —— 因此整体任务必须以人工为主。

## 已知信息
- 样本：150 条 mock 数据（覆盖 6 类目 + 模型 3 步 CoT 输出 + 真值评分）；
- 历史标注：150 条人工评分（一标 / 二标 / 终审三轮，含约 5% 口径噪声）；
- 历史质检：38 条复盘记录；
- 机审先验：CoT 评分模型 v0.3 的全量打分（含 confidence + 与历史一致性），按类目强度差异化（食品零食 / 母婴较强；美妆护肤 / 数码配件较弱）。`,
  files: [ruleDoc, sopDoc, trainingDoc, screenshotDoc],
  sampleData: samplesData,
  historicalLabels: historicalLabelsData,
  qualityResults: qualityResultsData,
  machineAuditResults: machineAuditResultsData,
  capacityParams: {
    totalSampleCount: 2000,
    avgManualSecondsPerItem: 300,
    avgPrelabelConfirmSecondsPerItem: 120,
    qualitySamplingRatio: 0.1,
    effectiveWorkHoursPerPersonDay: 6,
    targetDeliveryDays: 21
  },
  createdAt: "2026-05-28T08:00:00.000Z",
  status: "draft"
};
