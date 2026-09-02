/* ==========================================================================
   ЕСТЬ КОНТАКТ! — основная логика приложения
   ========================================================================== */

(function () {
  "use strict";

  const MOD_PASSWORD = "kt2026"; // демо-пароль. Для продакшена — заменить на реальную авторизацию.
  const MAX_MEDIA_BYTES = 200 * 1024 * 1024; // 200 МБ
  const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];

  let currentLang = localStorage.getItem("estkontakt_lang") || "ru";
  let wizardData = { answers: {}, media: [] };
  let lastSubmissionId = null;
  let modCurrentFilter = "all";
  let modCurrentDetailId = null;

  /* ---------------------------------------------------------------------- */
  /* Инициализация                                                          */
  /* ---------------------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    await DataStore.init();
    applyLanguage(currentLang);
    bindGlobalNav();
    bindWizard();
    bindSourceLogin();
    bindModLogin();
    bindModDetail();
    showView("home");
  });

  /* ---------------------------------------------------------------------- */
  /* Навигация между экранами                                               */
  /* ---------------------------------------------------------------------- */
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach(el => (el.hidden = true));
    const el = document.getElementById("view-" + name);
    if (el) el.hidden = false;
    window.scrollTo({ top: 0, behavior: "auto" });

    if (name === "source-dash") renderSourceDashboard();
    if (name === "mod-dash") renderModDashboard();
  }

  function bindGlobalNav() {
    document.querySelectorAll("[data-nav]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const target = el.getAttribute("data-nav");
        handleNav(target);
      });
    });
    document.querySelectorAll("[data-scroll]").forEach(el => {
      el.addEventListener("click", () => {
        const target = document.getElementById(el.getAttribute("data-scroll"));
        if (target) target.scrollIntoView({ behavior: "smooth" });
      });
    });
    document.getElementById("langToggle").addEventListener("click", () => {
      currentLang = currentLang === "ru" ? "kk" : "ru";
      localStorage.setItem("estkontakt_lang", currentLang);
      applyLanguage(currentLang);
      // Перерисовать динамические экраны, если они открыты
      const activeView = document.querySelector("[data-view]:not([hidden])");
      if (activeView && activeView.id === "view-source-dash") renderSourceDashboard();
      if (activeView && activeView.id === "view-mod-dash") renderModDashboard();
      if (activeView && activeView.id === "view-mod-detail") renderModDetail(modCurrentDetailId);
      rebuildResultDropdown();
      setTimeout(positionFilterHighlight, 0);
    });
  }

  function handleNav(target) {
    if (target === "wizard") {
      resetWizard();
      showView("wizard");
      return;
    }
    if (target === "source-login") {
      const existing = Session.getSourceContact();
      if (existing) { showView("source-dash"); return; }
      showView("source-login");
      return;
    }
    if (target === "mod-login") {
      if (Session.isModerator()) { showView("mod-dash"); return; }
      showView("mod-login");
      return;
    }
    showView(target);
  }

  /* ---------------------------------------------------------------------- */
  /* Локализация (i18n)                                                     */
  /* ---------------------------------------------------------------------- */
  function applyLanguage(lang) {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      el.textContent = t(el.getAttribute("data-i18n"), lang);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder"), lang));
    });
    document.getElementById("langToggle").querySelector("span").textContent = t("lang_switch", lang);
    rebuildResultDropdown();
    updateWizardProgressLabel();
  }

  function rebuildResultDropdown() {
    const select = document.getElementById("q4select");
    if (!select) return;
    const options = t("q4_options", currentLang);
    const prevValue = select.value;
    select.innerHTML = "";
    options.forEach((label, i) => {
      const opt = document.createElement("option");
      opt.value = i === options.length - 1 ? "custom" : label;
      opt.textContent = label;
      select.appendChild(opt);
    });
    if (prevValue) select.value = prevValue;
    toggleCustomResultField();
  }

  /* ---------------------------------------------------------------------- */
  /* Мастер подачи новости (3 шага)                                         */
  /* ---------------------------------------------------------------------- */
  function resetWizard() {
    wizardData = { answers: {}, media: [] };
    document.getElementById("step1").reset();
    document.getElementById("mediaList").innerHTML = "";
    document.getElementById("mediaError").hidden = true;
    goToStep(1);
  }

  function bindWizard() {
    document.getElementById("q4select").addEventListener("change", toggleCustomResultField);

    document.getElementById("step1").addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const data = new FormData(form);
      wizardData.answers = {
        what: data.get("what").trim(),
        whereWhen: `${data.get("place").trim()} · ${formatDate(data.get("date"))}`,
        cool: data.get("cool").trim(),
        resultType: data.get("resultType") === "custom" ? "custom" : data.get("resultType"),
        resultCustom: document.getElementById("q4custom").value.trim()
      };
      wizardData.authorName = data.get("authorName").trim();
      wizardData.contact = data.get("contact").trim();
      goToStep(2);
    });

    setupDropzone();

    document.getElementById("step2Back").addEventListener("click", () => goToStep(1));
    document.getElementById("step2Skip").addEventListener("click", () => { goToStep(3); renderReview(); });
    document.getElementById("step2Next").addEventListener("click", () => { goToStep(3); renderReview(); });

    document.getElementById("step3Back").addEventListener("click", () => goToStep(2));
    document.getElementById("step3Submit").addEventListener("click", submitWizard);

    document.getElementById("successToDashboard").addEventListener("click", () => {
      Session.setSourceContact(wizardData.contact);
      showView("source-dash");
    });
  }

  function toggleCustomResultField() {
    const select = document.getElementById("q4select");
    const customField = document.getElementById("q4custom");
    const isCustom = select.value === "custom";
    customField.classList.toggle("hidden-field", !isCustom);
    customField.required = isCustom;
  }

  function goToStep(n) {
    document.querySelectorAll(".wizard-step").forEach(el => (el.hidden = true));
    const map = { 1: "step1", 2: "step2", 3: "step3", success: "stepSuccess" };
    document.getElementById(map[n]).hidden = false;
    updateWizardProgressLabel(n);
  }

  function updateWizardProgressLabel(n) {
    n = n || 1;
    const total = 3;
    const label = document.getElementById("wizardStepLabel");
    const fill = document.getElementById("progressFill");
    if (!label || !fill) return;
    if (n === "success") {
      label.textContent = "";
      fill.style.width = "100%";
      return;
    }
    label.textContent = t("wizard_step_of", currentLang, { current: n, total });
    fill.style.width = Math.round((n / total) * 100) + "%";
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString(currentLang === "kk" ? "kk-KZ" : "ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  }

  /* ---- Шаг 2: медиа ---- */
  function setupDropzone() {
    const zone = document.getElementById("dropzone");
    const input = document.getElementById("fileInput");

    zone.addEventListener("click", (e) => { /* label уже открывает input */ });
    ["dragenter", "dragover"].forEach(evt =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach(evt =>
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove("dragover"); })
    );
    zone.addEventListener("drop", (e) => {
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener("change", (e) => {
      handleFiles(e.target.files);
      input.value = "";
    });
  }

  function handleFiles(fileList) {
    const errorEl = document.getElementById("mediaError");
    errorEl.hidden = true;
    const incoming = Array.from(fileList);

    for (const f of incoming) {
      if (!ALLOWED_MEDIA_TYPES.includes(f.type)) {
        errorEl.textContent = t("media_type_error", currentLang);
        errorEl.hidden = false;
        continue;
      }
      wizardData.media.push(f);
    }

    const totalSize = wizardData.media.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_MEDIA_BYTES) {
      errorEl.textContent = t("media_limit_error", currentLang);
      errorEl.hidden = false;
      // откатываем последние файлы, превысившие лимит
      while (wizardData.media.reduce((s, f) => s + f.size, 0) > MAX_MEDIA_BYTES) {
        wizardData.media.pop();
      }
    }
    renderMediaList();
  }

  function renderMediaList() {
    const list = document.getElementById("mediaList");
    list.innerHTML = "";
    wizardData.media.forEach((file, idx) => {
      const li = document.createElement("li");
      const isImage = file.type.startsWith("image/");
      const url = URL.createObjectURL(file);
      li.innerHTML = isImage
        ? `<img src="${url}" alt="">`
        : `<video src="${url}" muted></video>`;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} МБ)`;
      li.appendChild(nameSpan);
      const removeBtn = document.createElement("button");
      removeBtn.className = "media-remove";
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", t("media_remove", currentLang));
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        wizardData.media.splice(idx, 1);
        renderMediaList();
      });
      li.appendChild(removeBtn);
      list.appendChild(li);
    });
  }

  /* ---- Шаг 3: проверка ---- */
  function renderReview() {
    const dl = document.getElementById("reviewList");
    const a = wizardData.answers;
    const resultText = a.resultType === "custom" ? a.resultCustom : a.resultType;
    const rows = [
      [t("q1_label", currentLang), a.what],
      [t("q2_label", currentLang), a.whereWhen],
      [t("q3_label", currentLang), a.cool],
      [t("q4_label", currentLang), resultText],
      [t("q5_label", currentLang), `${wizardData.authorName} — ${wizardData.contact}`]
    ];
    dl.innerHTML = rows.map(([label, value]) =>
      `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd>`
    ).join("");

    const mediaNote = wizardData.media.length
      ? `${wizardData.media.length} ${currentLang === "kk" ? "файл тіркелді" : "файл(ов) прикреплено"}`
      : t("review_media_none", currentLang);
    dl.innerHTML += `<dt>${escapeHtml(t("media_title", currentLang))}</dt><dd>${escapeHtml(mediaNote)}</dd>`;
  }

  async function submitWizard() {
    const submitBtn = document.getElementById("step3Submit");
    submitBtn.disabled = true;

    // В демо-режиме (localStorage) сами файлы не сохраняются между сессиями —
    // хранится только их имя/размер/тип. Для реального хранения файлов
    // подключите Firebase Storage (см. js/dataStore.js).
    const mediaMeta = wizardData.media.map(f => ({ name: f.name, size: f.size, type: f.type }));

    const submission = await DataStore.addSubmission({
      answers: wizardData.answers,
      authorName: wizardData.authorName,
      contact: wizardData.contact,
      media: mediaMeta
    });

    lastSubmissionId = submission.id;
    document.getElementById("successText").textContent = t("success_text", currentLang, { id: submission.id });
    goToStep("success");
    submitBtn.disabled = false;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  /* ---------------------------------------------------------------------- */
  /* Кабинет источника новости                                              */
  /* ---------------------------------------------------------------------- */
  function bindSourceLogin() {
    document.getElementById("sourceLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const contact = document.getElementById("sourceContactInput").value.trim();
      const list = await DataStore.listSubmissions({ contact });
      const errorEl = document.getElementById("sourceLoginError");
      if (list.length === 0) {
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      Session.setSourceContact(contact);
      showView("source-dash");
    });

    document.getElementById("sourceLogout").addEventListener("click", () => {
      Session.clearSource();
      showView("home");
    });
  }

  async function renderSourceDashboard() {
    const contact = Session.getSourceContact();
    if (!contact) { showView("source-login"); return; }

    const list = await DataStore.listSubmissions({ contact });
    const name = list[0] ? list[0].authorName : contact;

    document.getElementById("dashGreeting").textContent = t("dash_greeting", currentLang, { name });
    document.getElementById("cntTotal").textContent = list.length;
    document.getElementById("cntPending").textContent = list.filter(s => s.status === "new" || s.status === "processing").length;
    document.getElementById("cntPublished").textContent = list.filter(s => s.status === "published").length;
    document.getElementById("cntRejected").textContent = list.filter(s => s.status === "rejected").length;

    const ul = document.getElementById("sourceSubmissionList");
    const emptyNote = document.getElementById("sourceEmptyNote");
    ul.innerHTML = "";
    emptyNote.hidden = list.length > 0;

    list.forEach(s => {
      const li = document.createElement("li");
      li.className = "submission-item";
      li.innerHTML = `
        <div class="submission-main">
          <div class="submission-title">${escapeHtml(s.answers.what)}</div>
          <div class="submission-meta">${escapeHtml(s.answers.whereWhen)} · ${s.id}</div>
        </div>
        <span class="status-badge status-${s.status}">${escapeHtml(t("status_" + s.status, currentLang))}</span>
      `;
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Панель модератора                                                      */
  /* ---------------------------------------------------------------------- */
  function bindModLogin() {
    document.getElementById("modLoginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const pass = document.getElementById("modPasswordInput").value;
      const errorEl = document.getElementById("modLoginError");
      if (pass !== MOD_PASSWORD) {
        errorEl.hidden = false;
        return;
      }
      errorEl.hidden = true;
      Session.setModerator(true);
      showView("mod-dash");
    });

    document.getElementById("modLogout").addEventListener("click", () => {
      Session.setModerator(false);
      showView("home");
    });

    document.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        modCurrentFilter = chip.getAttribute("data-filter");
        positionFilterHighlight();
        renderModDashboard();
      });
    });

    window.addEventListener("resize", positionFilterHighlight);
  }

  /* ---- Скользящая подсветка активного фильтра (сегментированный переключатель) ---- */
  function positionFilterHighlight() {
    const container = document.getElementById("modFilters");
    const highlight = document.getElementById("filterHighlight");
    const active = container && container.querySelector(".filter-chip.active");
    if (!container || !highlight || !active) return;
    const cRect = container.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    highlight.style.width = aRect.width + "px";
    highlight.style.transform = `translateX(${aRect.left - cRect.left - 4}px)`;
  }

  /* ---- Плавный подсчёт чисел в счётчиках вместо мгновенной подмены ---- */
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animateCounter(el, toValue) {
    if (!el) return;
    const fromValue = parseInt(el.textContent, 10) || 0;
    if (prefersReducedMotion || fromValue === toValue) {
      el.textContent = toValue;
      return;
    }
    const duration = 500;
    const start = performance.now();
    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(fromValue + (toValue - fromValue) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = toValue;
    }
    requestAnimationFrame(step);
  }

  async function renderModDashboard() {
    if (!Session.isModerator()) { showView("mod-login"); return; }

    const counts = await DataStore.counts();
    animateCounter(document.getElementById("modCntTotal"), counts.total);
    animateCounter(document.getElementById("modCntNew"), counts.new);
    animateCounter(document.getElementById("modCntProcessing"), counts.processing);
    animateCounter(document.getElementById("modCntPublished"), counts.published);
    animateCounter(document.getElementById("modCntRejected"), counts.rejected);

    const list = await DataStore.listSubmissions({ status: modCurrentFilter });
    const ul = document.getElementById("modSubmissionList");
    const emptyNote = document.getElementById("modEmptyNote");
    ul.innerHTML = "";
    emptyNote.hidden = list.length > 0;

    list.forEach((s, idx) => {
      const li = document.createElement("li");
      li.className = "submission-item";
      li.style.cursor = "pointer";
      li.style.animationDelay = Math.min(idx * 40, 280) + "ms";
      const liveDot = s.status === "new" ? '<span class="live-dot"></span>' : "";
      li.innerHTML = `
        <div class="submission-main">
          <div class="submission-title">${escapeHtml(s.answers.what)}</div>
          <div class="submission-meta">${escapeHtml(s.authorName)} · ${escapeHtml(s.answers.whereWhen)} · ${s.id}</div>
        </div>
        <span class="status-badge status-${s.status}">${liveDot}${escapeHtml(t("status_" + s.status, currentLang))}</span>
      `;
      li.addEventListener("click", () => {
        modCurrentDetailId = s.id;
        showView("mod-detail");
        renderModDetail(s.id);
      });
      ul.appendChild(li);
    });

    positionFilterHighlight();
  }

  function bindModDetail() {
    document.getElementById("modBackToList").addEventListener("click", () => showView("mod-dash"));

    document.getElementById("modGenerateBtn").addEventListener("click", async () => {
      const submission = await DataStore.getSubmission(modCurrentDetailId);
      const drafts = generateBothDrafts(submission);
      document.getElementById("postRu").value = drafts.ru;
      document.getElementById("postKk").value = drafts.kk;
      await DataStore.updateSubmission(modCurrentDetailId, { status: "processing", posts: drafts });
    });

    document.getElementById("modApproveBtn").addEventListener("click", async () => {
      const postRu = document.getElementById("postRu").value;
      const postKk = document.getElementById("postKk").value;
      await DataStore.updateSubmission(modCurrentDetailId, {
        status: "published",
        posts: { ru: postRu, kk: postKk }
      });
      showView("mod-dash");
    });

    document.getElementById("modRejectBtn").addEventListener("click", async () => {
      const reason = document.getElementById("modRejectReason").value;
      await DataStore.updateSubmission(modCurrentDetailId, { status: "rejected", rejectReason: reason });
      showView("mod-dash");
    });
  }

  async function renderModDetail(id) {
    if (!id) return;
    const s = await DataStore.getSubmission(id);
    if (!s) return;

    const resultText = s.answers.resultType === "custom" ? s.answers.resultCustom : s.answers.resultType;
    const rows = [
      [t("q5_label", currentLang), `${s.authorName} — ${s.contact}`],
      [t("q1_label", currentLang), s.answers.what],
      [t("q2_label", currentLang), s.answers.whereWhen],
      [t("q3_label", currentLang), s.answers.cool],
      [t("q4_label", currentLang), resultText]
    ];
    document.getElementById("modDetailAnswers").innerHTML = rows.map(([label, value]) =>
      `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "—")}</dd>`
    ).join("");

    const mediaBox = document.getElementById("modDetailMedia");
    mediaBox.innerHTML = "";
    (s.media || []).forEach(m => {
      const span = document.createElement("span");
      span.className = "submission-meta";
      span.textContent = `📎 ${m.name} (${(m.size / (1024 * 1024)).toFixed(1)} МБ)`;
      mediaBox.appendChild(span);
      mediaBox.appendChild(document.createElement("br"));
    });

    document.getElementById("postRu").value = s.posts?.ru || "";
    document.getElementById("postKk").value = s.posts?.kk || "";
    document.getElementById("modRejectReason").value = s.rejectReason || "";
  }

})();
