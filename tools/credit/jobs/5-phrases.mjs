// Job 5: the words people type → the words the laws use, for Orbit Law's 找法
// (public/lib/find.mjs SAME, by hand: 75 groups). Opus 5.5 reads each everyday
// law's articles (key and start) and lists what people would type to find
// them, each with the law's own words and the articles that say it. Code
// keeps only law words that are really in those articles (tools/credit/law-phrases.mjs).
// Out: out/5-phrases.jsonl → Law's public/data/same.json (more groups for
// expand/concepts) and the gold for job 1's test questions.
import { run } from '../lib.mjs';

const DATA = 'https://orbit.jaypengx.com/law/data/';
export const EVERYDAY = ['中華民國憲法', '民法', '中華民國刑法', '民事訴訟法', '刑事訴訟法', '行政程序法', '行政罰法', '訴願法', '行政訴訟法', '國家賠償法', '勞動基準法', '勞工保險條例', '勞工退休金條例', '就業服務法', '性別平等工作法', '職業安全衛生法', '勞資爭議處理法', '工會法', '勞動事件法', '職業災害勞工保護法', '勞工職業災害保險及保護法', '最低工資法', '全民健康保險法', '醫療法', '醫師法', '藥事法', '傳染病防治法', '精神衛生法', '病人自主權利法', '長期照顧服務法', '身心障礙者權益保障法', '社會救助法', '兒童及少年福利與權益保障法', '兒童及少年性剝削防制條例', '家庭暴力防治法', '性騷擾防治法', '性侵害犯罪防治法', '跟蹤騷擾防制法', '老人福利法', '教育基本法', '高級中等教育法', '國民教育法', '大學法', '教師法', '學生輔導法', '特殊教育法', '性別平等教育法', '強迫入學條例', '消費者保護法', '公平交易法', '個人資料保護法', '電子簽章法', '公司法', '商業登記法', '商標法', '著作權法', '專利法', '銀行法', '保險法', '證券交易法', '所得稅法', '營業稅法', '加值型及非加值型營業稅法', '遺產及贈與稅法', '房屋稅條例', '土地稅法', '契稅條例', '稅捐稽徵法', '道路交通管理處罰條例', '公路法', '強制汽車責任保險法', '大眾捷運法', '土地法', '租賃住宅市場發展及管理條例', '公寓大廈管理條例', '建築法', '都市更新條例', '戶籍法', '國籍法', '入出國及移民法', '姓名條例', '兵役法', '替代役實施條例', '公職人員選舉罷免法', '總統副總統選舉罷免法', '公民投票法', '集會遊行法', '社會秩序維護法', '警察職權行使法', '毒品危害防制條例', '槍砲彈藥刀械管制條例', '菸害防制法', '食品安全衛生管理法', '動物保護法', '廢棄物清理法', '噪音管制法', '空氣污染防制法', '洗錢防制法', '詐欺犯罪危害防制條例', '電信管理法', '少年事件處理法', '民法親屬編施行法', '家事事件法', '人工生殖法', '公證法', '提存法', '強制執行法', '消費者債務清理條例', '法律扶助法', '犯罪被害人權益保障法', '政府資訊公開法', '請願法', '原住民族基本法', '客家基本法', '國家語言發展法', '博物館法', '文化資產保存法', '運動產業發展條例', '國民體育法'];
const SCHEMA = { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { say: { type: 'array', items: { type: 'string' } }, law: { type: 'array', items: { type: 'string' } }, arts: { type: 'array', items: { type: 'string' } }, q: { type: 'string' } }, required: ['say', 'law', 'arts', 'q'] } } }, required: ['items'] };
const head = (t, n) => String(t).replace(/\s+/g, '').slice(0, n);

const prompt = (name, rows) => `你在幫一個台灣的法律查詢 App 建同義詞表。一般人（高中生、家長、上班族）用生活的說法查，法條用的是法律用語，所以要把兩者接起來。

下面是《${name}》的條文（條號：開頭）：
${rows}

請找出這部法裡一般人最常想查的事（最多 40 件），每件給：
- say：一般人會打的說法，1 到 4 個（口語、簡短，例如「押金」「被炒魷魚」「加班費」「網購退貨」），不要直接抄法條用語。
- law：這部法在條文裡實際用的詞，1 到 3 個，必須是上面條文原文裡一字不差出現的字串（例如「押租金」「延長工作時間」），2 到 12 個字。
- arts：說這件事的條號（上面列的號碼，例如 "24"、"30-1"），1 到 4 個，最相關的先。
- q：一個一般人會問的完整問題（20 到 40 字，像真的在問，例如「房東不還押金可以怎麼辦？」），它的答案就在 arts 裡。
只寫你有把握、條文真的在講的；寧缺勿濫。用 JSON 回答。`;

async function build() {
  const { laws } = await (await fetch(DATA + 'index.json')).json();
  const byName = new Map(laws.filter(l => !l[5]).map(l => [l[1], l[0]]));
  const reqs = [];
  for (const name of EVERYDAY) {
    const p = byName.get(name);
    if (!p) { console.log('no law', name); continue; }
    const j = await (await fetch(`${DATA}law/${p}.json`)).json();
    const arts = (j.a || []).filter(a => a[0] === 'A' && a[2]);
    // A long law: each article's start, shorter as the law is longer (≈ 24,000 characters).
    const per = Math.max(30, Math.min(160, Math.floor(24_000 / Math.max(1, arts.length))));
    const rows = arts.map(a => `${a[1]}：${head(a[2], per)}`).join('\n');
    reqs.push({ custom_id: p, params: { model: 'claude-opus-5-5', max_tokens: 16000, output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } }, messages: [{ role: 'user', content: prompt(name, rows) }] } });
  }
  return reqs;
}
run('5-phrases', build, 5000);
