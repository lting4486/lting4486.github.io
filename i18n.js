// Shared language state for the room UI (map / music / guestbook / laptop
// chrome). academic.html has its own toggle but reads/writes the same
// localStorage key, so picking a language on either page keeps both in sync.
const LANG_KEY = "site_lang";

const translations = {
  zh: {
    loadError: "加载失败，检查 assets/study_room.glb 是否存在",
    hint: "试着点点看",
    mapClose: "关闭",
    mapTitle: "去过的地方",
    mapHint: "拖动/滚轮缩放看世界地图 · 点空白处添加标记 · 点已有标记删除它",
    mapPromptName: "这个地方叫什么名字?(可留空)",
    mapMarkerFallback: "标记",
    siteTitle: "Ting Liu",
    musicClose: "关闭",
    boardClose: "关闭",
    boardTitle: "留言板",
    boardHint: "点软木板空白处贴一张便利贴 · 点已有的便利贴查看/回复 · 只能删除自己贴的",
    noteBack: "← 返回",
    noteBackAria: "返回软木板",
    noteDelete: "删除这张便利贴",
    replyNamePlaceholder: "你的名字",
    replyInputPlaceholder: "回复一句…",
    replySubmit: "发送",
    composerNamePlaceholder: "你的名字",
    composerTextPlaceholder: "写点什么…",
    draftBack: "← 返回",
    draftPin: "贴上",
    confirmDeleteNote: "确定删除这张便利贴吗？",
    connectFailed: "连接留言板失败，请稍后再试",
    needNameContent: "名字和内容都要写哦",
    postFailed: "留言失败，请稍后再试",
    replyFailed: "回复失败，请稍后再试",
    deleteFailed: "删除失败，请稍后再试",
    stampedAt: "贴于",
    laptopExit: "← 退出",
    langToggle: "EN",
  },
  en: {
    loadError: "Failed to load — check that assets/study_room.glb exists",
    hint: "try to click",
    mapClose: "Close",
    mapTitle: "Places I've been",
    mapHint: "Drag/scroll to explore the map · click empty space to add a pin · click an existing pin to remove it",
    mapPromptName: "What's this place called? (optional)",
    mapMarkerFallback: "Marker",
    siteTitle: "Ting Liu",
    musicClose: "Close",
    boardClose: "Close",
    boardTitle: "Guestbook",
    boardHint: "Click empty cork to pin a note · click a note to view or reply · you can only delete your own",
    noteBack: "← Back",
    noteBackAria: "Back to corkboard",
    noteDelete: "Delete this note",
    replyNamePlaceholder: "Your name",
    replyInputPlaceholder: "Write a reply…",
    replySubmit: "Send",
    composerNamePlaceholder: "Your name",
    composerTextPlaceholder: "Write something…",
    draftBack: "← Back",
    draftPin: "Pin it",
    confirmDeleteNote: "Delete this note?",
    connectFailed: "Couldn't connect to the guestbook — try again later",
    needNameContent: "Please fill in both your name and a message",
    postFailed: "Failed to post — try again later",
    replyFailed: "Failed to reply — try again later",
    deleteFailed: "Failed to delete — try again later",
    stampedAt: "Posted",
    laptopExit: "← Exit",
    langToggle: "中文",
  },
};

let currentLang = localStorage.getItem(LANG_KEY) === "zh" ? "zh" : "en";
const listeners = new Set();

export function getLang() {
  return currentLang;
}

export function t(key) {
  return translations[currentLang][key];
}

export function setLang(lang) {
  currentLang = lang === "zh" ? "zh" : "en";
  localStorage.setItem(LANG_KEY, currentLang);
  listeners.forEach((fn) => fn(currentLang));
}

export function toggleLang() {
  setLang(currentLang === "zh" ? "en" : "zh");
}

export function onLangChange(fn) {
  listeners.add(fn);
}
