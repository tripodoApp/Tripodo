const socket = io();

const playerId = localStorage.getItem('playerId');
if (!playerId) {
  socket.emit("generatePlayerID");
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

  const payload = {
    roomName: roomName,
    player: {
        playerId: playerId,
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

  const payload = {
    roomName: roomName,
    player: {
      idPlayer : playerId,
      playerName: playerName
    }
  }
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

socket.on("gameStarted", () => {
  
  alert("Il gioco sta per iniziare!");
  socket.emit("redirectTable");
});

//TEST
socket.on("gameStartedTest", () => {
  
  alert("Il gioco sta per iniziare!");
  socket.emit("redirectTableTest", 21);
});

//REDIRECT TAVOLO
socket.on("goTable", data => {

  window.location.href = data;
})

socket.on ("returnIdPlayer", idPlayer => {

  localStorage.setItem('playerId', idPlayer);
})

//ERRORE SOCKET
socket.on("error", (error) => {

    console.error(`Errore [${error.code}]: ${error.message}`);
  
    // ALERT DI PROVA
    alert(`Ops! ${error.message}`); 
});

