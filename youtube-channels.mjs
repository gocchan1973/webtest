// 3要素目は任意オプション（現状 { toolWatch } のみ）。
// toolWatch を解釈するのは claude-update/watch.mjs のみで、本命の収集経路である
// youtube-rss.mjs はこのフィールドを読まない。よって本命の候補収集は不変。
export const youtubeChannels = [
  ['ai_masaou', 'まさおAIじっくり解説ch'], ['google-school', 'こーすけ先生のGoogle塾'], ['rengaku-ai2', 'れん学長のAIツール実験室'], ['aibusiness8877', 'じゅりん│AIビジネス活用塾'], ['NI-WORK', 'NI-WORK'], ['RICOのAIラボ', 'RICOのAIラボ | AIで業務をもっと楽しく'], ['cocona_ai_school', 'ここなのAI大学'], ['ウェブマニア', 'ウェブマニア'], ['ayy_tech', 'あやや の ITスキルアップ塾'], ['genAI-topic', 'ジェネトピ | AIラジオ'], ['irukano_ecchan', 'Appsheet教室@イルカのえっちゃんねる'], ['imanyu_programming', 'いまにゅのAIプログラミング塾'], ['AI_aaafrog', 'AIで創作効率化とマネタイズby嗚呼蛙'], ['keitoaiweb', 'KEITO【AI&WEB ch】'], ['ai_jitan_lab', 'AI時短ラボ'], ['tech_news_ati', 'テックニュース@ATI', { toolWatch: true }], ['webshokutv', 'ウェブ職TV@AIセキュリティ専門'], ['AICoCreation', 'AI共創イノベーション'], ['ai.seitai', 'AI整体師'],
].map(([handle, label, options]) => ({ handle, label, ...options }));
