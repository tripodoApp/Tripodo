const socket = io();

let playerId = localStorage.getItem('playerId');
function getPlayerId() {
  if (!playerId) {
    playerId = localStorage.getItem('playerId');
  }
  return playerId;
}

if (!playerId) {
  socket.emit("generatePlayerID");
} else {
  socket.emit("checkActiveGame", { playerId: playerId });
}

// ELEMENTI
const modal = document.getElementById("modal");
const closeModal = document.getElementById("closeModal");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");

const createRoomSection = document.getElementById("createRoomSection");
const joinRoomSection = document.getElementById("joinRoomSection");

const roomNameInput = document.getElementById("roomNameInput");
const myNameInput = document.getElementById("myNameInput");
const myNameInput2 = document.getElementById("myNameInput2");
const createRoomBtn = document.getElementById("createRoomBtn");
const playerListCreate = document.getElementById("playerListCreate");
const startGameBtn = document.getElementById("startGameBtn");
const startGameTest = document.getElementById("startGameTest");

const joinRoomInput = document.getElementById("joinRoomInput");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const playerListJoin = document.getElementById("playerListJoin");

// APRI MODALE
createBtn.addEventListener("click", () => {
  modal.classList.remove("hidden");
  createRoomSection.classList.remove("hidden");
  joinRoomSection.classList.add("hidden");
});

joinBtn.addEventListener("click", () => {
  modal.classList.remove("hidden");
  joinRoomSection.classList.remove("hidden");
  createRoomSection.classList.add("hidden");
});

// CHIUDI MODALE
closeModal.addEventListener("click", () => modal.classList.add("hidden"));

// CREA ROOM
createRoomBtn.addEventListener("click", () => {
  const roomName = roomNameInput.value.trim();
  const playerName = myNameInput.value.trim();
  if (!roomName) return alert("Inserisci un nome per la partita");

  const currentId = getPlayerId();
  if (!currentId) return alert("Inizializzazione in corso, attendi un istante...");

  const payload = {
    roomName: roomName,
    player: {
        playerId: currentId,
        playerName: playerName
    }
  };
  socket.emit("createRoom", payload);
});

// UNISCITI A ROOM
joinRoomBtn.addEventListener("click", () => {
  const roomName = joinRoomInput.value.trim();
  const playerName = myNameInput2.value.trim();
  if (!roomName) return alert("Inserisci il nome della partita");

  const currentId = getPlayerId();
  if (!currentId) return alert("Inizializzazione in corso, attendi un istante...");

  const payload = {
    roomName: roomName,
    player: {
      idPlayer : currentId,
      playerName: playerName
    }
  };
  socket.emit("joinRoom", payload);
});

// START GAME
startGameBtn.addEventListener("click", () => {
  socket.emit("startGame");
});

// START GAME TEST
startGameTest.addEventListener("click", () => {
  socket.emit("startGameTest");
});

// SOCKET.IO LISTENER
socket.on("roomCreated", data => {
  playerListCreate.innerHTML = `In attesa dei giocatori:<br>${data.players[0].playerName}<br>`;
  startGameBtn.classList.remove("hidden");
  startGameTest.classList.remove("hidden"); // solo host vede il bottone
});

socket.on("updatePlayers", data => {

  const players = data.players;

  playerListJoin.innerHTML = `In attesa dei giocatori:<br>`;
  playerListCreate.innerHTML = `In attesa dell'host:<br>`;

  players.forEach(element => {

    playerListCreate.innerHTML += `${element.playerName}<br>`;
    playerListJoin.innerHTML += `${element.playerName}<br>`;
  });

});

socket.on("gameStarting", () => {
  if (document.getElementById("gameStartingOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "gameStartingOverlay";
  overlay.className = "game-starting-overlay";
  overlay.innerHTML = `
    <div class="game-starting-card">
      <div class="game-starting-spinner"></div>
      <h3>Partita in Avvio!</h3>
      <p>L'Host ha avviato il gioco. Ingresso al tavolo...</p>
    </div>
  `;
  document.body.appendChild(overlay);
});

socket.on("gameStarted", () => {
  if (startGameBtn) {
    startGameBtn.disabled = true;
    startGameBtn.textContent = "Avvio in corso... ⏳";
  }
  setTimeout(() => {
    socket.emit("redirectTable");
  }, 500);
});

//TEST
socket.on("gameStartedTest", () => {
  if (startGameTest) {
    startGameTest.disabled = true;
    startGameTest.textContent = "Avvio test in corso... ⏳";
  }
  setTimeout(() => {
    socket.emit("redirectTableTest", 21);
  }, 500);
});

//REDIRECT TAVOLO
socket.on("goTable", data => {

  window.location.href = data;
})

socket.on("returnIdPlayer", idPlayer => {
  playerId = idPlayer;
  localStorage.setItem('playerId', idPlayer);
  socket.emit("checkActiveGame", { playerId: idPlayer });
});

// GESTIONE PARTITA ATTIVA ESISTENTE
const activeGameBanner = document.getElementById("activeGameBanner");
const activeGameRoomName = document.getElementById("activeGameRoomName");
const rejoinBtn = document.getElementById("rejoinBtn");

socket.on("activeGameFound", data => {
  if (activeGameBanner && activeGameRoomName) {
    activeGameRoomName.textContent = data.roomName;
    activeGameBanner.classList.remove("hidden");
  }
  createBtn.disabled = true;
  createBtn.style.opacity = "0.5";
  createBtn.title = "Hai una partita in corso";
  joinBtn.disabled = true;
  joinBtn.style.opacity = "0.5";
  joinBtn.title = "Hai una partita in corso";
});

socket.on("noActiveGame", () => {
  if (activeGameBanner) {
    activeGameBanner.classList.add("hidden");
  }
  createBtn.disabled = false;
  createBtn.style.opacity = "1";
  createBtn.title = "";
  joinBtn.disabled = false;
  joinBtn.style.opacity = "1";
  joinBtn.title = "";
});

if (rejoinBtn) {
  rejoinBtn.addEventListener("click", () => {
    window.location.href = "/public/tavoloComponent/tavolo.html";
  });
}

//ERRORE SOCKET
socket.on("error", (error) => {
    console.error(`Errore [${error.code}]: ${error.message}`);
    alert(`Ops! ${error.message}`); 
});

