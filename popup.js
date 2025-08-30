document.getElementById("starter-btn").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const starter = document.querySelector(".intro");
  const extractLoader = document.getElementById("loader-container");
  const isError = document.getElementById("error");
  const extractedDOM = document.querySelector(".extracted-DOM");

  //removing the introduction
  starter.style.display = "none";
  extractedDOM.classList.remove("extracted-DOM");

  chrome.scripting.executeScript(
    {
      target: { tabId: tab.id },
      func: extractContent,
    },
    (results) => {
      const htmlOutput = document.getElementById("html-output");
      const cssOutput = document.getElementById("css-output");
      const { html, css } = results[0].result;

      extractLoader.style.display = "flex";

      if (chrome.runtime.lastError || !results) {
        isError.innerHTML = "Error: " + chrome.runtime.lastError.message;
        extractedDOM.style.display = "none";
      }

      try {
        htmlOutput.textContent = html.trim();
        cssOutput.textContent = css.trim();
      } catch {
        isError.classList.remove("error");
        isError.classList.add("error-result");
      } finally {
        extractLoader.style.display = "none";
      }

      ///triggger event for generating suggestiong
      document
        .getElementById("suggest-btn")
        .addEventListener("click", async () => {
          extractedDOM.classList.add("extracted-DOM");

          const suggestContainer = document.querySelector(
            ".suggestions-container"
          );

          suggestContainer.style.display = "block";

          try {
            const suggestions = await getSuggestionBYGroq(html, css);
            console.log("Groq raw response:", suggestions);

            if (suggestions?.choices && suggestions.choices.length > 0) {
              const rawContent =
                suggestions.choices[0].message?.content || "No content.";
              const cleanedResponse = parseAIResponse(rawContent);
              suggestContainer.innerHTML = cleanedResponse;
            } else if (suggestions?.error) {
              suggestContainer.innerHTML =
                "Groq API Error: " + suggestions.error.message;
            } else {
              suggestContainer.innerHTML = "Unexpected response from Groq.";
            }
          } catch (err) {
            suggestContainer.innerHTML = "Fetch failed: " + err.message;
          }
        });

      //End of the event
    }
  );
});

// Function to parse and clean AI response - extracts only code blocks
function parseAIResponse(content) {
  const explanationMatch = content.match(/^([\s\S]*?)(?=HTML:|```html)/);
  const htmlMatch = content.match(/```html\n([\s\S]*?)\n```/);
  const cssMatch = content.match(/```css\n([\s\S]*?)\n```/);

  const explanation = explanationMatch ? explanationMatch[1].trim() : "";
  const htmlCode = htmlMatch ? htmlMatch[1] : "No HTML suggestions provided";
  const cssCode = cssMatch ? cssMatch[1] : "No CSS suggestions provided";

  let output = "";

  // Add explanation if it exists
  if (explanation) {
    output += `<div class="issues-explanation"><h3>Issues Analysis:</h3><p>${escapeHtml(
      explanation
    )}</p></div>`;
  }

  // Add code blocks
  output += `<h3>HTML Suggestions:</h3><pre><code class="language-html">${escapeHtml(
    htmlCode
  )}</code></pre><h3>CSS Suggestions:</h3><pre><code class="language-css">${escapeHtml(
    cssCode
  )}</code></pre>`;

  return output;
}

// Function to escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

//Get suggestion by ai
async function getSuggestionBYGroq(html, css) {
  const response = await fetch("http://localhost:3000/api/suggest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ html, css }),
  });

  if (!response.ok) {
    throw new Error("Groq API request failed: " + response.statusText);
  }

  return await response.json();
}

function extractContent() {
  // Only grab the body, not the full document
  let html = document.body.innerHTML;

  // Limit HTML length
  const MAX_HTML = 5000;
  if (html.length > MAX_HTML) {
    html = html.slice(0, MAX_HTML) + "\n<!-- truncated -->";
  }

  // Collect lightweight CSS
  let css = "";
  for (let sheet of document.styleSheets) {
    try {
      let count = 0;
      for (let rule of sheet.cssRules) {
        css += rule.cssText + "\n";
        count++;
        if (count > 50) {
          // only first 50 rules per stylesheet
          css += "/* truncated */\n";
          break;
        }
      }
    } catch (e) {
      css += `/* Could not access CSS from ${sheet.href} */\n`;
    }
  }

  // Limit CSS length
  const MAX_CSS = 3000;
  if (css.length > MAX_CSS) {
    css = css.slice(0, MAX_CSS) + "\n/* truncated */";
  }

  return { html, css };
}
