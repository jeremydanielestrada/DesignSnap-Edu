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

    isError?.classList.add("d-none");
    starter?.classList.add("d-none");
    extractLoader?.classList.remove("d-none");

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

            return { html, css };
          }

          return await extractContent();
        },
      });

      if (!result) throw new Error("No result returned from extraction script");

      const { html, css } = result;

      if (htmlOutput) htmlOutput.textContent = html.trim();
      if (cssOutput) cssOutput.textContent = css.trim();

      extractedDOM?.classList.remove("d-none");

      const suggestBtn = document.getElementById("suggest-btn");
      if (suggestBtn) {
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

// ------------------- Loader Animation -------------------
async function animateLoaderSteps() {
  const steps = document.querySelectorAll(".loader-steps .step");
  steps.forEach((step) => step.classList.remove("active", "completed"));

  for (let i = 0; i < steps.length; i++) {
    if (i > 0) {
      steps[i - 1].classList.remove("active");
      steps[i - 1].classList.add("completed");
    }
    steps[i].classList.add("active");
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
  if (loaderText) loaderText.textContent = "Generating AI Suggestions...";

  // Animate loader steps
  await animateLoaderSteps();

  try {
    const suggestions = await getSuggestionBYGroq(html, css);

    if (suggestions?.success && suggestions?.analysis) {
      const parts = parseAIResponse(suggestions.analysis);

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
  } catch (err) {
    console.error("Suggestion error:", err);
    suggestionsContent.innerHTML = `<div class="alert alert-danger"><strong>Connection Error:</strong> ${escapeHtml(
      err.message || "Unknown",
    )}</div>`;
    suggestContainer.classList.remove("d-none");
    suggestContainer.setAttribute("aria-hidden", "false");
  } finally {
    loader.classList.add("d-none");
  }
}

// ------------------- Parse AI Response -------------------
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

// ------------------- Markdown Formatter -------------------
function formatMarkdownText(text) {
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

    if (!resp.ok)
      throw new Error(
        `API request failed: ${resp.status} ${resp.statusText} — ${JSON.stringify(payload)}`,
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
  <!-- HTML Suggestion Card -->
  <div class="card mb-3">
    <div class="card-header d-flex justify-content-between align-items-center">
      <strong class="m-0">HTML Suggestion</strong>
      <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="html">Copy</button>
    </div>
    <div class="card-body p-0">     
      <pre class="mb-0 bg-dark text-white p-3 small" style="max-height:600px; overflow:auto;">
        <code>${escapeHtml(boilerplateHtml)}</code>
      </pre>
    </div>
  </div>

  <!-- CSS Suggestion Card -->
  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center">
      <strong class="m-0">CSS Suggestion</strong>
      <button class="btn btn-sm btn-outline-secondary suggestion-copy-btn" data-lang="css">Copy</button>
    </div>
    <div class="card-body p-0">
      <pre class="mb-0 bg-dark text-white p-3 small" style="max-height:600px; overflow:auto;">
        <code>${escapeHtml(cssCode || "No CSS suggestions provided")}</code>
      </pre>
    </div>
  </div>
</div>

      <!-- Ask Follow-up Question Section -->
      <div class="col-12 mt-3">
        <div class="card">
          <div class="card-header">
            <strong class="m-0">💬 Ask a Follow-up Question</strong>
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
            
            <!-- Conversation History Container -->
            <div id="conversation-history" class="mt-3"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  initializeSuggestionCopyButtons();
  initializePromptHandler();
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
      alert(
        "No previous suggestions found. Please generate suggestions first.",
      );
      return;
    }

    const conversationHistory = document.getElementById("conversation-history");
    if (!conversationHistory) return;

    // Disable input and button while processing
    promptBtn.disabled = true;
    promptInput.disabled = true;
    const originalBtnText = promptBtn.innerHTML;
    promptBtn.innerHTML = "Processing...";

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
      appendConversationPair(
        userPrompt,
        `<div class="alert alert-danger mb-0"><strong>Connection Error:</strong> ${escapeHtml(err.message || "Unknown error")}</div>`,
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
  promptInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
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

  const formattedAnswer = isRawHtml ? answer : formatMarkdownText(answer);

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
        <button class="btn btn-sm btn-light conversation-copy-btn">Copy Response</button>
      </div>
      <div class="card-body">
        <div class="response-text">${formattedAnswer}</div>
      </div>
    </div>
  `;

  container.appendChild(qaWrapper);

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

  // Scroll to the new Q&A pair
  qaWrapper.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ------------------- Close Extension -------------------
const closeBtn = document.getElementById("close-extension-btn");
if (closeBtn) closeBtn.addEventListener("click", () => window.close());
