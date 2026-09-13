const socket = io();
const playerId = localStorage.getItem("playerId");

function emitTableReady() {
  const pid = localStorage.getItem("playerId");
  if (pid) {
    socket.emit("tableReady", pid);
  }
}

socket.on("connect", () => {
  console.log("Socket connesso:", socket.id);
  emitTableReady();
});

// Invio iniziale
emitTableReady();

let canPlay = true;
let currentGameState = null;
let currentPlayerData = null;
let allPlayers = [];
let playerStats = {}; // { [id]: { call: "-", tricks: 0 } }
let timerInterval = null;
let currentTimerPlayerId = null;
let timerStartTime = 0;
let timerDuration = 30000;
let toastTimeout = null;
let currentValoreNegato = null;

// ELEMENTI DOM PRINCIPALI
const myHand = document.getElementById("my-hand");
const tableCards = document.getElementById("table-cards");
const opponentsLayer = document.getElementById("opponents-layer");
const gameContainer = document.getElementById("gameContainer");
const tableEl = document.getElementById("table");
const tableToast = document.getElementById("table-toast");
const roundText = document.getElementById("round-text");
const roundPhase = document.getElementById("round-phase");
const turnBanner = document.getElementById("turn-banner");
const turnBannerText = document.getElementById("turn-banner-text");

const localPlayerEl = document.getElementById("local-player");
const myPill = document.getElementById("my-pill");
const myPlayerName = document.getElementById("my-player-name");
const myDealerBadge = document.getElementById("my-dealer-badge");
const myCallEl = document.getElementById("my-call");
const myTricksEl = document.getElementById("my-tricks");
const myTimerBar = document.getElementById("my-timer-bar");

const biddingOverlay = document.getElementById("biddingOverlay");
const biddingChips = document.getElementById("biddingChips");
const biddingForbiddenNotice = document.getElementById("biddingForbiddenNotice");
const forbiddenNumberEl = document.getElementById("forbiddenNumber");
const btnOpenBidding = document.getElementById("btnOpenBidding");
const btnCloseBidding = document.getElementById("btnCloseBidding");
const btnMinimizeBidding = document.getElementById("btnMinimizeBidding");

const gameLogPanel = document.getElementById("game-log-panel");
const gameLogContent = document.getElementById("game-log");
const btnToggleLog = document.getElementById("btnToggleLog");
const btnCloseLog = document.getElementById("btnCloseLog");
const logBadge = document.getElementById("log-badge");

const modal = document.getElementById("modalPunteggio");
const btnPunteggio = document.getElementById("btnPunteggio");
const closeBtn = document.querySelector(".close-btn");

// GESTIONE MODALE PUNTEGGIO
btnPunteggio.onclick = function () {
  if (currentGameState && currentGameState.punteggi && allPlayers && allPlayers.length > 0) {
    updateScoreTable(allPlayers, currentGameState.punteggi);
  }
  modal.style.display = "flex";
};
closeBtn.onclick = function () {
  modal.style.display = "none";
};
window.onclick = function (event) {
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

// GESTIONE PANNELLO CHAT/LOG FLOTTANTE
function toggleLogPanel() {
  gameLogPanel.classList.toggle("closed");
  if (!gameLogPanel.classList.contains("closed")) {
    logBadge.classList.add("hidden");
  }
}
function closeLogPanel() {
  gameLogPanel.classList.add("closed");
}
btnToggleLog.onclick = toggleLogPanel;
btnCloseLog.onclick = closeLogPanel;

// NOTIFICHE TOAST SUL TAVOLO
function showTableToast(message) {
  if (!tableToast) return;
  tableToast.textContent = message;
  tableToast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    tableToast.classList.add("hidden");
  }, 2800);
}

// TIMER VISIVO (30 SECONDI - SINCRONIZZATO PER TUTTI I GIOCATORI)
function startVisualTimer(activePlayerId, duration = 30000) {
  clearInterval(timerInterval);
  if (!activePlayerId) return;

  currentTimerPlayerId = activePlayerId;
  timerStartTime = Date.now();
  timerDuration = duration;

  // Reset visivo di tutte le barre
  if (myTimerBar) {
    myTimerBar.style.width = "100%";
    if (activePlayerId === playerId) myTimerBar.classList.remove("hidden");
    else myTimerBar.classList.add("hidden");
  }

  document.querySelectorAll(".player-timer-bar").forEach(el => {
    el.style.width = "100%";
    if (el.id === `timer-${activePlayerId}` || (el.id === "my-timer-bar" && activePlayerId === playerId)) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });

  const turnBannerTimer = document.getElementById("turn-banner-timer");
  if (turnBannerTimer) {
    turnBannerTimer.style.width = "100%";
  }

  updateTimerTick();

  timerInterval = setInterval(() => {
    updateTimerTick();
  }, 100);
}

function updateTimerTick() {
  if (!currentTimerPlayerId || !timerStartTime) return;
  const elapsed = Date.now() - timerStartTime;
  const ratio = Math.max(0, 1 - (elapsed / timerDuration));
  const pct = `${(ratio * 100).toFixed(1)}%`;

  // Barra del giocatore attivo (locale o avversario)
  const activeBar = (currentTimerPlayerId === playerId)
    ? myTimerBar
    : document.getElementById(`timer-${currentTimerPlayerId}`);

  if (activeBar) {
    activeBar.classList.remove("hidden");
    activeBar.style.width = pct;
  }

  // Barra del banner turno in alto (HUD)
  const turnBannerTimer = document.getElementById("turn-banner-timer");
  if (turnBannerTimer) {
    turnBannerTimer.style.width = pct;
  }

  if (elapsed >= timerDuration) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// AGGIORNAMENTO BADGE STATISTICHE
function updatePlayerStatsUI(pid) {
  const stats = playerStats[pid] || { call: "-", tricks: 0 };
  if (pid === playerId) {
    if (myCallEl) myCallEl.textContent = stats.call;
    if (myTricksEl) myTricksEl.textContent = stats.tricks;
  } else {
    const pill = document.getElementById(`pill-${pid}`);
    if (pill) {
      const callStrong = pill.querySelector(".stats-badge span:first-child strong");
      const trickStrong = pill.querySelector(".stats-badge span:last-child strong");
      if (callStrong) callStrong.textContent = stats.call;
      if (trickStrong) trickStrong.textContent = stats.tricks;
    }
  }
}

// OVERLAY CHIAMATA (BIDDING UI)
function showBiddingOverlay(numCards, forbiddenVal) {
  if (!biddingOverlay) return;
  biddingOverlay.classList.remove("hidden");
  if (btnOpenBidding) btnOpenBidding.classList.add("hidden");

  // Il valore è vietato SOLO ED ESCLUSIVAMENTE se il giocatore locale è il banco!
  const isBanco = currentGameState && (currentGameState.bancoId === playerId);
  const effectiveForbidden = isBanco ? forbiddenVal : null;

  biddingChips.innerHTML = "";
  for (let i = 0; i <= numCards; i++) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "bidding-chip";
    chip.textContent = i;

    if (effectiveForbidden !== null && effectiveForbidden !== undefined && effectiveForbidden !== -1 && i === effectiveForbidden) {
      chip.disabled = true;
      chip.classList.add("forbidden");
      chip.title = "Valore vietato per il Banco";
    } else {
      chip.onclick = () => {
        socket.emit("callNumber", {
          valueCall: i,
          playerCode: playerId
        });
        currentValoreNegato = null;
        hideBiddingOverlay(false);
      };
    }
    biddingChips.appendChild(chip);
  }

  if (effectiveForbidden !== null && effectiveForbidden !== undefined && effectiveForbidden !== -1) {
    if (forbiddenNumberEl) forbiddenNumberEl.textContent = effectiveForbidden;
    if (biddingForbiddenNotice) biddingForbiddenNotice.classList.remove("hidden");
  } else {
    if (biddingForbiddenNotice) biddingForbiddenNotice.classList.add("hidden");
  }
}

function hideBiddingOverlay(showReopenBtn = false) {
  if (biddingOverlay) biddingOverlay.classList.add("hidden");
  if (btnOpenBidding) {
    const isMyTurnToCall = currentGameState && currentGameState.giroChiamata && currentGameState.turnoAttualeId === playerId;
    if (showReopenBtn && isMyTurnToCall) {
      btnOpenBidding.classList.remove("hidden");
    } else {
      btnOpenBidding.classList.add("hidden");
    }
  }
}

// ASSEGNAZIONE EVENTI DI CHIUSURA/RIAPERTURA CHIAMATA
if (btnCloseBidding) {
  btnCloseBidding.onclick = function (e) {
    e.stopPropagation();
    hideBiddingOverlay(true);
  };
}
if (btnMinimizeBidding) {
  btnMinimizeBidding.onclick = function (e) {
    e.stopPropagation();
    hideBiddingOverlay(true);
  };
}
if (btnOpenBidding) {
  btnOpenBidding.onclick = function () {
    if (currentGameState && currentGameState.giroChiamata && currentGameState.turnoAttualeId === playerId && currentPlayerData) {
      const isBanco = (currentGameState.bancoId === playerId);
      const forbidden = isBanco ? (currentValoreNegato !== null ? currentValoreNegato : currentGameState.valoreNegato) : null;
      showBiddingOverlay(currentPlayerData.cardsHands.length, forbidden);
    }
  };
}
if (biddingOverlay) {
  biddingOverlay.onclick = function (e) {
    if (e.target === biddingOverlay) {
      hideBiddingOverlay(true);
    }
  };
}

// RENDERING CARTE SUL TAVOLO
function renderTableCards(cardsTable) {
  tableCards.innerHTML = "";
  if (!cardsTable) return;

  cardsTable.forEach(card => {
    const wrapper = document.createElement("div");
    wrapper.className = "table-card-wrapper";
    
    // Inclinazione realistica deterministica (tra -4 e +4 gradi)
    const num = parseInt(card.carta, 10) || 1;
    const randomRot = ((num * 17) % 9) - 4;
    wrapper.style.setProperty("--rot", `${randomRot}deg`);

    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
    img.className = "card";
    img.id = `card-${card.carta}`;

    const owner = allPlayers.find(p => p.playerId === card.idPlayer);
    const ownerName = owner ? (owner.playerId === playerId ? "Tu" : owner.playerName) : "";

    wrapper.appendChild(img);
    if (ownerName) {
      const ownerTag = document.createElement("span");
      ownerTag.className = "table-card-owner";
      ownerTag.textContent = ownerName;
      wrapper.appendChild(ownerTag);
    }

    tableCards.appendChild(wrapper);
  });
}

// RENDERING MANO LOCALE
function renderMyHand(cardsHands, isMyTurn) {
  myHand.innerHTML = "";
  if (isMyTurn) {
    localPlayerEl.classList.add("my-turn");
    localPlayerEl.classList.remove("not-my-turn");
  } else {
    localPlayerEl.classList.add("not-my-turn");
    localPlayerEl.classList.remove("my-turn");
  }

  cardsHands.forEach(card => {
    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
    img.className = "card";
    img.onclick = () => {
      if (canPlay && isMyTurn) {
        socket.emit("playCard", {
          card: card,
          playerCode: playerId
        });
      }
    };
    myHand.appendChild(img);
  });
}

// RENDERING AVVERSARI A CERCHIO/ELLISSE (SUPPORTO FINO A 8 GIOCATORI)
function renderOpponents(players, currentRoundCardCount, isLastRound, lastRoundCards) {
  opponentsLayer.innerHTML = "";
  const opponents = players.filter(p => p.playerId !== playerId);
  const numOpponents = opponents.length;
  if (numOpponents === 0) return;

  const containerWidth = gameContainer.offsetWidth;
  const containerHeight = gameContainer.offsetHeight;
  const tableWidth = tableEl.offsetWidth;
  const tableHeight = tableEl.offsetHeight;

  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;

  const isLandscape = containerWidth > containerHeight;

  // Calcolo raggio ellittico per adattarsi a landscape e portrait
  const marginX = isLandscape ? Math.min(containerWidth * 0.16, 160) : Math.min(Math.max(45, containerWidth * 0.1), 100);
  const marginY = isLandscape ? Math.min(containerHeight * 0.14, 55) : Math.min(Math.max(40, containerHeight * 0.08), 85);

  const radiusX = (tableWidth / 2) + marginX;
  const radiusY = (tableHeight / 2) + marginY;

  // Distribuzione angolare da sinistra (175°) verso l'alto (270°) a destra (365°)
  let startAngle = Math.PI * 0.98; 
  let endAngle = Math.PI * 2.02;   

  if (numOpponents === 1) {
    startAngle = Math.PI * 1.5; // In alto al centro
    endAngle = Math.PI * 1.5;
  }

  opponents.forEach((opp, index) => {
    let angle;
    if (numOpponents === 1) {
      angle = startAngle;
    } else {
      angle = startAngle + (index * (endAngle - startAngle)) / (numOpponents - 1);
    }

    let rawX = centerX + radiusX * Math.cos(angle);
    let rawY = centerY + radiusY * Math.sin(angle);

    // Margini di sicurezza per non finire sopra la HUD o fuori dai bordi
    const safeLeft = 50;
    const safeRight = containerWidth - 50;
    const safeTop = isLandscape ? 38 : 45;
    const safeBottom = containerHeight - (isLandscape ? 60 : 95);

    const x = Math.max(safeLeft, Math.min(safeRight, rawX));
    const y = Math.max(safeTop, Math.min(safeBottom, rawY));

    const oppDiv = document.createElement("div");
    oppDiv.className = "player opponent";
    oppDiv.id = `opp-${opp.playerId}`;
    oppDiv.style.left = `${x}px`;
    oppDiv.style.top = `${y}px`;
    oppDiv.style.transform = "translate(-50%, -50%)";

    // Carte in mano
    const handDiv = document.createElement("div");
    handDiv.className = "hand";

    if (isLastRound && lastRoundCards) {
      lastRoundCards.forEach(carta => {
        if (carta.idPlayer === opp.playerId) {
          const cardImg = document.createElement("img");
          cardImg.src = `/public/img/cards/Napoletane/${carta.carta}.jpg`;
          cardImg.className = "card";
          handDiv.appendChild(cardImg);
        }
      });
    } else {
      const count = currentRoundCardCount || 1;
      for (let i = 0; i < count; i++) {
        const cardBack = document.createElement("img");
        cardBack.src = "/public/img/cards/Napoletane/bg.jpg";
        cardBack.className = "card";
        handDiv.appendChild(cardBack);
      }
    }

    // Pillola giocatore con nome, mazziere e statistiche
    const isDealer = currentGameState && currentGameState.bancoId === opp.playerId;
    const isTurn = currentGameState && currentGameState.turnoAttualeId === opp.playerId;
    const stats = playerStats[opp.playerId] || { call: "-", tricks: 0 };

    const pillDiv = document.createElement("div");
    pillDiv.className = `player-pill ${isTurn ? "active-turn-glow" : ""}`;
    pillDiv.id = `pill-${opp.playerId}`;

    const elapsed = timerStartTime ? (Date.now() - timerStartTime) : 0;
    const currentRatio = (currentTimerPlayerId === opp.playerId && timerStartTime)
      ? Math.max(0, 1 - (elapsed / timerDuration))
      : 1;
    const currentPct = `${(currentRatio * 100).toFixed(1)}%`;

    pillDiv.innerHTML = `
      ${isDealer ? '<span class="dealer-crown" title="Mazziere">👑 D</span>' : ''}
      <span class="player-name">${opp.playerName}</span>
      <div class="stats-badge">
        <span title="Chiamata">🎯 <strong>${stats.call}</strong></span>
        <span class="stats-separator">|</span>
        <span title="Prese">🏆 <strong>${stats.tricks}</strong></span>
      </div>
      <div class="player-timer-bar ${isTurn ? '' : 'hidden'}" id="timer-${opp.playerId}" style="width: ${currentPct};"></div>
    `;

    oppDiv.appendChild(handDiv);
    oppDiv.appendChild(pillDiv);
    opponentsLayer.appendChild(oppDiv);
  });
}

// RICALCOLO LAYOUT SU RIDIMENSIONAMENTO E ORIENTAMENTO SCHERMO
function recalculateLayout() {
  if (allPlayers.length > 0 && currentPlayerData) {
    renderOpponents(allPlayers, currentPlayerData.cardsHands.length, currentGameState?.isLastRound);
  }
}

window.addEventListener("resize", () => {
  recalculateLayout();
});
window.addEventListener("orientationchange", () => {
  setTimeout(recalculateLayout, 150);
});

// ==========================================================================
// GESTIONE SOCKET EVENTS
// ==========================================================================
socket.on("initData", data => {
  const { playerData, gameState, players, playersSummary } = data;
  currentGameState = gameState;
  currentPlayerData = playerData;
  allPlayers = players;

  // Sincronizzazione immediata della tabella punteggi se presente nel gameState
  if (gameState && gameState.punteggi && players && players.length > 0) {
    updateScoreTable(players, gameState.punteggi);
  }

  // Sincronizzazione autoritativa di TUTTE le statistiche (chiamate e prese) inviate dal server
  if (playersSummary && Array.isArray(playersSummary)) {
    playersSummary.forEach(ps => {
      playerStats[ps.playerId] = {
        call: (ps.haChiamato && ps.numeroChiamata !== null && ps.numeroChiamata !== undefined) ? ps.numeroChiamata : "-",
        tricks: ps.numeroPrese !== undefined ? ps.numeroPrese : 0
      };
      updatePlayerStatsUI(ps.playerId);
    });
  } else {
    // Fallback se playersSummary non è presente
    players.forEach(p => {
      if (!playerStats[p.playerId]) {
        playerStats[p.playerId] = { call: "-", tricks: 0 };
      }
    });
    if (playerData) {
      if (!playerStats[playerId]) playerStats[playerId] = { call: "-", tricks: 0 };
      if (playerData.haChiamato) {
        playerStats[playerId].call = playerData.numeroChiamata;
      } else if (gameState.giroChiamata) {
        playerStats[playerId].call = "-";
      }
      if (playerData.numeroPrese !== undefined) {
        playerStats[playerId].tricks = playerData.numeroPrese;
      }
      updatePlayerStatsUI(playerId);
    }
  }

  // Nome e stato del giocatore locale
  const localPlayer = players.find(p => p.playerId === playerId);
  if (localPlayer && myPlayerName) {
    myPlayerName.textContent = localPlayer.playerName;
  }

  // Badge Mazziere (Banco)
  const isDealer = gameState.bancoId === playerId;
  if (myDealerBadge) {
    if (isDealer) myDealerBadge.classList.remove("hidden");
    else myDealerBadge.classList.add("hidden");
  }

  // HUD Round e Fase
  const isDown = gameState.currentRound > gameState.totalRound;
  const phase = isDown ? "Discesa" : "Salita";
  if (roundText) {
    roundText.textContent = `Round ${gameState.currentRound} (${playerData.cardsHands.length} carte)`;
  }
  if (roundPhase) {
    roundPhase.textContent = phase;
  }

  // Banner Turno
  const isMyTurn = gameState.turnoAttualeId === playerId;
  const activePlayer = players.find(p => p.playerId === gameState.turnoAttualeId);
  if (turnBanner && turnBannerText) {
    turnBanner.classList.remove("hidden");
    if (isMyTurn) {
      turnBannerText.textContent = gameState.giroChiamata ? "Tocca a te: Fai la Chiamata!" : "È il tuo Turno: Gioca!";
    } else {
      turnBannerText.textContent = `Turno di: ${activePlayer ? activePlayer.playerName : '...'}`;
    }
  }

  // Glow turno attivo su pillola
  if (isMyTurn) {
    myPill.classList.add("active-turn-glow");
  } else {
    myPill.classList.remove("active-turn-glow");
  }

  // Abilitazione gioco carta: se è il mio turno e non è la fase di chiamata, posso giocare
  canPlay = isMyTurn && !gameState.giroChiamata;

  // Controllo ruolo Banco per il giocatore locale
  const isBanco = (gameState.bancoId === playerId);
  if (!isBanco || !gameState.giroChiamata) {
    currentValoreNegato = null;
  }

  // Trigger Bidding Overlay
  if (gameState.giroChiamata) {
    if (isMyTurn) {
      // Il valore negato è applicabile SOLO E SOLTANTO al banco!
      const forbidden = isBanco ? (currentValoreNegato !== null ? currentValoreNegato : gameState.valoreNegato) : null;
      showBiddingOverlay(playerData.cardsHands.length, forbidden);
    } else {
      hideBiddingOverlay(false);
    }
  } else {
    currentValoreNegato = null;
    hideBiddingOverlay(false);
  }

  // Render Carte sul Tavolo
  renderTableCards(gameState.cardsTable);

  // Render Mia Mano
  renderMyHand(playerData.cardsHands, isMyTurn && !gameState.giroChiamata);

  // Render Avversari (PRIMA del timer così i nodi DOM esistono già)
  renderOpponents(players, playerData.cardsHands.length, false);

  // Avvio Timer Visivo SINCRONIZZATO
  startVisualTimer(gameState.turnoAttualeId);
});

socket.on("aggiornaTavolo", data => {
  if (data && data.carte) {
    renderTableCards(data.carte);
  }
});

socket.on("cardOnTable", ({ card }) => {
  if (currentGameState) {
    currentGameState.cardsTable.push(card);
    renderTableCards(currentGameState.cardsTable);
  }
});

socket.on("gameLog", data => {
  const msg = data.messaggio;
  
  // 1. Aggiunta alla cronologia
  const row = document.createElement("div");
  row.className = "log-row";
  if (msg.includes("ha preso la mano")) {
    row.classList.add("presa");
  } else if (msg.includes("ha chiamato") || msg.includes("deve chiamare")) {
    row.classList.add("chiamata");
  } else if (msg.includes("turno") || msg.includes("secondi")) {
    row.classList.add("turno");
  }
  row.textContent = msg;
  gameLogContent.appendChild(row);
  gameLogContent.scrollTop = gameLogContent.scrollHeight;

  // 2. Notifica badge se drawer chiuso
  if (gameLogPanel.classList.contains("closed")) {
    logBadge.classList.remove("hidden");
  }

  // 3. Notifiche toast e animazione vincitore mano
  if (msg.includes("ha preso la mano")) {
    showTableToast(`🏆 ${msg}`);
    const lastCard = tableCards.querySelector(".table-card-wrapper:last-child .card");
    if (lastCard) lastCard.classList.add("winning-card");
  } else if (msg.includes("ha chiamato")) {
    showTableToast(msg);
  }

  // 4. Notifiche speciali di round
  if (msg.includes("Fine Round")) {
    showTableToast(`📢 ${msg}`);
  }
});

socket.on("chiamataBanco", data => {
  const isBanco = currentGameState && (currentGameState.bancoId === playerId);
  if (isBanco) {
    currentValoreNegato = data.valoreNegato;
    if (currentGameState.turnoAttualeId === playerId && currentGameState.giroChiamata && currentPlayerData) {
      showBiddingOverlay(currentPlayerData.cardsHands.length, currentValoreNegato);
    }
  } else {
    currentValoreNegato = null;
  }
});

socket.on("turnTimerStarted", data => {
  if (data && data.activePlayerId) {
    startVisualTimer(data.activePlayerId, data.duration || 30000);
  }
});

socket.on("finePlayCard", () => {
  canPlay = true;
  socket.emit("aggiornaDati", { playerCode: playerId });
});

socket.on("updateTable", () => {
  canPlay = false;
  socket.emit("aggiornaDati", { playerCode: playerId });
});

socket.on("chiamataFatta", () => {
  socket.emit("handshakeChiamata", { playerCode: playerId });
});

socket.on("lastRound", () => {
  socket.emit("prepareLastRound", { playerCode: playerId });
});

socket.on("playCallNumberHandshake", data => {
  socket.emit("callNumber", {
    valueCall: data.valueCall,
    playerCode: data.playerCode
  });
  hideBiddingOverlay();
});

socket.on("playCardHandShake", data => {
  socket.emit("playCard", { card: data.card, playerCode: data.playerCode });
});

socket.on("cardsLastRound", data => {
  const { playerData, gameState, players, carte, playersSummary } = data;
  currentGameState = gameState;
  currentPlayerData = playerData;
  allPlayers = players;

  if (playersSummary && Array.isArray(playersSummary)) {
    playersSummary.forEach(ps => {
      playerStats[ps.playerId] = {
        call: (ps.haChiamato && ps.numeroChiamata !== null && ps.numeroChiamata !== undefined) ? ps.numeroChiamata : "-",
        tricks: ps.numeroPrese !== undefined ? ps.numeroPrese : 0
      };
      updatePlayerStatsUI(ps.playerId);
    });
  }

  if (roundText) roundText.textContent = "Ultimo Round (Carte Scoperte)";
  if (roundPhase) roundPhase.textContent = "Ultima Mano";

  renderTableCards(gameState.cardsTable);

  myHand.innerHTML = "";
  if (playerData.cardsHands.length !== 0) {
    const card = { carta: "last", valore: "last" };
    const img = document.createElement("img");
    img.src = "/public/img/cards/Napoletane/bg.jpg";
    img.className = "card";
    img.onclick = () => {
      if (canPlay) {
        socket.emit("playCard", {
          card: card,
          playerCode: playerData.idPlayer
        });
      }
    };
    myHand.appendChild(img);
  }

  if (gameState && gameState.punteggi && players && players.length > 0) {
    updateScoreTable(players, gameState.punteggi);
  }
  canPlay = (gameState.turnoAttualeId === playerId);

  renderOpponents(players, 1, true, carte);
});

socket.on("updateScores", data => {
  updateScoreTable(data.players, data.punteggi);
});

socket.on("redirect_to_game_over", data => {
  sessionStorage.setItem("finalResults", JSON.stringify(data));
  window.location.href = data.redirect;
});

// TABELLA PUNTEGGI (COMPATIBILE FINO A 8 GIOCATORI)
function updateScoreTable(players, punteggi) {
  const header = document.getElementById("tableHeader");
  const body = document.getElementById("tableBody");

  header.innerHTML = "<th>Round</th>";
  body.innerHTML = "";

  players.forEach(p => {
    const th = document.createElement("th");
    th.textContent = p.playerName;
    header.appendChild(th);
  });

  const primoPlayerId = players[0].playerId;
  const numeroRound = punteggi[primoPlayerId] ? punteggi[primoPlayerId].length : 0;

  for (let i = 0; i < numeroRound; i++) {
    const tr = document.createElement("tr");
    const tdIndex = document.createElement("td");
    tdIndex.textContent = i + 1;
    tr.appendChild(tdIndex);

    players.forEach(p => {
      const tdScore = document.createElement("td");
      const score = punteggi[p.playerId][i];
      tdScore.textContent = score !== undefined ? score : "-";
      tr.appendChild(tdScore);
    });

    body.appendChild(tr);
  }

  const trTotale = document.createElement("tr");
  trTotale.style.background = "rgba(241, 196, 15, 0.18)";
  trTotale.innerHTML = "<td><strong>TOT</strong></td>";

  players.forEach(p => {
    const tdTotal = document.createElement("td");
    const totale = punteggi[p.playerId] ? punteggi[p.playerId].reduce((a, b) => a + b, 0) : 0;
    tdTotal.innerHTML = `<strong>${totale}</strong>`;
    trTotale.appendChild(tdTotal);
  });
  body.appendChild(trTotale);
}
