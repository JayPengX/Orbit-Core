// ---- kit/lang.mjs: the reader's language, the same in every app ----
// What each app kept its own copy of (Weather's lang.mjs, Words' and
// Securities' i18n.mjs): the language picked in any Orbit app (else the
// phone's), a word-pair helper for short labels, and `makeT` for an app's
// string tables.
//
//   import { lang, en, W, makeT } from '#kit/lang.mjs';
//   W('今天', 'Today');
//   const t = makeT({ zh: { hello: '你好 {name}' }, en: { hello: 'Hello {name}' } });
//   t('hello', { name: 'Amy' });

// The one language detector is orbit.mjs's (a saved choice, else the phone's; 'zh' or 'en').
import { detectLang } from '#kit/orbit.mjs';

// The language of this page. Under Node (the tests) Chinese, as the apps are written.
export const lang = typeof document === 'undefined' ? 'zh' : detectLang();
export const en = lang === 'en';

// The words in the reader's language: W('今天', 'Today').
export const W = (zh, english) => (en ? english : zh);

// An app's strings by key: makeT({ zh: {...}, en: {...} }, locale = the page's
// language) gives t(key, { name: value }). {name} in the text is filled in; a
// key missing in English falls back to Chinese, then to the key itself; a
// variable that isn't given is left empty.
export function makeT(strings, locale = lang) {
  const dict = strings?.[locale] || strings?.zh || {};
  return (key, vars = {}) => String(dict[key] ?? strings?.zh?.[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// Taiwan's counties and townships in English: the official names (the national land
// survey's), without District or Township (信義區 Xinyi; 東區 East District), so a
// page in English never shows a place in Chinese. place('信義區') is 'Xinyi' in English
// and itself in Chinese; a name it doesn't know (a station, a stop) stays as it is.
const PLACES = new Map("南投縣:Nantou;嘉義市:Chiayi City;嘉義縣:Chiayi County;基隆市:Keelung;宜蘭縣:Yilan;屏東縣:Pingtung;彰化縣:Changhua;新北市:New Taipei;新竹市:Hsinchu City;新竹縣:Hsinchu County;桃園市:Taoyuan;澎湖縣:Penghu;臺中市:Taichung;臺北市:Taipei;臺南市:Tainan;臺東縣:Taitung;花蓮縣:Hualien;苗栗縣:Miaoli;連江縣:Lienchiang;金門縣:Kinmen;雲林縣:Yunlin;高雄市:Kaohsiung;七堵區:Qidu;七美鄉:Qimei;七股區:Qigu;三地門鄉:Sandimen;三峽區:Sanxia;三星鄉:Sanxing;三民區:Sanmin;三灣鄉:Sanwan;三義鄉:Sanyi;三芝區:Sanzhi;三重區:Sanchong;下營區:Xiaying;中區:Central District;中和區:Zhonghe;中埔鄉:Zhongpu;中壢區:Zhongli;中寮鄉:Zhongliao;中山區:Zhongshan;中正區:Zhongzheng;中西區:West Central District;九如鄉:Jiuru;二崙鄉:Erlun;二林鎮:Erlin;二水鄉:Ershui;五峰鄉:Wufeng;五結鄉:Wujie;五股區:Wugu;仁德區:Rende;仁愛區:Ren'ai;仁愛鄉:Ren'ai;仁武區:Renwu;伸港鄉:Shengang;佳冬鄉:Jiadong;佳里區:Jiali;來義鄉:Laiyi;信義區:Xinyi;信義鄉:Xinyi;元長鄉:Yuanchang;光復鄉:Guangfu;內埔鄉:Neipu;內湖區:Neihu;內門區:Neimen;八德區:Bade;八里區:Bali;公館鄉:Gongguan;六甲區:Liujia;六腳鄉:Liujiao;六龜區:Liugui;冬山鄉:Dongshan;前金區:Qianjin;前鎮區:Qianzhen;北區:North District;北埔鄉:Beipu;北屯區:Beitun;北投區:Beitou;北斗鎮:Beidou;北港鎮:Beigang;北竿鄉:Beigan;北門區:Beimen;卑南鄉:Beinan;卓溪鄉:Zhuoxi;卓蘭鎮:Zhuolan;南化區:Nanhua;南區:South District;南屯區:Nantun;南州鄉:Nanzhou;南庄鄉:Nanzhuang;南投市:Nantou;南港區:Nangang;南澳鄉:Nan'ao;南竿鄉:Nangan;口湖鄉:Kouhu;古坑鄉:Gukeng;吉安鄉:Ji'an;名間鄉:Mingjian;后里區:Houli;和平區:Heping;和美鎮:Hemei;員山鄉:Yuanshan;員林市:Yuanlin;善化區:Shanhua;四湖鄉:Sihu;國姓鄉:Guoxing;土城區:Tucheng;土庫鎮:Tuku;坪林區:Pinglin;埔心鄉:Puxin;埔里鎮:Puli;埔鹽鄉:Puyan;埤頭鄉:Pitou;士林區:Shilin;壯圍鄉:Zhuangwei;壽豐鄉:Shoufeng;外埔區:Waipu;大內區:Danei;大同區:Datong;大同鄉:Datong;大園區:Dayuan;大城鄉:Dacheng;大埔鄉:Dapu;大埤鄉:Dabi;大安區:Da'an;大寮區:Daliao;大村鄉:Dacun;大林鎮:Dalin;大樹區:Dashu;大武鄉:Dawu;大湖鄉:Dahu;大溪區:Daxi;大甲區:Dajia;大社區:Dashe;大肚區:Dadu;大里區:Dali;大雅區:Daya;太保市:Taibao;太平區:Taiping;太麻里鄉:Taimali;學甲區:Xuejia;安南區:Annan;安定區:Anding;安平區:Anping;安樂區:Anle;官田區:Guantian;宜蘭市:Yilan;富里鄉:Fuli;寶山鄉:Baoshan;將軍區:Jiangjun;小港區:Xiaogang;尖石鄉:Jianshi;屏東市:Pingtung;山上區:Shanshang;岡山區:Gangshan;峨眉鄉:Emei;崁頂鄉:Kanding;崙背鄉:Lunbei;左營區:Zuoying;左鎮區:Zuozhen;布袋鎮:Budai;平溪區:Pingxi;平鎮區:Pingzhen;延平鄉:Yanping;彌陀區:Mituo;彰化市:Changhua;後壁區:Houbi;後龍鎮:Houlong;復興區:Fuxing;恆春鎮:Hengchun;成功鎮:Chenggong;文山區:Wenshan;斗六市:Douliu;斗南鎮:Dounan;新化區:Xinhua;新園鄉:Xinyuan;新城鄉:Xincheng;新埔鎮:Xinpu;新埤鄉:Xinpi;新屋區:Xinwu;新市區:Xinshi;新店區:Xindian;新港鄉:Xingang;新營區:Xinying;新社區:Xinshe;新興區:Xinxing;新莊區:Xinzhuang;新豐鄉:Xinfeng;旗山區:Qishan;旗津區:Qijin;春日鄉:Chunri;暖暖區:Nuannuan;望安鄉:Wang'an;朴子市:Puzi;杉林區:Shanlin;東勢區:Dongshi;東勢鄉:Dongshi;東區:East District;東山區:Dongshan;東引鄉:Dongyin;東河鄉:Donghe;東港鎮:Donggang;東石鄉:Dongshi;松山區:Songshan;板橋區:Banqiao;枋寮鄉:Fangliao;枋山鄉:Fangshan;林內鄉:Linnei;林口區:Linkou;林園區:Linyuan;林邊鄉:Linbian;柳營區:Liuying;桃園區:Taoyuan;桃源區:Taoyuan;梅山鄉:Meishan;梓官區:Ziguan;梧棲區:Wuqi;楊梅區:Yangmei;楠梓區:Nanzi;楠西區:Nanxi;樹林區:Shulin;橋頭區:Qiaotou;橫山鄉:Hengshan;歸仁區:Guiren;民雄鄉:Minxiong;水上鄉:Shuishang;水林鄉:Shuilin;水里鄉:Shuili;永和區:Yonghe;永安區:Yong'an;永康區:Yongkang;永靖鄉:Yongjing;汐止區:Xizhi;池上鄉:Chishang;沙鹿區:Shalu;泰安鄉:Tai'an;泰山區:Taishan;泰武鄉:Taiwu;海端鄉:Haiduan;淡水區:Tamsui;深坑區:Shenkeng;清水區:Qingshui;湖內區:Hunei;湖口鄉:Hukou;湖西鄉:Huxi;溪口鄉:Xikou;溪州鄉:Xizhou;溪湖鎮:Xihu;滿州鄉:Manzhou;潭子區:Tanzi;潮州鎮:Chaozhou;烈嶼鄉:Lieyu;烏來區:Wulai;烏坵鄉:Wuqiu;烏日區:Wuri;燕巢區:Yanchao;牡丹鄉:Mudan;獅子鄉:Shizi;獅潭鄉:Shitan;玉井區:Yujing;玉里鎮:Yuli;琉球鄉:Liuqiu;瑞穗鄉:Ruisui;瑞芳區:Ruifang;瑪家鄉:Majia;田中鎮:Tianzhong;田寮區:Tianliao;田尾鄉:Tianwei;甲仙區:Jiaxian;番路鄉:Fanlu;白沙鄉:Baisha;白河區:Baihe;石岡區:Shigang;石碇區:Shiding;石門區:Shimen;礁溪鄉:Jiaoxi;社頭鄉:Shetou;神岡區:Shengang;福興鄉:Fuxing;秀林鄉:Xiulin;秀水鄉:Xiushui;竹北市:Zhubei;竹南鎮:Zhunan;竹塘鄉:Zhutang;竹山鎮:Zhushan;竹崎鄉:Zhuqi;竹東鎮:Zhudong;竹田鄉:Zhutian;綠島鄉:Ludao;線西鄉:Xianxi;羅東鎮:Luodong;美濃區:Meinong;義竹鄉:Yizhu;臺東市:Taitung;臺西鄉:Taixi;芎林鄉:Qionglin;芬園鄉:Fenyuan;花壇鄉:Huatan;花蓮市:Hualien;芳苑鄉:Fangyuan;苑裡鎮:Yuanli;苓雅區:Lingya;苗栗市:Miaoli;茂林區:Maolin;茄萣區:Qieding;草屯鎮:Caotun;莒光鄉:Juguang;莿桐鄉:Citong;萬丹鄉:Wandan;萬巒鄉:Wanluan;萬榮鄉:Wanrong;萬華區:Wanhua;萬里區:Wanli;蘆洲區:Luzhou;蘆竹區:Luzhu;蘇澳鎮:Su'ao;蘭嶼鄉:Lanyu;虎尾鎮:Huwei;褒忠鄉:Baozhong;西區:West District;西屯區:Xitun;西嶼鄉:Xiyu;西港區:Xigang;西湖鄉:Xihu;西螺鎮:Xiluo;觀音區:Guanyin;豐原區:Fengyuan;豐濱鄉:Fengbin;貢寮區:Gongliao;路竹區:Luzhu;車城鄉:Checheng;通霄鎮:Tongxiao;造橋鄉:Zaoqiao;達仁鄉:Daren;那瑪夏區:Namaxia;里港鄉:Ligang;金城鎮:Jincheng;金寧鄉:Jinning;金山區:Jinshan;金峰鄉:Jinfeng;金沙鎮:Jinsha;金湖鎮:Jinhu;銅鑼鄉:Tongluo;長治鄉:Changzhi;長濱鄉:Changbin;關山鎮:Guanshan;關廟區:Guanmiao;關西鎮:Guanxi;阿蓮區:Alian;阿里山鄉:Alishan;集集鎮:Jiji;雙溪區:Shuangxi;霧峰區:Wufeng;霧臺鄉:Wutai;頭份市:Toufen;頭城鎮:Toucheng;頭屋鄉:Touwu;香山區:Xiangshan;馬公市:Magong;高樹鄉:Gaoshu;魚池鄉:Yuchi;鳥松區:Niaosong;鳳山區:Fengshan;鳳林鎮:Fenglin;鶯歌區:Yingge;鹽埔鄉:Yanpu;鹽埕區:Yancheng;鹽水區:Yanshui;鹿港鎮:Lukang;鹿草鄉:Lucao;鹿谷鄉:Lugu;鹿野鄉:Luye;麟洛鄉:Linluo;麥寮鄉:Mailiao;麻豆區:Madou;鼓山區:Gushan;龍井區:Longjing;龍崎區:Longqi;龍潭區:Longtan;龜山區:Guishan".split(';').map(x => x.split(':')));
export const placeEn = name => PLACES.get(String(name ?? '').replace(/台/g, '臺'));
export const place = name => (en ? placeEn(name) || name : name);
