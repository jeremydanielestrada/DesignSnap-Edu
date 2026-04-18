// ------------------- Snapshot -------------------
async function showSnapshot() {
  const { image } = await chrome.runtime.sendMessage({
    type: "GET_CAPTURED_IMAGE",
  });
  if (image) {
    const snapshotContainer = document.getElementById("snapshot-container");
    snapshotContainer.innerHTML = `<img src="${image}" alt="Tab Snapshot" style="max-width:100%;border-radius:8px;" />`;
  }
}

let lastExtracted = null;
let lastExtractionMeta = null;
let lastErrorContext = null;

function setSuggestEnabled(enabled) {
  const suggestBtn = document.getElementById("suggest-btn");
  if (!suggestBtn) return;
  suggestBtn.disabled = !enabled;
  suggestBtn.setAttribute("aria-disabled", enabled ? "false" : "true");
}

function setFlowStep(step) {
  const order = ["capture", "extract", "suggest"];
  const currentIdx = order.indexOf(step);
  const items = document.querySelectorAll(".flow-step");
  items.forEach((el) => {
    const name = el.getAttribute("data-step");
    const idx = order.indexOf(name);
    el.classList.remove("is-active", "is-complete");
    if (idx >= 0 && currentIdx >= 0 && idx < currentIdx)
      el.classList.add("is-complete");
    if (name === step) el.classList.add("is-active");
  });
}

function updatePageContext(meta) {
  const host = document.getElementById("page-host");
  const title = document.getElementById("page-title");
  const capturedAt = document.getElementById("captured-at");

  if (host) host.textContent = meta?.host || "—";
  if (title) title.textContent = meta?.title || "—";

  if (capturedAt) {
    const now = new Date();
    capturedAt.textContent = now.toLocaleString();
    capturedAt.setAttribute("datetime", now.toISOString());
  }
}

function ensureToastHost() {
  let host = document.getElementById("toast-host");
  if (host) return host;
  host = document.createElement("div");
  host.id = "toast-host";
  host.setAttribute("aria-live", "polite");
  host.setAttribute("aria-atomic", "true");
  document.body.appendChild(host);
  return host;
}

function showToast(message, variant = "success") {
  const host = ensureToastHost();
  const toast = document.createElement("div");
  toast.className = `toast-item toast-${variant}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  host.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("is-visible"));
  setTimeout(() => {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 250);
  }, 2200);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function formatDurationShort(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function computeTruncationFlags(html, css) {
  const htmlTruncated = Boolean(html && html.includes("<!-- truncated -->"));
  const cssTruncated = Boolean(css && css.includes("/* truncated */"));
  return { htmlTruncated, cssTruncated };
}

function updateCodeTabMeta(html, css) {
  const htmlSize = document.getElementById("html-size");
  const cssSize = document.getElementById("css-size");
  if (htmlSize)
    htmlSize.textContent = html ? `(${formatBytes(html.length)})` : "";
  if (cssSize) cssSize.textContent = css ? `(${formatBytes(css.length)})` : "";

  const { htmlTruncated, cssTruncated } = computeTruncationFlags(html, css);
  if (htmlSize && htmlTruncated) htmlSize.textContent += " • truncated";
  if (cssSize && cssTruncated) cssSize.textContent += " • truncated";
}

function buildDebugReport(context) {
  const lines = [];
  lines.push("DesignSnap Edu Debug Report");
  lines.push(`Time: ${new Date().toISOString()}`);
  if (context?.phase) lines.push(`Phase: ${context.phase}`);
  if (context?.errorMessage) lines.push(`Error: ${context.errorMessage}`);
  if (context?.page?.url) lines.push(`URL: ${context.page.url}`);
  if (context?.page?.host) lines.push(`Host: ${context.page.host}`);
  if (context?.page?.title) lines.push(`Title: ${context.page.title}`);
  if (context?.sizes) {
    lines.push(`HTML length: ${context.sizes.htmlLength ?? "?"}`);
    lines.push(`CSS length: ${context.sizes.cssLength ?? "?"}`);
    if (typeof context.sizes.htmlTruncated === "boolean")
      lines.push(`HTML truncated: ${context.sizes.htmlTruncated}`);
    if (typeof context.sizes.cssTruncated === "boolean")
      lines.push(`CSS truncated: ${context.sizes.cssTruncated}`);
  }
  return lines.join("\n");
}

function tryParseJsonFromText(text) {
  if (!text) return null;
  const str = String(text);
  const firstBrace = str.indexOf("{");
  const lastBrace = str.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) return null;
  const jsonCandidate = str.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonCandidate);
  } catch {
    return null;
  }
}

function humanizeGroqError(err) {
  const raw = err?.message ? String(err.message) : String(err || "");

  // Default fallback
  const fallback = {
    title: "Request failed",
    message: raw || "Unknown error",
  };

  // Parse status code when present in our thrown error strings
  const statusMatch = raw.match(/\b(\d{3})\b/);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  const payload = tryParseJsonFromText(raw);
  const groqMessage =
    payload?.error?.message ||
    payload?.message ||
    (typeof payload === "string" ? payload : null);

  // Rate limit (429)
  if (status === 429 || payload?.error?.code === "rate_limit_exceeded") {
    const waitMatch = String(groqMessage || raw).match(
      /Please try again in\s+([0-9msh\.\s]+)\.?/i,
    );
    const waitText = waitMatch ? waitMatch[1].trim() : null;

    return {
      title: "Rate limit reached",
      message: waitText
        ? `The AI service is temporarily rate-limited. Please wait ${waitText} and try again.`
        : "The AI service is temporarily rate-limited. Please wait a bit and try again.",
    };
  }

  // Auth / billing / forbidden
  if (status === 401 || status === 403) {
    return {
      title: "Access denied",
      message:
        "The AI request was rejected (authorization/billing issue). Check the server/API configuration and try again.",
    };
  }

  // Server-side
  if (status && status >= 500) {
    return {
      title: "Server error",
      message:
        "The AI service is having trouble right now. Please try again in a moment.",
    };
  }

  if (groqMessage) {
    return {
      title: "AI request error",
      message: groqMessage,
    };
  }

  return fallback;
}

function showErrorCard({ title, message, phase }) {
  const errorEl = document.getElementById("error");
  if (!errorEl) return;

  const page = lastExtractionMeta || null;
  const sizes = lastExtracted
    ? {
        htmlLength: lastExtracted.html?.length ?? 0,
        cssLength: lastExtracted.css?.length ?? 0,
        ...computeTruncationFlags(lastExtracted.html, lastExtracted.css),
      }
    : null;

  lastErrorContext = {
    phase,
    errorMessage: message,
    page,
    sizes,
  };

  errorEl.classList.remove("d-none");
  errorEl.innerHTML = `
    <div class="card border-danger">
      <div class="card-header bg-danger text-white d-flex justify-content-between align-items-center">
        <strong>${escapeHtml(title || "Something went wrong")}</strong>
        <button type="button" class="btn btn-sm btn-light" id="error-close-btn">Close</button>
      </div>
      <div class="card-body">
        <p class="mb-2">${escapeHtml(message || "Unknown error")}</p>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-danger btn-sm" id="error-retry-btn">Retry</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" id="error-copy-debug-btn">Copy debug info</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("error-close-btn")?.addEventListener("click", () => {
    errorEl.classList.add("d-none");
    errorEl.innerHTML = "";
  });

  document
    .getElementById("error-copy-debug-btn")
    ?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(buildDebugReport(lastErrorContext));
        showToast("Copied debug info");
      } catch {
        showToast("Copy failed", "danger");
      }
    });

  document.getElementById("error-retry-btn")?.addEventListener("click", () => {
    const phaseName = lastErrorContext?.phase;
    if (phaseName === "suggest") {
      document.getElementById("suggest-btn")?.click();
    } else {
      document.getElementById("starter-btn")?.click();
    }
  });
}

// ------------------- UI Initialization -------------------
function initializeUI() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.setAttribute("role", "tab");
    btn.setAttribute(
      "aria-selected",
      btn.classList.contains("active") ? "true" : "false",
    );

    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      if (!targetTab) return;

      tabBtns.forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });

      tabContents.forEach((c) => {
        c.classList.add("d-none");
        c.classList.remove("active");
        c.setAttribute("aria-hidden", "true");
      });

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      const content = document.getElementById(`${targetTab}-tab`);
      if (content) {
        content.classList.remove("d-none");
        content.classList.add("active");
        content.setAttribute("aria-hidden", "false");
      }
    });
  });

  const copyBtns = document.querySelectorAll(".copy-btn");
  copyBtns.forEach((btn) => {
    btn.dataset.origLabel = btn.innerHTML || "Copy";
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-target");
      const codeElement = document.getElementById(targetId);
      if (!codeElement) return;
      try {
        await navigator.clipboard.writeText(codeElement.textContent || "");
        btn.innerHTML = "✅ Copied!";
        setTimeout(() => (btn.innerHTML = btn.dataset.origLabel), 1500);
      } catch (err) {
        console.error("Failed to copy:", err);
        btn.innerHTML = "❌ Failed";
        setTimeout(() => (btn.innerHTML = btn.dataset.origLabel), 1500);
      }
    });
  });
}

// ------------------- Copy buttons for suggestions -------------------
function initializeSuggestionCopyButtons() {
  const suggestionCopyBtns = document.querySelectorAll(".suggestion-copy-btn");
  suggestionCopyBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const codeBlock =
        btn.closest(".code-suggestion")?.querySelector("code") ||
        btn.closest(".card")?.querySelector("code") ||
        btn.parentElement?.nextElementSibling?.querySelector("code") ||
        btn.closest("div")?.querySelector("code");
      if (!codeBlock) return;
      try {
        await navigator.clipboard.writeText(codeBlock.textContent || "");
        const orig = btn.innerHTML;
        btn.innerHTML = "✅ Copied!";
        setTimeout(() => (btn.innerHTML = orig), 1500);
      } catch (err) {
        console.error("Failed to copy suggestion code:", err);
        const orig = btn.innerHTML;
        btn.innerHTML = "❌ Failed";
        setTimeout(() => (btn.innerHTML = orig), 1500);
      }
    });
  });
}

// ------------------- DOMContentLoaded -------------------
document.addEventListener("DOMContentLoaded", () => {
  showSnapshot();
  initializeUI();
  setFlowStep("capture");
  setSuggestEnabled(false);

  const closeBtn = document.getElementById("close-extension-btn");
  if (closeBtn) closeBtn.addEventListener("click", () => window.close());

  const backBtn = document.getElementById("back-to-code-btn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      const extractedDOM = document.querySelector(".extracted-DOM");
      const suggestContainer = document.getElementById("suggestions-container");
      suggestContainer?.classList.add("d-none");
      suggestContainer?.setAttribute("aria-hidden", "true");
      extractedDOM?.classList.remove("d-none");
      setFlowStep("extract");
      document.getElementById("suggest-btn")?.focus();
    });
  }

  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      lastExtracted = null;
      lastExtractionMeta = null;
      setSuggestEnabled(false);
      setFlowStep("capture");

      document.querySelector(".intro")?.classList.remove("d-none");
      document.getElementById("loader-container")?.classList.add("d-none");
      document.getElementById("error")?.classList.add("d-none");
      document.querySelector(".extracted-DOM")?.classList.add("d-none");

      const suggestContainer = document.getElementById("suggestions-container");
      suggestContainer?.classList.add("d-none");
      suggestContainer?.setAttribute("aria-hidden", "true");

      const htmlOutput = document.getElementById("html-output");
      const cssOutput = document.getElementById("css-output");
      if (htmlOutput) htmlOutput.textContent = "";
      if (cssOutput) cssOutput.textContent = "";

      updatePageContext({ host: "—", title: "—" });
      updateCodeTabMeta("", "");
      document.getElementById("starter-btn")?.focus();
    });
  }

  const suggestBtn = document.getElementById("suggest-btn");
  if (suggestBtn) {
    suggestBtn.addEventListener("click", async () => {
      if (!lastExtracted) return;
      await handleSuggestions(lastExtracted.html, lastExtracted.css);
    });
  }

  const starterBtn = document.getElementById("starter-btn");
  if (!starterBtn) return;

  starterBtn.addEventListener("click", async () => {
    console.log("starter clicked");
    const { tabId } = await chrome.runtime.sendMessage({
      type: "GET_LAST_TAB",
    });

    const starter = document.querySelector(".intro");
    const extractLoader = document.getElementById("loader-container");
    const loaderText = document.getElementById("loader-text");
    const isError = document.getElementById("error");
    const extractedDOM = document.querySelector(".extracted-DOM");
    const htmlOutput = document.getElementById("html-output");
    const cssOutput = document.getElementById("css-output");

    isError?.classList.add("d-none");
    if (isError) isError.innerHTML = "";
    starter?.classList.add("d-none");
    extractLoader?.classList.remove("d-none");
    setFlowStep("extract");
    if (loaderText) loaderText.textContent = "Extracting resources…";

    try {
      if (!tabId)
        throw new Error("No active tab found. Open a webpage and try again.");

      // executeScript wrapper for page context
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async () => {
          async function fetchOriginalCSS() {
            const links = Array.from(
              document.querySelectorAll('link[rel="stylesheet"]'),
            );
            const cssList = [];
            for (const link of links) {
              try {
                const res = await fetch(link.href);
                if (res.ok) cssList.push(await res.text());
                else
                  cssList.push(`/* Could not fetch CSS from ${link.href} */`);
              } catch {
                cssList.push(`/* Error fetching CSS from ${link.href} */`);
              }
            }
            return cssList.join("\n\n");
          }

          async function extractContent() {
            let html = document.body.innerHTML;
            if (html.length > 5000)
              html = html.slice(0, 5000) + "\n<!-- truncated -->";

            let css = await fetchOriginalCSS();
            if (!css.trim())
              css = "/* No external CSS detected - page uses inline styles */";
            if (css.length > 30000)
              css = css.slice(0, 30000) + "\n/* truncated */";

            const meta = {
              title: document.title || "",
              host: location.hostname || "",
              url: location.href || "",
            };

            return { html, css, meta };
          }

          return await extractContent();
        },
      });

      if (!result) throw new Error("No result returned from extraction script");

      const { html, css } = result;
      lastExtracted = { html, css };
      lastExtractionMeta = result.meta || null;

      if (htmlOutput) htmlOutput.textContent = html.trim();
      if (cssOutput) cssOutput.textContent = css.trim();
      updateCodeTabMeta(html, css);

      extractedDOM?.classList.remove("d-none");
      setSuggestEnabled(true);
      updatePageContext(result.meta);
      htmlOutput?.focus();

      const suggestContainer = document.getElementById("suggestions-container");
      suggestContainer?.classList.add("d-none");
      suggestContainer?.setAttribute("aria-hidden", "true");
    } catch (err) {
      console.error("Extraction error:", err);
      const friendly = humanizeGroqError(err);
      showErrorCard({
        title: friendly.title,
        message: friendly.message,
        phase: "extract",
      });
      extractedDOM?.classList.add("d-none");
      setSuggestEnabled(false);
      setFlowStep("capture");
    } finally {
      extractLoader?.classList.add("d-none");
    }
  });

  // Code tools
  document
    .getElementById("copy-all-btn")
    ?.addEventListener("click", async () => {
      if (!lastExtracted) return;
      const text = `<!-- HTML -->\n${lastExtracted.html || ""}\n\n/* CSS */\n${
        lastExtracted.css || ""
      }\n`;
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied HTML + CSS");
      } catch {
        showToast("Copy failed", "danger");
      }
    });

  document.getElementById("download-btn")?.addEventListener("click", () => {
    if (!lastExtracted) return;
    const { htmlTruncated, cssTruncated } = computeTruncationFlags(
      lastExtracted.html,
      lastExtracted.css,
    );

    const md = [
      "# DesignSnap Edu Export",
      "",
      `- URL: ${lastExtractionMeta?.url || "—"}`,
      `- Title: ${lastExtractionMeta?.title || "—"}`,
      `- Captured: ${new Date().toLocaleString()}`,
      `- HTML truncated: ${htmlTruncated}`,
      `- CSS truncated: ${cssTruncated}`,
      "",
      "## HTML",
      "```html",
      lastExtracted.html || "",
      "```",
      "",
      "## CSS",
      "```css",
      lastExtracted.css || "",
      "```",
      "",
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "designsnap-export.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
});

// ------------------- Loader Animation -------------------
async function animateLoaderSteps() {
  const steps = document.querySelectorAll(".loader-steps .step");
  steps.forEach((step) => step.classList.remove("active", "completed"));

  const bar = document.getElementById("loader-progress-bar");
  if (bar) bar.style.width = "0%";

  for (let i = 0; i < steps.length; i++) {
    if (i > 0) {
      steps[i - 1].classList.remove("active");
      steps[i - 1].classList.add("completed");
    }
    steps[i].classList.add("active");
    if (bar && steps.length > 0) {
      const pct = Math.round(((i + 1) / steps.length) * 100);
      bar.style.width = `${pct}%`;
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  if (steps.length > 0) {
    steps[steps.length - 1].classList.remove("active");
    steps[steps.length - 1].classList.add("completed");
  }
}

// ------------------- Suggestions Flow -------------------
async function handleSuggestions(html, css) {
  const suggestContainer = document.getElementById("suggestions-container");
  const suggestionsContent = document.getElementById("suggestions-content");
  const loader = document.getElementById("loader-container");
  const loaderText = document.getElementById("loader-text");
  const extractedDOM = document.querySelector(".extracted-DOM");

  if (!suggestContainer || !suggestionsContent || !loader) return;

  extractedDOM?.classList.add("d-none");
  suggestContainer.classList.add("d-none");
  loader.classList.remove("d-none");
  if (loaderText) loaderText.textContent = "Generating AI Suggestions…";
  setFlowStep("suggest");

  // Animate loader steps (time-based)
  await animateLoaderSteps();

  try {
    const suggestions = await getSuggestionBYGroq(html, css);

    if (suggestions?.success && suggestions?.analysis) {
      const parts = suggestions?.parsed
        ? parseAIParsedResponse(suggestions.parsed)
        : parseAIResponse(suggestions.analysis);

      if (parts.htmlCode || parts.cssCode) {
        renderSuggestionsBlock(
          parts.analysisHtml,
          parts.htmlCode || "No HTML suggestions provided",
          parts.cssCode || "No CSS suggestions provided",
          parts.implementationHtml,
        );
      } else {
        suggestionsContent.innerHTML = `
      <div class="alert alert-warning">
        AI response received, but no code suggestions were generated. 
        Try a simpler webpage or smaller HTML/CSS.
      </div>
    `;
      }

      suggestContainer.classList.remove("d-none");
      suggestContainer.setAttribute("aria-hidden", "false");
      initializeSuggestionCopyButtons();
    } else if (suggestions?.error) {
      suggestionsContent.innerHTML = `<div class="alert alert-danger mb-0">API Error: ${escapeHtml(
        suggestions.error,
      )}</div>`;
      suggestContainer.classList.remove("d-none");
      suggestContainer.setAttribute("aria-hidden", "false");
    } else {
      suggestionsContent.innerHTML = `<div class="alert alert-warning mb-0">Unexpected response from AI service.</div>`;
      suggestContainer.classList.remove("d-none");
      suggestContainer.setAttribute("aria-hidden", "false");
    }

    document.getElementById("suggestions-heading")?.focus();
  } catch (err) {
    console.error("Suggestion error:", err);
    const friendly = humanizeGroqError(err);
    showErrorCard({
      title: friendly.title,
      message: friendly.message,
      phase: "suggest",
    });
  } finally {
    loader.classList.add("d-none");
  }
}

// ------------------- Parse AI Response -------------------
function parseAIParsedResponse(parsed) {
  const summaryText = parsed?.summary_markdown || "";
  const issuesText = parsed?.issues_markdown || "";
  const whyText = parsed?.why_markdown || "";
  const checklistText = parsed?.checklist_markdown || "";

  const analysisHtml = `
    <h5>What Needs Improvement</h5>
    <div class="small text-muted">${formatMarkdownText(summaryText)}</div>

    <h5 class="mt-3">Common Beginner Issues</h5>
    <div class="small text-muted">${formatMarkdownText(issuesText)}</div>
  `;

  const implementationHtml = `
    <h6>Why These Changes Help</h6>
    <div class="small text-muted">
      ${formatMarkdownText(whyText)}
      ${checklistText ? `<hr class="my-2" />${formatMarkdownText(checklistText)}` : ""}
    </div>
  `;

  return {
    analysisHtml,
    htmlCode: parsed?.improved_html || "",
    cssCode: parsed?.improved_css || "",
    implementationHtml,
  };
}

function parseAIResponse(content) {
  const getSection = (title) => {
    const regex = new RegExp(`###\\s*[^\\n]*${title}[\\s\\S]*?(?=###|$)`, "i");
    const match = content.match(regex);
    return match ? match[0].replace(/###.*\n/, "").trim() : "";
  };

  const analysisText = getSection("WHAT NEEDS IMPROVEMENT");
  const issuesText = getSection("COMMON BEGINNER ISSUES");
  const implementationText = getSection("WHY THESE CHANGES HELP");

  const htmlMatch = content.match(/```html([\s\S]*?)```/i);
  const cssMatch = content.match(/```css([\s\S]*?)```/i);

  const analysisHtml = `
    <h5>What Needs Improvement</h5>
    <div class="small text-muted">${formatMarkdownText(analysisText)}</div>

    <h5 class="mt-3">Common Beginner Issues</h5>
    <div class="small text-muted">${formatMarkdownText(issuesText)}</div>
  `;

  return {
    analysisHtml,
    htmlCode: htmlMatch ? htmlMatch[1].trim() : "",
    cssCode: cssMatch ? cssMatch[1].trim() : "",
    implementationHtml: `
      <h6>Why These Changes Help</h6>
      <div class="small text-muted">
        ${formatMarkdownText(implementationText)}
      </div>
    `,
  };
}

// ------------------- Enhanced Response Formatter -------------------
function formatEnhancedResponse(text) {
  let result = "";

  // Extract code blocks first
  const codeBlocks = [];
  let textWithoutCode = text.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push({ lang: lang || "code", code: code.trim() });
      return placeholder;
    },
  );

  // Extract sections if they exist
  const sections = textWithoutCode.split(/###\s*(.+?)\n/);

  if (sections.length > 1) {
    // Has structured sections
    for (let i = 1; i < sections.length; i += 2) {
      const title = sections[i].trim();
      const content = sections[i + 1] ? sections[i + 1].trim() : "";

      if (title && content) {
        result += `<h6 class="mt-3 mb-2">${escapeHtml(title)}</h6>`;
        result += `<div class="small">${formatMarkdownText(content)}</div>`;
      }
    }
  } else {
    // No sections, just format the text
    result = formatMarkdownText(textWithoutCode);
  }

  // Re-insert code blocks with proper styling
  codeBlocks.forEach((block, index) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    const escapedCode = escapeHtml(block.code);
    const codeHtml = `
      <div class="card mt-2 mb-2">
        <div class="card-header d-flex justify-content-between align-items-center bg-dark text-white py-1">
          <small><strong>${block.lang.toUpperCase()}</strong></small>
          <button class="btn btn-sm btn-outline-light suggestion-copy-btn" style="font-size:0.75rem; padding:0.1rem 0.4rem;">Copy</button>
        </div>
        <div class="card-body p-0">
          <pre class="mb-0 bg-dark text-white p-2 small" style="max-height:400px; overflow:auto;"><code>${escapedCode}</code></pre>
        </div>
      </div>`;
    result = result.replace(placeholder, codeHtml);
  });

  return result;
}

// ------------------- Markdown Formatter -------------------
function formatMarkdownText(text) {
  if (!text) return "";

  // Normalize common bullet formats from the AI:
  // - Leading "*" bullets
  // - Inline "* " bullets that came back without newlines
  let normalized = String(text)
    // Convert leading asterisk bullets to dash bullets
    .replace(/(^|\n)\s*\*\s+/g, "$1- ")
    // If the model returns bullets inline like "... * Item one: ... * Item two: ...",
    // force them onto new lines so they render as list items.
    .replace(/\s+\*\s+(?=[A-Za-z0-9])/g, "\n- ");

  // Handle inline code first (before escaping HTML)
  let formatted = normalized.replace(/`([^`]+)`/g, (match, code) => {
    // Escape HTML entities in code
    const escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<code class="bg-light px-1 rounded small">${escaped}</code>`;
  });

  // Now handle markdown formatting
  formatted = formatted
    .replace(
      /^\s*-\s+\*\*(.+?):\*\*\s+(.+)$/gm,
      "<li><strong>$1:</strong> $2</li>",
    )
    .replace(
      /^\s*-\s+\*\*(.+?)\*\*\s+(.+)$/gm,
      "<li><strong>$1</strong> $2</li>",
    )
    .replace(/^\s*-\s+(.+)$/gm, "<li>$1</li>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "</p><p>");
  formatted = formatted.replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>");
  if (!formatted.includes("<ul>") && !formatted.includes("<li>"))
    formatted = `<p>${formatted}</p>`;
  return formatted;
}

// ------------------- Escape HTML -------------------
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ------------------- Groq API Proxy -------------------

let lastSuggestionContent = null;

async function getSuggestionBYGroq(html, css) {
  try {
    const resp = await fetch("https://dse-server.vercel.app/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, css }),
    });

    const text = await resp.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (e) {
      payload = text;
    }

    if (!resp.ok && resp.status === 429) {
      const retryMs =
        (payload && typeof payload === "object" && payload.retry_after_ms) ||
        null;
      const retryPretty = formatDurationShort(retryMs);
      const suffix = retryPretty ? ` Please try again in ~${retryPretty}.` : "";
      throw new Error(
        (payload && typeof payload === "object" && payload.error) ||
          `Too many requests.${suffix}`,
      );
    }

    if (!resp.ok && resp.status >= 500) {
      throw new Error(
        (payload && typeof payload === "object" && payload.error) ||
          "Server error while generating suggestions. Please try again.",
      );
    }

    if (!resp.ok)
      throw new Error(
        `Groq API request failed: ${resp.status} ${resp.statusText} — ${JSON.stringify(payload)}`,
      );
    lastSuggestionContent = payload;
    return payload;
  } catch (err) {
    console.error("Network/API call failed:", err);
    throw err;
  }
}

async function getPromptResponseByGroq(userPrompt) {
  try {
    const resp = await fetch("https://dse-server.vercel.app/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userPrompt,
        content: JSON.stringify(lastSuggestionContent),
      }),
    });

    const text = await resp.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (e) {
      payload = { error: "Invalid response format" };
    }

    if (!resp.ok && resp.status === 429) {
      const retryMs =
        (payload && typeof payload === "object" && payload.retry_after_ms) ||
        null;
      const retryPretty = formatDurationShort(retryMs);
      const suffix = retryPretty ? ` Please try again in ~${retryPretty}.` : "";
      throw new Error(
        (payload && typeof payload === "object" && payload.error) ||
          `Too many requests.${suffix}`,
      );
    }

    if (!resp.ok)
      throw new Error(
        (payload && typeof payload === "object" && payload.error) ||
          `Request failed (${resp.status}). Please try again.`,
      );
    return payload;
  } catch (error) {
    console.error("Prompt API error:", error);
    throw error;
  }
}

// ------------------- Render Suggestions -------------------
function renderSuggestionsBlock(
  analysisHtml,
  htmlCode,
  cssCode,
  implementationHtml,
) {
  const container = document.getElementById("suggestions-content");
  if (!container) return;

  const boilerplateHtml = htmlCode
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suggested Page</title>
  <style rel="stylesheet"></style>
</head>
<body>
${htmlCode}
</body>
</html>`
    : "No HTML suggestions provided";

  container.innerHTML = `
    <!-- Summary -->
    <div class="row g-3 mb-3">
      <div class="col-12">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong class="m-0">Summary</strong>
            <span class="badge text-bg-light">Key findings</span>
          </div>
          <div class="card-body">
            ${analysisHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- Preview + Explanation -->
    <div class="row g-3 mb-3">
      <div class="col-12 col-lg-7">
        <div class="card h-100 preview-card">
          <div class="card-header preview-header d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div class="d-flex flex-column">
              <strong class="m-0">Before & After</strong>
              <small class="text-muted">Visual preview of the page</small>
            </div>

            <div class="preview-tabs btn-group btn-group-sm" role="group" aria-label="Preview tabs">
              <button type="button" class="btn preview-tab-btn active" data-preview-tab="before">
                Before
              </button>
              <button type="button" class="btn preview-tab-btn" data-preview-tab="after">
                After
              </button>
            </div>
          </div>

          <div class="card-body p-0 preview-body-wrap">
            <!-- Before Tab Content -->
            <div id="before-preview-tab" class="preview-tab-content active">
              <div class="preview-surface preview-surface-before">
                <div class="preview-surface-top">
                  <span class="preview-pill">Original</span>
                </div>
                <div id="before-snapshot" class="preview-viewport">
                  <div class="preview-placeholder">
                    <small class="text-muted">Loading snapshot...</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- After Tab Content -->
            <div id="after-preview-tab" class="preview-tab-content" style="display: none;">
              <div class="preview-surface preview-surface-after">
                <div class="preview-surface-top">
                  <span class="preview-pill">AI Improved</span>
                </div>
                <div class="preview-viewport preview-iframe-wrap">
                  <iframe id="ai-preview" sandbox="allow-same-origin" class="preview-iframe"></iframe>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-5">
        <div class="card h-100">
          <div class="card-header">
            <strong class="m-0">Why These Changes Help</strong>
          </div>
          <div class="card-body">
            ${implementationHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- Code Suggestions -->
    <div class="row g-3 mb-3">
      <div class="col-12 col-lg-6">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong class="m-0">HTML Suggestion</strong>
            <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="html">Copy</button>
          </div>
          <div class="card-body p-0">
            <pre class="mb-0 bg-dark text-white p-3 small suggestion-code-block"><code>${escapeHtml(
              boilerplateHtml,
            )}</code></pre>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="card h-100">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong class="m-0">CSS Suggestion</strong>
            <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="css">Copy</button>
          </div>
          <div class="card-body p-0">
            <pre class="mb-0 bg-dark text-white p-3 small suggestion-code-block"><code>${escapeHtml(
              cssCode || "No CSS suggestions provided",
            )}</code></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- Follow-up -->
    <div class="row g-3">
      <div class="col-12">
        <div class="card">
          <div class="card-header">
            <strong class="m-0">Ask a Follow-up Question</strong>
          </div>
          <div class="card-body">
            <div class="input-group">
              <input 
                type="text" 
                id="input-prompt" 
                class="form-control" 
                placeholder="e.g., How can I make this responsive? Can you explain the flexbox usage?"
                aria-label="Follow-up question"
              />
              <button 
                class="btn btn-teal" 
                type="button" 
                id="prompt-submit-btn"
              >
                Ask AI
              </button>
            </div>
            <small class="text-muted d-block mt-2">
              Ask questions about the suggestions above to learn more!
            </small>
            <div id="conversation-history" class="mt-3 conversation-history"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  initializeSuggestionCopyButtons();
  initializePromptHandler();
  enhanceSuggestionsUI();

  // Set up before snapshot
  chrome.runtime
    .sendMessage({ type: "GET_CAPTURED_IMAGE" })
    .then(({ image }) => {
      const beforeContainer = document.getElementById("before-snapshot");
      if (beforeContainer && image) {
        beforeContainer.innerHTML = `<img src="${image}" alt="Original Snapshot" class="preview-snapshot-img" />`;
      } else if (beforeContainer) {
        beforeContainer.innerHTML = `<div class="preview-placeholder"><small class="text-muted">No snapshot available</small></div>`;
      }
    });

  // Set up after preview iframe
  const previewDoc = `
<!doctype html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 8px; 
      min-height: 100%; 
      overflow: auto;
    }
    ${cssCode || ""}
  </style>
</head>
<body>
  ${htmlCode || "<p>No HTML suggestion</p>"}
</body>
</html>
`;

  const previewIframe = document.getElementById("ai-preview");
  if (previewIframe) {
    previewIframe.srcdoc = previewDoc;
  }

  // Initialize preview tab switching
  const previewTabBtns = document.querySelectorAll(".preview-tab-btn");
  previewTabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-preview-tab");

      // Remove active class from all buttons
      previewTabBtns.forEach((b) => {
        b.classList.remove("active");
      });

      // Add active class to clicked button
      btn.classList.add("active");

      // Hide all tab contents
      document
        .querySelectorAll(".preview-tab-content")
        .forEach((content) => (content.style.display = "none"));

      // Show target tab content
      const targetContent = document.getElementById(`${targetTab}-preview-tab`);
      if (targetContent) {
        targetContent.style.display = "block";
      }
    });
  });
}

// ------------------- Prompt Handler -------------------
function initializePromptHandler() {
  const promptBtn = document.getElementById("prompt-submit-btn");
  const promptInput = document.getElementById("input-prompt");

  if (!promptBtn || !promptInput) return;

  const handlePromptSubmit = async () => {
    const userPrompt = promptInput.value.trim();

    if (!userPrompt) {
      promptInput.focus();
      return;
    }

    if (!lastSuggestionContent) {
      showToast("Generate suggestions first", "danger");
      return;
    }

    const conversationHistory = document.getElementById("conversation-history");
    if (!conversationHistory) return;

    // Disable input and button while processing
    promptBtn.disabled = true;
    promptInput.disabled = true;
    const originalBtnText = promptBtn.innerHTML;
    promptBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Asking...`;

    try {
      const response = await getPromptResponseByGroq(userPrompt);

      if (response?.success && response?.response) {
        // Append Q&A pair to conversation history
        appendConversationPair(userPrompt, response.response);
        promptInput.value = ""; // Clear input
      } else if (response?.error) {
        appendConversationPair(
          userPrompt,
          `<div class="alert alert-danger mb-0"><strong>Error:</strong> ${escapeHtml(response.error)}</div>`,
          true,
        );
      } else {
        appendConversationPair(
          userPrompt,
          `<div class="alert alert-warning mb-0">Unexpected response from AI service.</div>`,
          true,
        );
      }
    } catch (err) {
      console.error("Prompt error:", err);
      const friendly = humanizeGroqError(err);
      appendConversationPair(
        userPrompt,
        `<div class="alert alert-danger mb-0"><strong>${escapeHtml(
          friendly.title,
        )}:</strong> ${escapeHtml(friendly.message)}</div>`,
        true,
      );
    } finally {
      // Re-enable input and button
      promptBtn.disabled = false;
      promptInput.disabled = false;
      promptBtn.innerHTML = originalBtnText;
      promptInput.focus();
    }
  };

  // Button click handler
  promptBtn.addEventListener("click", handlePromptSubmit);

  // Enter key handler
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePromptSubmit();
    }
  });
}

// ------------------- Append Conversation Pair -------------------
function appendConversationPair(question, answer, isRawHtml = false) {
  const container = document.getElementById("conversation-history");
  if (!container) return;

  const qaWrapper = document.createElement("div");
  qaWrapper.className = "conversation-pair mt-3";

  // Parse and format the answer like suggestions
  let formattedAnswer;
  if (isRawHtml) {
    formattedAnswer = answer;
  } else {
    // Check if answer contains code blocks or structured sections
    const hasCodeBlocks = answer.includes("```");
    const hasSections = /###/i.test(answer);

    if (hasCodeBlocks || hasSections) {
      // Format like suggestion response
      formattedAnswer = formatEnhancedResponse(answer);
    } else {
      // Simple markdown formatting
      formattedAnswer = formatMarkdownText(answer);
    }
  }

  qaWrapper.innerHTML = `
    <div class="card border-primary mb-2">
      <div class="card-header bg-primary text-white">
        <strong>Your Question</strong>
      </div>
      <div class="card-body">
        <p class="mb-0">${escapeHtml(question)}</p>
      </div>
    </div>

    <div class="card border-success">
      <div class="card-header bg-success text-white d-flex justify-content-between align-items-center">
        <strong>AI Response</strong>
      </div>
      <div class="card-body">
        <div class="response-text">${formattedAnswer}</div>
      </div>
    </div>
  `;

  // Prepend instead of append (newest first)
  container.insertBefore(qaWrapper, container.firstChild);

  // Initialize copy button for this response
  const copyBtn = qaWrapper.querySelector(".conversation-copy-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        const textToCopy = isRawHtml ? question : answer;
        await navigator.clipboard.writeText(textToCopy);
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = "✅ Copied!";
        setTimeout(() => (copyBtn.innerHTML = orig), 1500);
      } catch (err) {
        console.error("Failed to copy response:", err);
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = "❌ Failed";
        setTimeout(() => (copyBtn.innerHTML = orig), 1500);
      }
    });
  }

  // Re-initialize copy buttons for code blocks in the response
  initializeSuggestionCopyButtons();

  // Scroll to top to show the newest response
  qaWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Close button handler is initialized on DOMContentLoaded (header button).

function enhanceSuggestionsUI() {
  // 1) Collapsible preview (Before/After card in suggestions)
  const previewCard = document
    .querySelector("#suggestions-content .comparison-header")
    ?.closest(".card");
  const previewHeader = previewCard?.querySelector(".card-header");
  const previewBody = previewCard?.querySelector(".card-body");
  if (previewHeader && previewBody) {
    previewBody.classList.add("d-none");
    previewBody.setAttribute("aria-hidden", "true");

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "btn btn-sm btn-outline-secondary";
    toggleBtn.id = "preview-toggle-btn";
    toggleBtn.setAttribute("aria-expanded", "false");
    toggleBtn.textContent = "Show preview";
    toggleBtn.addEventListener("click", () => {
      const open = !previewBody.classList.contains("d-none");
      previewBody.classList.toggle("d-none", open);
      previewBody.setAttribute("aria-hidden", open ? "true" : "false");
      toggleBtn.setAttribute("aria-expanded", open ? "false" : "true");
      toggleBtn.textContent = open ? "Show preview" : "Hide preview";
    });

    previewHeader.appendChild(toggleBtn);

    // 2) A11y roles for existing preview tabs
    const tabWrap = previewHeader.querySelector(".btn-group");
    if (tabWrap) tabWrap.setAttribute("role", "tablist");

    const tabBtns = previewHeader.querySelectorAll(".preview-tab-btn");
    tabBtns.forEach((btn) => {
      btn.setAttribute("role", "tab");
      const tabName = btn.getAttribute("data-preview-tab");
      if (tabName) btn.setAttribute("aria-controls", `${tabName}-preview-tab`);
      btn.setAttribute(
        "aria-selected",
        btn.classList.contains("active") ? "true" : "false",
      );
    });
  }

  // 3) (Removed) Device presets / scale / open snapshot controls (per request)

  // 5) Suggestion code blocks: add ids + set copy labels/targets
  const suggestionCards = document.querySelectorAll(
    "#suggestions-content .card .suggestion-copy-btn",
  );
  suggestionCards.forEach((btn) => {
    const lang = btn.getAttribute("data-lang");
    const card = btn.closest(".card");
    const code = card?.querySelector("pre code");
    if (!lang || !code) return;
    const id = `${lang}-suggestion-code`;
    code.id = id;
    btn.setAttribute("data-target", id);
    btn.textContent = lang === "html" ? "Copy HTML" : "Copy CSS";
  });

  // 6) Follow-up enhancements: clear + copy last answer, make history scrollable
  const history = document.getElementById("conversation-history");
  if (history) history.classList.add("conversation-history");

  const promptCardHeader = document
    .querySelector("#suggestions-content #prompt-submit-btn")
    ?.closest(".card")
    ?.querySelector(".card-header");

  if (promptCardHeader) {
    promptCardHeader.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 w-100">
        <strong class="m-0">Follow-up questions</strong>
        <div class="d-flex gap-2">
          <button type="button" id="clear-conversation-btn" class="btn btn-sm btn-outline-secondary">Clear</button>
          <button type="button" id="copy-last-answer-btn" class="btn btn-sm btn-outline-secondary" disabled aria-disabled="true">Copy last answer</button>
        </div>
      </div>
    `;

    const clearBtn = document.getElementById("clear-conversation-btn");
    const copyBtn = document.getElementById("copy-last-answer-btn");
    const updateCopyState = () => {
      const hasAny = Boolean(
        document.querySelector("#conversation-history .conversation-pair"),
      );
      if (!copyBtn) return;
      copyBtn.disabled = !hasAny;
      copyBtn.setAttribute("aria-disabled", hasAny ? "false" : "true");
    };

    clearBtn?.addEventListener("click", () => {
      const container = document.getElementById("conversation-history");
      if (container) container.innerHTML = "";
      updateCopyState();
      showToast("Cleared conversation", "success");
    });

    copyBtn?.addEventListener("click", async () => {
      const first = document.querySelector(
        "#conversation-history .conversation-pair .response-text",
      );
      const text = first?.textContent?.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied last answer");
      } catch {
        showToast("Copy failed", "danger");
      }
    });

    // Update after new messages (simple polling-less approach)
    const observer = new MutationObserver(() => updateCopyState());
    const container = document.getElementById("conversation-history");
    if (container)
      observer.observe(container, { childList: true, subtree: true });
    updateCopyState();
  }
}
