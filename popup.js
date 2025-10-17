async function showSnapshot() {
  const { image } = await chrome.runtime.sendMessage({
    type: "GET_CAPTURED_IMAGE",
  });
  if (image) {
    const snapshotContainer = document.getElementById("snapshot-container");
    snapshotContainer.innerHTML = `<img src="${image}" alt="Tab Snapshot" style="max-width:100%;border-radius:8px;" />`;
  }
}

// Initialize UI enhancements
function initializeUI() {
  // Tab switching functionality
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");

      // Remove active class from all tabs and contents
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      // Add active class to clicked tab and corresponding content
      btn.classList.add("active");
      document.getElementById(`${targetTab}-tab`).classList.add("active");
    });
  });

  // Copy functionality
  const copyBtns = document.querySelectorAll(".copy-btn");
  copyBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-target");
      const codeElement = document.getElementById(targetId);

      if (codeElement) {
        try {
          await navigator.clipboard.writeText(codeElement.textContent);
          btn.innerHTML = "✅ Copied!";
          setTimeout(() => {
            btn.innerHTML = "📋 Copy";
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.innerHTML = "❌ Failed";
          setTimeout(() => {
            btn.innerHTML = "📋 Copy";
          }, 2000);
        }
      }
    });
  });
}

// Call this function when you want to display the snapshot, e.g., on popup load:
document.addEventListener("DOMContentLoaded", () => {
  showSnapshot();
  initializeUI();
});

document.getElementById("starter-btn").addEventListener("click", async () => {
  const { tabId } = await chrome.runtime.sendMessage({ type: "GET_LAST_TAB" });

  // skip extension pages
  if (!tabId) {
    throw new Error("No tab available. Open a webpage before starting.");
  }

  const starter = document.querySelector(".intro");
  const extractLoader = document.getElementById("loader-container");
  const isError = document.getElementById("error");
  const extractedDOM = document.querySelector(".extracted-DOM");
  const htmlOutput = document.getElementById("html-output");
  const cssOutput = document.getElementById("css-output");

  // Reset UI
  starter.style.display = "none";
  extractLoader.style.display = "block";
  isError.style.display = "none";
  extractedDOM.style.display = "block";

  try {
    // Inject extraction script into active tab
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: extractContent,
    });

    if (!result) {
      throw new Error("No result returned from extraction script");
    }

    const { html, css } = result;

    // Display extracted content
    htmlOutput.textContent = html.trim();
    cssOutput.textContent = css.trim();

    // Enable the suggestion button
    document.getElementById("suggest-btn").onclick = async () => {
      await handleSuggestions(html, css, extractLoader, extractedDOM);
      extractedDOM.style.display = "none";
    };
  } catch (err) {
    console.error("Extraction error:", err);
    isError.style.display = "block";
    isError.textContent = "Error: " + (err.message || "Unknown error");
    extractedDOM.style.display = "none";
  } finally {
    extractLoader.style.display = "none";
  }
});

/**
 * Handles the suggestion flow
 */
async function handleSuggestions(html, css, extractLoader, extractedDOM) {
  const suggestContainer = document.querySelector(".suggestions-container");
  const suggestionsContent = document.querySelector(".suggestions-content");
  const loaderText = document.querySelector("#loader-text");

  suggestContainer.style.display = "none";
  extractLoader.style.display = "flex";
  loaderText.textContent = "Generating AI Suggestions...";
  extractedDOM.style.display = "none";

  try {
    const suggestions = await getSuggestionBYGroq(html, css);
    console.log("Groq raw response:", suggestions);

    // Handle the API response format: { success: true, analysis: "..." }
    if (suggestions?.success && suggestions?.analysis) {
      const rawContent = suggestions.analysis;
      const cleanedResponse = parseAIResponse(rawContent);
      suggestionsContent.innerHTML = cleanedResponse;
      suggestContainer.style.display = "block";

      // Initialize copy functionality for suggestion code blocks
      initializeSuggestionCopyButtons();
    } else if (suggestions?.error) {
      suggestionsContent.innerHTML = `
        <div class="error-message">
          <h3>🚫 API Error</h3>
          <p>API Error: ${suggestions.error}</p>
        </div>`;
      suggestContainer.style.display = "block";
    } else {
      suggestionsContent.innerHTML = `
        <div class="error-message">
          <h3>⚠️ Unexpected Response</h3>
          <p>Received an unexpected response from the AI service. Please try again.</p>
          <pre style="text-align: left; background: #f5f5f5; padding: 1rem; border-radius: 6px; margin-top: 1rem; overflow: auto;">${JSON.stringify(
            suggestions,
            null,
            2
          )}</pre>
        </div>`;
      suggestContainer.style.display = "block";
    }
  } catch (err) {
    console.error("Suggestion error:", err);
    suggestionsContent.innerHTML = `
      <div class="error-message">
        <h3>🔌 Connection Error</h3>
        <p>Failed to connect to AI service: ${err.message}</p>
        <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #20c997; color: white; border: none; border-radius: 6px; cursor: pointer;">
          🔄 Try Again
        </button>
      </div>`;
  } finally {
    extractLoader.style.display = "none";
  }
}

// Initialize copy buttons for suggestion code blocks
function initializeSuggestionCopyButtons() {
  const suggestionCopyBtns = document.querySelectorAll(".suggestion-copy-btn");
  suggestionCopyBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const codeBlock = btn.closest(".code-suggestion").querySelector("code");

      if (codeBlock) {
        try {
          await navigator.clipboard.writeText(codeBlock.textContent);
          btn.innerHTML = "✅ Copied!";
          setTimeout(() => {
            btn.innerHTML = "📋 Copy Code";
          }, 2000);
        } catch (err) {
          console.error("Failed to copy:", err);
          btn.innerHTML = "❌ Failed";
          setTimeout(() => {
            btn.innerHTML = "📋 Copy Code";
          }, 2000);
        }
      }
    });
  });
}

/**
 * Parses and formats AI response into safe HTML
 */
function parseAIResponse(content) {
  // Try to extract different sections from the AI response
  const analysisSummaryMatch = content.match(
    /###?\s*\s*\*?\*?ANALYSIS SUMMARY\*?\*?([\s\S]*?)(?=###|$)/i
  );
  const keyIssuesMatch = content.match(
    /###?\s*⚠️\s*\*?\*?KEY ISSUES IDENTIFIED\*?\*?([\s\S]*?)(?=###|$)/i
  );
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
  const cssMatch = content.match(/```css\n([\s\S]*?)\n```/);
  const implementationNotesMatch = content.match(
    /###?\s*\s*\*?\*?IMPLEMENTATION NOTES\*?\*?([\s\S]*?)(?=###|$)/i
  );

  let output = "";

  // Analysis Summary Section
  if (analysisSummaryMatch || keyIssuesMatch) {
    output += `<div class="issues-explanation">`;

    if (analysisSummaryMatch) {
      output += `
        <h3>🔍 Analysis Summary</h3>
        <div class="explanation-content">
          ${formatMarkdownText(analysisSummaryMatch[1].trim())}
        </div>`;
    }

    if (keyIssuesMatch) {
      output += `
        <h3>⚠️ Key Issues Identified</h3>
        <div class="explanation-content">
          ${formatMarkdownText(keyIssuesMatch[1].trim())}
        </div>`;
    }

    output += `</div>`;
  }

  // Code suggestions
  const htmlCode = htmlMatch ? htmlMatch[1] : "No HTML suggestions provided";
  const cssCode = cssMatch ? cssMatch[1] : "No CSS suggestions provided";

  output += `
    <div class="suggestions-grid">
      <div class="code-suggestion html-suggestion">
        <div class="suggestion-header">
          <h3>📄 HTML Suggestions</h3>
          <button class="suggestion-copy-btn">📋 Copy Code</button>
        </div>
        <div class="html-container">
          <pre><code class="language-html">${escapeHtml(htmlCode)}</code></pre>
        </div>
      </div>
      
      <div class="code-suggestion css-suggestion">
        <div class="suggestion-header">
          <h3>🎨 CSS Suggestions</h3>
          <button class="suggestion-copy-btn">📋 Copy Code</button>
        </div>
        <div class="css-container">
          <pre><code class="language-css">${escapeHtml(cssCode)}</code></pre>
        </div>
      </div>
    </div>`;

  // Implementation Notes
  if (implementationNotesMatch) {
    output += `
      <div class="suggestion-footer">
        <div class="tip-box">
          <h4>🎯 Implementation Notes</h4>
          ${formatMarkdownText(implementationNotesMatch[1].trim())}
        </div>
      </div>`;
  } else {
    output += `
      <div class="suggestion-footer">
        <div class="tip-box">
          <h4>💡 Implementation Tips</h4>
          <ul>
            <li>Test changes in a development environment first</li>
            <li>Ensure accessibility standards are maintained</li>
            <li>Consider mobile responsiveness for all modifications</li>
            <li>Validate your HTML and CSS after implementation</li>
          </ul>
        </div>
      </div>`;
  }

  return output;
}

/**
 * Formats markdown-style text to HTML
 */
function formatMarkdownText(text) {
  // Convert markdown lists to HTML
  let formatted = text
    .replace(
      /^\s*-\s+\*\*(.+?):\*\*\s+(.+)$/gm,
      "<li><strong>$1:</strong> $2</li>"
    )
    .replace(
      /^\s*-\s+\*\*(.+?)\*\*\s+(.+)$/gm,
      "<li><strong>$1</strong> $2</li>"
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
  const response = await fetch("https://dse-server.vercel.app/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, css }),
  });

  if (!response.ok) {
    throw new Error("Groq API request failed: " + response.statusText);
  }

  return response.json();
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
  for (let sheet of document.styleSheets) {
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

  const MAX_CSS = 3000;
  if (css.length > MAX_CSS) {
    css = css.slice(0, MAX_CSS) + "\n/* truncated */";
  }

  return { html, css };
}
