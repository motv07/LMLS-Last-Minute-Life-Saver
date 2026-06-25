/**
 * LMLS — Last-Minute Life Saver
 * tasks.js — Task management engine, urgency scoring, CRUD, local storage
 */

'use strict';

// ═══════════════════════════════════════════════════
// TASK STORE
// ═══════════════════════════════════════════════════

const TaskStore = (() => {
  const STORAGE_KEY = 'lmls_tasks';

  let tasks = [];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
      // Migrate dates back from strings
      tasks.forEach(t => {
        t.deadline  = t.deadline  ? new Date(t.deadline)  : null;
        t.createdAt = t.createdAt ? new Date(t.createdAt) : new Date();
        t.completedAt = t.completedAt ? new Date(t.completedAt) : null;
        if (!t.subtasks) t.subtasks = [];
        if (!t.snoozeHistory) t.snoozeHistory = [];
      });
    } catch {
      tasks = [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function getAll() { return [...tasks]; }

  function getById(id) { return tasks.find(t => t.id === id) || null; }

  function add(taskData) {
    const task = {
      id:           crypto.randomUUID(),
      title:        taskData.title.trim(),
      description:  taskData.description?.trim() || '',
      deadline:     taskData.deadline ? new Date(taskData.deadline) : null,
      estimatedMin: taskData.estimatedMin ? parseInt(taskData.estimatedMin, 10) : null,
      priority:     taskData.priority || 'medium',
      category:     taskData.category || 'work',
      status:       'pending',
      tags:         taskData.tags ? taskData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      notes:        taskData.notes?.trim() || '',
      createdAt:    new Date(),
      completedAt:  null,
      urgencyScore: 0,
      sessionsDone: 0,
      subtasks:     taskData.subtasks || [],
      snoozeHistory: taskData.snoozeHistory || [],
      dependsOn:    taskData.dependsOn || '', // Day 4.2
      isHeading:    !!taskData.isHeading
    };
    task.urgencyScore = computeUrgency(task);
    tasks.unshift(task);
    save();
    return task;
  }

  function update(id, changes) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return null;
    if (changes.deadline && !(changes.deadline instanceof Date)) {
      changes.deadline = new Date(changes.deadline);
    }
    if (changes.tags && typeof changes.tags === 'string') {
      changes.tags = changes.tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    tasks[idx] = { ...tasks[idx], ...changes };
    tasks[idx].urgencyScore = computeUrgency(tasks[idx]);
    save();

    // GCal auto-sync
    if (tasks[idx].gcalEventId && typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
      CalendarClient.updateEventFromTask(tasks[idx]).catch(err => {
        console.error('Failed to sync updated task to Google Calendar:', err);
      });
    }

    return tasks[idx];
  }

  function complete(id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return;
    if (tasks[idx].status === 'completed') {
      // Uncomplete
      tasks[idx].status = 'pending';
      tasks[idx].completedAt = null;
    } else {
      tasks[idx].status = 'completed';
      tasks[idx].completedAt = new Date();
    }
    tasks[idx].urgencyScore = computeUrgency(tasks[idx]);
    save();

    // GCal auto-sync
    if (tasks[idx].gcalEventId && typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
      CalendarClient.updateEventFromTask(tasks[idx]).catch(err => {
        console.error('Failed to sync completed status to Google Calendar:', err);
      });
    }

    return tasks[idx];
  }

  function remove(id) {
    const idx = tasks.findIndex(t => t.id === id);
    if (idx !== -1) {
      const task = tasks[idx];
      if (task.gcalEventId && typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
        CalendarClient.deleteEventFromTask(task).catch(err => {
          console.error('Failed to delete Google Calendar event for removed task:', err);
        });
      }
      tasks.splice(idx, 1);
      save();
    }
  }

  function recomputeAllUrgency() {
    tasks.forEach(t => {
      t.urgencyScore = computeUrgency(t);
      if (t.status !== 'completed' && t.deadline && t.deadline < new Date()) {
        t.status = 'overdue';
      }
    });
    save();
  }

  function toggleSubtask(taskId, subtaskId) {
    const task = getById(taskId);
    if (!task) return null;
    const sub = task.subtasks.find(s => s.id === subtaskId);
    if (!sub) return null;
    sub.completed = !sub.completed;
    save();
    return task;
  }

  function restore(task) {
    tasks.unshift(task);
    save();
    return task;
  }

  return { load, save, getAll, getById, add, update, complete, remove, recomputeAllUrgency, toggleSubtask, restore };
})();

// ═══════════════════════════════════════════════════
// URGENCY SCORING ENGINE (0–100)
// ═══════════════════════════════════════════════════

function computeUrgency(task) {
  if (task.isHeading) return 0;
  if (task.status === 'completed') return 0;

  const now = Date.now();
  const deadline = task.deadline ? task.deadline.getTime() : null;
  const minsLeft = deadline ? (deadline - now) / 60000 : Infinity;

  let score = 0;

  // 1. Time-to-deadline weight (40 pts)
  if (deadline) {
    if (minsLeft <= 0)           score += 40;  // overdue
    else if (minsLeft <= 60)     score += 38;  // < 1 hour
    else if (minsLeft <= 180)    score += 32;  // < 3 hours
    else if (minsLeft <= 360)    score += 24;  // < 6 hours
    else if (minsLeft <= 720)    score += 16;  // < 12 hours
    else if (minsLeft <= 1440)   score += 10;  // < 24 hours
    else if (minsLeft <= 4320)   score += 5;   // < 3 days
    else                         score += 1;
  } else {
    score += 2; // No deadline = lowest urgency
  }

  // 2. User priority weight (30 pts)
  const priorityMap = { critical: 30, high: 22, medium: 14, low: 6 };
  score += (priorityMap[task.priority] || 14);

  // 3. Estimated time vs time remaining (20 pts)
  if (task.estimatedMin && deadline && minsLeft > 0) {
    const ratio = task.estimatedMin / minsLeft;
    if (ratio >= 1)        score += 20;  // no time!
    else if (ratio >= 0.7) score += 15;
    else if (ratio >= 0.4) score += 10;
    else if (ratio >= 0.2) score += 5;
    else                   score += 2;
  }

  // 4. Category importance (10 pts)
  const catMap = { finance: 10, work: 8, health: 8, education: 6, personal: 4, other: 2 };
  score += (catMap[task.category] || 2);

  return Math.min(100, Math.round(score));
}

// ═══════════════════════════════════════════════════
// URGENCY CLASSIFICATION
// ═══════════════════════════════════════════════════

function getUrgencyClass(score) {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function getDeadlineLabel(task) {
  if (!task.deadline) return { text: 'No deadline', cls: 'safe' };
  const now = new Date();
  const diff = task.deadline - now;
  const mins = diff / 60000;

  if (task.status === 'completed') return { text: '✅ Done', cls: 'safe' };
  if (mins < 0)   return { text: `⚠ Overdue by ${formatDuration(-diff)}`, cls: 'overdue' };
  if (mins < 60)  return { text: `🔴 ${Math.round(mins)}m left`, cls: 'critical' };
  if (mins < 360) return { text: `🟠 ${formatDuration(diff)} left`, cls: 'urgent' };
  if (mins < 1440) return { text: `🟡 ${formatDuration(diff)} left`, cls: 'normal' };
  return { text: `📅 ${formatDeadlineDate(task.deadline)}`, cls: 'safe' };
}

function formatDuration(ms) {
  const totalMins = Math.abs(Math.round(ms / 60000));
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h > 24) { const d = Math.floor(h / 24); return `${d}d ${h % 24}h`; }
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDeadlineDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ═══════════════════════════════════════════════════
// SORTING & FILTERING
// ═══════════════════════════════════════════════════

function sortTasksArray(tasks, by = 'urgency') {
  // If there are no headings, do standard flat sort
  if (!tasks.some(t => t.isHeading)) {
    return sortFlatTasks(tasks, by);
  }

  // Segment tasks by headings to keep headings in place and sort within sections
  const sections = [];
  let currentSection = { heading: null, tasks: [] };

  tasks.forEach(t => {
    if (t.isHeading) {
      if (currentSection.heading || currentSection.tasks.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { heading: t, tasks: [] };
    } else {
      currentSection.tasks.push(t);
    }
  });
  if (currentSection.heading || currentSection.tasks.length > 0) {
    sections.push(currentSection);
  }

  const result = [];
  sections.forEach(sec => {
    if (sec.heading) {
      result.push(sec.heading);
    }
    const sortedTasks = sortFlatTasks(sec.tasks, by);
    result.push(...sortedTasks);
  });

  return result;
}

function sortFlatTasks(flatTasks, by) {
  const arr = [...flatTasks];
  switch (by) {
    case 'urgency':
      return arr.sort((a, b) => b.urgencyScore - a.urgencyScore);
    case 'deadline':
      return arr.sort((a, b) => {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline - b.deadline;
      });
    case 'priority': {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return arr.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
    }
    case 'created':
      return arr.sort((a, b) => b.createdAt - a.createdAt);
    default:
      return arr;
  }
}

function filterTasksByStatus(tasks, status = 'all') {
  if (status === 'all') return tasks;
  return tasks.filter(t => t.status === status || t.isHeading);
}

function filterTasksByCategory(tasks, cat = 'all') {
  if (cat === 'all') return tasks;
  return tasks.filter(t => t.category === cat || t.isHeading);
}

function searchTasksByText(tasks, query = '') {
  if (!query.trim()) return tasks;
  const q = query.toLowerCase();
  return tasks.filter(t =>
    t.title.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.tags.some(tag => tag.toLowerCase().includes(q))
  );
}

// ═══════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════

function computeStats(tasks) {
  // Exclude headings from statistics calculations
  tasks = tasks.filter(t => !t.isHeading);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);

  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const overdue   = tasks.filter(t => t.status === 'overdue' || (t.status !== 'completed' && t.deadline && t.deadline < now)).length;
  const dueToday  = tasks.filter(t =>
    t.status !== 'completed' && t.deadline && t.deadline >= todayStart && t.deadline < todayEnd
  ).length;

  const pendingCount  = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Productivity score (0-100)
  // Factors: completion rate, on-time completion, overdue ratio
  const overdueRatio = total > 0 ? overdue / total : 0;
  const productivityScore = Math.max(0, Math.min(100,
    Math.round(completionRate * 0.6 + (1 - overdueRatio) * 40)
  ));

  // Crisis tasks (urgency > 70, not completed)
  const crisisTasks = tasks.filter(t => t.status !== 'completed' && t.urgencyScore >= 70);

  // By category
  const byCategory = {};
  tasks.forEach(t => {
    if (!byCategory[t.category]) byCategory[t.category] = { total: 0, done: 0 };
    byCategory[t.category].total++;
    if (t.status === 'completed') byCategory[t.category].done++;
  });

  // Weekly completions (current calendar week: Monday to Sunday)
  const weekly = Array(7).fill(0);
  const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToSubtract = currentDay === 0 ? 6 : currentDay - 1;
  const mondayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToSubtract);
  mondayStart.setHours(0, 0, 0, 0);
  const sundayEnd = new Date(mondayStart.getTime() + 7 * 86400000);

  tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt) >= mondayStart && new Date(t.completedAt) < sundayEnd).forEach(t => {
    const compDate = new Date(t.completedAt);
    const day = compDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const dayIndex = day === 0 ? 6 : day - 1;
    if (dayIndex >= 0 && dayIndex < 7) weekly[dayIndex]++;
  });

  // Most urgent pending task
  const pending = tasks.filter(t => t.status !== 'completed');
  const mostUrgent = pending.length > 0
    ? sortTasksArray(pending, 'urgency')[0]
    : null;

  return { total, completed, overdue, dueToday, pendingCount, completionRate, productivityScore, crisisTasks, byCategory, weekly, mostUrgent };
}

// ═══════════════════════════════════════════════════
// TASK CARD RENDERING
// ═══════════════════════════════════════════════════

function isTaskDependencyLocked(task) {
  if (!task || !task.dependsOn) return false;
  const parentTask = TaskStore.getById(task.dependsOn);
  if (!parentTask) return false;
  return parentTask.status !== 'completed';
}

function renderTaskCard(task) {
  if (task.isHeading) {
    return `
      <div class="task-card task-heading-row" id="task-card-${task.id}" data-id="${task.id}">
        <h3 class="task-heading-title">📌 ${escapeHtml(task.title)}</h3>
        <div class="task-heading-actions">
          <button class="btn btn-ghost btn-sm" onclick="openEditHeading('${task.id}')" title="Edit Heading" style="padding: 4px 8px; font-size: 11px;">✏️ Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteTask('${task.id}')" title="Delete Heading" style="padding: 4px 8px; font-size: 11px; color: var(--danger); border-color: rgba(239, 68, 68, 0.2);">🗑️ Delete</button>
        </div>
      </div>
    `;
  }

  const dlInfo  = getDeadlineLabel(task);
  const urgCls  = getUrgencyClass(task.urgencyScore);
  const priCls  = `priority-${task.priority}`;
  const isDone  = task.status === 'completed';
  const urgColor = urgencyColor(task.urgencyScore);
  const isLocked = isTaskDependencyLocked(task);
  const lockAttr = isLocked ? 'dependency-locked' : '';

  const tagsHTML = task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('');
  const estHTML  = task.estimatedMin ? `<span class="task-estimate-chip">⏱ ${formatEstimate(task.estimatedMin)}</span>` : '';

  const isExported = !!(task.manualEventId && typeof ManualEventStore !== 'undefined' && ManualEventStore.getById(task.manualEventId));
  const exportTitle = isExported ? "Already in Calendar (Click to toggle/remove)" : "Add to Calendar";
  const exportColor = isExported ? "style='color: var(--success);'" : "";
  const exportIcon = isExported
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M12 14v4M10 16h4"/></svg>`;

  let dependencyBadgeHTML = '';
  if (task.dependsOn) {
    const depTask = TaskStore.getById(task.dependsOn);
    if (depTask) {
      const depResolved = depTask.status === 'completed';
      const badgeClass = depResolved ? 'resolved' : '';
      const badgeIcon = depResolved ? '✅' : '🔒';
      dependencyBadgeHTML = `<div class="dependency-badge ${badgeClass}" title="Depends on: ${escapeHtml(depTask.title)}">${badgeIcon} ${escapeHtml(depTask.title.slice(0, 18))}${depTask.title.length > 18 ? '...' : ''}</div>`;
    }
  }

  let subtasksProgressHTML = '';
  if (task.subtasks && task.subtasks.length > 0) {
    const doneCount = task.subtasks.filter(s => s.completed).length;
    const totalCount = task.subtasks.length;
    const pct = Math.round((doneCount / totalCount) * 100);
    subtasksProgressHTML = `
      <div class="task-subtasks-progress-wrap">
        <div class="task-subtasks-progress-bar">
          <div class="task-subtasks-progress-fill" style="width: ${pct}%"></div>
        </div>
        <span class="task-subtasks-progress-label">${doneCount}/${totalCount} subtasks done</span>
      </div>
    `;
  }

  return `
    <div class="task-card ${isDone ? 'completed' : ''} ${lockAttr} priority-${task.priority}" id="task-card-${task.id}" data-id="${task.id}" draggable="true" ondragstart="if(typeof handleKanbanDragStart === 'function') handleKanbanDragStart(event, '${task.id}')">
      <div class="task-urgency-bar">
        <div class="task-urgency-fill" style="width:${task.urgencyScore}%; background:${urgColor}"></div>
      </div>
      <div class="task-card-top">
        <div class="task-card-header">
          <button class="task-check-btn ${isDone ? 'done' : ''}" onclick="toggleTaskComplete('${task.id}')" aria-label="Mark task complete" ${isLocked ? 'disabled' : ''}>
            ${isDone ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </button>
          <div class="task-card-title-wrap">
            <div class="task-card-title ${isDone ? 'done' : ''}">${escapeHtml(task.title)}</div>
            <div class="task-card-category">${getCategoryEmoji(task.category)} ${task.category}</div>
          </div>
        </div>
        ${task.description ? `<div class="task-card-desc">${escapeHtml(task.description)}</div>` : ''}
        <div class="task-card-meta">
          <span class="task-deadline-chip ${dlInfo.cls}">${dlInfo.text}</span>
          ${estHTML}
          ${dependencyBadgeHTML}
        </div>
        ${task.tags.length ? `<div class="task-tags">${tagsHTML}</div>` : ''}
        ${task.snoozeReason ? `<div class="snooze-reason-badge" title="Snoozed by AI">💤 ${escapeHtml(task.snoozeReason)}</div>` : ''}
        <div class="task-urgency-mini">
          <div class="task-urgency-mini-bar">
            <div class="task-urgency-mini-fill urgency-mini-fill--${urgCls}" style="width:${task.urgencyScore}%"></div>
          </div>
          <span class="task-urgency-mini-score">${task.urgencyScore}</span>
        </div>
        
        <!-- Day 6 Subtasks Checklist -->
        ${(() => {
          if (!task.subtasks || !task.subtasks.length) return '';
          const itemsHTML = task.subtasks.map(sub => `
            <div class="task-subtask-item">
              <input type="checkbox" class="task-subtask-checkbox" 
                     ${sub.completed ? 'checked' : ''} 
                     onclick="event.stopPropagation(); handleToggleSubtask('${task.id}', '${sub.id}')"
                     ${isLocked ? 'disabled' : ''}/>
              <span class="task-subtask-title ${sub.completed ? 'done' : ''}">${escapeHtml(sub.title)}</span>
            </div>
          `).join('');
          return `
            ${subtasksProgressHTML}
            <div class="task-subtasks-list">${itemsHTML}</div>
          `;
        })()}
      </div>
      <div class="task-card-footer">
        <span class="task-priority-badge ${priCls}">${task.priority}</span>
        <div class="task-card-actions">
          <!-- Focus -->
          <button class="task-action-btn focus-btn" onclick="setFocusTask('${task.id}')" title="Focus on this task" aria-label="Focus" ${isLocked ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </button>
          <!-- Decompose (Subtasks Break Down) -->
          <button class="task-action-btn decompose-btn" onclick="event.stopPropagation(); handleDecomposeTask('${task.id}')" title="AI Subtask Break Down" aria-label="Decompose" ${isLocked ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <!-- Snooze -->
          <button class="task-action-btn snooze-btn" onclick="event.stopPropagation(); handleSnoozeTask('${task.id}')" title="Smart Snooze" aria-label="Snooze" ${isLocked ? 'disabled' : ''}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 3h7l-6 8h6M13 11h5l-4 6h4M3 15h4l-3 4h3"/></svg>
          </button>
          <!-- Manual Calendar Sync -->
          <button class="task-action-btn manual-calendar-add-btn" onclick="event.stopPropagation(); exportTaskToManualCalendar('${task.id}')" title="${exportTitle}" aria-label="${exportTitle}" ${exportColor}>
            ${exportIcon}
          </button>
          <!-- Edit -->
          <button class="task-action-btn" onclick="openEditTask('${task.id}')" title="Edit task" aria-label="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <!-- Delete -->
          <button class="task-action-btn delete" onclick="deleteTask('${task.id}')" title="Delete task" aria-label="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTaskMiniCard(task) {
  const dlInfo = getDeadlineLabel(task);
  const urgCls = getUrgencyClass(task.urgencyScore);
  const isDone = task.status === 'completed';
  const scoreClass = task.urgencyScore >= 80 ? 'score-critical' : task.urgencyScore >= 55 ? 'score-high' : '';

  return `
    <div class="task-mini-card" onclick="openEditTask('${task.id}')">
      <div class="urgency-strip ${urgCls}"></div>
      <button class="task-mini-check-btn ${isDone ? 'done' : ''}"
        onclick="event.stopPropagation(); toggleTaskComplete('${task.id}')"
        aria-label="Complete task">
        ${isDone ? '✓' : ''}
      </button>
      <div class="task-mini-info">
        <div class="task-mini-title ${isDone ? 'done' : ''}">${escapeHtml(task.title)}</div>
        <div class="task-mini-meta">
          <span class="task-mini-time ${dlInfo.cls === 'critical' || dlInfo.cls === 'overdue' ? 'urgent' : ''}">${dlInfo.text}</span>
          <span class="urgency-score-chip ${scoreClass}">U${task.urgencyScore}</span>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

function getCategoryEmoji(cat) {
  const map = { work: '💼', personal: '🏠', health: '💖', finance: '💰', education: '📚', other: '📌' };
  if (map[cat]) return map[cat];
  
  try {
    const raw = localStorage.getItem('lmls_custom_categories');
    if (raw) {
      const customCats = JSON.parse(raw);
      const found = customCats.find(c => c.id === cat || c.name.toLowerCase() === cat.toLowerCase());
      if (found) return found.emoji || '🏷️';
    }
  } catch (e) {
    console.error('Error getting custom category emoji:', e);
  }
  
  return '🏷️';
}

function formatEstimate(mins) {
  if (mins < 60)  return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function urgencyColor(score) {
  if (score >= 80) return 'linear-gradient(90deg, #ef4444, #dc2626)';
  if (score >= 55) return 'linear-gradient(90deg, #f59e0b, #d97706)';
  if (score >= 30) return 'linear-gradient(90deg, #7c3aed, #5b21b6)';
  return 'linear-gradient(90deg, #475569, #334155)';
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════
// DEMO / SEED DATA
// ═══════════════════════════════════════════════════

function seedDemoTasks() {
  const now = new Date();
  const userName = (typeof AppState !== 'undefined' && AppState.settings && AppState.settings.userName) ? AppState.settings.userName : 'there';
  const workStyle = (typeof AppState !== 'undefined' && AppState.settings && AppState.settings.workStyle) ? AppState.settings.workStyle : 'focused';

  const demos = [
    {
      title: workStyle === 'sprint' ? 'Submit project proposal — Sprint 1' : 'Submit project proposal',
      description: `Final draft for ${userName} needs stakeholder sign-off before submission.`,
      deadline: new Date(now.getTime() + 90 * 60 * 1000),   // 1.5h from now
      estimatedMin: workStyle === 'focused' ? 90 : workStyle === 'sprint' ? 25 : 45,
      priority: 'critical',
      category: 'work',
      tags: workStyle === 'sprint' ? ['sprint', 'proposal', 'urgent'] : ['project', 'proposal', 'urgent'],
      notes: 'Check formatting guidelines before submitting'
    },
    {
      title: 'Pay electricity bill',
      description: 'Online payment via bank portal. Account: 4521-XX',
      deadline: new Date(now.getTime() + 4 * 3600 * 1000),  // 4h from now
      estimatedMin: 10,
      priority: 'high',
      category: 'finance',
      tags: ['bills'],
      notes: ''
    },
    {
      title: workStyle === 'focused' ? 'Deep review: PR #47 authentication' : 'Review pull request #47',
      description: `Code review for the authentication module changes by ${userName}.`,
      deadline: new Date(now.getTime() + 2 * 3600 * 1000),  // 2h from now
      estimatedMin: workStyle === 'focused' ? 60 : workStyle === 'sprint' ? 20 : 30,
      priority: 'high',
      category: 'work',
      tags: ['code-review'],
      notes: ''
    },
    {
      title: 'Gym session — legs day',
      description: 'Squats, lunges, leg press. 45 min session.',
      deadline: new Date(now.getTime() + 6 * 3600 * 1000),  // 6h from now
      estimatedMin: 60,
      priority: 'medium',
      category: 'health',
      tags: ['fitness'],
      notes: ''
    },
    {
      title: workStyle === 'focused' ? 'Deep Reading: Chapter 5 — Deep Work' : 'Read Chapter 5 — Deep Work',
      description: 'Cal Newport — focus and deliberate practice concepts.',
      deadline: new Date(now.getTime() + 24 * 3600 * 1000), // tomorrow
      estimatedMin: workStyle === 'focused' ? 60 : workStyle === 'sprint' ? 25 : 40,
      priority: 'medium',
      category: 'education',
      tags: ['reading', 'self-improvement'],
      notes: ''
    },
    {
      title: workStyle === 'sprint' ? 'Sprint standup presentation' : 'Team standup presentation',
      description: `Present sprint progress for ${userName}'s modules to the entire team.`,
      deadline: new Date(now.getTime() + 3 * 24 * 3600 * 1000), // 3 days
      estimatedMin: 20,
      priority: 'high',
      category: 'work',
      tags: ['presentation'],
      notes: 'Prepare 5-slide deck'
    },
    {
      title: 'Buy birthday gift for Mom',
      description: 'Birthday is coming up. Check wishlist.',
      deadline: new Date(now.getTime() + 5 * 24 * 3600 * 1000),
      estimatedMin: 30,
      priority: 'medium',
      category: 'personal',
      tags: ['family'],
      notes: ''
    },
  ];

  demos.forEach(d => TaskStore.add(d));
}
