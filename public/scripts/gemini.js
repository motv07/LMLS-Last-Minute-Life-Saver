/**
 * LMLS — Last-Minute Life Saver
 * gemini.js — Gemini 2.0 Flash API wrapper, streaming (SSE), context injection, specialized prompt generators
 */

'use strict';

const GeminiClient = (() => {
  const FALLBACK_MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro'
  ];

  let currentWorkingModel = null;

  function getApiKey() {
    return AppState.settings.geminiApiKey || '';
  }

  function isConfigured() {
    return !!getApiKey();
  }

  function getSelectedModel() {
    if (typeof AppState !== 'undefined' && AppState.settings) {
      return AppState.settings.geminiModel || 'auto';
    }
    return 'auto';
  }

  function getModelsToTry() {
    const selected = getSelectedModel();
    if (selected && selected !== 'auto') {
      return [selected, ...FALLBACK_MODELS.filter(m => m !== selected)];
    }
    if (currentWorkingModel && FALLBACK_MODELS.includes(currentWorkingModel)) {
      return [currentWorkingModel, ...FALLBACK_MODELS.filter(m => m !== currentWorkingModel)];
    }
    return FALLBACK_MODELS;
  }

  /**
   * Helper to format today's date in YYYY-MM-DD
   */
  function todayKey() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  }

  /**
   * Builds the comprehensive context-injected system instruction for Gemini.
   * This includes live task states, completions, stress metrics, habits, and user configuration.
   */
  function buildSystemInstruction() {
    const userName = AppState.settings.userName || 'User';
    const workStart = AppState.settings.workStart || '09:00';
    const workEnd = AppState.settings.workEnd || '18:00';
    const now = new Date();
    
    // Get live state from TaskStore and AppState
    const tasks = TaskStore.getAll();
    const stats = computeStats(tasks);
    
    const pendingTasks = tasks.filter(t => t.status !== 'completed');
    
    // Format tasks list with details
    let taskListStr = pendingTasks.map((t, idx) => {
      const dlLabel = t.deadline ? getDeadlineLabel(t).text : 'No deadline';
      return `${idx + 1}. [Priority: ${t.priority.toUpperCase()}] "${t.title}" 
         - Category: ${t.category}
         - Urgency: ${t.urgencyScore}/100
         - Estimate: ${t.estimatedMin || 30} mins
         - Deadline: ${dlLabel}
         - Tags: ${t.tags.join(', ') || 'None'}
         - Description: ${t.description || 'No description'}`;
    }).join('\n') || 'None';
    
    // Format habits list with streaks
    const today = todayKey();
    let habitsStr = AppState.habits.map(h => {
      const done = h.completions?.[today] ? '✅ Done today' : '⏳ Pending today';
      return `- ${h.emoji} "${h.name}" (Streak: ${h.streak || 0} days, Best Streak: ${h.bestStreak || 0} days, Status: ${done})`;
    }).join('\n') || 'None';

    // Format calendar events if available
    let calendarStr = '';
    if (typeof CalendarClient !== 'undefined' && CalendarClient.isSignedIn()) {
      calendarStr = CalendarClient.getCalendarContextString();
    }
    
    // Recent completions (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const recentlyCompleted = tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt).getTime() > oneDayAgo);
    const recentCompletionsStr = recentlyCompleted.map(t => `"${t.title}"`).join(', ') || 'None';

    // Time of day context
    const hour = now.getHours();
    let timeContext = 'morning — help user plan their day strategically';
    if (hour >= 12 && hour < 17) timeContext = 'afternoon — help user maintain momentum and stay on track';
    else if (hour >= 17 && hour < 21) timeContext = 'evening — help user finish strong and review progress';
    else if (hour >= 21 || hour < 6) timeContext = 'night — encourage rest and help wrap up any critical items';

    // Weekly goal (from localStorage)
    const weeklyGoal = localStorage.getItem('lmls_weekly_goal') || '';
    const weeklyGoalStr = weeklyGoal ? `User's Weekly Focus Goal: "${weeklyGoal}"` : '';

    return `You are the AI Productivity Companion for Last-Minute Life Saver (LMLS).
Your goal is to proactively help the user (${userName}) plan, prioritize, and complete their tasks before deadlines are missed.

Current Time: ${now.toString()}
Time of Day Context: It is ${timeContext}.
User Work Hours: ${workStart} to ${workEnd}
${weeklyGoalStr}

Current Productivity Metrics:
- Productivity Score: ${stats.productivityScore}/100 (high is better)
- Completed Tasks: ${stats.completed}/${stats.total}
- Overdue Tasks: ${stats.overdue}
- Tasks Due Today: ${stats.dueToday}

Recently Completed (last 24h): ${recentCompletionsStr}

Current Pending Tasks (sorted by Urgency Score):
${taskListStr}
${calendarStr}

Current Habits:
${habitsStr}

Tone & Interaction Guidelines:
1. Be highly action-oriented, encouraging, and direct. Avoid rambling.
2. Use emojis naturally to fit the premium glassmorphism aesthetic.
3. Help the user prioritize. When asked to plan, focus on high-urgency tasks.
4. If the user is in a crisis (stressed, overdue tasks), be clear, motivating, and provide a direct minute-by-minute action plan.
5. Format your answers clearly using Markdown: bolding (**text**), bullet points, and clean line breaks. Avoid raw HTML tags.
6. When referencing tasks, mention their titles exactly so the user knows what you are talking about.
7. Keep responses concise and readable. The user should be able to scan your advice in under 15 seconds.
8. Remember the conversation history — reference earlier messages naturally when relevant.
9. ${weeklyGoal ? `Always keep the user's weekly goal in mind: "${weeklyGoal}"` : 'If the user mentions a weekly goal, remember it for future messages.'}`;
  }

  /**
   * Builds a multi-turn contents array from conversation history + new user message.
   * Uses the last 10 messages to maintain context.
   */
  function buildConversationContents(userMessage, history = []) {
    const contents = [];
    // Include last 10 messages for context window
    const recentHistory = history.slice(-10);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role, // 'user' | 'model'
        parts: [{ text: msg.text }]
      });
    }
    // Add current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });
    return contents;
  }

  /**
   * Streams responses from Gemini 2.0 Flash using SSE.
   * Calls onChunk with each new text fragment, onDone on completion, onError on failure.
   */
  async function streamResponse(prompt, onChunk, onDone, onError, customSystemInstruction = null, conversationHistory = []) {
    if (!navigator.onLine) {
      if (onError) onError(new Error("No internet connection. Please connect to the internet to query the AI Agent."));
      return;
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      if (onError) onError(new Error("Gemini API key is not configured. Please add it in Settings."));
      return;
    }

    const modelsToTry = getModelsToTry();
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const systemInstructionText = customSystemInstruction || buildSystemInstruction();
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: buildConversationContents(prompt, conversationHistory),
            systemInstruction: {
              parts: [{ text: systemInstructionText }]
            },
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048,
            }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = `API error (${response.status})`;
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error?.message || errMsg;
          } catch {}

          const isQuotaOrModelError = response.status === 429 || 
                                      response.status === 404 || 
                                      response.status === 400 || 
                                      errMsg.toLowerCase().includes('quota') || 
                                      errMsg.toLowerCase().includes('limit') || 
                                      errMsg.toLowerCase().includes('exceeded') ||
                                      errMsg.toLowerCase().includes('not found') ||
                                      errMsg.toLowerCase().includes('deprecated') ||
                                      errMsg.toLowerCase().includes('not support');

          if (isQuotaOrModelError) {
            console.warn(`Model ${model} failed with quota/model error: ${errMsg}. Trying next model...`);
            lastError = new Error(errMsg);
            continue;
          } else {
            throw new Error(errMsg);
          }
        }

        if (getSelectedModel() === 'auto') {
          currentWorkingModel = model;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(dataStr);
                const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (chunkText && onChunk) {
                  onChunk(chunkText);
                }
              } catch (e) {
                console.warn("Failed to parse SSE JSON chunk:", e, trimmed);
              }
            }
          }
        }

        if (buffer.trim().startsWith('data: ')) {
          const trimmed = buffer.trim();
          const dataStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(dataStr);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (chunkText && onChunk) {
              onChunk(chunkText);
            }
          } catch (e) {}
        }

        if (onDone) onDone();
        return; // Success!

      } catch (err) {
        console.error(`Gemini SSE call failed for model ${model}:`, err);
        lastError = err;
        if (!navigator.onLine || err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('fetch')) {
          break;
        }
      }
    }

    if (onError) onError(lastError || new Error("Failed to stream response from any Gemini model."));
  }

  /**
   * Tests the connection with a lightweight prompt to verify the user's API Key.
   */
  async function testConnection(apiKey) {
    if (!navigator.onLine) {
      throw new Error("No internet connection. Please connect to the internet to verify your API key.");
    }
    if (!apiKey) throw new Error("API Key is required");

    const selectedModel = document.getElementById('gemini-model-select')?.value || getSelectedModel();
    let modelsToTry;
    if (selectedModel && selectedModel !== 'auto') {
      modelsToTry = [selectedModel, ...FALLBACK_MODELS.filter(m => m !== selectedModel)];
    } else {
      modelsToTry = FALLBACK_MODELS;
    }

    let lastError = null;
    for (const model of modelsToTry) {
      const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      let response;
      try {
        response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: 'Respond with exactly the word "Connected" and nothing else.' }]
            }]
          })
        });
      } catch (fetchErr) {
        throw new Error(`Network error: ${fetchErr.message}`);
      }

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `API error (${response.status})`;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error?.message || errMsg;
        } catch {}

        const isQuotaOrModelError = response.status === 429 || 
                                    response.status === 404 || 
                                    response.status === 400 || 
                                    errMsg.toLowerCase().includes('quota') || 
                                    errMsg.toLowerCase().includes('limit') || 
                                    errMsg.toLowerCase().includes('exceeded') ||
                                    errMsg.toLowerCase().includes('not found') ||
                                    errMsg.toLowerCase().includes('deprecated') ||
                                    errMsg.toLowerCase().includes('not support');

        if (isQuotaOrModelError) {
          console.warn(`testConnection failed for model ${model}: ${errMsg}. Trying next model...`);
          lastError = new Error(errMsg);
          continue;
        } else {
          throw new Error(errMsg);
        }
      }

      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!result || !result.toLowerCase().includes('connected')) {
        lastError = new Error("Invalid response received from API");
        continue;
      }

      if (getSelectedModel() === 'auto') {
        currentWorkingModel = model;
      }
      return true;
    }

    // Diagnostic check: query available models to help the user identify the supported ones
    let availableModelsStr = '';
    try {
      const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
      if (listResponse.ok) {
        const listJson = await listResponse.json();
        availableModelsStr = (listJson.models || [])
          .map(m => m.name.replace('models/', ''))
          .join(', ');
      }
    } catch (e) {
      console.warn("ListModels diagnostic call failed:", e);
    }

    let finalErrMsg = lastError ? lastError.message : "Failed to verify API key with any Gemini model.";
    if (availableModelsStr) {
      throw new Error(`${finalErrMsg} (Supported models: ${availableModelsStr})`);
    } else {
      throw new Error(finalErrMsg);
    }
  }

  /**
   * Specialized Generator: Crisis Recovery Plan
   */
  async function generateCrisisPlan(task, minsLeft, onChunk, onDone, onError) {
    const est = task.estimatedMin || 30;
    const prompt = `CRITICAL CRISIS ALERT:
The task "${task.title}" has a deadline in exactly ${Math.round(minsLeft)} minutes!
Estimated time to complete it is ${est} minutes.
This is extremely tight. Provide a direct, hyper-focused, minute-by-minute action plan. 
Specifically tell the user what they MUST cut out, what to ignore, and how to complete the core element before the clock hits zero. Keep it under 100 words. Be high-energy and urgent!`;
    
    await streamResponse(prompt, onChunk, onDone, onError);
  }

  /**
   * Specialized Generator: Daily Dashboard Briefing
   */
  async function generateDailyBriefing(onChunk, onDone, onError) {
    const prompt = `Generate my Daily Dashboard Briefing. 
Analyze my pending tasks, urgency scores, and habits. Provide a beautiful, bulleted summary of:
1. The absolute top priority tasks to tackle today.
2. Any overdue threats.
3. A quick motivational tip customized to my current state.
Keep it concise, action-focused, and under 150 words. Do not list all tasks, just point out what matters most right now.`;
    
    await streamResponse(prompt, onChunk, onDone, onError);
  }

  /**
   * Specialized Generator: Plan My Day
   */
  async function generateDayPlan(onChunk, onDone, onError) {
    const start = AppState.settings.workStart || '09:00';
    const end = AppState.settings.workEnd || '18:00';
    const prompt = `Plan my day based on my work hours (${start} to ${end}) and pending tasks.
Create a realistic, time-blocked schedule. Assign specific hour-long or half-hour slots for the most urgent tasks first.
Include short breaks (e.g. 5-10 min Pomodoro breaks) and buffer times.
Format it as a clean list of time blocks (e.g. **09:00 - 10:00**: Focus on Task Title). 
Keep it clear and easy to follow.`;
    
    await streamResponse(prompt, onChunk, onDone, onError);
  }

  /**
   * Specialized Generator: Procrastination Beat Coaching
   */
  async function detectProcrastination(onChunk, onDone, onError) {
    const prompt = `I am struggling with procrastination and cannot get started.
Look at my task list, identify the high-urgency tasks or ones that look stuck (e.g. overdue or with descriptions indicating resistance), and give me exactly 3 highly actionable, psychologically-backed focus hacks to beat resistance right now. 
Be blunt, energetic, and push me to start. Keep it brief.`;
    
    await streamResponse(prompt, onChunk, onDone, onError);
  }

  /**
   * Specialized Generator: Workload Analysis
   */
  async function analyzeWorkload(onChunk, onDone, onError) {
    const pendingCount = TaskStore.getAll().filter(t => t.status !== 'completed').length;
    const totalEstMins = TaskStore.getAll().filter(t => t.status !== 'completed').reduce((sum, t) => sum + (t.estimatedMin || 30), 0);
    const estHours = (totalEstMins / 60).toFixed(1);
    
    const prompt = `Analyze my workload. I have ${pendingCount} pending tasks requiring a total of ~${estHours} hours.
Give me an honest, direct assessment: Is this load realistic for a single day? 
If it is overloaded (e.g. over 6 hours of work remaining), specify which tasks I should consider rescheduling, snoozing, or delegating. 
Keep it structured with bold headers and bullet points.`;
    
    await streamResponse(prompt, onChunk, onDone, onError);
  }

  async function generateCarouselInsights(tasks, habits, onDone, onError) {
    const tasksData = tasks.map(t => ({
      title: t.title,
      priority: t.priority,
      status: t.status,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      category: t.category,
      urgencyScore: t.urgencyScore
    }));
    const habitsData = habits.map(h => ({
      name: h.name,
      streak: h.streak || 0
    }));

    const prompt = `You are a Productivity Coach. Analyze my task data and habit data:
Tasks: ${JSON.stringify(tasksData)}
Habits: ${JSON.stringify(habitsData)}

Generate exactly 3 highly personalized, context-aware productivity insight cards for a dashboard carousel. Each card must help me optimize my work day, avoid procrastination, or highlight a deadline threat.
Each card MUST have:
1. "headline": A short, punchy, action-oriented title (2-3 words).
2. "explanation": A one-sentence, highly specific advice (under 15 words).
3. "cta": A short CTA button text (1-2 words).
4. "action": The target page navigation: 'focus', 'tasks', 'habits', or 'analytics'.

Format your response ONLY as a raw, valid JSON array. Do not include markdown wraps or codeblock tags.
Format:
[
  {"headline": "Overestimated Load", "explanation": "You have 5 hours of work due today. Reschedule low priority items.", "cta": "Reschedule", "action": "tasks"},
  ...
]`;

    const apiKey = getApiKey();
    if (!apiKey) {
      if (onError) onError(new Error("API key not configured"));
      return;
    }

    const modelsToTry = getModelsToTry();
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          let errMsg = `API error (${response.status})`;
          try {
            const errJson = JSON.parse(errText);
            errMsg = errJson.error?.message || errMsg;
          } catch {}

          const isQuotaOrModelError = response.status === 429 || 
                                      response.status === 404 || 
                                      response.status === 400 || 
                                      errMsg.toLowerCase().includes('quota') || 
                                      errMsg.toLowerCase().includes('limit') || 
                                      errMsg.toLowerCase().includes('exceeded') ||
                                      errMsg.toLowerCase().includes('not found') ||
                                      errMsg.toLowerCase().includes('deprecated') ||
                                      errMsg.toLowerCase().includes('not support');

          if (isQuotaOrModelError) {
            console.warn(`Model ${model} failed in generateCarouselInsights: ${errMsg}. Trying next model...`);
            lastError = new Error(errMsg);
            continue;
          } else {
            throw new Error(errMsg);
          }
        }

        if (getSelectedModel() === 'auto') {
          currentWorkingModel = model;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (onDone) onDone(text);
        return; // Success!

      } catch (e) {
        console.error(`generateCarouselInsights failed for model ${model}:`, e);
        lastError = e;
        if (!navigator.onLine || e.message.toLowerCase().includes('network') || e.message.toLowerCase().includes('fetch')) {
          break;
        }
      }
    }

    if (onError) onError(lastError || new Error("Failed to generate carousel insights from any Gemini model."));
  }

  async function generateWeeklyReportCard(tasks, habits, focusHistory, onChunk, onDone, onError) {
    const tasksData = tasks.map(t => ({
      title: t.title,
      priority: t.priority,
      status: t.status,
      completed: t.status === 'completed',
      category: t.category,
      urgencyScore: t.urgencyScore
    }));
    const habitsData = habits.map(h => ({
      name: h.name,
      completionsCount: Object.keys(h.completions || {}).length,
      streak: h.streak || 0
    }));
    const focusData = focusHistory.map(f => ({
      taskTitle: f.taskTitle,
      timestamp: f.timestamp,
      duration: f.durationMin
    }));

    const prompt = `Generate a personalized Weekly Productivity Report Card for ${AppState.settings.userName || 'User'}.
Analyze my dataset:
Tasks: ${JSON.stringify(tasksData)}
Habits: ${JSON.stringify(habitsData)}
Focus Sessions: ${JSON.stringify(focusData)}

Provide a beautiful report card in Markdown with:
1. **Overall Grade**: An overall letter grade (A+, A, B, C, D, or F) and a 1-sentence headline.
2. **Metric Breakdown**:
   - **Task Completion Rate**: Grade + short comment.
   - **Habit Consistency**: Grade + short comment.
   - **Deep Work Focus Time**: Grade + short comment.
3. **AI Coach Verdict**: 2 specific tips to improve next week's grade.

Keep the tone encouraging but direct, action-oriented, and highly readable. Use emojis. Avoid raw HTML tags.`;

    await streamResponse(prompt, onChunk, onDone, onError);
  }

  function getActiveModel() {
    return currentWorkingModel || getSelectedModel();
  }

  return {
    isConfigured,
    streamResponse,
    testConnection,
    generateCrisisPlan,
    generateDailyBriefing,
    generateDayPlan,
    detectProcrastination,
    analyzeWorkload,
    buildSystemInstruction,
    buildConversationContents,
    generateCarouselInsights,
    generateWeeklyReportCard,
    getActiveModel,
  };
})();
