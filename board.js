import { createClient } from "@supabase/supabase-js";
import { t, onLangChange } from "./i18n.js";

// ---------------------------------------------------------------------------
// Guestbook corkboard: shared sticky notes backed by Supabase.
// The publishable key below is safe to expose client-side (that's its
// purpose) — write access is gated by Postgres row-level security policies
// keyed on the anonymous auth session, not by hiding this key.
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://wgnxzldwlqixzkosuvlb.supabase.co";
const SUPABASE_KEY = "sb_publishable_w8Wlth7qwsXZNqfoxRWRVg_3TZivxlN";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NAME_KEY = "studyroom_board_name";
const NOTE_COLORS = ["#fff6a8", "#ffd6e8", "#c8f3d0", "#cfe3ff", "#ffe0b3"];
const FONT_COLORS = ["#2c2416", "#a5342b", "#1d4ed8", "#166534", "#f8f4ea"];

const boardModal = document.getElementById("board-modal");
const boardCloseBtn = document.getElementById("board-close");
const boardCanvas = document.getElementById("board-canvas");

const noteDetail = document.getElementById("note-detail");
const noteDetailCloseBtn = document.getElementById("note-detail-close");
const noteDetailAuthor = document.getElementById("note-detail-author");
const noteDetailContent = document.getElementById("note-detail-content");
const noteDetailTime = document.getElementById("note-detail-time");
const noteDetailDelete = document.getElementById("note-detail-delete");
const noteRepliesEl = document.getElementById("note-replies");
const replyForm = document.getElementById("reply-form");
const replyNameInput = document.getElementById("reply-name-input");
const replyInput = document.getElementById("reply-input");
const replySubmitBtn = replyForm.querySelector('button[type="submit"]');
const boardTitleEl = document.querySelector("#board-panel h2");
const boardHintEl = document.querySelector(".board-hint");

let myUserId = null;
let notesCache = [];
let currentNoteId = null;
let composerOpen = false;

function refreshBoardText() {
  boardCloseBtn.setAttribute("aria-label", t("boardClose"));
  boardTitleEl.textContent = t("boardTitle");
  boardHintEl.textContent = t("boardHint");
  noteDetailCloseBtn.textContent = t("noteBack");
  noteDetailCloseBtn.setAttribute("aria-label", t("noteBackAria"));
  noteDetailDelete.textContent = t("noteDelete");
  replyNameInput.placeholder = t("replyNamePlaceholder");
  replyInput.placeholder = t("replyInputPlaceholder");
  replySubmitBtn.textContent = t("replySubmit");
}
refreshBoardText();
onLangChange(refreshBoardText);

function getSavedName() {
  return localStorage.getItem(NAME_KEY) || "";
}
function saveName(name) {
  localStorage.setItem(NAME_KEY, name);
}

async function ensureAuth() {
  if (myUserId) return myUserId;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    myUserId = session.user.id;
    return myUserId;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error("Supabase anonymous sign-in failed", error);
    return null;
  }
  myUserId = data.user.id;
  return myUserId;
}

async function loadNotes() {
  const { data, error } = await supabase
    .from("board_notes")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load board notes", error);
    return;
  }
  notesCache = data;
  renderNotes();
}

function renderNotes() {
  boardCanvas.querySelectorAll(".sticky-note").forEach((el) => el.remove());
  notesCache.forEach(addNoteEl);
}

function formatStamp(iso) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}.${m}.${day}`, time: `${hh}:${mm}` };
}

function addNoteEl(note, { animateStamp = false } = {}) {
  const el = document.createElement("div");
  el.className = "sticky-note";
  el.dataset.noteId = note.id;
  el.style.left = `${note.x}%`;
  el.style.top = `${note.y}%`;
  el.style.background = note.color;
  el.style.color = note.font_color || "#2c2416";
  el.style.transform = `translate(-50%, -50%) rotate(${note.rotation}deg)`;

  const author = document.createElement("div");
  author.className = "sticky-author";
  author.textContent = note.author_name;
  const content = document.createElement("div");
  content.className = "sticky-content";
  content.textContent = note.content;

  const stamp = document.createElement("div");
  stamp.className = "note-stamp" + (animateStamp ? " stamp-animate" : "");
  const ring = document.createElement("div");
  ring.className = "stamp-ring";
  const { date, time } = formatStamp(note.created_at);
  const dateEl = document.createElement("div");
  dateEl.className = "stamp-date";
  dateEl.textContent = date;
  const timeEl = document.createElement("div");
  timeEl.className = "stamp-time";
  timeEl.textContent = time;
  ring.append(dateEl, timeEl);
  stamp.appendChild(ring);

  el.append(author, content, stamp);

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    openNoteDetail(note);
  });
  boardCanvas.appendChild(el);
}

boardCanvas.addEventListener("click", (e) => {
  if (e.target !== boardCanvas) return; // clicked an existing note, not empty cork
  if (composerOpen) return; // finish or cancel the current draft first

  const rect = boardCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return;

  openComposer(x, y);
});

function buildSwatchRow(colors, initial, onPick) {
  const row = document.createElement("div");
  row.className = "swatch-row";
  colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "swatch" + (c === initial ? " selected" : "");
    btn.style.background = c;
    btn.addEventListener("click", () => {
      row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("selected"));
      btn.classList.add("selected");
      onPick(c);
    });
    row.appendChild(btn);
  });
  return row;
}

function openComposer(x, y) {
  composerOpen = true;
  let bgColor = NOTE_COLORS[0];
  let fontColor = FONT_COLORS[0];

  const draft = document.createElement("div");
  draft.className = "sticky-note sticky-draft";
  draft.style.left = `${x}%`;
  draft.style.top = `${y}%`;
  draft.style.background = bgColor;
  draft.style.transform = "translate(-50%, -50%)";
  draft.addEventListener("click", (e) => e.stopPropagation());

  const nameInput = document.createElement("input");
  nameInput.className = "sticky-name-input";
  nameInput.placeholder = t("composerNamePlaceholder");
  nameInput.maxLength = 30;
  nameInput.value = getSavedName();

  const textarea = document.createElement("textarea");
  textarea.className = "sticky-textarea";
  textarea.maxLength = 200;
  textarea.placeholder = t("composerTextPlaceholder");
  textarea.style.color = fontColor;

  const bgRow = buildSwatchRow(NOTE_COLORS, bgColor, (c) => {
    bgColor = c;
    draft.style.background = c;
  });
  const fontRow = buildSwatchRow(FONT_COLORS, fontColor, (c) => {
    fontColor = c;
    textarea.style.color = c;
  });

  const actions = document.createElement("div");
  actions.className = "draft-actions";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "draft-back";
  backBtn.textContent = t("draftBack");
  backBtn.addEventListener("click", () => {
    draft.remove();
    composerOpen = false;
  });

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "draft-pin";
  pinBtn.textContent = t("draftPin");
  pinBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim().slice(0, 30);
    const content = textarea.value.trim().slice(0, 200);
    if (!name || !content) {
      alert(t("needNameContent"));
      return;
    }
    saveName(name);

    const userId = await ensureAuth();
    if (!userId) {
      alert(t("connectFailed"));
      return;
    }

    const newNote = {
      author_id: userId,
      author_name: name,
      content,
      x,
      y,
      rotation: Math.random() * 16 - 8,
      color: bgColor,
      font_color: fontColor,
    };
    const { data, error } = await supabase.from("board_notes").insert(newNote).select().single();
    if (error) {
      console.error("Failed to post note", error);
      alert(t("postFailed"));
      return;
    }
    draft.remove();
    composerOpen = false;
    notesCache.push(data);
    addNoteEl(data, { animateStamp: true });
  });

  actions.append(backBtn, pinBtn);
  draft.append(nameInput, textarea, bgRow, fontRow, actions);
  boardCanvas.appendChild(draft);
  textarea.focus();
}

async function openNoteDetail(note) {
  currentNoteId = note.id;
  noteDetailAuthor.textContent = note.author_name;
  noteDetailContent.textContent = note.content;
  const { date, time } = formatStamp(note.created_at);
  noteDetailTime.textContent = `${t("stampedAt")} ${date} ${time}`;
  noteDetailDelete.classList.toggle("hidden", note.author_id !== myUserId);
  replyNameInput.value = getSavedName();
  noteDetail.classList.remove("hidden");
  await loadReplies(note.id);
}

async function loadReplies(noteId) {
  const { data, error } = await supabase
    .from("board_replies")
    .select("*")
    .eq("note_id", noteId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Failed to load replies", error);
    return;
  }
  renderReplies(data);
}

function renderReplies(replies) {
  noteRepliesEl.innerHTML = "";
  replies.forEach((reply) => {
    const row = document.createElement("div");
    row.className = "reply-row";

    const text = document.createElement("span");
    text.className = "reply-text";
    const author = document.createElement("b");
    author.textContent = reply.author_name + ": ";
    text.append(author, document.createTextNode(reply.content));
    row.appendChild(text);

    if (reply.author_id === myUserId) {
      const del = document.createElement("button");
      del.className = "reply-delete";
      del.textContent = "×";
      del.addEventListener("click", async () => {
        const { error } = await supabase.from("board_replies").delete().eq("id", reply.id);
        if (error) {
          console.error("Failed to delete reply", error);
          return;
        }
        loadReplies(currentNoteId);
      });
      row.appendChild(del);
    }
    noteRepliesEl.appendChild(row);
  });
}

replyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = replyInput.value.trim().slice(0, 200);
  const name = replyNameInput.value.trim().slice(0, 30);
  if (!content || !name || !currentNoteId) return;

  const userId = await ensureAuth();
  if (!userId) {
    alert(t("connectFailed"));
    return;
  }
  saveName(name);

  const { error } = await supabase.from("board_replies").insert({
    note_id: currentNoteId,
    author_id: userId,
    author_name: name,
    content,
  });
  if (error) {
    console.error("Failed to post reply", error);
    alert(t("replyFailed"));
    return;
  }
  replyInput.value = "";
  loadReplies(currentNoteId);
});

noteDetailDelete.addEventListener("click", async () => {
  if (!currentNoteId) return;
  if (!confirm(t("confirmDeleteNote"))) return;
  const { error } = await supabase.from("board_notes").delete().eq("id", currentNoteId);
  if (error) {
    console.error("Failed to delete note", error);
    alert(t("deleteFailed"));
    return;
  }
  notesCache = notesCache.filter((n) => n.id !== currentNoteId);
  boardCanvas.querySelector(`[data-note-id="${currentNoteId}"]`)?.remove();
  noteDetail.classList.add("hidden");
});

noteDetailCloseBtn.addEventListener("click", () => {
  noteDetail.classList.add("hidden");
});

function closeBoard() {
  boardModal.classList.add("hidden");
  noteDetail.classList.add("hidden");
  boardCanvas.querySelector(".sticky-draft")?.remove();
  composerOpen = false;
}
boardCloseBtn.addEventListener("click", closeBoard);
boardModal.addEventListener("click", (e) => {
  if (e.target === boardModal) closeBoard();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !boardModal.classList.contains("hidden")) closeBoard();
});

export async function openBoard() {
  boardModal.classList.remove("hidden");
  await ensureAuth();
  await loadNotes();
}
