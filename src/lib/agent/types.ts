// =============================================================================
// 任务价值评估 Agent — 核心数据结构
// =============================================================================

export type TaskType =
  | "audit"
  | "labeling"
  | "evaluation"
  | "quality_inspection"
  | "model_accuracy_eval"
  | "model_recall_eval"
  | "training_data_building"
  | "other";

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  role:
    | "rule_doc"
    | "sop_doc"
    | "training_manual"
    | "sample_data"
    | "historical_labels"
    | "quality_results"
    | "machine_audit_results"
    | "screenshot"
    | "other";
  contentText?: string;
  url?: string;
}

export interface SampleRecord {
  id: string;
  raw: Record<string, any>;
  textFields?: Record<string, string>;
  imageFields?: Record<string, string>;
  category?: string;
  /** 业务侧最终标签（人工口径，可能含子原因） */
  label?: string;
  /**
   * 给 machine_audit_trial 使用的简化 gold label。
   * 当存在时，trial 会用它替代 label 作为对比基准 —— 适合当 label 含
   * 较多子分类、AI 难以从文本里精准匹配时，用一个粗粒度标签做"AI 可承接性"
   * 的更公平评估。
   */
  trialGoldLabel?: string;
  riskType?: string;
  difficultyHint?: "easy" | "medium" | "hard" | "unknown";
}

// -----------------------------------------------------------------------------
// 字段级 AI vs 人工拆分（新版核心：回答"做什么"）
// -----------------------------------------------------------------------------

/** 单个判定字段在该任务下的承接方式 */
export type FieldFlow =
  | "machine_auto"      // 机审/规则可直接判
  | "ai_prefill"        // AI 直接预填，人工只看一眼即可
  | "ai_assist"         // AI 辅助 + 人工核对修正
  | "human_only";       // 必须人工判定

export interface JudgeField {
  /** 字段中文名 */
  name: string;
  /** 该字段的判定难度（高/中/低） */
  difficulty: "高" | "中" | "低";
  /** AI/机器对该字段的能力评估 */
  aiCapability: "强" | "中" | "弱" | "暂无";
  /** 推荐承接方式 */
  suggestedFlow: FieldFlow;
  /** 该字段需要人工介入的样本占比（0-1） */
  estimatedHumanRatio: number;
  /** 选择该承接方式的理由 */
  reason: string;
  /** 是否高频规则字段 */
  isCoreField?: boolean;
}

export interface FieldLevelAnalysisOutput {
  fields: JudgeField[];
  /** AI/机审为主的字段数量 */
  ai_dominant_count: number;
  /** 必须人工的字段数量 */
  human_required_count: number;
  /** AI 可以做的事（自然语言） */
  what_ai_does: string[];
  /** 人工必须做的事（自然语言） */
  what_human_does: string[];
  summary: string;
}

// -----------------------------------------------------------------------------
// 疑难/边界样本排序（新版核心：回答"做多少 + 哪些"）
// -----------------------------------------------------------------------------

export interface BoundaryCaseItem {
  sampleId: string;
  category?: string;
  label?: string;
  /** 越高越疑难 */
  score: number;
  reasons: string[];
}

// -----------------------------------------------------------------------------
// 人工必要性结论（新版核心：回答"是否需要人工"）
// -----------------------------------------------------------------------------

export interface HumanWorkVerdict {
  /** 是否仍然需要人工 */
  needsHuman: boolean;
  /** 强度：核心人工 / 兜底人工 / 轻量校对 / 几乎不需要 */
  level: "核心人工" | "兜底人工" | "轻量校对" | "几乎不需要";
  /** 一句话直接回答"是否需要人工" */
  headline: string;
  /** 给到老板的"做什么"摘要（人工要做的事） */
  whatHumanDoes: string[];
  /** AI 接管的事 */
  whatAIDoes: string[];
  /** 推荐人工标注的样本数（取自分层 + 边界） */
  estimatedHumanSampleCount: number;
  /** 最终人工人天 */
  estimatedPersonDays: number;
  /** 推荐重点投入的样本类型 */
  priorityFocus: string[];
  /** 总体说明 */
  rationale: string;
}

export interface HistoricalLabelRecord {
  sampleId: string;
  label: string;
  reason?: string;
  operator?: string;
  labelTime?: string;
  taskRound?: "first_label" | "second_label" | "final_review" | "unknown";
}

export interface QualityResultRecord {
  sampleId: string;
  originalLabel?: string;
  finalLabel?: string;
  isCorrect?: boolean;
  errorType?: string;
  qualityReason?: string;
  reviewer?: string;
}

export interface MachineAuditRecord {
  sampleId: string;
  machineLabel: string;
  confidence?: number;
  modelVersion?: string;
  machineReason?: string;
  isHitRule?: boolean;
  historicalAgreement?: boolean;
}

export interface CapacityParams {
  totalSampleCount?: number;
  avgManualSecondsPerItem: number;
  avgPrelabelConfirmSecondsPerItem: number;
  qualitySamplingRatio: number;
  effectiveWorkHoursPerPersonDay: number;
  targetDeliveryDays?: number;
}

export interface EvaluationTask {
  id: string;
  title: string;
  taskType: TaskType;
  demandDescription: string;
  files: UploadedFile[];
  sampleData?: SampleRecord[];
  historicalLabels?: HistoricalLabelRecord[];
  qualityResults?: QualityResultRecord[];
  machineAuditResults?: MachineAuditRecord[];
  capacityParams: CapacityParams;
  createdAt: string;
  status: "draft" | "running" | "completed" | "failed";
}

// -----------------------------------------------------------------------------
// Skill 执行状态
// -----------------------------------------------------------------------------

export type SkillStatus =
  | "pending"
  | "running"
  | "completed"
  | "warning"
  | "failed";

export interface SkillRun {
  id: string;
  name: string;
  status: SkillStatus;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  keyFindings?: string[];
  warnings?: string[];
  output?: any;
}

// -----------------------------------------------------------------------------
// 样本分层结果
// -----------------------------------------------------------------------------

export interface SampleSegment {
  count: number;
  ratio: number;
  sampleIds: string[];
  criteria: string[];
  reason: string;
}

export interface SampleSegmentationResult {
  totalCount: number;
  segments: {
    highValueHumanLabeling: SampleSegment;
    boundaryCases: SampleSegment;
    machineAuto: SampleSegment;
    aiPrelabelHumanConfirm: SampleSegment;
    humanFallback: SampleSegment;
    notRecommended: SampleSegment;
  };
}

// -----------------------------------------------------------------------------
// 人工投入测算
// -----------------------------------------------------------------------------

export interface HumanEffortBaseline {
  fullManualSampleCount: number;
  avgSecondsPerItem: number;
  totalHours: number;
  personDays: number;
  estimatedPeopleNeeded?: number;
}

export interface HumanEffortOptimized {
  machineAutoCount: number;
  aiPrelabelCount: number;
  humanRequiredCount: number;
  qualitySamplingCount: number;
  totalHours: number;
  personDays: number;
  estimatedPeopleNeeded?: number;
}

export interface HumanEffortReduction {
  sampleReductionRatio: number;
  hourReductionRatio: number;
  reason: string[];
}

export interface HumanEffortEstimate {
  baseline: HumanEffortBaseline;
  optimized: HumanEffortOptimized;
  reduction: HumanEffortReduction;
}

// -----------------------------------------------------------------------------
// 机审能力评估
// -----------------------------------------------------------------------------

export interface MachineAuditAssessment {
  machineCoverageRatio: number;
  highConfidenceAutoRatio: number;
  prelabelCandidateRatio: number;
  humanFallbackRatio: number;
  strengthLabels: string[];
  weaknessLabels: string[];
  errorPatterns: string[];
  judgement: string;
}

// -----------------------------------------------------------------------------
// 价值评分
// -----------------------------------------------------------------------------

export interface ValueScoreDimensions {
  /** 数据产出价值 0-20 */
  dataOutputValue: number;
  /** 业务价值 0-15 */
  businessValue: number;
  /** 规则可判定性 0-15 */
  ruleJudgability: number;
  /** 样本池价值 0-15 */
  sampleValue: number;
  /** 机审减量潜力 0-15 */
  machineAuditPotential: number;
  /** 人工减量价值 0-10 */
  humanReductionValue: number;
  /** 交付风险可控性 0-10 */
  deliveryRiskControl: number;
}

export interface ValueScore {
  totalScore: number;
  dimensions: ValueScoreDimensions;
}

// -----------------------------------------------------------------------------
// 最终评估结果
// -----------------------------------------------------------------------------

/**
 * 决策枚举：直接回答"值不值得标 + 谁来标"两问，避免「改造后投入」类模糊中间态
 * - 无需重标·复用历史资产 / 暂不建议标·价值不足 / 暂不建议标·待补齐前置 → 答 Q1=不标
 * - 机器为主 / 人机协同 / 人工为主 → 答 Q1=值得标，且给出 Q2
 */
export type FinalDecision =
  | "无需重标·复用历史资产"
  | "暂不建议标·价值不足"
  | "暂不建议标·待补齐前置"
  | "机器为主"
  | "人机协同"
  | "人工为主";

/**
 * 三问核心结论 —— 直接对应老板视角：
 *   Q1 值不值得标 / Q2 机器还是人标 / Q3 各占多少
 */
export interface CoreVerdict {
  /** Q1：需不需要标 */
  worthLabeling: {
    verdict: "值得标" | "暂不建议标" | "无需重标";
    headline: string;
    reasons: string[];
  };
  /** Q2：是机器标还是人标 */
  labelingMode: {
    mode: "机器为主" | "人机协同" | "人工为主" | "暂不投入";
    headline: string;
    reasons: string[];
  };
  /** Q3：各占多少（样本 + 题目两个维度） */
  scaleSplit: {
    /** 样本总数 */
    totalSamples: number;
    /** 机审直接产出（高置信 / 历史一致） */
    machineAutoCount: number;
    /** AI 预标 + 人工核对 */
    aiAssistCount: number;
    /** 必须人工（高价值 + 边界 + 兜底） */
    humanCount: number;
    /** 暂不建议投入 */
    excludeCount: number;
    /** 总判定题目数 */
    totalQuestions: number;
    /** 机器/AI 可承接的题目数（machine_auto + ai_prefill） */
    machineQuestionCount: number;
    /** AI 辅助 + 人工核对的题目数（ai_assist） */
    aiAssistQuestionCount: number;
    /** 必须人工的题目数（human_only） */
    humanQuestionCount: number;
    /** 样本机器/AI 直接承接率 = (machineAuto + aiAssist) / total */
    machineCarryRatio: number;
    /** 样本必须人工占比 = human / total */
    humanRatio: number;
    /** 优化后人工人天 */
    personDays: number;
    /** 全人工人天（基线） */
    baselinePersonDays: number;
  };
}

export interface FinalTaskValueAssessment {
  finalDecision: FinalDecision;
  /** 边界带置信度提示：当价值/能力轴落在切换点 ±2 分内时给出，例如"能力轴 22/30 刚过临界，建议保留人工兜底通道" */
  decisionConfidence?: string;
  /** 三问核心结论：值不值得标 / 谁来标 / 各占多少 */
  coreVerdict: CoreVerdict;
  valueScore: ValueScore;
  dataOutputGoals: string[];
  sampleStrategy: SampleSegmentationResult;
  humanEffortEstimate: HumanEffortEstimate;
  machineAuditAssessment: MachineAuditAssessment;
  /** 题目级 AI vs 人工拆分 */
  fieldAnalysis: FieldLevelAnalysisOutput;
  /** 人工必要性结论：是否需要 / 做什么 / 做多少 */
  humanWork: HumanWorkVerdict;
  /** 疑难/边界样本 Top 列表 */
  boundaryCaseRanking: BoundaryCaseItem[];
  /** 历史标注结果可复用度（用于评分卡解释） */
  historicalReusability: "高" | "中" | "低" | "—";
  /** 数据资产可复用度（用于评分卡解释） */
  assetReusability: "高" | "中" | "低" | "—";
  keyReasons: string[];
  risksAndGaps: string[];
  nextStepPlan: string[];
  /** 真实机审 trial 输出（mock/异常时 succeeded=false，下游自动回落） */
  machineAuditTrial?: MachineAuditTrialOutput;
  executiveSummaryMarkdown: string;
  detailedReportMarkdown: string;
}

// -----------------------------------------------------------------------------
// Skill 输出 schema（与 spec 中 JSON 字段一一对应）
// -----------------------------------------------------------------------------

/**
 * 业务诉求 ↔ 拟定方案 ↔ 样本数据 ↔ 目标价值 的论证链结果。
 * 让 Q1（值不值得标）有清晰因果，不再只看 valueScore。
 */
export interface DemandGoalDataFit {
  /** 业务诉求能否被「拟定方案 + 现有样本」满足 */
  fit_level: "可满足" | "部分满足" | "无法满足";
  /** 拟定标注/送审样本能产出什么资产 */
  what_data_produces: string;
  /** 业务诉求实际需要什么 */
  what_demand_needs: string;
  /** 一句话：能/不能产出 → 因此值得/不值得标 */
  fit_reasoning: string;
  /** 一句话商业价值 */
  expected_value: string;
}

export interface TaskGoalOutput {
  task_goal: string;
  task_type: string;
  data_output_goals: string[];
  downstream_usage: string[];
  value_chain: string;
  asset_reusability: "高" | "中" | "低";
  missing_business_context: string[];
  summary: string;
  /** 需求→数据→目标→价值的论证链（Q1 直接来源） */
  demand_goal_data_fit?: DemandGoalDataFit;
}

// -----------------------------------------------------------------------------
// 真实机审 trial 实测（Q2/Q3 核心驱动）
// -----------------------------------------------------------------------------

/**
 * trial 在某个细分类目上的命中情况，决定该类目走机审/预标/人工。
 */
export interface CategoryTrialResult {
  category: string;
  sampleCount: number;
  matchCount: number;
  /** 0..1 */
  accuracy: number;
  /** acc≥0.90 → machine_auto；0.70-0.90 → ai_prelabel；<0.70 → human_required */
  mode: "machine_auto" | "ai_prelabel" | "human_required";
  reason: string;
}

/**
 * 真实机审 trial 输出：
 *  - 失败/未跑（mock 或异常）→ attempted=true, succeeded=false → 下游回落到原启发式
 *  - 成功 → attempted=true, succeeded=true，decision/segmentation 直接用 per_category.mode 外推
 */
export interface MachineAuditTrialOutput {
  attempted: boolean;
  succeeded: boolean;
  /** 给 LLM 用的 system 提示词 */
  trial_system_prompt: string;
  /** 单样本的 user 模板，可含 {{textFields}}, {{category}} 占位符 */
  trial_user_template: string;
  /** 候选标签集合（从已有 label 去重而来） */
  label_space: string[];
  /** 真正参与 trial 的样本条数（含 label 的样本） */
  trial_sample_count: number;
  /** trial 整体 accuracy；0 表示无可统计样本 */
  overall_accuracy: number;
  /** 每个细分类目的 trial 结果 */
  per_category: CategoryTrialResult[];
  /** trial 推荐的整体机审策略；对齐 CoreVerdict.labelingMode.mode */
  recommended_mode: "机器为主" | "人机协同" | "人工为主";
  /** 失败/未跑时的原因 */
  failure_reason?: string;
  summary: string;
}

export interface RuleJudgabilityOutput {
  judgability_level: "高" | "中" | "低";
  rule_clarity: "高" | "中" | "低";
  rule_conflicts: string[];
  subjective_judgement_points: string[];
  machine_readable_rule_points: string[];
  ai_assisted_rule_points: string[];
  human_required_rule_points: string[];
  risk_points: string[];
  summary: string;
}

export interface SampleSegmentJSON {
  count: number;
  ratio: number;
  criteria: string[];
  reason: string;
  sample_ids?: string[];
}

export interface SampleSegmentationOutput {
  sample_count: number;
  sample_distribution: {
    category_distribution: Record<string, number>;
    label_distribution: Record<string, number>;
    risk_type_distribution: Record<string, number>;
    difficulty_distribution: Record<string, number>;
  };
  sample_quality_issues: string[];
  sample_value_segments: {
    high_value_human_labeling: SampleSegmentJSON;
    boundary_cases: SampleSegmentJSON;
    machine_auto: SampleSegmentJSON;
    ai_prelabel_human_confirm: SampleSegmentJSON;
    human_fallback: SampleSegmentJSON;
    not_recommended: SampleSegmentJSON;
  };
  /** Top N 疑难/边界样本（含原因） */
  boundary_case_ranking: BoundaryCaseItem[];
  recommended_labeling_scope: string;
  summary: string;
}

export interface HistoricalQualityOutput {
  historical_label_distribution: Record<string, number>;
  quality_baseline: {
    agreement_rate: string;
    quality_pass_rate: string;
    high_error_labels: string[];
    unstable_labels: string[];
  };
  human_labeling_risks: string[];
  unstable_rule_points: string[];
  historical_result_reusability: "高" | "中" | "低";
  summary: string;
}

export interface MachineAuditCoverageOutput {
  machine_coverage: string;
  high_confidence_auto_ratio: string;
  prelabel_candidate_ratio: string;
  human_fallback_ratio: string;
  machine_strength_labels: string[];
  machine_weakness_labels: string[];
  machine_error_patterns: string[];
  machine_capability_judgement: string;
  recommended_thresholds: {
    auto_threshold: number;
    prelabel_threshold: number;
    fallback_threshold: number;
  };
  summary: string;
}

export interface HumanEffortEstimationOutput {
  baseline_human_effort: {
    full_manual_sample_count: number;
    estimated_time_per_item_seconds: number;
    estimated_total_hours: number;
    estimated_person_days: number;
    estimated_people_needed: number;
  };
  optimized_human_effort: {
    machine_auto_count: number;
    ai_prelabel_count: number;
    human_required_count: number;
    quality_sampling_count: number;
    estimated_total_hours: number;
    estimated_person_days: number;
    estimated_people_needed: number;
  };
  reduction_space: {
    sample_reduction_ratio: string;
    human_hour_reduction_ratio: string;
    reduction_reason: string[];
  };
  summary: string;
}

export interface StrategyOutput {
  data_production_strategy: {
    target_dataset: string[];
    sample_selection_strategy: string;
    labeling_strategy: string;
    quality_strategy: string;
    machine_audit_strategy: string;
  };
  human_machine_collaboration: {
    machine_auto: string[];
    ai_prelabel_human_confirm: string[];
    human_focus: string[];
    exclude_or_hold: string[];
  };
  pilot_plan: {
    pilot_sample_size: number;
    pilot_duration: string;
    acceptance_metrics: string[];
  };
  scale_plan: {
    scale_condition: string[];
    scale_risks: string[];
    required_improvements: string[];
  };
  summary: string;
}

export interface ReportOutput {
  executive_summary_markdown: string;
  detailed_report_markdown: string;
}

// -----------------------------------------------------------------------------
// 整体 Agent 运行结果（API 返回结构）
// -----------------------------------------------------------------------------

export interface AgentRunResult {
  task: EvaluationTask;
  skills: SkillRun[];
  assessment: FinalTaskValueAssessment;
  /** 调试 / 后续多轮反思预留 */
  conflicts?: string[];
  needsAdditionalContext?: string[];
}
