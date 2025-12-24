// State
let selectedModels = [];
let initialSelectedModels = []; // Models selected at the start of a conversation
let currentUser = null;
let currentResponseData = {}; // { modelName: { html: "", css: "", js: "", raw: "" } }
let activeModelTab = null;
let activeView = 'preview';
let isGenerating = false;
let generatingModels = new Set(); // Track models currently generating
let conversationHistory = []; // Store all prompts and responses

// Config
let availableModels = [];

// DOM Elements
const els = {
    prompt: document.getElementById('prompt'),
    submitBtn: document.getElementById('submit-btn'),
    newBtn: document.getElementById('new-btn'),
    modelSelector: document.getElementById('model-selector'),
    modelList: document.getElementById('model-list'),
    modelTrigger: document.querySelector('.model-trigger'),
    responseArea: document.getElementById('response-area'),
    modelTabs: document.getElementById('model-tabs'),
    previewFrame: document.getElementById('preview-frame'),
    codeHtml: document.getElementById('code-html'),
    codeCss: document.getElementById('code-css'),
    codeJs: document.getElementById('code-js'),
    loginModal: document.getElementById('login-modal'),
    registerModal: document.getElementById('register-modal'),
    authButtons: document.getElementById('auth-buttons'),
    userInfo: document.getElementById('user-info'),
    usernameDisplay: document.getElementById('username-display'),
    previewWrapper: document.getElementById('preview-wrapper'),
    consolePanel: document.getElementById('console-panel'),
    consoleLogs: document.getElementById('console-logs'),
    consoleTab: document.getElementById('tab-console')
};

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Prevent running in iframe (preview) by checking for main app element
    if (!els.previewFrame) return;

    await fetchConfig();
    await checkAuthAndRestore();
    
    // Event Listeners
    els.submitBtn.addEventListener('click', handleSubmit);
    els.newBtn.addEventListener('click', handleNewProject);
    
    // Shift+Enter to submit
    els.prompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    });
    
    // Auth Forms
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // User dropdown toggle - use event delegation to ensure it works even if element is shown/hidden
    document.addEventListener('click', (e) => {
        const userAvatarBtn = document.getElementById('user-avatar-btn');
        if (userAvatarBtn && (userAvatarBtn === e.target || userAvatarBtn.contains(e.target))) {
            e.stopPropagation();
            e.preventDefault();
            toggleUserDropdown(e);
        }
    });
    
    // Close modals/dropdowns on outside click
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.classList.remove('active');
        }
        
        // Close dropdown if clicking outside
        if (!els.modelSelector.contains(event.target)) {
            els.modelList.classList.remove('active');
            els.modelTrigger.classList.remove('active');
        }

        // Close user dropdown if clicking outside
        const userDropdown = document.getElementById('user-dropdown');
        const userBtn = document.getElementById('user-avatar-btn');
        const userContainer = document.getElementById('user-info');
        if (userDropdown && userDropdown.classList.contains('active')) {
            if (userContainer && !userContainer.contains(event.target)) {
                userDropdown.classList.remove('active');
            }
        }
    };

    // Console Listener
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'console') {
            logToConsole(event.data.level, event.data.args);
            // Show console box if it has content?
            const consoleBox = document.getElementById('console-box');
            if (consoleBox) {
                consoleBox.classList.remove('disabled');
            }
        }
    });
});

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const providers = await res.json();
        
        if (!providers || !Array.isArray(providers)) {
            throw new Error("Invalid config format");
        }
        
        const list = els.modelList;
        // Fix: list might be null if DOM isn't ready, but this is inside fetchConfig called from DOMContentLoaded
        if (list) list.innerHTML = '';
        
        providers.forEach(p => {
            const group = document.createElement('div');
            group.innerHTML = `<div style="padding: 0.5rem 1rem; font-weight: bold; color: var(--secondary); font-size: 0.8rem; text-transform: uppercase;">${p.name}</div>`;
            list.appendChild(group);
            
            p.models.forEach(m => {
                const item = document.createElement('div');
                item.className = 'model-option';
                item.textContent = m;
                item.dataset.value = `${p.name}/${m}`;
                item.onclick = () => toggleModelSelection(item, `${p.name}/${m}`);
                list.appendChild(item);
            });
        });
    } catch (e) {
        console.error("[ERROR] Failed to load config", e);
    }
}

function toggleModelDropdown() {
    const isActive = els.modelList.classList.contains('active');
    els.modelList.classList.toggle('active');
    els.modelTrigger.classList.toggle('active');
    
    // Update visible options if in follow-up mode
    if (initialSelectedModels.length > 0) {
         updateModelDropdownVisibility();
    }
}

function updateModelDropdownVisibility() {
    const options = els.modelList.querySelectorAll('.model-option');
    options.forEach(opt => {
        const val = opt.dataset.value;
        // Only show models that were initially selected if we are in follow-up mode
        if (initialSelectedModels.includes(val)) {
            opt.style.display = 'flex';
        } else {
            opt.style.display = 'none';
        }
    });
}

function toggleModelSelection(el, value) {
    if (selectedModels.includes(value)) {
        selectedModels = selectedModels.filter(m => m !== value);
        el.classList.remove('selected');
    } else {
        selectedModels.push(value);
        el.classList.add('selected');
    }
}

// Auth Logic
async function checkAuthAndRestore() {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        currentUser = JSON.parse(userStr);
        updateAuthUI();
        
        try {
            const res = await fetch('/api/user/me', {
                headers: { 'Authorization': `Bearer ${currentUser.user.id}` }
            });
            if (res.ok) {
                const data = await res.json();
                const remoteUser = data.user;
                
                // Removed restore functionality as requested
            }
        } catch (e) {}
    }
}

function updateAuthUI() {
    // Note: old #user-info is now .user-menu-container with id #user-info
    const userContainer = document.getElementById('user-info'); 
    
    if (!els.authButtons || !userContainer || !els.newBtn) return;
    
    if (currentUser) {
        els.authButtons.style.display = 'none';
        userContainer.style.display = 'flex'; // Was 'flex', ensuring it's visible
        els.newBtn.style.display = 'flex';
        
        if (els.usernameDisplay) els.usernameDisplay.textContent = currentUser.user.username;
        
        // Set initials
        const initials = document.getElementById('user-initials');
        if (initials) {
            initials.textContent = currentUser.user.username.charAt(0).toUpperCase();
        }

        closeModal('login-modal');
        closeModal('register-modal');
        
        // Ensure dropdown is closed when showing user menu
        const dropdown = document.getElementById('user-dropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    } else {
        els.authButtons.style.display = 'flex';
        userContainer.style.display = 'none';
        els.newBtn.style.display = 'none';
    }
}

function toggleUserDropdown(event) {
    if (event) {
        event.stopPropagation();
    }
    const dropdown = document.getElementById('user-dropdown');
    const button = document.getElementById('user-avatar-btn');
    if (dropdown && button) {
        const isActive = dropdown.classList.contains('active');
        dropdown.classList.toggle('active');
        
        if (!isActive) {
            // Position dropdown relative to button when opening
            const rect = button.getBoundingClientRect();
            dropdown.style.top = `${rect.bottom + 8}px`;
            dropdown.style.right = `${window.innerWidth - rect.right}px`;
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            const result = await res.json();
            currentUser = result; 
            localStorage.setItem('user', JSON.stringify(result));
            updateAuthUI();
            
            if (pendingPrompt) {
                handleSubmit();
                pendingPrompt = null;
            }
        } else {
            const err = await res.json();
            showCustomAlert(err.error, "Registration Error");
        }
    } catch (e) {
        showCustomAlert("Registration failed", "Registration Error");
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            const result = await res.json();
            currentUser = result; 
            localStorage.setItem('user', JSON.stringify(result));
            updateAuthUI();
            
            checkAuthAndRestore();

            if (pendingPrompt) {
                handleSubmit();
                pendingPrompt = null;
            }
        } else {
            const err = await res.json();
            showCustomAlert(err.error, "Login Error");
        }
    } catch (e) {
        showCustomAlert("Login failed", "Login Error");
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('user');
    updateAuthUI();
    handleNewProject(); 
}

// Modals
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
function switchModal(toId) {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    openModal(toId);
}

function showCustomAlert(message, title = "Alert") {
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;
    openModal('alert-modal');
}

// Global for deferred submission
let pendingPrompt = null;

function handleNewProject() {
    els.prompt.value = "";
    els.prompt.placeholder = "Build anything...";
    els.responseArea.classList.remove('active');
    els.responseArea.style.opacity = '0.5';
    els.responseArea.style.pointerEvents = 'none';
    
    currentResponseData = {};
    activeModelTab = null;
    initialSelectedModels = []; // Reset initial models
    conversationHistory = []; // Clear conversation history
    els.modelTabs.innerHTML = '';
    els.previewFrame.srcdoc = '';
    els.codeHtml.textContent = '';
    els.codeCss.textContent = '';
    els.codeJs.textContent = '';
    els.codeHtml.innerHTML = '<code class="language-html"></code>';
    els.codeCss.innerHTML = '<code class="language-css"></code>';
    els.codeJs.innerHTML = '<code class="language-javascript"></code>';
    els.consoleLogs.innerHTML = '';
    
    // Disable console
    const consoleBox = document.getElementById('console-box');
    if (consoleBox) {
        consoleBox.classList.add('disabled');
    }
    
    // Reset dropdown visibility
    const options = els.modelList.querySelectorAll('.model-option');
    options.forEach(opt => opt.style.display = 'flex');
}

// Restore functionality removed

async function handleSubmit() {
    const prompt = els.prompt.value.trim();
    if (!prompt) return;
    
    if (!currentUser) {
        pendingPrompt = prompt;
        openModal('login-modal');
        return;
    }
    
    if (selectedModels.length === 0) {
        showCustomAlert("Please select at least one model", "Selection Required");
        return;
    }

    if (initialSelectedModels.length === 0) {
        initialSelectedModels = [...selectedModels];
    }
    
    // UI Update
    els.prompt.value = "";
    els.prompt.placeholder = "Ask a follow-up...";
    
    // Manage UI State for Generation
    generatingModels = new Set(selectedModels);
    updateTabStates();
    
    // Clear Preview immediately if we are starting fresh generation for active tab
    // BUT we should use showLoadingPreview() instead of srcdoc=""
    if (generatingModels.has(activeModelTab) || activeModelTab === null) {
         showLoadingPreview();
    }
    
    // Disable submit only
    els.submitBtn.disabled = true;
    isGenerating = true;

    // Check availability of active tab
    // If active tab is generating, we need to handle it.
    if (generatingModels.has(activeModelTab) || activeModelTab === null) {
        // Try to find a non-generating model to switch to
        const availableModel = Object.keys(currentResponseData).find(m => !generatingModels.has(m));
        
        if (availableModel) {
            switchModelTab(availableModel);
        } else {
            // No available models (all generating), disable preview interaction
            setPreviewEnabled(false);
            // Show loading placeholder instead of empty white iframe
            showLoadingPreview();
        }
    } else {
        // Active model is not generating, leave it enabled
        setPreviewEnabled(true);
    }
    
    // Ensure correct aspect ratio class is applied if in preview mode
    if (activeView === 'preview') {
        document.querySelector('.preview-container').classList.add('aspect-16-9');
    }
    
    // Prepare User Data for Context (from CURRENT active tab if possible, or just send what we have)
    let userData = null;
    if (activeModelTab && currentResponseData[activeModelTab]) {
        userData = {
            html: currentResponseData[activeModelTab].html,
            css: currentResponseData[activeModelTab].css,
            js: currentResponseData[activeModelTab].js
        };
    }

    // Reset Tabs? NO. User wants to keep them.
    // Ensure tabs exist for selected models.
    selectedModels.forEach(m => {
        if (!currentResponseData[m]) {
            currentResponseData[m] = { html: "", css: "", js: "", raw: "" };
            const tab = document.createElement('div');
            tab.className = 'model-tab';
            tab.textContent = m.split('/')[1]; 
            tab.dataset.model = m;
            tab.onclick = () => switchModelTab(m);
            els.modelTabs.appendChild(tab);
        } else {
            // Clear data for re-generation?
            // Yes, we are overwriting.
            currentResponseData[m] = { html: "", css: "", js: "", raw: "" };
        }
    });
    
    // Update tabs visual state
    updateTabStates();
    
    // Build conversation history
    conversationHistory.push({ role: 'user', content: prompt });
    
    // Collect current code for context (for iterations)
    const currentCodes = {};
    selectedModels.forEach(m => {
        if (currentResponseData[m]) {
            currentCodes[m] = {
                html: currentResponseData[m].html,
                css: currentResponseData[m].css,
                js: currentResponseData[m].js
            };
        }
    });

    const requestBody = {
        prompt,
        models: selectedModels,
        history: conversationHistory,
        currentCodes
    };
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentUser.user.id}`
    };
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') break;
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.done) {
                            // Model finished
                            generatingModels.delete(data.model);
                            updateTabStates();
                            
                            // If this was the active model (or if we are waiting for one), enable things?
                            if (generatingModels.size === 0) {
                                isGenerating = false;
                                els.submitBtn.disabled = false;
                            }
                            
                            // Auto-switch to first finished model if we are stuck on a generating one (or if activeModelTab is null/not set correctly)
                            // If activeModelTab is in generatingModels (it shouldn't be effectively, but visual state might be stale), switch.
                            // OR if we are currently showing "Generating..." (indicated by disabled preview), we should switch.
                            if (!els.responseArea.classList.contains('active')) {
                                // We were waiting. Switch to this finished model.
                                switchModelTab(data.model);
                            }
                            
                            // If this model is the active one, enable preview interaction
                            if (activeModelTab === data.model) {
                                setPreviewEnabled(true);
                                updatePreviewUI(activeModelTab, true);
                            }
                            continue;
                        }
                        
                        if (data.model) {
                            handleStreamChunk(data.model, data.content);
                        }
                    } catch (e) { }
                }
            }
        }
        
        // Save State after completion
        if (currentResponseData[activeModelTab]) {
             saveState(currentResponseData[activeModelTab]);
        }
        
        els.submitBtn.disabled = false;
        isGenerating = false;
        
        // Only re-render if the active model was still marked as generating (e.g. stream ended abruptly)
        // If it finished normally, it was already rendered in the loop.
        const activeWasGenerating = generatingModels.has(activeModelTab);
        
        generatingModels.clear();
        updateTabStates();
        setPreviewEnabled(true);
        
        // Render Final Preview if needed
        if (activeModelTab && activeWasGenerating) {
             updatePreviewUI(activeModelTab, true); 
        } 
        
    } catch (e) {
        console.error("Generation failed", e);
        els.submitBtn.disabled = false;
        isGenerating = false;
        generatingModels.clear();
        updateTabStates();
        setPreviewEnabled(true);
    }
}

function setPreviewEnabled(enabled) {
    if (enabled) {
        els.responseArea.classList.add('active');
        els.responseArea.style.opacity = '1';
        els.responseArea.style.pointerEvents = 'all';
    } else {
        els.responseArea.classList.remove('active');
        els.responseArea.style.opacity = '0.5';
        els.responseArea.style.pointerEvents = 'none';
    }
}

function updateTabStates() {
    document.querySelectorAll('.model-tab').forEach(t => {
        const model = t.dataset.model;
        if (generatingModels.has(model)) {
            t.classList.add('disabled');
            t.style.opacity = '0.5';
            t.style.cursor = 'not-allowed';
        } else {
            t.classList.remove('disabled');
            t.style.opacity = '1';
            t.style.cursor = 'pointer';
        }
    });
}

async function saveState(data) {
    if (!currentUser) return;
    try {
        await fetch('/api/save-state', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.user.id}`
            },
            body: JSON.stringify({ 
                userdata: JSON.stringify({
                    html: data.html,
                    css: data.css,
                    js: data.js
                })
            })
        });
    } catch (e) {
        console.error("Failed to save state", e);
    }
}

function handleStreamChunk(model, content) {
    const data = currentResponseData[model];
    data.raw += content;
    parseAndAssign(model);
    
    if (model === activeModelTab) {
        // Only update code views, NOT iframe during stream
        updatePreviewUI(model, false);
    }
}

function parseAndAssign(model) {
    const data = currentResponseData[model];
    const raw = data.raw;
    
    const extract = (lang) => {
        const regex = new RegExp(`\`\`\`${lang}([\\s\\S]*?)\`\`\``, 'i');
        const match = raw.match(regex);
        return match ? match[1].trim() : null;
    };
    
    // Only update if new content exists, otherwise preserve previous
    const newHtml = extract('html');
    const newCss = extract('css');
    const newJs = extract('js');
    
    if (newHtml !== null) data.html = newHtml;
    if (newCss !== null) data.css = newCss;
    if (newJs !== null) data.js = newJs;
}

function switchModelTab(model) {
    if (generatingModels.size === selectedModels.length && generatingModels.has(model)) {
         // All models are generating, prevent switching to a generating one unless it's the only option (which shouldn't happen via click usually)
         // But wait, if user clicks a tab that is generating, we generally want to allow it IF they want to see the "Generating..." state?
         // The requirement says: "if no models have finished yet the Preview is white...".
         // Also "I can change tabs even though no models have finished yet" is listed as a bug.
         // So we should prevent switching if the target model is generating?
         return;
    }
    
    // If specific model is generating, don't switch to it
    if (generatingModels.has(model)) return;

    activeModelTab = model;
    document.querySelectorAll('.model-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.model === model);
    });
    
    // Update preview with stored data
    // Important: check if we have data to render, otherwise show loading or empty?
    // Since we blocked switching to generating models, we should have data or be in "ready" state.
    updatePreviewUI(model, true);
    
    setPreviewEnabled(true);
}

function updatePreviewUI(model, renderIframe = true) {
    const data = currentResponseData[model];
    
    // Update code blocks using Prism (if available) or raw text
    const setCode = (el, code, lang) => {
        el.innerHTML = `<code class="language-${lang}">${escapeHtml(code)}</code>`;
        if (window.Prism) {
            Prism.highlightElement(el.querySelector('code'));
        }
    };

    setCode(els.codeHtml, data.html, 'html');
    setCode(els.codeCss, data.css, 'css');
    setCode(els.codeJs, data.js, 'javascript');
    
    // CRITICAL: Never render iframe during generation to prevent flashing
    // Fix 4: Only skip iframe render if THIS model is generating. 
    // If another model is generating but this one is done, we SHOULD render.
    if (!renderIframe || generatingModels.has(model)) return;

    // Only update preview if we have content and we are not just starting
    // If we have partial content, we try to render.
    // Error protection: If it's empty, show placeholder or nothing.
    if (!data.html && !data.css && !data.js) {
        // If data is empty but we are asked to render (e.g. switching tabs to an empty one), we should clear the iframe
        if (renderIframe) {
            els.previewFrame.srcdoc = '';
        }
        return;
    }

    // Console injection script
    const consoleScript = `
        <script>
            (function() {
                const oldLog = console.log;
                const oldError = console.error;
                const oldWarn = console.warn;
                
                function send(level, args) {
                    try {
                        const serialized = args.map(a => {
                            if (typeof a === 'object') return JSON.stringify(a);
                            return String(a);
                        });
                        window.parent.postMessage({ type: 'console', level, args: serialized }, '*');
                    } catch(e) {}
                }
                
                console.log = function(...args) { send('info', args); oldLog.apply(console, args); };
                console.error = function(...args) { send('error', args); oldError.apply(console, args); };
                console.warn = function(...args) { send('warn', args); oldWarn.apply(console, args); };
            })();
        <\/script>
    `;

    const doc = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>${data.css}</style>
            ${consoleScript}
        </head>
        <body>
            ${data.html}
            <script>${data.js}<\/script>
        </body>
        </html>
    `;
    
    // Avoid constantly reloading iframe during fast stream unless necessary?
    // Doing it per chunk is fine for local feeling, but might flicker.
    // For now, simple srcdoc update is okay.
    els.previewFrame.srcdoc = doc;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

function switchView(view) {
    activeView = view;
    
    document.querySelectorAll('.view-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    
    // Toggle aspect ratio class on container
    const container = document.querySelector('.preview-container');
    if (view === 'preview') {
        container.classList.add('aspect-16-9');
    } else {
        container.classList.remove('aspect-16-9');
    }
    
    els.previewFrame.style.display = view === 'preview' ? 'block' : 'none';
    els.codeHtml.style.display = view === 'html' ? 'block' : 'none';
    els.codeCss.style.display = view === 'css' ? 'block' : 'none';
    els.codeJs.style.display = view === 'js' ? 'block' : 'none';
    
    // Console only visible when preview is open
    const consoleBox = document.getElementById('console-box');
    if (view === 'preview') {
        consoleBox.style.display = 'flex';
    } else {
        consoleBox.style.display = 'none';
    }
}

function clearConsole() {
    els.consoleLogs.innerHTML = '';
}

function setDevice(device) {
    const wrapper = els.previewWrapper;
    wrapper.classList.toggle('mobile', device === 'mobile');
    wrapper.classList.toggle('desktop', device === 'desktop');
    
    // Toggle aspect ratio on container
    const container = document.querySelector('.preview-container');
    if (device === 'mobile') {
        container.classList.remove('aspect-16-9');
    } else {
        // Restore aspect ratio if in preview view
        if (activeView === 'preview') {
            container.classList.add('aspect-16-9');
        }
    }
    
    document.querySelectorAll('.device-btn').forEach(b => {
        if (device === 'mobile' && b.title === 'Mobile') b.classList.add('active');
        else if (device === 'desktop' && b.title === 'Desktop') b.classList.add('active');
        else b.classList.remove('active');
    });
}

function logToConsole(level, args) {
    const line = document.createElement('div');
    line.className = `log-entry log-${level}`;
    line.textContent = `[${level.toUpperCase()}] ${args.join(' ')}`;
    els.consoleLogs.appendChild(line);
    els.consoleLogs.scrollTop = els.consoleLogs.scrollHeight;
}

function rerunPreview() {
    if (!activeModelTab || !currentResponseData[activeModelTab]) return;
    
    // Reload the preview iframe
    const data = currentResponseData[activeModelTab];
    if (!data.html && !data.css && !data.js) return;
    
    // Re-render the preview
    updatePreviewUI(activeModelTab, true);
}

function showLoadingPreview() {
    const doc = `
        <!DOCTYPE html>
        <html>
        <body style="margin:0; display:flex; justify-content:center; align-items:center; height:100vh; background:#1a1a1a; color:#5f7e97; font-family:sans-serif;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:1rem;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>Generating...</span>
            </div>
            <style>
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            </style>
        </body>
        </html>
    `;
    els.previewFrame.srcdoc = doc;
}

// Global expose
window.openModal = openModal;
window.closeModal = closeModal;
window.switchModal = switchModal;
window.toggleModelDropdown = toggleModelDropdown;
window.switchView = switchView;
window.setDevice = setDevice;
window.logout = logout;
window.toggleModelSelection = toggleModelSelection;
window.toggleUserDropdown = toggleUserDropdown;
window.clearConsole = clearConsole;
window.rerunPreview = rerunPreview;

// Auto-load state on refresh if logged in
if (localStorage.getItem('user')) {
    // We already call checkAuthAndRestore in DOMContentLoaded
    // But let's verify it works.
}
