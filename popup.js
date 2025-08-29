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

      extractLoader.style.display = "flex";

      if (chrome.runtime.lastError) {
        isError.innerHTML = "Error: " + chrome.runtime.lastError.message;
        extractedDOM.style.display = "none";
      }

      try {
        const { html, css } = results[0].result;
        htmlOutput.textContent = html.trim();
        cssOutput.textContent = css.trim();
      } catch {
        isError.classList.remove("error");
        isError.classList.add("error-result");
      } finally {
        extractLoader.style.display = "none";
      }
    }
  );
});

function extractContent() {
  const html = document.documentElement.outerHTML;

  let css = "";
  for (let sheet of document.styleSheets) {
    try {
      for (let rule of sheet.cssRules) {
        css += rule.cssText + "\n";
      }
    } catch (e) {
      css += `/* Could not access CSS from ${sheet.href} */\n`;
    }
  }

  return { html, css };
}
