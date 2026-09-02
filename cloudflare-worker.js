/* ==========================================================================
   ЕСТЬ КОНТАКТ! — серверная функция генерации поста через Claude

   Это код для Cloudflare Workers (бесплатный тариф достаточен для этой
   задачи). Он принимает ответы сотрудника с сайта, отправляет запрос
   к Claude API с СЕКРЕТНЫМ ключом (который хранится только здесь, на
   сервере, и никогда не попадает в код сайта на GitHub), и возвращает
   готовый пост на русском и казахском языках.

   КАК РАЗВЕРНУТЬ (без установки чего-либо на компьютер):
   1. Зайдите на https://dash.cloudflare.com → зарегистрируйтесь (бесплатно).
   2. В меню слева выберите "Workers & Pages" → "Create" → "Create Worker".
   3. Дайте воркеру имя (например, est-kontakt-ai) → "Deploy".
   4. Нажмите "Edit code" — откроется онлайн-редактор.
   5. Удалите весь стандартный код и вставьте ВЕСЬ код из этого файла.
   6. Нажмите "Deploy" (или "Save and deploy") справа сверху.
   7. Перейдите во вкладку "Settings" → "Variables and Secrets" этого воркера.
      Добавьте переменную:
        Имя:  ANTHROPIC_API_KEY
        Значение: ваш секретный ключ с https://console.anthropic.com/settings/keys
      Обязательно отметьте её как "Secret" (зашифрованную), не как обычный текст.
   8. Скопируйте адрес воркера — он вида
      https://est-kontakt-ai.ВАШ-АККАУНТ.workers.dev
   9. Вставьте этот адрес в файл js/config.js на сайте (переменная AI_ENDPOINT).

   Если переменная ANTHROPIC_API_KEY не настроена или запрос к Claude
   не удался (лимиты, сеть и т.д.) — воркер вернёт ошибку, а сайт сам
   автоматически откатится на шаблонный генератор (js/postGenerator.js),
   так что сайт не сломается даже без этого сервера.
   ========================================================================== */

const ANTHROPIC_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `Ты — редактор внутреннего корпоративного новостного портала телеком-компании.
Тебе присылают сырые ответы сотрудника на 5 вопросов о рабочем событии.
Твоя задача — собрать из них короткий, живой пост для ленты компании.

Требования к стилю:
- душевно и по-человечески, без канцелярита и штампов;
- непринуждённо, но лаконично — 4-7 предложений;
- чёткая логическая структура: сначала что произошло (кратко и ясно), затем
  почему это интересно/важно (тепло, с уважением к людям), в конце — тёплая
  concluding-фраза с благодарностью автору новости;
- не выдумывай факты, которых нет в ответах сотрудника;
- не используй чрезмерный канцелярский тон и не повторяй вопросы дословно.

Тебе нужно подготовить ДВЕ версии поста:
- "ru" — на русском языке;
- "kk" — на казахском языке. Это должен быть настоящий связный перевод по
  смыслу (не калька и не транслит), выдержанный в том же тёплом стиле.

Ответь СТРОГО в формате JSON, без пояснений до или после, без markdown-разметки:
{"ru": "текст поста на русском", "kk": "текст поста на казахском"}`;

function buildUserPrompt(payload) {
  return [
    `Что произошло: ${payload.what || "—"}`,
    `Где и когда: ${payload.whereWhen || "—"}`,
    `Что классного (по мнению сотрудника): ${payload.cool || "—"}`,
    `Результат для компании: ${payload.result || "—"}`,
    `Автор новости: ${payload.authorName || "—"}`
  ].join("\n");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders(origin)
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server" }), {
        status: 500,
        headers: corsHeaders(origin)
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders(origin)
      });
    }

    try {
      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(payload) }]
        })
      });

      if (!anthropicResponse.ok) {
        const errText = await anthropicResponse.text();
        return new Response(JSON.stringify({ error: "Anthropic API error", details: errText }), {
          status: 502,
          headers: corsHeaders(origin)
        });
      }

      const data = await anthropicResponse.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock) {
        return new Response(JSON.stringify({ error: "No text in Claude response" }), {
          status: 502,
          headers: corsHeaders(origin)
        });
      }

      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (e) {
        return new Response(JSON.stringify({ error: "Could not parse Claude JSON output", raw: cleaned }), {
          status: 502,
          headers: corsHeaders(origin)
        });
      }

      if (!parsed.ru || !parsed.kk) {
        return new Response(JSON.stringify({ error: "Claude response missing ru/kk", raw: parsed }), {
          status: 502,
          headers: corsHeaders(origin)
        });
      }

      return new Response(JSON.stringify({ ru: parsed.ru, kk: parsed.kk }), {
        status: 200,
        headers: corsHeaders(origin)
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Unexpected server error", details: String(e) }), {
        status: 500,
        headers: corsHeaders(origin)
      });
    }
  }
};
