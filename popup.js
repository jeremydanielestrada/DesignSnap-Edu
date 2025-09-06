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
  const loaderText = document.querySelector("#loader-text");

  suggestContainer.style.display = "none";
  extractLoader.style.display = "flex";
  loaderText.textContent = "Generating Suggestions...";
  extractedDOM.style.display = "none";

  try {
    const suggestions = await getSuggestionBYGroq(html, css);
    console.log("Groq raw response:", suggestions);

    if (suggestions?.choices?.length > 0) {
      const rawContent =
        suggestions.choices[0].message?.content || "No content.";
      const cleanedResponse = parseAIResponse(rawContent);
      suggestContainer.innerHTML = cleanedResponse;
      suggestContainer.style.display = "block";
    } else if (suggestions?.error) {
      suggestContainer.innerHTML =
        "Groq API Error: " + suggestions.error.message;
    } else {
      suggestContainer.innerHTML = "Unexpected response from Groq.";
    }
  } catch (err) {
    console.error("Suggestion error:", err);
    suggestContainer.innerHTML = "Fetch failed: " + err.message;
  } finally {
    extractLoader.style.display = "none";
  }
}

/**
 * Parses and formats AI response into safe HTML
 */
function parseAIResponse(content) {
  const explanationMatch = content.match(/^([\s\S]*?)(?=HTML:|```html)/);
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
  const cssMatch = content.match(/```css\n([\s\S]*?)\n```/);

  const explanation = explanationMatch ? explanationMatch[1].trim() : "";
  const htmlCode = htmlMatch ? htmlMatch[1] : "No HTML suggestions provided";
  const cssCode = cssMatch ? cssMatch[1] : "No CSS suggestions provided";

  let output = "";

  if (explanation) {
    output += `
      <div class="issues-explanation">
        <h3>Issues Analysis:</h3>
        <p>${escapeHtml(explanation)}</p>
      </div>`;
  }

  output += `
    <h3>HTML Suggestions:</h3>
    <div class="html-container">
      <pre><code class="language-html">${escapeHtml(htmlCode)}</code></pre>
    </div>
    <h3>CSS Suggestions:</h3>
    <div class="css-container">
      <pre><code class="language-css">${escapeHtml(cssCode)}</code></pre>
    </div>`;

  return output;
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
