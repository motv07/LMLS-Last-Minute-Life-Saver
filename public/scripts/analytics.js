/**
 * LMLS — Last-Minute Life Saver
 * analytics.js — Custom SVG line charts, estimated vs actual time bar charts, metrics, and AI insights panel
 */

'use strict';

// Global hooks for AppState and App Controller delegation
window.renderAnalytics = renderAnalytics;
window.generateProductivityInsights = generateProductivityInsights;
window.generateWeeklyReportCard = generateWeeklyReportCard;
window.showChartTooltip = showChartTooltip;
window.hideChartTooltip = hideChartTooltip;

// Shared tooltip container
let tooltipEl = null;
let trendChartInstance = null;
let estActChartInstance = null;
let focusSessionsChartInstance = null;
let categoryChartInstance = null;

function initTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.style.opacity = '0';
    document.body.appendChild(tooltipEl);
  }
}

function showChartTooltip(event, label, value) {
  initTooltip();
  tooltipEl.innerHTML = `<strong>${label}</strong><br>${value}`;
  tooltipEl.style.opacity = '1';
  
  // Position tooltip near the mouse
  const x = event.pageX;
  const y = event.pageY;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y}px`;
}

function hideChartTooltip() {
  if (tooltipEl) {
    tooltipEl.style.opacity = '0';
  }
}

function renderAnalytics() {
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);

  // 1. Productivity Score Ring (Existing)
  const ring = document.getElementById('score-ring-circle');
  const scoreEl = document.getElementById('analytics-score');
  if (ring && scoreEl) {
    const circumference = 314;
    const offset = circumference * (1 - stats.productivityScore / 100);
    ring.style.strokeDashoffset = offset;
    scoreEl.textContent = stats.productivityScore;
  }

  const descEl = document.getElementById('score-description');
  if (descEl) {
    if (stats.productivityScore >= 80) descEl.textContent = '🏆 Outstanding productivity! Keep it up!';
    else if (stats.productivityScore >= 60) descEl.textContent = '💪 Good progress — push a bit harder!';
    else if (stats.productivityScore >= 40) descEl.textContent = '📈 Room to grow — tackle those overdue tasks!';
    else descEl.textContent = '🚀 Time to get back on track. You got this!';
  }

  // 2. Score breakdown (Existing)
  const breakdown = document.getElementById('score-breakdown');
  if (breakdown) {
    breakdown.innerHTML = `
      <div class="score-item"><div class="score-item-val" style="color:var(--primary-light)">${stats.total}</div><div class="score-item-label">Total Tasks</div></div>
      <div class="score-item"><div class="score-item-val" style="color:var(--success)">${stats.completed}</div><div class="score-item-label">Completed</div></div>
      <div class="score-item"><div class="score-item-val" style="color:var(--danger)">${stats.overdue}</div><div class="score-item-label">Overdue</div></div>
      <div class="score-item"><div class="score-item-val" style="color:var(--warning)">${stats.dueToday}</div><div class="score-item-label">Due Today</div></div>
    `;
  }

  // 3. Task overview chart (Existing)
  const chartEl = document.getElementById('chart-task-overview');
  if (chartEl) {
    const maxVal = Math.max(stats.total, 1);
    chartEl.innerHTML = `
      <div class="chart-bar-group">
        <div class="chart-bar-value">${stats.total}</div>
        <div class="chart-bar total" style="height:${(stats.total/maxVal)*120}px"></div>
        <div class="chart-bar-label">Total</div>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-value">${stats.completed}</div>
        <div class="chart-bar done" style="height:${(stats.completed/maxVal)*120}px"></div>
        <div class="chart-bar-label">Done</div>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-value">${stats.pendingCount}</div>
        <div class="chart-bar" style="height:${(stats.pendingCount/maxVal)*120}px; background:linear-gradient(to top, var(--accent-subtle), var(--accent))"></div>
        <div class="chart-bar-label">Pending</div>
      </div>
      <div class="chart-bar-group">
        <div class="chart-bar-value">${stats.overdue}</div>
        <div class="chart-bar" style="height:${(stats.overdue/maxVal)*120}px; background:linear-gradient(to top, var(--danger-subtle), var(--danger))"></div>
        <div class="chart-bar-label">Overdue</div>
      </div>
    `;
  }

  // 4. Completion rate (Existing)
  const rateVal = document.getElementById('completion-rate-val');
  const rateBar = document.getElementById('completion-rate-bar');
  if (rateVal) rateVal.textContent = `${stats.completionRate}%`;
  if (rateBar) rateBar.style.width = `${stats.completionRate}%`;

  // 5. Weekly chart (Existing)
  const weekDays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weeklyEl = document.getElementById('weekly-chart');
  const maxWeekly = Math.max(...stats.weekly, 1);
  if (weeklyEl) {
    weeklyEl.innerHTML = stats.weekly.map((count, i) => `
      <div class="weekly-row">
        <div class="weekly-day">${weekDays[i] || '?'}</div>
        <div class="weekly-bar-wrapper">
          <div class="weekly-bar" style="width:${(count/maxWeekly)*100}%"></div>
        </div>
        <div class="weekly-val">${count}</div>
      </div>`).join('');
  }

  // 6. Category breakdown (Chart.js doughnut)
  renderCategoryChart(stats);

  // ═══════════ NEW CUSTOM VISUALIZATIONS ═══════════
  render30DayTrendChart(tasks);
  renderEstVsActBarChart(tasks);
  renderFocusSessionsChart();
  renderHabitGrid();
  renderAdvancedMetrics(tasks);
  
  if (typeof Gamification !== 'undefined') {
    Gamification.renderBadgesGrid();
  }
}

/**
 * Renders completed tasks per day over the last 30 days using custom SVG
 */
function render30DayTrendChart(tasks) {
  const canvas = document.getElementById('trend-chart-canvas');
  if (!canvas) return;

  const now = new Date();
  const labels = [];
  const data = [];
  
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    const count = tasks.filter(t => t.status === 'completed' && t.completedAt && t.completedAt >= start && t.completedAt <= end).length;
    
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    data.push(count);
  }

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tasks Completed',
        data: data,
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: 'rgba(255,255,255,0.8)',
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 43, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8',
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 6 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 }
        }
      }
    }
  });
}

function renderEstVsActBarChart(tasks) {
  const canvas = document.getElementById('est-act-chart-canvas');
  if (!canvas) return;

  const chartTasks = tasks
    .filter(t => t.status === 'completed' && (t.estimatedMin || t.sessionsDone > 0))
    .sort((a,b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 6);

  const labels = chartTasks.map(t => t.title.length > 12 ? t.title.slice(0, 10) + '..' : t.title).reverse();
  const estData = chartTasks.map(t => t.estimatedMin || 0).reverse();
  const actData = chartTasks.map(t => (t.sessionsDone || 0) * 25).reverse();

  if (estActChartInstance) {
    estActChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  estActChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Estimated (min)',
          data: estData,
          backgroundColor: 'rgba(124, 58, 237, 0.6)',
          borderColor: '#7c3aed',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Actual (min)',
          data: actData,
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 10 } } },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 43, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8'
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 9 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      }
    }
  });
}

function renderFocusSessionsChart() {
  const canvas = document.getElementById('focus-sessions-chart-canvas');
  if (!canvas) return;

  const history = JSON.parse(localStorage.getItem('lmls_focus_history') || '[]');
  const now = new Date();
  const labels = [];
  const data = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
    
    const count = history.filter(f => {
      const ts = new Date(f.timestamp).getTime();
      return ts >= start && ts <= end;
    }).length;

    labels.push(dateStr);
    data.push(count);
  }

  if (focusSessionsChartInstance) {
    focusSessionsChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  focusSessionsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Focus Sessions',
        data: data,
        backgroundColor: 'rgba(34, 211, 238, 0.6)',
        borderColor: '#22d3ee',
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 43, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8'
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 9 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 }
        }
      }
    }
  });
}

function renderCategoryChart(stats) {
  const container = document.getElementById('category-breakdown');
  if (!container) return;

  container.innerHTML = `<canvas id="category-chart-canvas" style="max-height:180px;"></canvas>`;
  const canvas = document.getElementById('category-chart-canvas');
  if (!canvas) return;

  const labels = [];
  const data = [];
  const colors = [];

  const catEmojis = { work: '💼 Work', personal: '🏠 Personal', health: '💖 Health', finance: '💰 Finance', education: '📚 Education', other: '📌 Other' };
  const catColors = { work: '#7c3aed', personal: '#06b6d4', health: '#ef4444', finance: '#10b981', education: '#f59e0b', other: '#475569' };

  function getDynamicColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 70%, 60%)`;
  }

  Object.entries(stats.byCategory).forEach(([cat, d]) => {
    if (d.total > 0) {
      let displayName = catEmojis[cat];
      if (!displayName) {
        try {
          const raw = localStorage.getItem('lmls_custom_categories');
          if (raw) {
            const customCats = JSON.parse(raw);
            const found = customCats.find(c => c.id === cat || c.name.toLowerCase() === cat.toLowerCase());
            if (found) {
              displayName = `${found.emoji} ${found.name}`;
            }
          }
        } catch (e) {
          console.error(e);
        }
        if (!displayName) {
          displayName = cat.charAt(0).toUpperCase() + cat.slice(1);
        }
      }

      labels.push(displayName);
      data.push(d.total);
      
      const color = catColors[cat] || getDynamicColor(cat);
      colors.push(color);
    }
  });

  if (labels.length === 0) {
    container.innerHTML = `<p class="text-muted" style="font-size:12px; text-align:center; padding-top:20px;">No task categories to display.</p>`;
    return;
  }

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { size: 10 } }
        },
        tooltip: {
          backgroundColor: 'rgba(13, 13, 43, 0.95)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#f1f5f9',
          bodyColor: '#94a3b8'
        }
      }
    }
  });
}

function renderHabitGrid() {
  const grid = document.getElementById('habit-consistency-grid');
  const badge = document.getElementById('perfect-day-streak-badge');
  if (!grid) return;

  const habits = AppState.habits || [];
  const now = new Date();
  
  let gridHTML = '';
  const dayMillis = 24 * 3600 * 1000;
  
  const dates = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * dayMillis);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    dates.push({ dateKey, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
  }

  dates.forEach(item => {
    const totalHabits = habits.length;
    const completed = habits.filter(h => {
      const val = h.completions[item.dateKey];
      return val === true || (typeof val === 'number' && val >= (h.goal || 1));
    }).length;
    
    let levelColor = 'rgba(255,255,255,0.03)';
    let borderStyle = '1px solid rgba(255,255,255,0.08)';

    if (totalHabits > 0 && completed > 0) {
      const ratio = completed / totalHabits;
      if (ratio === 1) {
        levelColor = 'var(--warning)';
        borderStyle = '1px solid rgba(245, 158, 11, 0.4)';
      } else if (ratio >= 0.6) {
        levelColor = '#7c3aed';
      } else if (ratio >= 0.3) {
        levelColor = 'rgba(124, 58, 237, 0.6)';
      } else {
        levelColor = 'rgba(124, 58, 237, 0.3)';
      }
    }

    gridHTML += `
      <div style="width: 14px; height: 14px; background: ${levelColor}; border: ${borderStyle}; border-radius: 2px;"
           title="${item.label}: ${completed}/${totalHabits} habits completed"
           onmouseenter="showChartTooltip(event, '${item.label}', '${completed}/${totalHabits} habits done')"
           onmouseleave="hideChartTooltip()">
      </div>`;
  });

  grid.innerHTML = gridHTML;

  // Streak calculation
  let streak = 0;
  let checkDate = new Date(now);
  const totalHabits = habits.length;

  if (totalHabits > 0) {
    while (true) {
      const key = `${checkDate.getFullYear()}-${String(checkDate.getMonth()+1).padStart(2,'0')}-${String(checkDate.getDate()).padStart(2,'0')}`;
      const completed = habits.filter(h => {
        const val = h.completions[key];
        return val === true || (typeof val === 'number' && val >= (h.goal || 1));
      }).length;

      if (completed === totalHabits) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        const isToday = key === `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        if (isToday && completed < totalHabits) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }
  }

  if (badge) {
    badge.textContent = `🏆 Current Perfect Day Streak: ${streak} day${streak !== 1 ? 's' : ''}`;
  }
}

function generateWeeklyReportCard() {
  const content = document.getElementById('ai-report-card-content');
  if (!content) return;

  if (!AppState.settings.geminiApiKey) {
    showToast('Gemini API Key is required. Please set it in Settings.', 'error');
    navigateTo('settings');
    return;
  }

  const btn = document.getElementById('btn-generate-report-card');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating...';
  }

  content.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100px; gap: var(--space-xs);">
      <div class="ai-status-dot pulse" style="width:12px; height:12px;"></div>
      <p style="font-size:11px; color:var(--text-muted)">Calculating weekly grades and coaching review...</p>
    </div>`;

  const tasks = TaskStore.getAll();
  const habits = AppState.habits;
  const focusHistory = JSON.parse(localStorage.getItem('lmls_focus_history') || '[]');

  let accumulatedText = '';
  GeminiClient.generateWeeklyReportCard(
    tasks,
    habits,
    focusHistory,
    (chunk) => {
      accumulatedText += chunk;
      content.innerHTML = formatMarkdown(accumulatedText);
    },
    () => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate';
      }
      showToast('Productivity Report Card compiled! 🎓', 'success');
    },
    (err) => {
      console.error(err);
      content.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Generate';
      }
    }
  );
}

/**
 * Calculates and renders advanced work metrics (accuracy ratio, peak hour, category comparison, overdue rate)
 */
function renderAdvancedMetrics(tasks) {
  const container = document.getElementById('advanced-metrics-list');
  if (!container) return;

  const completed = tasks.filter(t => t.status === 'completed');
  
  // 1. Time Accuracy Estimation Ratio
  let totalEst = 0;
  let totalAct = 0;
  completed.forEach(t => {
    if (t.estimatedMin) {
      totalEst += t.estimatedMin;
      totalAct += (t.sessionsDone || 0) * 25;
    }
  });

  let accuracyText = 'N/A';
  let accuracySub = 'Log time estimates to calculate';
  if (totalEst > 0) {
    const ratio = totalAct / totalEst;
    if (ratio >= 0.9 && ratio <= 1.1) {
      accuracyText = '1.0x (Perfect)';
      accuracySub = 'Highly accurate estimation!';
    } else if (ratio < 0.9) {
      const underPct = Math.round((1 - ratio) * 100);
      accuracyText = `${ratio.toFixed(1)}x Under`;
      accuracySub = `You complete tasks ${underPct}% faster than estimated`;
    } else {
      const overPct = Math.round((ratio - 1) * 100);
      accuracyText = `${ratio.toFixed(1)}x Over`;
      accuracySub = `Tasks take ${overPct}% longer than estimated`;
    }
  }

  // 2. Peak Productivity Hour
  const hoursCount = Array(24).fill(0);
  completed.forEach(t => {
    if (t.completedAt) {
      const hour = new Date(t.completedAt).getHours();
      hoursCount[hour]++;
    }
  });
  
  let peakHourText = 'None yet';
  let maxCompletions = 0;
  let peakHourVal = -1;
  hoursCount.forEach((count, hr) => {
    if (count > maxCompletions) {
      maxCompletions = count;
      peakHourVal = hr;
    }
  });
  
  if (peakHourVal !== -1) {
    const displayHour = peakHourVal === 0 ? '12 AM' : (peakHourVal === 12 ? '12 PM' : (peakHourVal > 12 ? (peakHourVal - 12) + ' PM' : peakHourVal + ' AM'));
    peakHourText = `${displayHour}`;
  }

  // 3. Overdue Rate
  const overdueCount = tasks.filter(t => t.status === 'overdue').length;
  const overdueRate = tasks.length > 0 ? Math.round((overdueCount / tasks.length) * 100) : 0;
  const overdueText = `${overdueRate}%`;

  // 4. Best Category
  const cats = {};
  tasks.forEach(t => {
    if (!cats[t.category]) cats[t.category] = { total: 0, done: 0 };
    cats[t.category].total++;
    if (t.status === 'completed') cats[t.category].done++;
  });
  
  let bestCat = 'None';
  let bestCatRate = -1;
  Object.entries(cats).forEach(([cat, d]) => {
    const rate = d.total > 0 ? d.done / d.total : 0;
    if (rate > bestCatRate && d.total >= 1) {
      bestCatRate = rate;
      bestCat = cat.charAt(0).toUpperCase() + cat.slice(1) + ` (${Math.round(rate * 100)}%)`;
    }
  });

  container.innerHTML = `
    <div class="metric-row">
      <div class="metric-name-group">
        <span class="metric-name">Time Estimation Ratio</span>
        <span class="metric-sub">${accuracySub}</span>
      </div>
      <span class="metric-value">${accuracyText}</span>
    </div>
    <div class="metric-row">
      <div class="metric-name-group">
        <span class="metric-name">Peak Focus Hour</span>
        <span class="metric-sub">Most completions occur around this time</span>
      </div>
      <span class="metric-value">${peakHourText}</span>
    </div>
    <div class="metric-row">
      <div class="metric-name-group">
        <span class="metric-name">Overdue Rate</span>
        <span class="metric-sub">Ratio of current tasks overdue</span>
      </div>
      <span class="metric-value" style="color: ${overdueRate > 20 ? 'var(--danger)' : 'var(--primary-light)'}">${overdueText}</span>
    </div>
    <div class="metric-row">
      <div class="metric-name-group">
        <span class="metric-name">Best Category</span>
        <span class="metric-sub">Highest completion rate by category</span>
      </div>
      <span class="metric-value">${bestCat}</span>
    </div>
  `;
}

/**
 * Call Gemini to get 3 productivity insights and stream them
 */
function generateProductivityInsights() {
  const panel = document.getElementById('ai-insights-content');
  if (!panel) return;

  if (!AppState.settings.geminiApiKey) {
    showToast('Gemini API Key is required. Please set it in Settings.', 'error');
    navigateTo('settings');
    return;
  }

  // Loading state
  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100px; gap: var(--space-xs);">
      <div class="ai-status-dot pulse" style="width:12px; height:12px;"></div>
      <p style="font-size:11px; color:var(--text-muted)">Generating productivity insights...</p>
    </div>`;

  const tasksData = TaskStore.getAll().map(t => ({
    title: t.title,
    priority: t.priority,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    estimatedMin: t.estimatedMin || 0,
    actualMin: (t.sessionsDone || 0) * 25
  }));

  const prompt = `Analyze my task productivity dataset and generate exactly 3 highly actionable daily insights about my estimation accuracy, peak work periods, category performance, or task bottleneck alerts.

Rules:
1. Provide exactly 3 bullet points, using bolding (**text**) for emphasis.
2. Rely on actual data (estimatedMin vs actualMin). Actual min is calculated as Pomodoro count * 25 minutes.
3. Be specific and coach-like in tone. Don't speak generic recommendations.
4. Format using clean Markdown list elements.

Productivity dataset:
${JSON.stringify(tasksData, null, 2)}`;

  let buffer = '';

  GeminiClient.streamResponse(
    prompt,
    (chunk) => {
      buffer += chunk;
      panel.innerHTML = formatMarkdown(buffer);
    },
    () => {
      showToast('AI Insights updated! 📊', 'success');
    },
    (err) => {
      console.error(err);
      panel.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
      showToast('Failed to generate insights', 'error');
    }
  );
}

// Basic markdown format helper (bold, lists, breaks)
function formatMarkdown(text) {
  let html = text;
  
  // Escape HTML tags to prevent custom injections
  html = html.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Bolding
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Bullet points
  html = html.replace(/^\s*-\s+(.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  
  // Clean up duplicate nested ULs
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}
