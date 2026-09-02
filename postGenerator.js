/* ==========================================================================
   ЕСТЬ КОНТАКТ! — генератор корпоративного поста

   Это шаблонный генератор (без вызова внешней ИИ-модели): он собирает
   ответы сотрудника в связный текст по правилам корпоративного стиля —
   душевно, непринуждённо, но лаконично.

   ВАЖНО про язык: генератор не переводит текст между русским и казахским —
   он лишь оборачивает СЛОВА СОТРУДНИКА в стилистическую рамку на том языке,
   на котором формируется версия поста. Если сотрудник писал ответы на
   русском, а нужен настоящий казахский перевод (а не просто казахоязычная
   рамка), потребуется подключить реальную ИИ-модель через серверную функцию
   (см. README.md → "Подключение настоящего ИИ"). Там же — готовый пример
   промпта под корпоративный стиль для Claude API.
   ========================================================================== */

const CONNECTORS = {
  ru: {
    openers: ["Свежая новость из наших рядов.", "Есть контакт — и есть повод для гордости.", "Рассказываем, что произошло у нас."],
    // Все варианты ниже — это придаточные конструкции: после них ответ сотрудника
    // подставляется с маленькой буквы, поэтому связка должна грамматически
    // "продолжаться" текстом сотрудника без потери смысла.
    coolLeadIn: ["Особенно приятно, что", "Больше всего впечатляет то, что", "Отдельного внимания заслуживает то, что"],
    resultLeadIn: ["В результате:", "Это уже дало результат —", "Главный эффект:"],
    thanks: ["Спасибо, что делитесь такими историями!", "Гордимся командой и благодарим за новость!", "Именно такие истории делают нас сильнее."]
  },
  kk: {
    openers: ["Біздің қатарымыздан жаңа жаңалық.", "Байланыс орнады — және мақтанатын себеп бар.", "Бізде не болғанын әңгімелейміз."],
    coolLeadIn: ["Ерекше атап өтерлігі —", "Ең қызығы мынада —", "Жеке назар аударарлығы —"],
    resultLeadIn: ["Нәтижесінде:", "Бұл компанияға берген нәтижесі —", "Басты әсері:"],
    thanks: ["Мұндай оқиғалармен бөліскеніңізге рақмет!", "Командамызбен мақтанамыз, жаңалық үшін алғыс айтамыз!", "Дәл осындай оқиғалар бізді күштірек етеді."]
  }
};

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function seedFromId(id) {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return sum;
}

function buildResultText(answers) {
  if (answers.resultType === "custom" && answers.resultCustom) {
    return answers.resultCustom;
  }
  return answers.resultType || "";
}

/* ---------- Утилиты для аккуратной сборки текста ---------- */

// Убирает двойные пробелы/переносы, лишние пробелы по краям.
function sanitizeText(str) {
  if (!str) return "";
  return String(str).replace(/\s+/g, " ").trim();
}

// Первая буква строчная — нужно, когда текст подставляется ВНУТРЬ
// нашего предложения-связки (иначе получается "то, что В Астане...").
function lowerFirst(str) {
  if (!str) return str;
  return str.charAt(0).toLowerCase() + str.slice(1);
}

// Первая буква заглавная — нужно для текста, который начинает
// самостоятельный абзац.
function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Гарантирует точку в конце предложения, если там нет другого
// финального знака препинания (. ! ? …).
function ensureEndPunctuation(str) {
  const clean = sanitizeText(str);
  if (!clean) return clean;
  return /[.!?…]$/.test(clean) ? clean : clean + ".";
}

/**
 * Формирует черновик поста на одном языке.
 * @param {object} submission - объект заявки из DataStore
 * @param {"ru"|"kk"} lang
 */
function generatePostDraft(submission, lang) {
  const c = CONNECTORS[lang] || CONNECTORS.ru;
  const seed = seedFromId(submission.id || "EK-0");
  const a = submission.answers || {};

  const opener = pick(c.openers, seed);
  const coolLeadIn = pick(c.coolLeadIn, seed + 1);
  const resultLeadIn = pick(c.resultLeadIn, seed + 2);
  const thanks = pick(c.thanks, seed + 3);

  const whereWhen = sanitizeText(a.whereWhen);
  const what = ensureEndPunctuation(a.what);
  const cool = ensureEndPunctuation(a.cool);
  const result = ensureEndPunctuation(buildResultText(a));

  const lines = [];

  // Вступление + место/дата — короткая "шапка" поста
  lines.push(opener);
  if (whereWhen) lines.push(`📍 ${whereWhen}`);

  // Основное описание события — отдельный абзац, с заглавной буквы
  if (what) {
    lines.push("");
    lines.push(capitalizeFirst(what));
  }

  // "Что классного" — грамматически продолжает связку, поэтому со строчной буквы
  if (cool) {
    lines.push("");
    lines.push(`${coolLeadIn} ${lowerFirst(cool)}`);
  }

  // Результат — тоже продолжение связки
  if (result) {
    lines.push("");
    lines.push(`${resultLeadIn} ${lowerFirst(result)}`);
  }

  // Благодарность + автор новости
  lines.push("");
  lines.push(thanks);
  if (submission.authorName) {
    lines.push(lang === "kk" ? `— ${submission.authorName} ұсынған жаңалық бойынша` : `— по новости от ${submission.authorName}`);
  }

  return lines.filter((l, i) => !(l === "" && lines[i - 1] === "")).join("\n").trim();
}

function generateBothDrafts(submission) {
  return {
    ru: generatePostDraft(submission, "ru"),
    kk: generatePostDraft(submission, "kk")
  };
}

/* ==========================================================================
   Настоящая ИИ-генерация через серверную функцию (см. server/cloudflare-worker.js)

   Если AI_ENDPOINT не настроен (js/config.js) или сервер недоступен —
   выбрасывает ошибку, и вызывающий код (js/app.js) сам откатывается
   на generateBothDrafts() выше.
   ========================================================================== */
async function generateAIDraft(submission) {
  if (typeof AI_ENDPOINT === "undefined" || !AI_ENDPOINT) {
    throw new Error("AI_ENDPOINT не настроен — см. js/config.js");
  }

  const a = submission.answers || {};
  const result = buildResultText(a);

  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      what: a.what,
      whereWhen: a.whereWhen,
      cool: a.cool,
      result: result,
      authorName: submission.authorName
    })
  });

  if (!response.ok) {
    throw new Error("AI-сервер ответил ошибкой: " + response.status);
  }

  const data = await response.json();
  if (!data.ru || !data.kk) {
    throw new Error("AI-сервер вернул некорректный ответ (нет ru/kk)");
  }

  return { ru: data.ru, kk: data.kk };
}

