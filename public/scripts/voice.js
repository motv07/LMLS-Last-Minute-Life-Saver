/**
 * LMLS — Last-Minute Life Saver
 * voice.js — Web Speech API wrapper (Speech Recognition & Speech Synthesis)
 */

'use strict';

const VoiceAssistant = {
  recognition: null,
  listening: false,
  synthesis: window.speechSynthesis,
  currentUtterance: null,
  activeTarget: null, // 'global' | 'chat'

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return false;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.listening = true;
      this.updateUI(true);
      showToast('🎤 Listening... Speak your command.', 'info');
    };

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      this.handleResult(transcript);
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.stopListening();
      if (event.error === 'not-allowed') {
        showToast('❌ Microphone permission denied.', 'error');
      } else if (event.error !== 'aborted') {
        showToast('🎤 Voice input failed. Please try again.', 'error');
      }
    };

    this.recognition.onend = () => {
      this.stopListening();
    };

    // Wire up events
    this.bindEvents();
    return true;
  },

  bindEvents() {
    const globalBtn = document.getElementById('voice-btn');
    if (globalBtn) {
      globalBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle('global');
      });
    }

    const chatBtn = document.getElementById('voice-chat-btn');
    if (chatBtn) {
      chatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle('chat');
      });
    }
  },

  toggle(target = 'global') {
    if (this.listening) {
      this.stopListening();
    } else {
      this.startListening(target);
    }
  },

  startListening(target = 'global') {
    if (!this.recognition) {
      showToast('🎤 Speech recognition not supported in this browser.', 'warning');
      return;
    }
    
    // Cancel any active speech synthesis before starting to listen
    this.stopSpeaking();
    
    this.activeTarget = target;
    try {
      this.recognition.start();
    } catch (e) {
      console.error('Error starting recognition:', e);
    }
  },

  stopListening() {
    this.listening = false;
    this.updateUI(false);
    try {
      this.recognition?.stop();
    } catch (e) {
      // already stopped or not started
    }
  },

  updateUI(isListening) {
    const globalBtn = document.getElementById('voice-btn');
    const chatBtn = document.getElementById('voice-chat-btn');
    
    if (isListening) {
      if (this.activeTarget === 'global' && globalBtn) {
        globalBtn.classList.add('listening');
      } else if (this.activeTarget === 'chat' && chatBtn) {
        chatBtn.classList.add('listening');
      }
    } else {
      globalBtn?.classList.remove('listening');
      chatBtn?.classList.remove('listening');
    }
  },

  speak(text, showSubtitle = true) {
    if (!this.synthesis) return;
    
    // Stop any ongoing speech
    this.stopSpeaking();

    // Check settings for speech output
    if (!AppState.settings.voiceResponse) {
      if (showSubtitle) {
        this.showSubtitle(text);
      }
      return;
    }

    // Clean text from markdown formatting for cleaner speech synthesis
    const cleanText = text.replace(/[*#`_\[\]]/g, '').trim();
    if (!cleanText) return;

    if (showSubtitle) {
      this.showSubtitle(text);
    }

    // Speak in sentence chunks to avoid browser synthesis limits
    const sentences = cleanText.match(/[^.!?]+[.!?]+/g) || [cleanText];
    let currentIndex = 0;

    const speakNext = () => {
      if (currentIndex >= sentences.length) {
        this.hideSubtitle();
        return;
      }
      
      const utteranceText = sentences[currentIndex].trim();
      if (!utteranceText) {
        currentIndex++;
        speakNext();
        return;
      }

      this.currentUtterance = new SpeechSynthesisUtterance(utteranceText);
      
      // Try to find a premium English voice
      const voices = this.synthesis.getVoices();
      const preferredVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural')));
      if (preferredVoice) {
        this.currentUtterance.voice = preferredVoice;
      }

      this.currentUtterance.onend = () => {
        currentIndex++;
        speakNext();
      };

      this.currentUtterance.onerror = (e) => {
        console.error('Speech synthesis error:', e);
        this.hideSubtitle();
      };

      this.synthesis.speak(this.currentUtterance);
    };

    speakNext();
  },

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.hideSubtitle();
  },

  cancelSpeech() {
    this.stopSpeaking();
  },

  showSubtitle(text) {
    let container = document.getElementById('voice-subtitle-overlay');
    if (!container) {
      container = document.createElement('div');
      container.id = 'voice-subtitle-overlay';
      container.className = 'voice-subtitle-overlay';
      document.body.appendChild(container);
    }
    container.innerHTML = `<span class="subtitle-badge">🔊 AI Voice</span><span class="subtitle-text">${escapeHtml(text)}</span><button class="subtitle-close" onclick="VoiceAssistant.stopSpeaking()">&times;</button>`;
    container.classList.remove('hidden');
    container.classList.add('visible');

    // Auto hide subtitles after 8 seconds if speech response is disabled (since there's no speech end event)
    if (!AppState.settings.voiceResponse) {
      setTimeout(() => {
        if (container.classList.contains('visible') && container.innerText.includes(text)) {
          this.hideSubtitle();
        }
      }, 8000);
    }
  },

  hideSubtitle() {
    const container = document.getElementById('voice-subtitle-overlay');
    if (container) {
      container.classList.remove('visible');
      container.classList.add('hidden');
    }
  },

  handleResult(transcript) {
    if (this.activeTarget === 'chat') {
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.value = transcript;
        chatInput.dispatchEvent(new Event('input')); // trigger resize
        // Automatically send the message
        sendChatMessage();
      }
      return;
    }

    // Global voice commands
    this.processCommand(transcript);
  },

  processCommand(transcript) {
    const text = transcript.toLowerCase().trim();
    showToast(`🎤 "${transcript}"`, 'info');

    // 1. ADD TASK COMMANDS
    // Command matches: "add task [title] by [time]" or "create task [title] at [time]"
    if (text.startsWith('add task') || text.startsWith('new task') || text.startsWith('create task')) {
      this.handleAddTaskCommand(transcript);
      return;
    }

    // 2. COMPLETE TASK COMMANDS
    // Command matches: "complete [task]" or "mark [task] done"
    if (text.startsWith('complete') || text.startsWith('mark done') || text.startsWith('finish') || text.endsWith('completed') || text.endsWith('done')) {
      this.handleCompleteTaskCommand(transcript);
      return;
    }

    // 3. START FOCUS MODE COMMANDS
    // Command matches: "start focus on [task]" or "start focus mode"
    if (text.includes('focus') && (text.includes('start') || text.includes('begin') || text.includes('run'))) {
      this.handleFocusCommand(transcript);
      return;
    }

    // 4. NAVIGATION COMMANDS
    if (text.includes('go to') || text.includes('navigate to') || text.includes('show') || text.includes('open')) {
      const views = ['dashboard', 'tasks', 'ai', 'schedule', 'habits', 'focus', 'analytics', 'settings'];
      for (const view of views) {
        if (text.includes(view) || (view === 'ai' && text.includes('chat')) || (view === 'dashboard' && text.includes('home'))) {
          navigateTo(view);
          this.speak(`Navigated to ${view}.`);
          return;
        }
      }
    }

    // 5. QUERY STATUS COMMANDS
    if (text.includes('what should i do') || text.includes('what to do') || text.includes('what is next') || text.includes('what\'s next')) {
      this.handleNextTaskQuery();
      return;
    }

    if (text.includes('what is due today') || text.includes('what\'s due today') || text.includes('tasks due today') || text.includes('due today')) {
      this.handleDueTodayQuery();
      return;
    }

    if (text.includes('stress level') || text.includes('stress') || text.includes('how is my stress')) {
      this.handleStressQuery();
      return;
    }

    if (text.includes('plan my day') || text.includes('plan today') || text.includes('generate schedule')) {
      this.speak('Planning your day. Calling Gemini AI to optimize your time-blocks...');
      navigateTo('schedule');
      generateAISchedule();
      return;
    }

    // 6. CHAT FALLBACK
    // If no voice command matches, redirect user to the AI agent chat and submit it
    navigateTo('ai');
    setTimeout(() => {
      const chatInput = document.getElementById('chat-input');
      if (chatInput) {
        chatInput.value = transcript;
        chatInput.dispatchEvent(new Event('input'));
        sendChatMessage();
      }
    }, 400);
  },

  handleAddTaskCommand(transcript) {
    const text = transcript.toLowerCase();
    let commandPrefix = '';
    if (text.startsWith('add task')) commandPrefix = 'add task';
    else if (text.startsWith('new task')) commandPrefix = 'new task';
    else if (text.startsWith('create task')) commandPrefix = 'create task';

    let content = transcript.substring(commandPrefix.length).trim();
    if (!content) {
      openAddTaskModal();
      this.speak('Sure, let\'s add a task. Fill in the details in the modal.');
      return;
    }

    // Parse title & deadline
    let title = content;
    let deadline = null;
    let deadlineStr = '';

    const timeConnectors = [' by ', ' at ', ' in ', ' due '];
    let matchedConnector = null;
    let idx = -1;

    for (const conn of timeConnectors) {
      const matchIdx = text.indexOf(conn);
      if (matchIdx !== -1 && (idx === -1 || matchIdx < idx)) {
        idx = matchIdx;
        matchedConnector = conn;
      }
    }

    if (idx !== -1) {
      title = content.substring(0, idx).trim();
      const timePart = content.substring(idx + matchedConnector.length).trim();
      deadline = this.parseTimeExpression(timePart);
      if (deadline) {
        deadlineStr = deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (deadline.toDateString() !== new Date().toDateString()) {
          deadlineStr += ' on ' + deadline.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
      }
    }

    // Create and save task
    const task = {
      title: title,
      description: 'Created via voice command',
      deadline: deadline || new Date(Date.now() + 2 * 3600 * 1000), // Default 2 hours from now
      estimatedMin: 30,
      priority: 'medium',
      category: 'other',
      tags: ['voice']
    };

    TaskStore.add(task);
    refreshAll();

    let speakText = `Added task "${title}"`;
    if (deadlineStr) {
      speakText += ` due at ${deadlineStr}.`;
    } else {
      speakText += ` due in 2 hours.`;
    }
    this.speak(speakText);
  },

  handleCompleteTaskCommand(transcript) {
    const text = transcript.toLowerCase();
    let taskTitle = transcript
      .replace(/complete|mark done|finish|mark|done|completed/gi, '')
      .trim();

    if (!taskTitle) {
      this.speak('Which task would you like to mark completed?');
      return;
    }

    const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
    const matched = tasks.find(t => t.title.toLowerCase().includes(taskTitle.toLowerCase()));

    if (matched) {
      TaskStore.updateStatus(matched.id, 'completed');
      refreshAll();
      this.speak(`Excellent job! Marked "${matched.title}" as completed.`);
    } else {
      this.speak(`I couldn't find a pending task matching "${taskTitle}".`);
    }
  },

  handleFocusCommand(transcript) {
    const text = transcript.toLowerCase();
    navigateTo('focus');

    // Check if user specified a task name: "start focus on write report"
    let taskName = '';
    const indicators = ['focus on ', 'timer for ', 'focusing on '];
    for (const ind of indicators) {
      const idx = text.indexOf(ind);
      if (idx !== -1) {
        taskName = text.substring(idx + ind.length).trim();
        break;
      }
    }

    if (taskName) {
      const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
      const matched = tasks.find(t => t.title.toLowerCase().includes(taskName.toLowerCase()));
      if (matched) {
        selectFocusTask(matched.id);
        if (!AppState.timerRunning) toggleTimer();
        this.speak(`Starting a focus session on "${matched.title}". Let's get to work!`);
        return;
      }
    }

    // Default focus trigger
    if (!AppState.timerRunning) toggleTimer();
    this.speak('Focus mode activated. Let\'s make progress.');
  },

  handleNextTaskQuery() {
    const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
    if (tasks.length === 0) {
      this.speak('You have no pending tasks! You are completely caught up. Great job.');
      return;
    }

    // Sorting by urgency score
    const sorted = tasks.sort((a, b) => b.urgencyScore - a.urgencyScore);
    const top = sorted[0];

    let urgencyText = 'mild';
    if (top.urgencyScore >= 80) urgencyText = 'critical crisis status';
    else if (top.urgencyScore >= 60) urgencyText = 'high urgency';
    else if (top.urgencyScore >= 40) urgencyText = 'medium urgency';

    let dueText = '';
    if (top.deadline) {
      const diff = top.deadline.getTime() - Date.now();
      const hrs = Math.ceil(diff / (3600 * 1000));
      if (hrs <= 0) {
        dueText = 'is already overdue';
      } else if (hrs === 1) {
        dueText = 'is due in 1 hour';
      } else {
        dueText = `is due in ${hrs} hours`;
      }
    }

    this.speak(`Your highest priority task is: "${top.title}". It has ${urgencyText} and ${dueText}. I recommend starting focus mode on it immediately.`);
  },

  handleDueTodayQuery() {
    const tasks = TaskStore.getAll().filter(t => t.status !== 'completed');
    const today = new Date().toDateString();
    const todayTasks = tasks.filter(t => t.deadline && t.deadline.toDateString() === today);

    if (todayTasks.length === 0) {
      this.speak('You have no tasks due today. Enjoy your day!');
      return;
    }

    let speakText = `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today: `;
    speakText += todayTasks.map(t => t.title).join(', and ');
    speakText += '. Keep an eye on the clock!';
    this.speak(speakText);
  },

  handleStressQuery() {
    const fill = document.getElementById('urgency-fill');
    const lbl = document.getElementById('urgency-label-val');
    const label = lbl ? lbl.textContent : 'Calm';
    
    if (label.includes('CRISIS') || label.includes('🚨')) {
      this.speak('Your stress level is currently in crisis mode! Several deadlines are extremely close. Take a deep breath and start focus mode on the top task.');
    } else if (label.includes('High') || label.includes('🔥')) {
      this.speak('Your stress level is high. You have pressing tasks due today. I recommend planning your day and tackling the most urgent item first.');
    } else {
      this.speak(`Your productivity stress level is currently ${label}. Everything is under control.`);
    }
  },

  parseTimeExpression(timeStr) {
    const cleanStr = timeStr.toLowerCase().trim();
    const now = new Date();

    // 1. Keyword: "tomorrow" or "tomorrow morning/afternoon"
    if (cleanStr === 'tomorrow') {
      const d = new Date(now.getTime() + 24 * 3600 * 1000);
      d.setHours(12, 0, 0, 0); // Default to noon tomorrow
      return d;
    }

    // 2. Keyword: "tonight"
    if (cleanStr === 'tonight') {
      const d = new Date(now);
      d.setHours(21, 0, 0, 0); // 9 PM tonight
      return d;
    }

    // 3. Relative Expression: "in X hours" or "in Y minutes" or "in Z days"
    const relativeMatch = cleanStr.match(/in\s+(\d+)\s*(hour|hr|hours|minute|min|minutes|day|days)/);
    if (relativeMatch) {
      const val = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2];
      let ms = 0;
      if (unit.startsWith('hour') || unit === 'hr') ms = val * 3600 * 1000;
      else if (unit.startsWith('minute') || unit === 'min') ms = val * 60 * 1000;
      else if (unit.startsWith('day')) ms = val * 24 * 3600 * 1000;
      return new Date(now.getTime() + ms);
    }

    // 4. Absolute Time Expression: e.g. "6pm", "6:30 pm", "14:00", "5 am tomorrow"
    const timeMatch = cleanStr.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
    if (timeMatch) {
      let hrs = parseInt(timeMatch[1]);
      let mins = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const ampm = timeMatch[3];

      if (ampm === 'pm' && hrs < 12) hrs += 12;
      if (ampm === 'am' && hrs === 12) hrs = 0;

      const d = new Date(now);
      // check if "tomorrow" is appended
      if (cleanStr.includes('tomorrow')) {
        d.setDate(d.getDate() + 1);
      }
      d.setHours(hrs, mins, 0, 0);
      
      // If time has passed today (without "tomorrow"), set to tomorrow
      if (d.getTime() < now.getTime() && !cleanStr.includes('tomorrow')) {
        d.setDate(d.getDate() + 1);
      }
      return d;
    }

    return null;
  }
};
