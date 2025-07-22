import { 
  initializeGame, 
  orbs, 
  particles, 
  projectiles, 
  cameraShake, 
  flashEffect, 
  gameOver, 
  gameStarted, 
  startGameTriggered, 
  sessionId, 
  countdown, 
  UPDATE_INTERVAL, 
  STATE_SYNC_INTERVAL, 
  syncGameState, 
  loadGameState, 
  validateRgb, 
  hexToRgb, 
  startGame, 
  restartGame 
} from './gameLogic.js';

let lastUpdateTime = 0;
let lastStateSync = 0;
let lastStateHash = '';
let lastGameOverCheck = 0;
let lastStatsUpdate = 0;
let errorAlertShown = false;
let syncInProgress = false; // Debounce Firestore syncing

const sketch = (p) => {
  let localStateBuffer = null;

  function getRandomCoreColor() {
    const colors = [
      { value: "Neon Blue", rarity: 0.4651, hex: "#00B7EB", rgb: [0, 183, 235], evasion: 0 },
      { value: "Cosmic Purple", rarity: 0.2326, hex: "#800080", rgb: [128, 0, 128], evasion: 1 },
      { value: "Crimson Glow", rarity: 0.1860, hex: "#DC143C", rgb: [220, 20, 60], evasion: 2 },
      { value: "Radiant Gold", rarity: 0.0930, hex: "#FFD700", rgb: [255, 215, 0], evasion: 3 },
      { value: "Prismatic Iridescence", rarity: 0.0233, hex: "#FFD700", rgb: [255, 215, 0], evasion: 5 }
    ];
    const totalRarity = colors.reduce((sum, color) => sum + color.rarity, 0);
    let random = p.random(totalRarity);
    for (const color of colors) {
      random -= color.rarity;
      if (random <= 0) return { hex: color.hex, rgb: color.rgb };
    }
    return { hex: colors[0].hex, rgb: colors[0].rgb };
  }

  function triggerCameraShake(magnitude, duration) {
    cameraShake.magnitude = magnitude * 0.5;
    cameraShake.timer = duration;
  }

  function triggerFlashEffect() {
    flashEffect.timer = 10;
    flashEffect.alpha = 100;
  }

  async function checkGameOver() {
    const currentTime = p.millis();
    if (currentTime - lastGameOverCheck < 1000) return; // Throttle to once per second
    lastGameOverCheck = currentTime;
    const aliveOrbs = orbs.filter(o => o && o.health > 0);
    if (aliveOrbs.length === 1 && !gameOver) {
      gameOver = true;
      const winner = aliveOrbs[0];
      try {
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
        await addDoc(collection(window.firebaseDb, "winners"), {
          id: winner.id,
          name: winner.name,
          owner: winner.owner,
          role: winner.role,
          timestamp: serverTimestamp(),
          stats: {
            health: winner.health,
            attack: winner.attack,
            defense: winner.defense,
            speed: winner.speed,
            rarity: winner.rarity
          }
        });
        console.log("Winner saved to Firestore");
      } catch (e) {
        console.error("Error saving winner to Firestore:", e);
      }
      Swal.fire({
        title: 'Victory!',
        html: `<strong>${winner.name}</strong> is the last orb standing!<br>Owner: ${winner.owner}`,
        icon: 'success',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#4a5568',
        confirmButtonText: 'Awesome!'
      }).then(() => {
        gameStarted = false;
        startGameTriggered = false;
        document.getElementById('orb-count').textContent = "Waiting for game start...";
      });
    }
  }

  function moveOrb(orb) {
    if (!orb || orb.health <= 0) return;
    if (p.millis() - orb.targetResetFrame > 2500) {
      orb.targetX = null;
      orb.targetResetFrame = p.millis();
    }
    let target = findNearestEnemy(orb);
    if (!target) {
      orb.targetX = p.random(50, 1150);
      orb.targetY = p.random(50, 750);
    } else {
      if (!orb.targetX || p.dist(orb.x, orb.y, target.x, target.y) > orb.attackRange * 1.5) {
        orb.targetX = target.x + p.random(-50, 50);
        orb.targetY = target.y + p.random(-50, 50);
        orb.targetResetFrame = p.millis();
      }
    }
    let dx = orb.targetX - orb.x;
    let dy = orb.targetY - orb.y;
    let distance = Math.round(p.dist(orb.x, orb.y, orb.targetX, orb.targetY) * 100) / 100;
    if (distance < 100) {
      orb.targetX = p.random(50, 1150);
      orb.targetY = p.random(50, 750);
      dx = orb.targetX - orb.x;
      dy = orb.targetY - orb.y;
      distance = Math.round(p.dist(orb.x, orb.y, orb.targetX, orb.targetY) * 100) / 100;
    }
    let speed = orb.surgeActive ? orb.speed * 2.5 : orb.speed;
    if (orb.gmmActive) speed *= 1.3;
    if (orb.rallyTimer > 0 && orb.hasFlag) {
      if (orb.battleCry === "VAMOS!") speed *= 1.3;
      if (orb.battleCry === "MAJID!") speed *= 1.1;
    }
    let moveX = distance > 0 ? (dx / distance) * speed : 0;
    let moveY = distance > 0 ? (dy / distance) * speed : 0;
    if (orb.role === "Dodging" || (orb.rallyTimer > 0 && orb.battleCry === "SHALOM!")) {
      moveX += p.random(-6, 6);
      moveY += p.random(-6, 6);
    }
    if (orb.rallyTimer > 0 && orb.battleCry === "ZAHRA!") {
      moveX *= 0.8;
      moveY *= 0.8;
    }
    orb.x = Math.round(p.lerp(orb.x, orb.x + moveX, 0.4) * 100) / 100;
    orb.y = Math.round(p.lerp(orb.y, orb.y + moveY, 0.4) * 100) / 100;
    orb.x = p.constrain(orb.x, orb.radius, p.width - orb.radius);
    orb.y = p.constrain(orb.y, orb.radius, p.height - orb.radius);
    orb.trail.push({ x: orb.x, y: orb.y, alpha: 120 });
    if (orb.trail.length > 12) orb.trail.shift();
  }

  function findNearestEnemy(orb) {
    let minDist = Infinity;
    let target = null;
    orbs.forEach(other => {
      if (other === orb || other.health <= 0 || !other) return;
      if (typeof other.x !== 'number' || typeof other.y !== 'number' || isNaN(other.x) || isNaN(other.y)) {
        console.warn(`Invalid coordinates for ${other.name}`);
        return;
      }
      let distance = p.dist(orb.x, orb.y, other.x, other.y);
      if (distance < minDist && distance > 20) {
        minDist = distance;
        target = other;
      }
    });
    return target;
  }

  function useSkill(orb) {
    if (!orb || orb.health <= 0) return;
    orb.skillCooldown = orb.cooldown;
    orb.effectTimer = orb.auraEffect === "Shield" ? 40 : 60;
    orb.skillScale = 1.5;
    if (orb.hasFlag && orb.battleCry) {
      orb.battleCryTimer = 80;
      orb.rallyTimer = 40;
      triggerFlashEffect();
      triggerCameraShake(6, 12);
      if (orb.battleCry === "BANZAI!") {
        orbs.forEach(other => {
          if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 100) {
            let damage = 20 * orb.crowdControl;
            if (other.flagShieldActive && other.flagShieldTimer > 0 && other.flagShieldCooldown <= 0) {
              let blocked = p.min(damage, 10);
              damage -= blocked;
              other.flagShieldActive = false;
              other.flagShieldCooldown = 200;
              createParticle(other, '#00f', 10, 30, true);
            } else if (other.shieldActive) {
              let blocked = p.min(damage, 10);
              damage -= blocked;
              other.shieldActive = false;
              createParticle(other, '#00f', 10, 30, true);
            }
            other.health = p.max(0, p.round(other.health - damage));
            other.shakeTimer = 10;
            other.shakeMagnitude = 3;
            createParticle(other, '#ff0000', 10, 30, true);
          }
        });
        for (let i = 0; i < 8; i++) {
          let angle = (i / 8) * p.TWO_PI;
          projectiles.push({
            x: orb.x,
            y: orb.y,
            target: null,
            orb,
            damage: 5,
            color: '#ff0000',
            rgb: [255, 0, 0],
            size: 6,
            lifetime: 40,
            alpha: 255,
            vx: Math.cos(angle) * 8,
            vy: Math.sin(angle) * 8,
            isSummon: true
          });
          createParticle(orb, '#ffffff', 8, 20, true);
        }
      } else if (orb.battleCry === "JAYA!") {
        let target = findNearestEnemy(orb);
        if (target) {
          projectiles.push({
            x: orb.x,
            y: orb.y,
            target,
            orb,
            damage: 15 * orb.crowdControl,
            color: '#008000',
            rgb: [0, 128, 0],
            size: 8,
            lifetime: 50,
            alpha: 255,
            vx: (target.x - orb.x) / 20,
            vy: (target.y - orb.y) / 20,
            isSummon: false
          });
        }
        for (let i = 0; i < 4; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 6,
              color: '#008000',
              rgb: [0, 128, 0],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "SHALOM!") {
        orbs.forEach(other => {
          if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 80) {
            other.shieldActive = true;
            other.effectTimer = 40;
            createParticle(other, '#FFFFFF', 8, 20, true);
          }
        });
        for (let i = 0; i < 3; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 7,
              color: '#FFFFFF',
              rgb: [255, 255, 255],
              size: 7,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "ZAHRA!") {
        orbs.forEach(other => {
          if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 100) {
            other.rallyTimer = 40;
            createParticle(other, '#FFA500', 8, 20, true);
          }
        });
        for (let i = 0; i < 6; i++) {
          let angle = (i / 6) * p.TWO_PI;
          projectiles.push({
            x: orb.x,
            y: orb.y,
            target: null,
            orb,
            damage: 4,
            color: '#FFA500',
            rgb: [255, 165, 0],
            size: 5,
            lifetime: 40,
            alpha: 255,
            vx: Math.cos(angle) * 8,
            vy: Math.sin(angle) * 8,
            isSummon: true
          });
        }
      } else if (orb.battleCry === "SKÅL!") {
        orb.attack *= 1.15;
        orb.rallyTimer = 40;
        for (let i = 0; i < 4; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 6,
              color: '#0000FF',
              rgb: [0, 0, 255],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "ZINDABAD!") {
        let target = findNearestEnemy(orb);
        if (target) {
          let angle = p.atan2(target.y - orb.y, target.x - orb.x);
          projectiles.push({
            x: orb.x,
            y: orb.y,
            target,
            orb,
            damage: orb.attack * 1.5,
            color: '#008000',
            rgb: [0, 128, 0],
            size: 8,
            lifetime: 50,
            alpha: 255,
            vx: (target.x - orb.x) / 20 + p.random(-2, 2),
            vy: (target.y - orb.y) / 20 + p.random(-2, 2),
            isSummon: false
          });
        }
        for (let i = 0; i < 5; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 5,
              color: '#008000',
              rgb: [0, 128, 0],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "MAJID!") {
        orbs.forEach(other => {
          if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 100) {
            let damage = 10 * orb.crowdControl;
            if (other.flagShieldActive && other.flagShieldTimer > 0 && other.flagShieldCooldown <= 0) {
              let blocked = p.min(damage, 10);
              damage -= blocked;
              other.flagShieldActive = false;
              other.flagShieldCooldown = 200;
              createParticle(other, '#00f', 10, 30, true);
            } else if (other.shieldActive) {
              let blocked = p.min(damage, 10);
              damage -= blocked;
              other.shieldActive = false;
              createParticle(other, '#00f', 10, 30, true);
            }
            other.health = p.max(0, p.round(other.health - damage));
            other.shakeTimer = 10;
            other.shakeMagnitude = 3;
            createParticle(other, '#800080', 10, 30, true);
          }
        });
        orb.evasion = Math.min(0.15, orb.evasion + 0.1);
        orb.rallyTimer = 40;
        for (let i = 0; i < 4; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 6,
              color: '#800080',
              rgb: [128, 0, 128],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "GOD SAVE!") {
        for (let i = 0; i < 3; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + (i - 1) * 0.3;
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: orb.attack * 0.8,
              color: '#FF0000',
              rgb: [255, 0, 0],
              size: 7,
              lifetime: 50,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: false
            });
          }
        }
        for (let i = 0; i < 4; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 6,
              color: '#FF0000',
              rgb: [255, 0, 0],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      } else if (orb.battleCry === "AMLAK!") {
        orbs.forEach(other => {
          if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 80) {
            other.attack += 5;
            createParticle(other, '#8B4513', 8, 20, true);
          }
        });
        triggerCameraShake(3, 8);
        for (let i = 0; i < 5; i++) {
          let target = findNearestEnemy(orb);
          if (target) {
            let angle = p.atan2(target.y - orb.y, target.x - orb.x) + p.random(-0.1, 0.1);
            projectiles.push({
              x: orb.x,
              y: orb.y,
              target,
              orb,
              damage: 5,
              color: '#8B4513',
              rgb: [139, 69, 19],
              size: 6,
              lifetime: 40,
              alpha: 255,
              vx: Math.cos(angle) * 8,
              vy: Math.sin(angle) * 8,
              isSummon: true
            });
          }
        }
      }
    }
    if (orb.auraEffect === "Shield") {
      orb.shieldActive = true;
      createParticle(orb, '#00f', 10, 40, true);
    } else if (orb.auraEffect === "Surge") {
      orb.surgeActive = true;
      setTimeout(() => orb.surgeActive = false, 1200);
      createParticle(orb, '#0ff', 8, 30, true);
      triggerCameraShake(5, 12);
    } else if (orb.auraEffect === "Singularity") {
      orbs.forEach(other => {
        if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 120) {
          other.x += (orb.x - other.x) * 0.25;
          other.y += (orb.y - other.y) * 0.25;
          createParticle(other, '#800080', 6, 25);
          triggerCameraShake(6, 14);
        }
      });
    } else if (orb.auraEffect === "Pulse") {
      orbs.forEach(other => {
        if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 100) {
          let damage = 15 * orb.crowdControl;
          if (other.flagShieldActive && other.flagShieldTimer > 0 && other.flagShieldCooldown <= 0) {
            let blocked = p.min(damage, 10);
            damage -= blocked;
            other.flagShieldActive = false;
            other.flagShieldCooldown = 200;
            createParticle(other, '#00f', 10, 30, true);
          } else if (other.shieldActive) {
            let blocked = p.min(damage, 10);
            damage -= blocked;
            other.shieldActive = false;
            createParticle(other, '#00f', 10, 30, true);
          }
          other.health = p.max(0, p.round(other.health - damage));
          other.shakeTimer = 10;
          other.shakeMagnitude = 3;
          other.swordSlash = { angle: p.random(0, p.TWO_PI), timer: 15, size: 25 };
          createParticle(other, '#ff4500', 8, 30, true);
          triggerCameraShake(5, 12);
        }
      });
    } else if (orb.auraEffect === "Scape") {
      orb.x += p.random(-120, 120);
      orb.y += p.random(-120, 120);
      orb.x = p.constrain(orb.x, orb.radius, p.width - orb.radius);
      orb.y = p.constrain(orb.y, orb.radius, p.height - orb.radius);
      createParticle(orb, '#ffffff', 10, 40, true);
      triggerCameraShake(4, 10);
    } else if (orb.auraEffect === "Overcharge") {
      let target = findNearestEnemy(orb);
      if (target) {
        projectiles.push({
          x: orb.x,
          y: orb.y,
          target,
          orb,
          damage: orb.attack * 3,
          color: '#ff0000',
          rgb: [255, 0, 0],
          size: 8,
          lifetime: 50,
          alpha: 255,
          vx: (target.x - orb.x) / 25,
          vy: (target.y - orb.y) / 25,
          beamTimer: 20
        });
        createParticle(orb, '#ff0000', 12, 50, true);
        triggerCameraShake(6, 14);
        triggerFlashEffect();
      }
    } else if (orb.auraEffect === "Absorb") {
      let target = findNearestEnemy(orb);
      if (target) {
        projectiles.push({
          x: orb.x,
          y: orb.y,
          target,
          orb,
          damage: orb.attack * 1.5,
          color: orb.coreColor,
          rgb: orb.coreRgb,
          size: 8,
          lifetime: 40,
          alpha: 255,
          vx: (target.x - orb.x) / 20,
          vy: (target.y - orb.y) / 20
        });
        createParticle(orb, '#0f0', 8, 20, true);
      }
    } else if (orb.auraEffect === "Stealth") {
      orb.skillScale = 0.5;
      setTimeout(() => orb.skillScale = 1.5, 1200);
      createParticle(orb, '#ffffff', 6, 20, true);
    } else if (orb.auraEffect === "Buff") {
      orbs.forEach(other => {
        if (other !== orb && other.health > 0 && p.dist(orb.x, orb.y, other.x, other.y) < 80) {
          other.attack += 5;
          createParticle(other, '#00ff00', 6, 20);
        }
      });
    }
    if (orb.specialModifier === "Aura Charge") {
      orb.chargeActive = true;
    } else if (orb.specialModifier === "Game Master Mark") {
      orb.gmmActive = true;
      setTimeout(() => orb.gmmActive = false, 1500);
      triggerCameraShake(5, 12);
    }
  }

  function attack(orb) {
    if (!orb || orb.health <= 0) return;
    let target = findNearestEnemy(orb);
    if (!target || p.dist(orb.x, orb.y, target.x, target.y) > orb.attackRange) return;
    let attack = orb.attack;
    if (orb.chargeActive) attack += 7;
    if (orb.gmmActive) attack *= 1.2;
    if (orb.rallyTimer > 0 && orb.hasFlag) {
      if (orb.battleCry === "VAMOS!") attack *= 1.1;
      if (orb.battleCry === "SKÅL!") attack *= 1.15;
    }
    let hitChance = 1 - target.evasion - orb.crowdControl;
    if (orb.gmmActive) hitChance -= 0.1;
    if (orb.rallyTimer > 0 && orb.battleCry === "MAJID!") hitChance -= 0.1;
    if (p.random() > hitChance) {
      createParticle(target, '#ffffff', 4, 15);
      if (target.role === "Dodging") {
        target.x += p.random(-30, 30);
        target.y += p.random(-30, 30);
        target.x = p.constrain(target.x, target.radius, p.width - target.radius);
        target.y = p.constrain(target.y, target.radius, p.height - target.radius);
        createParticle(target, '#ffffff', 6, 20, true);
      }
      return;
    }
    let damage = Math.round((attack / (1 + target.defense / 10)) * 100) / 100;
    if (orb.gmmActive) damage *= 1.2;
    if (orb.rallyTimer > 0 && orb.battleCry === "SKÅL!") damage *= 0.9;
    if (orb.role === "Long-Range") {
      projectiles.push({
        x: orb.x,
        y: orb.y,
        target,
        orb,
        damage,
        color: orb.coreColor,
        rgb: orb.coreRgb,
        size: 8,
        lifetime: 40,
        alpha: 255,
        vx: (target.x - orb.x) / 20,
        vy: (target.y - orb.y) / 20
      });
    } else {
      if (target.flagShieldActive && target.flagShieldTimer > 0 && target.flagShieldCooldown <= 0) {
        let blocked = p.min(damage, 10);
        damage -= blocked;
        target.flagShieldActive = false;
        target.flagShieldCooldown = 200;
        createParticle(target, '#00f', 10, 30, true);
        triggerCameraShake(3, 8);
      } else if (target.shieldActive) {
        let blocked = p.min(damage, 10);
        damage -= blocked;
        target.shieldActive = false;
        createParticle(target, '#00f', 10, 30, true);
        triggerCameraShake(3, 8);
      }
      if (orb.specialModifier === "Holographic Sheen") {
        let reflect = p.round(damage * 0.05);
        orb.health = p.max(0, orb.health - reflect);
        createParticle(orb, '#0ff', 6, 15);
      }
      target.health = p.max(0, p.round(target.health - damage));
      target.shakeTimer = 10;
      target.shakeMagnitude = damage / 4;
      target.swordSlash = { angle: p.atan2(target.y - orb.y, target.x - orb.x), timer: 15, size: 30 };
      orb.attackEffectTimer = 10;
      createParticle(target, '#f00', 10, 25, true);
      triggerCameraShake(4, 10);
      if (target.health <= 0) {
        createParticle(target, '#fff', 15, 50, true);
        triggerCameraShake(6, 12);
        if (orb.xpGain > 0) {
          orb.attack += orb.xpGain * 0.1;
        }
        checkGameOver();
      }
    }
    if (orb.chargeActive) orb.chargeActive = false;
  }

  function createParticle(orb, color, size, lifetime, burst = false) {
    if (particles.length > 50) return; // Reduced particle limit
    color = color || '#00B7EB';
    const rgb = hexToRgb(color);
    const particleCount = burst ? 5 : 1; // Reduced particle count
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: orb.x,
        y: orb.y,
        vx: p.random(-3, 3), // Reduced velocity range
        vy: p.random(-3, 3),
        size: p.random(size / 2, size),
        color,
        rgb,
        alpha: 255,
        lifetime: lifetime * p.random(0.8, 1.2),
        fadeRate: p.random(6, 12)
      });
    }
  }

  function drawOrb(orb) {
    try {
      p.push();
      let x = orb.x;
      let y = orb.y;
      if (orb.shakeTimer > 0) {
        x += p.random(-orb.shakeMagnitude, orb.shakeMagnitude);
        y += p.random(-orb.shakeMagnitude, orb.shakeMagnitude);
        orb.shakeTimer--;
      }
      p.translate(x, y);
      p.rotate(orb.rotation * (orb.role === "Dodging" ? 0.03 : 0.015));
      orb.trail.forEach((pos, i) => {
        p.fill(p.color(...validateRgb(orb.coreRgb), pos.alpha * (orb.auraEffect === "Stealth" ? 0.3 : 1)));
        p.noStroke();
        p.ellipse(pos.x - x, pos.y - y, orb.radius * (0.5 + i / 20) * orb.skillScale, orb.radius * (0.5 + i / 20) * orb.skillScale * 0.7);
        pos.alpha -= 8;
      });
      let pulse = p.sin(p.millis() * 0.15) * 0.5 + 0.5;
      if (orb.hasFlag) {
        p.fill(p.color(255, 255, 255, 50 * pulse));
        p.noStroke();
        p.ellipse(0, 0, orb.radius * 5 * (orb.spawnProgress * pulse + 0.5) * orb.skillScale, orb.radius * 4 * (orb.spawnProgress * pulse + 0.5) * orb.skillScale);
      }
      p.fill(p.color(...validateRgb(orb.coreRgb), 80 * pulse * (orb.auraEffect === "Stealth" ? 0.4 : 1)));
      p.noStroke();
      p.ellipse(0, 0, orb.radius * 4 * (orb.spawnProgress * pulse + 0.5) * orb.skillScale, orb.radius * 3 * (orb.spawnProgress * pulse + 0.5) * orb.skillScale);
      let scale = p.lerp(0, 1, orb.spawnProgress);
      orb.spawnProgress = p.min(1, orb.spawnProgress + 0.05);
      p.scale(scale * orb.skillScale);
      if (orb.image) {
        p.image(orb.image, -orb.radius, -orb.radius, orb.radius * 2, orb.radius * 2);
      } else {
        p.fill(p.color(...validateRgb(orb.coreRgb), orb.auraEffect === "Stealth" ? 100 : 255));
        if (orb.skin === "Holographic") {
          p.stroke(255, 255, 255, p.random(100, 255));
          p.strokeWeight(3);
          createParticle(orb, '#fff', 3, 15);
        } else if (orb.skin === "Nebula") {
          p.stroke(...validateRgb(orb.coreRgb), 150);
          p.strokeWeight(5);
          createParticle(orb, orb.coreColor, 4, 20);
        } else if (orb.skin === "Crystal") {
          p.stroke(255, 255, 255, 200);
          p.strokeWeight(2);
        } else {
          p.noStroke();
        }
        p.ellipse(0, 0, orb.radius * 2, orb.radius * 2);
        p.fill(p.color(...validateRgb(orb.coreRgb), orb.auraEffect === "Stealth" ? 50 : 100));
        p.noStroke();
        p.ellipse(0, 0, orb.radius * 2.5, orb.radius * 2.5);
      }
      if (orb.swordSlash && orb.swordSlash.timer > 0) {
        p.push();
        p.rotate(orb.swordSlash.angle);
        p.stroke(255, 255, 255, 255 * (orb.swordSlash.timer / 15));
        p.strokeWeight(4);
        p.line(0, 0, orb.swordSlash.size, 0);
        p.stroke(...validateRgb(orb.coreRgb), 200 * (orb.swordSlash.timer / 15));
        p.line(0, 0, orb.swordSlash.size * 1.2, 0);
        p.fill(p.color(...validateRgb(orb.coreRgb), 150 * (orb.swordSlash.timer / 15)));
        p.noStroke();
        p.triangle(orb.swordSlash.size, 0, orb.swordSlash.size * 0.8, 5, orb.swordSlash.size * 0.8, -5);
        p.pop();
      }
      if (orb.attackEffectTimer > 0 && !orb.swordSlash) {
        p.push();
        p.rotate(p.random(0, p.TWO_PI));
        p.stroke(...validateRgb(orb.coreRgb), 200 * (orb.attackEffectTimer / 10));
        p.strokeWeight(3);
        p.line(0, 0, orb.radius * 1.5, 0);
        p.pop();
      }
      if (orb.effectTimer > 0) {
        if (orb.auraEffect === "Shield") {
          p.stroke(0, 0, 255, 220 * pulse);
          p.noFill();
          p.strokeWeight(6);
          p.ellipse(0, 0, orb.radius * 4 * orb.skillScale, orb.radius * 3.5 * orb.skillScale);
          createParticle(orb, '#00f', 8, 30);
        } else if (orb.auraEffect === "Surge") {
          p.stroke(0, 255, 255, 200 * pulse);
          p.strokeWeight(4);
          p.line(-orb.radius * 3, 0, orb.radius * 3, 0);
          p.line(0, -orb.radius * 3, 0, orb.radius * 3);
          createParticle(orb, '#0ff', 6, 25);
        } else if (orb.auraEffect === "Singularity") {
          p.fill(128, 0, 128, 140 * pulse);
          p.noStroke();
          p.ellipse(0, 0, orb.radius * 6 * orb.skillScale, orb.radius * 5 * orb.skillScale);
          createParticle(orb, '#800080', 10, 35, true);
        } else if (orb.auraEffect === "Pulse") {
          p.fill(255, 69, 0, 120 * pulse);
          p.noStroke();
          p.ellipse(0, 0, orb.radius * 5 * orb.skillScale, orb.radius * 4 * orb.skillScale);
          createParticle(orb, '#ff4500', 8, 30);
        }
      }
      if (orb.flagShieldActive && orb.flagShieldTimer > 0) {
        p.stroke(255, 215, 0, 220 * pulse);
        p.noFill();
        p.strokeWeight(6);
        p.ellipse(0, 0, orb.radius * 4.5 * orb.skillScale, orb.radius * 4 * orb.skillScale);
        createParticle(orb, '#FFD700', 8, 30);
      }
      p.pop();
    } catch (e) {
      console.error(`Error drawing ${orb.name}: ${e.message}`);
    }
  }

  function drawOrbLabels(orb) {
    try {
      p.push();
      let x = orb.x;
      let y = orb.y;
      if (orb.shakeTimer > 0) {
        x += p.random(-orb.shakeMagnitude, orb.shakeMagnitude);
        y += p.random(-orb.shakeMagnitude, orb.shakeMagnitude);
      }
      p.translate(x, y);
      p.fill(255);
      p.textAlign(p.CENTER, p.CENTER);
      p.textSize(12);
      p.text(orb.name, 0, -orb.radius - 30);
      if (orb.battleCryTimer > 0 && orb.battleCry) {
        p.fill(255, 255, 255, 255 * (orb.battleCryTimer / 60));
        p.textSize(16);
        p.textStyle(p.BOLD);
        p.text(orb.battleCry, 0, -orb.radius - 50);
      }
      let healthBarWidth = 50;
      p.fill(255, 0, 0);
      p.rect(-healthBarWidth / 2, -orb.radius - 15, healthBarWidth, 5);
      p.fill(0, 255, 0);
      p.rect(-healthBarWidth / 2, -orb.radius - 15, healthBarWidth * (orb.health / orb.maxHealth), 5);
      p.pop();
    } catch (e) {
      console.error(`Error drawing labels for ${orb.name}: ${e.message}`);
    }
  }

  p.preload = async () => {};

  p.setup = () => {
    try {
      const canvasContainer = document.getElementById('canvas-container');
      if (!canvasContainer) {
        throw new Error("Canvas container not found in DOM");
      }
      p.createCanvas(1200, 800).parent('canvas-container');
      p.frameRate(30); // Reduced frame rate for better performance
      p.randomSeed(sessionId || 12345);
      p.background(20, 30, 50);
      document.getElementById('orb-count').textContent = "Waiting for game start...";
    } catch (e) {
      console.error(`Setup error: ${e.message}`);
      if (!errorAlertShown) {
        errorAlertShown = true;
        Swal.fire({
          title: 'Setup Error',
          text: `Failed to initialize game canvas: ${e.message}. Please refresh and try again.`,
          icon: 'error',
          background: '#1a1a1a',
          color: '#ffffff',
          confirmButtonColor: '#4a5568'
        });
      }
    }
  };

  p.draw = async () => {
    try {
      const currentTime = p.millis();
      if (currentTime - lastUpdateTime < UPDATE_INTERVAL) return;
      lastUpdateTime = currentTime;

      p.push();
      p.background(20, 30, 50);
      if (!gameStarted) {
        p.fill(255);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(24);
        p.text(countdown > 0 ? `Starting in ${countdown}...` : "Waiting for game start...", p.width / 2, p.height / 2);
        if (startGameTriggered && !gameStarted) {
          await startGame(p);
        }
        p.pop();
        return;
      }

      if (!syncInProgress && currentTime - lastStateSync > STATE_SYNC_INTERVAL) { // Use STATE_SYNC_INTERVAL
        syncInProgress = true;
        try {
          const stateLoaded = await loadGameState(p);
          if (stateLoaded) {
            localStateBuffer = { orbs: [...orbs], projectiles: [...projectiles], cameraShake: { ...cameraShake }, flashEffect: { ...flashEffect }, gameOver };
          }
          const stateHash = JSON.stringify(orbs.map(o => `${o.id}:${o.health}:${o.x}:${o.y}`));
          if (stateHash !== lastStateHash) {
            await syncGameState();
            lastStateHash = stateHash;
          }
        } finally {
          syncInProgress = false;
        }
        lastStateSync = currentTime;
      }

      let renderOrbs = localStateBuffer?.orbs || orbs;
      let renderProjectiles = localStateBuffer?.projectiles || projectiles;
      let renderCameraShake = localStateBuffer?.cameraShake || cameraShake;
      let renderFlashEffect = localStateBuffer?.flashEffect || flashEffect;

      if (renderCameraShake.timer > 0) {
        renderCameraShake.x = p.random(-renderCameraShake.magnitude, renderCameraShake.magnitude);
        renderCameraShake.y = p.random(-renderCameraShake.magnitude, renderCameraShake.magnitude);
        renderCameraShake.timer--;
        p.translate(renderCameraShake.x, renderCameraShake.y);
      }

      if (renderFlashEffect.timer > 0) {
        p.fill(255, 255, 255, renderFlashEffect.alpha);
        p.noStroke();
        p.rect(0, 0, p.width, p.height);
        renderFlashEffect.alpha = Math.max(0, renderFlashEffect.alpha - 25);
        renderFlashEffect.timer--;
      }

      for (let i = 0; i < 5; i++) { // Reduced background stars
        p.fill(255, 255, 255, p.random(5, 20));
        p.noStroke();
        p.circle(p.random(p.width), p.random(p.height), p.random(2, 5));
      }

      particles.forEach(particle => {
        if (!particle) return;
        p.fill(p.color(...validateRgb(particle.rgb), particle.alpha));
        p.noStroke();
        p.ellipse(particle.x, particle.y, particle.size, particle.size * 0.7);
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.lifetime -= 1;
        particle.alpha = p.max(0, particle.alpha - particle.fadeRate);
        particle.size *= 0.98;
      });
      particles.length = particles.filter(particle => particle && particle.lifetime > 0).length;

      renderProjectiles.forEach(proj => {
        if (!proj || !proj.orb || proj.lifetime <= 0) return;
        p.push();
        p.translate(proj.x, proj.y);
        p.rotate(p.atan2(proj.vy, proj.vx));
        if (proj.beamTimer && proj.beamTimer > 0) {
          p.stroke(255, 0, 0, 255 * (proj.beamTimer / 20));
          p.strokeWeight(4);
          p.line(0, 0, proj.target ? p.dist(proj.x, proj.y, proj.target.x, proj.target.y) : 200, 0);
          createParticle({ x: proj.x, y: proj.y }, '#ff0000', 4, 15, true);
          proj.beamTimer--;
        } else {
          p.fill(p.color(...validateRgb(proj.rgb), proj.alpha));
          p.noStroke();
          p.triangle(0, 0, -proj.size * 2, proj.size * 0.5, -proj.size * 2, -proj.size * 0.5);
          p.fill(p.color(...validateRgb(proj.rgb), proj.alpha * 0.5));
          p.ellipse(-proj.size * 1.5, 0, proj.size * 3, proj.size * 0.4);
          if (proj.isSummon) {
            p.fill(p.color(...validateRgb(proj.rgb), proj.alpha * 0.3));
            p.ellipse(-proj.size * 3, 0, proj.size * 4, proj.size * 0.2);
          }
        }
        p.pop();
        proj.x += proj.vx;
        proj.y += proj.vy;
        proj.lifetime -= 1;
        proj.alpha = p.max(0, proj.alpha - 8);
        if (proj.lifetime <= 0 && proj.target && proj.target.health > 0) {
          let damage = Math.round(proj.damage / (1 + proj.target.defense / 10) * 100) / 100;
          if (proj.target.flagShieldActive && proj.target.flagShieldTimer > 0 && proj.target.flagShieldCooldown <= 0) {
            let blocked = p.min(damage, 10);
            damage -= blocked;
            proj.target.flagShieldActive = false;
            proj.target.flagShieldCooldown = 200;
            createParticle(proj.target, '#00f', 10, 30, true);
            triggerCameraShake(3, 8);
          } else if (proj.target.shieldActive) {
            let blocked = p.min(damage, 10);
            damage -= blocked;
            proj.target.shieldActive = false;
            createParticle(proj.target, '#00f', 10, 30, true);
            triggerCameraShake(3, 8);
          }
          if (proj.orb.specialModifier === "Holographic Sheen") {
            let reflect = p.round(damage * 0.05);
            proj.orb.health = p.max(0, proj.orb.health - reflect);
            createParticle(proj.orb, '#0ff', 6, 15);
          }
          proj.target.health = p.max(0, p.round(proj.target.health - damage));
          proj.target.shakeTimer = 10;
          proj.target.shakeMagnitude = damage / 4;
          proj.target.swordSlash = { angle: p.atan2(proj.vy, proj.vx), timer: 15, size: 30 };
          triggerCameraShake(4, 10);
          checkGameOver();
        }
      });

      const maxOrbsPerFrame = 20; // Reduced for performance
      renderOrbs.slice(0, maxOrbsPerFrame).forEach(orb => {
        if (!orb || orb.health <= 0) return;
        if (orb.flagShieldTimer > 0) {
          orb.flagShieldTimer--;
          if (orb.flagShieldTimer <= 0) {
            orb.flagShieldActive = false;
          }
        }
        if (orb.flagShieldCooldown > 0) {
          orb.flagShieldCooldown--;
          if (orb.flagShieldCooldown <= 0 && orb.hasFlag) {
            orb.flagShieldActive = true;
            orb.flagShieldTimer = 40;
          }
        }
        if (orb.effectTimer > 0) {
          orb.effectTimer--;
          if (orb.effectTimer <= 0 && orb.auraEffect === "Shield") {
            orb.shieldActive = false;
          }
        }
        if (orb.rallyTimer > 0) {
          orb.rallyTimer--;
        }
        moveOrb(orb);
        if (currentTime % 1500 < UPDATE_INTERVAL) {
          orb.skillCooldown = p.max(0, orb.skillCooldown - 1);
          if (orb.skillCooldown === 0) useSkill(orb);
          orb.skillScale = orb.skillCooldown > 0 ? 0.7 : 1.5;
        }
        if (currentTime % 500 < UPDATE_INTERVAL) {
          attack(orb);
        }
        orb.rotation += 0.06 * (orb.role === "Dodging" ? 2.5 : 1);
        if (orb.swordSlash && orb.swordSlash.timer > 0) {
          orb.swordSlash.timer--;
        }
        if (orb.attackEffectTimer > 0) {
          orb.attackEffectTimer--;
        }
        if (orb.battleCryTimer > 0) {
          orb.battleCryTimer--;
        }
        drawOrb(orb);
        drawOrbLabels(orb);
      });
      document.getElementById('orb-count').textContent = `Active Orbs: ${renderOrbs.filter(o => o && o.health > 0).length}`;
      p.pop();
    } catch (e) {
      console.error(`Draw loop error: ${e.message}`);
      // Log error but don't stop the loop
    }
  };
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof p5 === 'undefined') {
    console.error('p5.js failed to load. Check CDN or internet connection.');
    document.getElementById('orb-count').textContent = "Error: p5.js failed to load";
    if (!errorAlertShown) {
      errorAlertShown = true;
      Swal.fire({
        title: 'Error',
        text: 'p5.js library failed to load. Please check your internet connection.',
        icon: 'error',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#4a5568'
      });
    }
  } else {
    initializeGame();
    new p5(sketch);
  }
});

// Export updateOrbStats to be accessible in gameLogic.js
export function updateOrbStats(p) {
  try {
    const currentTime = p.millis();
    if (currentTime - lastStatsUpdate < 500) return; // Throttle to once every 500ms
    lastStatsUpdate = currentTime;
    let statsDiv = document.getElementById('orb-stats');
    if (!statsDiv) {
      console.warn("orb-stats element not found in DOM");
      return;
    }
    statsDiv.innerHTML = orbs.map(orb => `
      <div class="orb-info">
        <strong>${orb.name}</strong> (${orb.role})${orb.hasFlag ? ' [Flag Bearer]' : ''}<br>
        Health: ${p.round(orb.health)}/${p.round(orb.maxHealth)}, Attack: ${p.round(orb.attack)}, Defense: ${p.round(orb.defense)}, Speed: ${p.round(orb.speed, 1)}, Cooldown: ${p.round(orb.cooldown, 1)}s
      </div>
    `).join('');
    console.log("Orb stats updated");
  } catch (e) {
    console.error("Error updating orb stats:", e);
  }
}