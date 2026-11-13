// Words' memory hooks put right by hand (11-13, Jay: "you decide"): the AI's
// Latin and Greek root hooks were read one by one. Kept where the root is
// right and one a Taiwanese high schooler meets again (spect, port, bio…);
// here the ones that were wrong (sovereign isn't reign; toxon is a bow, not
// a poisoned arrow) or only said the word again in Latin, given a cousin
// they already know instead. '' takes a hook away. Applied over the AI's
// cards on every words run (builders/ai.js wordsCards).
export const HOOKS = {
  sovereign: 'sover- 源自拉丁 super（在上）：在最上面的統治者（和 reign 無關）',
  toxic: '希臘文 toxon 是「弓」，toxikon 是塗在箭上的毒：有毒的',
  diabetes: '希臘文 diabētēs「穿流而過」：古人看到喝下的水很快就排出來',
  quarter: '拉丁文 quartus「第四」：四等分的一份，和 quart、quad 同源',
  mineral: 'mine 礦坑 + -al：從礦坑挖出來的東西',
  janitor: '源自羅馬門神 Janus（January 一月也是他）：守門的人',
  circus: '原指圓形競技場，和 circle 圓、circuit 迴路 同源',
  canal: '和 channel 頻道 同源，都是讓東西流過的「水道」',
  disc: '源自希臘文 diskos 圓盤，田徑的 discus 鐵餅 同源',
  globe: '拉丁文 globus 球體，global 全球的 同源',
  major: '拉丁文「更大的」，majority 多數 同源',
  minus: '拉丁文「更少的」，minor 較小的、minimum 最小值 同源',
  calcium: '拉丁文 calx 石灰，chalk 粉筆 同源：粉筆就含鈣',
  sophomore: '希臘文 sophos 聰明 + moros 愚笨（moron 笨蛋 同源）：半懂不懂的二年級生'
};
