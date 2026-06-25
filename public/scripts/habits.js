/**
 * LMLS — Last-Minute Life Saver
 * habits.js — Habit AI coaching, stats, animated SVG completion rings, 90-day heatmap grid
 */

'use strict';

// Global hooks for AppState and App Controller delegation
window.renderHabits = renderHabits;
window.renderHeatmap = renderHeatmap;
window.toggleHabit = toggleHabit;
window.deleteHabit = deleteHabit;
window.analyzeHabits = analyzeHabits;
window.logHistoricalHabit = logHistoricalHabit;
window.computeStreak = computeStreak;
window.calculateBestStreak = calculateBestStreak;

// Helper to escape HTML to prevent XSS
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function computeStreak(habit) {
  let streak = 0;
  const now = new Date();
  const today = todayKey();
  const goal = habit.goal || 1;
  
  let checkDate = new Date(now);
  const todayCount = habit.completions[today] === true ? 1 : (habit.completions[today] || 0);
  
  // If not completed today, check if yesterday was completed to keep the streak alive
  if (todayCount < goal) {
    checkDate.setDate(checkDate.getDate() - 1);
    const yesterdayKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
    const yesterdayCount = habit.completions[yesterdayKey] === true ? 1 : (habit.completions[yesterdayKey] || 0);
    if (yesterdayCount < goal) {
      return 0; // Not completed today or yesterday -> streak is 0
    }
  }

  // Trace backwards
  while (true) {
    const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
    const count = habit.completions[key] === true ? 1 : (habit.completions[key] || 0);
    if (count >= goal) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function calculateBestStreak(habit) {
  const goal = habit.goal || 1;
  const completedKeys = Object.keys(habit.completions).filter(key => {
    const val = habit.completions[key];
    const count = val === true ? 1 : (Number(val) || 0);
    return count >= goal;
  });

  if (completedKeys.length === 0) return 0;

  completedKeys.sort();

  let maxStreak = 0;
  let currentStreak = 0;
  let lastTime = null;

  for (let i = 0; i < completedKeys.length; i++) {
    const key = completedKeys[i];
    const parts = key.split('-');
    if (parts.length !== 3) continue;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-based
    const day = parseInt(parts[2], 10);
    // Use UTC midnight to avoid DST or timezone issues
    const currentTime = Date.UTC(year, month, day);

    if (lastTime === null) {
      currentStreak = 1;
    } else {
      const diffMs = currentTime - lastTime;
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
      if (diffDays === 1) {
        currentStreak++;
      } else if (diffDays > 1) {
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
        }
        currentStreak = 1;
      }
    }
    lastTime = currentTime;
  }

  if (currentStreak > maxStreak) {
    maxStreak = currentStreak;
  }

  return maxStreak;
}

function renderHabits() {
  const grid = document.getElementById('habits-grid');
  if (!grid) return;

  const habits = AppState.habits;
  const today  = todayKey();
  const now    = new Date();

  // Update Stats and UI layouts visibility
  const statsGrid = document.getElementById('habit-stats-grid');
  const detailsRow = document.getElementById('habits-details-row');

  if (habits.length === 0) {
    if (statsGrid) statsGrid.style.display = 'none';
    if (detailsRow) detailsRow.style.display = 'none';
    grid.innerHTML = `
      <div class="habits-empty">
        <div class="empty-illustration">🌱</div>
        <h3>Start Your Habit Journey</h3>
        <p>Track daily habits and build streaks to boost your productivity</p>
        <button class="btn btn-primary" onclick="openAddHabitModal()">+ Add First Habit</button>
      </div>`;
    return;
  }

  if (statsGrid) statsGrid.style.display = 'grid';
  if (detailsRow) detailsRow.style.display = 'grid';

  // Render week dots (last 7 days)
  const weekDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    weekDays.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0),
      key:   `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      isToday: i === 0,
    });
  }

  grid.innerHTML = habits.map(habit => {
    // Current completed count for today
    const count = habit.completions[today] === true ? 1 : (habit.completions[today] || 0);
    const goal = habit.goal || 1;
    const pct = Math.min(1, count / goal);
    const strokeDashoffset = Math.round(100 * (1 - pct));

    const weekDotsHTML = weekDays.map(d => {
      const dayVal = habit.completions[d.key] === true ? 1 : (habit.completions[d.key] || 0);
      const isDayDone = dayVal >= goal;
      const isDayPartial = dayVal > 0 && dayVal < goal;
      const dotClass = isDayDone ? 'done' : (isDayPartial ? 'partial' : '');
      const dotTitle = `${d.key}: ${dayVal}/${goal} completed`;
      
      return `
        <div class="week-dot ${dotClass} ${d.isToday ? 'today' : ''}"
             title="${dotTitle}"
             onclick="logHistoricalHabit('${habit.id}', '${d.key}')"
             style="cursor:pointer">
          ${d.label}
        </div>`;
    }).join('');

    return `
      <div class="habit-card" id="habit-card-${habit.id}">
        <div class="habit-card-header">
          <div class="habit-ring-container" onclick="toggleHabit('${habit.id}')" title="Click to log progress (${count}/${goal} completed)">
            <svg class="habit-progress-ring" viewBox="0 0 36 36">
              <defs>
                <linearGradient id="habit-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#10b981"/>
                  <stop offset="100%" stop-color="#06b6d4"/>
                </linearGradient>
              </defs>
              <circle class="ring-bg" cx="18" cy="18" r="15.9" />
              <circle class="ring-fg" cx="18" cy="18" r="15.9" stroke="url(#habit-ring-grad)" stroke-dasharray="100" stroke-dashoffset="${strokeDashoffset}" />
            </svg>
            <span class="habit-emoji-inner">${habit.emoji}</span>
          </div>
          <div class="habit-info">
            <div class="habit-name">${escapeHtml(habit.name)}</div>
            <div class="habit-frequency">${habit.frequency} (Target: ${goal}/day)</div>
          </div>
          <button class="habit-delete-btn" onclick="deleteHabit('${habit.id}')" aria-label="Delete habit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="habit-streak-row">
          <div class="habit-streak">🔥 ${habit.streak || 0} <span class="habit-streak-label" style="font-size:11px; margin-left:4px;">day streak (Best: ${habit.bestStreak || 0})</span></div>
          <div style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">${count}/${goal} logged</div>
        </div>
        <div class="habit-week-dots">${weekDotsHTML}</div>
      </div>`;
  }).join('');

  // Update stats cards
  renderHabitStats();

  // Populate Heatmap habit selector dropdown
  populateHeatmapDropdown();

  // Show heatmap section
  renderHeatmap();
}

function toggleHabit(id) {
  const habit = AppState.habits.find(h => h.id === id);
  if (!habit) return;

  const key = todayKey();
  const current = habit.completions[key] === true ? 1 : (habit.completions[key] || 0);
  const goal = habit.goal || 1;
  let next = current + 1;

  if (next > goal) {
    next = 0;
  }

  if (next === 0) {
    delete habit.completions[key];
    showToast(`${habit.emoji} ${habit.name} reset to 0 today`, 'info');
  } else {
    habit.completions[key] = next;
    if (next === goal) {
      showToast(`${habit.emoji} ${habit.name} completed today! 🔥`, 'success');
      if (typeof earnXP === 'function') {
        earnXP(15, `Completed habit: ${habit.name}`);
      }
      if (window.LMLS_Animations) {
        window.LMLS_Animations.triggerConfetti();
      }
    } else {
      showToast(`${habit.emoji} Logged ${next}/${goal} progress`, 'success');
    }
  }

  habit.streak = computeStreak(habit);
  habit.bestStreak = calculateBestStreak(habit);
  if (typeof Gamification !== 'undefined') {
    Gamification.checkHabitBadges(habit.bestStreak);
  }

  saveHabitsData();
  renderHabits();
  renderHabitsMini();
  updateBadges();
}

function logHistoricalHabit(habitId, dateStr) {
  const habit = AppState.habits.find(h => h.id === habitId);
  if (!habit) return;

  const current = habit.completions[dateStr] === true ? 1 : (habit.completions[dateStr] || 0);
  const goal = habit.goal || 1;
  let next = current + 1;

  if (next > goal) {
    next = 0;
  }

  if (next === 0) {
    delete habit.completions[dateStr];
    showToast(`Logged 0 completions for ${dateStr}`, 'info');
  } else {
    habit.completions[dateStr] = next;
    showToast(`Logged ${next}/${goal} for ${dateStr}`, 'success');
  }

  habit.streak = computeStreak(habit);
  habit.bestStreak = calculateBestStreak(habit);

  saveHabitsData();
  renderHabits();
  renderHabitsMini();
}

function deleteHabit(id) {
  AppState.habits = AppState.habits.filter(h => h.id !== id);
  saveHabitsData();
  showToast('Habit removed', 'info');
  renderHabits();
  renderHabitsMini();
  updateBadges();
}

function populateHeatmapDropdown() {
  const select = document.getElementById('heatmap-habit-select');
  if (!select) return;

  const selectedValue = select.value;
  select.innerHTML = AppState.habits.map(h => `
    <option value="${h.id}">${h.emoji} ${escapeHtml(h.name)}</option>
  `).join('');

  if (selectedValue && AppState.habits.some(h => h.id === selectedValue)) {
    select.value = selectedValue;
  } else if (AppState.habits.length > 0) {
    select.value = AppState.habits[0].id;
  }

  // Update custom select wrapper to reflect newly populated options
  if (typeof initCustomSelects === 'function') {
    initCustomSelects();
  }
}

function renderHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  if (!grid) return;

  if (AppState.habits.length === 0) {
    grid.innerHTML = '';
    return;
  }

  const select = document.getElementById('heatmap-habit-select');
  const habitId = select?.value || AppState.habits[0].id;
  const habit = AppState.habits.find(h => h.id === habitId);
  if (!habit) return;

  const now = new Date();
  
  // Set today at 00:00 for clean comparisons
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // 90 days window start (active window)
  const daysToShow = 90;
  const startDay = new Date(today);
  startDay.setDate(startDay.getDate() - (daysToShow - 1));

  // Align start to the Sunday of the starting week
  const renderStart = new Date(startDay);
  renderStart.setDate(renderStart.getDate() - renderStart.getDay());

  // Align end to the Saturday of the current week to show today + remaining days
  const renderEnd = new Date(today);
  renderEnd.setDate(renderEnd.getDate() + (6 - renderEnd.getDay()));

  // Calculate total cells needed
  const msPerDay = 24 * 60 * 60 * 1000;
  const displayCells = Math.round((renderEnd.getTime() - renderStart.getTime()) / msPerDay) + 1;

  let html = '';

  for (let i = 0; i < displayCells; i++) {
    const d = new Date(renderStart);
    d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    
    const isFuture = d > today;
    const isPastPadding = d < startDay;
    
    if (isPastPadding) {
      html += `<div class="heatmap-day level-0" style="opacity: 0.15;" title="Outside range"></div>`;
      continue;
    }

    if (isFuture) {
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      html += `<div class="heatmap-day level-0" style="opacity: 0.25; cursor: not-allowed;" title="${dateStr} (Future)"></div>`;
      continue;
    }

    const count = habit.completions[key] === true ? 1 : (habit.completions[key] || 0);
    const goal = habit.goal || 1;
    
    let level = 0;
    if (count > 0) {
      if (count >= goal) level = 4;
      else {
        const ratio = count / goal;
        if (ratio <= 0.33) level = 1;
        else if (ratio <= 0.66) level = 2;
        else level = 3;
      }
    }

    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const tooltipText = `${dateStr}: ${count}/${goal} completed`;

    html += `<div class="heatmap-day level-${level}" title="${tooltipText}" onclick="logHistoricalHabit('${habit.id}', '${key}')"></div>`;
  }
  grid.innerHTML = html;
}

function renderHabitStats() {
  const habits = AppState.habits;
  if (habits.length === 0) return;

  // 1. Total completions
  let totalCompletions = 0;
  habits.forEach(h => {
    Object.values(h.completions).forEach(val => {
      const count = val === true ? 1 : (parseInt(val, 10) || 0);
      totalCompletions += count;
    });
  });

  // 2. Best Streak
  const bestStreak = habits.reduce((max, h) => Math.max(max, Number(h.bestStreak) || 0), 0);

  // 3. Completion Rate (last 30 days)
  const now = new Date();
  let totalTargetDays = 0;
  let totalCompletedDays = 0;

  habits.forEach(habit => {
    const goal = habit.goal || 1;
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      
      const dateCreated = habit.createdAt ? new Date(habit.createdAt) : new Date(0);
      if (d >= dateCreated) {
        totalTargetDays++;
        const completedCount = habit.completions[key] === true ? 1 : (habit.completions[key] || 0);
        if (completedCount >= goal) {
          totalCompletedDays++;
        }
      }
    }
  });

  const completionRate = totalTargetDays > 0 ? Math.round((totalCompletedDays / totalTargetDays) * 100) : 0;

  // Update DOM elements
  const totalEl = document.getElementById('habit-stat-total-completions');
  const streakEl = document.getElementById('habit-stat-best-streak');
  const rateEl = document.getElementById('habit-stat-completion-rate');

  if (totalEl) totalEl.textContent = totalCompletions;
  if (streakEl) streakEl.textContent = bestStreak;
  if (rateEl) rateEl.textContent = `${completionRate}%`;
}

function analyzeHabits() {
  const coachContent = document.getElementById('ai-coach-content');
  if (!coachContent) return;

  if (!AppState.settings.geminiApiKey) {
    showToast('Gemini API Key is required. Please set it in Settings.', 'error');
    navigateTo('settings');
    return;
  }

  coachContent.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100px; gap: var(--space-xs);">
      <div class="ai-status-dot pulse" style="width:12px; height:12px;"></div>
      <p style="font-size:11px; color:var(--text-muted)">Gemini is analyzing your streaks...</p>
    </div>`;

  const habitsData = AppState.habits.map(h => {
    const compCount = Object.values(h.completions).filter(v => v === true || v >= h.goal).length;
    return {
      name: h.name,
      emoji: h.emoji,
      streak: h.streak || 0,
      bestStreak: h.bestStreak || 0,
      totalCompletions: compCount,
      goal: h.goal || 1,
      frequency: h.frequency
    };
  });

  const tasks = TaskStore.getAll();
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const taskStats = {
    total: tasks.length,
    completed: completedTasks.length,
    overdue: tasks.filter(t => t.status === 'overdue').length,
    categories: {}
  };
  
  completedTasks.forEach(t => {
    taskStats.categories[t.category] = (taskStats.categories[t.category] || 0) + 1;
  });

  const prompt = `Analyze my habit data and task history. Here is my current progress:
Habits list:
${JSON.stringify(habitsData, null, 2)}

Task history stats:
${JSON.stringify(taskStats, null, 2)}

Provide EXACTLY 3 sections in markdown:
1. **Coaching & Streaks**: Brief suggestions to maintain my habits.
2. **Recovery Plan**: If my streak is broken (or starts lagging), list 2 simple steps to rebuild momentum immediately.
3. **Correlation Insight**: Connect how completing my habits helps/hurts task completion (e.g. do my study habits help education tasks, does fitness relate to work capacity).

Keep the feedback under 150 words total, punchy, motivating, and professional.`;

  let responseBuffer = '';

  GeminiClient.streamResponse(
    prompt,
    (chunk) => {
      responseBuffer += chunk;
      coachContent.innerHTML = formatMarkdown(responseBuffer);
    },
    () => {
      showToast('Habits analyzed! 🧠', 'success');
    },
    (err) => {
      console.error(err);
      coachContent.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
      showToast('Habits analysis failed', 'error');
    }
  );
}

// Basic markdown format helper (bold, lists, breaks)
function formatMarkdown(text) {
  let html = text;
  
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/\n/g, '<br>');

  return html;
}
