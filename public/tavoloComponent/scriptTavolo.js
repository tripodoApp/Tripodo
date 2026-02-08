const socket = io();
const playerId = localStorage.getItem("playerId");
socket.emit("tableReady", playerId);
let canPlay = true;

const handOpponent = document.getElementById("handOpponent");
const myHand = document.getElementById("my-hand");
const table = document.getElementById("table-cards");
const callInput = document.getElementById("callInput");
const callBtn = document.getElementById("callBtn");
const gameLog = document.getElementById("game-log");
const modal = document.getElementById("modalPunteggio");
const btn = document.getElementById("btnPunteggio");
const span = document.querySelector(".close-btn");

//MODALE PUNTEGGIo
btn.onclick = function () {
  modal.style.display = "block";
};

// Chiude la modale cliccando sulla X
span.onclick = function () {
  modal.style.display = "none";
};

// Chiude la modale cliccando in un punto qualsiasi fuori dal rettangolo bianco
window.onclick = function (event) {
  if (event.target == modal) {
    modal.style.display = "none";
  }
};

// FUNZIONE PER POSIZIONARE GLI AVVERSARI A CERCHIO
// Nota: in questo esempio gestiamo 1 avversario fisso in alto,
// ma la logica è pronta per espandersi.
function adjustLayout() {
  const oppContainer = document.getElementById("opponent-container");
  // Se hai più avversari, qui dovresti ciclare e calcolare sin/cos come nell'esempio precedente.
  // Per ora manteniamo l'avversario standard "di fronte" (Top)
  oppContainer.style.top = "40px";
}

socket.on("initData", data => {

  const {playerData, gameState, players} = data;
  // 1. Pulizia totale
  const container = document.querySelector(".game-container");
  // Rimuovi tutti i vecchi player tranne quello locale se preferisci,
  // ma resettare tutto è più sicuro:
  document.querySelectorAll(".player.opponent").forEach((el) => el.remove());
  myHand.innerHTML = "";
  table.innerHTML = "";

  // 2. CARTE SUL TAVOLO (Centro)
  gameState.cardsTable.forEach((card) => {
    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
    img.classList.add("card");
    table.appendChild(img);
  });

  // 3. LE MIE CARTE (Sempre fisse in basso)
  playerData.cardsHands.forEach((card) => {
    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
    img.classList.add("card");
    img.onclick = () => {
      if (canPlay) {
        socket.emit("playCard", {
          card: card, 
          playerCode: playerId});
      } else {
        console.log("Azione bloccata: il tavolo si sta aggiornando");
      }
    };
    myHand.appendChild(img);
  });

  // 4. POSIZIONAMENTO AVVERSARI A CERCHIO
  // Supponiamo che gameState.allPlayers sia la lista di tutti gli ID al tavolo
  const avversari = players.filter((player) => player.playerId !== playerId);
  const numAvversari = avversari.length;

  const raggio = 280; // Distanza dal centro tavolo
  const centerX = container.offsetWidth / 2;
  const centerY = container.offsetHeight / 2;

  avversari.forEach((advId, index) => {
    // Calcoliamo l'angolo: distribuiamo gli avversari nell'arco superiore (da 180° a 360°)
    // In questo modo nessuno si sovrappone a TE che sei a 90° (in basso)
    const startAngle = Math.PI; // Inizia da sinistra
    const endAngle = 2 * Math.PI; // Finisce a destra
    const angle =
      startAngle + (index * (endAngle - startAngle)) / (numAvversari - 1 || 1);

    const x = centerX + raggio * Math.cos(angle) - 50;
    const y = centerY + raggio * Math.sin(angle) - 50;

    // Crea il div dell'avversario
    const divOpp = document.createElement("div");
    divOpp.className = "player opponent";
    divOpp.style.left = `${x}px`;
    divOpp.style.top = `${y}px`;

    // Ruota il contenitore verso il centro
    const rotation = (angle * 180) / Math.PI - 270;
    divOpp.style.transform = `rotate(${rotation}deg)`;

    // Aggiungi le carte coperte (es. 3 carte)
    const handDiv = document.createElement("div");
    handDiv.className = "hand";
    playerData.cardsHands.forEach(() => {
      const cardBack = document.createElement("img");
      cardBack.src = `/public/img/cards/Napoletane/bg.jpg`;
      cardBack.classList.add("card");
      handDiv.appendChild(cardBack);
    });

    // Etichetta col nome/ID
    const label = document.createElement("div");
    label.className = "label";
    label.innerText = `${advId.playerName}`;
    label.style.transform = `rotate(${-rotation}deg)`;
    label.style.color = "white"; // Raddrizza il testo

    divOpp.appendChild(handDiv);
    divOpp.appendChild(label);
    container.appendChild(divOpp);
  });
});

socket.on("aggiornaTavolo", data => {

  const carteTavolo = data.carte;
  const card = carteTavolo[carteTavolo.length - 1];
  const img = document.createElement("img");
  img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
  img.classList.add("card");
  table.appendChild(img);
});

socket.on("gameLog", data => {

  const row = document.createElement("div");
  row.textContent = data.messaggio;
  gameLog.appendChild(row);
  gameLog.scrollTop = gameLog.scrollHeight;
});

socket.on("cardOnTable", ({ card }) => {
  const img = document.createElement("img");
  img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
  img.classList.add("card");
  table.appendChild(img);
});

socket.on("finePlayCard", () => {
  canPlay = true;
  socket.emit("aggiornaDati", {playerCode: playerId});
});

socket.on("updateTable", () => {
  canPlay = false;
  socket.emit("aggiornaDati", {playerCode: playerId});
});

socket.on("chiamataFatta", () => {
  socket.emit("handshakeChiamata", {playerCode: playerId});
});

socket.on("lastRound", () => {
  socket.emit("prepareLastRound", {playerCode: playerId});
});

socket.on("chiamataBanco", data => {
  
  const valoreNegato = data.valoreNegato;
  if (valoreNegato != -1) {
    callInput.pattern = `[1-${valoreNegato - 1}${valoreNegato + 1}-9]`;
  }
});

socket.on("updateScores", (data) => {
  updateScoreTable(data.players, data.punteggi);
});

function updateScoreTable(players, punteggi) {
  const header = document.getElementById("tableHeader");
  const body = document.getElementById("tableBody");

  // 1. Pulizia
  header.innerHTML = "<th>Round</th>";
  body.innerHTML = "";

  // 2. Intestazione: Nomi dei giocatori
  players.forEach((p) => {
    const th = document.createElement("th");
    th.textContent = p.playerName;
    header.appendChild(th);
  });

  // 3. Calcoliamo quanti round sono stati fatti (lunghezza del primo array di punteggi)
  // Usiamo l'ID del primo giocatore per capire il numero di round
  const primoPlayerId = players[0].playerId;
  const numeroRound = punteggi[primoPlayerId]
    ? punteggi[primoPlayerId].length
    : 0;

  // 4. Creiamo le righe per ogni round
  for (let i = 0; i < numeroRound; i++) {
    const tr = document.createElement("tr");

    // Colonna Numero Round
    const tdIndex = document.createElement("td");
    tdIndex.textContent = i + 1;
    tr.appendChild(tdIndex);

    // Colonne Punteggi Giocatori
    players.forEach((p) => {
      const tdScore = document.createElement("td");
      // Accediamo all'i-esimo elemento dell'array di quel giocatore
      const score = punteggi[p.playerId][i];
      tdScore.textContent = score !== undefined ? score : "-";
      tr.appendChild(tdScore);
    });

    body.appendChild(tr);
  }

  // 5. RIGA TOTALI (Opzionale ma molto utile)
  const trTotale = document.createElement("tr");
  trTotale.style.background = "rgba(241, 196, 15, 0.2)"; // Evidenziato oro
  trTotale.innerHTML = "<td><strong>TOT</strong></td>";

  players.forEach((p) => {
    const tdTotal = document.createElement("td");
    const totale = punteggi[p.playerId].reduce((a, b) => a + b, 0);
    tdTotal.innerHTML = `<strong>${totale}</strong>`;
    trTotale.appendChild(tdTotal);
  });
  body.appendChild(trTotale);
}

socket.on("redirect_to_game_over", (data) => {
  // Salva i dati localmente o passali tramite session/query
  sessionStorage.setItem("finalResults", JSON.stringify(data));
  window.location.href = data.redirect; // Vai alla nuova pagina
});

socket.on("cardsLastRound", data => {

  const { playerData, gameState, players, carte } = data;
  // 1. Pulizia totale
  const container = document.querySelector(".game-container");
  // Rimuovi tutti i vecchi player tranne quello locale se preferisci,
  // ma resettare tutto è più sicuro:
  document.querySelectorAll(".player.opponent").forEach((el) => el.remove());
  myHand.innerHTML = "";
  table.innerHTML = "";

  // 2. CARTE SUL TAVOLO (Centro)
  gameState.cardsTable.forEach((card) => {
    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/${card.carta}.jpg`;
    img.classList.add("card");
    table.appendChild(img);
  });

  // 3. LE MIE CARTE (Sempre fisse in basso)
  //l'if è per togliere la carta coperta dalla mano dopo averla tirata
  if ( playerData.cardsHands.length != 0 ) {
    const card = { carta: "last", valore: "last" };
    const img = document.createElement("img");
    img.src = `/public/img/cards/Napoletane/bg.jpg`;
    img.classList.add("card");
    img.onclick = () => socket.emit("playCard", {
          card: card, 
          playerCode: playerData.idPlayer});
    myHand.appendChild(img);
  }
  

  // 4. POSIZIONAMENTO AVVERSARI A CERCHIO
  // Supponiamo che gameState.allPlayers sia la lista di tutti gli ID al tavolo
  const avversari = players.filter((player) => player.playerId !== playerId);
  const numAvversari = avversari.length;

  const raggio = 280; // Distanza dal centro tavolo
  const centerX = container.offsetWidth / 2;
  const centerY = container.offsetHeight / 2;

  avversari.forEach((advId, index) => {
    // Calcoliamo l'angolo: distribuiamo gli avversari nell'arco superiore (da 180° a 360°)
    // In questo modo nessuno si sovrappone a TE che sei a 90° (in basso)
    const startAngle = Math.PI; // Inizia da sinistra
    const endAngle = 2 * Math.PI; // Finisce a destra
    const angle =
      startAngle + (index * (endAngle - startAngle)) / (numAvversari - 1 || 1);

    const x = centerX + raggio * Math.cos(angle) - 50;
    const y = centerY + raggio * Math.sin(angle) - 50;

    // Crea il div dell'avversario
    const divOpp = document.createElement("div");
    divOpp.className = "player opponent";
    divOpp.style.left = `${x}px`;
    divOpp.style.top = `${y}px`;

    // Ruota il contenitore verso il centro
    const rotation = (angle * 180) / Math.PI - 270;
    divOpp.style.transform = `rotate(${rotation}deg)`;

    // Aggiungi le carte coperte dell'avversario oppure IN QUESTO CASO
    //ultimo giro scoperto
    const handDiv = document.createElement("div");
    carte.forEach((carta) => {
      if (carta.idPlayer === advId.playerId) {
        handDiv.className = "hand";

        const card = document.createElement("img");
        card.src = `/public/img/cards/Napoletane/${carta.carta}.jpg`;
        card.classList.add("card");
        handDiv.appendChild(card);
      }
    });

    // Etichetta col nome/ID
    const label = document.createElement("div");
    label.className = "label";
    label.innerText = `Giocatore ${index + 2}`;
    label.style.transform = `rotate(${-rotation}deg)`; // Raddrizza il testo

    divOpp.appendChild(handDiv);
    divOpp.appendChild(label);
    container.appendChild(divOpp);
  });
});

callBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const value = Number(callInput.value);
  socket.emit("callNumber", {
    valueCall: value, 
    playerCode: playerId
  });
});

window.onload = adjustLayout;
