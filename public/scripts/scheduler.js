/**
 * LMLS — Last-Minute Life Saver
 * scheduler.js — Drag-and-drop scheduling engine and conflict detection
 */

'use strict';

const Scheduler = {
  init() {
    this.bindDragAndDrop();
    this.renderSidebar();
  },

  bindDragAndDrop() {
    const blocksCol = document.getElementById('schedule-blocks-col');
    if (!blocksCol) return;

    // Prevent default to allow drop
    blocksCol.addEventListener('dragover', (e) => {
      e.preventDefault();
      blocksCol.classList.add('drag-over');
    });

    blocksCol.addEventListener('dragleave', () => {
      blocksCol.classList.remove('drag-over');
    });

    blocksCol.addEventListener('drop', (e) => {
      e.preventDefault();
      blocksCol.classList.remove('drag-over');

      const taskId = e.dataTransfer.getData('text/plain');
      if (!taskId) return;

      const task = TaskStore.getById(taskId);
      if (!task) return;

      // Calculate time based on drop Y coordinate
      const rect = blocksCol.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const scrollOffset = blocksCol.scrollTop;
      const adjustedY = y + scrollOffset;
      const totalHeight = blocksCol.scrollHeight;

      const startHour = 6;
      const endHour = 23;
      const totalHours = endHour - startHour;

      const pct = adjustedY / totalHeight;
      const hourOffset = pct * totalHours;
      const totalMinutes = Math.round(hourOffset * 60);
      
      let targetHours = startHour + Math.floor(totalMinutes / 60);
      let targetMinutes = totalMinutes % 60;

      // Round to nearest 15 minutes
      targetMinutes = Math.round(targetMinutes / 15) * 15;
      if (targetMinutes === 60) {
        targetMinutes = 0;
        targetHours += 1;
      }

      // Clamp hours
      targetHours = Math.max(startHour, Math.min(endHour, targetHours));

      // Construct new deadline date
      const newDeadline = new Date(AppState.scheduleDate);
      newDeadline.setHours(targetHours, targetMinutes, 0, 0);

      // Save task updates
      TaskStore.update(taskId, {
        deadline: newDeadline
      });

      // Refresh UI
      refreshAll();
      renderSchedule();
      this.renderSidebar();

      const timeStr = newDeadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      showToast(`🎯 Scheduled "${task.title}" at ${timeStr}`, 'success');
    });
  },

  renderSidebar() {
    const listEl = document.getElementById('unscheduled-tasks-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');

    if (tasks.length === 0) {
      listEl.innerHTML = `
        <div class="sidebar-empty-state">
          <p>No pending tasks</p>
          <button class="btn btn-ghost btn-sm" onclick="openAddTaskModal()">+ Add Task</button>
        </div>
      `;
      return;
    }

    tasks.forEach(task => {
      const card = document.createElement('div');
      card.className = 'schedule-drag-card';
      card.draggable = true;
      card.dataset.taskId = task.id;
      
      const priorityClass = `priority-${task.priority}`;
      const est = task.estimatedMin || 30;
      const urgency = task.urgencyScore || 0;

      card.innerHTML = `
        <div class="drag-card-header">
          <span class="priority-dot ${priorityClass}"></span>
          <span class="drag-card-title">${escapeHtml(task.title)}</span>
        </div>
        <div class="drag-card-meta">
          <span>⏱️ ${est} min</span>
          <span class="urgency-badge ${urgency >= 60 ? 'high' : urgency >= 30 ? 'medium' : 'low'}">Score: ${urgency}</span>
        </div>
      `;

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      listEl.appendChild(card);
    });
  },

  detectConflicts(date) {
    const tasks = TaskStore.getAll().filter(
      t => t.status !== 'completed' && t.deadline && t.deadline.toDateString() === date.toDateString()
    );
    
    // Sort by deadline
    tasks.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
    
    const conflicts = new Set();
    for (let i = 0; i < tasks.length - 1; i++) {
      const current = tasks[i];
      const next = tasks[i + 1];
      
      const currentStart = current.deadline.getTime();
      const currentEnd = currentStart + (current.estimatedMin || 30) * 60 * 1000;
      const nextStart = next.deadline.getTime();

      if (currentEnd > nextStart) {
        conflicts.add(current.id);
        conflicts.add(next.id);
      }
    }
    return conflicts;
  }
};
