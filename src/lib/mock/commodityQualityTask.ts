// =============================================================================
// Mock 示例 1：大盘商品信息质量评测（巡检）
//
// 60 条手挑样本 + 真实品牌×品类映射 + 按题型差异化的机审命中率
//   - 无异常 18 / 品牌属性异常 8 / 品牌图属不一致 6 / 类目错放 6
//   - 标题堆砌作假 6 / 图片异常 5 / 商品一致性表达 4
//   - SKU 不可购 4 / 无效链接·废弃 3 = 60
// machineAudit 加权 accuracy ~74%；machineAuditPotential ~8/15；
// 落到 Q2=人机协同。
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
// 上传材料（业务规则、SOP、19 题清单、作业页面截图说明）—— 保留原版真实内容
// -----------------------------------------------------------------------------

const ruleDoc: UploadedFile = {
  id: "f_rule_dapan",
  name: "大盘商品评测标准_规则结构化摘要.md",
  type: "text/markdown",
  size: 1902,
  role: "rule_doc",
  contentText:
    "# 大盘商品信息质量评测 — 规则结构化摘要\n\n> 本文件依据《大盘商品评测标准（最新）》《大盘商品评测任务简介》《大盘商品巡检操作 SOP》三份原始材料整理；正式评估时仍以原始 PDF 为准。\n\n## 一、任务定义\n评测人员从消费者角度出发，判断商品展示信息与实际购买信息的准确性、一致性和可购买性。任务包含**商品维度**与 **SKU 维度** 两类题目。\n\n## 二、商品维度题目（13 题）\n1. **该题目是否废弃** — 商品下架 / 无法打开 / 闲鱼 / 拍卖等非正常商品；选废弃需备注原因。\n2. **是否为无效链接** — 补差链接、测试商品、直播间专属、盲盒专属；判定为无效后仍需正常判断其他题。\n3. **是否存在类目错放** — 商品实际信息应属 A 类目却放在 B 类目；可选：无 / 明显错放 / 无法确认。难点：相近类目、专业类目。\n4. **是否存在品牌属性异常** — 标题中品牌文本与品牌属性不一致。需结合品牌库、别名、共持有人、适用/兼容/联名豁免。\n5. **是否存在品牌图属不一致** — 主图实物 logo / 文字 / 品牌标识 与品牌属性不一致。难点：需图像识别 + 4.5w 品牌库 + 地理标志等豁免。\n6. **是否存在标题异常** — 标题含微信号 / 加 V / 引流。规则相对清晰。\n7. **长标题堆砌作假** — 标题与 SKU 交叉比对：标题列出 SKU 未覆盖的规格 / 品类 / 款式 / 型号 / 品牌。\n8. **导购标题堆砌作假** — 同 7，对比点位换成导购标题。\n9. **标题是否存在矛盾词堆砌** — 春夏 vs 秋冬、薄款 vs 加绒等表达冲突。\n10. **是否存在图片异常** — 中度牛皮癣 / 恶心图 / 外部引流 / 无商品主体 / AI 劣质主图 / 色情 / 全包边框 / 价格表述。视觉判断为主。\n11. **商品一致性表达异常** — 长标题 / 导购标题 / 摘要 / 主图 四方互查；默认一致，不冲突即一致。\n12. **商品信息不一致原因** — 填空题，记录上一题异常原因。\n13. **商品 SKU 图片中是否存在异常** — 置灰 SKU 不纳入判断；典型：SKU 图重复。\n\n## 三、SKU 维度题目（6 题）\n1. **商品是否无 SKU、可直接购买** — 无 SKU 或已下架，后续 SKU 题可跳过。\n2. **SKU 图是否存在异常** — 异常 / 无异常 / 无图。\n3. **SKU 图异常分类** — 无商品主体 / 商品主体过小 / 牛皮癣。\n4. **SKU 是否置灰** — 置灰 SKU 后续题跳过。\n5. **是否存在 SKU 异常** — 不可购（购买须知 / 勿拍 / 赠品 / 咨询客服 / 补差）/ 描述不清（套餐一 / 其他 / 0g）/ 无异常。\n6. **SKU 一致性是否异常** — 商详 SKU 是否与沉浸页商品信息表达一致（默认一致、不冲突一致、包含一致）。\n\n## 四、规则可判定性初判\n| 题型 | 规则可判定性 | AI 适配初判 | 备注 |\n|---|---|---|---|\n| 无效链接 | 高 | 高 | 关键词 + 页面状态明确 |\n| 标题异常·微信引流 | 高 | 高 | 文本规则 / LLM 易识别 |\n| 标题矛盾词堆砌 | 中 | 中 | 词典 + 上下文 |\n| 类目错放 | 中 | 中 | 依赖类目知识 + 主图理解 |\n| 品牌属性异常 | 中 | 中 | 依赖品牌库 + 别名豁免 |\n| 品牌图属不一致 | 中低 | 中 | 图像识别 + 品牌库 |\n| 长 / 导购标题堆砌作假 | 中 | 中 | 需标题与 SKU 交叉比对 |\n| 图片异常 | 中低 | 中 | 视觉判断较强 |\n| 商品一致性表达异常 | 中低 | 中 | 多源语义冲突判断 |\n| SKU 异常 / 不可购 | 中 | 中高 | 关键词与可购性判断 |\n| SKU 一致性 | 中低 | 中 | 商品信息与 SKU 综合比对 |\n\n## 五、已知规则冲突 / 缺口\n- 品牌豁免规则（适用 / 兼容 / 联名 / 周边）边界 Case 较多，老作业员理解不一致。\n- 品牌图属不一致依赖 4.5w 品牌库，但当前作业台未直接接入。\n- 标题堆砌作假规则在「标题包含但 SKU 不含」与「SKU 包含但标题不含」两个方向口径需进一步对齐。\n- 商品一致性表达异常的\"包含一致\"判定标准较主观，导致一二标分歧。\n"
};

const sopDoc: UploadedFile = {
  id: "f_sop_dapan",
  name: "大盘商品巡检操作SOP.md",
  type: "text/markdown",
  size: 709,
  role: "sop_doc",
  contentText:
    "# 大盘商品巡检操作 SOP（外包作业手册摘要）\n\n## 一、作业目标\n按\"商品维度 → SKU 维度\"顺序，逐题判定商品展示信息与可购买性的异常情况，并输出每题结论 + 总体 final_label + reason。\n\n## 二、作业流程\n1. 在审核台打开商品链接 → 检查商品是否废弃 / 无效链接（题 1-2）。\n2. 比对类目路径与主图、标题 → 判断类目错放（题 3）。\n3. 结合品牌属性、长 / 导购标题、主图 → 判断品牌属性异常、品牌图属不一致（题 4-5）。\n4. 检查标题文本 → 标题异常（题 6）、长 / 导购标题堆砌（题 7-8）、矛盾词堆砌（题 9）。\n5. 浏览主图 → 图片异常（题 10）。\n6. 综合四源 → 商品一致性表达异常 + 原因填空（题 11-12）。\n7. 浏览 SKU 图 → SKU 图异常 + 异常分类 + 置灰判定（题 1-4 SKU 维度）。\n8. 检查 SKU 文本可购性 → SKU 异常（题 5）。\n9. 与商详 SKU 比对沉浸页 → SKU 一致性（题 6）。\n\n## 三、单条耗时与人天估算\n- 单条目标耗时 75 秒（多题 + 主图 + SKU 浏览）。\n- 二标抽样比例 30%，终审抽样 10%。\n- 单人单日有效工时 6 小时 → 约 288 条 / 人天。\n\n## 四、易错点\n- 品牌库未接入作业台，靠人工经验判断品牌图属，错误率较高。\n- 商品一致性默认一致 / 不冲突一致 / 包含一致三档判定，主观空间大。\n- 类目错放需判定\"相近类目\"，需要类目知识图谱辅助。\n- SKU 一致性需要同时比对商详与沉浸页，操作步骤较多。\n"
};

const trainingDoc: UploadedFile = {
  id: "f_train_dapan",
  name: "大盘商品巡检_题目级AI适配清单.md",
  type: "text/markdown",
  size: 1234,
  role: "training_manual",
  contentText:
    "# 大盘商品巡检 — 19 题判定题清单（题目级 AI 适配预判）\n\n| # | 题目 | 维度 | 规则清晰度 | 期望承接方式 |\n|---|---|---|---|---|\n| Q1 | 该题目是否废弃 | 商品 | 高 | machine_auto |\n| Q2 | 是否为无效链接 | 商品 | 高 | machine_auto / ai_prefill |\n| Q3 | 是否存在类目错放 | 商品 | 中 | ai_assist |\n| Q4 | 是否存在品牌属性异常 | 商品 | 中 | ai_assist |\n| Q5 | 是否存在品牌图属不一致 | 商品 | 中低 | human_only |\n| Q6 | 是否存在标题异常（微信 / 加 V 引流） | 商品 | 高 | machine_auto / ai_prefill |\n| Q7 | 长标题堆砌造成作假 / 信息不实 | 商品 | 中 | ai_assist |\n| Q8 | 导购标题堆砌造成作假 / 信息不实 | 商品 | 中 | ai_assist |\n| Q9 | 标题是否存在矛盾词堆砌 | 商品 | 中 | ai_prefill |\n| Q10 | 是否存在图片异常（牛皮癣 / 恶心 / 引流 / 价格 / AI 劣质 / 边框…） | 商品 | 中低 | human_only |\n| Q11 | 商品一致性表达是否异常 | 商品 | 中低 | human_only |\n| Q12 | 商品信息不一致原因（填空） | 商品 | 低 | human_only |\n| Q13 | 商品 SKU 图片中是否存在异常（重复等） | SKU | 中 | ai_assist |\n| Q14 | 商品是否无 SKU、可直接购买 | SKU | 高 | machine_auto |\n| Q15 | SKU 图是否存在异常 | SKU | 中 | ai_assist |\n| Q16 | SKU 图异常分类（无主体 / 过小 / 牛皮癣） | SKU | 中低 | human_only |\n| Q17 | SKU 是否置灰 | SKU | 高 | machine_auto |\n| Q18 | 是否存在 SKU 异常（不可购 / 描述不清） | SKU | 中 | ai_prefill |\n| Q19 | SKU 一致性是否异常 | SKU | 中低 | ai_assist |\n\n## 题目级 AI 适配总览\n- **明确可机器化（machine_auto / ai_prefill）**：Q1、Q2、Q6、Q9、Q14、Q17、Q18 → 7 题；\n- **AI 预标 + 人工核对（ai_assist）**：Q3、Q4、Q7、Q8、Q13、Q15、Q19 → 7 题；\n- **必须人工（human_only）**：Q5、Q10、Q11、Q12、Q16 → 5 题。\n"
};

const screenshotDoc: UploadedFile = {
  id: "f_screenshot_dapan",
  name: "大盘巡检审核标注页面_截图说明.md",
  type: "text/markdown",
  size: 503,
  role: "screenshot",
  contentText:
    "# 大盘巡检审核标注页面（截图说明）\n\n## 页面整体结构\n三栏布局：\n1. **左栏 — 商品基础信息**：类目路径、长标题、结构化摘要。\n2. **中栏 — 商品展示信息**：关联品牌、商品链接、商品主图、查看全图入口。\n3. **右栏 — 做题区**：自上而下依次给出商品维度 13 题 + SKU 维度 6 题；存在单选、多选、联动题，部分题目根据上一题结果跳过。\n\n## 当前截图样例\n- 类目路径：女装 / 女士精品 < T 恤；\n- 长标题：日系美式复古 vintage 古早辣妹甜酷黑白印花斜肩不规则假两件上衣；\n- 结构化摘要：袖型·短袖 / 风格·辣妹风；\n- 关联品牌：null；\n- 主图：黑色短袖斜肩上衣 + 牛仔下装搭配图。\n\n## 对 Agent 的输入价值\n1. 人工作业需要同时浏览标题、类目、摘要、品牌、主图、商品链接，单条耗时较高。\n2. 右侧 19 题中存在联动题（如废弃 → 跳过后续），AI 预标可大幅降低人工节奏。\n3. 部分题目（无效链接、标题引流）规则清晰，适合 AI 免审；部分题目（品牌图属、主图异常、一致性表达）需要视觉与品牌库支撑，适合人工兜底。\n"
};

// -----------------------------------------------------------------------------
// 60 条样本 SEED —— 真实品牌×品类组合 + 9 类业务 case
// 每条 1 行表达核心字段，由 compileSamples() 展开成完整 SampleRecord
// -----------------------------------------------------------------------------

type Seed = {
  /** 用于 id：DPSP-0001…DPSP-0060 */
  i: number;
  brand: string;
  cate: string;
  title: string;
  showTitle: string;
  /** 主图 OCR 抽取出来的文字（关键：品牌图属判定的核心信号） */
  ocr: string;
  /** SKU 信息 */
  skuList: string[];
  /** 业务摘要 row_content */
  summary: string;
  /** 9 类异常之一 / 无异常 */
  label: string;
  riskType: string;
  difficultyHint: "easy" | "medium" | "hard";
  /** 业务侧解释（写到 historical reason） */
  note?: string;
  /** 主图 URL 后缀（让 60 条都有不同 url） */
  pic?: string;
};

const SAMPLES: Seed[] = [
  // ===== 组 1：无异常（18 条）— 品牌、类目、标题、SKU、主图 OCR 全部一致 =====
  { i: 1, brand: "优衣库", cate: "服装/男装/T恤", title: "优衣库 男士纯棉圆领短袖T恤 白色 春夏新款", showTitle: "优衣库纯棉圆领短袖T恤 白色", ocr: "UNIQLO 100% COTTON T-SHIRT", skuList: ["S 白色", "M 白色", "L 白色", "XL 白色"], summary: "材质·纯棉 / 领型·圆领 / 风格·基础款", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 2, brand: "优衣库", cate: "服装/男装/卫衣", title: "优衣库 男士摇粒绒落肩长袖卫衣 灰色", showTitle: "优衣库摇粒绒落肩卫衣", ocr: "UNIQLO FLEECE PULLOVER", skuList: ["M 灰色", "L 灰色", "XL 灰色"], summary: "材质·摇粒绒 / 风格·基础", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 3, brand: "无印良品", cate: "服装/居家服/睡衣", title: "无印良品 法兰绒方格家居睡衣两件套 男女款", showTitle: "无印良品法兰绒睡衣两件套", ocr: "MUJI HOMEWEAR FLANNEL", skuList: ["M 蓝格", "L 蓝格", "M 灰格", "L 灰格"], summary: "材质·法兰绒 / 风格·居家", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 4, brand: "ZARA", cate: "服装/女装/连衣裙", title: "ZARA 女装春季法式碎花收腰连衣裙 中长款", showTitle: "ZARA法式碎花连衣裙", ocr: "ZARA WOMAN SS COLLECTION", skuList: ["S 碎花", "M 碎花", "L 碎花"], summary: "材质·混纺 / 风格·法式", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 5, brand: "美的", cate: "家用电器/厨房电器/电饭煲", title: "美的 智能电饭煲 4L 大容量 一键预约", showTitle: "美的智能电饭煲 4L", ocr: "Midea 4L 智能IH 一键预约", skuList: ["白色 4L"], summary: "容量·4L / 功能·智能IH", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 6, brand: "海尔", cate: "家用电器/大家电/洗衣机", title: "海尔 滚筒洗衣机 10kg 变频静音 智能投放", showTitle: "海尔10kg滚筒洗衣机", ocr: "Haier 10kg 变频 智能投放", skuList: ["银色 10kg"], summary: "容量·10kg / 类型·滚筒", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 7, brand: "苏泊尔", cate: "家用电器/厨房电器/炒锅", title: "苏泊尔 不粘炒锅 32cm 物理不粘 燃气电磁通用", showTitle: "苏泊尔不粘炒锅32cm", ocr: "SUPOR 32cm 物理不粘", skuList: ["32cm 黑色"], summary: "规格·32cm / 功能·不粘", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 8, brand: "九阳", cate: "家用电器/厨房电器/破壁机", title: "九阳 破壁料理机 加热静音 多功能", showTitle: "九阳破壁料理机", ocr: "Joyoung 破壁料理 1.75L", skuList: ["银色 1.75L"], summary: "容量·1.75L / 功能·加热", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 9, brand: "飞利浦", cate: "家用电器/个护健康/电动牙刷", title: "飞利浦 电动牙刷 HX6730 充电式 成人款", showTitle: "飞利浦电动牙刷HX6730", ocr: "Philips Sonicare HX6730", skuList: ["白色 HX6730"], summary: "类型·声波 / 充电·USB", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 10, brand: "李宁", cate: "运动鞋new/跑步鞋", title: "李宁 男款轻便透气网面跑步鞋 减震耐磨", showTitle: "李宁轻便跑步鞋 男款", ocr: "LI-NING RUNNING 减震科技", skuList: ["40 黑", "41 黑", "42 黑", "43 黑"], summary: "类型·跑鞋 / 鞋面·网面", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 11, brand: "安踏", cate: "运动鞋new/慢跑鞋", title: "安踏 男女款轻便慢跑鞋 春夏新款 透气网面", showTitle: "安踏轻便慢跑鞋", ocr: "ANTA RUNNING SS NEW", skuList: ["39 灰", "40 灰", "41 灰", "42 灰"], summary: "类型·慢跑 / 鞋面·网面", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 12, brand: "NIKE", cate: "运动鞋new/休闲鞋", title: "NIKE Air Max 270 男款气垫休闲运动鞋", showTitle: "NIKE Air Max 270", ocr: "NIKE AIR MAX 270 BLACK", skuList: ["41 黑", "42 黑", "43 黑"], summary: "技术·Air Max / 风格·休闲", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 13, brand: "三只松鼠", cate: "食品/零食/坚果", title: "三只松鼠 每日坚果混合装 30天装 健康零食", showTitle: "三只松鼠每日坚果30天装", ocr: "三只松鼠 每日坚果 30天装", skuList: ["750g 礼盒"], summary: "规格·30天 / 类型·混合坚果", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 14, brand: "良品铺子", cate: "食品/零食/肉脯", title: "良品铺子 猪肉脯 100g 休闲零食", showTitle: "良品铺子猪肉脯100g", ocr: "良品铺子 猪肉脯 100g", skuList: ["原味 100g", "蜜汁 100g"], summary: "规格·100g / 口味·原味/蜜汁", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 15, brand: "雅诗兰黛", cate: "美容护肤/精华", title: "雅诗兰黛 小棕瓶肌透修护精华 50ml", showTitle: "雅诗兰黛小棕瓶精华50ml", ocr: "ESTÉE LAUDER ADVANCED NIGHT 50ml", skuList: ["50ml 正装"], summary: "容量·50ml / 系列·小棕瓶", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 16, brand: "资生堂", cate: "美容护肤/精华", title: "资生堂 红妍肌活精华 50ml 紧致提亮", showTitle: "资生堂红妍肌活精华50ml", ocr: "SHISEIDO ULTIMUNE 50ml", skuList: ["50ml 正装"], summary: "容量·50ml / 功效·提亮", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 17, brand: "联想", cate: "3C数码/笔记本电脑", title: "联想 拯救者 R9000P 游戏笔记本 16英寸 RTX4060", showTitle: "联想拯救者R9000P 16英寸", ocr: "Lenovo LEGION R9000P RTX4060", skuList: ["16G+512G", "32G+1T"], summary: "屏幕·16寸 / 显卡·4060", label: "无异常", riskType: "无异常", difficultyHint: "easy" },
  { i: 18, brand: "百草味", cate: "食品/零食/果脯", title: "百草味 芒果干 100g 厚切大片 蜜饯果脯", showTitle: "百草味芒果干100g", ocr: "百草味 芒果干 100g", skuList: ["100g 单袋", "200g 两袋"], summary: "规格·100g / 类型·果脯", label: "无异常", riskType: "无异常", difficultyHint: "easy" },

  // ===== 组 2：品牌属性异常（8 条）— 标题写 A 品牌，brand 属性是 B / 无授权 =====
  { i: 19, brand: "南极人", cate: "服装/男装/T恤", title: "【优衣库同款】男士纯棉短袖T恤 多色可选 春夏新款", showTitle: "优衣库同款T恤", ocr: "Nan Ji Ren COTTON BASIC", skuList: ["M 白", "L 白", "M 黑"], summary: "材质·纯棉 / 风格·基础款", label: "品牌属性异常-标题盗用品牌词", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题首词\"优衣库同款\"为品牌词盗用；品牌属性应为南极人" },
  { i: 20, brand: "美的", cate: "运动鞋new/慢跑鞋", title: "美的 春夏新款 男士轻便透气慢跑鞋 减震耐磨", showTitle: "美的慢跑鞋 男款", ocr: "Midea SPORT RUNNING", skuList: ["41 黑", "42 黑"], summary: "类型·跑鞋 / 鞋面·网面", label: "品牌属性异常-品牌跨品类无授权", riskType: "品牌属性异常", difficultyHint: "medium", note: "美的为家电品牌；运动鞋类目下无品牌授权" },
  { i: 21, brand: "无品牌", cate: "3C数码/手机配件/数据线", title: "【Apple原装】USB-C 转 Lightning 数据线 1m 快充", showTitle: "Apple原装数据线1m", ocr: "Made for iPhone Compatible", skuList: ["1m 白色"], summary: "接口·USB-C转Lightning / 长度·1m", label: "品牌属性异常-标题用品牌词无授权", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题写\"Apple原装\"但 brand_name 为\"无品牌\"，疑似仿冒" },
  { i: 22, brand: "无品牌", cate: "家用电器/个护健康/剃须刀", title: "【小米同款】电动剃须刀 USB充电 三刀头", showTitle: "小米同款剃须刀", ocr: "USB CHARGE 3-Head", skuList: ["黑色 USB"], summary: "充电·USB / 刀头·3", label: "品牌属性异常-品牌词擦边", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题用\"小米同款\"擦边，品牌属性为空" },
  { i: 23, brand: "未知品牌", cate: "家用电器/小家电/吹风机", title: "【飞利浦联名】负离子大功率吹风机 速干静音", showTitle: "飞利浦联名吹风机", ocr: "Negative Ion Hair Dryer 2000W", skuList: ["白色 2000W"], summary: "功率·2000W / 功能·负离子", label: "品牌属性异常-虚假联名", riskType: "品牌属性异常", difficultyHint: "hard", note: "标题声称\"飞利浦联名\"但品牌库无该联名授权记录" },
  { i: 24, brand: "无品牌", cate: "运动鞋new/篮球鞋", title: "【NIKE代购】气垫篮球鞋 全明星款 男士", showTitle: "NIKE代购篮球鞋", ocr: "AIR CUSHION BASKETBALL", skuList: ["42 黑红", "43 黑红"], summary: "技术·气垫 / 风格·篮球", label: "品牌属性异常-代购无授权", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题写\"NIKE代购\"但 brand_name 为\"无品牌\"" },
  { i: 25, brand: "蓝月亮", cate: "家用电器/大家电/洗衣机", title: "【海尔品质】滚筒全自动洗衣机 8kg 静音变频", showTitle: "海尔品质洗衣机8kg", ocr: "8kg AUTOMATIC WASHER", skuList: ["白色 8kg"], summary: "容量·8kg / 类型·滚筒", label: "品牌属性异常-标题碰瓷品牌", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题写\"海尔品质\"但实际 brand_name 是\"蓝月亮\"，跨类目错放 + 品牌词碰瓷" },
  { i: 26, brand: "无品牌", cate: "食品/零食/坚果", title: "【百草味同源】每日坚果混合装 30天", showTitle: "百草味同源每日坚果", ocr: "DAILY NUTS MIX 30 DAYS", skuList: ["750g 礼盒"], summary: "规格·30天 / 类型·混合坚果", label: "品牌属性异常-假同源声明", riskType: "品牌属性异常", difficultyHint: "medium", note: "标题写\"百草味同源\"但无授权" },

  // ===== 组 3：品牌图属不一致（6 条）— brand 属性正确，但主图 OCR / 主图 logo 显示别的品牌 =====
  { i: 27, brand: "美的", cate: "家用电器/小家电/吹风机", title: "美的 负离子吹风机 1800W 速干静音", showTitle: "美的负离子吹风机1800W", ocr: "GREE COOL DRY HAIR DRYER", skuList: ["白色 1800W"], summary: "功率·1800W / 功能·负离子", label: "品牌图属不一致-主图logo冲突", riskType: "品牌图属不一致", difficultyHint: "hard", note: "标题与品牌属性都是美的，但主图 OCR 出现格力 GREE logo" },
  { i: 28, brand: "优衣库", cate: "服装/男装/休闲裤", title: "优衣库 男士直筒休闲裤 弹力舒适 春夏新款", showTitle: "优衣库男士休闲裤", ocr: "BALENO COTTON CASUAL PANTS", skuList: ["M 卡其", "L 卡其", "M 黑色"], summary: "材质·棉 / 风格·休闲", label: "品牌图属不一致-主图为班尼路logo", riskType: "品牌图属不一致", difficultyHint: "hard", note: "标题、brand 都是优衣库，但主图 OCR 显示班尼路（BALENO）" },
  { i: 29, brand: "Apple", cate: "3C数码/平板电脑", title: "Apple iPad 10 64GB WIFI版 平板电脑", showTitle: "iPad 10 64GB WIFI", ocr: "ANDROID 13 TABLET PC", skuList: ["64GB 银色", "64GB 灰色"], summary: "容量·64G / 联网·WIFI", label: "品牌图属不一致-主图非苹果系统", riskType: "品牌图属不一致", difficultyHint: "hard", note: "标题与品牌都是 Apple，主图 OCR 显示 Android 13 系统截图" },
  { i: 30, brand: "NIKE", cate: "运动鞋new/篮球鞋", title: "NIKE Air Jordan 1 男款篮球鞋 经典配色", showTitle: "Air Jordan 1 男款", ocr: "ADIDAS ULTRABOOST RUNNING", skuList: ["41 红黑", "42 红黑"], summary: "类型·篮球 / 经典·AJ1", label: "品牌图属不一致-主图为对家品牌", riskType: "品牌图属不一致", difficultyHint: "hard", note: "标题与品牌都是 NIKE，但主图 OCR 显示 ADIDAS ULTRABOOST" },
  { i: 31, brand: "雅诗兰黛", cate: "美容护肤/口红", title: "雅诗兰黛 倾慕丝绒哑光口红 333号 经典正红", showTitle: "雅诗兰黛丝绒口红333", ocr: "PERFECT DIARY MATTE LIPSTICK", skuList: ["333 正红"], summary: "色号·333 / 质地·丝绒", label: "品牌图属不一致-主图为完美日记", riskType: "品牌图属不一致", difficultyHint: "hard", note: "标题与品牌都是雅诗兰黛，主图 OCR 显示 PERFECT DIARY" },
  { i: 32, brand: "飞利浦", cate: "家用电器/小家电/咖啡机", title: "飞利浦 全自动意式浓缩咖啡机 现磨", showTitle: "飞利浦全自动咖啡机", ocr: "(无品牌 logo)", skuList: ["黑色"], summary: "类型·全自动 / 功能·现磨", label: "品牌图属不一致-主图缺logo", riskType: "品牌图属不一致", difficultyHint: "medium", note: "标题与品牌都是飞利浦，但主图为简陋灰底图，未见任何 logo（应有却缺失）" },

  // ===== 组 4：类目错放（6 条）— 商品本质属于 A 类目，却被放到相近 B 类目 =====
  { i: 33, brand: "美的", cate: "家用电器/个护小家电/吹风机", title: "美的 智能电饭煲 4L 大容量 一键预约", showTitle: "美的电饭煲4L", ocr: "Midea 4L Smart Rice Cooker", skuList: ["白色 4L"], summary: "容量·4L / 类型·电饭煲", label: "类目错放-电饭煲放在吹风机类目", riskType: "类目错放", difficultyHint: "medium", note: "实际为电饭煲，应放\"厨房电器\"，错放\"个护小家电\"" },
  { i: 34, brand: "美赞臣", cate: "食品/乳制品/成人奶粉", title: "美赞臣 蓝臻 婴儿配方奶粉 1段 0-6月 800g", showTitle: "美赞臣蓝臻1段800g", ocr: "Mead Johnson Stage 1 INFANT 800g", skuList: ["800g 1段"], summary: "阶段·1段 / 规格·800g", label: "类目错放-婴儿奶粉放成人乳类目", riskType: "类目错放", difficultyHint: "medium", note: "实际婴幼儿配方奶粉，应放\"母婴/奶粉\"" },
  { i: 35, brand: "始祖鸟", cate: "服装/女装/风衣", title: "始祖鸟 男士GTX硬壳冲锋衣 防风防水 春夏户外", showTitle: "始祖鸟男士冲锋衣 GTX", ocr: "ARC'TERYX GORE-TEX MENS", skuList: ["M 黑色", "L 黑色"], summary: "材质·GTX / 类型·冲锋衣", label: "类目错放-男冲锋衣放女装风衣", riskType: "类目错放", difficultyHint: "medium", note: "实际为男士冲锋衣，应放\"户外/冲锋衣\"，错放女装/风衣" },
  { i: 36, brand: "华为", cate: "3C数码/数码影音/电子书阅读器", title: "华为 MatePad 11 平板电脑 8+128G WIFI 全面屏", showTitle: "华为MatePad 11 平板", ocr: "HUAWEI MatePad 11 WIFI", skuList: ["8+128G"], summary: "屏幕·11寸 / 配置·8+128", label: "类目错放-平板放电子书阅读器", riskType: "类目错放", difficultyHint: "medium", note: "实际平板电脑，应放\"3C/平板电脑\"" },
  { i: 37, brand: "张小泉", cate: "户外/野营装备/军刀", title: "张小泉 厨房菜刀 不锈钢切片刀 家用刀具", showTitle: "张小泉切片菜刀", ocr: "张小泉 切片刀 厨房刀具", skuList: ["不锈钢 1把"], summary: "用途·厨房切片 / 材质·不锈钢", label: "类目错放-厨房菜刀放户外军刀", riskType: "类目错放", difficultyHint: "easy", note: "实际厨房刀具，应放\"厨房用品/刀具\"" },
  { i: 38, brand: "全棉时代", cate: "美容护肤/化妆棉", title: "全棉时代 婴儿手口柔湿巾 80抽 6包装", showTitle: "全棉时代婴儿湿巾80抽", ocr: "PurCotton BABY WIPES 80×6", skuList: ["6包 480抽"], summary: "类型·婴儿湿巾 / 规格·80×6", label: "类目错放-婴儿湿巾放化妆棉", riskType: "类目错放", difficultyHint: "medium", note: "实际母婴湿巾，应放\"母婴/湿巾\"" },

  // ===== 组 5：标题堆砌作假（6 条）— 标题列多种规格/颜色，SKU 实际不覆盖 =====
  { i: 39, brand: "波司登", cate: "服装/男装/羽绒服", title: "波司登 男士羽绒服 红色蓝色绿色黄色黑色白色多色可选 长款短款均有", showTitle: "波司登羽绒服 多色多款", ocr: "BOSIDENG DOWN JACKET BLACK", skuList: ["L 黑色 短款"], summary: "类型·羽绒服 / 实际单款", label: "长标题堆砌作假-标题信息未在SKU全部出现", riskType: "长标题堆砌作假", difficultyHint: "medium", note: "标题写6色+长短款，SKU 只有L黑色短款" },
  { i: 40, brand: "李宁", cate: "服装/男装/运动套装", title: "李宁 男士运动套装 春夏 S M L XL XXL XXXL 全码段可选", showTitle: "李宁运动套装 全码", ocr: "LI-NING SPORT SET", skuList: ["L 灰色"], summary: "类型·运动套装", label: "长标题堆砌作假-标题信息未在SKU全部出现", riskType: "长标题堆砌作假", difficultyHint: "medium", note: "标题列6个码，SKU只有L灰" },
  { i: 41, brand: "九阳", cate: "家用电器/厨房电器/料理机", title: "九阳 破壁料理机 含 3 件套配件豪华装 加热静音 多功能", showTitle: "九阳破壁机 含3件套", ocr: "Joyoung 破壁机 主机", skuList: ["主机 1台"], summary: "类型·破壁机 / 单主机", label: "长标题堆砌作假-标题虚假赠品宣称", riskType: "长标题堆砌作假", difficultyHint: "medium", note: "标题写含3件套豪华装，SKU只有主机1台、无赠品" },
  { i: 42, brand: "完美日记", cate: "美容护肤/口红", title: "完美日记 哑光口红 送收纳包+绒布袋+小样3件 限时活动", showTitle: "完美日记口红送收纳包绒布袋小样", ocr: "PERFECT DIARY MATTE LIP", skuList: ["#316 单支"], summary: "色号·316 / 质地·哑光", label: "导购标题堆砌作假-虚假赠品", riskType: "导购标题堆砌作假", difficultyHint: "medium", note: "标题写送3赠品，SKU只有口红单支无赠品" },
  { i: 43, brand: "无印良品", cate: "服装/家居服/睡衣", title: "无印良品 法兰绒睡衣 含全套配件 含枕头眼罩拖鞋袜子全套", showTitle: "无印良品睡衣 含全套配件", ocr: "MUJI HOMEWEAR FLANNEL", skuList: ["M 灰格 仅睡衣"], summary: "类型·睡衣 / 仅睡衣无配件", label: "导购标题堆砌作假-虚假配件", riskType: "导购标题堆砌作假", difficultyHint: "medium", note: "标题写含全套配件，SKU只有睡衣" },
  { i: 44, brand: "金士顿", cate: "3C数码/存储设备/U盘", title: "金士顿 U盘 32G 64G 128G 256G 512G 1T 全容量可选", showTitle: "金士顿U盘 多容量可选", ocr: "Kingston USB 3.0 32G", skuList: ["32G 黑色"], summary: "类型·U盘 / 容量·32G", label: "长标题堆砌作假-标题虚列容量规格", riskType: "长标题堆砌作假", difficultyHint: "easy", note: "标题列6种容量，SKU仅32G" },

  // ===== 组 6：图片异常（5 条）— 主图含违规元素 =====
  { i: 45, brand: "无品牌", cate: "服装/女装/上衣", title: "韩版宽松显瘦短袖T恤 春夏新款 多色可选", showTitle: "韩版宽松短袖T恤", ocr: "加微信领50元优惠券：abc123 长按二维码", skuList: ["M 白色", "L 白色"], summary: "材质·棉 / 风格·韩版", label: "图片异常-主图含外部引流二维码", riskType: "图片异常", difficultyHint: "easy", note: "主图带\"加微信领优惠券+二维码\"" },
  { i: 46, brand: "AI造图", cate: "服装/女装/连衣裙", title: "夏季新款连衣裙 优雅气质 显瘦修身", showTitle: "夏季新款连衣裙", ocr: "(模特手指有6根 / 衣服褶皱诡异)", skuList: ["S 白色", "M 白色"], summary: "材质·雪纺 / 风格·气质", label: "图片异常-AI劣质生成主图", riskType: "图片异常", difficultyHint: "hard", note: "主图为 AI 生成图，模特手指畸形" },
  { i: 47, brand: "雪花啤酒", cate: "食品/酒水/啤酒", title: "雪花纯生啤酒 整箱 500ml*12罐", showTitle: "雪花纯生500ml*12罐", ocr: "¥99/箱 限时秒杀 立即抢购", skuList: ["500ml×12罐"], summary: "规格·500ml*12", label: "图片异常-主图被价格表覆盖", riskType: "图片异常", difficultyHint: "medium", note: "主图被大幅度价格促销文字覆盖" },
  { i: 48, brand: "无品牌", cate: "家居/家纺/抱枕", title: "解压猎奇抱枕 沙发靠垫 多款可选", showTitle: "解压猎奇抱枕", ocr: "(主图含血浆图案)", skuList: ["1个 红色"], summary: "类型·抱枕 / 风格·猎奇", label: "图片异常-主图含恶心血腥元素", riskType: "图片异常", difficultyHint: "easy", note: "主图含血浆/恶心元素" },
  { i: 49, brand: "无品牌", cate: "美容护肤/面膜", title: "童颜补水面膜 紧致提亮 7天速效", showTitle: "童颜面膜 7天速效", ocr: "★限时9.9★全网最低★抢★", skuList: ["10片装"], summary: "规格·10片 / 功效·补水", label: "图片异常-主图全包黑红边框", riskType: "图片异常", difficultyHint: "easy", note: "主图被大红大黑全包边框 + 价格表述覆盖" },

  // ===== 组 7：商品一致性表达异常（4 条）— 标题/摘要/主图三方语义冲突 =====
  { i: 50, brand: "优衣库", cate: "服装/男装/T恤", title: "优衣库 男士纯棉短袖T恤 多色可选", showTitle: "优衣库纯棉短袖T恤", ocr: "UNIQLO LONG SLEEVE 100% COTTON", skuList: ["M 灰色长袖"], summary: "材质·纯棉 / 袖长·长袖", label: "商品一致性表达异常-袖长冲突", riskType: "商品一致性表达异常", difficultyHint: "medium", note: "标题说短袖，摘要写长袖，主图也是长袖" },
  { i: 51, brand: "波司登", cate: "服装/男装/外套", title: "波司登 男士春夏薄款外套 透气清凉", showTitle: "波司登春夏薄款外套", ocr: "BOSIDENG 加绒加厚冬季款 90% 鸭绒", skuList: ["L 黑色加绒"], summary: "季节·冬款 / 加绒加厚", label: "商品一致性表达异常-季节冲突", riskType: "商品一致性表达异常", difficultyHint: "medium", note: "标题写春夏薄款，摘要/主图都是冬款加绒" },
  { i: 52, brand: "苏泊尔", cate: "家居/餐具/碗", title: "苏泊尔 高档陶瓷餐碗 4个装 礼盒装", showTitle: "苏泊尔陶瓷餐碗4个装", ocr: "SUPOR 304 STAINLESS STEEL BOWL", skuList: ["不锈钢 4个"], summary: "材质·不锈钢 / 规格·4个", label: "商品一致性表达异常-材质冲突", riskType: "商品一致性表达异常", difficultyHint: "medium", note: "标题陶瓷，主图/SKU 都是不锈钢" },
  { i: 53, brand: "无品牌", cate: "服装/男装/T恤", title: "原装正品 100%纯棉 男士基础短袖T恤", showTitle: "原装正品纯棉T恤", ocr: "出口残次品 工厂尾货 不退不换", skuList: ["L 白色 残次"], summary: "类型·尾货残次 / 不退换", label: "商品一致性表达异常-正品声明与残次冲突", riskType: "商品一致性表达异常", difficultyHint: "medium", note: "标题原装正品，摘要/主图标明残次品工厂尾货" },

  // ===== 组 8：SKU 异常·不可购（4 条）— SKU 名直接表达"不能买" =====
  { i: 54, brand: "美的", cate: "家用电器/厨房电器/电饭煲", title: "美的 智能电饭煲 4L 大容量", showTitle: "美的电饭煲4L", ocr: "Midea 4L 智能IH", skuList: ["勿拍 联系客服", "白色 4L"], summary: "SKU·包含勿拍款", label: "SKU异常-不可购/勿拍联系客服", riskType: "SKU异常", difficultyHint: "easy", note: "SKU 列表首项\"勿拍 联系客服\"" },
  { i: 55, brand: "Apple", cate: "3C数码/手机配件/数据线", title: "Apple 原装 USB-C 转 Lightning 数据线 1m", showTitle: "Apple原装数据线1m", ocr: "Apple USB-C to Lightning 1m", skuList: ["1m 白色", "样品 不发货"], summary: "SKU·含样品款", label: "SKU异常-描述不清/样品不发货", riskType: "SKU异常", difficultyHint: "easy", note: "SKU 含\"样品 不发货\"" },
  { i: 56, brand: "九阳", cate: "家用电器/厨房电器/破壁机", title: "九阳 破壁料理机 加热静音 多功能", showTitle: "九阳破壁料理机", ocr: "Joyoung 破壁料理 1.75L", skuList: ["主机 1台", "0.01元补差价"], summary: "SKU·含补差价款", label: "SKU异常-不可购/补差价款", riskType: "SKU异常", difficultyHint: "easy", note: "SKU 含\"0.01元补差价\"" },
  { i: 57, brand: "雅诗兰黛", cate: "美容护肤/精华", title: "雅诗兰黛 小棕瓶肌透修护精华 50ml", showTitle: "雅诗兰黛小棕瓶精华50ml", ocr: "ESTÉE LAUDER ADVANCED NIGHT 50ml", skuList: ["50ml 正装", "赠品 单拍不发"], summary: "SKU·含赠品款", label: "SKU异常-不可购/赠品单拍", riskType: "SKU异常", difficultyHint: "easy", note: "SKU 含\"赠品 单拍不发\"" },

  // ===== 组 9：无效链接 / 废弃（3 条）=====
  { i: 58, brand: "无品牌", cate: "服装/男装/T恤", title: "[已下架] 男士纯棉短袖T恤 多色多款", showTitle: "已下架商品", ocr: "(404 商品已下架)", skuList: [], summary: "状态·已下架", label: "无效链接-商品已下架", riskType: "无效链接", difficultyHint: "easy", note: "页面 404，商品已下架" },
  { i: 59, brand: "闲鱼用户", cate: "二手/闲置", title: "【闲鱼拍卖】iPhone 13 Pro 二手 95新 起拍价1元", showTitle: "iPhone13Pro 闲鱼拍卖", ocr: "闲鱼 拍卖 起拍1元", skuList: ["1台 95新"], summary: "类型·闲鱼拍卖", label: "废弃-闲鱼拍卖链接非正常商品", riskType: "废弃", difficultyHint: "easy", note: "为闲鱼拍卖链接，非正常电商商品" },
  { i: 60, brand: "无品牌", cate: "服装/女装/上衣", title: "【主播专属】粉丝福利价 直播间下单 拍前咨询客服", showTitle: "主播专属粉丝福利价", ocr: "直播间专属 拍前联系客服", skuList: ["L 仅直播下单"], summary: "类型·直播专属", label: "无效链接-直播间专属链接", riskType: "无效链接", difficultyHint: "easy", note: "标题与 SKU 均明示直播间专属，普通用户不可购" }
];

// -----------------------------------------------------------------------------
// 把 SEED 展开成完整 SampleRecord[]
// -----------------------------------------------------------------------------

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

const samplesData: SampleRecord[] = SAMPLES.map((seed) => {
  const id = `DPSP-${pad4(seed.i)}`;
  const itemId = `840000${String(800000 + seed.i).padStart(7, "0")}`;
  const picUrl = `https://img.mock.taobao.com/main/${itemId}.jpg`;
  // 取大类（一级类目）作为 category 字段（与 trial / segmentation 一致）
  const category = seed.cate.split("/")[0] || "未分类";
  const raw: Record<string, any> = {
    sample_id: id,
    item_id: itemId,
    main_pic: picUrl,
    main_pic_ocr: seed.ocr,
    cate_full_name: seed.cate,
    title: seed.title,
    show_title: seed.showTitle,
    row_content: seed.summary,
    url: `https://item.taobao.com/item.htm?id=${itemId}`,
    brand_name: seed.brand,
    sku_count: seed.skuList.length,
    sku_list: seed.skuList,
    priority_sku_id: seed.skuList.length > 0 ? `${itemId}01` : undefined,
    business_line: "搜索质量",
    mock_batch: "大盘巡检-DEMO-202605"
  };
  return {
    id,
    raw,
    textFields: {
      title: seed.title,
      show_title: seed.showTitle,
      row_content: seed.summary,
      cate_full_name: seed.cate,
      brand_name: seed.brand,
      main_pic_ocr: seed.ocr,
      sku_list: seed.skuList.join(" / ") || "(空)"
    },
    imageFields: {
      main_pic: picUrl
    },
    category,
    label: seed.label,
    riskType: seed.riskType,
    difficultyHint: seed.difficultyHint,
    /** 给 trial 用的简化粗粒度 label */
    trialGoldLabel: toBucket(seed.label)
  };
});

function toBucket(label: string): string {
  if (label.startsWith("无异常")) return "无异常";
  if (label.startsWith("品牌属性异常")) return "品牌属性异常";
  if (label.startsWith("品牌图属不一致")) return "品牌图属不一致";
  if (label.startsWith("类目错放")) return "类目错放";
  if (label.startsWith("长标题堆砌作假") || label.startsWith("导购标题堆砌作假")) return "标题堆砌作假";
  if (label.startsWith("图片异常")) return "图片异常";
  if (label.startsWith("商品一致性表达异常")) return "商品一致性表达异常";
  if (label.startsWith("SKU异常")) return "SKU异常";
  if (label.startsWith("无效链接") || label.startsWith("废弃")) return "无效链接/废弃";
  return "其他异常";
}

// -----------------------------------------------------------------------------
// 60 条样本对应的历史标注（first_label / second_label / final_review）
//   - 全部 60 条 first_label（一标）
//   - 18 条 second_label（二标抽样 30%）：含 4 条与一标分歧
//   - 6 条 final_review（终审抽样 10%）
// -----------------------------------------------------------------------------

const OPERATORS = ["王某某", "李某某", "张某某", "陈某某", "刘某某", "周某某"];
const REVIEWERS = ["质检A", "质检B"];

const SECOND_LABEL_INDICES = new Set<number>([
  // 与一标一致的（14 条）
  1, 5, 10, 13, 15, 17, 18, 27, 33, 39, 45, 50, 54, 58,
  // 与一标分歧的（4 条）— 在 secondLabelOverride 里改 label
  21, 23, 28, 31
]);

const SECOND_LABEL_OVERRIDE: Record<number, string> = {
  21: "品牌属性异常-标题用品牌词擦边(轻)", // 一标：标题用品牌词无授权 → 二标：擦边但未直接侵权
  23: "需补充材料-联名授权待核",          // 一标：虚假联名 → 二标：建议补充授权材料后再判
  28: "无异常",                          // 一标：品牌图属不一致 → 二标：班尼路 logo 实为同集团关联（争议）
  31: "无异常"                           // 一标：品牌图属不一致 → 二标：完美日记 logo 实为合作款（争议）
};

const FINAL_REVIEW_INDICES = [21, 23, 28, 31, 35, 47];
const FINAL_REVIEW_LABEL: Record<number, string> = {
  21: "品牌属性异常-标题用品牌词无授权",
  23: "品牌属性异常-虚假联名",
  28: "品牌图属不一致-主图为班尼路logo",
  31: "品牌图属不一致-主图为完美日记",
  35: "类目错放-男冲锋衣放女装风衣",
  47: "图片异常-主图被价格表覆盖"
};

const historicalLabelsData: HistoricalLabelRecord[] = (() => {
  const out: HistoricalLabelRecord[] = [];
  // first_label：60 条
  for (const s of SAMPLES) {
    const operatorIdx = (s.i - 1) % OPERATORS.length;
    out.push({
      sampleId: `DPSP-${pad4(s.i)}`,
      label: s.label,
      reason: s.note ?? "首次标注按规则判定",
      operator: OPERATORS[operatorIdx],
      labelTime: `2026-05-20 09:${String((s.i * 3) % 60).padStart(2, "0")}`,
      taskRound: "first_label"
    });
  }
  // second_label：18 条
  for (const i of SECOND_LABEL_INDICES) {
    const s = SAMPLES.find((x) => x.i === i);
    if (!s) continue;
    const newLabel = SECOND_LABEL_OVERRIDE[i] ?? s.label;
    out.push({
      sampleId: `DPSP-${pad4(i)}`,
      label: newLabel,
      reason: newLabel === s.label ? "复核与一标一致" : `复核与一标分歧：${newLabel}`,
      operator: OPERATORS[(i + 2) % OPERATORS.length],
      labelTime: `2026-05-21 14:${String((i * 5) % 60).padStart(2, "0")}`,
      taskRound: "second_label"
    });
  }
  // final_review：6 条
  for (const i of FINAL_REVIEW_INDICES) {
    out.push({
      sampleId: `DPSP-${pad4(i)}`,
      label: FINAL_REVIEW_LABEL[i],
      reason: "终审定稿，作为本次评测 gold 口径",
      operator: REVIEWERS[i % REVIEWERS.length],
      labelTime: `2026-05-22 17:${String((i * 7) % 60).padStart(2, "0")}`,
      taskRound: "final_review"
    });
  }
  return out;
})();

// -----------------------------------------------------------------------------
// 10 条质检复盘记录（覆盖一二标分歧 + 错例）
// -----------------------------------------------------------------------------

const qualityResultsData: QualityResultRecord[] = [
  {
    sampleId: "DPSP-0021",
    originalLabel: "品牌属性异常-标题用品牌词无授权",
    finalLabel: "品牌属性异常-标题用品牌词无授权",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "一标二标分歧由终审定稿，沿用一标判定，理由：未提供 Apple 授权证明",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0023",
    originalLabel: "品牌属性异常-虚假联名",
    finalLabel: "品牌属性异常-虚假联名",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "联名授权需提供品牌方书面证明，本商品未提供 → 维持一标",
    reviewer: "质检B"
  },
  {
    sampleId: "DPSP-0028",
    originalLabel: "品牌图属不一致-主图为班尼路logo",
    finalLabel: "品牌图属不一致-主图为班尼路logo",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "经品牌库核实，班尼路与优衣库非同集团关联，判定为图属不一致 → 维持一标",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0031",
    originalLabel: "品牌图属不一致-主图为完美日记",
    finalLabel: "品牌图属不一致-主图为完美日记",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "雅诗兰黛与完美日记非合作款，二标判定有误 → 维持一标",
    reviewer: "质检B"
  },
  {
    sampleId: "DPSP-0046",
    originalLabel: "图片异常-AI劣质生成主图",
    finalLabel: "图片异常-AI劣质生成主图",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "模特手指畸形 + 衣服褶皱诡异，属于 AI 劣质图，符合最新口径",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0050",
    originalLabel: "商品一致性表达异常-袖长冲突",
    finalLabel: "商品一致性表达异常-袖长冲突",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "标题短袖、摘要与主图都是长袖 → 一致性表达异常成立",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0019",
    originalLabel: "品牌属性异常-标题盗用品牌词",
    finalLabel: "品牌属性异常-标题盗用品牌词",
    isCorrect: false,
    errorType: "label 文案不规范",
    qualityReason: "label 应统一写\"品牌属性异常-标题盗用品牌词\"，错误员工写成\"标题异常\"，纠正",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0033",
    originalLabel: "类目错放-相近类目错放",
    finalLabel: "类目错放-电饭煲放在吹风机类目",
    isCorrect: false,
    errorType: "label 描述太泛",
    qualityReason: "应明确具体错放方向：电饭煲→个护小家电",
    reviewer: "质检B"
  },
  {
    sampleId: "DPSP-0042",
    originalLabel: "导购标题堆砌作假-虚假赠品",
    finalLabel: "导购标题堆砌作假-虚假赠品",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "SKU 仅口红单支，标题写送3件，判定成立",
    reviewer: "质检A"
  },
  {
    sampleId: "DPSP-0058",
    originalLabel: "无效链接-商品已下架",
    finalLabel: "无效链接-商品已下架",
    isCorrect: true,
    errorType: undefined,
    qualityReason: "页面 404，无效链接成立",
    reviewer: "质检B"
  }
];

// -----------------------------------------------------------------------------
// 机审记录：按 9 类异常题型差异化命中率 + confidence
//   组 1（无异常 18） : 命中 ~95%, conf 0.85-0.98
//   组 2（品牌属性 8）: 命中 ~55%, conf 0.50-0.85
//   组 3（品牌图属 6）: 命中 ~50%, conf 0.45-0.80
//   组 4（类目错放 6）: 命中 ~70%, conf 0.65-0.90
//   组 5（堆砌作假 6）: 命中 ~75%, conf 0.70-0.90
//   组 6（图片异常 5）: 命中 ~45%, conf 0.40-0.75
//   组 7（一致性 4）  : 命中 ~60%, conf 0.55-0.85
//   组 8（SKU 异常 4）: 命中 ~92%, conf 0.85-0.97
//   组 9（无效链接 3）: 命中 ~98%, conf 0.92-0.99
// 加权 accuracy ≈ 74% → machineAuditPotential ~8/15 → Q2 = 人机协同
// -----------------------------------------------------------------------------

type Profile = { hit: number; confHigh: [number, number]; confMid: [number, number]; confLow: [number, number] };

const PROFILES: Record<string, Profile> = {
  无异常: { hit: 0.95, confHigh: [0.85, 0.98], confMid: [0.70, 0.84], confLow: [0.50, 0.69] },
  品牌属性异常: { hit: 0.55, confHigh: [0.78, 0.88], confMid: [0.55, 0.77], confLow: [0.35, 0.54] },
  品牌图属不一致: { hit: 0.50, confHigh: [0.72, 0.83], confMid: [0.55, 0.71], confLow: [0.35, 0.54] },
  类目错放: { hit: 0.70, confHigh: [0.80, 0.92], confMid: [0.60, 0.79], confLow: [0.45, 0.59] },
  标题堆砌作假: { hit: 0.75, confHigh: [0.82, 0.92], confMid: [0.65, 0.81], confLow: [0.50, 0.64] },
  图片异常: { hit: 0.45, confHigh: [0.65, 0.78], confMid: [0.50, 0.64], confLow: [0.30, 0.49] },
  商品一致性表达异常: { hit: 0.60, confHigh: [0.75, 0.86], confMid: [0.58, 0.74], confLow: [0.40, 0.57] },
  SKU异常: { hit: 0.92, confHigh: [0.86, 0.97], confMid: [0.72, 0.85], confLow: [0.55, 0.71] },
  "无效链接/废弃": { hit: 0.98, confHigh: [0.92, 0.99], confMid: [0.80, 0.91], confLow: [0.65, 0.79] }
};

function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const machineAuditResultsData: MachineAuditRecord[] = (() => {
  const out: MachineAuditRecord[] = [];
  const rand = rng(20260528);
  const allBuckets = Array.from(new Set(SAMPLES.map((s) => toBucket(s.label))));
  for (const s of SAMPLES) {
    const bucket = toBucket(s.label);
    const profile = PROFILES[bucket] ?? PROFILES["无异常"];
    const isHard = s.difficultyHint === "hard";
    const hitP = isHard ? Math.max(0.1, profile.hit - 0.10) : profile.hit;
    const correct = rand() < hitP;

    // confidence 分布：60% high / 28% mid / 12% low
    const cr = rand();
    let conf: number;
    let confTier: "high" | "mid" | "low";
    if (cr < 0.60) {
      confTier = "high";
      conf = profile.confHigh[0] + rand() * (profile.confHigh[1] - profile.confHigh[0]);
    } else if (cr < 0.88) {
      confTier = "mid";
      conf = profile.confMid[0] + rand() * (profile.confMid[1] - profile.confMid[0]);
    } else {
      confTier = "low";
      conf = profile.confLow[0] + rand() * (profile.confLow[1] - profile.confLow[0]);
    }
    if (isHard) conf = Math.max(0.30, conf - 0.06);

    // 预测的细粒度 label
    const gold = s.label;
    let machineLabel: string;
    if (correct) {
      machineLabel = gold;
    } else {
      const others = allBuckets.filter((b) => b !== bucket);
      const wrongBucket = others[Math.floor(rand() * others.length)];
      // 落到同 bucket 的某一条 sample.label 上
      const candidates = SAMPLES.filter((x) => toBucket(x.label) === wrongBucket).map((x) => x.label);
      machineLabel = candidates[Math.floor(rand() * candidates.length)] ?? gold;
    }

    // 与历史人工一致性：correct 时 ~92% / incorrect 时 ~30%
    const historicalAgreement = rand() < (correct ? 0.92 : 0.30);

    let reason: string;
    if (correct && confTier === "high") {
      reason = "命中规则 + 标题/品牌/类目/SKU 全字段一致，高置信免审";
    } else if (correct) {
      reason = "命中规则但部分字段冲突，建议进 AI 预标 + 人工核对";
    } else if (confTier === "low") {
      reason = "模型对该 case 置信度不足，建议人工兜底";
    } else {
      reason = "模型预测与历史人工不一致，疑似 corner case，需人工复核";
    }

    out.push({
      sampleId: `DPSP-${pad4(s.i)}`,
      machineLabel,
      confidence: Number(conf.toFixed(3)),
      modelVersion: "dapan-cot-v0.5",
      machineReason: reason,
      isHitRule: correct,
      historicalAgreement
    });
  }
  return out;
})();

// -----------------------------------------------------------------------------
// 任务定义
// -----------------------------------------------------------------------------

export const commodityQualityTask: EvaluationTask = {
  id: "task_commodity_quality_demo",
  title: "大盘商品信息质量评测 — 巡检与召回率评测",
  taskType: "model_recall_eval",
  demandDescription: `大盘商品巡检任务，需要从消费者角度判断商品展示信息（标题、主图、类目、品牌、SKU 等）与实际购买信息是否准确、一致、可购买，并为算法召回率评测提供人工评测基准。

## 业务目标
1. 为算法召回率评测提供人工基准，判断当前算法召回是否覆盖关键异常类型；
2. 为商品质量治理提供问题样本与异常类型分布，支撑后续治理策略优化；
3. 沉淀典型规则 Case、边界 Case、错例样本，用于后续机审模型训练 / 规则优化 / 质检题库建设；
4. 为是否扩大人工评测规模、是否接入 AI 预标 / 免审、是否按 SKU 维度拆分提供决策依据。

## 任务范围
- 商品维度 13 题：废弃 / 无效链接 / 类目错放 / 品牌属性异常 / 品牌图属不一致 / 标题异常 / 长 + 导购标题堆砌 / 矛盾词 / 图片异常 / 商品一致性 / SKU 图异常；
- SKU 维度 6 题：无 SKU 直购 / SKU 图异常及分类 / SKU 置灰 / SKU 异常 / SKU 一致性；
- 单条平均耗时约 75 秒，包含主图与多 SKU 浏览。

## 希望 Agent 回答的问题
1. 这个评测需求是否值得继续投入人工评测（Q1 价值）；
2. 19 道判定题各自适合 AI 免审 / AI 预标 / AI 辅助 / 人工主判 中的哪一档（Q2/Q3）；
3. 60 条 mock 样本中哪些可由机器直接出结论、哪些必须人工核心判定、哪些是疑难边界；
4. 现有规则 / 历史标注 / 质检结果中是否存在冲突或缺口，是否需要先补齐再启动；
5. 推荐的下一步：直接承接 / 试点承接 / AI 优先承接 / 改造后承接 / 人工主判 / 不建议承接？

## 前置已就绪（业务上下文清单）
- **决策方 / 责任方**：搜索质量算法团队（owner: dapan_quality_team@taobao），与商品质量治理团队联合承接；
- **业务 KPI 目标**：将大盘商品异常召回率（当前 78%）提升至 ≥ 88%，全年异常 case 拦截量 ≥ 60w；
- **本次评测的成功标准 (SLA)**：一二标分歧率 ≤ 8%、终审通过率 ≥ 92%、5000 条扩量目标 19 题位全覆盖；
- **下游消费方**：① 算法召回模型（用于迭代 recall 评估）② 商品治理后台（用于异常归因分布）③ 外包质检题库（用于做题培训）；
- **时间盒**：从启动到 5000 条第一批交付目标 14 天；二期扩量 30 天内做评审；
- **预算口径**：人工成本预算 ≤ ¥3.5/条，机审/预标接入后单条目标成本 ≤ ¥1.2；
- **机审承接现状**：CoT 巡检模型 v0.5 已对 60 条 mock 样本做全量打分（含 confidence + 与历史人工一致性），文本规则类（无效链接、SKU 不可购、标题堆砌）命中率 ≥ 0.85；视觉/品牌库类（品牌图属、图片异常）命中率 0.45-0.55；整体加权 ~74%。

## 已知信息
- 样本：60 条 mock 数据（含商品 + SKU 信息 + 主图 OCR），覆盖 9 类业务异常 + 真实品牌×品类映射；
- 历史标注：84 条三轮标注（60 一标 + 18 二标 + 6 终审），含 4 条一二标分歧；
- 历史质检：10 条复盘记录，覆盖一二标分歧、label 文案规范、错例归属；
- 机审打分：60 条 v0.5 模型预测（含 confidence、与历史一致性、规则命中），可与人工 gold 做差异分析。`,
  files: [ruleDoc, sopDoc, trainingDoc, screenshotDoc],
  sampleData: samplesData,
  historicalLabels: historicalLabelsData,
  qualityResults: qualityResultsData,
  machineAuditResults: machineAuditResultsData,
  capacityParams: {
    totalSampleCount: 5000,
    avgManualSecondsPerItem: 75,
    avgPrelabelConfirmSecondsPerItem: 30,
    qualitySamplingRatio: 0.1,
    effectiveWorkHoursPerPersonDay: 6,
    targetDeliveryDays: 14
  },
  createdAt: "2026-05-28T07:25:00.000Z",
  status: "draft"
};
