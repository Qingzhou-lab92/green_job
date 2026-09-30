# Career Desk · 个人求职工作台

本地优先、中文界面的 React + TypeScript 求职助手。无需账号、后端服务或 API Key，即可完成档案整理、岗位探索、JD 拆解、简历版本管理、投递跟进与面试练习。AI 由使用者自行配置。

## 本地运行

建议 Node.js 22 或 24 LTS，npm 10+。

```sh
npm ci
npm run dev
```

访问终端显示的地址，默认 http://127.0.0.1:5173 。首次进入为空工作区，点击“体验演示”可载入完全虚构的数据；已有数据时会先要求确认替换。

```sh
npm test
npm run build
npm run preview
```

生产构建输出到 `dist/`。`npm run preview` 默认 http://127.0.0.1:4173 ，用于检查静态构建。不要双击 HTML 以 file:// 形式运行。

浏览器端到端测试（另一个终端保持 `npm run dev`）：

```sh
npm run test:e2e
```

使用本机 Chrome。包含完整流程、数据刷新持久化、备份恢复、无 Key 模拟反馈与 390px 手机布局验证。基础测试使用 Vitest 和 fake-indexeddb，不会请求真实 AI。

## 功能

- **概览**：目标岗位、技能、六状态分布、投递/面试/Offer 统计、近期面试、待办和下一步建议。总记录包括待投递，状态分布不是历史转化率。
- **认识我**：粘贴或导入 TXT/Markdown；本地解析后人工确认草稿。姓名、联系方式、教育、经历、技能与目标均可编辑。经历证据库记录优势、经历、行动、结果和证明材料。原文独立保存，每次保存保留快照。
- **岗位分析**：8 类岗位；按模板技能命中给出明确评分依据、强项、缺口和行动。只是建议，不是人格判断或录用概率。
- **JD 拆解**：保存多份 JD，识别职责、任职要求、硬性条件、加分项与技能词频。区分文本命中、仅登记技能、缺口；学历和年限仍须人工核对。
- **简历定制**：并排查看原文、JD 和改写草稿；本地模拟/真实 AI 建议、手动编辑、另存版本、导出 TXT/Markdown。不会改动原文；无依据处标记“需要补充”。
- **投递看板**：六列拖拽、手机/键盘状态选择；新增、编辑、删除、搜索、筛选；关联 JD、版本、跟进日期和面试时间。
- **面试陪练**：自动创建“面试中”记录，五类题型、回答保存、待改进标记、五维反馈、题库与历史。
- **设置与数据**：AI 配置、连接测试、演示、备份、恢复、CSV 导入预览和全部清空。

## Cloudflare Pages 部署

1. 将此项目根目录的代码推送到 GitHub 仓库。
2. Cloudflare 控制台 → Workers & Pages → Create application → Pages → Import an existing Git repository。
3. 选择 `Qingzhou-lab92/job_agent`，生产分支选 `main`。
4. 框架选择 React (Vite) 或 None；构建命令 `npm run build`；输出目录 `dist`；根目录留空（GitHub 上项目就在仓库根目录）。
5. 可设置 `NODE_VERSION=22`。**不需要任何 AI Key 环境变量，严禁把 Key 设置为 VITE\_*。**
6. Save and Deploy，得到 `https://<项目名>.pages.dev`。后续推送触发重新构建。

也可以在本机 `npm run build` 后，在 Pages 的 Direct Upload 中上传 `dist` 内容。无需 Functions、Worker、D1、R2 或服务器。`public/_headers` 会进入构建并设置 CSP、禁止 iframe、限制敏感浏览器权限等响应头。应用使用单入口内存导航，不依赖服务端路由。

官方说明：https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/

## 备份、恢复与导入

在“设置与数据”点击“导出全部数据”，下载 `job-agent-backup-YYYY-MM-DD.json`。备份含完整个人档案、原文历史、证据、JD、简历版本、投递、待办、题库、面试记录，**不含 API Key 或 AI 配置**。备份本身包含个人信息，请存放在可信位置。

恢复：选择 JSON → 查看记录统计和内容预览 → 确认替换。只有确认后才写入 IndexedDB。结构/版本错误会拒绝导入。支持 `schemaVersion: 1`，可先导出演示备份作为自定义 JSON 模板。

CSV 用于批量追加投递记录，可在页面下载模板。UTF-8 编码，标准 CSV 引号/逗号/换行由 Papa Parse 处理；必需表头 `company,role`；可选 `city,source,date,status,followUp,interviewAt,notes`。状态仅支持：待投递、已投递、笔试、面试、Offer、结束。日期使用 YYYY-MM-DD；面试时间使用 YYYY-MM-DDTHH:mm。CSV 导入会分配新 ID，不自动关联 JD 和版本。文件上限 10 MB。

清空功能只清除此应用数据库及 `career-desk-ai` 配置，不清理其他应用数据。清空前有确认。

浏览器清理站点数据、隐私模式、设备故障可能导致资料丢失。不同浏览器、端口、域名（包括 Pages 预览域名）拥有独立存储；搬迁站点时先导出、再在新域名恢复。不要同时在多个标签页编辑同一份资料（MVP 尚无跨标签页冲突合并）。

## AI Key 安全使用

在设置页填写可信服务商的 Base URL、模型名和自己的 API Key。示例 Base URL 为 `https://api.example.com/v1`，请求使用 `/chat/completions`、Bearer 鉴权、不使用流式返回。留空 Key 时仅生成明确标记的本地模拟结果，不发出请求。

- Key 仅存在用户当前站点的 localStorage；**这不是加密保险库**。同源脚本、恶意扩展、共享电脑使用者有机会读取。使用可信设备，设置低额度/限额，定期轮换，不使用高权限团队密钥。
- 代码、仓库、环境文件、构建产物与 JSON 备份均不包含真实 Key。Git 忽略 `.env*`、数据/备份目录及导出的个人备份。
- 真实调用前提示目标服务商并确认；本次相关 JD、简历或回答会直接发送给该服务商，可能产生费用。请先去除无关的联系方式和敏感材料。
- Base URL 仅允许 HTTPS（本机 localhost/127.0.0.1 可 HTTP）；不接受 URL 内嵌凭据、查询参数。请求 60 秒超时，网络、CORS、HTTP 和空响应都有错误提示。
- 系统提示固定任务，外部文本以 JSON 数据传入；不会执行其中指令，不提供工具调用，也不执行模型返回的 HTML、脚本或 Markdown 链接。提示注入防护不能保证模型绝对不受影响；真实输出标记为建议，用户须核对全部事实。
- 没有分析统计、广告、远程字体或行为追踪。站点托管平台可能保留普通访问日志，但应用不会把个人资料或 Key 发送给站点维护者。

## 纯静态 MVP 边界

- 不提供云同步、账号、跨设备共享、后台提醒或服务器代理；页面关闭后不会后台执行任务。
- AI 服务商必须允许浏览器跨域（CORS）；不允许时纯静态页面无法替其绕过。HTTPS 页面访问本机 HTTP 服务还可能受浏览器混合内容或本地网络权限限制。
- PDF/DOCX 文件解析暂未实现，界面提供复制文本/另存 TXT 的替代路径。
- 本地解析和匹配基于公开规则与词库，无法可靠推断经验年限、否定语义、同义词和实际能力。分数可解释，但不代表招聘结果。
- 本地定制保留原始事实并给出组织建议，真正语言润色需自配 AI；AI 无法自动证明事实，因此任何新增表述必须人工核验。
- 静态文件成功加载后数据操作在本地执行；尚未实现离线 Service Worker，不能承诺无网络时首次打开或刷新页面可用。
- 不做自动投递、自动登录、爬虫、验证码绕过。

## 文件结构

```text
src/App.tsx          七个页面、设置、表单和交互
src/styles.css       Tailwind 入口、工作台样式与手机布局
src/model.ts         Zod 数据结构、类型与 schemaVersion
src/storage.ts       IndexedDB 事务存储和下载
src/logic.ts         本地解析、匹配、模拟和 CSV/JSON 校验
src/ai.ts            OpenAI-compatible 客户端与配置
src/demo.ts          完全虚构的演示资料
src/data/catalog.json 8 类岗位、技能、JD 规则、面试题框架
src/logic.test.ts    数据、匹配与 AI 边界测试
tests/              浏览器完整流程与响应式测试
public/_headers     Cloudflare Pages 响应头
```

思路参考 https://github.com/wksudud/interview-coach-skill 的“静态 Web + 本地数据 + 自配接口”模式，代码与界面独立实现。用户提供的 uiprompt 参考链接构建时返回 404，因此采用深绿侧栏、浅色工作区、克制的卡片与状态图表。
