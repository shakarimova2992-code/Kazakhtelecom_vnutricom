/* ==========================================================================
   ЕСТЬ КОНТАКТ! — слой данных

   Это единая точка входа для всех операций с данными. Сегодня она работает
   на localStorage (демо-режим, данные видны только в этом браузере).

   Чтобы подключить реальный бэкенд (Firebase/Supabase) для работы
   "все сотрудники → один модератор", нужно переписать методы внутри
   FirebaseAdapter (см. ниже) и переключить DataStore.useAdapter('firebase').
   Контракт методов (сигнатуры и формат возвращаемых данных) менять не нужно —
   весь остальной код (app.js) обращается только к объекту DataStore.
   ========================================================================== */

const STORAGE_KEY = "estkontakt_submissions_v1";
const SESSION_KEY = "estkontakt_session_v1";

/* ---------- Вспомогательное: генерация id и текущей даты ---------- */
function genId() {
  return "EK-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random() * 900 + 100);
}

/* ==========================================================================
   Адаптер 1: LocalStorage (по умолчанию, работает без сервера)
   ========================================================================== */
const LocalAdapter = {
  async init() {
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    }
  },

  async addSubmission(data) {
    const list = this._readAll();
    const submission = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: "new", // new | processing | published | rejected
      posts: { ru: "", kk: "" },
      rejectReason: "",
      ...data
    };
    list.unshift(submission);
    this._writeAll(list);
    return submission;
  },

  async listSubmissions(filter) {
    let list = this._readAll();
    if (filter && filter.status && filter.status !== "all") {
      list = list.filter(s => s.status === filter.status);
    }
    if (filter && filter.contact) {
      const c = filter.contact.trim().toLowerCase();
      list = list.filter(s => (s.contact || "").trim().toLowerCase() === c);
    }
    return list;
  },

  async getSubmission(id) {
    return this._readAll().find(s => s.id === id) || null;
  },

  async updateSubmission(id, patch) {
    const list = this._readAll();
    const idx = list.findIndex(s => s.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    this._writeAll(list);
    return list[idx];
  },

  async counts() {
    const list = this._readAll();
    return {
      total: list.length,
      new: list.filter(s => s.status === "new").length,
      processing: list.filter(s => s.status === "processing").length,
      published: list.filter(s => s.status === "published").length,
      rejected: list.filter(s => s.status === "rejected").length
    };
  },

  _readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  _writeAll(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
};

/* ==========================================================================
   Адаптер 2: Firebase (заготовка для реального многопользовательского режима)

   Чтобы включить:
   1) Подключите Firebase SDK в index.html (см. закомментированный пример).
   2) Заполните firebaseConfig ниже своими данными проекта.
   3) Раскомментируйте тело методов и удалите строки-заглушки "throw".
   4) В конце файла замените DataStore.useAdapter("local") на "firebase".

   Рекомендуемая структура Firestore:
     submissions/{id}: {
       createdAt, status, authorName, contact,
       answers: { what, whereWhen, cool, resultType, resultCustom },
       media: [{ name, url, type, size }],   // URL из Firebase Storage
       posts: { ru, kk },
       rejectReason
     }
   Медиафайлы (фото/видео до 200 МБ) заливаются в Firebase Storage,
   а в Firestore хранится только ссылка — localStorage для файлов не подходит.
   ========================================================================== */
const FirebaseAdapter = {
  // firebaseConfig: {
  //   apiKey: "...",
  //   authDomain: "...",
  //   projectId: "...",
  //   storageBucket: "...",
  //   messagingSenderId: "...",
  //   appId: "..."
  // },

  async init() {
    // firebase.initializeApp(this.firebaseConfig);
    // this.db = firebase.firestore();
    // this.storage = firebase.storage();
    throw new Error("FirebaseAdapter не настроен. См. комментарии в js/dataStore.js");
  },

  async addSubmission(data) {
    // const docRef = await this.db.collection("submissions").add({
    //   ...data,
    //   createdAt: new Date().toISOString(),
    //   status: "new",
    //   posts: { ru: "", kk: "" }
    // });
    // return { id: docRef.id, ...data };
    throw new Error("Not implemented");
  },

  async listSubmissions(filter) {
    // let ref = this.db.collection("submissions").orderBy("createdAt", "desc");
    // if (filter?.status && filter.status !== "all") ref = ref.where("status", "==", filter.status);
    // const snap = await ref.get();
    // return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    throw new Error("Not implemented");
  },

  async getSubmission(id) {
    // const doc = await this.db.collection("submissions").doc(id).get();
    // return doc.exists ? { id: doc.id, ...doc.data() } : null;
    throw new Error("Not implemented");
  },

  async updateSubmission(id, patch) {
    // await this.db.collection("submissions").doc(id).update(patch);
    // return this.getSubmission(id);
    throw new Error("Not implemented");
  },

  async counts() {
    throw new Error("Not implemented");
  }
};

/* ==========================================================================
   Адаптер 3: Google Sheets (через Apps Script веб-приложение)

   Простой и бесплатный вариант "все сотрудники → один модератор":
   данные хранятся в Google Таблице, а не в localStorage браузера.

   Чтобы включить:
   1) Разверните AppsScript_DataStore_Backend.gs как веб-приложение
      (см. инструкцию в шапке этого файла).
   2) Вставьте полученную ссылку в config.js → GOOGLE_SHEETS_URL.
   3) Ничего менять в этом файле не нужно — адаптер выберется автоматически
      (см. DataStore.useAdapter(...) в конце файла).
   ========================================================================== */
async function sheetsGet_(params) {
  const res = await fetch(`${GOOGLE_SHEETS_URL}?${params.toString()}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("Google Sheets: не удалось разобрать ответ (проверьте развёртывание Apps Script):", text.slice(0, 300));
    throw new Error("Некорректный ответ от Google Sheets backend");
  }
}

async function sheetsPost_(body) {
  const res = await fetch(GOOGLE_SHEETS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // избегаем CORS-preflight
    body: JSON.stringify(body)
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn("Google Sheets: не удалось разобрать ответ (проверьте развёртывание Apps Script):", text.slice(0, 300));
    throw new Error("Некорректный ответ от Google Sheets backend");
  }
}

const SheetsAdapter = {
  async init() {
    return Promise.resolve();
  },

  async addSubmission(data) {
    const submission = {
      id: genId(),
      createdAt: new Date().toISOString(),
      status: "new",
      posts: { ru: "", kk: "" },
      rejectReason: "",
      ...data
    };
    await sheetsPost_({ action: "add", data: submission });
    return submission;
  },

  async listSubmissions(filter) {
    const params = new URLSearchParams({ action: "list" });
    if (filter && filter.status && filter.status !== "all") params.set("status", filter.status);
    if (filter && filter.contact) params.set("contact", filter.contact);
    const result = await sheetsGet_(params);
    return Array.isArray(result) ? result : [];
  },

  async getSubmission(id) {
    const params = new URLSearchParams({ action: "get", id });
    const result = await sheetsGet_(params);
    return result && result.id ? result : null;
  },

  async updateSubmission(id, patch) {
    const result = await sheetsPost_({ action: "update", id, patch });
    if (result && result.error) throw new Error(result.error);
    return result;
  },

  async counts() {
    const params = new URLSearchParams({ action: "counts" });
    const result = await sheetsGet_(params);
    return result && typeof result.total === "number"
      ? result
      : { total: 0, new: 0, processing: 0, published: 0, rejected: 0 };
  }
};

/* ==========================================================================
   Публичный объект DataStore — с ним работает весь остальной код
   ========================================================================== */
const DataStore = {
  _adapter: LocalAdapter,

  useAdapter(name) {
    this._adapter = name === "firebase" ? FirebaseAdapter
      : name === "sheets" ? SheetsAdapter
      : LocalAdapter;
  },

  init() { return this._adapter.init(); },
  addSubmission(data) { return this._adapter.addSubmission(data); },
  listSubmissions(filter) { return this._adapter.listSubmissions(filter); },
  getSubmission(id) { return this._adapter.getSubmission(id); },
  updateSubmission(id, patch) { return this._adapter.updateSubmission(id, patch); },
  counts() { return this._adapter.counts(); }
};

// Активный адаптер хранения данных.
// Если в config.js указан GOOGLE_SHEETS_URL — используем Google Таблицы,
// иначе откатываемся на localStorage (демо-режим на одном устройстве).
DataStore.useAdapter(
  (typeof GOOGLE_SHEETS_URL !== "undefined" && GOOGLE_SHEETS_URL) ? "sheets" : "local"
);

/* ---------- Простая "сессия" для демо-логина (не настоящая авторизация) ---------- */
const Session = {
  getSourceContact() {
    return sessionStorage.getItem(SESSION_KEY + "_source");
  },
  setSourceContact(contact) {
    sessionStorage.setItem(SESSION_KEY + "_source", contact);
  },
  clearSource() {
    sessionStorage.removeItem(SESSION_KEY + "_source");
  },
  isModerator() {
    return sessionStorage.getItem(SESSION_KEY + "_mod") === "1";
  },
  setModerator(v) {
    if (v) sessionStorage.setItem(SESSION_KEY + "_mod", "1");
    else sessionStorage.removeItem(SESSION_KEY + "_mod");
  }
};
