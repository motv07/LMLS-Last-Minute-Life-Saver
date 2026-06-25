/**
 * LMLS — Last-Minute Life Saver
 * app.js — Main application controller, view routing, state management,
 *          habits, focus timer, schedule, analytics, settings
 */

'use strict';

// ═══════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════

const AppState = {
  currentView:     'dashboard',
  currentFilter:   'all',
  currentSort:     'urgency',
  currentCategory: 'all',
  searchQuery:     '',
  focusTask:       null,
  timerMode:       'pomodoro',      // 'pomodoro' | 'short' | 'long'
  timerRunning:    false,
  timerSeconds:    25 * 60,
  timerTotal:      25 * 60,
  pomodoroCount:   0,
  sessionsToday:   0,
  scheduleDate:    new Date(),
  scheduleBlocks:  [],
  habits:          [],
  settings: {
    geminiApiKey:    '',
    geminiModel:     'auto',
    userName:        'User',
    workStart:       '09:00',
    workEnd:         '18:00',
    crisisMode:      true,
    voiceResponse:   false,
    autoPriority:    true,
  },
  crisisShown:     new Set(),
  lastReprioritize: 0,
  chatHistory:     [], // Multi-turn conversation history [{role, text}]
  weeklyGoal:      '',
  tasksViewMode:   'list', // 'list' | 'kanban'
  agentLog:        [], // Agent activity log entries
};

// ═══════════════════════════════════════════════════
// AUTH GUARD
// ═══════════════════════════════════════════════════
(function checkAuth() {
  if (localStorage.getItem('lmls_auth_completed') !== 'true') {
    window.location.replace('./auth.html');
  }
})();

// ═══════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch(err => console.error('[PWA] Service Worker registration failed:', err));
    });
  }

  loadSettings();
  AppState.weeklyGoal = localStorage.getItem('lmls_weekly_goal') || '';
  AppState.chatHistory = JSON.parse(localStorage.getItem('lmls_chat_history') || '[]');

  // Load demo data if flagged from auth page
  if (localStorage.getItem('lmls_load_demo') === 'true') {
    localStorage.removeItem('lmls_load_demo');
    setTimeout(() => { seedDemoData(); }, 200);
  }

  if (typeof Gamification !== 'undefined') {
    Gamification.load();
    Gamification.updateXPUI();
  }

  initTheme();
  TaskStore.load();
  loadHabits();
  loadSessionsToday();
  if (typeof CalendarClient !== 'undefined') CalendarClient.init();

  initClock();
  initUI();
  refreshAll();
  setTasksViewMode(AppState.tasksViewMode);
  startClockTick();
  startUrgencyLoop();
  initSchedule();
  initVoice();
  updateUserAvatar();
  initShortcuts();
  if (typeof initCarousel === 'function') initCarousel();
  if (typeof updateNetworkStatus === 'function') updateNetworkStatus();
  updateActiveModelBadge();
  initCustomSelects();

  if (typeof AgentSystem !== 'undefined') AgentSystem.init();

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state?.view) navigateTo(e.state.view, false);
  });

  // Fade out splash screen
  const splash = document.getElementById('splash-screen');
  if (splash) {
    setTimeout(() => {
      splash.classList.add('splash-fade-out');
      setTimeout(() => splash.remove(), 600);
    }, 500);
  }

  logAgentAction('system', '🚀 LMLS initialized — Agent ready');
  console.log('🚀 LMLS App initialized');
});

/**
 * Replaces native select.select-mini and select.form-select elements with custom glassmorphic dropdowns.
 * Keep the native select hidden but in sync to preserve all existing event handlers.
 */
function initCustomSelects() {
  document.querySelectorAll('select.select-mini, select.form-select').forEach(select => {
    let container = select.nextElementSibling;
    let trigger, triggerVal, menu;
    
    // Check if container already exists (useful for dynamic repopulation)
    if (container && container.classList.contains('custom-select-container')) {
      trigger = container.querySelector('.custom-select-trigger');
      triggerVal = container.querySelector('.custom-select-val');
      menu = container.querySelector('.custom-select-menu');
      menu.innerHTML = '';
    } else {
      // Hide the native select
      select.style.display = 'none';
      
      // Create wrapper container
      container = document.createElement('div');
      container.className = 'custom-select-container';
      
      // Create custom trigger button
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      
      triggerVal = document.createElement('span');
      triggerVal.className = 'custom-select-val';
      
      // SVG Chevron-down
      const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('class', 'chevron-icon');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('fill', 'none');
      chevron.setAttribute('stroke', 'currentColor');
      chevron.setAttribute('stroke-width', '2.5');
      chevron.setAttribute('stroke-linecap', 'round');
      chevron.setAttribute('stroke-linejoin', 'round');
      chevron.innerHTML = '<polyline points="6 9 12 15 18 9"></polyline>';
      
      trigger.appendChild(triggerVal);
      trigger.appendChild(chevron);
      container.appendChild(trigger);
      
      // Create options menu dropdown
      menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      container.appendChild(menu);
      
      // Insert container in the DOM right after the hidden select
      select.parentNode.insertBefore(container, select.nextSibling);
      
      // Toggle dropdown menu open/closed state on click
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        
        // Close all other custom select menus first
        document.querySelectorAll('.custom-select-menu').forEach(m => {
          if (m !== menu) m.classList.remove('open');
        });
        document.querySelectorAll('.custom-select-trigger').forEach(t => {
          if (t !== trigger) t.classList.remove('open');
        });
        
        menu.classList.toggle('open');
        trigger.classList.toggle('open');
      });

      // Intercept value property descriptor to sync custom select trigger automatically on programmatic changes
      if (!select._valuePropOverridden) {
        select._valuePropOverridden = true;
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
          get() {
            return descriptor.get.call(this);
          },
          set(val) {
            descriptor.set.call(this, val);
            // Sync custom trigger and selections
            const opt = Array.from(this.options).find(o => o.value === val);
            if (opt && triggerVal) {
              triggerVal.innerHTML = opt.innerHTML;
            }
            container.querySelectorAll('.custom-select-option').forEach(o => {
              o.classList.toggle('selected', o.dataset.value === val);
            });
          }
        });
      }
    }
    
    // Set trigger label to reflect selected option
    const activeOption = select.options[select.selectedIndex] || select.options[0];
    triggerVal.innerHTML = activeOption ? activeOption.innerHTML : '';
    
    // Build options inside custom menu
    Array.from(select.options).forEach((opt, idx) => {
      const optionEl = document.createElement('div');
      optionEl.className = 'custom-select-option';
      if (idx === select.selectedIndex) optionEl.classList.add('selected');
      optionEl.innerHTML = opt.innerHTML;
      optionEl.dataset.value = opt.value;
      
      optionEl.addEventListener('click', (e) => {
        e.stopPropagation();
        
        container.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        optionEl.classList.add('selected');
        
        triggerVal.innerHTML = opt.innerHTML;
        select.value = opt.value;
        select.dispatchEvent(new Event('change'));
        
        menu.classList.remove('open');
        trigger.classList.remove('open');
      });
      
      menu.appendChild(optionEl);
    });
  });
  
  // Close all custom dropdowns when clicking anywhere outside
  if (!window.customSelectGlobalListenerAdded) {
    window.customSelectGlobalListenerAdded = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-menu').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.custom-select-trigger').forEach(t => t.classList.remove('open'));
    });
  }
}

function initUI() {
  // Set today's date label
  const today = new Date();
  const el = document.getElementById('today-date-label');
  if (el) el.textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Settings form from state
  const apiInput = document.getElementById('api-key-input');
  if (apiInput) apiInput.value = AppState.settings.geminiApiKey || '';

  const modelSelect = document.getElementById('gemini-model-select');
  if (modelSelect) modelSelect.value = AppState.settings.geminiModel || 'auto';

  const nameInput = document.getElementById('user-name-input');
  if (nameInput) nameInput.value = AppState.settings.userName || '';

  const startInput = document.getElementById('work-start-input');
  if (startInput) startInput.value = AppState.settings.workStart;

  const endInput = document.getElementById('work-end-input');
  if (endInput) endInput.value = AppState.settings.workEnd;

  const crisisToggle = document.getElementById('toggle-crisis');
  if (crisisToggle) crisisToggle.checked = AppState.settings.crisisMode;

  const voiceToggle = document.getElementById('toggle-voice-response');
  if (voiceToggle) voiceToggle.checked = AppState.settings.voiceResponse;

  const autoToggle = document.getElementById('toggle-auto-priority');
  if (autoToggle) autoToggle.checked = AppState.settings.autoPriority;

  // Emoji picker for modal emoji grids (scoped to prevent selection leaks)
  document.querySelectorAll('.emoji-picker').forEach(picker => {
    picker.querySelectorAll('.emoji-option').forEach(el => {
      el.addEventListener('click', () => {
        picker.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  });

  // Populate dynamic category selects
  if (typeof populateCategoryDropdowns === 'function') {
    populateCategoryDropdowns();
  }

  // Populate read-only account email
  const emailInput = document.getElementById('user-email-input');
  if (emailInput) {
    emailInput.value = localStorage.getItem('lmls_current_user') || 'default';
  }

  // Topbar subtitle greeting
  updateGreeting();
}

function updateGreeting() {
  const h = new Date().getHours();
  const name = AppState.settings.userName || 'there';
  let greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const subtitleEl = document.getElementById('page-subtitle');
  if (subtitleEl && AppState.currentView === 'dashboard') {
    const tasks = TaskStore.getAll();
    const stats = computeStats(tasks);
    if (stats.overdue > 0) {
      subtitleEl.textContent = `⚠️ You have ${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''}. Let's tackle them!`;
      subtitleEl.style.color = 'var(--danger)';
    } else if (stats.dueToday > 0) {
      subtitleEl.textContent = `${greet}, ${name}! ${stats.dueToday} task${stats.dueToday > 1 ? 's' : ''} due today.`;
      subtitleEl.style.color = '';
    } else {
      subtitleEl.textContent = `${greet}, ${name}! You're all caught up. 🎉`;
      subtitleEl.style.color = 'var(--success)';
    }
  }
}

function updateUserAvatar() {
  const name = AppState.settings.userName || 'U';
  const initial = name.charAt(0).toUpperCase();
  const av = document.getElementById('user-avatar-mini');
  const nm = document.getElementById('user-name-mini');
  if (av) av.textContent = initial;
  if (nm) nm.textContent = name;
}

// ═══════════════════════════════════════════════════
// VIEW ROUTING
// ═══════════════════════════════════════════════════

const PAGE_META = {
  dashboard: { title: 'Dashboard',  subtitle: '' },
  tasks:     { title: 'My Tasks',   subtitle: 'Manage and prioritize your tasks' },
  ai:        { title: 'AI Agent',   subtitle: 'Your intelligent productivity companion' },
  schedule:  { title: 'Schedule',   subtitle: 'Plan your day hour by hour' },
  habits:    { title: 'Habits',     subtitle: 'Build consistency, build success' },
  focus:     { title: 'Focus Mode', subtitle: 'Deep work with Pomodoro timer' },
  analytics: { title: 'Analytics',  subtitle: 'Track your productivity trends' },
  calendar:  { title: 'Calendar',   subtitle: 'Monthly overview of your scheduled events' },
  settings:  { title: 'Settings',   subtitle: 'Configure your LMLS experience' },
};

function navigateTo(view, pushState = true) {
  // Deactivate all views, nav items, and mobile nav items
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

  // Activate target
  const viewEl = document.getElementById(`view-${view}`);
  const navEl  = document.getElementById(`nav-${view}`);
  const mobileNavEl = document.getElementById(`mobile-nav-${view}`);
  if (viewEl) viewEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');
  if (mobileNavEl) mobileNavEl.classList.add('active');

  AppState.currentView = view;

  // Update page title
  const meta = PAGE_META[view] || { title: view, subtitle: '' };
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;

  if (view === 'dashboard') updateGreeting();

  // Push to history
  if (pushState) {
    history.pushState({ view }, '', `#${view}`);
  }

  // View-specific refresh
  switch (view) {
    case 'dashboard':  renderDashboard(); break;
    case 'tasks':      renderTasksView(); break;
    case 'ai':         renderAIContext(); break;
    case 'schedule':   renderSchedule(); break;
    case 'habits':     renderHabits(); break;
    case 'focus':      renderFocusView(); break;
    case 'analytics':  renderAnalytics(); break;
    case 'calendar':   renderMonthlyCalendar(); break;
    case 'settings':   /* static */ break;
  }
}

function refreshAll() {
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
  if (AppState.currentView === 'schedule') renderSchedule();
  if (AppState.currentView === 'calendar') renderMonthlyCalendar();
}

// ═══════════════════════════════════════════════════
// DASHBOARD RENDERING
// ═══════════════════════════════════════════════════

function renderDashboard() {
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);

  // Stats cards
  animateNumber('stat-total', stats.total);
  animateNumber('stat-urgent', stats.dueToday);
  animateNumber('stat-completed', stats.completed);
  animateNumber('stat-score', stats.productivityScore);

  // Completion ring
  const ring = document.getElementById('completion-ring');
  if (ring) {
    const pct = stats.completionRate;
    ring.setAttribute('stroke-dasharray', `${pct},100`);
  }

  // Priority Queue
  renderPriorityQueue(tasks);

  // Timeline (today's tasks)
  renderTimeline(tasks);

  // Habits mini
  renderHabitsMini();

  // AI Briefing card
  renderAIBriefing();

  // Update manual calendar events card
  if (typeof CalendarClient !== 'undefined' && typeof CalendarClient._updateDashboardCard === 'function') {
    CalendarClient._updateDashboardCard();
  }
}

function renderPriorityQueue(tasks) {
  const list = document.getElementById('priority-queue-list');
  if (!list) return;

  const pending = tasks.filter(t => t.status !== 'completed' && !t.isHeading);
  const sorted  = sortTasksArray(pending, 'urgency').slice(0, 8);

  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state-mini">
        <span>✅ All clear! No pending tasks.</span>
        <button class="btn btn-primary btn-sm" onclick="openAddTaskModal()">+ Add Task</button>
      </div>`;
    return;
  }

  list.innerHTML = sorted.map(t => renderTaskMiniCard(t)).join('');
}

function renderTimeline(tasks) {
  const list = document.getElementById('timeline-list');
  if (!list) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(todayStart.getTime() + 86400000);

  const todayTasks = tasks.filter(t =>
    t.status !== 'completed' && t.deadline && t.deadline >= todayStart && t.deadline < todayEnd
  ).sort((a, b) => a.deadline - b.deadline);

  if (todayTasks.length === 0) {
    list.innerHTML = `<div class="timeline-empty">🗓️ No tasks due today</div>`;
    return;
  }

  list.innerHTML = todayTasks.map(t => {
    const time = t.deadline.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="timeline-item" onclick="openEditTask('${t.id}')">
        <span class="timeline-time">${time}</span>
        <span style="flex:1; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(t.title)}</span>
        <span class="task-priority-badge priority-${t.priority}" style="font-size:9px">${t.priority}</span>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════
// TASKS VIEW RENDERING
// ═══════════════════════════════════════════════════

function renderTasksView() {
  let tasks = TaskStore.getAll();
  tasks = filterTasksByStatus(tasks, AppState.currentFilter);
  tasks = filterTasksByCategory(tasks, AppState.currentCategory);
  tasks = searchTasksByText(tasks, AppState.searchQuery);
  tasks = sortTasksArray(tasks, AppState.currentSort);

  if (AppState.tasksViewMode === 'kanban') {
    renderKanbanBoard(tasks);
    return;
  }

  const grid = document.getElementById('task-grid');
  const empty = document.getElementById('tasks-empty');
  if (!grid) return;

  // Remove old cards but keep empty state
  const oldCards = grid.querySelectorAll('.task-card');
  oldCards.forEach(c => c.remove());

  if (tasks.length === 0) {
    if (empty) empty.style.display = 'flex';
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.insertAdjacentHTML('beforeend', tasks.map(renderTaskCard).join(''));

  initSwipeActions();
}

// ═══════════════════════════════════════════════════
// TASK CRUD OPERATIONS (called from HTML)
// ═══════════════════════════════════════════════════

function openAddTaskModal() {
  document.getElementById('modal-task-title').textContent = 'Add New Task';
  document.getElementById('save-task-btn').textContent = 'Save Task';
  document.getElementById('task-edit-id').value = '';
  clearTaskForm();

  // If a category filter is active, default the new task to that category
  if (AppState.currentCategory && AppState.currentCategory !== 'all') {
    const catInput = document.getElementById('task-category-input');
    if (catInput) catInput.value = AppState.currentCategory;
  }
  
  if (typeof populateDependencyDropdown === 'function') {
    populateDependencyDropdown(null);
  }

  // Default deadline to today + 1 hour
  const def = new Date();
  def.setHours(def.getHours() + 1, 0, 0, 0);
  document.getElementById('task-deadline-input').value = toDatetimeLocal(def);

  showModal('modal-task');
}

function openEditTask(id) {
  const task = TaskStore.getById(id);
  if (!task) return;

  document.getElementById('modal-task-title').textContent = 'Edit Task';
  document.getElementById('save-task-btn').textContent = 'Update Task';
  document.getElementById('task-edit-id').value = id;

  document.getElementById('task-title-input').value        = task.title;
  document.getElementById('task-description-input').value  = task.description;
  document.getElementById('task-deadline-input').value     = task.deadline ? toDatetimeLocal(task.deadline) : '';
  document.getElementById('task-estimate-input').value     = task.estimatedMin || '';
  document.getElementById('task-priority-input').value     = task.priority;
  document.getElementById('task-category-input').value     = task.category;
  document.getElementById('task-tags-input').value         = task.tags.join(', ');
  document.getElementById('task-notes-input').value        = task.notes;

  if (typeof populateDependencyDropdown === 'function') {
    populateDependencyDropdown(id);
    document.getElementById('task-depends-input').value = task.dependsOn || '';
  }

  showModal('modal-task');
}

function saveTask() {
  const title = document.getElementById('task-title-input').value.trim();
  if (!title) { showToast('Task title is required!', 'error'); return; }

  const deadline = document.getElementById('task-deadline-input').value;
  if (!deadline) { showToast('Please set a deadline!', 'error'); return; }

  const data = {
    title,
    description:  document.getElementById('task-description-input').value,
    deadline,
    estimatedMin: document.getElementById('task-estimate-input').value,
    priority:     document.getElementById('task-priority-input').value,
    category:     document.getElementById('task-category-input').value,
    tags:         document.getElementById('task-tags-input').value,
    notes:        document.getElementById('task-notes-input').value,
    dependsOn:    document.getElementById('task-depends-input')?.value || '', // Day 4.2
  };

  const editId = document.getElementById('task-edit-id').value;
  if (editId) {
    TaskStore.update(editId, data);
    showToast('Task updated!', 'success');
  } else {
    const newTask = TaskStore.add(data);
    showToast('Task added! 🎯', 'success');
    if (typeof earnXP === 'function') {
      earnXP(15, 'Created a task');
    }
    if (typeof Gamification !== 'undefined') {
      Gamification.checkPlannerBadges();
    }
  }

  closeModal();
  refreshAll();
  if (AppState.currentView === 'tasks') renderTasksView();
}

function toggleTaskComplete(id) {
  const task = TaskStore.getById(id);
  if (!task) return;
  
  if (typeof UndoStack !== 'undefined') {
    UndoStack.push({ type: 'complete', taskId: id });
  }

  const updatedTask = TaskStore.complete(id);
  if (!updatedTask) return;

  if (updatedTask.status === 'completed') {
    showToast(`✅ "${updatedTask.title}" completed!`, 'success');
    
    if (typeof earnXP === 'function') {
      earnXP(50, `Completed task: ${updatedTask.title}`);
    }
    
    if (typeof Gamification !== 'undefined') {
      Gamification.checkTaskBadges(updatedTask);
    }
    
    // Celebrate animation
    const btn = document.querySelector(`#task-card-${id} .task-check-btn, .task-mini-check-btn[onclick*="${id}"]`);
    if (btn) {
      btn.classList.add('celebrate');
      setTimeout(() => btn.classList.remove('celebrate'), 600);

      // Spawn completion particles
      if (window.LMLS_Animations) {
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        window.LMLS_Animations.createCompletionParticles(x, y);
      }
    }
  }

  refreshAll();
  if (AppState.currentView === 'tasks') renderTasksView();
}

function deleteTask(id) {
  const task = TaskStore.getById(id);
  if (!task) return;
  const isHeading = !!task.isHeading;
  if (!confirm(`Delete ${isHeading ? 'heading' : 'task'} "${task.title}"?`)) return;

  if (typeof UndoStack !== 'undefined') {
    UndoStack.push({ type: 'delete', task: { ...task } });
  }

  TaskStore.remove(id);
  showToast(`${isHeading ? 'Heading' : 'Task'} deleted. <button class="btn btn-ghost btn-sm" style="color:var(--primary-light); padding:2px 6px; margin-left:8px; border:1px solid rgba(255,255,255,0.2)" onclick="UndoStack.undo(); event.stopPropagation();">Undo</button>`, 'info');
  refreshAll();
  if (AppState.currentView === 'tasks') renderTasksView();
}

// ═══════════════════════════════════════════════════
// TASK FILTERS / SORT (called from HTML)
// ═══════════════════════════════════════════════════

function filterTasks(status, btn) {
  AppState.currentFilter = status;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderTasksView();
}

function sortTasks(by) {
  AppState.currentSort = by;
  renderTasksView();
}

function filterByCategory(cat) {
  AppState.currentCategory = cat;
  renderTasksView();
}

let searchDebounceTimeout = null;
function searchTasks(query) {
  clearTimeout(searchDebounceTimeout);
  searchDebounceTimeout = setTimeout(() => {
    AppState.searchQuery = query;
    renderTasksView();
  }, 250);
}

// ═══════════════════════════════════════════════════
// MODAL MANAGEMENT
// ═══════════════════════════════════════════════════

function showModal(id) {
  window.modalOpenedAt = Date.now();
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (Date.now() - (window.modalOpenedAt || 0) < 300) {
    return;
  }

  // If the briefing modal is active, call its custom close function to tear down voice playback
  const briefing = document.getElementById('modal-briefing');
  if (briefing && !briefing.classList.contains('hidden')) {
    if (typeof closeBriefingModal === 'function') {
      closeBriefingModal();
      return;
    }
  }

  // If the snooze modal is active, call its custom close function
  const snooze = document.getElementById('modal-snooze');
  if (snooze && !snooze.classList.contains('hidden')) {
    if (typeof closeSnoozeModal === 'function') {
      closeSnoozeModal();
      return;
    }
  }

  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-task').classList.add('hidden');
  document.getElementById('modal-habit').classList.add('hidden');
  const modalHeading = document.getElementById('modal-heading');
  if (modalHeading) modalHeading.classList.add('hidden');
  const modalCategory = document.getElementById('modal-category');
  if (modalCategory) modalCategory.classList.add('hidden');
  const modalFocusPick = document.getElementById('modal-focus-pick');
  if (modalFocusPick) modalFocusPick.classList.add('hidden');
  const modalAIResponse = document.getElementById('modal-ai-response');
  if (modalAIResponse) modalAIResponse.classList.add('hidden');
  document.body.style.overflow = '';
}

function clearTaskForm() {
  ['task-title-input','task-description-input','task-deadline-input',
   'task-estimate-input','task-tags-input','task-notes-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('task-priority-input').value = 'medium';
  document.getElementById('task-category-input').value = 'work';
  const dep = document.getElementById('task-depends-input');
  if (dep) dep.value = '';
}

// ═══════════════════════════════════════════════════
// CRISIS DETECTION
// ═══════════════════════════════════════════════════

function checkCrisis() {
  if (!AppState.settings.crisisMode) return;
  const tasks = TaskStore.getAll();
  const stats  = computeStats(tasks);

  for (const task of stats.crisisTasks) {
    if (AppState.crisisShown.has(task.id)) continue;
    const minsLeft = task.deadline ? (task.deadline - new Date()) / 60000 : Infinity;
    if (minsLeft <= 120 && minsLeft > 0) {
      showCrisisAlert(task, minsLeft);
      AppState.crisisShown.add(task.id);
      break; // Show one at a time
    }
  }
}

function showCrisisAlert(task, minsLeft) {
  const overlay = document.getElementById('crisis-overlay');
  document.getElementById('crisis-task-name').textContent = task.title;
  document.getElementById('crisis-time-left').textContent = `${Math.round(minsLeft)}m left`;
  document.getElementById('crisis-plan-content').innerHTML =
    '<div class="thinking-dots"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>';

  overlay.classList.remove('hidden');

  if (!GeminiClient.isConfigured()) {
    // Fallback to local
    const plan = generateLocalCrisisPlan(task, minsLeft);
    setTimeout(() => {
      document.getElementById('crisis-plan-content').innerHTML = plan;
    }, 1000);
    return;
  }

  // Streaming Gemini crisis plan
  let accumulatedText = '';
  GeminiClient.generateCrisisPlan(
    task,
    minsLeft,
    (chunk) => {
      accumulatedText += chunk;
      document.getElementById('crisis-plan-content').innerHTML = parseMarkdown(accumulatedText);
    },
    () => {
      document.getElementById('crisis-plan-content').innerHTML = parseMarkdown(accumulatedText);
    },
    (err) => {
      console.error("Crisis AI plan failed:", err);
      document.getElementById('crisis-plan-content').innerHTML = generateLocalCrisisPlan(task, minsLeft);
    }
  );
}

function generateLocalCrisisPlan(task, minsLeft) {
  const est = task.estimatedMin || Math.round(minsLeft * 0.8);
  const buffer = Math.max(5, Math.round(minsLeft - est));
  return `
    <strong>⚡ Immediate Action Plan:</strong><br>
    1. Close all distractions — phone, social media, notifications<br>
    2. Start NOW — you have ~${Math.round(minsLeft)} minutes<br>
    3. Focus for ${Math.min(est, Math.round(minsLeft * 0.85))} minutes on the core deliverable<br>
    4. Reserve ${buffer} minutes for review/submission<br>
    <br><em>💡 Tip: Perfect is the enemy of done. Ship it!</em>
  `;
}

function dismissCrisis() {
  document.getElementById('crisis-overlay').classList.add('hidden');
}

function crisisStartFocus() {
  dismissCrisis();
  navigateTo('focus');
  showToast('Focus mode activated! You got this! 💪', 'success');
}

// ═══════════════════════════════════════════════════
// URGENCY INDICATOR (sidebar stress bar)
// ═══════════════════════════════════════════════════

function updateUrgencyIndicator() {
  const tasks = TaskStore.getAll();
  const pending = tasks.filter(t => t.status !== 'completed');
  if (pending.length === 0) {
    setUrgencyDisplay(0, 'Calm');
    return;
  }

  const avgScore = pending.reduce((s, t) => s + t.urgencyScore, 0) / pending.length;
  const maxScore = Math.max(...pending.map(t => t.urgencyScore));
  const displayScore = Math.round(avgScore * 0.4 + maxScore * 0.6);

  let label = 'Calm';
  let pos = 0;
  if (displayScore >= 80)      { label = 'CRISIS 🚨'; pos = 95; }
  else if (displayScore >= 60) { label = 'High 🔥';   pos = 70; }
  else if (displayScore >= 40) { label = 'Medium 🟡'; pos = 45; }
  else if (displayScore >= 20) { label = 'Mild 🟢';   pos = 25; }
  else                         { label = 'Calm ✨';   pos = 8; }

  setUrgencyDisplay(pos, label);
}

function setUrgencyDisplay(pct, label) {
  const fill = document.getElementById('urgency-fill');
  const lbl  = document.getElementById('urgency-label-val');
  if (fill) {
    fill.style.width = `${pct}%`;
    fill.style.backgroundPosition = `${pct}% 0`;
  }
  if (lbl) lbl.textContent = label;
}

// ═══════════════════════════════════════════════════
// BADGES
// ═══════════════════════════════════════════════════

function updateBadges() {
  const tasks = TaskStore.getAll();
  const pending = tasks.filter(t => t.status !== 'completed');
  const overdue = tasks.filter(t => t.status === 'overdue' || (t.status !== 'completed' && t.deadline && t.deadline < new Date()));

  setBadge('badge-dashboard', overdue.length);
  setBadge('badge-tasks', pending.length);

  const habits = AppState.habits;
  const today = todayKey();
  const incomplete = habits.filter(h => !h.completions?.[today]);
  setBadge('badge-habits', incomplete.length);
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  const mobEl = document.getElementById(`mobile-${id}`);
  if (el) {
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : count;
      el.style.display = 'block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  }
  if (mobEl) {
    if (count > 0) {
      mobEl.textContent = count > 99 ? '99+' : count;
      mobEl.style.display = 'block';
    } else {
      mobEl.textContent = '';
      mobEl.style.display = 'none';
    }
  }
}

// ═══════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════

function initClock() {
  updateClock();
}

function updateClock() {
  const now = new Date();
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function startClockTick() {
  setInterval(() => {
    updateClock();
    // Update deadlines every minute
    if (new Date().getSeconds() === 0) {
      refreshAll();
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════
// URGENCY LOOP (auto re-prioritize every 30 min)
// ═══════════════════════════════════════════════════

function startUrgencyLoop() {
  setInterval(() => {
    TaskStore.recomputeAllUrgency();
    checkCrisis();
    updateUrgencyIndicator();
    updateBadges();

    const now = Date.now();
    if (AppState.settings.autoPriority && now - AppState.lastReprioritize > 30 * 60 * 1000) {
      AppState.lastReprioritize = now;
      if (AppState.currentView === 'tasks') renderTasksView();
      if (AppState.currentView === 'dashboard') renderDashboard();
    }
  }, 30000); // every 30 seconds (recompute urgency; full reprioritize every 30 min)

  // Check crisis on startup after 2s
  setTimeout(checkCrisis, 2000);
}

// ═══════════════════════════════════════════════════
// HABITS
// ═══════════════════════════════════════════════════

const HABITS_KEY = 'lmls_habits';

function loadHabits() {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    AppState.habits = raw ? JSON.parse(raw) : [];

    // Self-heal streaks dynamically from completion logs
    let modified = false;
    AppState.habits.forEach(h => {
      const calculatedStreak = typeof computeStreak === 'function' ? computeStreak(h) : h.streak;
      const calculatedBestStreak = typeof calculateBestStreak === 'function' ? calculateBestStreak(h) : h.bestStreak;
      if (h.streak !== calculatedStreak || h.bestStreak !== calculatedBestStreak) {
        h.streak = calculatedStreak;
        h.bestStreak = calculatedBestStreak;
        modified = true;
      }
    });
    if (modified) {
      saveHabitsData();
    }
  } catch (err) {
    console.error("Error loading habits:", err);
    AppState.habits = [];
  }
}

function saveHabitsData() {
  localStorage.setItem(HABITS_KEY, JSON.stringify(AppState.habits));
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}

function openAddHabitModal() {
  document.getElementById('habit-name-input').value = '';
  document.getElementById('habit-frequency-input').value = 'daily';
  document.getElementById('habit-goal-input').value = '1';
  document.querySelectorAll('.emoji-option').forEach((e, i) => {
    e.classList.toggle('selected', i === 0);
  });
  showModal('modal-habit');
}

function closeHabitModal() {
  closeModal();
}

function saveHabit() {
  const name = document.getElementById('habit-name-input').value.trim();
  if (!name) { showToast('Habit name required!', 'error'); return; }

  const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '🎯';
  const freq  = document.getElementById('habit-frequency-input').value;
  const goal  = parseInt(document.getElementById('habit-goal-input').value, 10) || 1;

  AppState.habits.push({
    id:          crypto.randomUUID(),
    name,
    emoji,
    frequency:   freq,
    goal,
    streak:      0,
    bestStreak:  0,
    completions: {},
    createdAt:   new Date().toISOString(),
  });

  saveHabitsData();
  closeHabitModal();
  showToast(`Habit "${name}" added! 🔥`, 'success');
  renderHabits();
  renderHabitsMini();
  updateBadges();
}

// Habit actions and rendering are delegated to scripts/habits.js

function renderHabitsMini() {
  const list = document.getElementById('habits-mini-list');
  if (!list) return;

  const habits = AppState.habits;
  const today  = todayKey();

  if (habits.length === 0) {
    list.innerHTML = `
      <div class="empty-state-mini">
        <span>No habits tracked yet.</span>
        <button class="btn btn-ghost btn-sm" onclick="navigateTo('habits')">+ Add Habit</button>
      </div>`;
    return;
  }

  list.innerHTML = habits.slice(0, 4).map(habit => {
    const isDone = !!habit.completions[today];
    return `
      <div class="habit-mini-row">
        <span class="habit-mini-emoji">${habit.emoji}</span>
        <div class="habit-mini-info">
          <div class="habit-mini-name">${escapeHtml(habit.name)}</div>
          <div class="habit-mini-streak">🔥 ${habit.streak || 0} day streak</div>
        </div>
        <button class="habit-mini-check ${isDone ? 'done' : ''}" onclick="toggleHabit('${habit.id}')" aria-label="Complete habit">
          ${isDone ? '✓' : ''}
        </button>
      </div>`;
  }).join('');
}

// Heatmap rendering is delegated to scripts/habits.js

// ═══════════════════════════════════════════════════
// FOCUS / POMODORO TIMER
// ═══════════════════════════════════════════════════

const TIMER_MODES = {
  pomodoro: { seconds: 25 * 60, label: 'Focus Session' },
  short:    { seconds:  5 * 60, label: 'Short Break' },
  long:     { seconds: 15 * 60, label: 'Long Break' },
};

let timerInterval = null;

function loadSessionsToday() {
  const key = `lmls_sessions_${todayKey()}`;
  AppState.sessionsToday = parseInt(localStorage.getItem(key) || '0', 10);
}

function saveSessionsToday() {
  const key = `lmls_sessions_${todayKey()}`;
  localStorage.setItem(key, AppState.sessionsToday);
}

function setTimerMode(mode, btn) {
  clearTimerInterval();
  AppState.timerMode    = mode;
  AppState.timerRunning = false;
  const cfg = TIMER_MODES[mode];
  AppState.timerSeconds = cfg.seconds;
  AppState.timerTotal   = cfg.seconds;

  document.querySelectorAll('.timer-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  updateTimerDisplay();
  updateTimerBtn(false);
  document.getElementById('timer-label').textContent = cfg.label;
}

function toggleTimer() {
  if (AppState.timerRunning) {
    pauseTimer();
  } else {
    startTimerTick();
  }
}

function startTimerTick() {
  AppState.timerRunning = true;
  updateTimerBtn(true);
  timerInterval = setInterval(() => {
    AppState.timerSeconds--;
    updateTimerDisplay();
    if (AppState.timerSeconds <= 0) {
      timerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  AppState.timerRunning = false;
  clearTimerInterval();
  updateTimerBtn(false);
}

function resetTimer() {
  clearTimerInterval();
  AppState.timerRunning = false;
  AppState.timerSeconds = AppState.timerTotal;
  updateTimerDisplay();
  updateTimerBtn(false);
}

function skipTimer() {
  clearTimerInterval();
  timerComplete();
}

function timerComplete() {
  AppState.timerRunning = false;
  clearTimerInterval();

  if (AppState.timerMode === 'pomodoro') {
    AppState.sessionsToday++;
    AppState.pomodoroCount++;
    saveSessionsToday();

    // Increment sessionsDone on the focused task
    if (AppState.focusTask) {
      const currentSessions = AppState.focusTask.sessionsDone || 0;
      TaskStore.update(AppState.focusTask.id, { sessionsDone: currentSessions + 1 });
      AppState.focusTask = TaskStore.getById(AppState.focusTask.id);
      renderFocusTaskDisplay();
      logAgentAction('focus', `⏱️ Focus session #${currentSessions + 1} complete for "${AppState.focusTask?.title?.slice(0,28) || 'task'}"`);
    }

    // Log focus session history
    const focusHistory = JSON.parse(localStorage.getItem('lmls_focus_history') || '[]');
    focusHistory.push({
      taskId: AppState.focusTask ? AppState.focusTask.id : null,
      taskTitle: AppState.focusTask ? AppState.focusTask.title : 'General Focus',
      timestamp: new Date().toISOString(),
      durationMin: 25
    });
    localStorage.setItem('lmls_focus_history', JSON.stringify(focusHistory));

    if (typeof earnXP === 'function') {
      earnXP(30, 'Completed focus session ⏱️');
    }
    if (typeof Gamification !== 'undefined') {
      Gamification.checkFocusBadges(focusHistory.length);
    }

    showToast('🎉 Pomodoro complete! Take a break.', 'success');
    document.getElementById('sessions-today-count').textContent = AppState.sessionsToday;

    // Update dots
    const dots = document.querySelectorAll('.pomo-dot');
    dots.forEach((d, i) => {
      if (i < AppState.pomodoroCount % 4) d.classList.add('done');
      else d.classList.remove('done');
    });
    document.getElementById('pomodoro-count-text').textContent =
      `Session ${(AppState.pomodoroCount % 4) + 1} of 4`;

    // Auto-switch to short break
    if (AppState.pomodoroCount % 4 === 0) {
      setTimerMode('long', document.getElementById('tab-long'));
    } else {
      setTimerMode('short', document.getElementById('tab-short'));
    }
  } else {
    showToast('Break over! Back to work 💪', 'info');
    setTimerMode('pomodoro', document.getElementById('tab-pomodoro'));
  }
}

function clearTimerInterval() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function updateTimerDisplay() {
  const mins = Math.floor(AppState.timerSeconds / 60);
  const secs = AppState.timerSeconds % 60;
  const disp = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = disp;
  document.title = AppState.timerRunning ? `${disp} — LMLS` : 'LMLS — Last-Minute Life Saver';

  // Update ring
  const ring = document.getElementById('timer-progress-ring');
  if (ring) {
    const circumference = 553;
    const progress = AppState.timerSeconds / AppState.timerTotal;
    const offset = circumference * (1 - progress);
    ring.style.strokeDashoffset = offset;
  }
}

function updateTimerBtn(running) {
  const btn  = document.getElementById('timer-btn');
  const icon = document.getElementById('timer-play-icon');
  const txt  = document.getElementById('timer-btn-text');
  if (!btn) return;
  if (running) {
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    txt.textContent = 'Pause';
  } else {
    icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    txt.textContent = AppState.timerSeconds < AppState.timerTotal ? 'Resume' : 'Start';
  }
}

function renderFocusView() {
  updateTimerDisplay();
  document.getElementById('sessions-today-count').textContent = AppState.sessionsToday;
  renderFocusTaskDisplay();
}

function setFocusTask(taskId) {
  AppState.focusTask = TaskStore.getById(taskId);
  navigateTo('focus');
  renderFocusTaskDisplay();
}

function renderFocusTaskDisplay() {
  const el = document.getElementById('focus-task-display');
  if (!el) return;
  const task = AppState.focusTask;
  if (!task) {
    el.innerHTML = `<div class="focus-task-empty"><p>No task selected</p><button class="btn btn-primary btn-sm" onclick="openFocusTaskPicker()">Pick a Task</button></div>`;
    return;
  }
  const dlInfo = getDeadlineLabel(task);
  el.innerHTML = `
    <div class="focus-task-selected">
      <div class="focus-task-title">${escapeHtml(task.title)}</div>
      <div class="focus-task-deadline">${dlInfo.text}</div>
    </div>`;
}

function openFocusTaskPicker() {
  const tasks = TaskStore.getAll().filter(t => t.status !== 'completed' && !t.isHeading);
  const sorted = sortTasksArray(tasks, 'urgency');
  const list = document.getElementById('focus-task-list');
  list.innerHTML = sorted.map(t => {
    const dlInfo = getDeadlineLabel(t);
    return `
      <div class="focus-pick-item" onclick="selectFocusTask('${t.id}')">
        <span style="font-size:20px">${getCategoryEmoji(t.category)}</span>
        <div style="flex:1">
          <div style="font-size:14px; font-weight:600">${escapeHtml(t.title)}</div>
          <div style="font-size:12px; color:var(--text-muted)">${dlInfo.text}</div>
        </div>
        <span class="task-priority-badge priority-${t.priority}">${t.priority}</span>
      </div>`;
  }).join('') || '<p style="color:var(--text-muted); text-align:center; padding:20px">No pending tasks</p>';

  showModal('modal-focus-pick');
}

function selectFocusTask(id) {
  AppState.focusTask = TaskStore.getById(id);
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-focus-pick').classList.add('hidden');
  renderFocusTaskDisplay();
}

function closeFocusPicker() {
  closeModal();
}

function getAIFocusSuggestion() {
  const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
  if (tasks.length === 0) {
    document.getElementById('ai-suggestion-text').textContent = 'No pending tasks! You\'re all caught up. 🎉';
    return;
  }
  const top = sortTasksArray(tasks, 'urgency')[0];
  document.getElementById('ai-suggestion-text').textContent =
    `Focus on "${top.title}" — it has the highest urgency score (${top.urgencyScore}/100). ${getDeadlineLabel(top).text}`;
  AppState.focusTask = top;
  renderFocusTaskDisplay();
}

// ═══════════════════════════════════════════════════
// SCHEDULE VIEW
// ═══════════════════════════════════════════════════

function initSchedule() {
  if (typeof Scheduler !== 'undefined' && Scheduler.init) {
    Scheduler.init();
  }
  renderSchedule();
}

function scheduleNavDay(delta) {
  AppState.scheduleDate = new Date(AppState.scheduleDate.getTime() + delta * 86400000);
  renderSchedule();
  if (typeof Scheduler !== 'undefined' && Scheduler.renderSidebar) {
    Scheduler.renderSidebar();
  }
}

function renderSchedule() {
  const date = AppState.scheduleDate;
  const label = document.getElementById('schedule-date-label');
  const now   = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (label) {
    label.textContent = isToday
      ? 'Today — ' + date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // Build time column (6am–11pm)
  const timeCol = document.getElementById('schedule-time-col');
  const blocksCol = document.getElementById('schedule-blocks-col');
  if (!timeCol || !blocksCol) return;

  const startHour = 6;
  const endHour   = 23;
  const totalHours = endHour - startHour + 1; // 18 hours of grid content

  timeCol.innerHTML = '';
  blocksCol.innerHTML = '';

  for (let h = startHour; h <= endHour; h++) {
    const lbl = document.createElement('div');
    lbl.className = 'schedule-hour-label';
    lbl.textContent = `${String(h).padStart(2, '0')}:00`;
    timeCol.appendChild(lbl);

    const row = document.createElement('div');
    row.className = 'schedule-hour-row';
    blocksCol.appendChild(row);
  }

  // Current time indicator
  if (isToday) {
    const h = now.getHours();
    const m = now.getMinutes();
    if (h >= startHour && h <= endHour) {
      const pos = ((h - startHour) + m/60) / totalHours * 100;
      const ind = document.createElement('div');
      ind.className = 'current-time-indicator';
      ind.style.top = `${pos}%`;
      blocksCol.appendChild(ind);
    }
  }

  // Detect conflicts
  const conflicts = typeof Scheduler !== 'undefined' ? Scheduler.detectConflicts(date) : new Set();
  if (typeof detectManualEventConflicts === 'function') {
    const allPending = TaskStore.getAll().filter(t => t.status !== 'completed');
    const manualConflicts = detectManualEventConflicts(allPending, date);
    manualConflicts.forEach(c => {
      conflicts.add(c.task.id);
    });
  }

  // Place task blocks
  const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
  tasks.forEach(task => {
    if (!task.deadline) return;
    const d = task.deadline;
    if (d.toDateString() !== date.toDateString()) return;
    const h = d.getHours();
    const m = d.getMinutes();
    if (h < startHour || h > endHour) return;

    const est = task.estimatedMin || 30;
    const startFrac = ((h - startHour) + m/60) / totalHours;
    const heightFrac = (est / 60) / totalHours;

    const block = document.createElement('div');
    const hasConflict = conflicts.has(task.id);
    block.className = 'schedule-block' + (hasConflict ? ' schedule-block--conflict' : '');
    block.style.top    = `${startFrac * 100}%`;
    block.style.height = `${Math.min(heightFrac * 100, 80)}%`;
    block.style.minHeight = '28px';
    block.innerHTML = `<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(task.title)} ${hasConflict ? '⚠️' : ''}</div><div style="font-size:10px;opacity:0.7">${formatEstimate(est)}</div>`;
    
    // Make scheduled blocks draggable on the grid as well for easy rescheduling
    block.draggable = true;
    block.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', task.id);
      block.classList.add('dragging');
    });
    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
    });

    block.onclick = () => openEditTask(task.id);
    blocksCol.appendChild(block);
  });

  // Place Google Calendar events
  if (typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
    const gcalEvents = CalendarClient.getEventsForDate(date);
    gcalEvents.forEach(ev => {
      const h = ev.start.getHours();
      const m = ev.start.getMinutes();
      if (h < startHour || h > endHour) return;

      const durationMs = ev.end.getTime() - ev.start.getTime();
      const est = Math.round(durationMs / 60000);
      const startFrac = ((h - startHour) + m/60) / totalHours;
      const heightFrac = (est / 60) / totalHours;

      const block = document.createElement('div');
      block.className = 'schedule-block schedule-block--gcal';
      block.style.top    = `${startFrac * 100}%`;
      block.style.height = `${Math.min(heightFrac * 100, 80)}%`;
      block.style.minHeight = '28px';

      block.innerHTML = `
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          📅 ${escapeHtml(ev.title)}
        </div>
        <div style="font-size:10px;opacity:0.7">
          ${ev.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} - ${ev.end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
          ${ev.location ? ' · ' + escapeHtml(ev.location) : ''}
        </div>
      `;

      if (ev.htmlLink) {
        block.onclick = () => window.open(ev.htmlLink, '_blank');
        block.style.cursor = 'pointer';
      }
      blocksCol.appendChild(block);
    });
  }

  // Place manual calendar events
  if (typeof ManualEventStore !== 'undefined') {
    const manualEvents = ManualEventStore.getEventsForDate(date);
    manualEvents.forEach(ev => {
      const [startH, startM] = ev.startTime.split(':').map(Number);
      const [endH, endM] = ev.endTime.split(':').map(Number);
      
      if (startH < startHour || startH > endHour) return;

      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (durationMinutes <= 0) return;

      const startFrac = ((startH - startHour) + startM/60) / totalHours;
      const heightFrac = (durationMinutes / 60) / totalHours;

      const block = document.createElement('div');
      block.className = 'schedule-block schedule-block--manual-event';
      block.style.top    = `${startFrac * 100}%`;
      block.style.height = `${Math.min(heightFrac * 100, 80)}%`;
      block.style.minHeight = '28px';
      
      const baseColor = ev.color || '#7c3aed';
      block.style.border = `1px solid rgba(${hexToRgb(baseColor)}, 0.3)`;
      block.style.borderLeft = `4px solid ${baseColor}`;
      block.style.background = `linear-gradient(135deg, rgba(${hexToRgb(baseColor)}, 0.15), rgba(${hexToRgb(baseColor)}, 0.05))`;
      
      block.innerHTML = `
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          📅 ${escapeHtml(ev.title)}
        </div>
        <div style="font-size:10px;opacity:0.7">
          ${formatTimeStr(ev.startTime)} - ${formatTimeStr(ev.endTime)}
          ${ev.notes ? ' · ' + escapeHtml(ev.notes) : ''}
        </div>
      `;

      block.onclick = () => openManualEventModal(ev.id);
      block.style.cursor = 'pointer';
      blocksCol.appendChild(block);
    });
  }

  // Place manual schedule blocks
  AppState.scheduleBlocks.filter(b => b.date === date.toDateString()).forEach(block => {
    const el = document.createElement('div');
    el.className = 'schedule-block';
    el.style.top = `${block.topPct}%`;
    el.style.height = `${block.heightPct}%`;
    el.style.background = 'linear-gradient(135deg, var(--accent-subtle), rgba(6,182,212,0.3))';
    el.style.border = '1px solid var(--accent)';
    el.style.color = 'var(--accent)';
    el.innerHTML = `<div>${escapeHtml(block.title)}</div>`;
    blocksCol.appendChild(el);
  });

  // Handle conflict warning banner
  const banner = document.getElementById('schedule-conflict-banner');
  if (banner) {
    let conflictMessages = [];
    const allTasks = TaskStore.getAll().filter(t => t.status !== 'completed');

    // Google Calendar Conflicts
    if (typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
      const conflictsList = CalendarClient.detectMeetingConflicts(allTasks);
      const dateStr = date.toDateString();
      const dailyConflicts = conflictsList.filter(c => new Date(c.task.deadline).toDateString() === dateStr);
      dailyConflicts.forEach(c => {
        conflictMessages.push(`"${c.task.title}" overlaps with Google Calendar event "${c.event.title}"`);
      });
    }

    // Manual Event Conflicts
    if (typeof detectManualEventConflicts === 'function') {
      const manualConflicts = detectManualEventConflicts(allTasks, date);
      manualConflicts.forEach(c => {
        conflictMessages.push(`"${c.task.title}" overlaps with manual calendar event "${c.event.title}"`);
      });
    }

    if (conflictMessages.length > 0) {
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span class="conflict-icon">⚠️</span>
        <div class="conflict-text">
          <strong>Schedule Conflict:</strong> ${conflictMessages.join('; ')}
        </div>
      `;
    } else {
      banner.style.display = 'none';
    }
  }

  // Render sidebar items if available
  if (typeof Scheduler !== 'undefined' && Scheduler.renderSidebar) {
    Scheduler.renderSidebar();
  }

  // Synchronize scrolling of time labels and blocks
  if (timeCol && blocksCol) {
    blocksCol.onscroll = () => {
      timeCol.scrollTop = blocksCol.scrollTop;
    };
  }
}

function clearSchedule() {
  const date = AppState.scheduleDate;
  AppState.scheduleBlocks = AppState.scheduleBlocks.filter(b => b.date !== date.toDateString());
  renderSchedule();
  showToast('Schedule cleared', 'info');
}

function generateAISchedule() {
  const btn = document.getElementById('btn-ai-schedule');
  
  if (!GeminiClient.isConfigured()) {
    showToast('Please configure your Gemini API key in Settings first.', 'warning');
    // Fallback to local schedule generation
    if (btn) { btn.innerHTML = '🔄 Generating...'; btn.disabled = true; }
    setTimeout(() => {
      generateLocalScheduleFallback();
      if (btn) { btn.innerHTML = '✨ AI Schedule'; btn.disabled = false; }
    }, 1000);
    return;
  }

  if (btn) { btn.innerHTML = '🔄 Planning...'; btn.disabled = true; }
  
  showAIResponseModal('🗓️ AI Day Planner', '<div class="thinking-dots"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>');
  
  let accumulatedText = '';
  
  GeminiClient.generateDayPlan(
    (chunk) => {
      accumulatedText += chunk;
      const contentEl = document.getElementById('ai-response-content');
      if (contentEl) {
        contentEl.innerHTML = parseMarkdown(accumulatedText);
        contentEl.scrollTop = contentEl.scrollHeight;
      }
    },
    () => {
      // Completed streaming
      if (btn) { btn.innerHTML = '✨ AI Schedule'; btn.disabled = false; }
      parseAndApplyAISchedule(accumulatedText);
      showToast('AI Schedule generated & mapped to grid!', 'success');
    },
    (err) => {
      console.error("AI scheduling failed:", err);
      if (btn) { btn.innerHTML = '✨ AI Schedule'; btn.disabled = false; }
      const contentEl = document.getElementById('ai-response-content');
      if (contentEl) {
        contentEl.innerHTML = `<p style="color:var(--danger)">❌ **Generation Failed:** ${err.message || 'Check your network and API key settings.'}</p>`;
      }
      showToast('AI scheduling failed. Falling back to local plan.', 'error');
      generateLocalScheduleFallback();
    }
  );
}

function generateLocalScheduleFallback() {
  const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
  const today = tasks.filter(t => t.deadline && t.deadline.toDateString() === AppState.scheduleDate.toDateString());
  const sorted = sortTasksArray(today, 'urgency');

  const dateStr = AppState.scheduleDate.toDateString();
  AppState.scheduleBlocks = AppState.scheduleBlocks.filter(b => b.date !== dateStr);

  let currentHour = 9;
  sorted.forEach(task => {
    const est = task.estimatedMin || 30;
    const startHour = 6, endHour = 23, totalHours = endHour - startHour;
    
    if (currentHour + est / 60 <= endHour) {
      const topPct = (currentHour - startHour) / totalHours * 100;
      const heightPct = (est / 60) / totalHours * 100;
      
      AppState.scheduleBlocks.push({
        date: dateStr,
        title: task.title,
        topPct,
        heightPct
      });
      
      currentHour += est / 60 + 0.25; // 15min buffer
    }
  });

  renderSchedule();
  showToast('Local schedule generated!', 'info');
}

function parseAndApplyAISchedule(text) {
  const dateStr = AppState.scheduleDate.toDateString();
  // Clear existing blocks for today
  AppState.scheduleBlocks = AppState.scheduleBlocks.filter(b => b.date !== dateStr);
  
  // Look for HH:MM - HH:MM: Title or **HH:MM - HH:MM**: Title
  const regex = /(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})[\s*:]*\s*(?:Focus on\s*)?([^*\n\r]+)/gi;
  let match;
  const startHour = 6;
  const endHour = 23;
  const totalHours = endHour - startHour;
  
  let count = 0;
  while ((match = regex.exec(text)) !== null) {
    const startTime = match[1];
    const endTime = match[2];
    const blockTitle = match[3].replace(/\*\*|:/g, '').trim();
    
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    
    if (sH >= startHour && eH <= endHour) {
      const startFrac = (sH - startHour) + sM / 60;
      const endFrac = (eH - startHour) + eM / 60;
      const duration = endFrac - startFrac;
      
      if (duration > 0) {
        AppState.scheduleBlocks.push({
          date: dateStr,
          title: blockTitle,
          topPct: (startFrac / totalHours) * 100,
          heightPct: (duration / totalHours) * 100
        });
        count++;
      }
    }
  }
  
  if (count === 0) {
    // If regex parsing failed to match, fallback to local slots so the grid is not empty
    generateLocalScheduleFallback();
  } else {
    renderSchedule();
  }
}

// ═══════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════

// Analytics rendering is delegated to scripts/analytics.js

// ═══════════════════════════════════════════════════
// AI CONTEXT (updates live context panel)
// ═══════════════════════════════════════════════════

function renderAIContext() {
  const tasks = TaskStore.getAll();
  const stats  = computeStats(tasks);

  setEl('ctx-task-count', `${tasks.length} task${tasks.length !== 1 ? 's' : ''}`);
  setEl('ctx-most-urgent', stats.mostUrgent ? stats.mostUrgent.title : 'None');
  setEl('ctx-overdue', stats.overdue.toString());
  setEl('ctx-today', stats.dueToday.toString());
  
  const connected = GeminiClient.isConfigured();
  setEl('ctx-api-status', connected ? '✅ Connected' : '⚙️ Not configured');
  
  const statusText = document.getElementById('ai-status-text');
  if (statusText) {
    statusText.textContent = connected ? 'Connected' : 'Offline';
  }
  const statusIndicator = document.getElementById('ai-status-indicator');
  if (statusIndicator) {
    statusIndicator.classList.toggle('connected', connected);
  }
}

// ═══════════════════════════════════════════════════
// AI CHAT (placeholder — Gemini integration Day 2)
// ═══════════════════════════════════════════════════

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;

  appendUserMessage(msg);
  input.value = '';
  input.style.height = 'auto';

  // Add to conversation history
  AppState.chatHistory.push({ role: 'user', text: msg });

  // Show thinking
  const thinkId = appendThinkingMessage();

  if (!GeminiClient.isConfigured()) {
    setTimeout(() => {
      removeMessage(thinkId);
      const fallbackResponse = generateLocalResponse(msg);
      appendAIMessage(`⚠️ **Gemini API Key is not configured.**\n\nRunning in offline fallback mode. Configure your API key in **Settings** to unlock real-time streaming.\n\n${fallbackResponse}`);
    }, 600);
    return;
  }

  // Live streaming Gemini response
  let accumulatedText = '';
  let aiBubbleId = null;

  GeminiClient.streamResponse(
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
      appendAIMessage(`❌ **Gemini Error:** ${err.message || 'Streaming failed.'}\n\nPlease check your key in Settings.`);
    },
    null,
    AppState.chatHistory
  );
}

function appendAIStreamingMessageStart() {
  const container = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const id = `ai-msg-${Date.now()}`;
  const div = document.createElement('div');
  div.className = 'chat-message ai-message';
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble streaming">
      <div class="msg-content"></div>
      <span class="msg-time">${time}</span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateAIStreamingMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const contentEl = el.querySelector('.msg-content');
  if (contentEl) {
    contentEl.innerHTML = parseMarkdown(text);
  }
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function finalizeAIStreamingMessage(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const bubble = el.querySelector('.msg-bubble');
  if (bubble) {
    bubble.classList.remove('streaming');
  }
  const contentEl = el.querySelector('.msg-content');
  if (contentEl) {
    contentEl.innerHTML = parseMarkdown(text);
  }
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function sendSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendChatMessage();
  navigateTo('ai');
}

function generateLocalResponse(msg) {
  const tasks  = TaskStore.getAll();
  const stats  = computeStats(tasks);
  const lower  = msg.toLowerCase();

  if (lower.includes('right now') || lower.includes('what should i')) {
    if (stats.mostUrgent) {
      const dl = getDeadlineLabel(stats.mostUrgent);
      return `Based on your task list, I recommend focusing on **"${stats.mostUrgent.title}"** right now.\n\n⏰ ${dl.text}\n🎯 Urgency Score: ${stats.mostUrgent.urgencyScore}/100\n\nThis task has the highest urgency. Would you like me to start a focus timer for it?`;
    }
    return "Great news — you have no pending tasks! Why not use this time to plan ahead? 🎉";
  }

  if (lower.includes('plan my day') || lower.includes('schedule')) {
    const today = tasks.filter(t => t.status !== 'completed' && t.deadline && t.deadline.toDateString() === new Date().toDateString());
    if (today.length === 0) return "You have no tasks due today! 🎉 This is a great opportunity to work on upcoming deadlines.";
    const sorted = sortTasksArray(today, 'urgency');
    const list = sorted.map((t, i) => `${i+1}. **${t.title}** (${getDeadlineLabel(t).text})`).join('\n');
    return `Here's your AI-recommended plan for today:\n\n${list}\n\n💡 Start with #1 — it has the highest urgency. Take a 5-min break between each task!`;
  }

  if (lower.includes('risk') || lower.includes('deadline') || lower.includes('miss')) {
    if (stats.crisisTasks.length > 0) {
      const names = stats.crisisTasks.map(t => `• ${t.title} (Score: ${t.urgencyScore}/100)`).join('\n');
      return `⚠️ You have ${stats.crisisTasks.length} high-risk task${stats.crisisTasks.length > 1 ? 's' : ''}:\n\n${names}\n\nI recommend you tackle these immediately!`;
    }
    return "✅ No critical deadline risks detected right now. You're doing great!";
  }

  if (lower.includes('motivat') || lower.includes('boost')) {
    const quotes = [
      "You don't have to be perfect. You just have to get started. The rest will follow. 💪",
      "Every task you complete is proof that you're capable of more than you think. 🚀",
      "Progress, not perfection. Ship it, then improve it. ⚡",
      "The secret to getting ahead is getting started. Mark Twain knew what's up. 🎯",
      "You've got this. One task at a time. The compound effect is real. 🔥",
    ];
    return quotes[Math.floor(Math.random() * quotes.length)] + `\n\nYou have ${stats.pendingCount} tasks to complete. Let's crush them!`;
  }

  if (lower.includes('overdue')) {
    if (stats.overdue > 0) return `You have ${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''}. I recommend:\n1. Tackle the smallest one first for a quick win\n2. Contact stakeholders if deadlines are hard\n3. Use focus mode for the most important one`;
    return "No overdue tasks! You're on top of everything. 🏆";
  }

  if (lower.includes('workload') || lower.includes('handle')) {
    const total = stats.total - stats.completed;
    if (total === 0) return "Your workload is completely clear! 🎉";
    const hours = tasks.filter(t => t.status !== 'completed').reduce((s, t) => s + (t.estimatedMin || 30), 0) / 60;
    return `You have **${total} pending tasks** requiring approximately **${hours.toFixed(1)} hours** of work.\n\n${hours > 8 ? '⚠️ Your workload is heavy. Consider delegating or rescheduling some tasks.' : '✅ Your workload looks manageable for today!'}`;
  }

  return `I'm processing your request: "${msg}"\n\n🔧 **Configure your Gemini API key in Settings** to unlock full streaming AI companion features. For now, try:\n• "What should I work on right now?"\n• "Plan my day"\n• "Which tasks are at risk?"\n• "Analyze my workload"`;
}

function appendUserMessage(text) {
  const container = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-message user-message';
  div.innerHTML = `
    <div class="msg-avatar">👤</div>
    <div class="msg-bubble">
      <p>${escapeHtml(text)}</p>
      <span class="msg-time">${time}</span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendAIMessage(text) {
  const container = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const div = document.createElement('div');
  div.className = 'chat-message ai-message';
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="msg-content">${parseMarkdown(text)}</div>
      <span class="msg-time">${time}</span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendThinkingMessage() {
  const container = document.getElementById('chat-messages');
  const id = `thinking-${Date.now()}`;
  const div = document.createElement('div');
  div.className = 'chat-message ai-message';
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="msg-bubble">
      <div class="thinking-dots">
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
        <div class="thinking-dot"></div>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function clearChat() {
  const container = document.getElementById('chat-messages');
  container.innerHTML = `
    <div class="chat-message ai-message">
      <div class="msg-avatar">🤖</div>
      <div class="msg-bubble">
        <p>Chat cleared! How can I help you be more productive today?</p>
        <span class="msg-time">Now</span>
      </div>
    </div>`;
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ═══════════════════════════════════════════════════
// VOICE (stub — full implementation Day 3)
// ═══════════════════════════════════════════════════

function initVoice() {
  if (typeof VoiceAssistant !== 'undefined' && VoiceAssistant.init) {
    VoiceAssistant.init();
  }
}

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════

const SETTINGS_KEY = 'lmls_settings';

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(AppState.settings, JSON.parse(raw));
  } catch {}
  AppState.weeklyGoal = localStorage.getItem('lmls_weekly_goal') || '';
  AppState.chatHistory = JSON.parse(localStorage.getItem('lmls_chat_history') || '[]');
  AppState.tasksViewMode = localStorage.getItem('lmls_tasks_view_mode') || 'list';
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(AppState.settings));
}

async function saveApiKey() {
  const keyInput = document.getElementById('api-key-input');
  const key = keyInput?.value.trim() || '';
  const btn = document.querySelector('button[onclick="saveApiKey()"]');

  if (!key) {
    AppState.settings.geminiApiKey = '';
    saveSettings();
    showToast('API key cleared', 'info');
    refreshAll();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Testing connection...';
  }

  try {
    await GeminiClient.testConnection(key);
    AppState.settings.geminiApiKey = key;
    saveSettings();
    showToast('✅ API key verified & saved successfully!', 'success');
    refreshAll();
  } catch (err) {
    console.error("API Key validation failed:", err);
    const stackLines = err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : '';
    showToast(`❌ Connection failed: ${err.message || "Invalid key"} (Stack: ${stackLines})`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Save API Key';
    }
  }
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('api-key-input');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

function saveModelSelection() {
  const select = document.getElementById('gemini-model-select');
  if (select) {
    AppState.settings.geminiModel = select.value;
    saveSettings();
    showToast('AI Model updated!', 'success');
  }
}

function saveUserProfile() {
  AppState.settings.userName   = document.getElementById('user-name-input')?.value.trim() || 'User';
  AppState.settings.workStart  = document.getElementById('work-start-input')?.value || '09:00';
  AppState.settings.workEnd    = document.getElementById('work-end-input')?.value || '18:00';
  saveSettings();
  updateUserAvatar();
  updateGreeting();
  if (typeof populateCategoryDropdowns === 'function') {
    populateCategoryDropdowns();
  }
  showToast('Profile saved!', 'success');
}

function saveNotificationSettings() {
  AppState.settings.crisisMode   = document.getElementById('toggle-crisis')?.checked ?? true;
  AppState.settings.voiceResponse = document.getElementById('toggle-voice-response')?.checked ?? false;
  AppState.settings.autoPriority  = document.getElementById('toggle-auto-priority')?.checked ?? true;
  saveSettings();
}

// ═══════════════════════════════════════════════════
// AGENT ACTIVITY LOG
// ═══════════════════════════════════════════════════

function logAgentAction(type, message) {
  const entry = { type, message, time: new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) };
  AppState.agentLog.unshift(entry);
  if (AppState.agentLog.length > 50) AppState.agentLog.pop();
  renderAgentLog();
}

function renderAgentLog() {
  const container = document.getElementById('agent-activity-log');
  if (!container) return;
  const iconMap = { system: '⚙️', crisis: '🚨', briefing: '📋', overload: '📊', snooze: '💤', decompose: '🔧', reschedule: '🔄', habit: '🔥', focus: '⏱️' };
  container.innerHTML = AppState.agentLog.map(e => `
    <div class="agent-log-entry">
      <span class="agent-log-icon">${iconMap[e.type] || '🤖'}</span>
      <span class="agent-log-msg">${e.message}</span>
      <span class="agent-log-time">${e.time}</span>
    </div>
  `).join('') || '<div class="agent-log-empty">Agent is monitoring your tasks...</div>';
}

// ═══════════════════════════════════════════════════
// DYNAMIC MODEL BADGE
// ═══════════════════════════════════════════════════

function updateActiveModelBadge() {
  const badge = document.getElementById('active-model-badge');
  if (!badge) return;
  const model = (typeof GeminiClient !== 'undefined' && GeminiClient.getActiveModel)
    ? GeminiClient.getActiveModel()
    : (AppState.settings.geminiModel || 'auto');
  const displayName = model === 'auto' ? 'Gemini (Auto)' : model.replace('gemini-', 'Gemini ').replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
  badge.textContent = `⚡ Powered by ${displayName}`;
}

// ═══════════════════════════════════════════════════
// SMART AI RESCHEDULE
// ═══════════════════════════════════════════════════

async function runAIReschedule() {
  if (!GeminiClient.isConfigured()) {
    showToast('Please configure your Gemini API key first.', 'warning');
    return;
  }
  const overdue = TaskStore.getAll().filter(t => t.status !== 'completed' && t.deadline && t.deadline < new Date());
  if (overdue.length === 0) {
    showToast('🎉 No overdue tasks! You\'re on track.', 'success');
    return;
  }

  const btn = document.getElementById('btn-ai-reschedule');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Rescheduling...'; }
  logAgentAction('reschedule', `🔄 AI rescheduling ${overdue.length} overdue task(s)...`);

  const taskList = overdue.map((t, i) => `${i+1}. "${t.title}" — ${t.estimatedMin || 30} min estimated`).join('\n');
  const prompt = `I have ${overdue.length} overdue tasks that need to be rescheduled to realistic future deadlines starting from tomorrow. For each task, suggest a new deadline within the next 7 days based on its priority and estimated duration.

Tasks:
${taskList}

Reply ONLY with a valid JSON array like:
[{"index":1,"newDeadline":"2024-12-20T10:00:00"},{"index":2,"newDeadline":"2024-12-21T14:00:00"}]

Use real upcoming dates based on today: ${new Date().toISOString().split('T')[0]}. Higher priority tasks get earlier slots.`;

  try {
    let jsonText = '';
    await GeminiClient.streamResponse(
      prompt,
      chunk => { jsonText += chunk; },
      () => {
        try {
          const clean = jsonText.replace(/```json?|```/g, '').trim();
          const schedule = JSON.parse(clean);
          let rescheduled = 0;
          schedule.forEach(item => {
            const task = overdue[item.index - 1];
            if (task && item.newDeadline) {
              TaskStore.update(task.id, { deadline: new Date(item.newDeadline) });
              rescheduled++;
            }
          });
          refreshAll();
          logAgentAction('reschedule', `✅ Rescheduled ${rescheduled} task(s) to realistic future dates`);
          showToast(`✅ AI rescheduled ${rescheduled} task(s) successfully!`, 'success');
        } catch {
          showToast('AI response could not be parsed. Try again.', 'error');
        }
        if (btn) { btn.disabled = false; btn.textContent = '🔄 AI Reschedule Overdue'; }
      },
      err => {
        showToast(`Reschedule failed: ${err.message}`, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '🔄 AI Reschedule Overdue'; }
        logAgentAction('reschedule', `❌ Reschedule failed: ${err.message}`);
      }
    );
  } catch (err) {
    showToast('Reschedule failed. Check your API key.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 AI Reschedule Overdue'; }
  }
}

// ═══════════════════════════════════════════════════
// SIGN OUT
// ═══════════════════════════════════════════════════

function signOut() {
  if (!confirm('Sign out of your profile? Your tasks and data will be preserved.')) return;
  if (typeof CalendarClient !== 'undefined' && typeof CalendarClient.signOut === 'function') {
    CalendarClient.signOut();
  }
  localStorage.removeItem('lmls_auth_completed');
  localStorage.removeItem('lmls_current_user');
  localStorage.removeItem('lmls_gcal'); // Clear Google Calendar sync state on sign out
  window.location.href = './auth.html';
}

function exportData() {
  const data = {
    tasks:    TaskStore.getAll(),
    habits:   AppState.habits,
    settings: { ...AppState.settings, geminiApiKey: '***' },
    exported: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lmls-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('Data exported!', 'success');
}

function seedDemoData() {
  if (!confirm('Load demo data? This will add sample tasks and habits.')) return;
  seedDemoTasks();
  seedDemoHabits();
  refreshAll();
  renderHabits();
  showToast('🌱 Demo data loaded!', 'success');
}

function seedDemoHabits() {
  const demos = [
    { name: 'Morning Exercise', emoji: '🏃', frequency: 'daily' },
    { name: 'Read 20 pages', emoji: '📚', frequency: 'daily' },
    { name: 'Drink 8 glasses of water', emoji: '💧', frequency: 'daily' },
  ];
  const now = new Date();
  demos.forEach((d, index) => {
    const streak = Math.floor(Math.random() * 12) + 3; // at least 3
    const bestStreak = streak + Math.floor(Math.random() * 8);
    const completions = {};
    
    // Seed current streak completions
    for (let i = 0; i < streak; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      completions[key] = 1;
    }

    // Seed past best streak completions to make bestStreak valid
    const gap = 5;
    const pastStartOffset = streak + gap;
    for (let i = 0; i < bestStreak; i++) {
      const day = new Date(now);
      day.setDate(day.getDate() - (pastStartOffset + i));
      const key = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      completions[key] = 1;
    }

    AppState.habits.push({
      id:          crypto.randomUUID(),
      name:        d.name,
      emoji:       d.emoji,
      frequency:   d.frequency,
      goal:        1,
      streak:      streak,
      bestStreak:  bestStreak,
      completions: completions,
      createdAt:   new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
    });
  });
  saveHabitsData();
}

function clearAllData() {
  if (!confirm('⚠️ This will delete ALL tasks, habits, and settings. Are you sure?')) return;
  localStorage.clear();
  location.reload();
}

function showWelcomePrompt() {
  // Reset onboarding name
  const nameInput = document.getElementById('onboarding-name-input');
  if (nameInput) nameInput.value = '';
  
  // Set default step
  setOnboardingStep(1);
  
  // Show modal
  document.getElementById('onboarding-backdrop').classList.remove('hidden');
  document.getElementById('modal-onboarding').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

// ═══════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = parseInt(el.textContent, 10) || 0;
  const diff  = target - start;
  const steps = 20;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    el.textContent = Math.round(start + (diff * step / steps));
    if (step >= steps) { el.textContent = target; clearInterval(interval); }
  }, 20);
}

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// Sidebar collapse toggle
const sidebar = document.getElementById('sidebar');

document.getElementById('sidebar-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebar?.classList.toggle('collapsed');
});

document.querySelector('.sidebar-logo')?.addEventListener('click', (e) => {
  if (sidebar) {
    if (sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed');
    } else if (e.target.closest('.logo-icon')) {
      sidebar.classList.add('collapsed');
    }
  }
});

// Handle initial hash routing
window.addEventListener('load', () => {
  const hash = location.hash.replace('#', '');
  if (hash && PAGE_META[hash]) {
    navigateTo(hash, false);
  } else {
    navigateTo('dashboard', false);
  }
});

// ═══════════════════════════════════════════════════
// AI ASSISTANT HELPERS
// ═══════════════════════════════════════════════════

function showAIResponseModal(title, initialHtml = '') {
  document.getElementById('ai-response-title').textContent = title;
  document.getElementById('ai-response-content').innerHTML = initialHtml;
  showModal('modal-ai-response');
}

function closeAIResponseModal() {
  closeModal();
}

function renderAIBriefing(forceRefresh = false) {
  const container = document.getElementById('ai-briefing-content');
  if (!container) return;

  const btnRegen = document.getElementById('btn-regenerate-briefing');

  if (!GeminiClient.isConfigured()) {
    container.innerHTML = `
      <div class="briefing-placeholder">
        <div class="briefing-bot-icon">🧠</div>
        <p>Configure your Gemini API key in Settings to activate your AI companion.</p>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('settings')" style="margin-top: 8px;">Setup AI →</button>
      </div>`;
    if (btnRegen) btnRegen.classList.add('hidden');
    return;
  }

  if (btnRegen) btnRegen.classList.remove('hidden');

  // Check if we have a cached briefing for today
  const cached = localStorage.getItem('lmls_cached_briefing');
  const cachedDate = localStorage.getItem('lmls_cached_briefing_date');
  const todayStr = new Date().toDateString();

  if (cached && cachedDate === todayStr && !forceRefresh) {
    container.innerHTML = `<div class="briefing-text">${parseMarkdown(cached)}</div>`;
    return;
  }

  generateBriefing();
}

function generateBriefing() {
  const container = document.getElementById('ai-briefing-content');
  if (!container) return;

  const btnRegen = document.getElementById('btn-regenerate-briefing');
  if (btnRegen) {
    btnRegen.disabled = true;
    btnRegen.innerHTML = '🔄 Refreshing...';
  }

  // Show skeleton loader
  container.innerHTML = `
    <div class="briefing-skeleton" style="padding: var(--space-xs) 0;">
      <div class="skeleton-pulse skeleton-title"></div>
      <div class="skeleton-pulse skeleton-line"></div>
      <div class="skeleton-pulse skeleton-line"></div>
      <div class="skeleton-pulse skeleton-line"></div>
    </div>`;

  let accumulatedText = '';

  GeminiClient.generateDailyBriefing(
    (chunk) => {
      accumulatedText += chunk;
      container.innerHTML = `<div class="briefing-text">${parseMarkdown(accumulatedText)}</div>`;
    },
    () => {
      container.innerHTML = `<div class="briefing-text">${parseMarkdown(accumulatedText)}</div>`;
      localStorage.setItem('lmls_cached_briefing', accumulatedText);
      localStorage.setItem('lmls_cached_briefing_date', new Date().toDateString());
      if (btnRegen) {
        btnRegen.disabled = false;
        btnRegen.innerHTML = '🔄 Refresh';
      }
      showToast('Daily briefing updated!', 'success');
    },
    (err) => {
      console.error("Failed to generate AI briefing:", err);
      container.innerHTML = `
        <div class="briefing-error" style="text-align: center; padding: var(--space-md);">
          <p style="color: var(--danger); font-size: 13px; margin-bottom: 8px;">⚠️ Failed to load AI Briefing.</p>
          <p style="font-size: 11px; color: var(--text-muted); margin-bottom: var(--space-md);">${err.message || 'Check connection or key'}</p>
          <button class="btn btn-primary btn-sm" onclick="generateBriefing()">Try Again</button>
        </div>`;
      if (btnRegen) {
        btnRegen.disabled = false;
        btnRegen.innerHTML = '🔄 Refresh';
      }
    }
  );
}

function parseMarkdown(text) {
  if (!text) return '';
  
  // 1. Escape HTML to prevent XSS
  let html = escapeHtml(text);
  
  // 2. Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // 3. Inline code: `code`
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // 4. Code blocks: ```language ... ```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  
  // 5. Headings: ### Heading or ## Heading
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h3>$1</h3>');
  
  // 6. Bullet lists
  const lines = html.split('\n');
  let inList = false;
  let processedLines = [];
  
  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemText = trimmed.slice(2);
      if (!inList) {
        processedLines.push('<ul>');
        inList = true;
      }
      processedLines.push(`<li>${itemText}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) {
    processedLines.push('</ul>');
  }
  
  html = processedLines.join('\n');
  
  // Replace remaining double linebreaks with paragraphs or <br>
  html = html.replace(/\n\n/g, '<br><br>');
  html = html.replace(/\n/g, '<br>');
  
  // Clean up adjacent <br> tags next to lists/headers
  html = html.replace(/<\/ul><br>/g, '</ul>');
  html = html.replace(/<h3>(.*?)<\/h3><br>/g, '<h3>$1</h3>');
  
  return html;
}

function runAIProcrastinationDetector() {
  if (!GeminiClient.isConfigured()) {
    showToast('Please configure your Gemini API key in Settings first.', 'warning');
    navigateTo('settings');
    return;
  }
  
  showAIResponseModal('💡 Procrastination Coaching', '<div class="thinking-dots"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>');
  
  let accumulatedText = '';
  GeminiClient.detectProcrastination(
    (chunk) => {
      accumulatedText += chunk;
      const el = document.getElementById('ai-response-content');
      if (el) el.innerHTML = parseMarkdown(accumulatedText);
    },
    () => {},
    (err) => {
      const el = document.getElementById('ai-response-content');
      if (el) el.innerHTML = `<p style="color:var(--danger)">❌ **Error:** ${err.message || 'Failed to analyze.'}</p>`;
    }
  );
}

function runAIWorkloadAnalysis() {
  if (!GeminiClient.isConfigured()) {
    showToast('Please configure your Gemini API key in Settings first.', 'warning');
    navigateTo('settings');
    return;
  }
  
  showAIResponseModal('📊 Workload Analysis', '<div class="thinking-dots"><div class="thinking-dot"></div><div class="thinking-dot"></div><div class="thinking-dot"></div></div>');
  
  let accumulatedText = '';
  GeminiClient.analyzeWorkload(
    (chunk) => {
      accumulatedText += chunk;
      const el = document.getElementById('ai-response-content');
      if (el) el.innerHTML = parseMarkdown(accumulatedText);
    },
    () => {},
    (err) => {
      const el = document.getElementById('ai-response-content');
      if (el) el.innerHTML = `<p style="color:var(--danger)">❌ **Error:** ${err.message || 'Failed to analyze.'}</p>`;
    }
  );
}

// ═══════════════════════════════════════════════════
// DAY 7 EXTENSIONS (Theme, Shortcuts, Onboarding)
// ═══════════════════════════════════════════════════

function initTheme() {
  const savedTheme = localStorage.getItem('lmls_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    toggleThemeIcons(true);
  } else {
    document.body.classList.remove('light-theme');
    toggleThemeIcons(false);
  }

  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-theme');
      localStorage.setItem('lmls_theme', isLight ? 'light' : 'dark');
      toggleThemeIcons(isLight);
      showToast(`${isLight ? 'Light' : 'Dark'} mode activated`, 'info');
    });
  }
}

function toggleThemeIcons(isLight) {
  const darkIcon = document.querySelector('#theme-btn .theme-icon-dark');
  const lightIcon = document.querySelector('#theme-btn .theme-icon-light');
  if (darkIcon && lightIcon) {
    if (isLight) {
      darkIcon.classList.add('hidden');
      lightIcon.classList.remove('hidden');
    } else {
      darkIcon.classList.remove('hidden');
      lightIcon.classList.add('hidden');
    }
  }
}

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const isInput = active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;

    // '/' to focus search input in Tasks view
    if (e.key === '/' && !isInput) {
      e.preventDefault();
      navigateTo('tasks');
      setTimeout(() => {
        const searchInput = document.getElementById('task-search');
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }, 100);
    }

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          openAddTaskModal();
          break;
        case 'f':
          e.preventDefault();
          navigateTo('focus');
          break;
        case 'z':
          if (!isInput) {
            e.preventDefault();
            if (typeof UndoStack !== 'undefined') UndoStack.undo();
          }
          break;
        case 'k':
          // Ctrl+K now opens command palette (handled by cmd palette listeners)
          // Fallthrough intentional — let the palette DOMContentLoaded handler take over
          break;
      }
    }
  });
}

let onboardingCurrentStep = 1;

function setOnboardingStep(step) {
  onboardingCurrentStep = step;
  
  // Show current step div, hide others
  document.querySelectorAll('.onboarding-step').forEach((el, index) => {
    el.classList.toggle('hidden', index !== step - 1);
  });
  
  // Update indicators
  document.querySelectorAll('.onboarding-steps-indicator .step-dot').forEach((el, index) => {
    el.classList.toggle('active', index === step - 1);
  });
  
  // Set button text/visibility
  const backBtn = document.getElementById('btn-onboarding-back');
  const nextBtn = document.getElementById('btn-onboarding-next');
  
  if (backBtn) {
    backBtn.classList.toggle('hidden', step === 1);
  }
  
  if (nextBtn) {
    if (step === 3) {
      nextBtn.classList.add('hidden');
    } else {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = 'Next';
    }
  }
}

function onboardingNextStep() {
  if (onboardingCurrentStep === 1) {
    const name = document.getElementById('onboarding-name-input')?.value.trim();
    if (!name) {
      showToast('Please enter your name!', 'warning');
      return;
    }
  }
  setOnboardingStep(onboardingCurrentStep + 1);
}

function onboardingPrevStep() {
  if (onboardingCurrentStep > 1) {
    setOnboardingStep(onboardingCurrentStep - 1);
  }
}

function completeOnboarding(loadDemo) {
  const name = document.getElementById('onboarding-name-input')?.value.trim() || 'User';
  const start = document.getElementById('onboarding-start-input')?.value || '09:00';
  const end = document.getElementById('onboarding-end-input')?.value || '18:00';
  
  // Save settings
  AppState.settings.userName = name;
  AppState.settings.workStart = start;
  AppState.settings.workEnd = end;
  saveSettings();
  updateUserAvatar();
  updateGreeting();
  
  // Sync fields inside main settings view
  const nameInput = document.getElementById('user-name-input');
  if (nameInput) nameInput.value = name;
  const startInput = document.getElementById('work-start-input');
  if (startInput) startInput.value = start;
  const endInput = document.getElementById('work-end-input');
  if (endInput) endInput.value = end;
  
  if (loadDemo) {
    seedDemoTasks();
    seedDemoHabits();
    refreshAll();
    renderHabits();
    showToast('🌱 Demo data loaded! Welcome to LMLS!', 'success');
    if (window.LMLS_Animations) {
      window.LMLS_Animations.triggerConfetti();
    }
  } else {
    refreshAll();
    showToast('🚀 Profile set! Welcome to LMLS!', 'success');
  }
  
  // Close the onboarding modal
  document.getElementById('onboarding-backdrop').classList.add('hidden');
  document.getElementById('modal-onboarding').classList.add('hidden');
  document.body.style.overflow = '';
  
  navigateTo('dashboard');
}

// Export onboarding functions globally
window.onboardingNextStep = onboardingNextStep;
window.onboardingPrevStep = onboardingPrevStep;
window.completeOnboarding = completeOnboarding;

// ═══════════════════════════════════════════════════
// DAY 8 EXTENSIONS (Demo Story Loader & Network status)
// ═══════════════════════════════════════════════════

function loadJudgeDemoStory() {
  // Preserve API key, userName, workStyle, and GCal Client ID if configured
  const apiKey = AppState.settings.geminiApiKey || '';
  const userName = AppState.settings.userName || 'Judge';
  const workStyle = AppState.settings.workStyle || 'crisis';
  const gcalClientId = document.getElementById('gcal-client-id-input')?.value || '';

  // 1. Wipe all local storage
  localStorage.clear();

  // 2. Re-initialize state shell
  AppState.settings.userName = userName;
  AppState.settings.workStyle = workStyle;
  AppState.settings.workStart = "09:00";
  AppState.settings.workEnd = "18:00";
  AppState.settings.geminiApiKey = apiKey;
  saveSettings();

  // Restore client ID input
  if (gcalClientId) {
    const el = document.getElementById('gcal-client-id-input');
    if (el) el.value = gcalClientId;
  }

  AppState.crisisShown = new Set();
  AppState.lastReprioritize = 0;

  // 3. Clear and reload State arrays
  TaskStore.load(); // Wipes current in-memory tasks list

  const now = new Date();

  const tasks = [
    {
      title: workStyle === 'sprint' ? 'CS Project Submission - Sprint 1' : 'CS Final Project Submission',
      description: workStyle === 'sprint'
        ? `Upload course code ZIP and final report PDF for ${userName}'s modules.`
        : `Upload source code ZIP and final report PDF for ${userName} to course portal.`,
      deadline: new Date(now.getTime() + 90 * 60 * 1000), // 1.5 hours from now
      estimatedMin: workStyle === 'focused' ? 120 : workStyle === 'sprint' ? 25 : 60,
      priority: 'critical',
      category: 'work',
      tags: workStyle === 'sprint' ? 'cs, sprint, pomodoro' : 'cs, project, submissions',
      notes: 'Make sure code comments are clean'
    },
    {
      title: workStyle === 'sprint' ? 'Calculus III - Homework Review' : 'Calculus III Assignment 8',
      description: `Complete all questions from Section 14.3 for ${userName}. Scan and upload.`,
      deadline: new Date(now.getTime() + 24 * 3600 * 1000), // tomorrow
      estimatedMin: workStyle === 'focused' ? 120 : workStyle === 'sprint' ? 30 : 90,
      priority: 'high',
      category: 'education',
      tags: 'calculus, math',
      notes: ''
    },
    {
      title: 'Chemistry Lab Report 4',
      description: 'Thermodynamics experiment write-up and curves plotting.',
      deadline: new Date(now.getTime() + 2 * 24 * 3600 * 1000), // 2 days from now
      estimatedMin: workStyle === 'focused' ? 180 : workStyle === 'sprint' ? 45 : 120,
      priority: 'medium',
      category: 'education',
      tags: 'chemistry, lab',
      notes: ''
    },
    {
      title: workStyle === 'focused' ? 'Deep LMLS Design Audit' : 'LMLS Design Audit',
      description: 'Review color contrast ratios and keyboard outline styles.',
      deadline: new Date(now.getTime() + 3 * 24 * 3600 * 1000), // 3 days from now
      estimatedMin: workStyle === 'focused' ? 60 : 45,
      priority: 'low',
      category: 'work',
      tags: 'a11y, design',
      notes: ''
    },
    {
      title: 'Buy fresh groceries',
      description: 'Milk, eggs, bananas, spinach, chicken breast.',
      deadline: new Date(new Date().setHours(21, 0, 0, 0)), // 9 PM tonight
      estimatedMin: 20,
      priority: 'medium',
      category: 'personal',
      tags: 'shopping, food',
      notes: ''
    }
  ];

  tasks.forEach(t => TaskStore.add(t));

  // 4. Seed habits with history
  AppState.habits = [];

  const habits = [
    { name: 'Drink 8 glasses of water', emoji: '💧', frequency: 'daily', goal: 1, streak: 15, bestStreak: 20 },
    { name: 'Read 20 pages', emoji: '📚', frequency: 'daily', goal: 1, streak: 8, bestStreak: 12 },
    { name: 'Morning Jog', emoji: '🏃', frequency: 'daily', goal: 1, streak: 5, bestStreak: 7 }
  ];

  habits.forEach((h, index) => {
    const habitId = crypto.randomUUID();
    const completions = {};

    const totalDaysToSeed = index === 0 ? 15 : index === 1 ? 8 : 5;
    // Seed current streak completions
    for (let i = 0; i < totalDaysToSeed; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      completions[key] = 1;
    }

    // Seed past best streak completions to make bestStreak valid
    const gap = 5;
    const pastStartOffset = totalDaysToSeed + gap;
    for (let i = 0; i < h.bestStreak; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (pastStartOffset + i));
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      completions[key] = 1;
    }

    AppState.habits.push({
      id: habitId,
      name: h.name,
      emoji: h.emoji,
      frequency: h.frequency,
      goal: h.goal,
      streak: h.streak,
      bestStreak: h.bestStreak,
      completions: completions,
      createdAt: new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
    });
  });

  saveHabitsData();

  // Reload UI
  updateUserAvatar();
  initUI();
  refreshAll();
  renderHabits();

  // Show demo banner
  const banner = document.getElementById('demo-mode-banner');
  if (banner) {
    banner.classList.remove('hidden');
    const userSpan = document.getElementById('demo-banner-username');
    const taskSpan = document.getElementById('demo-banner-task-name');
    if (userSpan) userSpan.textContent = userName;
    if (taskSpan) taskSpan.textContent = tasks[0].title;
  }

  showToast('🎁 Judge Demo Story preloaded!', 'success');
  navigateTo('dashboard');

  if (window.LMLS_Animations) {
    window.LMLS_Animations.triggerConfetti();
  }

  // Trigger crisis check within 1.5s
  setTimeout(checkCrisis, 1500);
}

function dismissDemoBanner() {
  document.getElementById('demo-mode-banner')?.classList.add('hidden');
}

function updateNetworkStatus() {
  const dot = document.querySelector('#network-status .network-dot');
  const text = document.querySelector('#network-status .network-text');

  if (navigator.onLine) {
    if (dot) dot.className = 'network-dot online';
    if (text) text.textContent = 'Online';
  } else {
    if (dot) dot.className = 'network-dot offline';
    if (text) text.textContent = 'Offline';
    showToast('🔴 You are offline. AI agent functions are paused.', 'warning');
  }
}

// Network event listeners
window.addEventListener('online', () => {
  updateNetworkStatus();
  showToast('🟢 Connection restored! AI active.', 'success');
});
window.addEventListener('offline', () => {
  updateNetworkStatus();
});

// Export demo and banner functions globally
window.loadJudgeDemoStory = loadJudgeDemoStory;
window.dismissDemoBanner = dismissDemoBanner;
window.updateNetworkStatus = updateNetworkStatus;

// ═══════════════════════════════════════════════════
// COMMAND PALETTE (Ctrl+K)
// ═══════════════════════════════════════════════════

function openCmdPalette() {
  const backdrop = document.getElementById('cmd-palette-backdrop');
  const input = document.getElementById('cmd-input');
  if (!backdrop) return;
  backdrop.classList.remove('hidden');
  setTimeout(() => input?.focus(), 50);
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

  const q = query.toLowerCase();
  const matches = TaskStore.getAll().filter(t =>
    t.title.toLowerCase().includes(q) ||
    (t.description || '').toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.toLowerCase().includes(q))
  ).slice(0, 5);

  if (matches.length > 0 && taskSection) {
    taskSection.style.display = 'block';
    taskResults.innerHTML = matches.map(t => `
      <div class="cmd-item" onclick="openEditTask('${t.id}'); closeCmdPalette();">
        <span class="cmd-item-icon">${t.status === 'completed' ? '✅' : '📋'}</span>
        <span class="cmd-item-text">${escapeHtml(t.title)}</span>
        <span class="cmd-item-hint">${t.priority}</span>
      </div>
    `).join('');
  } else {
    if (taskSection) taskSection.style.display = 'none';
    taskResults.innerHTML = '';
  }

  if (query.length > 3 && aiSection && aiResult) {
    aiSection.style.display = 'block';
    aiResult.innerHTML = `
      <div class="cmd-item" onclick="sendCmdAIQuery('${escapeHtml(query)}')">  
        <span class="cmd-item-icon">🤖</span>
        <span class="cmd-item-text">Ask AI: "${escapeHtml(query)}"</span>
        <span class="cmd-item-hint">→ AI Chat</span>
      </div>
    `;
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

// Cmd palette keyboard listeners
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
    closeFocusHUD();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const cmdInput = document.getElementById('cmd-input');
  if (cmdInput) {
    cmdInput.addEventListener('input', (e) => renderCmdResults(e.target.value));
  }
  const backdrop = document.getElementById('cmd-palette-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeCmdPalette();
    });
  }
  // Ripple button effect
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    const size = Math.max(rect.width, rect.height);
    ripple.className = 'btn-ripple';
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px;`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
});

// ═══════════════════════════════════════════════════
// DASHBOARD HERO RING
// ═══════════════════════════════════════════════════

function updateDashboardHero() {
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);
  const hour = new Date().getHours();

  const ringFill = document.getElementById('hero-ring-fill');
  const ringValue = document.getElementById('hero-ring-value');
  if (ringFill && ringValue) {
    const score = stats.productivityScore || 0;
    const circumference = 283; // 2*PI*45
    ringFill.style.strokeDashoffset = circumference - (score / 100) * circumference;
    animateCountUp(ringValue, score);
  }

  const greetingTime = document.getElementById('hero-greeting-time');
  if (greetingTime) {
    if (hour < 12) greetingTime.textContent = 'morning';
    else if (hour < 17) greetingTime.textContent = 'afternoon';
    else if (hour < 21) greetingTime.textContent = 'evening';
    else greetingTime.textContent = 'night';
  }
  const greetingName = document.getElementById('hero-greeting-name');
  if (greetingName) greetingName.textContent = AppState.settings.userName || 'there';

  const subtext = document.getElementById('hero-subtext');
  if (subtext) {
    const pendingCount = tasks.filter(t => t.status !== 'completed').length;
    const overdueCount = stats.overdue || 0;
    if (overdueCount > 0) {
      subtext.textContent = `⚠️ You have ${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}. Let's tackle them now!`;
      subtext.style.color = 'var(--warning)';
    } else if (pendingCount === 0 && tasks.length > 0) {
      subtext.textContent = '🎉 All tasks done! You are crushing it today.';
      subtext.style.color = 'var(--success)';
    } else {
      subtext.textContent = `${pendingCount} task${pendingCount !== 1 ? 's' : ''} remaining. You've got this!`;
      subtext.style.color = '';
    }
  }

  const pilldone = document.getElementById('hero-pill-done-val');
  const pilldue = document.getElementById('hero-pill-due-val');
  const pillfocus = document.getElementById('hero-pill-focus-val');
  if (pilldone) pilldone.textContent = `${stats.completed} done`;
  if (pilldue) pilldue.textContent = `${stats.dueToday} due today`;
  if (pillfocus) {
    const sessions = AppState.sessionsToday || 0;
    pillfocus.textContent = `${sessions} focus session${sessions !== 1 ? 's' : ''}`;
  }
}

function animateCountUp(el, target, duration = 800) {
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) { el.textContent = target; return; }
  const startTime = performance.now();
  const update = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + diff * eased);
    el.classList.add('counting');
    if (progress < 1) requestAnimationFrame(update);
    else { el.textContent = target; el.classList.remove('counting'); }
  };
  requestAnimationFrame(update);
}

// ═══════════════════════════════════════════════════
// 3D CARD TILT EFFECT
// ═══════════════════════════════════════════════════

function addTiltEffect() {
  document.querySelectorAll('.task-card, .stat-card, .dash-card').forEach(card => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = '1';
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const rotX = ((e.clientY - rect.top - rect.height / 2) / (rect.height / 2)) * -4;
      const rotY = ((e.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 4;
      card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-2px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

// ═══════════════════════════════════════════════════
// DAY REVIEW MODAL
// ═══════════════════════════════════════════════════

function showDayReview() {
  const modal = document.getElementById('modal-day-review');
  if (!modal) return;
  const tasks = TaskStore.getAll();
  const stats = computeStats(tasks);
  const statsDiv = document.getElementById('day-review-stats');
  if (statsDiv) {
    statsDiv.innerHTML = `
      <div class="day-review-stat"><div class="day-review-stat-value">${stats.completed}</div><div class="day-review-stat-label">Tasks Done</div></div>
      <div class="day-review-stat"><div class="day-review-stat-value">${AppState.sessionsToday || 0}</div><div class="day-review-stat-label">Focus Sessions</div></div>
      <div class="day-review-stat"><div class="day-review-stat-value">${stats.productivityScore}</div><div class="day-review-stat-label">Score</div></div>
      <div class="day-review-stat"><div class="day-review-stat-value">${AppState.habits.filter(h => h.completions?.[new Date().toISOString().slice(0,10)]).length}</div><div class="day-review-stat-label">Habits Hit</div></div>
    `;
  }
  const stars = document.querySelectorAll('#star-rating .star');
  stars.forEach(star => {
    star.classList.remove('active');
    star.onclick = () => {
      const rating = parseInt(star.dataset.rating);
      stars.forEach((s, i) => s.classList.toggle('active', i < rating));
      localStorage.setItem('lmls_day_rating_' + new Date().toISOString().slice(0,10), rating);
    };
  });

  const debriefEl = document.getElementById('day-review-ai-debrief');
  if (debriefEl) {
    debriefEl.textContent = '🤖 Analyzing your day...';
    const prompt = `Give me a quick 2-sentence personalized debrief of my progress today. I completed ${stats.completed} tasks out of ${stats.total} total, did ${AppState.sessionsToday || 0} focus sessions, hit ${stats.productivityScore}/100 productivity score, and did some habits. Be encouraging and concise.`;
    GeminiClient.streamResponse(prompt, (chunk) => {
      if (debriefEl.textContent === '🤖 Analyzing your day...') {
        debriefEl.textContent = '';
      }
      debriefEl.textContent += chunk;
    }, () => {}, (err) => {
      debriefEl.textContent = 'Great job staying focused today!';
    });
  }

  modal.classList.remove('hidden');
  document.getElementById('modal-backdrop')?.classList.remove('hidden');
  if (typeof triggerConfetti === 'function') triggerConfetti();
}

function closeDayReview() {
  document.getElementById('modal-day-review')?.classList.add('hidden');
  document.getElementById('modal-backdrop')?.classList.add('hidden');
}

function checkDayReviewTrigger() {
  const hour = new Date().getHours();
  const todayKey = new Date().toISOString().slice(0,10);
  if (localStorage.getItem('lmls_day_review_' + todayKey)) return;
  const tasks = TaskStore.getAll();
  const pendingCount = tasks.filter(t => t.status !== 'completed').length;
  if (hour >= 18 || (pendingCount === 0 && tasks.length > 3)) {
    localStorage.setItem('lmls_day_review_' + todayKey, '1');
    setTimeout(showDayReview, 2000);
  }
}

// ═══════════════════════════════════════════════════
// FOCUS HUD OVERLAY
// ═══════════════════════════════════════════════════

const FOCUS_QUOTES = [
  '"The secret of getting ahead is getting started." — Mark Twain',
  '"You don\'t have to be great to start, but you have to start to be great."',
  '"Done is better than perfect." — Mark Zuckerberg',
  '"Deep work is the ability to focus without distraction." — Cal Newport',
  '"One task at a time. This one. Right now."',
  '"Every minute you spend in focused work is a minute you save later."',
];
let _focusQuoteInterval = null;

function openFocusHUD() {
  const overlay = document.getElementById('focus-hud-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const taskNameEl = document.getElementById('focus-task-display');
  const hudTaskName = document.getElementById('focus-hud-task-name');
  if (hudTaskName && taskNameEl) hudTaskName.textContent = taskNameEl.textContent || 'Current Task';
  syncFocusHUDTimer();
  startFocusHUDQuotes();
}

function closeFocusHUD() {
  document.getElementById('focus-hud-overlay')?.classList.add('hidden');
  clearInterval(_focusQuoteInterval);
}

function exitFocusHUD() {
  if (confirm('Are you sure? Breaking the flow will stop your timer.')) {
    closeFocusHUD();
    if (AppState.timerRunning) toggleTimer();
  }
}

function startFocusHUDQuotes() {
  const quoteEl = document.getElementById('focus-hud-quote');
  if (!quoteEl) return;
  let idx = 0;
  quoteEl.textContent = FOCUS_QUOTES[idx];
  clearInterval(_focusQuoteInterval);
  _focusQuoteInterval = setInterval(() => {
    idx = (idx + 1) % FOCUS_QUOTES.length;
    quoteEl.style.opacity = '0';
    setTimeout(() => { quoteEl.textContent = FOCUS_QUOTES[idx]; quoteEl.style.opacity = '1'; }, 400);
  }, 30000);
}

function syncFocusHUDTimer() {
  const hudTimer = document.getElementById('focus-hud-timer');
  const mainTimer = document.getElementById('timer-display');
  if (hudTimer && mainTimer) hudTimer.textContent = mainTimer.textContent;
}

// ═══════════════════════════════════════════════════
// AI INSIGHTS CAROUSEL (Day 2.4 Upgrade)
// ═══════════════════════════════════════════════════

let carouselInsights = [
  {
    headline: "Beat Procrastination",
    explanation: "You have tasks due soon. Try starting a focus session right now to build momentum.",
    cta: "Start Focus",
    action: "focus"
  },
  {
    headline: "Snooze Less, Do More",
    explanation: "Snoozing tasks is a trap. Break your largest tasks down into smaller steps to make them easier to start.",
    cta: "Break Down",
    action: "tasks"
  },
  {
    headline: "Track Habits Daily",
    explanation: "Consistent habits build long-term productivity. Take a second to check off your habits today.",
    cta: "View Habits",
    action: "habits"
  }
];
let currentCarouselIndex = 0;
let carouselTimer = null;
let carouselProgressInterval = null;
let carouselProgressPercent = 0;

function initCarousel() {
  renderCarouselSlide();
  startCarouselTimer();
  
  // Try loading live AI insights on load
  if (GeminiClient.isConfigured() && navigator.onLine) {
    setTimeout(fetchAICarouselInsights, 1500);
  }
}

function renderCarouselSlide() {
  const headlineEl = document.getElementById('carousel-headline');
  const explanationEl = document.getElementById('carousel-explanation');
  const ctaEl = document.getElementById('carousel-cta-btn');
  const dots = document.querySelectorAll('.carousel-dot');
  
  if (!headlineEl || !explanationEl || !ctaEl) return;
  
  const current = carouselInsights[currentCarouselIndex];
  
  // Fade out effect
  headlineEl.style.opacity = '0';
  explanationEl.style.opacity = '0';
  ctaEl.style.opacity = '0';
  
  setTimeout(() => {
    headlineEl.textContent = current.headline;
    explanationEl.textContent = current.explanation;
    ctaEl.textContent = current.cta;
    
    // Fade in
    headlineEl.style.opacity = '1';
    explanationEl.style.opacity = '1';
    ctaEl.style.opacity = '1';
  }, 200);
  
  // Update dots
  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentCarouselIndex);
  });
}

function startCarouselTimer() {
  clearInterval(carouselTimer);
  clearInterval(carouselProgressInterval);
  carouselProgressPercent = 0;
  
  const progressBar = document.getElementById('carousel-progress-bar');
  if (progressBar) progressBar.style.width = '0%';
  
  carouselProgressInterval = setInterval(() => {
    carouselProgressPercent += (100 / 300); // 30 seconds total
    if (progressBar) progressBar.style.width = `${Math.min(carouselProgressPercent, 100)}%`;
  }, 100);
  
  carouselTimer = setInterval(() => {
    nextCarouselSlide();
  }, 30000);
}

function nextCarouselSlide() {
  if (carouselInsights.length === 0) return;
  currentCarouselIndex = (currentCarouselIndex + 1) % carouselInsights.length;
  renderCarouselSlide();
  startCarouselTimer();
}

function setCarouselSlide(index) {
  currentCarouselIndex = index;
  renderCarouselSlide();
  startCarouselTimer();
}

function handleCarouselCTA() {
  const current = carouselInsights[currentCarouselIndex];
  if (!current) return;
  
  if (current.action === 'focus') {
    navigateTo('focus');
  } else if (current.action === 'tasks') {
    navigateTo('tasks');
  } else if (current.action === 'habits') {
    navigateTo('habits');
  } else if (current.action === 'analytics') {
    navigateTo('analytics');
  }
}

function fetchAICarouselInsights() {
  const tasks = TaskStore.getAll();
  const habits = AppState.habits;
  
  GeminiClient.generateCarouselInsights(
    tasks,
    habits,
    (jsonText) => {
      try {
        let cleanJSON = jsonText.trim();
        if (cleanJSON.startsWith('```')) {
          cleanJSON = cleanJSON.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        }
        const parsed = JSON.parse(cleanJSON);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          carouselInsights = parsed.slice(0, 3);
          currentCarouselIndex = 0;
          renderCarouselSlide();
          startCarouselTimer();
          console.log('[AI Insights] Dashboard carousel updated with live coaching cards.');
        }
      } catch (e) {
        console.error('[AI Insights] Failed to parse carousel JSON, falling back to defaults:', e);
      }
    },
    (err) => {
      console.warn('[AI Insights] Failed to load live carousel suggestions:', err);
    }
  );
}

// Attach functions globally for inline HTML click events
window.setCarouselSlide = setCarouselSlide;
window.handleCarouselCTA = handleCarouselCTA;
window.initCarousel = initCarousel;


// ═══════════════════════════════════════════════════
// KANBAN VIEW & DRAG AND DROP (Day 4.1 Upgrade)
// ═══════════════════════════════════════════════════

function setTasksViewMode(mode) {
  AppState.tasksViewMode = mode;
  localStorage.setItem('lmls_tasks_view_mode', mode);
  
  const listBtn = document.getElementById('btn-list-view');
  const kanbanBtn = document.getElementById('btn-kanban-view');
  const listGrid = document.getElementById('task-grid');
  const kanbanBoard = document.getElementById('kanban-board');
  
  if (mode === 'kanban') {
    listBtn?.classList.remove('active');
    kanbanBtn?.classList.add('active');
    listGrid?.classList.add('hidden');
    kanbanBoard?.classList.remove('hidden');
  } else {
    listBtn?.classList.add('active');
    kanbanBtn?.classList.remove('active');
    listGrid?.classList.remove('hidden');
    kanbanBoard?.classList.add('hidden');
  }
  
  renderTasksView();
}

function handleKanbanDragStart(e, id) {
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.classList.add('drag-active');
  });
}

function allowDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  if (col && col.classList.contains('kanban-column')) {
    col.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const col = e.currentTarget;
  if (col && col.classList.contains('kanban-column')) {
    col.classList.remove('drag-over');
  }
}

function handleKanbanDrop(e, status) {
  e.preventDefault();
  document.querySelectorAll('.kanban-column').forEach(col => {
    col.classList.remove('drag-active', 'drag-over');
  });
  
  const id = e.dataTransfer.getData('text/plain');
  if (!id) return;
  
  const task = TaskStore.getById(id);
  if (!task) return;
  
  if (typeof isTaskDependencyLocked === 'function' && isTaskDependencyLocked(task)) {
    showToast(`Task is locked because it depends on: "${TaskStore.getById(task.dependsOn)?.title}"`, 'error');
    return;
  }
  
  const oldStatus = task.status;
  if (oldStatus === status) return;
  
  if (status === 'completed') {
    toggleTaskComplete(id);
  } else {
    if (oldStatus === 'completed') {
      toggleTaskComplete(id);
      TaskStore.update(id, { status: status });
    } else {
      TaskStore.update(id, { status: status });
      showToast(`Task moved to ${status.replace('_', ' ')}`, 'success');
    }
    refreshAll();
    renderTasksView();
  }
}

function renderKanbanBoard(tasks) {
  const kanbanBoard = document.getElementById('kanban-board');
  if (!kanbanBoard) return;
  
  const todoContainer = document.getElementById('kanban-cards-todo');
  const progressContainer = document.getElementById('kanban-cards-progress');
  const doneContainer = document.getElementById('kanban-cards-done');
  if (!todoContainer || !progressContainer || !doneContainer) return;
  
  todoContainer.innerHTML = '';
  progressContainer.innerHTML = '';
  doneContainer.innerHTML = '';
  
  const todoTasks = tasks.filter(t => t.status === 'pending');
  const progressTasks = tasks.filter(t => t.status === 'in_progress');
  const doneTasks = tasks.filter(t => t.status === 'completed');
  
  const countTodo = document.getElementById('kanban-count-todo');
  const countProgress = document.getElementById('kanban-count-progress');
  const countDone = document.getElementById('kanban-count-done');
  if (countTodo) countTodo.textContent = todoTasks.length;
  if (countProgress) countProgress.textContent = progressTasks.length;
  if (countDone) countDone.textContent = doneTasks.length;
  
  if (todoTasks.length === 0) {
    todoContainer.innerHTML = '<div class="kanban-empty-column">No tasks</div>';
  } else {
    todoContainer.innerHTML = todoTasks.map(renderTaskCard).join('');
  }
  
  if (progressTasks.length === 0) {
    progressContainer.innerHTML = '<div class="kanban-empty-column">No tasks</div>';
  } else {
    progressContainer.innerHTML = progressTasks.map(renderTaskCard).join('');
  }
  
  if (doneTasks.length === 0) {
    doneContainer.innerHTML = '<div class="kanban-empty-column">No tasks</div>';
  } else {
    doneContainer.innerHTML = doneTasks.map(renderTaskCard).join('');
  }
  
  addTiltEffect();
}

// ═══════════════════════════════════════════════════
// TASK DEPENDENCIES DROPDOWN POPULATION (Day 4.2 Upgrade)
// ═══════════════════════════════════════════════════

function populateDependencyDropdown(excludeId = null) {
  const select = document.getElementById('task-depends-input');
  if (!select) return;
  select.innerHTML = '<option value="">None</option>';
  
  const tasks = TaskStore.getAll().filter(t => t.id !== excludeId && t.status !== 'completed');
  tasks.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.title} (${t.priority})`;
    select.appendChild(opt);
  });
}

// ═══════════════════════════════════════════════════
// UNDO ENGINE (Day 6.5 Upgrade)
// ═══════════════════════════════════════════════════

const UndoStack = {
  stack: [],
  push(action) {
    this.stack.push(action);
    if (this.stack.length > 10) this.stack.shift();
  },
  pop() {
    return this.stack.pop();
  },
  undo() {
    const action = this.pop();
    if (!action) {
      showToast('Nothing to undo', 'info');
      return;
    }
    
    switch (action.type) {
      case 'delete':
        TaskStore.restore(action.task);
        showToast(`Undid: Restored task "${action.task.title}"`, 'success');
        break;
        
      case 'complete':
        const task = TaskStore.getById(action.taskId);
        if (task) {
          TaskStore.complete(action.taskId);
          showToast(`Undid completion of "${task.title}"`, 'success');
        }
        break;
        
      case 'add':
        TaskStore.remove(action.taskId);
        showToast(`Undid: Removed task "${action.title}"`, 'success');
        break;
        
      case 'snooze':
        const t = TaskStore.getById(action.taskId);
        if (t) {
          TaskStore.update(action.taskId, { deadline: action.prevDeadline });
          showToast(`Undid snooze of "${t.title}"`, 'success');
        }
        break;
    }
    
    refreshAll();
    if (AppState.currentView === 'tasks') renderTasksView();
  }
};

window.UndoStack = UndoStack;

// ═══════════════════════════════════════════════════
// MOBILE SWIPE ACTIONS (Day 4.4 Upgrade)
// ═══════════════════════════════════════════════════

function initSwipeActions() {
  const grid = document.getElementById('task-grid');
  if (!grid) return;
  
  let touchStartX = 0;
  let touchStartY = 0;
  let activeCard = null;
  let currentDeltaX = 0;
  let isSwiping = false;

  grid.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.task-card');
    if (!card || card.classList.contains('dependency-locked') || card.classList.contains('completed')) return;
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
    
    activeCard = card;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    currentDeltaX = 0;
    isSwiping = false;
    card.style.transition = 'none';
  }, { passive: true });

  grid.addEventListener('touchmove', (e) => {
    if (!activeCard) return;
    
    const deltaX = e.touches[0].clientX - touchStartX;
    const deltaY = e.touches[0].clientY - touchStartY;
    
    if (!isSwiping && Math.abs(deltaY) > Math.abs(deltaX)) {
      activeCard = null;
      return;
    }
    
    isSwiping = true;
    currentDeltaX = deltaX;
    
    let translateX = deltaX;
    if (deltaX > 80) {
      translateX = 80 + (deltaX - 80) * 0.2;
    } else if (deltaX < -150) {
      translateX = -150 + (deltaX + 150) * 0.2;
    }
    
    activeCard.style.transform = `translateX(${translateX}px)`;
    
    let overlay = activeCard.querySelector('.swipe-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'swipe-overlay';
      activeCard.appendChild(overlay);
    }
    
    if (deltaX > 20) {
      overlay.className = 'swipe-overlay right';
      overlay.textContent = '✅ Complete';
      overlay.style.opacity = Math.min(0.8, (deltaX - 20) / 60);
    } else if (deltaX < -20) {
      overlay.className = 'swipe-overlay left';
      if (deltaX < -100) {
        overlay.textContent = '🗑️ Delete';
        overlay.classList.add('delete-trigger');
      } else {
        overlay.textContent = '⏱️ Snooze';
        overlay.classList.remove('delete-trigger');
      }
      overlay.style.opacity = Math.min(0.8, (-deltaX - 20) / 60);
    } else {
      overlay.style.opacity = 0;
    }
  }, { passive: true });

  grid.addEventListener('touchend', (e) => {
    if (!activeCard) return;
    
    const card = activeCard;
    const id = card.dataset.id;
    activeCard = null;
    
    card.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    const overlay = card.querySelector('.swipe-overlay');
    if (overlay) overlay.remove();
    
    if (currentDeltaX > 80) {
      card.style.transform = 'translateX(100%)';
      setTimeout(() => {
        toggleTaskComplete(id);
      }, 200);
    } else if (currentDeltaX < -120) {
      card.style.transform = 'translateX(-100%)';
      setTimeout(() => {
        handleSwipeDelete(id);
      }, 200);
    } else if (currentDeltaX < -50) {
      card.style.transform = 'translateX(0)';
      snoozeTaskOneHour(id);
    } else {
      card.style.transform = 'translateX(0)';
    }
  });
}

function handleSwipeDelete(id) {
  const task = TaskStore.getById(id);
  if (!task) return;
  
  UndoStack.push({ type: 'delete', task: { ...task } });
  TaskStore.remove(id);
  showToast('Task deleted. <button class="btn btn-ghost btn-sm" style="color:var(--primary-light); padding:2px 6px; margin-left:8px; border:1px solid rgba(255,255,255,0.2)" onclick="UndoStack.undo(); event.stopPropagation();">Undo</button>', 'info');
  
  refreshAll();
  if (AppState.currentView === 'tasks') renderTasksView();
}

function snoozeTaskOneHour(id) {
  const task = TaskStore.getById(id);
  if (!task) return;
  
  const now = new Date();
  const prevDeadline = task.deadline;
  const baseDate = task.deadline && task.deadline > now ? task.deadline : now;
  const newDeadline = new Date(baseDate.getTime() + 60 * 60 * 1000);
  
  UndoStack.push({ type: 'snooze', taskId: id, prevDeadline });
  TaskStore.update(id, { deadline: newDeadline });
  showToast(`Snoozed "${task.title}" by 1 hour ⏰. <button class="btn btn-ghost btn-sm" style="color:var(--primary-light); padding:2px 6px; margin-left:8px; border:1px solid rgba(255,255,255,0.2)" onclick="UndoStack.undo(); event.stopPropagation();">Undo</button>`, 'info');
  
  refreshAll();
  if (AppState.currentView === 'tasks') renderTasksView();
}

// Global window mappings for HTML events
window.setTasksViewMode = setTasksViewMode;
window.handleKanbanDragStart = handleKanbanDragStart;
window.allowDrop = allowDrop;
window.handleDragLeave = handleDragLeave;
window.handleKanbanDrop = handleKanbanDrop;

// Heading modal action functions
function openAddHeadingModal() {
  document.getElementById('modal-heading-title').textContent = 'Add New Heading';
  document.getElementById('save-heading-btn').textContent = 'Save Heading';
  document.getElementById('heading-edit-id').value = '';
  document.getElementById('heading-title-input').value = '';
  showModal('modal-heading');
}

function openEditHeading(id) {
  const heading = TaskStore.getById(id);
  if (!heading) return;

  document.getElementById('modal-heading-title').textContent = 'Edit Heading';
  document.getElementById('save-heading-btn').textContent = 'Update Heading';
  document.getElementById('heading-edit-id').value = id;
  document.getElementById('heading-title-input').value = heading.title;

  showModal('modal-heading');
}

function closeHeadingModal() {
  closeModal();
}

function saveHeading() {
  const id = document.getElementById('heading-edit-id').value;
  const title = document.getElementById('heading-title-input').value.trim();

  if (!title) {
    showToast('Heading title is required!', 'error');
    return;
  }

  if (id) {
    TaskStore.update(id, { title });
    showToast('✅ Heading updated!', 'success');
  } else {
    TaskStore.add({
      title,
      isHeading: true,
      priority: 'low'
    });
    showToast('✅ Heading created!', 'success');
  }

  closeHeadingModal();
  refreshAll();
  if (AppState.currentView === 'tasks') {
    renderTasksView();
  }
}

// Window mappings
window.openAddHeadingModal = openAddHeadingModal;
window.openEditHeading = openEditHeading;
window.closeHeadingModal = closeHeadingModal;
window.saveHeading = saveHeading;


// ═══════════════════════════════════════════════════════
// CUSTOM CATEGORIES ACTIONS
// ═══════════════════════════════════════════════════════
let selectedCategoryEmoji = '🏷️';

function openAddCategoryModal() {
  const modal = document.getElementById('modal-category');
  if (!modal) return;
  
  document.getElementById('category-name-input').value = '';
  const picker = document.getElementById('category-emoji-picker');
  if (picker) {
    picker.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
    const defaultOpt = picker.querySelector('[data-emoji="🏷️"]');
    if (defaultOpt) defaultOpt.classList.add('selected');
  }
  selectedCategoryEmoji = '🏷️';
  
  showModal('modal-category');
}

function closeCategoryModal() {
  closeModal();
}

function saveCategory() {
  const nameInput = document.getElementById('category-name-input');
  if (!nameInput) return;
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Category name is required!', 'error');
    return;
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (id === 'all' || id === '') {
    showToast('Invalid category name!', 'error');
    return;
  }

  const picker = document.getElementById('category-emoji-picker');
  const emoji = picker?.querySelector('.emoji-option.selected')?.dataset.emoji || '🏷️';

  let customCats = [];
  try {
    const raw = localStorage.getItem('lmls_custom_categories');
    customCats = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading custom categories:', e);
  }

  const exists = customCats.some(c => c.id === id || c.name.toLowerCase() === name.toLowerCase());
  const isDefault = ['work', 'personal', 'health', 'finance', 'education', 'other'].includes(id);
  if (exists || isDefault) {
    showToast('This category already exists!', 'warning');
    return;
  }

  customCats.push({ id, name, emoji });
  
  try {
    localStorage.setItem('lmls_custom_categories', JSON.stringify(customCats));
  } catch (e) {
    console.error('Error saving custom categories:', e);
  }

  showToast(`🏷️ Category "${name}" created!`, 'success');
  closeCategoryModal();
  populateCategoryDropdowns();
}

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById('category-filter');
  const inputSelect = document.getElementById('task-category-input');
  if (!filterSelect || !inputSelect) return;

  let customCats = [];
  try {
    const raw = localStorage.getItem('lmls_custom_categories');
    customCats = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error loading custom categories:', e);
  }

  const activeFilterValue = filterSelect.value || 'all';
  const activeInputValue = inputSelect.value || 'work';

  filterSelect.innerHTML = '<option value="all">Category: All</option>';
  filterSelect.innerHTML += `
    <option value="work">💼 Work</option>
    <option value="personal">🏠 Personal</option>
    <option value="health">💖 Health</option>
    <option value="finance">💰 Finance</option>
    <option value="education">📚 Education</option>
    <option value="other">📌 Other</option>
  `;
  customCats.forEach(cat => {
    filterSelect.innerHTML += `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`;
  });

  inputSelect.innerHTML = `
    <option value="work">💼 Work</option>
    <option value="personal">🏠 Personal</option>
    <option value="health">💖 Health</option>
    <option value="finance">💰 Finance</option>
    <option value="education">📚 Education</option>
    <option value="other">📌 Other</option>
  `;
  customCats.forEach(cat => {
    inputSelect.innerHTML += `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`;
  });

  filterSelect.value = activeFilterValue;
  inputSelect.value = activeInputValue;

  if (typeof initCustomSelects === 'function') {
    initCustomSelects();
  }
}

window.openAddCategoryModal = openAddCategoryModal;
window.closeCategoryModal = closeCategoryModal;
window.saveCategory = saveCategory;
window.populateCategoryDropdowns = populateCategoryDropdowns;



