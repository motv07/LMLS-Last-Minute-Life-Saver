/**
 * LMLS — Last-Minute Life Saver
 * gamification.js — XP, Levels, and Achievements/Badges engine
 */

'use strict';

const Gamification = (() => {
  const XP_KEY = 'lmls_xp';
  const LEVEL_KEY = 'lmls_level';
  const BADGES_KEY = 'lmls_badges';
  
  let xp = 0;
  let level = 1;
  let unlockedBadges = {}; // { badgeId: unlockDateStr }
  
  const BADGE_DEFS = {
    first_step: { name: 'First Step', desc: 'Complete your first task', icon: '🌱' },
    speed_demon: { name: 'Speed Demon', desc: 'Complete 5 tasks in a single day', icon: '⚡' },
    crisis_survivor: { name: 'Crisis Survivor', desc: 'Complete a task with < 90 mins left', icon: '🛡️' },
    night_owl: { name: 'Night Owl', desc: 'Complete a task after midnight', icon: '🦉' },
    early_bird: { name: 'Early Bird', desc: 'Complete a task before 9:00 AM', icon: '☀️' },
    habit_hero: { name: 'Habit Hero', desc: 'Achieve a 5-day habit streak', icon: '🔥' },
    focus_master: { name: 'Focus Master', desc: 'Complete 5 focus sessions', icon: '🧘' },
    deep_work_guru: { name: 'Deep Work Guru', desc: 'Complete 15 focus sessions', icon: '🌌' },
    planner: { name: 'Planner', desc: 'Create 10 tasks in total', icon: '📅' },
    level_5: { name: 'Level 5 Elite', desc: 'Reach Level 5', icon: '👑' },
    overachiever: { name: 'Overachiever', desc: 'Complete 10 tasks in a single day', icon: '🚀' },
    perfectionist: { name: 'Perfectionist', desc: 'Achieve a Perfect Day (all habits done)', icon: '⭐' }
  };

  function load() {
    xp = parseInt(localStorage.getItem(XP_KEY), 10) || 0;
    level = parseInt(localStorage.getItem(LEVEL_KEY), 10) || 1;
    try {
      unlockedBadges = JSON.parse(localStorage.getItem(BADGES_KEY)) || {};
    } catch {
      unlockedBadges = {};
    }
  }

  function save() {
    localStorage.setItem(XP_KEY, xp);
    localStorage.setItem(LEVEL_KEY, level);
    localStorage.setItem(BADGES_KEY, JSON.stringify(unlockedBadges));
  }

  function getXP() { return xp; }
  function getLevel() { return level; }
  function getUnlockedBadges() { return unlockedBadges; }
  
  function getXPForNextLevel() {
    return level * 150;
  }

  function earnXP(amount, reason = '') {
    if (amount <= 0) return;
    xp += amount;
    showToast(`+${amount} XP: ${reason}`, 'info');
    
    // Check level up
    let levelUp = false;
    while (xp >= getXPForNextLevel()) {
      xp -= getXPForNextLevel();
      level++;
      levelUp = true;
    }
    
    save();
    updateXPUI();
    
    if (levelUp) {
      triggerLevelUpCelebration();
      if (level >= 5) {
        unlockBadge('level_5');
      }
    }
  }

  function updateXPUI() {
    const xpVal = document.getElementById('xp-value');
    const xpLvl = document.getElementById('xp-level');
    if (xpVal) xpVal.textContent = `${xp} XP`;
    if (xpLvl) xpLvl.textContent = `· Lv ${level}`;
  }

  function unlockBadge(badgeId) {
    if (unlockedBadges[badgeId]) return; // already unlocked
    
    unlockedBadges[badgeId] = new Date().toLocaleDateString();
    save();
    
    const badge = BADGE_DEFS[badgeId];
    if (badge) {
      showToast(`🏆 Achievement Unlocked: ${badge.name}!`, 'success');
      if (typeof triggerConfetti === 'function') triggerConfetti();
      
      if (AppState.currentView === 'analytics') {
        renderBadgesGrid();
      }
    }
  }

  function renderBadgesGrid() {
    const grid = document.getElementById('badges-grid');
    if (!grid) return;
    
    grid.innerHTML = Object.keys(BADGE_DEFS).map(id => {
      const badge = BADGE_DEFS[id];
      const isUnlocked = !!unlockedBadges[id];
      const unlockDate = unlockedBadges[id];
      
      return `
        <div class="badge-card ${isUnlocked ? 'unlocked' : 'locked'}">
          <div class="badge-icon">${badge.icon}</div>
          <div class="badge-name">${badge.name}</div>
          <div class="badge-desc">${badge.desc}</div>
          ${isUnlocked ? `<div class="badge-unlock-date">${unlockDate}</div>` : '<div class="badge-unlock-date">Locked</div>'}
        </div>
      `;
    }).join('');
  }

  function triggerLevelUpCelebration() {
    showToast(`🎉 Level Up! Reached Level ${level}! 🎉`, 'success');
    if (typeof triggerConfetti === 'function') triggerConfetti();
    
    const overlay = document.createElement('div');
    overlay.className = 'focus-hud-overlay';
    overlay.style.zIndex = '3000';
    overlay.innerHTML = `
      <div class="focus-hud-pulse-ring"></div>
      <div class="day-review-title" style="font-size: 42px;">LEVEL UP! 🌟</div>
      <div style="font-size: 20px; color: var(--text-secondary); margin-bottom: 20px;">You are now Level ${level}</div>
      <button class="btn btn-primary" onclick="this.parentElement.remove()" style="padding: 10px 30px;">Awesome!</button>
    `;
    document.body.appendChild(overlay);
  }

  function checkTaskBadges(task) {
    unlockBadge('first_step');
    
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) {
      unlockBadge('night_owl');
    }
    
    if (hour >= 5 && hour < 9) {
      unlockBadge('early_bird');
    }
    
    if (task.priority === 'critical' || task.urgencyScore >= 70) {
      const minsLeft = task.deadline ? (task.deadline - new Date()) / 60000 : Infinity;
      if (minsLeft <= 90 && minsLeft > 0) {
        unlockBadge('crisis_survivor');
      }
    }
    
    const todayKey = new Date().toLocaleDateString();
    const tasks = TaskStore.getAll();
    const completedToday = tasks.filter(t => t.status === 'completed' && t.completedAt && new Date(t.completedAt).toLocaleDateString() === todayKey);
    
    if (completedToday.length >= 5) {
      unlockBadge('speed_demon');
    }
    if (completedToday.length >= 10) {
      unlockBadge('overachiever');
    }
  }
  
  function checkFocusBadges(totalSessions) {
    if (totalSessions >= 5) unlockBadge('focus_master');
    if (totalSessions >= 15) unlockBadge('deep_work_guru');
  }

  function checkHabitBadges(longestStreak) {
    if (longestStreak >= 5) {
      unlockBadge('habit_hero');
    }
  }

  function checkPlannerBadges() {
    const total = TaskStore.getAll().length;
    if (total >= 10) unlockBadge('planner');
  }

  return {
    load,
    save,
    getXP,
    getLevel,
    getUnlockedBadges,
    earnXP,
    unlockBadge,
    renderBadgesGrid,
    checkTaskBadges,
    checkFocusBadges,
    checkHabitBadges,
    checkPlannerBadges,
    updateXPUI
  };
})();

window.Gamification = Gamification;
window.earnXP = Gamification.earnXP;
window.unlockBadge = Gamification.unlockBadge;
