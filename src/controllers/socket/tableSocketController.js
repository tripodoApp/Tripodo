const tripodo = require("D:\\Desktop\\Tripodo\\src\\utils\\tripodo.js");
let ioIstance;
let roomsIstance;
let turnTimer;
module.exports = (io, socket, rooms) => {

    ioIstance = io;
    roomsIstance = rooms;
    const tableReady = (playerCode) => {
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
  };

  const playCard = data => {
      
      const { card , playerCode } = data; 
  
      if (!card || !playerCode ) {
          return socket.emit("error", { 
              code: 500, 
              message: "Dati per la giocata mancanti" 
          });
      }
  
      const roomName = getGameRoomByPlayerId(playerCode, rooms);
  
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
      
      //clearTimeout(rooms[roomName].gameState.turnTimer);
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
          //io.to(roomName).emit("aggiornaTavolo", {carte: []});
  
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
            startTurn(playerRound.playerId, rooms[roomName], roomName, playerRound.socketId, false, -1);
  
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
            startTurn(player.playerId, rooms[roomName], roomName, player.socketId, false, -1);
          }
  
          if (rooms[roomName].gameState.isLastRound) {
            io.to(roomName).emit("lastRound");
            return;
          }
  
          if (tripodo.isPartitaFinita(rooms[roomName].gameState)) {
            const data = {
              players: rooms[roomName].players,
              punteggi: rooms[roomName].gameState.punteggi,
              redirect: "/gameOverComponent/game-over.html"
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

        //metto false perchè così dico che non è un giro di chiamata e -1 per far avviare il timeOut di una callNumber
        startTurn(player.playerId, rooms[roomName], roomName, player.socketId, false);
        io.to(roomName).emit("finePlayCard");
      }
    };

    const prepareLastRound = data => {

    const playerCode = data.playerCode;

    if (!playerCode ) {
        return socket.emit("error", { 
            code: 500, 
            message: "playerCode mancante" 
        });
    }

    const roomName = getGameRoomByPlayerId(playerCode, rooms);

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
  };
  
  const aggiornaDati = data => {

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

    if ( rooms[roomName].gameState.isLastCard ) {

        prepareLastRound({playerCode: playerCode});
        return;
    }

    const player = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );

    const payload = {
      playerData: player,
      gameState: rooms[roomName].gameState,
      players: rooms[roomName].players,
    }

    socket.emit( "initData", payload);
  };

  const callNumber = data => {
  
      const {valueCall, playerCode} = data
  
      if (valueCall === undefined || valueCall === null || valueCall === "" || !playerCode ) {
          return socket.emit("error", { 
              code: 500, 
              message: "dati chiamata mancanti" 
          });
      }
  
      const roomName = getGameRoomByPlayerId(playerCode, rooms);
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

      //CONTROLLO PER EVITARE CHE LA CHIAMATA SIA MAGGIORE AL NUMERO DELLE CARTE
      let cr = rooms[roomName].gameState.currentRound;
      if ( valueCall > cr ) {
        socketMessaggio(roomName, `Non puoi dire ${valueCall}`);
        return;
      }


      //clearTimeout(rooms[roomName].gameState.turnTimer);
  
      player.numeroChiamata = valueCall;
  
      let playerName = rooms[roomName].players.find(
        (player) => player.playerId === rooms[roomName].gameState.turnoAttualeId,
      );
  
      socketMessaggio(
        roomName,
        `${playerName.playerName} ha chiamato ${valueCall}`
      );
  
      tripodo.prossimoTurno(rooms[roomName]);
  
      playerName = rooms[roomName].players.find(
        (player) => player.playerId === rooms[roomName].gameState.turnoAttualeId,
      );
  
      socketMessaggio(roomName, `${playerName.playerName} e' il tuo turno`);
  
      //rooms[roomName].gameState.turnoAttualeId = turnoSuccessivo.idPlayer
      const playerTimeout = rooms[roomName].players.find(
          (p) => p.playerId === rooms[roomName].gameState.turnoAttualeId,
        );
      //CASO BANCO
      if (rooms[roomName].gameState.turnoAttualeId === rooms[roomName].gameState.bancoId ) {
        let counter = 0;
  
        rooms[roomName].playerState.forEach((player) => {
          counter += player.numeroChiamata;
        });
  
        let currentRound =
          rooms[roomName].gameState.currentRound >
          rooms[roomName].gameState.totalRound
            ? rooms[roomName].gameState.roundToDown
            : rooms[roomName].gameState.roundToUp;
  
        let valueValoreNegato = tripodo.getValoreNegatoBanco(counter, currentRound);
        rooms[roomName].gameState.valoreNegato = valueValoreNegato;
  
        let bancoId = rooms[roomName].gameState.bancoId;
        const socketBanco = Object.values(rooms[roomName].players).find(
          (p) => p.playerId === bancoId,
        );
        startTurn(playerTimeout.playerId, rooms[roomName], roomName, playerTimeout.socketId, true, valueValoreNegato)
        io.to(socketBanco.socketId).emit("chiamataBanco", {valoreNegato: valueValoreNegato});
  
        //io.to(roomName).emit("chiamataFatta");
      } else if (player.idPlayer === rooms[roomName].gameState.bancoId) {
        rooms[roomName].gameState.giroChiamata = false;
        //Questo turno dovrebbe far startare il timer per la prima carta della mano post chiamata
        startTurn(playerTimeout.playerId, rooms[roomName], roomName, playerTimeout.socketId, true, -1)
        //io.to(roomName).emit("chiamataFatta");
      } else {
        //io.to(roomName).emit("chiamataFatta");
        startTurn(playerTimeout.playerId, rooms[roomName], roomName, playerTimeout.socketId, true)
      }
  
      //Aggiorno ultima chiamata e turno
    };

    const initGame = () => {
        const roomId = getGameRoom(socket);
        const playersCount = rooms[roomId].players.length;
    
        rooms[roomName].players.forEach((playerSocketId, index) => {
          rooms[roomName].gameState[playerSocketId] = tripodo.initPlayer(
            playerSocketId,
            playersCount,
          );
        });
    };

  socket.on("tableReady", tableReady);
  socket.on("playCard", playCard);
  socket.on("callNumber", callNumber);
  socket.on("initGame", initGame);
  socket.on("prepareLastRound", prepareLastRound);
  socket.on("aggiornaDati", aggiornaDati);
  }

function getGameRoom(socket) {
  return [...socket.rooms].find((room) => room !== socket.id);
}

function getGameRoomByPlayerId(playerCode, rooms) {
  return Object.keys(rooms).find((room) =>
    rooms[room].players.some((p) => p.playerId === playerCode),
  );
}
  function socketMessaggio(roomName, messaggio) {
    ioIstance.to(roomName).emit("gameLog", {messaggio: messaggio});
  }

  function startTurn(playerId, room, roomName, socketId, boolean, valoreNegato) {
    // 1. Avvisa tutti che è iniziato il turno e il tempo è 30s
    
    const player = Object.values(room.players).find(
        (p) => p.playerId === playerId,
      );
    socketMessaggio(roomName, "Il giocatore" + " " + player.playerName + " " + "ha 30 secondi")

    // 2. Cancella eventuali timer precedenti per sicurezza
    clearTimeout(turnTimer);

    if ( boolean ) {
      // 3. Fissa la "scadenza" a 30 secondi
      turnTimer = setTimeout(() => {
        handleTimeoutCall(playerId, socketId, valoreNegato);
      }, 5000); 
    } else {
      // 3. Fissa la "scadenza" a 30 secondi
      turnTimer = setTimeout(() => {
        handleTimeout(playerId,socketId, valoreNegato);
      }, 5000); 
    }
    
}

function handleTimeoutCall(playerId, socketId, valoreNegato) {
  
  let roomName = getGameRoomByPlayerId(playerId, roomsIstance);
  let room = roomsIstance[roomName];

  let currentRoundHand = room.gameState.currentRoundHand;

  if ( valoreNegato && valoreNegato != -1 ) {


    ioIstance.to(socketId).emit("playCallNumberHandshake", {valueCall: generaRandomEscludendo(currentRoundHand, valoreNegato),
                                                    playerCode:playerId
    });
  } else if ( valoreNegato === -1 ) {

    const player = room.playerState.find(p => p.idPlayer === playerId);
    const carta = player.cardsHands[0];
    ioIstance.to(socketId).emit("playCardHandShake", {card: carta, playerCode : playerId});

  } else {

     ioIstance.to(socketId).emit("playCallNumberHandshake", {valueCall: generaRandomEscludendo(currentRoundHand),
                                                    playerCode:playerId
    });
  }
}

function generaRandomEscludendo(max, daEscludere) {
    let numeroRandom;
    
    do {
        // Genera un intero tra 0 e max (incluso)
        numeroRandom = Math.floor(Math.random() * (max + 1));
    } while (numeroRandom === daEscludere);
    
    return numeroRandom;
}


function handleTimeout(playerId, socketId, valoreNegato) {
  
  let roomName = getGameRoomByPlayerId(playerId, roomsIstance);
  let room = roomsIstance[roomName];

  if (valoreNegato === -1 ) {
    let currentRoundHand = room.gameState.currentRoundHand;
    ioIstance.to(socketId).emit("playCallNumberHandshake", {valueCall: generaRandomEscludendo(currentRoundHand),
                                                    playerCode:playerId
    });
    
  } else {

    const player = room.playerState.find(p => p.idPlayer === playerId);
    const carta = player.cardsHands[0];
    ioIstance.to(socketId).emit("playCardHandShake", {card: carta, playerCode : playerId});
  }
}

// function playCardLogic(room, roomName, card, playerId) {


// }