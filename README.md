# 🎨 DesignSnap Edu

<div align="center">

![DesignSnap Edu Logo](assets/icons/code.png)

**AI-Powered UI/UX Analysis Chrome Extension**

A powerful Chrome extension that analyzes your website's HTML and CSS to provide intelligent suggestions for better design, improved readability, and enhanced accessibility using Groq AI.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

</div>

---

## 🚀 Features

- 📸 **Website Snapshot** - Capture and display the current webpage view
- 🔍 **Code Analysis** - Extract and analyze HTML and CSS from any webpage
- 🤖 **AI-Powered Suggestions** - Get intelligent recommendations using Groq AI
- ♿ **Accessibility Tips** - WCAG 2.1 compliance recommendations
- 📱 **Responsive Design** - Mobile-first approach suggestions
- 🎨 **Modern CSS Practices** - Flexbox/Grid and best practices advice
- 📋 **Copy to Clipboard** - Easily copy suggested code improvements

---

## 🛠️ Built With

<div align="center">

| Technology                                                                                                                 | Purpose             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)                         | Structure & Markup  |
| ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)                            | Styling & Design    |
| ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)          | Core Functionality  |
| ![Groq](https://img.shields.io/badge/Groq-AI-FF6B35?style=for-the-badge&logo=ai&logoColor=white)                           | AI Analysis Engine  |
| ![Chrome](https://img.shields.io/badge/Chrome-Extensions_API-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white) | Browser Integration |

</div>

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Google Chrome** browser (or Chromium-based browser)
- **Groq API Key** - Get yours at [console.groq.com](https://console.groq.com)
- **Backend Server** - The DSE-Server must be running (see server documentation)

---

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/jeremydanielestrada/DesignSnap-Edu.git
cd DesignSnap-Edu
```

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `DesignSnap-Edu` folder
5. The extension icon should appear in your toolbar! 🎉

### 3. Configure Backend Server

Make sure the DSE-Server is deployed and running. See [DSE-Server README](../DSE-Server/README.md) for setup instructions.

---

## 💡 Usage

### Step 1: Open a Webpage

Navigate to any website you want to analyze.

### Step 2: Launch Extension

Click the DesignSnap Edu icon in your Chrome toolbar.

### Step 3: Get Started

Click the **"Get Started"** button to begin analysis.

### Step 4: Extract Resources

The extension will:

- Capture a snapshot of the page
- Extract HTML structure
- Extract CSS styles

### Step 5: Generate AI Suggestions

Click **"Generate AI Suggestions"** to receive:

- Comprehensive analysis summary
- Key issues identified (High/Medium/Low priority)
- Improved HTML code
- Enhanced CSS code
- Implementation notes and best practices

### Step 6: Copy & Implement

Use the copy buttons to easily copy suggested improvements and apply them to your project!

---

## 📁 Project Structure

```
DesignSnap-Edu/
├── manifest.json                 # Extension configuration (MV3)
├── background/
│   └── serviceWorker.js          # Background service worker
├── content/
│   └── contentScript.js          # Content script (currently unused)
├── popup/
│   ├── popup.html                # UI
│   ├── popup.js                  # UI logic & API integration
│   └── popup.css                 # UI styling
├── assets/
│   ├── icons/
│   │   └── code.png              # Extension icon/logo
│   └── images/
│       └── web-development.png   # UI illustration
└── README.md                     # This file
```

---

## 🎯 Key Features Explained

### 🔍 Semantic HTML Analysis

Evaluates proper element usage, document outline, and markup quality.

### ♿ Accessibility (WCAG 2.1)

- Screen reader support recommendations
- Keyboard navigation improvements
- Color contrast ratio validation (minimum 4.5:1)
- ARIA attributes suggestions

### 🎨 Modern CSS Practices

- Flexbox/Grid usage optimization
- CSS custom properties recommendations
- Responsive design patterns
- Mobile-first approach

### ⚡ Performance Optimization

- Code efficiency improvements
- Loading optimization tips
- Best practices enforcement

### 🌐 Cross-browser Compatibility

Ensures modern standards compliance across different browsers.

---

## 🔐 API Configuration

The extension communicates with the backend server at:

```
https://dse-server.vercel.app/api/suggest
```

If you're running a local server, update the API endpoint in `popup.js`:

```javascript
async function getSuggestionBYGroq(html, css) {
  const response = await fetch("http://localhost:3000/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, css }),
  });
  // ...
}
```

---

## 🐛 Troubleshooting

### Extension Not Loading

- Ensure Developer Mode is enabled in `chrome://extensions/`
- Check for any error messages in the Extensions page
- Try reloading the extension

### No Analysis Displayed

- Check browser console for errors (F12)
- Verify the backend server is running
- Ensure you have a valid Groq API key configured

### 500 Server Error

- Verify the Groq API key is set in the server environment
- Check server logs for detailed error messages
- Ensure you're using a valid Groq model name

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Jeremy Daniel Estrada**

- GitHub: [@jeremydanielestrada](https://github.com/jeremydanielestrada)

---

## 🙏 Acknowledgments

- **Groq** for providing the powerful AI API
- **Chrome Extensions API** for the robust development platform
- **Meta** for the Llama 3.3 70B model
- All contributors and testers

---

## 📸 Screenshots

### Main Interface

_Capture and analyze any webpage with a single click_

### AI Analysis

_Receive comprehensive, actionable suggestions for improvement_

### Code Suggestions

_Get improved HTML and CSS with detailed explanations_

---

<div align="center">

**Made with ❤️ and AI**

[Report Bug](https://github.com/jeremydanielestrada/DesignSnap-Edu/issues) · [Request Feature](https://github.com/jeremydanielestrada/DesignSnap-Edu/issues)

</div>
