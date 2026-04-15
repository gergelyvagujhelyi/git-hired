/**
 * Git Hired — an endless runner through the tech hiring gauntlet.
 *
 * Vanilla JavaScript. No frameworks. No engine. No dependencies.
 * Just an HTML5 canvas, a main loop, and a lot of love for arcade games.
 */
'use strict';

// ============================================================
//  Config
// ============================================================
const CFG = {
  width: 960,
  height: 540,
  groundY: 440,
  gravity: 0.75,
  jumpPower: -14.5,
  jumpCutGravity: 1.8,
  baseSpeed: 5.5,
  maxSpeed: 13,
  speedRamp: 0.00035,
  spawnBase: 1500,
  spawnMin: 520,
  coffeeDuration: 320,
  invincibleDuration: 75,
  victoryScore: 1_000_000,
};

// ============================================================
//  Utilities
// ============================================================
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// ============================================================
//  Input (keyboard + touch + mobile buttons)
// ============================================================
class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.touchJump = false;
    this.touchDuck = false;
    this.touchJumpPressed = false;

    const keyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    const keyUp = (e) => this.keys.delete(e.code);

    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    // Canvas tap = jump
    const tapStart = (e) => {
      e.preventDefault();
      if (!this.touchJump) this.touchJumpPressed = true;
      this.touchJump = true;
    };
    const tapEnd = (e) => {
      e.preventDefault();
      this.touchJump = false;
    };
    canvas.addEventListener('touchstart', tapStart, { passive: false });
    canvas.addEventListener('touchend', tapEnd, { passive: false });
    canvas.addEventListener('touchcancel', tapEnd, { passive: false });

    // Mobile on-screen buttons
    const jumpBtn = document.getElementById('jump-btn');
    const duckBtn = document.getElementById('duck-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (!this.touchJump) this.touchJumpPressed = true;
        this.touchJump = true;
      }, { passive: false });
      jumpBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchJump = false;
      }, { passive: false });
    }
    if (duckBtn) {
      duckBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.touchDuck = true;
      }, { passive: false });
      duckBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.touchDuck = false;
      }, { passive: false });
    }
  }

  endFrame() {
    this.pressed.clear();
    this.touchJumpPressed = false;
  }

  down(code) { return this.keys.has(code); }
  just(code) { return this.pressed.has(code); }

  get jumpPressed() {
    return this.just('Space') || this.just('ArrowUp') || this.just('KeyW') || this.touchJumpPressed;
  }
  get jumpHeld() {
    return this.down('Space') || this.down('ArrowUp') || this.down('KeyW') || this.touchJump;
  }
  get duckHeld() {
    return this.down('ArrowDown') || this.down('KeyS') || this.touchDuck;
  }
}

// ============================================================
//  Audio (synthesized with Web Audio API — no sound files needed)
// ============================================================
class Audio {
  constructor() {
    this.muted = false;
    this.ctx = null;
  }

  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      /* Audio unsupported — game still works without sound */
    }
  }

  tone(freq, duration, type = 'square', vol = 0.08, freqTo = null) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqTo), now + duration);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  jump()      { this.tone(420, 0.13, 'square', 0.05, 720); }
  collect()   { this.tone(600, 0.08, 'square', 0.07, 1200); setTimeout(() => this.tone(900, 0.08, 'square', 0.05, 1400), 50); }
  coffee()    { this.tone(400, 0.25, 'sine', 0.09, 900); setTimeout(() => this.tone(700, 0.2, 'sine', 0.06, 1100), 100); }
  hit()       { this.tone(180, 0.35, 'sawtooth', 0.12, 60); }
  gameOver()  {
    [440, 330, 247, 196].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.25, 'triangle', 0.1), i * 150)
    );
  }
  victory()   {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this.tone(f, 0.2, 'square', 0.08), i * 120)
    );
  }

  toggle() { this.muted = !this.muted; }
}

// ============================================================
//  Particles
// ============================================================
class Particle {
  constructor(x, y, vx, vy, color, life, size = 3, gravity = 0.2) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.gravity = gravity;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += this.gravity;
    this.vx *= 0.98;
    this.life--;
  }
  draw(ctx) {
    ctx.globalAlpha = this.life / this.maxLife;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    ctx.globalAlpha = 1;
  }
  get dead() { return this.life <= 0; }
}

// ============================================================
//  Player
// ============================================================
class Player {
  constructor() { this.reset(); }

  reset() {
    this.x = 140;
    this.y = CFG.groundY;
    this.w = 34;
    this.h = 54;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.invincible = 0;
    this.boosted = 0;
    this.lives = 3;
    this.animT = 0;
  }

  update(input, game) {
    if (input.jumpPressed && this.grounded) {
      this.vy = CFG.jumpPower;
      this.grounded = false;
      game.audio.jump();
      for (let i = 0; i < 8; i++) {
        game.particles.push(new Particle(
          this.x + this.w / 2 + rand(-4, 4),
          this.y,
          rand(-2, 2), rand(-4, -1),
          '#565f89', randInt(12, 22), rand(2, 3.5)
        ));
      }
    }

    // Variable jump height — release early = shorter jump
    if (!input.jumpHeld && this.vy < 0) {
      this.vy += CFG.jumpCutGravity;
    } else {
      this.vy += CFG.gravity;
    }

    this.ducking = input.duckHeld && this.grounded;

    this.y += this.vy;

    if (this.y >= CFG.groundY) {
      this.y = CFG.groundY;
      this.vy = 0;
      this.grounded = true;
    }

    if (this.invincible > 0) this.invincible--;
    if (this.boosted > 0) this.boosted--;

    this.animT += 0.22;
  }

  draw(ctx) {
    // Blink during invincibility (but not during coffee boost — keep boost visible)
    const blinking = this.invincible > 0 && !this.boosted && Math.floor(this.animT * 3) % 2 === 0;
    if (blinking) return;

    const h = this.ducking ? this.h * 0.58 : this.h;
    const y = this.y - h;
    const x = this.x;

    // Coffee boost aura
    if (this.boosted > 0) {
      const auraPulse = 0.4 + Math.sin(this.animT * 3) * 0.2;
      ctx.globalAlpha = auraPulse;
      ctx.fillStyle = '#e0af68';
      ctx.fillRect(x - 6, y - 4, this.w + 12, h + 8);
      ctx.fillStyle = '#ff9e64';
      ctx.fillRect(x - 3, y - 2, this.w + 6, h + 4);
      ctx.globalAlpha = 1;
    }

    const headH = h * 0.32;
    const bodyH = h * 0.48;
    const legsH = h * 0.2;
    const bodyY = y + headH;
    const legsY = y + headH + bodyH;

    // Head (skin)
    ctx.fillStyle = '#e0af68';
    ctx.fillRect(x + 4, y + 2, this.w - 8, headH - 2);

    // Hair
    ctx.fillStyle = '#1f2335';
    ctx.fillRect(x + 4, y + 2, this.w - 8, 5);
    ctx.fillRect(x + 2, y + 4, 4, 6);
    ctx.fillRect(x + this.w - 6, y + 4, 4, 6);

    // Glasses
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(x + 7, y + headH * 0.55, 7, 5);
    ctx.fillRect(x + this.w - 14, y + headH * 0.55, 7, 5);
    ctx.fillStyle = '#414868';
    ctx.fillRect(x + 14, y + headH * 0.6, 6, 2);

    // Shirt
    ctx.fillStyle = this.boosted > 0 ? '#ff9e64' : '#7aa2f7';
    ctx.fillRect(x, bodyY, this.w, bodyH);
    // Shirt highlight
    ctx.fillStyle = this.boosted > 0 ? '#e0af68' : '#bb9af7';
    ctx.fillRect(x, bodyY, 4, bodyH);

    // Tie / lanyard
    ctx.fillStyle = '#f7768e';
    ctx.fillRect(x + this.w / 2 - 2, bodyY + 2, 4, bodyH - 8);

    // Legs (animated)
    ctx.fillStyle = '#414868';
    if (!this.grounded) {
      // Jumping: legs tucked
      ctx.fillRect(x + 4, legsY, 10, legsH);
      ctx.fillRect(x + this.w - 14, legsY, 10, legsH);
    } else if (this.ducking) {
      ctx.fillRect(x + 4, legsY, this.w - 8, legsH);
    } else {
      const phase = Math.floor(this.animT) % 2;
      if (phase === 0) {
        ctx.fillRect(x + 3, legsY, 10, legsH);
        ctx.fillRect(x + this.w - 13, legsY, 10, legsH - 3);
      } else {
        ctx.fillRect(x + 3, legsY, 10, legsH - 3);
        ctx.fillRect(x + this.w - 13, legsY, 10, legsH);
      }
    }

    // Laptop held under arm
    if (!this.ducking) {
      const lx = x - 5;
      const ly = bodyY + bodyH * 0.4;
      ctx.fillStyle = '#9ece6a';
      ctx.fillRect(lx, ly, 10, 14);
      ctx.fillStyle = '#1a1b26';
      ctx.fillRect(lx + 1, ly + 1, 8, 7);
      // Tiny code lines on screen
      ctx.fillStyle = '#9ece6a';
      ctx.fillRect(lx + 2, ly + 2, 4, 1);
      ctx.fillRect(lx + 2, ly + 4, 5, 1);
      ctx.fillRect(lx + 2, ly + 6, 3, 1);
    }
  }

  get hitbox() {
    const h = this.ducking ? this.h * 0.58 : this.h;
    return {
      x: this.x + 3,
      y: this.y - h + 3,
      w: this.w - 6,
      h: h - 5,
    };
  }

  // Returns true if the hit connected (not i-frames / not boosted)
  takeHit() {
    if (this.invincible > 0 || this.boosted > 0) return false;
    this.lives--;
    this.invincible = CFG.invincibleDuration;
    return true;
  }
}

// ============================================================
//  Entity base
// ============================================================
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y;
    this.w = w; this.h = h;
    this.dead = false;
  }
  update(speed) {
    this.x -= speed;
    if (this.x + this.w < -200) this.dead = true;
  }
  draw(ctx) {}
  get hitbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
}

// ============================================================
//  Obstacles
// ============================================================
class Bug extends Entity {
  constructor(x) {
    super(x, CFG.groundY - 22, 30, 22);
    this.legPhase = rand(0, Math.PI * 2);
  }
  update(speed) { super.update(speed); this.legPhase += 0.35; }
  draw(ctx) {
    const { x, y, w, h } = this;
    ctx.fillStyle = '#f7768e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c53b5d';
    ctx.fillRect(x, y, w, 4);
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 5, y + 6, 5, 5);
    ctx.fillRect(x + w - 10, y + 6, 5, 5);
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(x + 6, y + 7, 3, 3);
    ctx.fillRect(x + w - 9, y + 7, 3, 3);
    // Legs
    const sway = Math.sin(this.legPhase) * 2;
    ctx.strokeStyle = '#1a1b26';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 10); ctx.lineTo(x - 4, y + 18 + sway);
    ctx.moveTo(x + w - 3, y + 10); ctx.lineTo(x + w + 4, y + 18 - sway);
    ctx.moveTo(x + 3, y + 16); ctx.lineTo(x - 5, y + 24 - sway);
    ctx.moveTo(x + w - 3, y + 16); ctx.lineTo(x + w + 5, y + 24 + sway);
    ctx.stroke();
  }
  get kind() { return 'obstacle'; }
}

class RejectionLetter extends Entity {
  constructor(x) {
    // Floats at head/duck height — you must duck to pass
    super(x, CFG.groundY - 105, 52, 34);
    this.bob = rand(0, Math.PI * 2);
  }
  update(speed) { super.update(speed); this.bob += 0.09; }
  draw(ctx) {
    const y = this.y + Math.sin(this.bob) * 4;
    const { x, w, h } = this;
    // Envelope
    ctx.fillStyle = '#f7768e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c53b5d';
    ctx.fillRect(x, y, w, 3);
    ctx.fillRect(x, y + h - 3, w, 3);
    // Fold
    ctx.strokeStyle = '#1a1b26';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w / 2, y + h / 2);
    ctx.lineTo(x + w, y);
    ctx.stroke();
    // Stamp
    ctx.fillStyle = '#1a1b26';
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NO', x + w / 2, y + h - 6);
    ctx.textAlign = 'left';
  }
  get kind() { return 'obstacle'; }
  get hitbox() {
    return { x: this.x + 4, y: this.y + Math.sin(this.bob) * 4 + 3, w: this.w - 8, h: this.h - 6 };
  }
}

class ExperienceWall extends Entity {
  constructor(x) {
    super(x, CFG.groundY - 88, 38, 88);
    this.years = pick([10, 15, 20, 25, 30]);
  }
  draw(ctx) {
    const { x, y, w, h } = this;
    // Outer frame
    ctx.fillStyle = '#f7768e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    // Warning stripes
    ctx.fillStyle = '#e0af68';
    for (let i = 0; i < h; i += 8) {
      ctx.fillRect(x + 3, y + 3 + i, w - 6, 2);
    }
    // Rotated text
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#f7768e';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${this.years}+ YRS`, 0, -3);
    ctx.fillText('REQUIRED', 0, 9);
    ctx.restore();
    ctx.textAlign = 'left';
  }
  get kind() { return 'obstacle'; }
}

class Meeting extends Entity {
  // A "this could've been an email" meeting cloud
  constructor(x) {
    super(x, CFG.groundY - randInt(110, 150), 70, 34);
    this.bob = rand(0, Math.PI * 2);
  }
  update(speed) {
    super.update(speed * 0.85);
    this.bob += 0.05;
  }
  draw(ctx) {
    const y = this.y + Math.sin(this.bob) * 3;
    const { x, w, h } = this;
    // Cloud
    ctx.fillStyle = '#565f89';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillRect(x, y + 12, w, h - 18);
    ctx.fillRect(x + 10, y, w - 20, h);
    // Text
    ctx.fillStyle = '#c0caf5';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MEETING', x + w / 2, y + h / 2 - 2);
    ctx.font = '6px JetBrains Mono, monospace';
    ctx.fillStyle = '#a9b1d6';
    ctx.fillText('(could be email)', x + w / 2, y + h / 2 + 7);
    ctx.textAlign = 'left';
  }
  get kind() { return 'obstacle'; }
  get hitbox() {
    return { x: this.x + 4, y: this.y + Math.sin(this.bob) * 3 + 4, w: this.w - 8, h: this.h - 8 };
  }
}

// ============================================================
//  Collectibles
// ============================================================
const SKILL_POOL = [
  { name: 'JS',    color: '#e0af68', value: 8000 },
  { name: 'TS',    color: '#7dcfff', value: 12000 },
  { name: 'PY',    color: '#9ece6a', value: 10000 },
  { name: 'RS',    color: '#ff9e64', value: 18000 },
  { name: 'GO',    color: '#7aa2f7', value: 14000 },
  { name: 'C++',   color: '#bb9af7', value: 16000 },
  { name: 'K8S',   color: '#7dcfff', value: 20000 },
  { name: 'AWS',   color: '#e0af68', value: 22000 },
  { name: 'SQL',   color: '#9ece6a', value: 9000 },
  { name: 'GIT',   color: '#f7768e', value: 7000 },
  { name: 'SRE',   color: '#bb9af7', value: 24000 },
  { name: 'ML',    color: '#c678dd', value: 26000 },
];

class Skill extends Entity {
  constructor(x) {
    const s = pick(SKILL_POOL);
    super(x, CFG.groundY - randInt(70, 220), 34, 34);
    this.name = s.name;
    this.color = s.color;
    this.value = s.value;
    this.spin = rand(0, Math.PI * 2);
  }
  update(speed) { super.update(speed); this.spin += 0.08; }
  draw(ctx) {
    const pulse = 1 + Math.sin(this.spin) * 0.1;
    const cx = this.x + this.w / 2;
    const cy = this.y + this.h / 2;
    const size = this.w * pulse;

    // Glow halo
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = this.color;
    ctx.fillRect(cx - size / 2 - 6, cy - size / 2 - 6, size + 12, size + 12);
    ctx.globalAlpha = 1;

    // Main square
    ctx.fillStyle = this.color;
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(cx - size / 2, cy - size / 2, size, size / 4);

    // Text
    ctx.fillStyle = '#1a1b26';
    const fontSize = this.name.length > 2 ? 11 : 14;
    ctx.font = `bold ${fontSize}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.name, cx, cy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  get kind() { return 'skill'; }
}

class Coffee extends Entity {
  constructor(x) {
    super(x, CFG.groundY - randInt(80, 200), 28, 34);
    this.bob = rand(0, Math.PI * 2);
  }
  update(speed) { super.update(speed); this.bob += 0.12; }
  draw(ctx) {
    const y = this.y + Math.sin(this.bob) * 3;
    const { x, w, h } = this;
    // Cup body
    ctx.fillStyle = '#bb9af7';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 10);
    ctx.lineTo(x + w - 2, y + 10);
    ctx.lineTo(x + w - 4, y + h);
    ctx.lineTo(x + 4, y + h);
    ctx.closePath();
    ctx.fill();
    // Lid
    ctx.fillStyle = '#ff9e64';
    ctx.fillRect(x, y + 6, w, 5);
    ctx.fillStyle = '#e0af68';
    ctx.fillRect(x + w / 2 - 2, y + 4, 4, 4);
    // Handle
    ctx.strokeStyle = '#bb9af7';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + w + 1, y + 20, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    // Label
    ctx.fillStyle = '#1a1b26';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('☕', x + w / 2, y + 26);
    ctx.textAlign = 'left';
    // Steam
    ctx.strokeStyle = 'rgba(192, 202, 245, 0.5)';
    ctx.lineWidth = 1.5;
    const s = Math.sin(this.bob * 2);
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.quadraticCurveTo(x + 8 + s * 3, y - 4, x + 8, y - 10);
    ctx.moveTo(x + 20, y + 4);
    ctx.quadraticCurveTo(x + 20 - s * 3, y - 4, x + 20, y - 10);
    ctx.stroke();
  }
  get kind() { return 'coffee'; }
}

// ============================================================
//  Parallax Background
// ============================================================
class Background {
  constructor() {
    this.stars = Array.from({ length: 60 }, () => ({
      x: rand(0, CFG.width),
      y: rand(0, CFG.groundY - 60),
      size: rand(1, 2.5),
      twinkle: rand(0, Math.PI * 2),
      speed: rand(0.05, 0.2),
    }));
    this.farBuildings = this.buildSkyline(0.25, 60, 140, '#1f2335', 14);
    this.nearBuildings = this.buildSkyline(0.55, 80, 220, '#24283b', 10);
    this.groundOffset = 0;
  }

  buildSkyline(speed, minH, maxH, color, count) {
    const buildings = [];
    let x = 0;
    for (let i = 0; i < count * 2; i++) {
      const w = rand(70, 140);
      const h = rand(minH, maxH);
      const windowCols = randInt(2, 5);
      const windowRows = Math.floor(h / 24) - 1;
      const windows = [];
      for (let r = 0; r < windowRows; r++) {
        for (let c = 0; c < windowCols; c++) {
          windows.push({ r, c, lit: Math.random() > 0.35 });
        }
      }
      buildings.push({ x, w, h, windowCols, windowRows, windows });
      x += w;
    }
    return { speed, color, buildings, totalWidth: x, offset: 0 };
  }

  drawSkyline(ctx, skyline) {
    const total = skyline.totalWidth;
    const off = skyline.offset % total;
    ctx.fillStyle = skyline.color;
    for (const b of skyline.buildings) {
      const positions = [b.x - off, b.x - off + total, b.x - off - total];
      for (const bx of positions) {
        if (bx > -b.w && bx < CFG.width) {
          ctx.fillRect(bx, CFG.groundY - b.h, b.w, b.h);
          // Windows
          for (const win of b.windows) {
            if (!win.lit) continue;
            const gap = b.w / (b.windowCols + 1);
            const wx = bx + gap * (win.c + 1) - 4;
            const wy = CFG.groundY - b.h + 14 + win.r * 22;
            ctx.fillStyle = (win.r + win.c) % 3 === 0 ? '#e0af68' : '#7aa2f7';
            ctx.fillRect(wx, wy, 7, 10);
            ctx.fillStyle = skyline.color;
          }
        }
      }
    }
  }

  update(speed) {
    this.farBuildings.offset += speed * this.farBuildings.speed;
    this.nearBuildings.offset += speed * this.nearBuildings.speed;
    this.groundOffset = (this.groundOffset + speed) % 40;
    for (const s of this.stars) {
      s.twinkle += 0.04;
      s.x -= s.speed;
      if (s.x < 0) s.x += CFG.width;
    }
  }

  draw(ctx) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, CFG.groundY);
    g.addColorStop(0, '#0d0e14');
    g.addColorStop(1, '#1a1b26');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CFG.width, CFG.groundY);

    // Moon
    ctx.fillStyle = '#c0caf5';
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.arc(CFG.width - 120, 90, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(CFG.width - 120, 90, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Stars
    for (const s of this.stars) {
      ctx.globalAlpha = 0.3 + Math.sin(s.twinkle) * 0.35;
      ctx.fillStyle = '#c0caf5';
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // Parallax buildings
    this.drawSkyline(ctx, this.farBuildings);
    this.drawSkyline(ctx, this.nearBuildings);

    // Ground
    const groundG = ctx.createLinearGradient(0, CFG.groundY, 0, CFG.height);
    groundG.addColorStop(0, '#1f2335');
    groundG.addColorStop(1, '#0d0e14');
    ctx.fillStyle = groundG;
    ctx.fillRect(0, CFG.groundY, CFG.width, CFG.height - CFG.groundY);

    // Ground top line
    ctx.strokeStyle = '#414868';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, CFG.groundY);
    ctx.lineTo(CFG.width, CFG.groundY);
    ctx.stroke();

    // Moving dashes
    ctx.strokeStyle = '#7aa2f7';
    ctx.lineWidth = 2;
    ctx.setLineDash([24, 24]);
    ctx.lineDashOffset = this.groundOffset;
    ctx.beginPath();
    ctx.moveTo(0, CFG.groundY + 24);
    ctx.lineTo(CFG.width, CFG.groundY + 24);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
}

// ============================================================
//  Rejection letters (humor payload)
// ============================================================
const REJECTIONS = [
  "After careful consideration, we've decided to pursue candidates with experience in a programming language we haven't invented yet.",
  "We regret to inform you that the role has been filled by the hiring manager's nephew.",
  "Your skills are impressive — but we need someone with 15+ years of React experience. React was released in 2013.",
  "The position has been converted to an unpaid internship. In another city. Without remote options.",
  "We've decided to leave the position open for another 18 months while we \"find the right fit.\"",
  "Your resume lacks sufficient keyword stuffing to pass our ATS. Please try harder.",
  "We went with a candidate who accepted a lower salary because they had to.",
  "After 7 rounds of interviews, we've decided to restart the process with a fresh candidate pool.",
  "You were overqualified. And somehow also underqualified. Simultaneously. Impressive, really.",
  "Hiring is paused. Again. For the sixth time this quarter.",
  "Thanks for interviewing! We've decided it's cheaper to burn out our existing team.",
  "We loved your work, but the role requires experience with our proprietary 9-letter framework.",
  "Our AI screener rejected you for not smiling enough in the one-way video interview.",
  "You didn't pass our 6-hour take-home challenge. The role was entry-level.",
  "The position was never real. It was a marketing move. Best of luck!",
  "Your GitHub has only 3,247 commits this year. We need serious contributors.",
  "We ghosted you. No hard feelings — it's just easier for us.",
  "A more qualified candidate was found: a random LLM we fine-tuned last week.",
];

const TOASTS = {
  combo2:  ['NICE!',        '#e0af68'],
  combo3:  ['ON FIRE!',     '#ff9e64'],
  combo5:  ['UNSTOPPABLE!', '#f7768e'],
  combo10: ['TECH LEAD!',   '#bb9af7'],
  boost:   ['☕ CAFFEINATED', '#e0af68'],
  close:   ['CLOSE ONE!',   '#7dcfff'],
};

// ============================================================
//  Main Game
// ============================================================
class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.input = new Input(this.canvas);
    this.audio = new Audio();

    this.state = 'title';
    this.player = new Player();
    this.bg = new Background();
    this.entities = [];
    this.particles = [];

    this.score = 0;
    this.best = parseInt(localStorage.getItem('git-hired-best') || '0', 10);
    this.combo = 1;
    this.comboTimer = 0;
    this.comboMilestone = 1;
    this.skills = new Set();
    this.skillCount = 0;
    this.time = 0;
    this.spawnTimer = 1500;
    this.speed = CFG.baseSpeed;
    this.shake = 0;
    this.freeze = 0;
    this.lastNearMiss = 0;

    this.$score     = document.getElementById('score');
    this.$lives     = document.getElementById('lives');
    this.$combo     = document.getElementById('combo');
    this.$skillsBar = document.getElementById('skills-bar');
    this.$toast     = document.getElementById('toast');

    document.getElementById('start-btn').addEventListener('click', () => this.start());
    document.getElementById('retry-btn').addEventListener('click', () => this.start());
    document.getElementById('victory-retry-btn').addEventListener('click', () => this.start());

    this.loop = this.loop.bind(this);
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  start() {
    this.state = 'playing';
    this.player.reset();
    this.entities.length = 0;
    this.particles.length = 0;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.comboMilestone = 1;
    this.skills.clear();
    this.skillCount = 0;
    this.time = 0;
    this.spawnTimer = 1200;
    this.speed = CFG.baseSpeed;
    this.shake = 0;
    this.freeze = 0;

    this.updateHUD();
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.audio.ensure();
  }

  loop(now) {
    const dt = Math.min(now - this.lastTime, 50);
    this.lastTime = now;
    this.update(dt);
    this.draw();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    // Global inputs
    if (this.input.just('KeyM')) this.audio.toggle();
    if (this.input.just('KeyP') && (this.state === 'playing' || this.state === 'paused')) {
      this.togglePause();
    }

    if (this.state === 'paused' || this.state === 'title' ||
        this.state === 'gameover' || this.state === 'victory') {
      this.bg.update(0.4);
      this.particles.forEach(p => p.update());
      this.particles = this.particles.filter(p => !p.dead);
      if (this.shake > 0) this.shake *= 0.9;
      return;
    }

    if (this.freeze > 0) {
      this.freeze--;
      if (this.shake > 0) this.shake *= 0.9;
      if (this.freeze === 0) this.endGame();
      return;
    }

    this.time += dt;

    // Speed ramp
    this.speed = Math.min(CFG.maxSpeed, CFG.baseSpeed + this.time * CFG.speedRamp);
    const effectiveSpeed = this.player.boosted > 0 ? this.speed * 1.4 : this.speed;

    // Spawn
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawn();
      const interval = Math.max(CFG.spawnMin, CFG.spawnBase - this.time * 0.1);
      this.spawnTimer = interval * rand(0.75, 1.25);
    }

    // Update player
    this.player.update(this.input, this);

    // Update entities
    for (const e of this.entities) e.update(effectiveSpeed);

    // Update particles
    for (const p of this.particles) p.update();

    // Background
    this.bg.update(effectiveSpeed);

    // Collisions
    const hb = this.player.hitbox;
    for (const e of this.entities) {
      if (e.dead) continue;
      if (!aabb(hb, e.hitbox)) continue;

      if (e.kind === 'skill') {
        e.dead = true;
        this.collectSkill(e);
      } else if (e.kind === 'coffee') {
        e.dead = true;
        this.collectCoffee(e);
      } else if (e.kind === 'obstacle') {
        if (this.player.boosted > 0) {
          // Plow through with coffee
          e.dead = true;
          this.audio.collect();
          this.burstParticles(e.x + e.w / 2, e.y + e.h / 2, '#e0af68', 14);
          this.score += 500;
        } else if (this.player.takeHit()) {
          this.onHit(e);
          break;
        }
      }
    }

    // Near-miss detection (unclamped pass-over for close calls)
    this.detectNearMiss();

    // Cull
    this.entities = this.entities.filter(e => !e.dead);
    this.particles = this.particles.filter(p => !p.dead);

    // Passive score (survival)
    this.score += dt * 0.8 * this.combo;

    // Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.comboMilestone = 1;
      }
    }

    // Shake
    if (this.shake > 0) this.shake *= 0.88;

    // Victory
    if (this.score >= CFG.victoryScore) {
      this.goVictory();
      return;
    }

    this.updateHUD();
  }

  spawn() {
    const roll = Math.random();
    const obstacleChance = clamp(0.32 + this.time * 0.00007, 0.32, 0.68);
    const x = CFG.width + 40;

    if (roll < obstacleChance) {
      const r = Math.random();
      if (r < 0.35)      this.entities.push(new Bug(x));
      else if (r < 0.65) this.entities.push(new RejectionLetter(x));
      else if (r < 0.88) this.entities.push(new ExperienceWall(x));
      else               this.entities.push(new Meeting(x));
    } else {
      const r = Math.random();
      if (r < 0.85) this.entities.push(new Skill(x));
      else          this.entities.push(new Coffee(x));
    }
  }

  collectSkill(e) {
    const value = Math.floor(SKILL_POOL.find(s => s.name === e.name).value * this.combo);
    this.score += value;
    this.skills.add(e.name);
    this.skillCount++;
    this.combo = Math.min(this.combo + 0.25, 10);
    this.comboTimer = 2600;
    this.audio.collect();
    this.burstParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 12);
    this.showFloatingText(e.x, e.y, `+$${value.toLocaleString()}`, e.color);

    // Combo milestones
    const c = Math.floor(this.combo);
    if (c >= 2 && this.comboMilestone < 2) { this.showToast(...TOASTS.combo2); this.comboMilestone = 2; }
    else if (c >= 3 && this.comboMilestone < 3) { this.showToast(...TOASTS.combo3); this.comboMilestone = 3; }
    else if (c >= 5 && this.comboMilestone < 5) { this.showToast(...TOASTS.combo5); this.comboMilestone = 5; }
    else if (c >= 10 && this.comboMilestone < 10) { this.showToast(...TOASTS.combo10); this.comboMilestone = 10; }
  }

  collectCoffee(e) {
    this.player.boosted = CFG.coffeeDuration;
    this.score += 3000;
    this.audio.coffee();
    this.burstParticles(e.x + e.w / 2, e.y + e.h / 2, '#bb9af7', 18);
    this.showToast(...TOASTS.boost);
  }

  onHit(e) {
    this.audio.hit();
    this.shake = 14;
    this.combo = 1;
    this.comboMilestone = 1;
    this.comboTimer = 0;
    this.burstParticles(e.x + e.w / 2, e.y + e.h / 2, '#f7768e', 22);

    if (this.player.lives <= 0) {
      this.player.dying = true;
      this.freeze = 45;
    }
  }

  detectNearMiss() {
    if (!this.player.grounded && this.lastNearMiss < this.time - 700) {
      const hb = this.player.hitbox;
      for (const e of this.entities) {
        if (e.kind !== 'obstacle' || e.dead) continue;
        const eb = e.hitbox;
        if (eb.x + eb.w > hb.x - 12 && eb.x < hb.x + hb.w + 12) {
          if (hb.y + hb.h < eb.y + 8 && hb.y + hb.h > eb.y - 20) {
            this.showToast(...TOASTS.close);
            this.score += 200;
            this.lastNearMiss = this.time;
            return;
          }
        }
      }
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('pause-screen').classList.remove('hidden');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('pause-screen').classList.add('hidden');
    }
  }

  endGame() {
    this.state = 'gameover';
    this.audio.gameOver();
    const finalScore = Math.floor(this.score);
    if (finalScore > this.best) {
      this.best = finalScore;
      localStorage.setItem('git-hired-best', this.best);
    }
    document.getElementById('final-score').textContent = '$' + finalScore.toLocaleString();
    document.getElementById('best-score').textContent = '$' + this.best.toLocaleString();
    document.getElementById('final-skills').textContent = this.skillCount;
    document.getElementById('final-time').textContent = Math.floor(this.time / 1000) + 's';
    document.getElementById('rejection-message').textContent = pick(REJECTIONS);
    document.getElementById('gameover-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  goVictory() {
    this.state = 'victory';
    this.audio.victory();
    const finalScore = Math.floor(this.score);
    if (finalScore > this.best) {
      this.best = finalScore;
      localStorage.setItem('git-hired-best', this.best);
    }
    document.getElementById('victory-score').textContent = '$' + finalScore.toLocaleString();
    document.getElementById('victory-skills').textContent = this.skillCount;
    document.getElementById('victory-time').textContent = Math.floor(this.time / 1000) + 's';
    document.getElementById('victory-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
  }

  burstParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2, 6);
      this.particles.push(new Particle(
        x, y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed - 2,
        color,
        randInt(22, 42),
        rand(2, 4.5),
        0.22
      ));
    }
  }

  showFloatingText(x, y, text, color) {
    // Abuse the particle system for floating score text via a custom one-shot element
    // We'll just push it as a particle subclass inline for simplicity.
    const t = new Particle(x, y, 0, -1.2, color, 40, 0, 0);
    t.text = text;
    t.draw = function (ctx) {
      ctx.globalAlpha = this.life / this.maxLife;
      ctx.fillStyle = this.color;
      ctx.font = 'bold 14px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.text, this.x, this.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    };
    this.particles.push(t);
  }

  showToast(text, color) {
    this.$toast.textContent = text;
    this.$toast.style.color = color;
    this.$toast.style.textShadow = `0 0 20px ${color}99`;
    this.$toast.classList.remove('show');
    // Reflow to restart animation
    void this.$toast.offsetWidth;
    this.$toast.classList.add('show');
  }

  updateHUD() {
    this.$score.textContent = '$' + Math.floor(this.score).toLocaleString();
    this.$combo.textContent = '×' + this.combo.toFixed(1);
    const hearts = '♥ '.repeat(Math.max(0, this.player.lives)) +
                   '♡ '.repeat(Math.max(0, 3 - this.player.lives));
    this.$lives.textContent = hearts.trim();

    // Render skills only when the set changes in size (cheap diff)
    if (this.skills.size !== this._renderedSkills) {
      this._renderedSkills = this.skills.size;
      this.$skillsBar.innerHTML = [...this.skills]
        .map(s => `<span class="skill-pill">${s}</span>`)
        .join('');
    }
  }

  draw() {
    const ctx = this.ctx;

    ctx.save();
    if (this.shake > 0.5) {
      ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    }

    // Clear
    ctx.fillStyle = '#1a1b26';
    ctx.fillRect(0, 0, CFG.width, CFG.height);

    this.bg.draw(ctx);

    // Entities
    for (const e of this.entities) e.draw(ctx);

    // Player
    this.player.draw(ctx);

    // Particles (on top)
    for (const p of this.particles) p.draw(ctx);

    ctx.restore();

    // Vignette for non-playing states
    if (this.state !== 'playing') {
      ctx.fillStyle = 'rgba(13, 14, 20, 0.55)';
      ctx.fillRect(0, 0, CFG.width, CFG.height);
    }
  }
}

// ============================================================
//  Boot
// ============================================================
window.addEventListener('load', () => {
  new Game();
});
