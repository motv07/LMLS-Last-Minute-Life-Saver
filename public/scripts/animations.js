/**
 * LMLS — Last-Minute Life Saver
 * scripts/animations.js — Custom Particle & Confetti Animations, Loading Skeletons
 */

window.LMLS_Animations = {
  /**
   * Spawns spark particles bursting from a click location (x, y)
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  createCompletionParticles(x, y) {
    const particleCount = 20;
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '99999';
    document.body.appendChild(container);

    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement('div');
      p.style.position = 'absolute';
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.width = `${Math.random() * 8 + 4}px`;
      p.style.height = p.style.width;
      p.style.borderRadius = '50%';
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.opacity = '1';
      container.appendChild(p);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 80 + 40; // Pixels per second
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      const startX = x;
      const startY = y;
      
      const startTime = performance.now();
      const animate = (time) => {
        const elapsed = (time - startTime) / 1000;
        if (elapsed > 0.8) {
          p.remove();
          return;
        }
        
        // Gravity & Drag
        const currentX = startX + vx * elapsed;
        // Add vertical gravity
        const currentY = startY + vy * elapsed + 120 * elapsed * elapsed;
        const currentOpacity = 1 - (elapsed / 0.8);
        const currentScale = 1 - (elapsed / 0.8);
        
        p.style.transform = `translate3d(${currentX - startX}px, ${currentY - startY}px, 0) scale(${currentScale})`;
        p.style.opacity = currentOpacity;
        
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }
    
    // Clean up container
    setTimeout(() => {
      container.remove();
    }, 1000);
  },

  /**
   * Rains confetti down the viewport for milestones
   */
  triggerConfetti() {
    const confettiCount = 80;
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '99999';
    document.body.appendChild(container);

    const colors = ['#7c3aed', '#06b6d4', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

    for (let i = 0; i < confettiCount; i++) {
      const c = document.createElement('div');
      c.style.position = 'absolute';
      const startX = Math.random() * window.innerWidth;
      const startY = -20 - Math.random() * 100;
      
      c.style.left = `${startX}px`;
      c.style.top = `${startY}px`;
      
      const width = Math.random() * 8 + 6;
      const height = Math.random() * 12 + 6;
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
      c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      c.style.opacity = (Math.random() * 0.4 + 0.6).toString();
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      container.appendChild(c);

      const speedY = Math.random() * 150 + 150; // pixels per second
      const speedX = Math.random() * 60 - 30; // drift speed
      const rotSpeed = Math.random() * 360 - 180; // degrees per second
      
      const startTime = performance.now();
      const animate = (time) => {
        const elapsed = (time - startTime) / 1000;
        if (elapsed > 4) {
          c.remove();
          return;
        }
        
        const currentX = startX + speedX * elapsed + Math.sin(elapsed * 5) * 20;
        const currentY = startY + speedY * elapsed;
        const currentRot = rotSpeed * elapsed;
        
        c.style.transform = `translate3d(${currentX - startX}px, ${currentY - startY}px, 0) rotate(${currentRot}deg)`;
        
        // Fade out near the bottom
        if (currentY > window.innerHeight - 100) {
          const fadeProgress = (window.innerHeight - currentY) / 100;
          c.style.opacity = Math.max(0, fadeProgress).toString();
        }
        
        requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
    }

    setTimeout(() => {
      container.remove();
    }, 4500);
  },

  /**
   * Generates a glowing skeleton loader HTML string
   * @param {number} linesCount - Number of loading lines
   * @returns {string} - HTML string
   */
  getLoadingSkeleton(linesCount = 3) {
    let html = '<div class="skeleton-wrapper">';
    for (let i = 0; i < linesCount; i++) {
      const width = i === linesCount - 1 ? '60%' : `${Math.random() * 30 + 70}%`;
      html += `<div class="skeleton-line" style="width: ${width};"></div>`;
    }
    html += '</div>';
    return html;
  }
};
