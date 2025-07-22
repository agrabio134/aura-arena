import { initializeFirebase } from './firebase.js';

const API_URL = "https://graphql.tradeport.xyz/";
const HEADERS = {
  "x-api-user": "auraonsui",
  "x-api-key": "dwHwieW.36f7a5bb7b7e7fd606a247414ccf158c",
  "Content-Type": "application/json"
};
const COLLECTION_ID = "ac33ae15-5c16-4d3b-b92a-2dde11e1346b";

export let db;
export let gameStarted = false;
export let countdown = 0;
export let startGameTriggered = false;
export let sessionId = null;
export let orbs = [];
export let allNFTs = [];
export let particles = [];
export let projectiles = [];
export let cameraShake = { timer: 0, magnitude: 0, x: 0, y: 0 };
export let flashEffect = { timer: 0, alpha: 0 };
export let gameOver = false;
export const UPDATE_INTERVAL = 25; // 40 FPS equivalent (25ms)
export const STATE_SYNC_INTERVAL = 500; // Sync state every 500ms

const traits = {
  "Core Color": [
    { value: "Neon Blue", rarity: 0.4651, hex: "#00B7EB", rgb: [0, 183, 235], evasion: 0 },
    { value: "Cosmic Purple", rarity: 0.2326, hex: "#800080", rgb: [128, 0, 128], evasion: 1 },
    { value: "Crimson Glow", rarity: 0.1860, hex: "#DC143C", rgb: [220, 20, 60], evasion: 2 },
    { value: "Radiant Gold", rarity: 0.0930, hex: "#FFD700", rgb: [255, 215, 0], evasion: 3 },
    { value: "Prismatic Iridescence", rarity: 0.0233, hex: "#FFD700", rgb: [255, 215, 0], evasion: 5 }
  ],
  "Aura Effect": [
    { value: "Surge", rarity: 0.3256, speed: 25, attack: 0, defense: 0, crowd_control: 0, evasion: 0, description: "Dashes with anime-style speed burst" },
    { value: "Scape", rarity: 0.1395, speed: 0, attack: 0, defense: 0, evasion: 25, description: "Teleports to dodge like an anime ninja" },
    { value: "Buff", rarity: 0.0930, speed: 0, attack: 0, defense: 0, xp_gain: 10, description: "Boosts nearby allies' attack" },
    { value: "Split", rarity: 0.0698, speed: 15, attack: 0, defense: -5, positioning: 10, description: "Splits for tactical positioning" },
    { value: "Absorb", rarity: 0.0233, speed: 0, attack: 20, defense: 0, description: "Fires energy blasts" },
    { value: "Shield", rarity: 0.0930, speed: 0, attack: 0, defense: 20, description: "Creates a protective barrier" },
    { value: "Pulse", rarity: 0.0930, speed: 0, attack: 10, defense: 0, crowd_control: 15, description: "Emits a zoning AoE pulse" },
    { value: "Stealth", rarity: 0.0465, speed: 0, attack: -5, defense: 0, evasion: 20, description: "Fades like a stealthy anime character" },
    { value: "Overcharge", rarity: 0.0465, speed: 0, attack: 30, defense: 0, description: "Unleashes a powerful laser beam" },
    { value: "Singularity", rarity: 0.0698, speed: 0, attack: 5, defense: 0, crowd_control: 20, description: "Pulls enemies into a zoning vortex" }
  ],
  "Skin": [
    { value: "No Skin", rarity: 0.3256, defense: 0 },
    { value: "Metallic", rarity: 0.3023, defense: 1 },
    { value: "Nebula", rarity: 0.1395, defense: 2 },
    { value: "Crystal", rarity: 0.1163, defense: 2 },
    { value: "Holographic", rarity: 0.1163, defense: 3 }
  ],
  "Flag": [
    { value: "No Flag", rarity: 0.7442, country_code: null, morale: 0, battleCry: null },
    { value: "Argentina", rarity: 0.0233, country_code: "AR", morale: 5, battleCry: "VAMOS!" },
    { value: "Indonesia", rarity: 0.0233, country_code: "ID", morale: 5, battleCry: "JAYA!" },
    { value: "Israel", rarity: 0.0233, country_code: "IL", morale: 5, battleCry: "SHALOM!" },
    { value: "Japan", rarity: 0.0233, country_code: "JP", morale: 5, battleCry: "BANZAI!" },
    { value: "Morocco", rarity: 0.0233, country_code: "MA", morale: 5, battleCry: "ZAHRA!" },
    { value: "Norway", rarity: 0.0233, country_code: "NO", morale: 5, battleCry: "SKÅL!" },
    { value: "Pakistan", rarity: 0.0233, country_code: "PK", morale: 5, battleCry: "ZINDABAD!" },
    { value: "Qatar", rarity: 0.0233, country_code: "QA", morale: 5, battleCry: "MAJID!" },
    { value: "United Kingdom", rarity: 0.0233, country_code: "GB", morale: 5, battleCry: "GOD SAVE!" },
    { value: "Ethiopia", rarity: 0.0465, country_code: "ET", morale: 5, battleCry: "AMLAK!" }
  ],
  "Rarity": [
    { value: "Common", rarity: 0.4651, cooldownBase: 6 },
    { value: "Uncommon", rarity: 0.1628, cooldownBase: 5.5 },
    { value: "Rare", rarity: 0.0930, cooldownBase: 5 },
    { value: "Epic", rarity: 0.2093, cooldownBase: 4.5 },
    { value: "Legendary", rarity: 0.0698, cooldownBase: 4 }
  ],
  "Special Modifier": [
    { value: "None", rarity: 0.5116, attack_bonus: 0, xp_bonus: 0 },
    { value: "XP Boost", rarity: 0.1163, attack_bonus: 0, xp_bonus: 5 },
    { value: "Aura Charge", rarity: 0.2558, attack_bonus: 5, xp_bonus: 0 },
    { value: "Holographic Sheen", rarity: 0.0930, attack_bonus: 7, xp_bonus: 0 },
    { value: "Game Master Mark", rarity: 0.0233, attack_bonus: 10, xp_bonus: 0 }
  ]
};

async function initializeGame() {
  try {
    db = await initializeFirebase();
    window.firebaseDb = db;
    console.log("Firebase initialized for game");
    if (!db) {
      Swal.fire({
        title: 'Error',
        text: 'Failed to initialize Firebase. Please check your connection.',
        icon: 'error',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#4a5568'
      });
      document.getElementById('orb-count').textContent = "Error: Firebase not initialized";
      return;
    }
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
    const startDoc = await getDoc(doc(db, 'game_control', 'start'));
    if (startDoc.exists()) {
      sessionId = startDoc.data().sessionId || Date.now();
      const stateDoc = await getDoc(doc(db, 'game_state', sessionId.toString()));
      if (stateDoc.exists() && !stateDoc.data().gameOver) {
        console.log("Joining ongoing game...");
        gameStarted = true;
        startGameTriggered = true;
        await startGame();
      } else {
        listenForGameStart();
      }
    } else {
      listenForGameStart();
    }
  } catch (error) {
    console.error("Firebase initialization error:", error);
    Swal.fire({
      title: 'Error',
      text: `Failed to initialize Firebase: ${error.message}.`,
      icon: 'error',
      background: '#1a1a1a',
      color: '#ffffff',
      confirmButtonColor: '#4a5568'
    });
  }
}

async function listenForGameStart() {
  try {
    const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
    onSnapshot(doc(db, 'game_control', 'start'), (docSnapshot) => {
      if (docSnapshot.exists() && docSnapshot.data().start && !gameStarted) {
        sessionId = docSnapshot.data().sessionId || Date.now();
        const startTime = docSnapshot.data().startTime?.toMillis() || Date.now();
        countdown = Math.max(0, Math.floor((startTime + 5000 - Date.now()) / 1000));
        if (countdown <= 0) {
          startGameTriggered = true;
          document.getElementById('orb-count').textContent = "Loading orbs...";
        } else {
          const countdownInterval = setInterval(() => {
            document.getElementById('orb-count').textContent = `Starting in ${countdown}...`;
            countdown--;
            if (countdown < 0) {
              clearInterval(countdownInterval);
              startGameTriggered = true;
              document.getElementById('orb-count').textContent = "Loading orbs...";
            }
          }, 1000);
        }
      }
    }, (error) => {
      console.error("Error listening for game start:", error);
      Swal.fire({
        title: 'Error',
        text: `Failed to listen for game start: ${error.message}.`,
        icon: 'error',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#4a5568'
      });
    });
  } catch (e) {
    console.error("Error setting up game start listener:", e);
  }
}

async function fetchAllNFTs() {
  const { doc, getDoc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
  try {
    const cacheDoc = await getDoc(doc(db, 'game_control', 'nft_cache'));
    if (cacheDoc.exists()) {
      console.log("Using cached NFT data");
      return cacheDoc.data().nfts;
    }
  } catch (e) {
    console.error("Error fetching NFT cache:", e);
  }
  let nfts = [];
  let offset = 0;
  const limit = 50;
  let totalCount = await fetchTotalNFTCount();
  if (totalCount === null) {
    console.error("Failed to fetch total NFT count. Assuming 50 as fallback.");
    totalCount = 50;
  }
  console.log(`Total unlisted NFTs available: ${totalCount}`);

  while (nfts.length < totalCount) {
    const query = `
      query fetchCollectionItems($where: nfts_bool_exp!, $order_by: [nfts_order_by!], $offset: Int, $limit: Int!) {
        sui {
          nfts(where: $where, order_by: $order_by, offset: $offset, limit: $limit) {
            id
            token_id
            token_id_index
            name
            media_url
            media_type
            ranking
            owner
            delegated_owner
            chain_state
            lastSale: actions(
              where: {type: {_in: ["buy", "accept-collection-bid", "accept-bid"]}}
              order_by: {block_time: desc}
              limit: 1
            ) {
              price
              price_coin
            }
            contract {
              commission: default_commission { 
                key
                market_fee
                market_name
                royalty
                is_custodial
              }
            }
            attributes {
              type
              value
            }
          }
        }
      }
    `;
    const variables = {
      where: { 
        collection_id: { _eq: COLLECTION_ID }
      },
      order_by: [{ token_id: "asc" }, { ranking: "asc" }],
      offset,
      limit
    };

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ query, variables })
      });
      const result = await response.json();
      if (result.errors) {
        console.error(`GraphQL Errors: ${result.errors.map(e => e.message).join(', ')}`);
        Swal.fire({
          title: 'Error',
          text: `GraphQL Errors: ${result.errors.map(e => e.message).join(', ')}`,
          icon: 'error',
          background: '#1a1a1a',
          color: '#ffffff',
          confirmButtonColor: '#4a5568'
        });
        break;
      }
      const fetchedNFTs = result.data.sui.nfts || [];
      nfts.push(...fetchedNFTs);
      offset += fetchedNFTs.length;
      if (fetchedNFTs.length === 0 || nfts.length >= totalCount) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error(`Fetch NFTs Error (offset ${offset}): ${e.message}`);
      Swal.fire({
        title: 'Error',
        text: `Failed to fetch NFTs: ${e.message}. Retrying after delay...`,
        icon: 'error',
        background: '#1a1a1a',
        color: '#ffffff',
        confirmButtonColor: '#4a5568'
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
  }

  if (nfts.length > 0) {
    try {
      await setDoc(doc(db, 'game_control', 'nft_cache'), { nfts, timestamp: serverTimestamp() });
      console.log("Cached NFT data in Firestore");
    } catch (e) {
      console.error("Error caching NFT data:", e);
    }
  }
  return nfts;
}

async function fetchTotalNFTCount() {
  const countQuery = `
    query fetchCollectionCount($where: nfts_bool_exp!) {
      sui {
        nfts_aggregate(where: $where) {
          aggregate {
            count
          }
        }
      }
    }
  `;
  const countVariables = {
    where: { 
      collection_id: { _eq: COLLECTION_ID },
      _not: { listed: { _eq: true } }
    }
  };
  try {
    const countResponse = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ query: countQuery, variables: countVariables })
    });
    const countResult = await countResponse.json();
    if (countResult.errors) {
      console.error(`GraphQL Count Errors: ${countResult.errors.map(e => e.message).join(', ')}`);
      return null;
    }
    return countResult.data.sui.nfts_aggregate.aggregate.count;
  } catch (e) {
    console.error(`Fetch Total NFT Count Error: ${e.message}`);
    return null;
  }
}

async function fetchNFTDetails(nftId) {
  const query = `
    query fetchNftAttributes($nftId: uuid!) {
      sui {
        nfts(where: { id: { _eq: $nftId } }) {
          name
          token_id
          media_url
          ranking
          owner
          attributes {
            type
            value
            rarity
          }
        }
      }
    }
  `;
  const variables = { nftId };
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ query, variables })
    });
    const result = await response.json();
    if (result.errors) {
      console.error(`GraphQL Errors for ${nftId}: ${result.errors.map(e => e.message).join(', ')}`);
      return null;
    }
    return result.data.sui.nfts[0] || null;
  } catch (e) {
    console.error(`Fetch NFT Details Error for ${nftId}: ${e.message}`);
    return null;
  }
}

export async function syncGameState() {
  if (!gameStarted || gameOver) return;
  const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
  try {
    const state = {
      orbs: orbs.map(orb => ({
        id: orb.id,
        x: Math.round(orb.x * 100) / 100,
        y: Math.round(orb.y * 100) / 100,
        health: Math.round(orb.health * 100) / 100,
        skillCooldown: orb.skillCooldown,
        effectTimer: orb.effectTimer,
        shieldActive: orb.shieldActive,
        chargeActive: orb.chargeActive,
        surgeActive: orb.surgeActive,
        gmmActive: orb.gmmActive,
        flagShieldActive: orb.flagShieldActive,
        flagShieldTimer: orb.flagShieldTimer,
        flagShieldCooldown: orb.flagShieldCooldown,
        rallyTimer: orb.rallyTimer,
        attackEffectTimer: orb.attackEffectTimer,
        battleCryTimer: orb.battleCryTimer,
        targetX: orb.targetX ? Math.round(orb.targetX * 100) / 100 : null,
        targetY: orb.targetY ? Math.round(orb.targetY * 100) / 100 : null,
        targetResetFrame: orb.targetResetFrame,
        spawnProgress: orb.spawnProgress,
        shakeTimer: orb.shakeTimer,
        shakeMagnitude: orb.shakeMagnitude
      })),
      projectiles: projectiles.map(proj => ({
        x: Math.round(proj.x * 100) / 100,
        y: Math.round(proj.y * 100) / 100,
        vx: Math.round(proj.vx * 100) / 100,
        vy: Math.round(proj.vy * 100) / 100,
        damage: Math.round(proj.damage * 100) / 100,
        lifetime: proj.lifetime,
        alpha: proj.alpha,
        size: proj.size,
        orbId: proj.orb?.id || null,
        targetId: proj.target?.id || null,
        rgb: proj.rgb,
        beamTimer: proj.beamTimer || 0,
        isSummon: proj.isSummon
      }).filter(proj => proj.orbId !== null && (proj.targetId !== null || !proj.target))),
      cameraShake: { timer: cameraShake.timer, magnitude: cameraShake.magnitude },
      flashEffect: { timer: flashEffect.timer, alpha: flashEffect.alpha },
      gameOver: gameOver,
      timestamp: Date.now()
    };
    await setDoc(doc(db, 'game_state', sessionId.toString()), state);
    console.log("Game state synced to Firestore");
  } catch (e) {
    console.error("Error syncing game state:", e);
  }
}

export async function loadGameState(p) {
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js');
  try {
    const stateDoc = await getDoc(doc(db, 'game_state', sessionId.toString()));
    if (stateDoc.exists()) {
      const state = stateDoc.data();
      gameOver = state.gameOver;
      cameraShake = state.cameraShake;
      flashEffect = state.flashEffect;
      orbs.forEach(orb => {
        const savedOrb = state.orbs.find(o => o.id === orb.id);
        if (savedOrb) {
          orb.x = savedOrb.x;
          orb.y = savedOrb.y;
          orb.health = savedOrb.health;
          orb.skillCooldown = savedOrb.skillCooldown;
          orb.effectTimer = savedOrb.effectTimer;
          orb.shieldActive = savedOrb.shieldActive;
          orb.chargeActive = savedOrb.chargeActive;
          orb.surgeActive = savedOrb.surgeActive;
          orb.gmmActive = savedOrb.gmmActive;
          orb.flagShieldActive = savedOrb.flagShieldActive;
          orb.flagShieldTimer = savedOrb.flagShieldTimer;
          orb.flagShieldCooldown = savedOrb.flagShieldCooldown;
          orb.rallyTimer = savedOrb.rallyTimer;
          orb.attackEffectTimer = savedOrb.attackEffectTimer;
          orb.battleCryTimer = savedOrb.battleCryTimer;
          orb.targetX = savedOrb.targetX;
          orb.targetY = savedOrb.targetY;
          orb.targetResetFrame = savedOrb.targetResetFrame;
          orb.spawnProgress = savedOrb.spawnProgress;
          orb.shakeTimer = savedOrb.shakeTimer;
          orb.shakeMagnitude = savedOrb.shakeMagnitude;
        }
      });
      projectiles = state.projectiles.map(proj => ({
        ...proj,
        orb: orbs.find(o => o.id === proj.orbId) || null,
        target: proj.targetId ? orbs.find(o => o.id === proj.targetId) : null,
        color: `rgb(${proj.rgb.join(',')})`
      })).filter(proj => proj.orb !== null);
      console.log("Loaded game state from Firestore");
      return true;
    }
    return false;
  } catch (e) {
    console.error("Error loading game state:", e);
    return false;
  }
}

export async function loadImageWithRetry(p, url, maxRetries = 5, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const image = await p.loadImage(url);
      return image;
    } catch (e) {
      console.warn(`Image load attempt ${i + 1} failed for ${url}: ${e.message}`);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`Failed to load image ${url} after ${maxRetries} attempts`);
  return null;
}

export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return [r, g, b];
}

export function validateRgb(rgb) {
  return Array.isArray(rgb) && rgb.length === 3 && rgb.every(v => typeof v === 'number' && v >= 0 && v <= 255) ? rgb : [0, 183, 235];
}

export function calculateStats(attributes, ranking, name, owner) {
  const attributeMap = {};
  attributes.forEach(attr => {
    attributeMap[attr.type] = { value: attr.value, rarity: attr.rarity };
  });

  const defaultAttributes = {
    "Core Color": { value: "Neon Blue", rarity: 0.4651 },
    "Aura Effect": { value: "Surge", rarity: 0.3256 },
    "Skin": { value: "No Skin", rarity: 0.3256 },
    "Flag": { value: "No Flag", rarity: 0.7442 },
    "Rarity": { value: "Common", rarity: 0.4651 },
    "Special Modifier": { value: "None", rarity: 0.5116 }
  };

  const effectiveAttributes = { ...defaultAttributes, ...attributeMap };

  const rarity = traits["Rarity"].find(t => t.value === effectiveAttributes.Rarity.value) || traits["Rarity"][0];
  const coreColor = traits["Core Color"].find(t => t.value === effectiveAttributes["Core Color"].value) || traits["Core Color"][0];
  const auraEffect = traits["Aura Effect"].find(t => t.value === effectiveAttributes["Aura Effect"].value) || traits["Aura Effect"][0];
  const skin = traits["Skin"].find(t => t.value === effectiveAttributes.Skin.value) || traits["Skin"][0];
  const flag = traits["Flag"].find(t => t.value === effectiveAttributes.Flag.value) || traits["Flag"][0];
  const specialModifier = traits["Special Modifier"].find(t => t.value === effectiveAttributes["Special Modifier"].value) || traits["Special Modifier"][0];

  const isLongRange = ["Overcharge", "Absorb", "Pulse", "Singularity"].includes(auraEffect.value);
  const role = auraEffect.evasion >= 20 ? "Dodging" :
               isLongRange ? "Long-Range" :
               skin.defense >= 2 ? "Tank" :
               rarity.cooldownBase <= 4.5 ? "Good" : "Bad";

  let baseHealth = 100 + (skin.defense || 0) * 5 + (ranking || 0) / 200 * (role === "Bad" ? 1.2 : role === "Tank" ? 0.9 : 1);
  let baseAttack = (10 + (auraEffect.attack || 0) * 0.7 + (specialModifier.attack_bonus || 0) * 0.8 * (role === "Bad" ? 1.2 : role === "Tank" ? 0.8 : 1)) * 1.2; // 20% damage increase
  let baseDefense = 1 + (auraEffect.defense || 0) * 0.5 + (skin.defense || 0) * 0.5;
  let baseSpeed = (8 + (auraEffect.speed || 0)) * 0.8 * 1.1;

  if (name.toLowerCase() === "milly") {
    baseHealth *= 1.2;
    baseAttack *= 1.15;
    baseSpeed *= 1.1;
  }

  baseDefense *= (role === "Long-Range" ? 0.7 : 1);

  const stats = {
    health: baseHealth,
    maxHealth: baseHealth,
    attack: baseAttack,
    defense: baseDefense,
    speed: baseSpeed * (flag.morale > 0 ? 1.1 : 1),
    evasion: Math.min(0.15, (coreColor.evasion || 0) * 0.01 + (auraEffect.evasion || 0) / 200),
    crowdControl: (auraEffect.crowd_control || 0) / 100,
    morale: flag.morale || 0,
    xpGain: (auraEffect.xp_gain || 0) + (specialModifier.xp_bonus || 0),
    coreColor: coreColor.hex || "#00B7EB",
    coreRgb: coreColor.rgb || [0, 183, 235],
    auraEffect: auraEffect.value,
    skin: skin.value,
    rarity: rarity.value,
    specialModifier: specialModifier.value,
    role,
    attackRange: isLongRange ? 200 : 50,
    cooldownBase: rarity.cooldownBase || 6,
    owner: owner || "Unknown",
    hasFlag: flag.value !== "No Flag",
    battleCry: flag.battleCry,
    flagShieldActive: flag.value !== "No Flag",
    flagShieldTimer: flag.value !== "No Flag" ? 40 : 0,
    flagShieldCooldown: 0,
    rallyTimer: 0
  };

  stats.cooldown = Math.max(4, Math.min(6, stats.cooldownBase * (role === "Bad" ? 0.9 : 1))) * (stats.hasFlag ? 0.8 : 1);
  if (stats.health <= 0) {
    stats.health = stats.maxHealth = 100;
    console.warn(`Adjusted health for ${name} to 100 due to invalid stats`);
  }
  return stats;
}

export async function startGame(p) {
  if (gameStarted) return;
  gameStarted = true;
  const success = await loadOrbs(p);
  if (!success) {
    gameStarted = false;
    startGameTriggered = false;
    document.getElementById('orb-count').textContent = "Waiting for game start...";
  }
}

export async function restartGame(p) {
  console.log("Restarting game...");
  orbs = [];
  particles = [];
  projectiles = [];
  cameraShake = { timer: 0, magnitude: 0, x: 0, y: 0 };
  flashEffect = { timer: 0, alpha: 0 };
  gameOver = false;
  gameStarted = false;
  startGameTriggered = false;
  await startGame(p);
}

async function loadOrbs(p) {
  console.log("Starting to load orbs...");
  document.getElementById('orb-count').textContent = "Loading orbs...";
  orbs = [];
  allNFTs = await fetchAllNFTs();
  if (allNFTs.length === 0) {
    console.error('No NFTs fetched. No orbs will be displayed.');
    Swal.fire({
      title: 'Error',
      text: 'Failed to fetch NFTs. Please check your API credentials or network connection.',
      icon: 'error',
      background: '#1a1a1a',
      color: '#ffffff',
      confirmButtonColor: '#4a5568'
    });
    document.getElementById('orb-count').textContent = "Failed to load NFTs";
    return false;
  }
  let skippedCount = 0;
  const promises = allNFTs.map(async (nft, index) => {
    const details = nft;
    if (!details) {
      console.warn(`Skipping ${nft.name} due to null details`);
      skippedCount++;
      return null;
    }
    const stats = calculateStats(details.attributes || [], details.ranking || 0, details.name, details.owner);
    let image = null;
    try {
      const imageUrl = convertMediaUrl(details.media_url);
      if (imageUrl) {
        image = await loadImageWithRetry(p, imageUrl);
      }
    } catch (e) {
      console.warn(`Failed to load image for ${nft.name}: ${e.message}`);
    }
    const orb = {
      id: nft.id,
      name: nft.name,
      ...stats,
      image,
      x: p.random(100, 1100),
      y: p.random(100, 700),
      radius: 15 + (traits["Rarity"].findIndex(r => r.value === stats.rarity) + 1) * 3,
      skillCooldown: 0,
      shieldActive: false,
      chargeActive: false,
      surgeActive: false,
      gmmActive: false,
      effectTimer: 0,
      skillScale: 1,
      targetX: null,
      targetY: null,
      targetResetFrame: 0,
      spawnProgress: 0,
      shakeTimer: 0,
      shakeMagnitude: 0,
      rotation: 0,
      trail: [],
      swordSlash: null,
      attackEffectTimer: 0,
      battleCryTimer: 0
    };
    return orb;
  });
  orbs = (await Promise.all(promises)).filter(orb => orb !== null);
  console.log(`Skipped ${skippedCount} NFTs due to null details`);
  if (orbs.length === 0) {
    console.error('No valid orbs created. Check NFT data and API.');
    Swal.fire({
      title: 'Error',
      text: 'No valid NFTs could be loaded. Please check your API or NFT data.',
      icon: 'error',
      background: '#1a1a1a',
      color: '#ffffff',
      confirmButtonColor: '#4a5568'
    });
    document.getElementById('orb-count').textContent = "No valid NFTs loaded";
    return false;
  }
  console.log(`Loaded ${orbs.length} orbs successfully`);
  orbs.forEach((orb, i) => setTimeout(() => orb.spawnProgress = 1, i * 100));
  const stateLoaded = await loadGameState(p);
  if (!stateLoaded) {
    updateOrbStats();
    await syncGameState();
  }
  document.getElementById('orb-count').textContent = `Active Orbs: ${orbs.filter(o => o && o.health > 0).length}`;
  return true;
}

function convertMediaUrl(url) {
  if (!url) return null;
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  } else if (url.startsWith('walrus://')) {
    return null;
  }
  return url;
}

export { initializeGame };