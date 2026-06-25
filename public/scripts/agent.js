/**
 * LMLS — Last-Minute Life Saver
 * agent.js — Autonomous agent loop, memory, predictive overload, smart snooze, task decomposition
 */

'use strict';

// Global hooks for delegation and click events
window.handleToggleSubtask = handleToggleSubtask;
window.handleDecomposeTask = handleDecomposeTask;
window.handleSnoozeTask = handleSnoozeTask;
window.selectSnoozeDuration = selectSnoozeDuration;
window.setSnoozeReason = setSnoozeReason;
window.submitSnooze = submitSnooze;
window.closeSnoozeModal = closeSnoozeModal;
window.closeBriefingModal = closeBriefingModal;
window.triggerMorningBriefing = triggerMorningBriefing;
window.dismissOverloadAlert = dismissOverloadAlert;
window.closeAgentNudge = closeAgentNudge;

// Agent Memory Manager
const AgentMemory = (() => {
  const STORAGE_KEY = 'lmls_agent_memory';

  let memory = {
    interactions: [], // List of user clicks, snoozes, completions
    preferences: {
      workStyle: 'focused', // default
      mostProductiveCategory: 'work',
    },
    lastCheckDate: ''
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) memory = JSON.parse(raw);
    } catch {
      // Keep defaults
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  }

  function addInteraction(type, details) {
    load();
    memory.interactions.push({
      timestamp: new Date().toISOString(),
      type,
      details
    });
    // Keep max 100 history items to save space
    if (memory.interactions.length > 100) memory.interactions.shift();
    save();
  }

  function getHistory() {
    load();
    return memory.interactions;
  }

  return { load, save, addInteraction, getHistory };
})();

// Autonomous Agent System
const AgentSystem = (() => {
  let agentInterval = null;

  function init() {
    AgentMemory.load();
    
    // Initial checks on startup
    setTimeout(() => {
      checkMorningBriefing();
      checkOverload();
    }, 2000);

    // Setup Agent Tick Loop (runs every 60 seconds for demo reprioritization / overload / crisis checks)
    if (agentInterval) clearInterval(agentInterval);
    agentInterval = setInterval(backgroundTick, 60000);
    console.log('🤖 LMLS Autonomous Agent loop started (60s tick)');
  }

  function backgroundTick() {
    // 1. Recompute all urgency scores & update status
    TaskStore.recomputeAllUrgency();
    
    // 2. Dynamic reprioritization checks
    const activeView = AppState.currentView;
    if (activeView === 'dashboard') {
      renderDashboard();
    } else if (activeView === 'tasks') {
      renderTasksView();
    } else if (activeView === 'schedule') {
      renderSchedule();
    }
    
    // Update live sidebar stress indicator
    updateUrgencyBar();

    // 3. Proactive Crisis Checker: Deadline < 2 hours and not completed
    const tasks = TaskStore.getAll();
    const now = Date.now();
    const crisisTasks = tasks.filter(t => t.status !== 'completed' && t.deadline && (t.deadline.getTime() - now) > 0 && (t.deadline.getTime() - now) <= 120 * 60000);
    
    if (crisisTasks.length > 0) {
      const mostCritical = crisisTasks.sort((a,b) => a.deadline - b.deadline)[0];
      // Only show overlay once per task to avoid nagging the user constantly
      if (!AppState.crisisShown) AppState.crisisShown = new Set();
      if (!AppState.crisisShown.has(mostCritical.id) && AppState.settings.crisisMode) {
        AppState.crisisShown.add(mostCritical.id);
        triggerCrisisOverlay(mostCritical);
        if (typeof logAgentAction === 'function') logAgentAction('crisis', `🚨 Crisis detected: "${mostCritical.title}" deadline imminent`);
      }
    }

    // 4. Overload and habit check reminder ticks
    checkOverload();
    checkHabitsReminder();
  }

  function checkHabitsReminder() {
    const hr = new Date().getHours();
    if (hr >= 18) { // Evening reminder (6 PM or later)
      const habits = AppState.habits;
      const today = todayKey();
      const pendingHabitsCount = habits.filter(h => !h.completions[today]).length;
      
      if (pendingHabitsCount > 0 && !localStorage.getItem(`lmls_habit_remind_${today}`)) {
        localStorage.setItem(`lmls_habit_remind_${today}`, 'true');
        showNudge('Habit Check-In 🌟', `You have ${pendingHabitsCount} habit${pendingHabitsCount > 1 ? 's' : ''} left to log this evening. Keep the streak alive!`);
      }
    }
  }

  return { init, backgroundTick };
})();

// --- MORNING BRIEFING FLOW ---
function checkMorningBriefing() {
  const now = new Date();
  if (now.getHours() >= 10) return; // Only before 10 AM

  const today = todayKey();
  const lastBriefing = localStorage.getItem('lmls_last_briefing_date');
  if (lastBriefing === today) return; // Already shown today

  if (typeof logAgentAction === 'function') logAgentAction('briefing', '📌 Morning briefing triggered — consulting Gemini AI...');
  triggerMorningBriefing();
}

function triggerMorningBriefing() {
  const modal = document.getElementById('modal-briefing');
  const avatar = document.getElementById('briefing-avatar');
  const content = document.getElementById('briefing-content');
  if (!modal || !content) return;

  // Show modal backdrop
  showModal('modal-briefing');
  if (avatar) avatar.classList.add('speaking');
  
  content.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap: var(--space-xs); padding: 20px;">
      <div class="ai-status-dot pulse" style="width:12px; height:12px;"></div>
      <p style="font-size:11px; color:var(--text-muted)">Consulting Gemini for your morning briefing...</p>
    </div>`;

  const userName = AppState.settings.userName || 'Productive User';
  const pendingTasks = TaskStore.getAll().filter(t => t.status !== 'completed');
  const overdueCount = pendingTasks.filter(t => t.status === 'overdue' || (t.deadline && t.deadline < new Date())).length;
  
  const prompt = `Good morning! Generate a motivating Morning Briefing for ${userName}.
I have ${pendingTasks.length} pending tasks (${overdueCount} overdue) and ${AppState.habits.length} habits to track.
Provide exactly 3 structured bullet points:
1. **Focus First**: The single most critical task due soonest.
2. **Day Plan**: A recommended block schedule to cover tasks.
3. **Habit Goal**: A quick prompt to get streaks done.
Be highly encouraging, concise, under 90 words.`;

  let textBuffer = '';
  GeminiClient.streamResponse(
    prompt,
    (chunk) => {
      textBuffer += chunk;
      content.innerHTML = formatMarkdown(textBuffer);
    },
    () => {
      // On stream done, save the date
      localStorage.setItem('lmls_last_briefing_date', todayKey());
      AgentMemory.addInteraction('morning_briefing', { date: todayKey() });
      if (typeof logAgentAction === 'function') logAgentAction('briefing', '✅ Morning briefing generated and delivered');
      
      // Speak the briefing if voice synthesis is active
      if (typeof VoiceAssistant !== 'undefined' && AppState.settings.voiceResponse) {
        // Strip markdown stars for speech synthesis
        const speakableText = textBuffer.replace(/\*\*/g, '').trim();
        VoiceAssistant.speak(speakableText);
      }
    },
    (err) => {
      console.error(err);
      content.innerHTML = `<p style="color:var(--danger)">Failed to fetch briefing: ${err.message}</p>`;
      if (avatar) avatar.classList.remove('speaking');
    }
  );
}

function closeBriefingModal() {
  const modal = document.getElementById('modal-briefing');
  const avatar = document.getElementById('briefing-avatar');
  if (modal) {
    modal.classList.add('hidden');
    document.getElementById('modal-backdrop').classList.add('hidden');
  }
  if (avatar) avatar.classList.remove('speaking');
  
  // Stop speaking briefing if user closes it
  if (typeof VoiceAssistant !== 'undefined') {
    VoiceAssistant.stopSpeaking();
  }
}

// --- TASK DECOMPOSITION FLOW ---
function handleDecomposeTask(taskId) {
  const task = TaskStore.getById(taskId);
  if (!task) return;

  showToast('AI is breaking down task... 🧠', 'info');

  const prompt = `Decompose the task "${task.title}" (Description: ${task.description}) into exactly 3 to 5 logical, sequential subtasks.
Return ONLY a valid JSON array of strings, for example: ["Subtask 1", "Subtask 2", "Subtask 3"].
Do not include markdown formatting, json tags, or any conversational text.`;

  let responseText = '';
  GeminiClient.streamResponse(
    prompt,
    (chunk) => {
      responseText += chunk;
    },
    () => {
      // Parse subtasks on completion
      const subtaskTitles = parseSubtasksJson(responseText);
      if (subtaskTitles.length > 0) {
        const subtasks = subtaskTitles.map(title => ({
          id: crypto.randomUUID(),
          title,
          completed: false
        }));
        
        TaskStore.update(taskId, { subtasks });
        if (typeof logAgentAction === 'function') logAgentAction('decompose', `🔧 Task "${task.title.slice(0,30)}" decomposed into ${subtasks.length} subtasks`);
        AgentMemory.addInteraction('decomposition', { taskId, title: task.title, count: subtasks.length });
        showToast('Task broken down successfully! 📋', 'success');
        
        // Refresh active views
        if (AppState.currentView === 'dashboard') renderDashboard();
        else if (AppState.currentView === 'tasks') renderTasksView();
      } else {
        showToast('Failed to parse subtasks from AI', 'error');
      }
    },
    (err) => {
      console.error(err);
      showToast('AI Task Decomposition failed', 'error');
    }
  );
}

function parseSubtasksJson(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '').replace(/```$/, '').trim();
  }
  try {
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr)) {
      return arr.map(s => s.toString().trim()).filter(Boolean);
    }
  } catch (e) {
    console.warn("Regex parsing fallback due to JSON error:", e);
  }
  
  // Fallback regex/line parsing
  return text.split('\n')
    .map(line => line.replace(/^[-*•\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

function handleToggleSubtask(taskId, subtaskId) {
  const task = TaskStore.toggleSubtask(taskId, subtaskId);
  if (!task) return;

  const sub = task.subtasks.find(s => s.id === subtaskId);
  if (sub) {
    showToast(sub.completed ? `Checked off subtask! ✔` : `Unchecked subtask`, 'success');
  }

  AgentMemory.addInteraction('subtask_toggle', { taskId, subtaskId, completed: sub.completed });

  // Check if all subtasks are complete and parent task is not yet completed
  const allDone = task.subtasks && task.subtasks.length && task.subtasks.every(s => s.completed);
  if (allDone && task.status !== 'completed') {
    if (typeof toggleTaskComplete === 'function') {
      toggleTaskComplete(taskId);
    }
  } else {
    // Update card render
    if (AppState.currentView === 'dashboard') renderDashboard();
    else if (AppState.currentView === 'tasks') renderTasksView();
  }
}

// --- SMART SNOOZE FLOW ---
let selectedSnoozeMins = 30; // default 30 min

function handleSnoozeTask(taskId) {
  const task = TaskStore.getById(taskId);
  if (!task) return;

  document.getElementById('snooze-task-id').value = taskId;
  document.getElementById('snooze-reason').value = '';
  
  // Highlight default 30 min shortcut
  selectSnoozeDuration(30);

  showModal('modal-snooze');
}

function selectSnoozeDuration(mins) {
  selectedSnoozeMins = mins;
  const btns = document.querySelectorAll('.snooze-shortcuts .btn');
  btns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    if ((mins === 30 && text.includes('30')) ||
        (mins === 120 && text.includes('2')) ||
        (mins === 1440 && text.includes('1'))) {
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-ghost');
    } else {
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-ghost');
    }
  });
}

function setSnoozeReason(text) {
  const textarea = document.getElementById('snooze-reason');
  if (textarea) textarea.value = text;
}

function submitSnooze() {
  const taskId = document.getElementById('snooze-task-id').value;
  const reason = document.getElementById('snooze-reason').value.trim();
  const task = TaskStore.getById(taskId);
  
  if (!task) return;
  if (!reason) {
    showToast('Please specify a reason for snoozing!', 'error');
    return;
  }

  // Calculate new deadline
  const currentDeadline = task.deadline || new Date();
  const newDeadline = new Date(currentDeadline.getTime() + selectedSnoozeMins * 60000);
  
  // Record snooze history log
  const snoozeLog = {
    timestamp: new Date().toISOString(),
    durationMinutes: selectedSnoozeMins,
    reason,
    previousDeadline: currentDeadline.toISOString()
  };
  
  if (!task.snoozeHistory) task.snoozeHistory = [];
  task.snoozeHistory.push(snoozeLog);

  // Update task — also save snooze reason for display on card
  TaskStore.update(taskId, { deadline: newDeadline, snoozeHistory: task.snoozeHistory, snoozeReason: reason });
  AgentMemory.addInteraction('snooze', { taskId, title: task.title, duration: selectedSnoozeMins, reason });
  if (typeof logAgentAction === 'function') logAgentAction('snooze', `💤 Snoozed "${task.title.slice(0,28)}" by ${selectedSnoozeMins}m — ${reason.slice(0,30)}`);

  closeSnoozeModal();
  showToast(`Snoozed task deadline by ${selectedSnoozeMins}m`, 'success');

  // Trigger Gemini Encouragement Nudge based on snooze reasons
  generateSnoozeEncouragement(task.title, selectedSnoozeMins, reason);

  // Refresh views
  if (AppState.currentView === 'dashboard') renderDashboard();
  else if (AppState.currentView === 'tasks') renderTasksView();
  else if (AppState.currentView === 'schedule') renderSchedule();
}

function closeSnoozeModal() {
  const modal = document.getElementById('modal-snooze');
  if (modal) {
    modal.classList.add('hidden');
    document.getElementById('modal-backdrop').classList.add('hidden');
  }
}

function generateSnoozeEncouragement(taskTitle, duration, reason) {
  const prompt = `Give me a very short, highly encouraging micro-nudge (under 14 words).
I had to snooze the deadline of task "${taskTitle}" by ${duration} minutes due to "${reason}".
Be positive, supportive, and push me to recover my energy. Use exactly 1 emoji.`;

  GeminiClient.streamResponse(
    prompt,
    (chunk) => {
      // Just collect text, show nudge on done
    },
    (fullText) => {
      showNudge('AI Companion 🤖', fullText);
    },
    (err) => {
      console.warn("Failed to generate snooze nudge:", err);
    }
  );
}

// --- PREDICTIVE OVERLOAD & ALERTS ---
function checkOverload() {
  const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
  const now = Date.now();
  const next3Days = now + 3 * 86400000;
  
  const upcomingTasks = tasks.filter(t => t.deadline && t.deadline.getTime() > now && t.deadline.getTime() <= next3Days);
  const totalMins = upcomingTasks.reduce((sum, t) => sum + (t.estimatedMin || 30), 0);
  
  const container = document.getElementById('overload-alert-container');
  if (!container) return;

  const today = todayKey();
  
  // Only trigger overload alert if estimated tasks exceed 6 hours (360 mins)
  if (totalMins > 360) {
    if (localStorage.getItem('lmls_last_overload_check') === today && container.children.length > 0) {
      return; // Already loaded suggestions today
    }
    
    container.innerHTML = `
      <div class="overload-alert-card">
        <div class="overload-icon">⏳</div>
        <div class="overload-content">
          <div class="overload-title">Predictive Overload Warning</div>
          <div class="overload-desc">Analyzing workload for the next 3 days...</div>
        </div>
      </div>`;

    const prompt = `Overload Warning!
I have ${upcomingTasks.length} tasks scheduled in the next 3 days, requiring a total of ~${(totalMins / 60).toFixed(1)} hours of focus time.
Here is the task dataset:
${JSON.stringify(upcomingTasks.map(t => ({ title: t.title, deadline: t.deadline.toISOString(), estimatedMin: t.estimatedMin, priority: t.priority })), null, 2)}

Provide exactly 2 bulleted suggestions (under 40 words total) on which tasks to snooze, defer, or split to prevent deadlines crisis.`;

    let buffer = '';
    GeminiClient.streamResponse(
      prompt,
      (chunk) => {
        buffer += chunk;
        renderOverloadCard(container, totalMins, buffer);
      },
      () => {
        localStorage.setItem('lmls_last_overload_check', today);
      },
      (err) => {
        console.error(err);
        container.innerHTML = ''; // hide card if AI API fails
      }
    );
  } else {
    container.innerHTML = '';
  }
}

function renderOverloadCard(container, totalMins, suggestionsMarkdown) {
  const suggestionsHTML = formatMarkdown(suggestionsMarkdown);
  container.innerHTML = `
    <div class="overload-alert-card">
      <div class="overload-icon">⚠️</div>
      <div class="overload-content">
        <div class="overload-title">Predictive Overload Alert</div>
        <div class="overload-desc">
          You have <strong>${(totalMins / 60).toFixed(1)} hours</strong> of estimated focus scheduled for the next 3 days. Gemini recommends adjusting your workload:
        </div>
        <div class="overload-suggestions">
          ${suggestionsHTML}
        </div>
        <div class="overload-actions">
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('tasks')">Postpone Tasks</button>
          <button class="btn btn-ghost btn-sm" onclick="dismissOverloadAlert()">Dismiss</button>
        </div>
      </div>
    </div>`;
}

function dismissOverloadAlert() {
  const container = document.getElementById('overload-alert-container');
  if (container) container.innerHTML = '';
}

// --- AGENT NOTIFICATION NUDGES ---
let nudgeTimeout = null;

function showNudge(title, text) {
  // Clear any existing nudges
  closeAgentNudge();

  const nudge = document.createElement('div');
  nudge.className = 'agent-nudge';
  nudge.id = 'agent-nudge';
  nudge.innerHTML = `
    <div class="agent-nudge-avatar">🤖</div>
    <div class="agent-nudge-body">
      <div class="agent-nudge-title">${escapeHtml(title)}</div>
      <div class="agent-nudge-text">${escapeHtml(text)}</div>
    </div>
    <span class="agent-nudge-close" onclick="closeAgentNudge()">&times;</span>
  `;

  document.body.appendChild(nudge);

  // Auto close after 10 seconds
  nudgeTimeout = setTimeout(() => {
    closeAgentNudge();
  }, 10000);
}

function closeAgentNudge() {
  const nudge = document.getElementById('agent-nudge');
  if (nudge) nudge.remove();
  if (nudgeTimeout) {
    clearTimeout(nudgeTimeout);
    nudgeTimeout = null;
  }
}

// Format markdown list and bolding for alert panels
function formatMarkdown(text) {
  let html = text;
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*[-*•]\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// Expose AgentSystem to global window
window.AgentSystem = AgentSystem;
window.AgentMemory = AgentMemory;
