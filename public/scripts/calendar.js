/**
 * LMLS — Last-Minute Life Saver
 * calendar.js — Google Calendar API v3 integration with OAuth 2.0
 *
 * Setup (one-time by user):
 *  1. Go to https://console.cloud.google.com
 *  2. Create a project → Enable "Google Calendar API"
 *  3. OAuth 2.0 > Create credentials > Web application
 *     - Authorised JS origins: (leave empty for file://)
 *     - Authorised redirect URIs: (leave empty)
 *  4. Copy the Client ID and paste it in Settings > Google Calendar
 *
 * Uses the Google Identity Services (GIS) token model (implicit grant)
 * No server required — works from file:// protocol.
 */

'use strict';

const CalendarClient = {
  // ─── State ────────────────────────────────────────────────────────────
  accessToken: null,
  tokenExpiry: 0,
  clientId: '',
  calendarEvents: [],        // cached GCal events
  tokenClient: null,         // GIS TokenClient
  gisLoaded: false,
  gisInitialised: false,
  STORAGE_KEY: 'lmls_gcal',

  getStorageKey() {
    return this.STORAGE_KEY;
  },

  // ─── Init ─────────────────────────────────────────────────────────────
  init() {
    const saved = this._loadState();
    if (saved) {
      this.clientId    = saved.clientId    || '';
      this.accessToken = saved.accessToken || null;
      this.tokenExpiry = saved.tokenExpiry || 0;
      this.calendarEvents = saved.events   || [];
    }

    // Restore Client ID in settings field
    const input = document.getElementById('gcal-client-id-input');
    if (input) input.value = this.clientId || '';

    this._updateSettingsUI();
    this._updateDashboardCard();

    // Auto-sync upcoming events on load if authenticated
    if (this.isSignedIn()) {
      this.fetchUpcomingEvents()
        .then(() => {
          this._updateDashboardCard();
          if (typeof AppState !== 'undefined' && AppState.currentView === 'schedule' && typeof renderSchedule === 'function') {
            renderSchedule();
          }
        })
        .catch(err => console.warn('Auto-sync failed on init:', err));
    }
  },

  // ─── GIS Loading ─────────────────────────────────────────────────────
  loadGIS() {
    return new Promise((resolve, reject) => {
      if (this.gisLoaded) { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => { this.gisLoaded = true; resolve(); };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });
  },

  async _ensureTokenClient() {
    if (!this.clientId) throw new Error('Google Client ID not configured.');
    if (this.gisInitialised && this.tokenClient) return;

    await this.loadGIS();

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: 'https://www.googleapis.com/auth/calendar',
      callback: (response) => {
        if (response.error) {
          this._onAuthError(response.error);
          return;
        }
        this.accessToken = response.access_token;
        this.tokenExpiry = Date.now() + (response.expires_in - 60) * 1000;
        this._saveState();
        this._updateSettingsUI();
        showToast('✅ Google Calendar connected!', 'success');
        // After auth, fetch events
        this.fetchUpcomingEvents().then(() => {
          this._updateDashboardCard();
          if (AppState.currentView === 'schedule') renderSchedule();
        });
      }
    });
    this.gisInitialised = true;
  },

  // ─── Auth ─────────────────────────────────────────────────────────────
  async signIn() {
    const clientIdInput = document.getElementById('gcal-client-id-input');
    const id = clientIdInput?.value.trim();
    if (!id) {
      showToast('Please enter your Google OAuth Client ID first.', 'warning');
      return;
    }
    this.clientId = id;
    this._saveState();

    try {
      await this._ensureTokenClient();
      // Request access token (shows Google consent popup)
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      console.error('GIS init error:', err);
      showToast(`❌ ${err.message}`, 'error');
    }
  },

  signOut() {
    if (this.accessToken) {
      try {
        google.accounts.oauth2.revoke(this.accessToken, () => {
          console.log('GCal token revoked');
        });
      } catch (e) { /* silent */ }
    }
    this.accessToken = null;
    this.tokenExpiry = 0;
    this.calendarEvents = [];
    this._saveState();
    this._updateSettingsUI();
    this._updateDashboardCard();
    showToast('Google Calendar disconnected.', 'info');
    if (AppState.currentView === 'schedule') renderSchedule();
  },

  isSignedIn() {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  },

  _onAuthError(error) {
    console.error('GCal auth error:', error);
    showToast(`❌ Google auth failed: ${error}`, 'error');
    this.accessToken = null;
    this.tokenExpiry = 0;
    this._updateSettingsUI();
  },

  // ─── API Calls ────────────────────────────────────────────────────────
  async _apiCall(method, url, body = null) {
    if (!this.isSignedIn()) {
      throw new Error('Not authenticated. Please connect Google Calendar first.');
    }

    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type':  'application/json',
      }
    };
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `HTTP ${resp.status}`);
    }
    if (resp.status === 204) return null; // DELETE success
    return resp.json();
  },

  // Fetch upcoming events from primary calendar (next 7 days)
  async fetchUpcomingEvents(calendarId = 'primary') {
    const now = new Date();
    const maxTime = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?orderBy=startTime&singleEvents=true` +
      `&timeMin=${encodeURIComponent(now.toISOString())}` +
      `&timeMax=${encodeURIComponent(maxTime.toISOString())}` +
      `&maxResults=50`;

    const data = await this._apiCall('GET', url);
    this.calendarEvents = (data.items || []).map(ev => ({
      id:        ev.id,
      title:     ev.summary || '(No title)',
      start:     new Date(ev.start?.dateTime || ev.start?.date),
      end:       new Date(ev.end?.dateTime   || ev.end?.date),
      location:  ev.location || '',
      description: ev.description || '',
      htmlLink:  ev.htmlLink || '',
      source:    'gcal',   // tag as Google Calendar event
    }));
    this._saveState();
    return this.calendarEvents;
  },

  // Create a Google Calendar event from an LMLS task
  async createEventFromTask(task) {
    if (!task.deadline) throw new Error('Task has no deadline to schedule.');

    const start = new Date(task.deadline);
    const end   = new Date(start.getTime() + (task.estimatedMin || 30) * 60 * 1000);

    const event = {
      summary:     task.title,
      description: `${task.description || ''}\n\nCreated by LMLS – Last-Minute Life Saver\nPriority: ${task.priority}\nCategory: ${task.category}`,
      start:       { dateTime: start.toISOString() },
      end:         { dateTime: end.toISOString()   },
      colorId:     this._priorityToColorId(task.priority),
    };

    const created = await this._apiCall('POST',
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      event
    );

    // Store the GCal event ID on the task so we can update/delete it later
    TaskStore.update(task.id, { gcalEventId: created.id });
    showToast(`📅 "${task.title}" added to Google Calendar`, 'success');
    await this.fetchUpcomingEvents();
    return created;
  },

  // Update GCal event when task is updated
  async updateEventFromTask(task) {
    if (!task.gcalEventId) return this.createEventFromTask(task);
    if (!task.deadline) return;

    const start = new Date(task.deadline);
    const end   = new Date(start.getTime() + (task.estimatedMin || 30) * 60 * 1000);

    const patch = {
      summary:  task.title,
      start:    { dateTime: start.toISOString() },
      end:      { dateTime: end.toISOString()   },
      colorId:  this._priorityToColorId(task.priority),
    };

    if (task.status === 'completed') {
      patch.status = 'confirmed';
      patch.summary = `✅ ${task.title}`;
    }

    await this._apiCall('PATCH',
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.gcalEventId}`,
      patch
    );
    await this.fetchUpcomingEvents();
  },

  // Delete GCal event when task is deleted
  async deleteEventFromTask(task) {
    if (!task.gcalEventId) return;
    await this._apiCall('DELETE',
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.gcalEventId}`
    );
    await this.fetchUpcomingEvents();
  },

  // ─── Meeting Conflict Detection ───────────────────────────────────────
  detectMeetingConflicts(tasks) {
    const conflicts = [];
    const now = Date.now();

    tasks.forEach(task => {
      if (!task.deadline || task.status === 'completed') return;
      const taskStart = task.deadline.getTime();
      const taskEnd   = taskStart + (task.estimatedMin || 30) * 60 * 1000;

      this.calendarEvents.forEach(ev => {
        if (ev.end.getTime() < now) return; // past event
        const evStart = ev.start.getTime();
        const evEnd   = ev.end.getTime();

        // Overlap check
        if (taskStart < evEnd && taskEnd > evStart) {
          conflicts.push({ task, event: ev });
        }
      });
    });
    return conflicts;
  },

  // Get AI context string of upcoming meetings for Gemini prompts
  getCalendarContextString() {
    if (!this.calendarEvents.length) return '';
    const upcoming = this.calendarEvents.slice(0, 10);
    let str = '\n\nUPCOMING GOOGLE CALENDAR EVENTS (next 7 days):\n';
    upcoming.forEach(ev => {
      const start = ev.start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      str += `- ${ev.title} at ${start}${ev.location ? ' @ ' + ev.location : ''}\n`;
    });
    return str;
  },

  // ─── UI Updates ───────────────────────────────────────────────────────
  _updateSettingsUI() {
    const statusBadge  = document.getElementById('gcal-status-badge');
    const connectBtn   = document.getElementById('gcal-connect-btn');
    const disconnectBtn= document.getElementById('gcal-disconnect-btn');
    const syncBtn      = document.getElementById('gcal-sync-btn');
    const eventsCount  = document.getElementById('gcal-events-count');

    const connected = this.isSignedIn();

    if (statusBadge) {
      statusBadge.textContent = connected ? '🟢 Connected' : '⚪ Disconnected';
      statusBadge.className   = `gcal-status-badge ${connected ? 'connected' : 'disconnected'}`;
    }
    if (connectBtn)    connectBtn.style.display    = connected ? 'none' : 'flex';
    if (disconnectBtn) disconnectBtn.style.display = connected ? 'flex' : 'none';
    if (syncBtn)       syncBtn.style.display       = connected ? 'flex' : 'none';
    if (eventsCount)   eventsCount.textContent     = connected ? `${this.calendarEvents.length} events synced` : '';
  },

  _updateDashboardCard() {
    const card = document.getElementById('gcal-dashboard-card');
    if (!card) return;

    const manualEvents = typeof ManualEventStore !== 'undefined' ? ManualEventStore.getAll() : [];
    const now = Date.now();

    // Map manual events to standardized objects with start/end Date objects
    const standardEvents = manualEvents.map(ev => {
      const start = new Date(`${ev.date}T${ev.startTime}`);
      const end = new Date(`${ev.date}T${ev.endTime}`);
      return {
        id: ev.id,
        title: ev.title,
        start,
        end,
        color: ev.color,
        notes: ev.notes
      };
    });

    const upcoming = standardEvents
      .filter(ev => ev.end.getTime() > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 4);

    if (!upcoming.length) {
      card.innerHTML = `
        <div class="gcal-empty">
          <span class="gcal-empty-icon">📅</span>
          <p>No upcoming events scheduled.</p>
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('calendar')">Go to Calendar →</button>
        </div>`;
      return;
    }

    card.innerHTML = upcoming.map(ev => {
      const start = ev.start;
      const isToday = start.toDateString() === new Date().toDateString();
      const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
      const timeStr = isToday
        ? `Today ${start.toLocaleTimeString([], timeOptions)}`
        : start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' ' + start.toLocaleTimeString([], timeOptions);

      const diff = start.getTime() - now;
      const isSoon = diff > 0 && diff < 30 * 60 * 1000; // within 30 min

      const baseColor = ev.color || '#7c3aed';

      return `
        <div class="gcal-event-item ${isSoon ? 'gcal-event-item--soon' : ''}" style="cursor: pointer;" onclick="openManualEventModal('${ev.id}')">
          <div class="gcal-event-color-bar" style="background-color: ${baseColor};"></div>
          <div class="gcal-event-body">
            <div class="gcal-event-title">${this._escapeHtml(ev.title)}</div>
            <div class="gcal-event-time">${timeStr}${ev.notes ? ' · ' + this._escapeHtml(ev.notes) : ''}</div>
          </div>
          ${isSoon ? '<span class="gcal-soon-badge">SOON</span>' : ''}
        </div>`;
    }).join('');
  },

  // Update the schedule view to overlay Google Calendar events
  getEventsForDate(date) {
    const dateStr = date.toDateString();
    return this.calendarEvents.filter(ev => ev.start.toDateString() === dateStr);
  },

  // ─── Helpers ──────────────────────────────────────────────────────────
  _priorityToColorId(priority) {
    const map = { critical: '11', high: '6', medium: '5', low: '8' };
    return map[priority] || '5';
  },

  _escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  _saveState() {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify({
        clientId:    this.clientId,
        accessToken: this.accessToken,
        tokenExpiry: this.tokenExpiry,
        events:      this.calendarEvents,
      }));
    } catch (e) { console.warn('CalendarClient save error:', e); }
  },

  _loadState() {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Revive date objects from stored ISO strings
      if (data.events) {
        data.events = data.events.map(ev => ({
          ...ev,
          start: new Date(ev.start),
          end:   new Date(ev.end),
        }));
      }
      return data;
    } catch (e) { return null; }
  },
};

// ─── Global helper called from index.html ─────────────────────────────────
async function gcalConnect()    { await CalendarClient.signIn(); }
function gcalDisconnect()       { CalendarClient.signOut(); }
async function gcalSync() {
  const btn = document.getElementById('gcal-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Syncing...'; }
  try {
    await CalendarClient.fetchUpcomingEvents();
    CalendarClient._updateDashboardCard();
    CalendarClient._updateSettingsUI();
    if (AppState.currentView === 'schedule') renderSchedule();
    showToast(`✅ Synced ${CalendarClient.calendarEvents.length} events`, 'success');
  } catch (err) {
    showToast(`❌ Sync failed: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sync Now'; }
  }
}

function exportTaskToManualCalendar(taskId) {
  const task = TaskStore.getById(taskId);
  if (!task) return;

  if (!task.deadline) {
    showToast('Task must have a deadline to be added to the calendar.', 'warning');
    return;
  }

  // Check if already in manual calendar
  const events = ManualEventStore.getAll();
  const existingEventIdx = task.manualEventId ? events.findIndex(e => e.id === task.manualEventId) : -1;

  if (existingEventIdx !== -1) {
    // Toggle: remove it from the calendar
    const event = events[existingEventIdx];
    ManualEventStore.delete(event.id);
    TaskStore.update(task.id, { manualEventId: null });
    showToast(`🗑️ Removed "${task.title}" from Calendar`, 'info');
  } else {
    // Add new manual event
    const start = new Date(task.deadline);
    const end = new Date(start.getTime() + (task.estimatedMin || 30) * 60 * 1000);

    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    const padZero = (n) => String(n).padStart(2, '0');
    const startTimeStr = `${padZero(start.getHours())}:${padZero(start.getMinutes())}`;
    const endTimeStr = `${padZero(end.getHours())}:${padZero(end.getMinutes())}`;

    // Select color based on task priority
    const priorityColors = {
      critical: '#ef4444',
      high: '#f59e0b',
      medium: '#7c3aed',
      low: '#10b981'
    };
    const color = priorityColors[task.priority] || '#7c3aed';

    const newEvent = {
      title: task.title,
      date: dateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      color: color,
      notes: task.description || ''
    };

    const savedEvent = ManualEventStore.save(newEvent);
    TaskStore.update(task.id, { manualEventId: savedEvent.id });
    showToast(`📅 Added "${task.title}" to Calendar`, 'success');
  }

  // Refresh calendar display and task lists
  if (typeof CalendarClient !== 'undefined') {
    CalendarClient._updateDashboardCard();
  }
  if (typeof renderSchedule === 'function' && AppState.currentView === 'schedule') {
    renderSchedule();
  }
  if (typeof renderMonthlyCalendar === 'function' && AppState.currentView === 'calendar') {
    renderMonthlyCalendar();
  }
  if (typeof refreshAll === 'function') {
    refreshAll();
  }
  
  if (AppState.currentView === 'dashboard') {
    renderDashboard();
  } else if (AppState.currentView === 'tasks') {
    renderTasksView();
  }
}

window.exportTaskToManualCalendar = exportTaskToManualCalendar;
window.gcalExportTask = exportTaskToManualCalendar;


// ═══════════════════════════════════════════════════════
// MANUAL CALENDAR EVENT SYSTEM
// ═══════════════════════════════════════════════════════

const ManualEventStore = {
  STORAGE_KEY: 'lmls_manual_events',
  
  getStorageKey() {
    return this.STORAGE_KEY;
  },

  getAll() {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Error loading manual events:', e);
      return [];
    }
  },

  saveAll(events) {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(events));
    } catch (e) {
      console.error('Error saving manual events:', e);
    }
  },

  getById(id) {
    const events = this.getAll();
    return events.find(e => e.id === id);
  },

  save(eventData) {
    const events = this.getAll();
    if (eventData.id) {
      // Edit existing
      const idx = events.findIndex(e => e.id === eventData.id);
      if (idx !== -1) {
        events[idx] = { ...events[idx], ...eventData };
      } else {
        events.push(eventData);
      }
    } else {
      // Add new
      eventData.id = 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      events.push(eventData);
    }
    this.saveAll(events);
    return eventData;
  },

  delete(id) {
    const events = this.getAll();
    const filtered = events.filter(e => e.id !== id);
    this.saveAll(filtered);
  },

  getEventsForDate(date) {
    // Format as YYYY-MM-DD in local time
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const events = this.getAll();
    return events.filter(e => e.date === dateStr);
  }
};

let selectedManualEventColor = '#7c3aed';

function openManualEventModal(eventId = null) {
  const modal = document.getElementById('modal-manual-event');
  if (!modal) return;

  const titleEl = document.getElementById('manual-event-title');
  const idInput = document.getElementById('manual-event-id');
  const titleInput = document.getElementById('manual-event-title-input');
  const dateInput = document.getElementById('manual-event-date-input');
  const startInput = document.getElementById('manual-event-start-input');
  const endInput = document.getElementById('manual-event-end-input');
  const notesInput = document.getElementById('manual-event-notes-input');
  const deleteBtn = document.getElementById('manual-event-delete-btn');

  // Reset colors in UI
  document.querySelectorAll('#manual-event-color-picker .color-swatch').forEach(swatch => {
    swatch.classList.remove('active');
    if (swatch.getAttribute('data-color') === '#7c3aed') {
      swatch.classList.add('active');
    }
  });
  selectedManualEventColor = '#7c3aed';

  if (eventId) {
    // Editing existing event
    const ev = ManualEventStore.getById(eventId);
    if (!ev) return;
    
    titleEl.textContent = '✏️ Edit Calendar Event';
    idInput.value = ev.id;
    titleInput.value = ev.title || '';
    dateInput.value = ev.date || '';
    startInput.value = ev.startTime || '';
    endInput.value = ev.endTime || '';
    notesInput.value = ev.notes || '';
    selectedManualEventColor = ev.color || '#7c3aed';
    
    // Set selected color
    document.querySelectorAll('#manual-event-color-picker .color-swatch').forEach(swatch => {
      swatch.classList.remove('active');
      if (swatch.getAttribute('data-color') === selectedManualEventColor) {
        swatch.classList.add('active');
      }
    });

    deleteBtn.style.display = 'block';
  } else {
    // Adding new event
    titleEl.textContent = '📅 Add Calendar Event';
    idInput.value = '';
    titleInput.value = '';
    
    // Pre-fill date with currently selected schedule date
    let schedDate = new Date();
    if (typeof AppState !== 'undefined' && AppState.scheduleDate) {
      schedDate = AppState.scheduleDate;
    }
    const yyyy = schedDate.getFullYear();
    const mm = String(schedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(schedDate.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
    
    // Pre-fill time with current hour, and end hour = current hour + 1
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const nextHour = String((now.getHours() + 1) % 24).padStart(2, '0');
    startInput.value = `${currentHour}:00`;
    endInput.value = `${nextHour}:00`;
    
    notesInput.value = '';
    deleteBtn.style.display = 'none';
  }

  modal.classList.remove('hidden');
}

function closeManualEventModal() {
  const modal = document.getElementById('modal-manual-event');
  if (modal) modal.classList.add('hidden');
}

function selectEventColor(color, element) {
  selectedManualEventColor = color;
  document.querySelectorAll('#manual-event-color-picker .color-swatch').forEach(swatch => {
    swatch.classList.remove('active');
  });
  if (element) {
    element.classList.add('active');
  }
}

function saveManualEvent() {
  const id = document.getElementById('manual-event-id').value;
  const title = document.getElementById('manual-event-title-input').value.trim();
  const date = document.getElementById('manual-event-date-input').value;
  const startTime = document.getElementById('manual-event-start-input').value;
  const endTime = document.getElementById('manual-event-end-input').value;
  const notes = document.getElementById('manual-event-notes-input').value.trim();

  if (!title) {
    showToast('Event title is required.', 'warning');
    return;
  }
  if (!date) {
    showToast('Event date is required.', 'warning');
    return;
  }
  if (!startTime || !endTime) {
    showToast('Start and end times are required.', 'warning');
    return;
  }

  // Validate start time < end time
  if (startTime >= endTime) {
    showToast('End time must be after start time.', 'warning');
    return;
  }

  const eventData = {
    title,
    date,
    startTime,
    endTime,
    notes,
    color: selectedManualEventColor
  };
  
  if (id) {
    eventData.id = id;
  }

  ManualEventStore.save(eventData);
  showToast(id ? '✅ Event updated!' : '✅ Event created!', 'success');
  closeManualEventModal();
  
  if (typeof renderSchedule === 'function') {
    renderSchedule();
  }
  if (typeof renderMonthlyCalendar === 'function') {
    renderMonthlyCalendar();
  }
  if (typeof CalendarClient !== 'undefined' && typeof CalendarClient._updateDashboardCard === 'function') {
    CalendarClient._updateDashboardCard();
  }
}

function deleteManualEvent() {
  const id = document.getElementById('manual-event-id').value;
  if (!id) return;

  if (confirm('Are you sure you want to delete this event?')) {
    ManualEventStore.delete(id);
    showToast('🗑️ Event deleted.', 'info');
    closeManualEventModal();
    if (typeof renderSchedule === 'function') {
      renderSchedule();
    }
    if (typeof renderMonthlyCalendar === 'function') {
      renderMonthlyCalendar();
    }
    if (typeof CalendarClient !== 'undefined' && typeof CalendarClient._updateDashboardCard === 'function') {
      CalendarClient._updateDashboardCard();
    }
  }
}

// Helper to convert hex to rgb string (e.g. "#7c3aed" -> "124, 58, 237")
function hexToRgb(hex) {
  if (!hex) return '124, 58, 237';
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '124, 58, 237';
}

// Helper to format time (e.g. "14:30" -> "14:30")
function formatTimeStr(timeStr) {
  return timeStr || '';
}

// Helper to detect conflicts between tasks and manual calendar events
function detectManualEventConflicts(tasks, date) {
  if (typeof ManualEventStore === 'undefined') return [];
  const manualEvents = ManualEventStore.getEventsForDate(date);
  const conflicts = [];

  tasks.forEach(task => {
    if (!task.deadline) return;
    const taskStart = task.deadline.getTime();
    const taskEnd = taskStart + (task.estimatedMin || 30) * 60 * 1000;

    manualEvents.forEach(ev => {
      const [startH, startM] = ev.startTime.split(':').map(Number);
      const [endH, endM] = ev.endTime.split(':').map(Number);

      const evStart = new Date(date);
      evStart.setHours(startH, startM, 0, 0);

      const evEnd = new Date(date);
      evEnd.setHours(endH, endM, 0, 0);

      if (taskStart < evEnd.getTime() && taskEnd > evStart.getTime()) {
        conflicts.push({
          task,
          event: ev
        });
      }
    });
  });

  return conflicts;
}

// ═══════════════════════════════════════════════════════
// MONTHLY CALENDAR VIEW RENDERING
// ═══════════════════════════════════════════════════════

let currentCalendarDate = new Date();

function renderMonthlyCalendar() {
  const grid = document.getElementById('calendar-days-grid');
  const label = document.getElementById('calendar-month-label');
  if (!grid || !label) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth(); // 0-indexed

  // Update label
  const monthName = currentCalendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  label.textContent = monthName;

  grid.innerHTML = '';

  // First day of current month
  const firstDay = new Date(year, month, 1);
  const startDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)

  // Number of days in current month
  const numDays = new Date(year, month + 1, 0).getDate();

  // Number of days in previous month
  const prevMonthNumDays = new Date(year, month, 0).getDate();

  const days = [];

  // Previous month days to fill start of grid
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthNumDays - i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // Current month days
  for (let i = 1; i <= numDays; i++) {
    const d = new Date(year, month, i);
    days.push({ date: d, isCurrentMonth: true });
  }

  // Next month days to fill end of grid
  const remainingCells = 42 - days.length; // 6 rows * 7 columns = 42 cells
  for (let i = 1; i <= remainingCells; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, isCurrentMonth: false });
  }

  // Render days
  days.forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell' + (day.isCurrentMonth ? '' : ' inactive');
    
    // Check if it is today
    const today = new Date();
    const isToday = day.date.toDateString() === today.toDateString();
    if (isToday) {
      cell.classList.add('today');
    }

    const yyyy = day.date.getFullYear();
    const mm = String(day.date.getMonth() + 1).padStart(2, '0');
    const dd = String(day.date.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Get events for this day
    const events = ManualEventStore.getEventsForDate(day.date);

    // Day number HTML
    let dayNumHTML = `<span class="day-number">${day.date.getDate()}</span>`;
    
    // Events list HTML
    let eventsHTML = '';
    if (events.length > 0) {
      eventsHTML = `<div class="calendar-cell-events">`;
      // Render first 2 events, and "+X more" if there are more
      const visibleEvents = events.slice(0, 2);
      visibleEvents.forEach(ev => {
        const baseColor = ev.color || '#7c3aed';
        eventsHTML += `
          <div class="calendar-event-badge" 
               style="background:rgba(${hexToRgb(baseColor)}, 0.15); border-left: 3px solid ${baseColor}; color:var(--text-primary);" 
               onclick="event.stopPropagation(); openManualEventModal('${ev.id}')">
            ${escapeHtml(ev.title)}
          </div>
        `;
      });
      if (events.length > 2) {
        eventsHTML += `<div class="calendar-event-more">+${events.length - 2} more</div>`;
      }
      eventsHTML += `</div>`;
    }

    cell.innerHTML = `${dayNumHTML}${eventsHTML}`;

    // Clicking empty space in day cell opens create modal for that day
    cell.onclick = () => {
      openManualEventModalForDate(dateStr);
    };

    grid.appendChild(cell);
  });
}

function openManualEventModalForDate(dateStr) {
  openManualEventModal();
  document.getElementById('manual-event-date-input').value = dateStr;
}

function calendarPrevMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderMonthlyCalendar();
}

function calendarNextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderMonthlyCalendar();
}


