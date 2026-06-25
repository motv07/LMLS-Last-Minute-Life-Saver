/**
 * Patch script for app.js - Day 2 AI Intelligence upgrades (Part 2)
 * Run with: node patch_app.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'scripts', 'app.js');
let code = fs.readFileSync(filePath, 'utf8');

// ── 2.1: Add chatHistory and weeklyGoal to AppState ────────────────────────
const OLD_CRISIS_SHOWN = '  crisisShown:     new Set(),\n  lastReprioritize: 0,\n};';
const NEW_CRISIS_SHOWN = `  crisisShown:     new Set(),
  lastReprioritize: 0,
  chatHistory:     [], // Multi-turn conversation history [{role, text}]
  weeklyGoal:      '',
};`;

if (!code.includes(OLD_CRISIS_SHOWN)) {
  console.error('ERROR: Could not find AppState crisisShown block!');
  process.exit(1);
}
code = code.replace(OLD_CRISIS_SHOWN, NEW_CRISIS_SHOWN);
console.log('Step 2.1: chatHistory and weeklyGoal added to AppState.');

// ── 2.2: Load weeklyGoal and chatHistory in loadSettings() ────────────────
const OLD_LOAD_SETTINGS = `function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(AppState.settings, JSON.parse(raw));
  } catch {}
}`;
const NEW_LOAD_SETTINGS = `function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(AppState.settings, JSON.parse(raw));
  } catch {}
  AppState.weeklyGoal = localStorage.getItem('lmls_weekly_goal') || '';
  AppState.chatHistory = JSON.parse(localStorage.getItem('lmls_chat_history') || '[]');
}`;

if (!code.includes(OLD_LOAD_SETTINGS)) {
  console.error('ERROR: Could not find loadSettings function!');
  process.exit(1);
}
code = code.replace(OLD_LOAD_SETTINGS, NEW_LOAD_SETTINGS);
console.log('Step 2.2: weeklyGoal and chatHistory loading added to loadSettings().');

// ── 2.3: Update sendChatMessage to use history ─────────────────────────────

// a) After appendUserMessage(msg), add push to chatHistory
const OLD_APPEND_USER = `  appendUserMessage(msg);
  input.value = '';
  input.style.height = 'auto';

  // Show thinking
  const thinkId = appendThinkingMessage();`;
const NEW_APPEND_USER = `  appendUserMessage(msg);
  input.value = '';
  input.style.height = 'auto';

  // Add to conversation history
  AppState.chatHistory.push({ role: 'user', text: msg });

  // Show thinking
  const thinkId = appendThinkingMessage();`;

if (!code.includes(OLD_APPEND_USER)) {
  console.error('ERROR: Could not find appendUserMessage block in sendChatMessage!');
  process.exit(1);
}
code = code.replace(OLD_APPEND_USER, NEW_APPEND_USER);
console.log('Step 2.3a: User message push to chatHistory added.');

// b) In onDone callback, after finalizeAIStreamingMessage, save AI response to history
const OLD_ONDONE = `    () => {
      if (aiBubbleId !== null) {
        finalizeAIStreamingMessage(aiBubbleId, accumulatedText);
      } else {
        removeMessage(thinkId);
        appendAIMessage(accumulatedText || "I couldn't generate a response. Please try again.");
      }
      if (typeof VoiceAssistant !== 'undefined' && VoiceAssistant.speak) {
        VoiceAssistant.speak(accumulatedText, false);
      }
    },`;
const NEW_ONDONE = `    () => {
      if (aiBubbleId !== null) {
        finalizeAIStreamingMessage(aiBubbleId, accumulatedText);
      } else {
        removeMessage(thinkId);
        appendAIMessage(accumulatedText || "I couldn't generate a response. Please try again.");
      }
      // Save AI response to history
      AppState.chatHistory.push({ role: 'model', text: accumulatedText });
      // Keep history bounded to last 20 messages
      if (AppState.chatHistory.length > 20) {
        AppState.chatHistory = AppState.chatHistory.slice(-20);
      }
      localStorage.setItem('lmls_chat_history', JSON.stringify(AppState.chatHistory));
      if (typeof VoiceAssistant !== 'undefined' && VoiceAssistant.speak) {
        VoiceAssistant.speak(accumulatedText, false);
      }
    },`;

if (!code.includes(OLD_ONDONE)) {
  console.error('ERROR: Could not find onDone callback in sendChatMessage!');
  process.exit(1);
}
code = code.replace(OLD_ONDONE, NEW_ONDONE);
console.log('Step 2.3b: AI history persistence added in onDone callback.');

// c) Pass chatHistory as 6th argument to streamResponse
// The call is: GeminiClient.streamResponse(\n    msg,\n    (chunk) => {
const OLD_STREAM_CALL = `  GeminiClient.streamResponse(
    msg,
    (chunk) => {`;
const NEW_STREAM_CALL = `  GeminiClient.streamResponse(
    msg,
    (chunk) => {`;
// The 6th arg goes at the end of the call (before the final );
// The streamResponse call in sendChatMessage ends with the error handler then );
// Let's find the full call and replace
const OLD_FULL_STREAM = `  GeminiClient.streamResponse(
    msg,
    (chunk) => {
      if (aiBubbleId === null) {
        removeMessage(thinkId);
        aiBubbleId = appendAIStreamingMessageStart();
      }
      accumulatedText += chunk;
      updateAIStreamingMessage(aiBubbleId, accumulatedText);
    },
    () => {
      if (aiBubbleId !== null) {
        finalizeAIStreamingMessage(aiBubbleId, accumulatedText);
      } else {
        removeMessage(thinkId);
        appendAIMessage(accumulatedText || "I couldn't generate a response. Please try again.");
      }
      // Save AI response to history
      AppState.chatHistory.push({ role: 'model', text: accumulatedText });
      // Keep history bounded to last 20 messages
      if (AppState.chatHistory.length > 20) {
        AppState.chatHistory = AppState.chatHistory.slice(-20);
      }
      localStorage.setItem('lmls_chat_history', JSON.stringify(AppState.chatHistory));
      if (typeof VoiceAssistant !== 'undefined' && VoiceAssistant.speak) {
        VoiceAssistant.speak(accumulatedText, false);
      }
    },
    (err) => {
      removeMessage(thinkId);
      if (aiBubbleId !== null) removeMessage(aiBubbleId);
      appendAIMessage(\`\u274C **Gemini Error:** \${err.message || 'Streaming failed.'}\\n\\nPlease check your key in Settings.\`);
    }
  );`;

const NEW_FULL_STREAM = `  GeminiClient.streamResponse(
    msg,
    (chunk) => {
      if (aiBubbleId === null) {
        removeMessage(thinkId);
        aiBubbleId = appendAIStreamingMessageStart();
      }
      accumulatedText += chunk;
      updateAIStreamingMessage(aiBubbleId, accumulatedText);
    },
    () => {
      if (aiBubbleId !== null) {
        finalizeAIStreamingMessage(aiBubbleId, accumulatedText);
      } else {
        removeMessage(thinkId);
        appendAIMessage(accumulatedText || "I couldn't generate a response. Please try again.");
      }
      // Save AI response to history
      AppState.chatHistory.push({ role: 'model', text: accumulatedText });
      // Keep history bounded to last 20 messages
      if (AppState.chatHistory.length > 20) {
        AppState.chatHistory = AppState.chatHistory.slice(-20);
      }
      localStorage.setItem('lmls_chat_history', JSON.stringify(AppState.chatHistory));
      if (typeof VoiceAssistant !== 'undefined' && VoiceAssistant.speak) {
        VoiceAssistant.speak(accumulatedText, false);
      }
    },
    (err) => {
      removeMessage(thinkId);
      if (aiBubbleId !== null) removeMessage(aiBubbleId);
      appendAIMessage(\`\u274C **Gemini Error:** \${err.message || 'Streaming failed.'}\\n\\nPlease check your key in Settings.\`);
    },
    null,
    AppState.chatHistory
  );`;

if (!code.includes(OLD_FULL_STREAM)) {
  console.error('ERROR: Could not find full streamResponse call in sendChatMessage!');
  process.exit(1);
}
code = code.replace(OLD_FULL_STREAM, NEW_FULL_STREAM);
console.log('Step 2.3c: chatHistory passed as 6th arg to streamResponse.');

// ── 2.5: Add updateDashboardHero, addTiltEffect, checkDayReviewTrigger to refreshAll ──
const OLD_REFRESH_ALL = `function refreshAll() {
  TaskStore.recomputeAllUrgency();
  updateUrgencyIndicator();
  updateBadges();
  renderDashboard();
  updateGreeting();

  // Update AI context if in AI view
  if (AppState.currentView === 'ai') renderAIContext();
  if (AppState.currentView === 'analytics') renderAnalytics();
}`;
const NEW_REFRESH_ALL = `function refreshAll() {
  TaskStore.recomputeAllUrgency();
  updateUrgencyIndicator();
  updateBadges();
  renderDashboard();
  updateGreeting();
  updateDashboardHero();
  addTiltEffect();
  checkDayReviewTrigger();

  // Update AI context if in AI view
  if (AppState.currentView === 'ai') renderAIContext();
  if (AppState.currentView === 'analytics') renderAnalytics();
}`;

if (!code.includes(OLD_REFRESH_ALL)) {
  console.error('ERROR: Could not find refreshAll function!');
  process.exit(1);
}
code = code.replace(OLD_REFRESH_ALL, NEW_REFRESH_ALL);
console.log('Step 2.5: updateDashboardHero, addTiltEffect, checkDayReviewTrigger added to refreshAll.');

// ── 2.4: Append command palette + hero + ripple + tilt + day review + focus HUD at end of file ──
// Also update initShortcuts Ctrl+K to use command palette instead of navigating to AI
const OLD_CTRL_K = `        case 'k':
          e.preventDefault();
          navigateTo('ai');
          setTimeout(() => {
            const chatInput = document.getElementById('chat-input');
            if (chatInput) chatInput.focus();
          }, 100);
          break;`;
const NEW_CTRL_K = `        case 'k':
          // Ctrl+K now opens command palette (handled by cmd palette listeners)
          // Fallthrough intentional — let the palette DOMContentLoaded handler take over
          break;`;

if (!code.includes(OLD_CTRL_K)) {
  console.error('ERROR: Could not find Ctrl+K handler in initShortcuts!');
  process.exit(1);
}
code = code.replace(OLD_CTRL_K, NEW_CTRL_K);
console.log('Step 2.4 (pre): Ctrl+K in initShortcuts updated to defer to command palette.');

// Append large new sections at end of file
const NEW_SECTIONS = `

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// COMMAND PALETTE (Ctrl+K)
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function openCmdPalette() {
  const backdrop = document.getElementById('cmd-palette-backdrop');
  const input = document.getElementById('cmd-input');
  if (!backdrop) return;
  backdrop.classList.remove('hidden');
  setTimeout(() => input && input.focus(), 50);
  renderCmdResults('');
}

function closeCmdPalette() {
  const backdrop = document.getElementById('cmd-palette-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
  const input = document.getElementById('cmd-input');
  if (input) input.value = '';
}

function renderCmdResults(query) {
  const taskSection = document.getElementById('cmd-task-section');
  const taskResults = document.getElementById('cmd-task-results');
  const aiSection = document.getElementById('cmd-ai-section');
  const aiResult = document.getElementById('cmd-ai-result');
  if (!taskResults) return;

  if (!query.trim()) {
    if (taskSection) taskSection.style.display = 'none';
    if (aiSection) aiSection.style.display = 'none';
    taskResults.innerHTML = '';
    if (aiResult) aiResult.innerHTML = '';
    return;
  }

  // Search tasks
  const q = query.toLowerCase();
  const matches = TaskStore.getAll().filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(q))
  ).slice(0, 5);

  if (matches.length > 0 && taskSection) {
    taskSection.style.display = 'block';
    taskResults.innerHTML = matches.map(t => \`
      <div class="cmd-item" onclick="openEditTask('\${t.id}'); closeCmdPalette();">
        <span class="cmd-item-icon">\${t.status === 'completed' ? '\u2705' : '\uD83D\uDCCB'}</span>
        <span class="cmd-item-text">\${escapeHtml(t.title)}</span>
        <span class="cmd-item-hint">\${t.priority}</span>
      </div>
    \`).join('');
  } else {
    if (taskSection) taskSection.style.display = 'none';
    taskResults.innerHTML = '';
  }

  // Show AI query option
  if (query.length > 3 && aiSection && aiResult) {
    aiSection.style.display = 'block';
    aiResult.innerHTML = \`
      <div class="cmd-item" onclick="sendCmdAIQuery('\${escapeHtml(query)}')">
        <span class="cmd-item-icon">\uD83E\uDD16</span>
        <span class="cmd-item-text">Ask AI: "\${escapeHtml(query)}"</span>
        <span class="cmd-item-hint">\u2192 AI Chat</span>
      </div>
    \`;
  } else if (aiSection) {
    aiSection.style.display = 'none';
    if (aiResult) aiResult.innerHTML = '';
  }
}

function sendCmdAIQuery(query) {
  closeCmdPalette();
  navigateTo('ai');
  setTimeout(() => {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.value = query;
      chatInput.dispatchEvent(new Event('input'));
      sendChatMessage();
    }
  }, 350);
}

// Attach command palette event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Ctrl+K or Cmd+K
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const backdrop = document.getElementById('cmd-palette-backdrop');
      if (backdrop && !backdrop.classList.contains('hidden')) {
        closeCmdPalette();
      } else {
        openCmdPalette();
      }
    }
    if (e.key === 'Escape') {
      closeCmdPalette();
    }
  });

  // Live search in palette
  const cmdInput = document.getElementById('cmd-input');
  if (cmdInput) {
    cmdInput.addEventListener('input', (e) => {
      renderCmdResults(e.target.value);
    });
  }

  // Close on backdrop click
  const backdrop = document.getElementById('cmd-palette-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeCmdPalette();
    });
  }
});

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// DASHBOARD HERO RING UPDATE
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function updateDashboardHero() {
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);
  const now = new Date();
  const hour = now.getHours();

  // Update hero ring
  const ringFill = document.getElementById('hero-ring-fill');
  const ringValue = document.getElementById('hero-ring-value');
  if (ringFill && ringValue) {
    const score = stats.productivityScore || 0;
    // Circumference of circle r=45: 2*PI*45 \u2248 283
    const circumference = 283;
    const offset = circumference - (score / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;
    animateCountUp(ringValue, score);
  }

  // Hero greeting
  const greetingTime = document.getElementById('hero-greeting-time');
  const greetingName = document.getElementById('hero-greeting-name');
  if (greetingTime) {
    if (hour < 12) greetingTime.textContent = 'morning';
    else if (hour < 17) greetingTime.textContent = 'afternoon';
    else if (hour < 21) greetingTime.textContent = 'evening';
    else greetingTime.textContent = 'night';
  }
  if (greetingName) {
    greetingName.textContent = AppState.settings.userName || 'there';
  }

  // Hero subtext
  const subtext = document.getElementById('hero-subtext');
  if (subtext) {
    const pendingCount = tasks.filter(t => t.status !== 'completed').length;
    const overdueCount = stats.overdue || 0;
    if (overdueCount > 0) {
      subtext.textContent = \`\u26A0\uFE0F You have \${overdueCount} overdue task\${overdueCount > 1 ? 's' : ''}. Let's tackle them now!\`;
      subtext.style.color = 'var(--warning)';
    } else if (pendingCount === 0) {
      subtext.textContent = '\uD83C\uDF89 All tasks done! You are crushing it today.';
      subtext.style.color = 'var(--success)';
    } else {
      subtext.textContent = \`\${pendingCount} task\${pendingCount > 1 ? 's' : ''} remaining. You've got this!\`;
      subtext.style.color = '';
    }
  }

  // Hero pills
  const pilldone = document.getElementById('hero-pill-done-val');
  const pilldue = document.getElementById('hero-pill-due-val');
  const pillfocus = document.getElementById('hero-pill-focus-val');
  if (pilldone) pilldone.textContent = \`\${stats.completed} done\`;
  if (pilldue) pilldue.textContent = \`\${stats.dueToday} due today\`;
  if (pillfocus) {
    const sessions = AppState.sessionsToday || 0;
    pillfocus.textContent = \`\${sessions} focus session\${sessions !== 1 ? 's' : ''}\`;
  }
}

function animateCountUp(el, target, duration) {
  if (!el) return;
  duration = duration || 800;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) return;
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(start + diff * eased);
    el.classList.add('counting');
    if (progress < 1) requestAnimationFrame(update);
    else el.classList.remove('counting');
  };
  requestAnimationFrame(update);
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// RIPPLE BUTTON EFFECT
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'btn-ripple';
    ripple.style.cssText = \`
      width: \${size}px; height: \${size}px;
      left: \${e.clientX - rect.left - size/2}px;
      top:  \${e.clientY - rect.top  - size/2}px;
    \`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// 3D CARD TILT EFFECT
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function addTiltEffect() {
  const cards = document.querySelectorAll('.task-card, .stat-card, .dash-card');
  cards.forEach(card => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = '1';
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const rotX = ((y - cy) / cy) * -4;
      const rotY = ((x - cx) / cx) * 4;
      card.style.transform = \`perspective(800px) rotateX(\${rotX}deg) rotateY(\${rotY}deg) translateY(-2px)\`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// DAY REVIEW MODAL
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function showDayReview() {
  const modal = document.getElementById('modal-day-review');
  if (!modal) return;
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);

  // Populate stats
  const statsDiv = document.getElementById('day-review-stats');
  if (statsDiv) {
    statsDiv.innerHTML = \`
      <div class="day-review-stat">
        <div class="day-review-stat-value">\${stats.completed}</div>
        <div class="day-review-stat-label">Tasks Done</div>
      </div>
      <div class="day-review-stat">
        <div class="day-review-stat-value">\${AppState.sessionsToday || 0}</div>
        <div class="day-review-stat-label">Focus Sessions</div>
      </div>
      <div class="day-review-stat">
        <div class="day-review-stat-value">\${stats.productivityScore}</div>
        <div class="day-review-stat-label">Productivity Score</div>
      </div>
      <div class="day-review-stat">
        <div class="day-review-stat-value">\${AppState.habits.filter(h => h.completions && h.completions[new Date().toISOString().slice(0,10)]).length}</div>
        <div class="day-review-stat-label">Habits Hit</div>
      </div>
    \`;
  }

  // Star rating
  const stars = document.querySelectorAll('#star-rating .star');
  stars.forEach(star => {
    star.classList.remove('active');
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating);
      stars.forEach((s, i) => {
        if (i < rating) s.classList.add('active');
        else s.classList.remove('active');
      });
      localStorage.setItem('lmls_day_rating_' + new Date().toISOString().slice(0,10), rating);
    });
  });

  modal.classList.remove('hidden');
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.remove('hidden');
  if (typeof triggerConfetti === 'function') triggerConfetti();
  else if (window.LMLS_Animations && window.LMLS_Animations.triggerConfetti) window.LMLS_Animations.triggerConfetti();
}

function closeDayReview() {
  const modal = document.getElementById('modal-day-review');
  if (modal) modal.classList.add('hidden');
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.add('hidden');
}

// Check if day review should show (after 9pm or all tasks done)
function checkDayReviewTrigger() {
  const hour = new Date().getHours();
  const alreadyShown = localStorage.getItem('lmls_day_review_' + new Date().toISOString().slice(0,10));
  if (alreadyShown) return;
  const tasks = TaskStore.getAll();
  const pendingCount = tasks.filter(t => t.status !== 'completed').length;
  const totalCount = tasks.length;
  if (hour >= 21 || (pendingCount === 0 && totalCount > 3)) {
    localStorage.setItem('lmls_day_review_' + new Date().toISOString().slice(0,10), '1');
    setTimeout(showDayReview, 2000);
  }
}

// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// FOCUS HUD OVERLAY
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

function openFocusHUD() {
  const overlay = document.getElementById('focus-hud-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  // Sync task name
  const taskNameEl = document.getElementById('focus-task-display');
  const taskName = taskNameEl ? taskNameEl.textContent : 'Current Task';
  const hudTaskName = document.getElementById('focus-hud-task-name');
  if (hudTaskName) hudTaskName.textContent = taskName;
  // Sync timer
  syncFocusHUDTimer();
  // Motivational quotes cycle
  startFocusHUDQuotes();
}

function closeFocusHUD() {
  const overlay = document.getElementById('focus-hud-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function exitFocusHUD() {
  if (confirm('Are you sure? Breaking the flow will stop your timer.')) {
    closeFocusHUD();
    if (AppState.timerRunning) toggleTimer();
  }
}

const FOCUS_QUOTES = [
  '"The secret of getting ahead is getting started." \u2014 Mark Twain',
  '"You don\'t have to be great to start, but you have to start to be great."',
  '"Done is better than perfect." \u2014 Mark Zuckerberg',
  '"Deep work is the ability to focus without distraction." \u2014 Cal Newport',
  '"One task at a time. This one. Right now."',
  '"Every minute you spend in focused work is a minute you save later."',
];
let focusQuoteInterval = null;

function startFocusHUDQuotes() {
  const quoteEl = document.getElementById('focus-hud-quote');
  if (!quoteEl) return;
  let idx = 0;
  quoteEl.textContent = FOCUS_QUOTES[idx];
  clearInterval(focusQuoteInterval);
  focusQuoteInterval = setInterval(() => {
    idx = (idx + 1) % FOCUS_QUOTES.length;
    quoteEl.style.opacity = '0';
    setTimeout(() => {
      if (quoteEl) quoteEl.textContent = FOCUS_QUOTES[idx];
      quoteEl.style.opacity = '1';
    }, 400);
  }, 30000);
}

function syncFocusHUDTimer() {
  const hudTimer = document.getElementById('focus-hud-timer');
  if (!hudTimer) return;
  const mainTimer = document.getElementById('timer-display');
  if (mainTimer) hudTimer.textContent = mainTimer.textContent;
}
`;

code = code + NEW_SECTIONS;
console.log('Step 2.4: Command palette, hero ring, ripple, tilt, day review, focus HUD appended.');

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nSUCCESS: scripts/app.js fully patched!');
