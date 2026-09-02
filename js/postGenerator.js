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
    openers: ["Свежая новость из наших рядов:", "Есть контакт — и есть повод для гордости:", "Рассказываем, что произошло у нас:"],
    coolLeadIn: ["А самое классное вот что:", "И вот что делает эту историю особенной:", "Отдельного внимания заслуживает то, что"],
    resultLeadIn: ["В результате:", "Что это даёт компании:", "Главный эффект:"],
    thanks: ["Спасибо, что делитесь такими историями!", "Гордимся командой и благодарим за новость!", "Именно такие истории делают нас сильнее."]
  },
  kk: {
    openers: ["Біздің қатарымыздан жаңа жаңалық:", "Байланыс орнады — және мақтанатын себеп бар:", "Бізде не болғанын әңгімелейміз:"],
    coolLeadIn: ["Ал ең қызығы мынада:", "Осы оқиғаны ерекше ететін нәрсе:", "Жеке назар аударарлығы:"],
    resultLeadIn: ["Нәтижесінде:", "Бұл компанияға не береді:", "Басты әсері:"],
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

function buildResultText(answers, lang) {
  if (answers.resultType === "custom" && answers.resultCustom) {
    return answers.resultCustom;
  }
  return answers.resultType || "";
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

  const result = buildResultText(a, lang);

  const lines = [];
  lines.push(`${opener}`);
  lines.push("");
  if (a.whereWhen) lines.push(`📍 ${a.whereWhen}`);
  if (a.what) lines.push(`${a.what}`);
  lines.push("");
  if (a.cool) lines.push(`${coolLeadIn} ${a.cool}`);
  lines.push("");
  if (result) lines.push(`${resultLeadIn} ${result}.`);
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
