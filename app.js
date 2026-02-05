const express = require("express");
const app = express();
const tripodo = require("./src/utils/tripodo");
const homeSocketController = require("./src/controllers/socket/homeSocketController");

const md5 = require("crypto-md5");

const http = require("http").Server(app);

var path = require("path");

var io = require("socket.io")(http);

app.use(express.static(path.join(__dirname, "")));

app.get("/", (req, res) => {
  res.sendFile("./public/homeComponent/home.html", {
    root: path.join(__dirname),
  });
});

const rooms = {}; // { roomName: { host: socket.id, players: [username], sockets: [socket.id] } }

io.on("connection", (socket) => {
  console.log("Nuovo client:", socket.id);

    homeSocketController(io, socket, rooms);
  
  socket.on("tableReady", (playerCode) => {
    const roomName = Object.keys(rooms).find((room) =>
      rooms[room].players.some((p) => p.playerId === playerCode),
    );

    if (!roomName) return;

    const player = rooms[roomName].players.find(
      (p) => p.playerId === playerCode,
    );
    player.socketId = socket.id;
    socket.join(roomName);

    const playerData = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );
    const gameState = rooms[roomName].gameState;

    socket.userId = playerCode;

    const payload = {
      playerData : playerData, 
      gameState: gameState, 
      players: rooms[roomName].players
    }
    socket.emit("initData", payload);
  });


  socket.on("playCard", data => {
    
    const { card, playerCode } = data; 

    if (!card || !playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "Dati per la giocata mancanti" 
        });
    }

    const roomName = getGameRoomByPlayerId(playerCode);

    const player = Object.values(rooms[roomName].playerState).find(
      (p) => p.idPlayer === playerCode,
    );

    const isChiamata = rooms[roomName].gameState.giroChiamata;

    if (rooms[roomName].gameState.turnoAttualeId != playerCode || isChiamata) {
      return;
    }

    //TROVA CARTA
    let valueCard = card.valore;
    let findCard = player.cardsHands.find((p) => p.valore === valueCard);

    if (!findCard && valueCard != "last") {
      return;
    } else if (
      /*!findCard && rooms[roomName].gameState.isLastRound == true &&*/ card.valore ===
        "last" &&
      card.carta === "last"
    ) {
      const player = rooms[roomName].playerState.find(
        (p) => p.idPlayer === playerCode,
      );
      findCard = player.cardsHands[0];
    }

    //Aggiungo la carta al tavolo
    rooms[roomName].gameState.cardsTable.push(findCard);

    //Tolgo la carta dal giocatore
    player.cardsHands = player.cardsHands.filter((c) => c !== findCard);

    //io.to(roomName).emit("aggiornaTavolo", rooms[roomName].gameState.cardsTable);
    io.to(roomName).emit("updateTable");

    // Tutti hanno giocato
    if ( rooms[roomName].gameState.cardsTable.length === rooms[roomName].playerState.length ) {
      //Calcolo presa
      const cartaMassima = tripodo.calcoloMassimoTurno(
        rooms[roomName].gameState.cardsTable,
      );
      const playerPresa = rooms[roomName].players.find(
        (p) => p.playerId === cartaMassima.idPlayer,
      );

      //TIMEOUT
      setTimeout(() => {
        tripodo.setPresa(cartaMassima.idPlayer, rooms[roomName].playerState);
        socketMessaggio(roomName, `${playerPresa.playerName} ha preso la mano`);

        // Svuto il tavolo
        rooms[roomName].gameState.cardsTable.length = 0;
        // Mando al client il tavolo
        io.to(roomName).emit("aggiornaTavolo", {carte: []});

        // Controllo se fine round o fine mano
        let currentRound =
          rooms[roomName].gameState.currentRound >
          rooms[roomName].gameState.totalRound
            ? rooms[roomName].gameState.roundToDown
            : rooms[roomName].gameState.roundToUp;

        //FINE ROUND
        if (currentRound === rooms[roomName].gameState.currentRoundHand) {
          rooms[roomName].gameState.currentRoundHand = 1;
          tripodo.fineRound(rooms[roomName]);
          const playerRound = rooms[roomName].players.find(
            (player) =>
              player.playerId === rooms[roomName].gameState.turnoAttualeId,
          );
          socketMessaggio(roomName, `${playerRound.playerName} deve chiamare`);

          //Aggiorno punteggio nella tabella
          const payloadUpdate = {
            players: rooms[roomName].players,
            punteggi: rooms[roomName].gameState.punteggi,
          }
          io.to(roomName).emit("updateScores", payloadUpdate);

        } else {
          // PROSSIMA MANO
          rooms[roomName].gameState.currentRoundHand += 1;
          rooms[roomName].gameState.ultimaPresa = cartaMassima.idPlayer;
          tripodo.setTurnoPostPresa(cartaMassima.idPlayer, rooms[roomName]);
          const player = rooms[roomName].players.find(
            (p) => p.playerId === rooms[roomName].gameState.turnoAttualeId,
          );
          socketMessaggio(roomName, `Tocca a ${player.playerName}`);
        }

        if (rooms[roomName].gameState.isLastRound) {
          io.to(roomName).emit("lastRound");
          return;
        }

        if (tripodo.isPartitaFinita(rooms[roomName].gameState)) {
          const data = {
            players: rooms[roomName].players,
            punteggi: rooms[roomName].gameState.punteggi,
          };

          io.to(roomName).emit("redirect_to_game_over", data);
        }
        //FINE PLAY CARD
        io.to(roomName).emit("finePlayCard");
      }, 3000);
    } else {
      //La mano non è finita, tocca al giocatore successivo
      tripodo.prossimoTurno(rooms[roomName]);
      const player = rooms[roomName].players.find(
        (p) => p.playerId === rooms[roomName].gameState.turnoAttualeId,
      );
      socketMessaggio(roomName, `Tocca a ${player.playerName}`);
      io.to(roomName).emit("finePlayCard");
    }
  });

  socket.on("prepareLastRound", data => {

    const playerCode = data.playerCode;

    if (!playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "playerCode mancante" 
        });
    }

    const roomName = getGameRoomByPlayerId(playerCode);

    rooms[roomName].gameState.isLastRound = false;

    const player = Object.values(rooms[roomName].playerState).find(
      (p) => p.idPlayer === playerCode,
    );

    const carteGiocatori = [];

    rooms[roomName].playerState.forEach((player) => {
      if (player.idPlayer != playerCode) {
        carteGiocatori.push(player.cardsHands[0]);
      }
    });

    const payload = {
      playerData: player,
      gameState: rooms[roomName].gameState,
      players: rooms[roomName].players,
      carte: carteGiocatori,
    }

    socket.emit(
      "cardsLastRound", payload);
  });

  socket.on("aggiornaDati", data => {

    const playerCode = data.playerCode;

     if (!playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "playerCode non esistente" 
        });
    }

    const roomName = Object.keys(rooms).find((room) =>
      rooms[room].players.some((p) => p.playerId === playerCode),
    );

    if (!roomName) return;

    const player = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );

    const payload = {
      playerData: player,
      gameState: rooms[roomName].gameState,
      players: rooms[roomName].players,
    }

    socket.emit( "initData", payload);
  });

  socket.on("handshakeChiamata", data => {

    const playerCode = data.playerCode;
    if (!playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "playerCode non esistente" 
        });
    }

    const roomName = Object.keys(rooms).find((room) =>
      rooms[room].players.some((p) => p.playerId === playerCode),
    );

    if (!roomName) return;

    const player = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );

    // const payload = {
    //   player: player, 
    //   gameState: rooms[roomName].gameState
    // }
    socket.emit("fineHandshakeChiamata", player, rooms[roomName].gameState);
  });

  socket.on("callNumber", data => {

    const {valueCall, playerCode} = data

    if (valueCall === undefined || valueCall === null || valueCall === "" || !playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "dati chiamata mancanti" 
        });
    }

    const roomName = getGameRoomByPlayerId(playerCode);
    const player = Object.values(rooms[roomName].playerState).find(
      (p) => p.idPlayer === playerCode,
    );

    const idTurnoAttuale = rooms[roomName].gameState.turnoAttualeId;

    if (
      idTurnoAttuale !== playerCode ||
      !rooms[roomName].gameState.giroChiamata
    ) {
      return;
    }

    if (player.idPlayer === rooms[roomName].gameState.bancoId) {
      if (valueCall === rooms[roomName].gameState.valoreNegato) {
        socketMessaggio(roomName, `Non puoi dire ${valueCall}`);
        return;
      }
    }

    player.numeroChiamata = valueCall;

    let playerName = rooms[roomName].players.find(
      (player) => player.playerId === rooms[roomName].gameState.turnoAttualeId,
    );

    socketMessaggio(
      roomName,
      `${playerName.playerName} ha chiamato ${valueCall}`,
    );

    tripodo.prossimoTurno(rooms[roomName]);

    playerName = rooms[roomName].players.find(
      (player) => player.playerId === rooms[roomName].gameState.turnoAttualeId,
    );

    socketMessaggio(roomName, `${playerName.playerName} e' il tuo turno`);

    //rooms[roomName].gameState.turnoAttualeId = turnoSuccessivo.idPlayer

    //CASO BANCO
    if (
      rooms[roomName].gameState.turnoAttualeId ===
      rooms[roomName].gameState.bancoId
    ) {
      let counter = 0;

      rooms[roomName].playerState.forEach((player) => {
        counter += player.numeroChiamata;
      });

      let currentRound =
        rooms[roomName].gameState.currentRound >
        rooms[roomName].gameState.totalRound
          ? rooms[roomName].gameState.roundToDown
          : rooms[roomName].gameState.roundToUp;

      let valueValoreNegato = getValoreNegatoBanco(counter, currentRound);
      rooms[roomName].gameState.valoreNegato = valueValoreNegato;

      let bancoId = rooms[roomName].gameState.bancoId;
      const socketBanco = Object.values(rooms[roomName].players).find(
        (p) => p.playerId === bancoId,
      );

      io.to(socketBanco.socketId).emit("chiamataBanco", {valoreNegato: valueValoreNegato});

      //io.to(roomName).emit("chiamataFatta");
    } else if (player.idPlayer === rooms[roomName].gameState.bancoId) {
      rooms[roomName].gameState.giroChiamata = false;
      //io.to(roomName).emit("chiamataFatta");
    } else {
      //io.to(roomName).emit("chiamataFatta");
    }

    //Aggiorno ultima chiamata e turno
  });

  function setGiocatoreSuccessivo(roomName, playerId) {
    let indiceGiocatoreSuccessivo = getGiocatoreSuccessivo(
      player,
      playersCount,
    );
    const turnoSuccessivo = Object.values(rooms[roomName].playerState).find(
      (elemento) => elemento.index === indiceGiocatoreSuccessivo,
    );

    turnoSuccessivo.myTurn = true;

    rooms[roomName].gameState.turnoAttualeId = turnoSuccessivo.idPlayer;
  }

  function getValoreNegatoBanco(counter, currentRound) {
    if (counter == currentRound) {
      return 0;
    } else if (counter > currentRound) {
      return -1;
    } else if (counter < currentRound) {
      return currentRound - counter;
    }
  }

  function socketMessaggio(roomName, messaggio) {
    io.to(roomName).emit("gameLog", {messaggio: messaggio});
  }

  //INIZIO GIOCO

  socket.on("initGame", () => {
    const roomId = getGameRoom(socket);
    const playersCount = rooms[roomId].players.length;

    rooms[roomName].players.forEach((playerSocketId, index) => {
      rooms[roomName].gameState[playerSocketId] = tripodo.initPlayer(
        playerSocketId,
        playersCount,
      );
    });
  });
});

function getGameRoom(socket) {
  return [...socket.rooms].find((room) => room !== socket.id);
}

function getGameRoomByPlayerId(playerCode) {
  return Object.keys(rooms).find((room) =>
    rooms[room].players.some((p) => p.playerId === playerCode),
  );
}

function getGiocatoreSuccessivo(playerAttuale, numberOfPlayer) {
  let indicePlayerAttuale = playerAttuale.index;
  let indicePlayerSuccessivo;

  if (indicePlayerAttuale + 1 == numberOfPlayer) {
    indicePlayerSuccessivo = 0;
  } else {
    indicePlayerSuccessivo = indicePlayerAttuale + 1;
  }

  return indicePlayerSuccessivo;
}

// Cerca la porta che ti assegna Render, se non la trova usa la 3000
const PORT = process.env.PORT || 3000;

// Ascolta sulla porta corretta e sull'host 0.0.0.0
http.listen(PORT, "0.0.0.0", function () {
  console.log("Server in esecuzione sulla porta: " + PORT);
});

/*
QUESTO é OK, quello orignale. COMMENTO PER PROVA RenDER
http.listen(3000, function() {
    console.log("Server su 3000")
})*/