// 聊天回复的格式解析（纯函数，方便 node --test 直接测）。
// 模型被要求回三行：
//   第一行 EMOTION:标签
//   第二行 ACTION:nod|shake|tilt|none
//   第三行起 台词
// 但真实回复经常只给其中一行、或者多几个空行，所以这里做宽松解析：
// 两个标签都可以出现在任意位置、缺失都能忍。
export const CHAT_ACTIONS = ["nod", "shake", "tilt"];

// 允许的同义词，避免模型换词就失效
const ACTION_ALIAS = {
  nod: "nod",
  yes: "nod",
  shake: "shake",
  no: "shake",
  refuse: "shake",
  tilt: "tilt",
  confused: "tilt",
  confused_tilt: "tilt",
  none: "",
  "": "",
};

export function parseChatReply(raw) {
  const src = String(raw || "").trim();
  const emotionMatch = src.match(/EMOTION\s*[:：]\s*([A-Za-z_]+)/i);
  const actionMatch = src.match(/ACTION\s*[:：]\s*([A-Za-z_]+)/i);

  let text = src
    .replace(/EMOTION\s*[:：]\s*[A-Za-z_]+\s*/gi, "")
    .replace(/ACTION\s*[:：]\s*[A-Za-z_]+\s*/gi, "")
    .trim();

  // 兼容更老的 [happy] 前缀写法
  let emotionRaw = emotionMatch ? emotionMatch[1].toLowerCase() : "";
  const bracket = text.match(/^\[([A-Za-z_]+)\]\s*([\s\S]*)$/);
  if (bracket) {
    emotionRaw = emotionRaw || bracket[1].toLowerCase();
    text = bracket[2].trim();
  }

  const actionRaw = actionMatch ? actionMatch[1].toLowerCase() : "";
  const action = Object.prototype.hasOwnProperty.call(ACTION_ALIAS, actionRaw)
    ? ACTION_ALIAS[actionRaw]
    : "";

  return { text: text.trim(), emotionRaw, action };
}
