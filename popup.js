async function showSnapshot() {
  const { image } = await chrome.runtime.sendMessage({
    type: "GET_CAPTURED_IMAGE",
  });
  if (image) {
    const snapshotContainer = document.getElementById("snapshot-container");
    snapshotContainer.innerHTML = `<img src="${image}" alt="Tab Snapshot" style="max-width:100%;border-radius:8px;" />`;
  }
}

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

function initializeSuggestionCopyButtons() {
  const suggestionCopyBtns = document.querySelectorAll(".suggestion-copy-btn");
  suggestionCopyBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      // Try multiple fallbacks to locate the associated <code> block
      const codeBlock =
        btn.closest(".code-suggestion")?.querySelector("code") ||
        btn.closest(".card")?.querySelector("code") ||
        // fallback: button in header, look for code in sibling card-body
        btn.parentElement?.nextElementSibling?.querySelector("code") ||
        // last-resort: search nearby container
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

document.addEventListener("DOMContentLoaded", () => {
  showSnapshot();
  initializeUI();

  const starterBtn = document.getElementById("starter-btn");
  if (!starterBtn) return;

  starterBtn.addEventListener("click", async () => {
    console.log("starter clicked");
    const { tabId } = await chrome.runtime.sendMessage({
      type: "GET_LAST_TAB",
    });

    const starter = document.querySelector(".intro");
    const extractLoader = document.getElementById("loader-container");
    const isError = document.getElementById("error");
    const extractedDOM = document.querySelector(".extracted-DOM");
    const htmlOutput = document.getElementById("html-output");
    const cssOutput = document.getElementById("css-output");

    // show loader immediately so user sees progress
    isError?.classList.add("d-none");
    starter?.classList.add("d-none");
    extractLoader?.classList.remove("d-none");

    try {
      if (!tabId)
        throw new Error("No active tab found. Open a webpage and try again.");

      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractContent,
      });

      if (!result) throw new Error("No result returned from extraction script");

      const { html, css } = result;

      if (htmlOutput) htmlOutput.textContent = html.trim();
      if (cssOutput) cssOutput.textContent = css.trim();

      // reveal extracted DOM AFTER content filled
      extractedDOM?.classList.remove("d-none");

      // wire suggest button once with current html/css
      const suggestBtn = document.getElementById("suggest-btn");
      if (suggestBtn) {
        // ensure single listener
        suggestBtn.replaceWith(suggestBtn.cloneNode(true));
        const newSuggest = document.getElementById("suggest-btn");
        newSuggest?.addEventListener("click", async () => {
          await handleSuggestions(html, css);
        });
      }
    } catch (err) {
      console.error("Extraction error:", err);
      if (isError) {
        isError.classList.remove("d-none");
        isError.textContent = "Error: " + (err.message || "Unknown error");
      }
      extractedDOM?.classList.add("d-none");
    } finally {
      extractLoader?.classList.add("d-none");
    }
  });
});

/**
 * Animates loader steps sequentially with delays
 */
function animateLoaderSteps() {
  const steps = document.querySelectorAll(".loader-steps .step");
  steps.forEach((step) => {
    step.classList.remove("active", "completed");
  });

  let delay = 0;
  steps.forEach((step, index) => {
    setTimeout(() => {
      step.classList.add("active");

      // Mark previous steps as completed
      if (index > 0) {
        steps[index - 1].classList.remove("active");
        steps[index - 1].classList.add("completed");
      }
    }, delay);
    delay += 800; // 800ms delay between each step
  });

  // Mark the last step as completed after animation finishes
  setTimeout(() => {
    if (steps.length > 0) {
      steps[steps.length - 1].classList.remove("active");
      steps[steps.length - 1].classList.add("completed");
    }
  }, delay);
}

/**
 * Handles the suggestion flow (shows spinner, calls API, renders results)
 */
async function handleSuggestions(html, css) {
  const suggestContainer = document.getElementById("suggestions-container");
  const suggestionsContent = document.getElementById("suggestions-content");
  const loader = document.getElementById("loader-container");
  const loaderText = document.getElementById("loader-text");
  const extractedDOM = document.querySelector(".extracted-DOM");

  if (!suggestContainer || !suggestionsContent || !loader) return;

  // UI: show loader, hide other major sections
  extractedDOM?.classList.add("d-none");
  suggestContainer.classList.add("d-none");
  loader.classList.remove("d-none");
  if (loaderText) loaderText.textContent = "Generating AI Suggestions...";

  // Animate loader steps
  animateLoaderSteps();

  try {
    const suggestions = await getSuggestionBYGroq(html, css);

    if (suggestions?.success && suggestions?.analysis) {
      // parse into structured parts and render clean UI
      const parts = parseAIResponse(suggestions.analysis);
      renderSuggestionsBlock(
        parts.analysisHtml,
        parts.htmlCode,
        parts.cssCode,
        parts.implementationHtml,
      );
    } else if (suggestions?.error) {
      suggestionsContent.innerHTML = `<div class="alert alert-danger mb-0">API Error: ${escapeHtml(
        suggestions.error,
      )}</div>`;
    } else {
      suggestionsContent.innerHTML = `<div class="alert alert-warning mb-0">Unexpected response from AI service.</div>`;
    }

    // show suggestions
    suggestContainer.classList.remove("d-none");
    initializeSuggestionCopyButtons();
  } catch (err) {
    console.error("Suggestion error:", err);
    suggestionsContent.innerHTML = `<div class="alert alert-danger"><strong>Connection Error:</strong> ${escapeHtml(
      err.message || "Unknown",
    )}</div>`;
    suggestContainer.classList.remove("d-none");
  } finally {
    loader.classList.add("d-none");
  }
}

/**
 * Parses AI response and returns structured parts:
 * { analysisHtml, htmlCode, cssCode, implementationHtml }
 * - analysisHtml: safe HTML for analysis / key issues
 * - htmlCode / cssCode: raw code strings (not escaped)
 * - implementationHtml: HTML with implementation notes (safe)
 */
function parseAIResponse(content) {
  const analysisSummaryMatch = content.match(
    /###?\s*\s*\*?\*?ANALYSIS SUMMARY\*?\*?([\s\S]*?)(?=###|$)/i,
  );
  const keyIssuesMatch = content.match(
    /###?\s*⚠️\s*\*?\*?KEY ISSUES IDENTIFIED\*?\*?([\s\S]*?)(?=###|$)/i,
  );
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
  const cssMatch = content.match(/```css\n([\s\S]*?)\n```/);
  const implementationNotesMatch = content.match(
    /###?\s*\s*\*?\*?IMPLEMENTATION NOTES\*?\*?([\s\S]*?)(?=###|$)/i,
  );

  // Build analysis HTML (safe)
  let analysisParts = [];
  if (analysisSummaryMatch) {
    analysisParts.push(
      `<h5 class="mb-2">🔍 Analysis Summary</h5><div class="small text-muted">${formatMarkdownText(
        analysisSummaryMatch[1].trim(),
      )}</div>`,
    );
  }
  if (keyIssuesMatch) {
    analysisParts.push(
      `<h5 class="mt-3 mb-2">⚠️ Key Issues</h5><div class="small text-muted">${formatMarkdownText(
        keyIssuesMatch[1].trim(),
      )}</div>`,
    );
  }
  const analysisHtml = analysisParts.length
    ? analysisParts.join("")
    : `<p class="small text-muted">No analysis summary provided by the AI.</p>`;

  // Raw code (preserve as text)
  const htmlCode = htmlMatch ? htmlMatch[1].trim() : "";
  const cssCode = cssMatch ? cssMatch[1].trim() : "";

  // Implementation notes (safe HTML)
  const implementationHtml = implementationNotesMatch
    ? `<h6 class="mb-2">🎯 Implementation Notes</h6><div class="small text-muted">${formatMarkdownText(
        implementationNotesMatch[1].trim(),
      )}</div>`
    : `<h6 class="mb-2">💡 Implementation Tips</h6><div class="small text-muted"><ul><li>Test changes in a development environment</li><li>Verify accessibility and responsiveness</li><li>Use progressive rollouts</li></ul></div>`;

  return { analysisHtml, htmlCode, cssCode, implementationHtml };
}

/**
 * Formats markdown-style text to HTML
 */
function formatMarkdownText(text) {
  // Convert markdown lists to HTML
  let formatted = text
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

  // Wrap lists in ul tags
  formatted = formatted.replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>");

  // Wrap text in paragraphs if not already in a list
  if (!formatted.includes("<ul>") && !formatted.includes("<li>")) {
    formatted = `<p>${formatted}</p>`;
  }

  return formatted;
}

/**
 * Escapes text for safe HTML rendering
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Proxy call to Groq API (via your server)
 */
async function getSuggestionBYGroq(html, css) {
  try {
    const resp = await fetch("https://dse-server.vercel.app/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html, css }),
    });

    // Read response body text to surface errors
    const text = await resp.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (e) {
      payload = text;
    }

    if (!resp.ok) {
      console.error("Groq API error:", resp.status, resp.statusText, payload);
      throw new Error(
        `Groq API request failed: ${resp.status} ${
          resp.statusText
        } — ${JSON.stringify(payload)}`,
      );
    }

    return payload;
  } catch (err) {
    console.error("Network/API call failed:", err);
    // Re-throw so UI can show message
    throw err;
  }
}

/**
 * Content extraction function
 * Runs in the page context
 */
function extractContent() {
  let html = document.body.innerHTML;

  // Limit HTML length
  const MAX_HTML = 5000;
  if (html.length > MAX_HTML) {
    html = html.slice(0, MAX_HTML) + "\n<!-- truncated -->";
  }

  // Collect CSS rules
  let css = "";
  let hasStyleSheets = false;
  for (let sheet of document.styleSheets) {
    hasStyleSheets = true;
    try {
      let count = 0;
      for (let rule of sheet.cssRules) {
        css += rule.cssText + "\n";
        if (++count > 50) {
          css += "/* truncated */\n";
          break;
        }
      }
    } catch {
      css += `/* Could not access CSS from ${sheet.href} */\n`;
    }
  }

  // If no CSS found, note that inline styles are used
  if (!css.trim()) {
    css = "/* No external CSS detected - this page uses inline styles */";
  }

  const MAX_CSS = 3000;
  if (css.length > MAX_CSS) {
    css = css.slice(0, MAX_CSS) + "\n/* truncated */";
  }

  return { html, css };
}

function renderSuggestionsBlock(
  analysisHtml,
  htmlCode,
  cssCode,
  implementationHtml,
) {
  const container = document.getElementById("suggestions-content");
  if (!container) return;

  // Wrap HTML suggestion in boilerplate if it's not empty
  const boilerplateHtml = htmlCode
    ? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suggested Page</title>
  <style rel="stylesheet">
  </style>
</head>
<body>
${htmlCode}
</body>
</html>`
    : "No HTML suggestions provided";

  container.innerHTML = `
    <div class="row g-3">
      <div class="col-12 col-lg-6">
        <div class="card h-100">
          <div class="card-body">
            ${analysisHtml}
            <div class="mt-3">
              ${implementationHtml}
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong class="m-0">HTML Suggestion (Boilerplate)</strong>
            <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="html">Copy</button>
          </div>
          <div class="card-body p-0">
            <pre class="mb-0 bg-dark text-white p-3 small" style="max-height:260px;overflow:auto;"><code>${escapeHtml(
              boilerplateHtml,
            )}</code></pre>
          </div>
        </div>

        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <strong class="m-0">CSS Suggestion</strong>
            <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="css">Copy</button>
          </div>
          <div class="card-body p-0">
            <pre class="mb-0 bg-dark text-white p-3 small" style="max-height:260px;overflow:auto;"><code>${escapeHtml(
              cssCode || "No CSS suggestions provided",
            )}</code></pre>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire copy buttons for injected content
  initializeSuggestionCopyButtons();
}

// Close the extension window when clicked
const closeBtn = document.getElementById("close-extension-btn");
if (closeBtn) {
  closeBtn.addEventListener("click", () => {
    window.close();
  });
}
