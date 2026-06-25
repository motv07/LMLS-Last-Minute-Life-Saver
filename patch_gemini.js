/**
 * Patch script for gemini.js - Day 2 AI Intelligence upgrades
 * Run with: node patch_gemini.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'scripts', 'gemini.js');
let code = fs.readFileSync(filePath, 'utf8');

// ── 1.3: Replace the return block inside buildSystemInstruction ────────────

// Build the old marker string that uniquely identifies the start of the old return
const OLD_RETURN_START = '    return `You are the AI Productivity Companion for Last-Minute Life Saver (LMLS).\nYour goal is to proactively help the user (${userName}) plan, prioritize, and complete their tasks before deadlines are missed.\n\nCurrent Time: ${now.toString()}\nUser Work Hours: ${workStart} to ${workEnd}\n\nCurrent Productivity Metrics:\n- Productivity Score: ${stats.productivityScore}/100 (high is better)\n- Completed Tasks: ${stats.completed}/${stats.total}\n- Overdue Tasks: ${stats.overdue}\n- Tasks Due Today: ${stats.dueToday}\n\nCurrent Pending Tasks (sorted by Urgency Score):\n${taskListStr}\n${calendarStr}\n\nCurrent Habits:\n${habitsStr}\n\nTone & Interaction Guidelines:\n1. Be highly action-oriented, encouraging, and direct. Avoid rambling.\n2. Use emojis naturally to fit the premium glassmorphism aesthetic.\n3. Help the user prioritize. When asked to plan, focus on high-urgency tasks.\n4. If the user is in a crisis (stressed, overdue tasks), be clear, motivating, and provide a direct minute-by-minute action plan.\n5. Format your answers clearly using Markdown: bolding (**text**), bullet points, and clean line breaks. Avoid raw HTML tags.\n6. When referencing tasks, mention their titles exactly so the user knows what you are talking about.\n7. Keep responses concise and readable. The user should be able to scan your advice in under 15 seconds.`;';

if (!code.includes(OLD_RETURN_START)) {
  console.error('ERROR: Could not find old return block in buildSystemInstruction!');
  process.exit(1);
}

const NEW_RETURN_BLOCK = `    // Recent completions (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 3600 * 1000;
    const recentlyCompleted = tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt).getTime() > oneDayAgo);
    const recentCompletionsStr = recentlyCompleted.map(t => \`"\${t.title}"\`).join(', ') || 'None';

    // Time of day context
    const hour = now.getHours();
    let timeContext = 'morning \u2014 help user plan their day strategically';
    if (hour >= 12 && hour < 17) timeContext = 'afternoon \u2014 help user maintain momentum and stay on track';
    else if (hour >= 17 && hour < 21) timeContext = 'evening \u2014 help user finish strong and review progress';
    else if (hour >= 21 || hour < 6) timeContext = 'night \u2014 encourage rest and help wrap up any critical items';

    // Weekly goal (from localStorage)
    const weeklyGoal = localStorage.getItem('lmls_weekly_goal') || '';
    const weeklyGoalStr = weeklyGoal ? \`User's Weekly Focus Goal: "\${weeklyGoal}"\` : '';

    return \`You are the AI Productivity Companion for Last-Minute Life Saver (LMLS).
Your goal is to proactively help the user (\${userName}) plan, prioritize, and complete their tasks before deadlines are missed.

Current Time: \${now.toString()}
Time of Day Context: It is \${timeContext}.
User Work Hours: \${workStart} to \${workEnd}
\${weeklyGoalStr}

Current Productivity Metrics:
- Productivity Score: \${stats.productivityScore}/100 (high is better)
- Completed Tasks: \${stats.completed}/\${stats.total}
- Overdue Tasks: \${stats.overdue}
- Tasks Due Today: \${stats.dueToday}

Recently Completed (last 24h): \${recentCompletionsStr}

Current Pending Tasks (sorted by Urgency Score):
\${taskListStr}
\${calendarStr}

Current Habits:
\${habitsStr}

Tone & Interaction Guidelines:
1. Be highly action-oriented, encouraging, and direct. Avoid rambling.
2. Use emojis naturally to fit the premium glassmorphism aesthetic.
3. Help the user prioritize. When asked to plan, focus on high-urgency tasks.
4. If the user is in a crisis (stressed, overdue tasks), be clear, motivating, and provide a direct minute-by-minute action plan.
5. Format your answers clearly using Markdown: bolding (**text**), bullet points, and clean line breaks. Avoid raw HTML tags.
6. When referencing tasks, mention their titles exactly so the user knows what you are talking about.
7. Keep responses concise and readable. The user should be able to scan your advice in under 15 seconds.
8. Remember the conversation history \u2014 reference earlier messages naturally when relevant.
9. \${weeklyGoal ? \`Always keep the user's weekly goal in mind: "\${weeklyGoal}"\` : 'If the user mentions a weekly goal, remember it for future messages.'}\`;`;

code = code.replace(OLD_RETURN_START, NEW_RETURN_BLOCK);
console.log('Step 1.3: Enhanced buildSystemInstruction return block replaced.');

// ── 1.2: Insert buildConversationContents after closing brace of buildSystemInstruction ────

// Find the closing brace of buildSystemInstruction function - it's followed by the streamResponse comment
const BSI_CLOSE_MARKER = '  }\n\n  /**\n   * Streams responses from Gemini 2.0 Flash using SSE.';

if (!code.includes(BSI_CLOSE_MARKER)) {
  console.error('ERROR: Could not find BSI closing marker!');
  process.exit(1);
}

const BCC_INSERTION = `  }

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
   * Streams responses from Gemini 2.0 Flash using SSE.`;

code = code.replace(BSI_CLOSE_MARKER, BCC_INSERTION);
console.log('Step 1.2: buildConversationContents function inserted.');

// ── 1.4: Upgrade streamResponse signature ────
const OLD_SIG = 'async function streamResponse(prompt, onChunk, onDone, onError, customSystemInstruction = null) {';
const NEW_SIG = 'async function streamResponse(prompt, onChunk, onDone, onError, customSystemInstruction = null, conversationHistory = []) {';

if (!code.includes(OLD_SIG)) {
  // Already updated, that's fine
  console.log('Step 1.4: streamResponse signature already updated (skipped).');
} else {
  code = code.replace(OLD_SIG, NEW_SIG);
  console.log('Step 1.4: streamResponse signature upgraded with conversationHistory param.');
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('\nSUCCESS: scripts/gemini.js fully patched!');
