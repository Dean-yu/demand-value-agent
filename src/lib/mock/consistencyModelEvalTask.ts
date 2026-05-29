// =============================================================================
// Mock 示例 2：「一致性」模型准确率评测任务（升级版）
// 业务背景：算法侧上线了一个判断「商品标题 vs 主图是否一致」的模型 consistency-v0.4
// 现在希望抽样人工评测：模型 vs 人工答案的一致性 / 准确率，决定是否上量上线。
//
// 升级要点（适配新的机审 Trial 能力）：
//   1) 每条样本提供 textFields（title / main_image_desc / brand / category 等），
//      支持 machineAuditTrialSkill 在子样本上跑真实机审；
//   2) 样本不再是占位字符串，而是 6 类目 × 10 模板的真实风味商品；
//      每条样本按 gold_label = 一致 / 不一致 / 无法判断 三种形态注入差异；
//   3) 新增 trainingDoc（label space + 难点分类清单）让 trial step A 起草 prompt
//      时拿得到判定细则；
//   4) 调整 machineAuditResults 让 confidence / historicalAgreement 更贴合"运动户外
//      + 数码 3C 是难类目"的设定，便于看出 per-category 差异。
// =============================================================================

import type {
  EvaluationTask,
  HistoricalLabelRecord,
  MachineAuditRecord,
  QualityResultRecord,
  SampleRecord,
  UploadedFile
} from "../agent/types";

const SAMPLE_COUNT = 120; // 6 类目 × 20 = 120，保证每类目都有足够样本支持 trial 分桶

const CATEGORIES = [
  "服饰鞋包",
  "美妆个护",
  "家居家纺",
  "数码 3C",
  "运动户外",
  "图书音像"
] as const;
type CatName = (typeof CATEGORIES)[number];

const RISK_TYPES = [
  "主图与标题强不符",
  "标题夸大",
  "图片色差",
  "图片模糊",
  "无主图",
  "无异常"
] as const;
const LABELS = ["一致", "不一致", "无法判断"] as const;

// -----------------------------------------------------------------------------
// 商品模板：每个类目 10 套真实可读的（title, image_desc, brand, key_attrs）
// 字段会被 trial prompt 拿去做"标题 vs 主图描述是否一致"的判定
// -----------------------------------------------------------------------------
interface BaseProduct {
  title: string;
  imageDesc: string;
  brand: string;
  // 关键属性（颜色 / 款式 / 容量 等），用于构造"不一致"变体
  color?: string;
  style?: string;
  size?: string;
}

const BASE_PRODUCTS: Record<CatName, BaseProduct[]> = {
  服饰鞋包: [
    {
      title: "纯棉宽松短袖T恤男士夏季白色简约百搭",
      imageDesc: "白色纯棉短袖T恤，正面胸前印有小logo，模特上半身展示",
      brand: "优衣库",
      color: "白色",
      style: "短袖"
    },
    {
      title: "高腰阔腿牛仔裤女2026春季新款蓝色显瘦",
      imageDesc: "蓝色高腰阔腿牛仔裤，模特全身展示，搭配白色上衣",
      brand: "Levi's",
      color: "蓝色",
      style: "阔腿"
    },
    {
      title: "真皮系带男士休闲鞋透气黑色商务通勤",
      imageDesc: "黑色真皮系带休闲鞋，鞋面光泽，俯拍角度",
      brand: "Clarks",
      color: "黑色",
      style: "系带"
    },
    {
      title: "羊毛混纺西装外套女2026秋季新款米色OL通勤",
      imageDesc: "米色西装外套，长袖单排扣，模特正面展示",
      brand: "MO&Co.",
      color: "米色",
      style: "西装"
    },
    {
      title: "真皮链条单肩斜挎包女2026新款小方包黑色",
      imageDesc: "黑色真皮链条小方包，金色链条，单肩斜挎展示",
      brand: "CHARLES & KEITH",
      color: "黑色",
      style: "斜挎"
    },
    {
      title: "运动休闲短裤男夏季速干跑步五分裤深灰色",
      imageDesc: "深灰色速干运动短裤，模特展示跑步姿势",
      brand: "李宁",
      color: "深灰",
      style: "短裤"
    },
    {
      title: "雪纺连衣裙女2026春夏款碎花长款飘逸优雅",
      imageDesc: "粉色碎花雪纺长裙，模特户外飘逸展示",
      brand: "ONLY",
      color: "粉色",
      style: "长裙"
    },
    {
      title: "牛皮男士长款钱包多卡位商务棕色",
      imageDesc: "棕色牛皮长款钱包，展开展示多卡位结构",
      brand: "金利来",
      color: "棕色",
      style: "长款"
    },
    {
      title: "羊绒围巾男女通用冬季加厚保暖驼色",
      imageDesc: "驼色羊绒围巾，平铺展示纹理",
      brand: "鄂尔多斯",
      color: "驼色",
      style: "围巾"
    },
    {
      title: "运动袜男士中筒纯棉吸汗夏季白色五双装",
      imageDesc: "白色中筒运动袜五双平铺展示，标签清晰",
      brand: "南极人",
      color: "白色",
      style: "中筒"
    }
  ],
  美妆个护: [
    {
      title: "兰蔻小黑瓶精华30ml肌底液保湿修护",
      imageDesc: "黑色玻璃精华瓶，30ml容量标识，正面带 Lancôme 商标",
      brand: "Lancôme",
      color: "黑色",
      size: "30ml"
    },
    {
      title: "雅诗兰黛红石榴爽肤水200ml紧致提亮",
      imageDesc: "红色透明瓶身爽肤水，200ml 标识清晰，正面 Estée Lauder logo",
      brand: "Estée Lauder",
      color: "红色",
      size: "200ml"
    },
    {
      title: "海飞丝去屑洗发水400ml清爽控油男女通用",
      imageDesc: "蓝色洗发水瓶身，400ml 容量，海飞丝 logo 居中",
      brand: "海飞丝",
      color: "蓝色",
      size: "400ml"
    },
    {
      title: "SK-II神仙水230ml神奇精华液护肤",
      imageDesc: "透明瓶身神仙水，230ml 容量标识，SK-II logo 红字清晰",
      brand: "SK-II",
      color: "透明",
      size: "230ml"
    },
    {
      title: "欧莱雅复颜玻尿酸日霜50ml紧致抗皱面霜",
      imageDesc: "粉色面霜罐，50ml 容量，L'Oréal 商标",
      brand: "L'Oréal",
      color: "粉色",
      size: "50ml"
    },
    {
      title: "迪奥烈艳蓝金口红999号正红色丝绒哑光",
      imageDesc: "金色管身红色丝绒口红，999 标号镌刻，Dior logo",
      brand: "Dior",
      color: "正红",
      size: "标准"
    },
    {
      title: "资生堂红腰子精华50ml紧致弹力光彩",
      imageDesc: "红色瓶身精华，50ml 标识，Shiseido logo 居中",
      brand: "Shiseido",
      color: "红色",
      size: "50ml"
    },
    {
      title: "高露洁全效防蛀美白牙膏180g薄荷清新",
      imageDesc: "白色牙膏盒身，180g 容量标识，Colgate logo 居中",
      brand: "Colgate",
      color: "白色",
      size: "180g"
    },
    {
      title: "贝亲婴儿洗发沐浴二合一无泪配方200ml",
      imageDesc: "浅黄色瓶身沐浴露，200ml 容量，Pigeon 卡通 logo",
      brand: "Pigeon",
      color: "黄色",
      size: "200ml"
    },
    {
      title: "美宝莲新色卷翘睫毛膏防水加密黑色",
      imageDesc: "黑色细长睫毛膏管身，金色字样 Maybelline",
      brand: "Maybelline",
      color: "黑色",
      size: "标准"
    }
  ],
  家居家纺: [
    {
      title: "全棉四件套1.8m双人床被套床单纯色北欧风",
      imageDesc: "灰色四件套床品平铺展示，含被套+床单+枕套2只，1.8米床",
      brand: "水星家纺",
      color: "灰色",
      size: "1.8m"
    },
    {
      title: "羽绒被冬季加厚双人保暖鹅绒被200×230",
      imageDesc: "白色羽绒被铺床展示，200×230cm 尺寸标识",
      brand: "富安娜",
      color: "白色",
      size: "200×230"
    },
    {
      title: "陶瓷餐具套装20头骨瓷碗碟欧式家用釉下彩",
      imageDesc: "白底蓝花骨瓷餐具20件平铺展示，碗+盘+勺组合",
      brand: "景德镇",
      color: "白底蓝花",
      style: "餐具"
    },
    {
      title: "记忆棉枕头颈椎护颈助睡眠白色单人款",
      imageDesc: "白色记忆棉枕头，人体工学曲线展示，包装侧面有规格",
      brand: "梦百合",
      color: "白色",
      style: "枕头"
    },
    {
      title: "实木茶几现代简约小户型咖啡桌客厅原木色",
      imageDesc: "原木色实木茶几，长方形造型，客厅场景图展示",
      brand: "源氏木语",
      color: "原木色",
      style: "茶几"
    },
    {
      title: "电热水壶不锈钢2L快煮自动断电家用",
      imageDesc: "银色不锈钢电热水壶，2L 容量，带温度显示窗",
      brand: "美的",
      color: "银色",
      size: "2L"
    },
    {
      title: "纯棉浴巾加厚成人吸水柔软家用大号灰色",
      imageDesc: "灰色加厚浴巾平铺展示，140×70cm 尺寸",
      brand: "洁丽雅",
      color: "灰色",
      size: "140×70"
    },
    {
      title: "智能马桶盖即热加热全自动除菌冲洗器",
      imageDesc: "白色智能马桶盖，侧面带控制面板，电源线展示",
      brand: "九牧",
      color: "白色",
      style: "智能"
    },
    {
      title: "扫地机器人智能规划清扫静音自动回充黑色",
      imageDesc: "黑色圆形扫地机器人，俯视图，含充电底座",
      brand: "石头",
      color: "黑色",
      style: "扫地"
    },
    {
      title: "棉麻沙发垫四季通用防滑加厚客厅米白色",
      imageDesc: "米白色棉麻沙发垫铺设三人位沙发展示",
      brand: "宜家",
      color: "米白",
      style: "沙发垫"
    }
  ],
  "数码 3C": [
    {
      title: "华为P60Pro 256GB羽砂黑全网通5G智能手机",
      imageDesc: "黑色直板手机正反面展示，背面华为 logo，256GB 配置",
      brand: "华为",
      color: "羽砂黑",
      size: "256GB"
    },
    {
      title: "罗技MX Master 3S无线蓝牙鼠标办公人体工学",
      imageDesc: "黑色无线鼠标俯视，带蓝牙标识，Logitech logo",
      brand: "Logitech",
      color: "黑色",
      style: "无线"
    },
    {
      title: "索尼WH-1000XM5无线降噪头戴耳机蓝牙音乐",
      imageDesc: "黑色头戴式降噪耳机，金属铰链，Sony 标识",
      brand: "Sony",
      color: "黑色",
      style: "头戴"
    },
    {
      title: "苹果iPad Air 11英寸M2芯片128GB星光色2026新款",
      imageDesc: "星光色平板正反面展示，11 英寸屏，128GB",
      brand: "Apple",
      color: "星光色",
      size: "128GB"
    },
    {
      title: "联想小新Pro14轻薄笔记本i7-13700H 16G 1T银色",
      imageDesc: "银色金属笔记本侧面+键盘正面，14 英寸屏，Lenovo logo",
      brand: "Lenovo",
      color: "银色",
      size: "16G/1T"
    },
    {
      title: "小米手环8 NFC运动健康监测心率睡眠黑色",
      imageDesc: "黑色手环主体+黑色硅胶表带，屏幕显示心率",
      brand: "Xiaomi",
      color: "黑色",
      style: "手环"
    },
    {
      title: "佳能EOS R6 Mark II全画幅微单相机机身2024款",
      imageDesc: "黑色微单相机机身正面，Canon logo，无镜头展示",
      brand: "Canon",
      color: "黑色",
      style: "微单"
    },
    {
      title: "戴尔U2723QE 27英寸4K专业设计显示器Type-C",
      imageDesc: "27 英寸黑色显示器，正面展示画面，背面带 Dell logo",
      brand: "Dell",
      color: "黑色",
      size: "27吋"
    },
    {
      title: "雷蛇毒蝰V3专业版无线游戏鼠标轻量化白色",
      imageDesc: "白色无线游戏鼠标，俯视，Razer 三头蛇 logo",
      brand: "Razer",
      color: "白色",
      style: "游戏"
    },
    {
      title: "西部数据SN850X 2TB NVMe固态硬盘PCIe4.0",
      imageDesc: "M.2 SSD 黑色 PCB 板，WD logo 标签，2TB 标识",
      brand: "WD",
      color: "黑色",
      size: "2TB"
    }
  ],
  运动户外: [
    {
      title: "迪卡侬登山包30L男女户外旅行徒步双肩背包",
      imageDesc: "蓝色 30L 登山双肩包，多袋多扣，模特户外背负",
      brand: "Decathlon",
      color: "蓝色",
      size: "30L"
    },
    {
      title: "李宁飞电3代竞速跑鞋男碳板马拉松透气2026款",
      imageDesc: "白色跑鞋侧面+鞋底碳板展示，李宁 logo",
      brand: "李宁",
      color: "白色",
      style: "跑鞋"
    },
    {
      title: "始祖鸟Beta SL硬壳冲锋衣Gore-Tex防水夹克男款",
      imageDesc: "深蓝色硬壳冲锋衣，模特户外展示，连帽设计",
      brand: "Arc'teryx",
      color: "深蓝",
      style: "冲锋衣"
    },
    {
      title: "Salomon Speedcross 6越野跑鞋男女防滑户外训练",
      imageDesc: "灰黑配色越野跑鞋，深齿大底，户外岩石场景",
      brand: "Salomon",
      color: "灰黑",
      style: "越野"
    },
    {
      title: "始祖鸟Atom LT夹克男户外保暖轻量化棉服",
      imageDesc: "黑色棉服夹克，模特户外展示，前胸鸟标 logo",
      brand: "Arc'teryx",
      color: "黑色",
      style: "棉服"
    },
    {
      title: "牧高笛云尚3p双层防雨帐篷户外露营3人款",
      imageDesc: "橙绿色双层帐篷户外搭建展示，3 人容量",
      brand: "牧高笛",
      color: "橙绿",
      size: "3人"
    },
    {
      title: "迪卡侬瑜伽垫183cm加厚防滑初学者健身垫子",
      imageDesc: "粉色瑜伽垫卷起展示，183cm 长度标签",
      brand: "Decathlon",
      color: "粉色",
      size: "183cm"
    },
    {
      title: "GARMIN佳明Fenix 7X多功能户外腕表心率GPS",
      imageDesc: "黑色户外运动腕表，圆形表盘，Garmin 标识",
      brand: "Garmin",
      color: "黑色",
      style: "腕表"
    },
    {
      title: "NIKE Pegasus 41男女跑步鞋缓震透气2026款黑白",
      imageDesc: "黑白配色跑步鞋侧面，Nike swoosh 标志",
      brand: "Nike",
      color: "黑白",
      style: "跑鞋"
    },
    {
      title: "凯乐石攀岩绳动力绳9.8mm 60m户外攀登绳",
      imageDesc: "红黑色攀岩绳盘绕展示，9.8mm 直径标签",
      brand: "Kailas",
      color: "红黑",
      size: "60m"
    }
  ],
  图书音像: [
    {
      title: "《活着》余华著长篇小说作家出版社2020新版",
      imageDesc: "白底黑字书封，正中四个大字「活着」，作者名右下",
      brand: "作家出版社",
      color: "白底黑字",
      style: "长篇"
    },
    {
      title: "《三体》刘慈欣科幻小说全三册套装重庆出版社",
      imageDesc: "三本套装并排展示，封面星空主题，书名烫金",
      brand: "重庆出版社",
      color: "深蓝",
      style: "套装"
    },
    {
      title: "《明朝那些事儿》当年明月历史书全套7册",
      imageDesc: "7 本套装并排展示，封面写意明代山水画风格",
      brand: "中国海关出版社",
      color: "黄色",
      style: "套装"
    },
    {
      title: "《百年孤独》马尔克斯著南海出版公司精装版2024",
      imageDesc: "深绿色精装书封，烫金书名+作者名，封面带蝴蝶图案",
      brand: "南海出版公司",
      color: "深绿",
      style: "精装"
    },
    {
      title: "《围城》钱钟书著长篇小说人民文学出版社经典版",
      imageDesc: "米色书封，繁体书名「围城」居中，封面简约",
      brand: "人民文学出版社",
      color: "米色",
      style: "经典"
    },
    {
      title: "《人类简史》尤瓦尔·赫拉利中信出版社畅销精装",
      imageDesc: "白底书封，左侧地球+人类剪影，黑色书名",
      brand: "中信出版社",
      color: "白底",
      style: "精装"
    },
    {
      title: "《追风筝的人》卡勒德·胡赛尼上海人民出版社",
      imageDesc: "天蓝色书封，远景孩子放风筝剪影",
      brand: "上海人民出版社",
      color: "天蓝",
      style: "平装"
    },
    {
      title: "《小王子》安托万·圣埃克苏佩里中英双语精装彩绘",
      imageDesc: "黄色书封，小王子站在小行星上插画，金色书名",
      brand: "果麦文化",
      color: "黄色",
      style: "彩绘精装"
    },
    {
      title: "周杰伦《最伟大的作品》专辑CD 2022杰威尔音乐",
      imageDesc: "黑色 CD 包装，封面周杰伦黑白侧像，专辑名烫银",
      brand: "杰威尔音乐",
      color: "黑色",
      style: "CD"
    },
    {
      title: "《银河系漫游指南》道格拉斯·亚当斯科幻小说五部曲",
      imageDesc: "墨绿色书封，左下角写有 42 字样，封面星系背景",
      brand: "上海译文出版社",
      color: "墨绿",
      style: "五部曲"
    }
  ]
};

function pseudoRand(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

// 把某个属性变成另一个值，构造"标题 vs 图描述不一致"
function mutateImageDesc(base: BaseProduct, rand: () => number): string {
  const COLOR_BANK = ["红色", "蓝色", "白色", "黑色", "粉色", "绿色", "黄色", "灰色"];
  const SIZE_BANK = ["100ml", "200ml", "300ml", "500ml", "1L", "S 码", "M 码", "L 码"];
  const STYLE_BANK = ["长袖", "短袖", "无袖", "连帽", "圆领", "高领", "立领"];
  let desc = base.imageDesc;
  const opts: Array<() => void> = [];
  if (base.color) {
    const alt = COLOR_BANK.filter((c) => !c.includes(base.color ?? "")).slice(0, 4);
    opts.push(() => {
      desc = desc.replace(base.color!, alt[Math.floor(rand() * alt.length)]);
    });
  }
  if (base.size) {
    const alt = SIZE_BANK.filter((s) => s !== base.size).slice(0, 4);
    opts.push(() => {
      desc = desc.replace(base.size!, alt[Math.floor(rand() * alt.length)]);
    });
  }
  if (base.style) {
    const alt = STYLE_BANK.filter((s) => s !== base.style).slice(0, 4);
    opts.push(() => {
      desc = desc.replace(base.style!, alt[Math.floor(rand() * alt.length)]);
    });
  }
  if (opts.length === 0) {
    desc = `${desc}（主图主体与标题描述存在明显差异）`;
  } else {
    opts[Math.floor(rand() * opts.length)]();
  }
  return desc;
}

function makeData() {
  const rand = pseudoRand(20260528);
  const samples: SampleRecord[] = [];
  const historical: HistoricalLabelRecord[] = [];
  const quality: QualityResultRecord[] = [];
  const machine: MachineAuditRecord[] = [];

  for (let i = 1; i <= SAMPLE_COUNT; i++) {
    const id = `cm_${pad(i)}`;
    const cat = CATEGORIES[i % CATEGORIES.length]; // 均匀分布到 6 类目
    const baseBank = BASE_PRODUCTS[cat];
    const base = baseBank[Math.floor(rand() * baseBank.length)];

    // gold label 分布：62% 一致 / 31% 不一致 / 7% 无法判断
    const goldRoll = rand();
    const goldLabel: (typeof LABELS)[number] =
      goldRoll < 0.62 ? "一致" : goldRoll < 0.93 ? "不一致" : "无法判断";

    let title = base.title;
    let imageDesc = base.imageDesc;
    if (goldLabel === "不一致") {
      imageDesc = mutateImageDesc(base, rand);
    } else if (goldLabel === "无法判断") {
      imageDesc = rand() < 0.5 ? "图片加载失败，无法获取主图内容" : "主图缺失或模糊，无法辨认商品主体";
    }

    const risk: (typeof RISK_TYPES)[number] =
      goldLabel === "一致"
        ? "无异常"
        : goldLabel === "不一致"
          ? RISK_TYPES[Math.floor(rand() * 3)] // 强不符 / 夸大 / 色差
          : (RISK_TYPES[3 + Math.floor(rand() * 2)] as (typeof RISK_TYPES)[number]); // 模糊 / 无主图

    const difficulty: SampleRecord["difficultyHint"] =
      goldLabel === "无法判断"
        ? "hard"
        : rand() < 0.55
          ? "easy"
          : rand() < 0.88
            ? "medium"
            : "hard";

    samples.push({
      id,
      raw: {
        sample_id: id,
        title,
        category: cat,
        brand: base.brand,
        main_image_url: `https://demo.example.com/img/${id}.jpg`,
        main_image_desc: imageDesc,
        gold_label: goldLabel,
        risk_type: risk,
        difficulty_hint: difficulty
      },
      textFields: {
        title,
        category: cat,
        brand: base.brand,
        main_image_desc: imageDesc,
        risk_type: risk
      },
      imageFields: {
        main_image: `https://demo.example.com/img/${id}.jpg`
      },
      category: cat,
      label: goldLabel,
      riskType: risk,
      difficultyHint: difficulty
    });

    // -- 历史人工标注：80% 样本有历史标注（来自老评测集）
    if (rand() < 0.8) {
      const noisy = rand() < 0.08; // 8% 噪声
      const histLabel = noisy
        ? (LABELS.filter((l) => l !== goldLabel)[Math.floor(rand() * 2)] as string)
        : goldLabel;
      historical.push({
        sampleId: id,
        label: histLabel,
        reason: noisy ? "存在轻微歧义，二标分歧" : "图文一致性人工核对",
        operator: `qa_eval_${(i % 4) + 1}`,
        labelTime: `2026-05-${String(Math.floor(rand() * 20) + 1).padStart(2, "0")}T15:00:00`,
        taskRound: rand() < 0.7 ? "first_label" : rand() < 0.9 ? "second_label" : "final_review"
      });
    }

    // -- 历史质检：60% 覆盖
    if (rand() < 0.6) {
      const isCorrect = rand() < 0.93;
      const hist = historical[historical.length - 1];
      quality.push({
        sampleId: id,
        originalLabel: hist?.label,
        finalLabel: isCorrect ? hist?.label : goldLabel,
        isCorrect,
        errorType: isCorrect ? undefined : "判断标准不一致",
        qualityReason: isCorrect ? "复核一致" : "需要按新口径重判",
        reviewer: `qa_lead_${(i % 2) + 1}`
      });
    }

    // -- 机审：consistency-v0.4 全量打分
    // 在「数码 3C」「运动户外」两个类目偏弱：confidence 偏低、isCorrect 命中率偏低
    const isWeakCat = cat === "运动户外" || cat === "数码 3C";
    const confRoll = rand();
    const conf =
      confRoll < (isWeakCat ? 0.25 : 0.55)
        ? 0.9 + rand() * 0.1
        : confRoll < (isWeakCat ? 0.6 : 0.88)
          ? 0.7 + rand() * 0.2
          : 0.4 + rand() * 0.3;
    const isCorrect = rand() < (isWeakCat ? 0.62 : 0.92);
    const machineLabel = isCorrect
      ? goldLabel
      : (LABELS.filter((l) => l !== goldLabel)[Math.floor(rand() * 2)] as string);
    machine.push({
      sampleId: id,
      machineLabel,
      confidence: Number(conf.toFixed(3)),
      modelVersion: "consistency-v0.4",
      machineReason: isCorrect ? "图文核心要素匹配命中" : "图文存在差异，疑似边界",
      isHitRule: undefined,
      historicalAgreement: !isCorrect ? false : rand() < 0.9
    });
  }

  return { samples, historical, quality, machine };
}

const data = makeData();

// -----------------------------------------------------------------------------
// 上传材料：需求 + 作业 SOP + 题目级 AI 适配清单（新增）
// -----------------------------------------------------------------------------
const requirementDoc: UploadedFile = {
  id: "f_req_cm",
  name: "一致性模型评测需求.md",
  type: "text/markdown",
  size: 1320,
  role: "rule_doc",
  contentText: `# 一致性模型 v0.4 评测需求

## 一、业务背景
- 算法侧上线了"商品标题 vs 主图是否一致"判断模型 consistency-v0.4；
- 目的：根据模型预测，对图文不一致商品做卡审 / 召回，降低消费者误买；
- 现需通过人工评测，给出整体准确率与是否可上量放开结论。

## 二、评测目标
1. 模型整体准确率（vs 人工真值）；
2. 各类目准确率（重点关注准确率较低的类目）；
3. 错误模式（标题夸大 / 主图色差 / 主图缺失 等）；
4. 判断"是否可由模型免审"vs"模型预标 + 人工抽查"vs"必须人工"；
5. 边界 / 无法判断 case 收集，用于规则细化。

## 三、标签口径（候选标签 3 类）
- **一致**：标题与主图核心要素重合（品类、颜色、规格、品牌、款式 等关键属性一致）；
- **不一致**：标题与主图核心要素冲突（颜色 / 款式 / 容量 / 品类 等存在明显矛盾）；
- **无法判断**：主图损坏 / 缺失 / 模糊 / 标题信息严重不足，无法做对比。

## 四、通过线（KPI）
- 大盘准确率 ≥ 92%；
- 主要类目（服饰鞋包、美妆个护、家居家纺）准确率 ≥ 95%；
- 弱类目（运动户外、数码 3C）准确率 ≥ 88%；
- "无法判断"召回 ≥ 80%；
- 单类目准确率 < 88% 时需做错误归因 + 模型迭代。

## 五、已知难点
- "不一致"样本占比偏低（~30%），训练 / 评测数据天然不平衡；
- 运动户外、数码 3C 类目专业知识要求高（型号、规格、参数对齐）；
- 同义词、近义规格表述差异较多（"羽绒被"vs"鸭绒被"vs"白鸭绒"）；
- 部分商品主图为合成图 / OCR 文字图，需要看 OCR 内容才能判断一致性。`
};

const sopDoc: UploadedFile = {
  id: "f_sop_cm",
  name: "一致性评测作业 SOP.md",
  type: "text/markdown",
  size: 660,
  role: "sop_doc",
  contentText: `# 一致性评测作业 SOP

## 一、作业流程
1. 打开评测面板 → 同时显示商品标题、主图、品牌、类目；
2. 按【标题 vs 主图描述】对比 → 三选一打标：一致 / 不一致 / 无法判断；
3. 选择"不一致"必须备注核心冲突要素（颜色 / 款式 / 容量 / 品类 / 品牌）；
4. 选择"无法判断"必须备注原因（图损坏 / 缺失 / 模糊 / 标题不足）；
5. 单条目标耗时 35 秒；
6. 一标全量、二标 50% 抽样、终审 reviewer 20% 抽样。

## 二、质控
- 一二标分歧率 ≤ 8%；
- 终审通过率 ≥ 92%；
- 错例 + 边界 case 需进入「规则沉淀池」。

## 三、易错点
- "近义词差异"易误判为不一致（同义词放过）；
- "无法判断"是兜底选项，标题与图都给到了就不要选；
- "色差 vs 色彩冲突"边界：色相相同明度不同算一致，色相不同算不一致。`
};

const trainingDoc: UploadedFile = {
  id: "f_train_cm",
  name: "一致性评测_题目级AI适配清单.md",
  type: "text/markdown",
  size: 920,
  role: "training_manual",
  contentText: `# 一致性评测 — 单题判定 AI 适配清单

> 本任务只有 1 道判定题：「标题与主图是否一致」，但需要从多维度比对。下表按"对比维度"拆解。

| # | 比对维度 | 规则清晰度 | AI 适配 | 备注 |
|---|---|---|---|---|
| D1 | 品类匹配（标题写笔记本 / 图是手机） | 高 | machine_auto | 类目+主图主体识别 |
| D2 | 颜色匹配（标题写蓝色 / 图是红色） | 高 | machine_auto | 主图主色提取 |
| D3 | 容量 / 规格匹配（如 200ml / 256GB） | 高 | machine_auto | OCR + 文本对齐 |
| D4 | 品牌匹配（标题写苹果 / 图是华为 logo） | 中高 | ai_prelabel | 需品牌库 + 图标识别 |
| D5 | 款式 / 款型（长袖 vs 短袖、单肩 vs 斜挎） | 中 | ai_prelabel | 视觉理解依赖 |
| D6 | 数量 / 套件（"五双装"标题 vs 图只露一双） | 中 | ai_assist | 视觉计数容易出错 |
| D7 | 主图是否损坏 / 缺失 / 模糊 | 高 | machine_auto | 直接判图像质量 |
| D8 | 同义词放过（"羽绒被"vs"白鸭绒被"） | 中低 | human_only | 行业知识 |
| D9 | 合成图 / 拼贴主图（标题信息全在 OCR 上） | 中低 | human_only | 视觉 + OCR 综合判断 |

## 候选标签（label_space）
- 一致
- 不一致
- 无法判断

## 单题判定决策矩阵
- 任一关键维度（D1-D5）冲突 → 不一致；
- 所有可对比维度匹配 → 一致；
- 主图无法获取或标题信息不全 → 无法判断；
- 仅同义词差异（D8） → 一致。

## AI 适配总判断
- D1-D3 + D7 这 4 个维度（品类 / 颜色 / 规格 / 图质量）规则清晰、CV+NLP 能落地 → **机审 / 预标空间大**；
- D4-D6（品牌 / 款式 / 数量）需要更强的视觉理解 → **AI 预标 + 人工确认**；
- D8-D9（同义词、合成图）需要行业知识与综合判断 → **人工兜底**。`
};

export const consistencyModelEvalTask: EvaluationTask = {
  id: "task_consistency_eval_demo",
  title: "「一致性」模型准确率评测",
  taskType: "model_accuracy_eval",
  demandDescription: `算法侧上线了"商品标题 vs 主图一致性"判断模型 consistency-v0.4。现希望通过人工抽样评测，给出整体准确率与是否可上量放开结论。

## 业务目标
1. 给出模型 v0.4 的大盘准确率 + 6 类目准确率，作为是否上量放开的判断依据；
2. 错误模式归因（按类目维度 + 错误类型）；
3. 边界 / 兜底 case 收集，用于规则细化与下一版模型训练；
4. 评估"全量人工评测"是否必要、能否换为"机审高置信免审 + 中置信抽查"；
5. 输出可由 AI 预标 / 必须人工 的题型清单（本任务实际只有 1 道判定题，按对比维度拆解）。

## 希望 Agent 回答的问题
1. 这个评测需求是否值得继续投入人工评测（Q1 价值）；
2. 单题"标题 vs 主图是否一致"在不同类目下，能否由机审 / AI 预标承接，哪些类目必须人工兜底；
3. 1.5 万条新评测样本的人工成本是否可由 AI 预标显著压缩；
4. 推荐承接方式：直接承接 / 试点承接 / AI 优先承接 / 改造后承接 / 人工主判 / 不建议承接？

## 已知信息
- 评测集来源：日活样本随机抽取，已积累约 8000 条历史评测；
- 现新一轮评测目标：覆盖至少 1.5 万条新样本；
- 单条标注约 35 秒，人工评测压力大；
- 现已有 consistency-v0.4 全量打分结果作为先验，可与人工答案对比；
- 6 类目分布均匀：服饰鞋包 / 美妆个护 / 家居家纺 / 数码 3C / 运动户外 / 图书音像 各约 20 条 Mock 样本。`,
  files: [requirementDoc, sopDoc, trainingDoc],
  sampleData: data.samples,
  historicalLabels: data.historical,
  qualityResults: data.quality,
  machineAuditResults: data.machine,
  capacityParams: {
    totalSampleCount: 15000,
    avgManualSecondsPerItem: 35,
    avgPrelabelConfirmSecondsPerItem: 15,
    qualitySamplingRatio: 0.2,
    effectiveWorkHoursPerPersonDay: 6,
    targetDeliveryDays: 7
  },
  createdAt: "2026-05-28T09:00:00.000Z",
  status: "draft"
};
