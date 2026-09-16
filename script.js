// Game Setup & Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;
const GROUND_Y = 210;

// Web Audio API Synth Sounds
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const sound = {
  jump: () => playTone(600, 'square', 0.1),
  score: () => {
    playTone(800, 'square', 0.08);
    setTimeout(() => playTone(1200, 'square', 0.12), 80);
  },
  hit: () => playTone(120, 'sawtooth', 0.25)
};

// Game State Constants
const STATE = { START: 0, PLAYING: 1, GAMEOVER: 2 };
let currentState = STATE.START;

// Game Variables
let speed = 6;
const INITIAL_SPEED = 6;
const MAX_SPEED = 14;
let score = 0;
let highScore = localStorage.getItem('dino_hi_score') || 0;
let frameCount = 0;
let isNight = false;

// Dinosaur Definition
const dino = {
  x: 50,
  y: GROUND_Y - 47,
  width: 44,
  height: 47,
  vy: 0,
  gravity: 0.6,
  jumpForce: -11.5,
  isJumping: false,
  isDucking: false,
  legFrame: 0,
  
  reset() {
    this.y = GROUND_Y - 47;
    this.width = 44;
    this.height = 47;
    this.vy = 0;
    this.isJumping = false;
    this.isDucking = false;
  },

  jump() {
    if (!this.isJumping) {
      this.vy = this.jumpForce;
      this.isJumping = true;
      sound.jump();
    }
  },

  duck(ducking) {
    if (this.isJumping) {
      if (ducking) this.vy += 1.5; // Fast fall
      return;
    }
    if (ducking && !this.isDucking) {
      this.isDucking = true;
      this.height = 26;
      this.width = 55;
      this.y = GROUND_Y - 26;
    } else if (!ducking && this.isDucking) {
      this.isDucking = false;
      this.height = 47;
      this.width = 44;
      this.y = GROUND_Y - 47;
    }
  },

  update() {
    if (this.isJumping) {
      this.y += this.vy;
      this.vy += this.gravity;

      const currentGround = this.isDucking ? GROUND_Y - 26 : GROUND_Y - 47;
      if (this.y >= currentGround) {
        this.y = currentGround;
        this.isJumping = false;
        this.vy = 0;
      }
    }
  },

  draw(color) {
    ctx.fillStyle = color;
    // Drawn via vector rects relative to dino coordinates
    if (!this.isDucking) {
      // Body & Head
      ctx.fillRect(this.x + 20, this.y, 20, 16);
      ctx.fillRect(this.x + 32, this.y + 4, 4, 4); // Eye cutout (later filled by bg color)
      ctx.fillRect(this.x + 10, this.y + 16, 26, 16);
      ctx.fillRect(this.x + 4, this.y + 20, 8, 10);
      
      // Animated Legs
      if (this.isJumping) {
        ctx.fillRect(this.x + 12, this.y + 32, 4, 12);
        ctx.fillRect(this.x + 24, this.y + 32, 4, 12);
      } else {
        const legToggle = Math.floor(frameCount / 6) % 2;
        ctx.fillRect(this.x + 12, this.y + 32, 4, legToggle ? 14 : 8);
        ctx.fillRect(this.x + 24, this.y + 32, 4, legToggle ? 8 : 14);
      }
    } else {
      // Ducking Body
      ctx.fillRect(this.x, this.y + 4, 40, 14);
      ctx.fillRect(this.x + 35, this.y, 18, 12);
      
      // Ducking Legs
      const legToggle = Math.floor(frameCount / 6) % 2;
      ctx.fillRect(this.x + 10, this.y + 18, 4, legToggle ? 8 : 4);
      ctx.fillRect(this.x + 26, this.y + 18, 4, legToggle ? 4 : 8);
    }
  }
};

// Obstacle Management
let obstacles = [];
let nextObstacleTimer = 0;

class Cactus {
  constructor(x, type) {
    this.x = x;
    this.type = type; // 'small', 'large', 'triple'
    this.y = GROUND_Y - (type === 'large' ? 46 : 35);
    this.width = type === 'triple' ? 48 : (type === 'large' ? 22 : 16);
    this.height = type === 'large' ? 46 : 35;
  }

  update() {
    this.x -= speed;
  }

  draw(color) {
    ctx.fillStyle = color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

class Pterodactyl {
  constructor(x) {
    this.x = x;
    const heights = [GROUND_Y - 28, GROUND_Y - 50, GROUND_Y - 75];
    this.y = heights[Math.floor(Math.random() * heights.length)];
    this.width = 38;
    this.height = 24;
    this.wingFrame = 0;
  }

  update() {
    this.x -= speed + 1; // Slightly faster than cacti
  }

  draw(color) {
    ctx.fillStyle = color;
    ctx.fillRect(this.x + 8, this.y + 8, 22, 10); // Body
    ctx.fillRect(this.x, this.y + 10, 10, 5);     // Tail
    ctx.fillRect(this.x + 30, this.y + 4, 8, 6);   // Head

    // Animated Wings
    const wingUp = Math.floor(frameCount / 10) % 2 === 0;
    if (wingUp) {
      ctx.fillRect(this.x + 14, this.y - 6, 8, 14);
    } else {
      ctx.fillRect(this.x + 14, this.y + 12, 8, 12);
    }
  }
}

function spawnObstacles() {
  if (nextObstacleTimer <= 0) {
    const minDistance = 60 + speed * 12;
    const randomDistance = Math.floor(Math.random() * 120);
    nextObstacleTimer = minDistance + randomDistance;

    // Introduce pterodactyls after 150 score
    if (score > 150 && Math.random() < 0.3) {
      obstacles.push(new Pterodactyl(CANVAS_WIDTH));
    } else {
      const types = ['small', 'large', 'triple'];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      obstacles.push(new Cactus(CANVAS_WIDTH, chosenType));
    }
  }
  nextObstacleTimer--;
}

// Background Parallax & Objects
let groundOffset = 0;
let clouds = [];

function updateClouds() {
  if (Math.random() < 0.008) {
    clouds.push({ x: CANVAS_WIDTH, y: Math.random() * 80 + 20, speed: 1 + Math.random() });
  }
  clouds.forEach(cloud => cloud.x -= cloud.speed);
  clouds = clouds.filter(cloud => cloud.x > -50);
}

function drawClouds(color) {
  ctx.fillStyle = color;
  clouds.forEach(cloud => {
    ctx.fillRect(cloud.x, cloud.y, 30, 8);
    ctx.fillRect(cloud.x + 6, cloud.y - 4, 18, 12);
  });
}

function drawGround(color) {
  groundOffset = (groundOffset + speed) % CANVAS_WIDTH;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
  ctx.stroke();

  // Decorative floor dots
  ctx.fillStyle = color;
  for (let i = 0; i < CANVAS_WIDTH; i += 40) {
    let xPos = (i - groundOffset + CANVAS_WIDTH) % CANVAS_WIDTH;
    ctx.fillRect(xPos, GROUND_Y + 6, 4, 2);
    ctx.fillRect((xPos + 15) % CANVAS_WIDTH, GROUND_Y + 12, 2, 2);
  }
}

// Collision Logic (AABB with inner padding for fair play)
function checkCollision(a, b) {
  const padding = 6;
  return (
    a.x + padding < b.x + b.width - padding &&
    a.x + a.width - padding > b.x + padding &&
    a.y + padding < b.y + b.height - padding &&
    a.y + a.height - padding > b.y + padding
  );
}

function gameOver() {
  currentState = STATE.GAMEOVER;
  sound.hit();
  if (score > highScore) {
    highScore = Math.floor(score);
    localStorage.setItem('dino_hi_score', highScore);
  }
}

function resetGame() {
  score = 0;
  speed = INITIAL_SPEED;
  obstacles = [];
  clouds = [];
  frameCount = 0;
  nextObstacleTimer = 0;
  dino.reset();
  currentState = STATE.PLAYING;
}

// Input Handlers
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (currentState === STATE.START || currentState === STATE.GAMEOVER) {
      resetGame();
    } else if (currentState === STATE.PLAYING) {
      dino.jump();
    }
  }
  if (e.code === 'ArrowDown' && currentState === STATE.PLAYING) {
    e.preventDefault();
    dino.duck(true);
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown' && currentState === STATE.PLAYING) {
    dino.duck(false);
  }
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (currentState === STATE.START || currentState === STATE.GAMEOVER) {
    resetGame();
  } else if (currentState === STATE.PLAYING) {
    dino.jump();
  }
});

// HUD & UI Drawing
function drawScore(textColor) {
  ctx.fillStyle = textColor;
  ctx.font = '16px "Courier New", monospace';
  ctx.textAlign = 'right';

  const currentScoreStr = String(Math.floor(score)).padStart(5, '0');
  const highScoreStr = String(highScore).padStart(5, '0');

  ctx.fillText(`HI ${highScoreStr}  ${currentScoreStr}`, CANVAS_WIDTH - 20, 30);
}

function drawOverlay(bgColor, textColor) {
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';

  if (currentState === STATE.START) {
    ctx.font = '20px "Courier New", monospace';
    ctx.fillText('PRESS SPACE TO PLAY', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  } else if (currentState === STATE.GAMEOVER) {
    ctx.font = '22px "Courier New", monospace';
    ctx.fillText('G A M E   O V E R', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15);
    ctx.font = '14px "Courier New", monospace';
    ctx.fillText('PRESS SPACE TO RESTART', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
  }
}

// Main Game Loop
function gameLoop() {
  frameCount++;

  // Day/Night Cycle (Inverts every 700 points)
  isNight = Math.floor(score / 700) % 2 === 1;
  const themeBg = isNight ? '#202124' : '#ffffff';
  const themeFg = isNight ? '#e8eaed' : '#535353';

  // Clear Canvas
  ctx.fillStyle = themeBg;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Render Background
  updateClouds();
  drawClouds(isNight ? '#444' : '#d3d3d3');
  drawGround(themeFg);

  if (currentState === STATE.PLAYING) {
    // Increment Score & Speed
    score += 0.15;
    if (speed < MAX_SPEED) speed += 0.0008;

    // Milestone Sound Effect every 100 points
    if (Math.floor(score) > 0 && Math.floor(score) % 100 === 0 && Math.floor(score - 0.15) % 100 !== 0) {
      sound.score();
    }

    // Update & Check Dinosaur
    dino.update();

    // Spawn & Update Obstacles
    spawnObstacles();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const obs = obstacles[i];
      obs.update();

      if (checkCollision(dino, obs)) {
        gameOver();
      }

      if (obs.x + obs.width < 0) {
        obstacles.splice(i, 1);
      }
    }
  }

  // Render Game Objects
  dino.draw(themeFg);
  obstacles.forEach(obs => obs.draw(themeFg));
  drawScore(themeFg);

  if (currentState !== STATE.PLAYING) {
    drawOverlay(themeBg, themeFg);
  }

  requestAnimationFrame(gameLoop);
}

// Start Game Loop
requestAnimationFrame(gameLoop);
