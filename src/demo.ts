import { emptyState, uid, today, type State } from "./model";
export function demoState(): State {
  const s = emptyState();
  const date = today();
  s.profile = {
    name: "林晓（演示）",
    contact: "demo@example.com",
    education: "2020–2024 · 示例大学 · 信息管理本科",
    experience:
      "校园服务平台项目：访谈用户，梳理需求并制作 Figma 原型；通过 SQL 分析使用数据，协作完成一次产品迭代。",
    skills: ["需求分析", "用户研究", "Figma", "SQL", "数据分析", "沟通协作"],
    goals: "产品经理 / 数据产品 · 杭州、上海",
    original:
      "林晓（演示）\ndemo@example.com\n教育经历\n2020–2024 示例大学 信息管理本科\n项目经历\n校园服务平台：访谈用户，梳理需求，使用 Figma 制作原型，通过 SQL 分析数据，协作完成产品迭代。\n技能\n需求分析、用户研究、Figma、SQL、数据分析、沟通协作",
    originals: [],
    evidence: [
      {
        id: uid(),
        strength: "从用户问题出发",
        experience: "校园服务平台（演示项目）",
        action: "整理访谈记录，将高频反馈转为需求清单",
        result: "完成原型与一次迭代；无未经验证的提升数字",
        proof: "待添加：访谈记录、原型链接",
      },
    ],
  };
  s.jds = [
    {
      id: uid(),
      title: "产品经理",
      company: "青禾科技（演示）",
      city: "杭州",
      createdAt: new Date().toISOString(),
      raw: "岗位：产品经理\n公司：青禾科技（演示）\n地点：杭州\n岗位职责：负责需求分析、用户研究，推动原型设计与迭代。\n任职要求：熟悉 SQL、数据分析，具备沟通协作能力。\n硬性条件：本科及以上学历。\n加分项：有项目管理经验优先。",
    },
  ];
  s.applications = [
    "青禾科技",
    "远山数据",
    "知行设计",
    "松果科技",
    "蓝岸网络",
    "见微科技",
  ].map((company, i) => ({
    id: uid(),
    company: company + "（演示）",
    role: i % 2 ? "数据产品经理" : "产品经理",
    city: i % 2 ? "上海" : "杭州",
    source: "招聘网站",
    date,
    jdId: s.jds[0].id,
    resumeId: "",
    followUp: date,
    interviewAt: i === 3 ? date + "T15:00" : "",
    notes: "这是虚构演示记录，可编辑或清空。",
    status: (["待投递", "已投递", "笔试", "面试", "Offer", "结束"] as const)[i],
  }));
  s.tasks = [
    { id: uid(), text: "为校园项目补充真实的成果证据", done: false },
    { id: uid(), text: "准备产品经理的 90 秒自我介绍", done: false },
    { id: uid(), text: "梳理目标岗位与意向城市", done: true },
  ];
  return s;
}
