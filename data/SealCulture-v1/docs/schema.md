# SealCulture-v1 数据字段说明

对齐 SilverHeritage-GZ-v1 的 schema 组织；实体形状由 `lib/heritage/types.ts`
的 Zod schema 定义（机制文件，一行未改）——本文件是该 schema 在印章域的
字段语义与取值口径。

## 通用字段（source-first 铁律）
- `id`: 稳定唯一 ID（`SRC-`/`MOTIF-`/`CRAFT-`/`ITEM-`/`REG-`/`PROJ-`/`PERSON-`/`RULE-` 前缀）
- `description` / `facts`: 对知识单元的来源型描述（转述或引号直录，不创作）
- `source_ids`: 必填，指向 `sources.json`；缺来源的条目不入库
- `evidence_level`: 见下表。注：`cultural_rules.json` 沿用三件套既定 schema
  （CulturalRuleSchema 无 evidence_level 字段，机制解析时忽略该键），但本数据集
  仍为每条规则标注 evidence_level 以满足 100% 溯源断言。

## evidence_level（来源类型，印章域口径）
- `official`: 官方登记源。**本 V1 不使用**（暂无官方登记源接入，宁缺毋滥）。
- `museum`: 馆藏/素材实有印证（yinding 馆藏棚拍、章体棚拍、RENAME-LOG 著录）。
- `academic`: 教材/印论/调研报告转述（02/05/06/08 报告及其引用源）。
- `interview`: 访谈（预留，暂无）。
- `inference`: AI 生成解释，必须独立保存，不得混入以上字段。

## claim level（断言强度，机制内由 evidence 模块推导）
断言强度**只降不升**：`official→official`、`museum/academic/interview→documented`、
`inference→interpretive`、无来源→`unknown`。本数据集全部实体（museum/academic）
推导后上限为 `documented`，永远不会凭空出现 `official` 断言；
`visual_only / interpretive / unknown` 不得被 AI 推理升级为文化事实（guardrail RULE-007）。

## 实体文件（data/）
| 文件 | 实体 | 本版数量 | 说明 |
|---|---|---|---|
| sources.json | 来源著录 | 9 | 调研报告/产品文档/素材库/著录台账；`url` 为内部资料定位路径 |
| motifs.json | 印章文化元素 | 20 | CE-01~CE-17 同名并入 + 3 条扩充；`documented_meaning` 全部 null（无来源著录文化义，如实留空） |
| crafts.json | 篆刻技法 | 8 | 薄意/浅刻/深雕兼镂雕/高浮雕/圆雕印钮/减地浅浮雕/俏色巧雕/边款刻制 |
| heritage_items.json | 传统印式与名品 | 12 | 汉印正格/回文印/日字格半通/田字格官印/随形/椭圆引首/元朱文/九叠篆官印/鸟虫篆/肖形印/十字井字界/多字官印三列式 |
| regional_styles.json | 印风流派 | 0 | 空置：流派归属细节材料不足以核实，不编造 |
| projects.json | 篆刻非遗项目 | 1 | 「篆刻 2009 入选人类非遗代表作名录」转述公开资料，条目内标注对外使用前需官方源复核 |
| people.json | 印人/匠人 | 0 | 空置：等外部背书人落实 |
| cultural_rules.json | 文化护栏规则 | 7 | 自 SilverHeritage cultural_rules.json 全部 7 条直译改写域词 |
| cultural-match.json | 文化匹配引导层 | 19 元素/5 系列/24 件/9 场景 | 由 data/cultural-match/seal-culture-v1.json 升级并入（唯一真身）；schema 见 `lib/cultural-match/repository.ts`（Zod 契约：每场景恰 3 元素） |

## region 字段口径
印章域知识多数无地域归属，统一如实填「无地域著录」（三件套 region 解析按
unattributed 处理，UI 呈现诚实兜底，不强行归属——RULE-002）；projects 的
region「中国」来自名录表述本身。

## AI 使用原则
RAG/匹配返回时必须同时返回：
- knowledge text
- region（或诚实兜底）
- source
- evidence level

禁止只返回一句"这个纹样代表吉庆/权威"而不返回证据。
