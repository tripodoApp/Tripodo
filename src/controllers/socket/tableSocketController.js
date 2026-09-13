const tripodo = require("../../utils/tripodo.js");
let ioIstance;
let roomsIstance;

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
    player.ready = true; // Marca questo giocatore come pronto
    socket.join(roomName);

    const playerData = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );
    const gameState = rooms[roomName].gameState;

    socket.userId = playerCode;
    socket.roomName = roomName;

    // Se c'era un timer di cancellazione stanza pendente, annullalo subito
    if (rooms[roomName].emptyRoomTimer) {
      clearTimeout(rooms[roomName].emptyRoomTimer);
      rooms[roomName].emptyRoomTimer = null;
      console.log(`[Stanza ${roomName}] Giocatore ${player.playerName} ricollegato: cancellazione stanza annullata.`);
    }

    // Se la partita è già iniziata (es. refresh o riconnessione), manda subito initData e punteggi al singolo giocatore
    if (rooms[roomName].gameStarted) {
      if (playerData) {
        socket.emit("initData", {
          playerData: playerData,
          gameState: rooms[roomName].gameState,
          players: rooms[roomName].players,
          playersSummary: buildPlayersSummary(rooms[roomName])
        });

        if (rooms[roomName].gameState && rooms[roomName].gameState.punteggi) {
          socket.emit("updateScores", {
            players: rooms[roomName].players,
            punteggi: rooms[roomName].gameState.punteggi
          });
        }

        // Se è il turno di chiamata del Banco, rimanda il valoreNegato
        if (gameState.giroChiamata && gameState.turnoAttualeId === playerCode && gameState.bancoId === playerCode) {
          if (gameState.valoreNegato !== undefined && gameState.valoreNegato !== null) {
            socket.emit("chiamataBanco", { valoreNegato: gameState.valoreNegato });
          }
        }
      }
      socketMessaggio(roomName, `${player.playerName} si è riconnesso`);
      return;
    }

    // Altrimenti, avvia il timer e manda i dati solo quando TUTTI i giocatori sono pronti
    const allReady = rooms[roomName].players.every(p => p.ready);
    if (allReady && !rooms[roomName].gameStarted) {
      rooms[roomName].gameStarted = true;

      // Manda initData personalizzato a ciascun giocatore
      sendInitDataToAll(roomName);

      const playerTurnoAttuale = rooms[roomName].players.find(
        p => p.playerId === gameState.turnoAttualeId
      );
      if (playerTurnoAttuale) {
        startTurn(playerTurnoAttuale.playerId, rooms[roomName], roomName);
      }
    }
  };

  const playCard = data => {
    const { card, playerCode } = data;

    if (!card || !playerCode) {
      return socket.emit("error", {
        code: 500,
        message: "Dati per la giocata mancanti"
      });
    }

    const roomName = getGameRoomByPlayerId(playerCode, rooms);
    if (!roomName) return;

    processPlayCard(playerCode, card, roomName);
  };

  const callNumber = data => {
    const { valueCall, playerCode } = data;

    if (valueCall === undefined || valueCall === null || valueCall === "" || !playerCode) {
      return socket.emit("error", {
        code: 500,
        message: "dati chiamata mancanti"
      });
    }

    const roomName = getGameRoomByPlayerId(playerCode, rooms);
    if (!roomName) return;

    processCallNumber(playerCode, Number(valueCall), roomName);
  };

  const prepareLastRound = data => {
    const playerCode = data.playerCode;

    if (!playerCode) {
      return socket.emit("error", {
        code: 500,
        message: "playerCode mancante"
      });
    }

    const roomName = getGameRoomByPlayerId(playerCode, rooms);
    if (!roomName) return;

    rooms[roomName].gameState.isLastRound = false;

    const player = Object.values(rooms[roomName].playerState).find(
      (p) => p.idPlayer === playerCode,
    );

    const carteGiocatori = [];
    rooms[roomName].playerState.forEach((p) => {
      if (p.idPlayer !== playerCode) {
        carteGiocatori.push(p.cardsHands[0]);
      }
    });

    const payload = {
      playerData: player,
      gameState: rooms[roomName].gameState,
      players: rooms[roomName].players,
      carte: carteGiocatori,
      playersSummary: buildPlayersSummary(rooms[roomName]),
    };

    socket.emit("cardsLastRound", payload);
  };

  const aggiornaDati = data => {
    const playerCode = data.playerCode;

    if (!playerCode) {
      return socket.emit("error", {
        code: 500,
        message: "playerCode non esistente"
      });
    }

    const roomName = Object.keys(rooms).find((room) =>
      rooms[room].players.some((p) => p.playerId === playerCode),
    );

    if (!roomName) return;

    if (rooms[roomName].gameState.isLastCard) {
      prepareLastRound({ playerCode: playerCode });
      return;
    }

    const player = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );

    const payload = {
      playerData: player,
      gameState: rooms[roomName].gameState,
      players: rooms[roomName].players,
      playersSummary: buildPlayersSummary(rooms[roomName]),
    };

    socket.emit("initData", payload);
  };

  const initGame = () => {
    const roomId = getGameRoom(socket);
    if (!rooms[roomId]) return;
    const playersCount = rooms[roomId].players.length;

    rooms[roomId].players.forEach((playerSocketId, index) => {
      rooms[roomId].gameState[playerSocketId] = tripodo.initPlayer(
        playerSocketId,
        playersCount,
      );
    });
  };

  const disconnectTable = () => {
    const playerCode = socket.userId;
    const roomName = socket.roomName || getGameRoomByPlayerId(playerCode, rooms);
    if (!roomName || !rooms[roomName]) return;

    const room = rooms[roomName];
    const player = room.players.find(p => p.playerId === playerCode);
    const playerName = player ? player.playerName : "Un giocatore";

    console.log(`[Tavolo ${roomName}] ${playerName} (${socket.id}) disconnesso dal tavolo.`);

    // Calcoliamo i giocatori che hanno ancora un socket vivo (escludendo questo socket)
    const connectedCount = room.players.filter(p => {
      if (!p.socketId || p.socketId === socket.id) return false;
      return io.sockets.sockets.has(p.socketId);
    }).length;

    if (connectedCount === 0) {
      console.log(`[Tavolo ${roomName}] Tutti i giocatori sono disconnessi. Timer di 60 secondi avviato per cancellazione stanza.`);
      if (room.emptyRoomTimer) clearTimeout(room.emptyRoomTimer);
      room.emptyRoomTimer = setTimeout(() => {
        const stillConnected = room.players.some(p => p.socketId && io.sockets.sockets.has(p.socketId));
        if (!stillConnected) {
          if (room.turnTimer) clearTimeout(room.turnTimer);
          delete rooms[roomName];
          console.log(`[Tavolo ${roomName}] Stanza eliminata definitivamente per inattività totale (60s).`);
        } else {
          room.emptyRoomTimer = null;
        }
      }, 60000);
    } else {
      socketMessaggio(roomName, `${playerName} si è disconnesso`);
    }
  };

  const leaveGameFinal = (data) => {
    const playerCode = (data && data.playerId) || socket.userId;
    const roomName = getGameRoomByPlayerId(playerCode, rooms);
    if (!roomName || !rooms[roomName]) return;

    const room = rooms[roomName];
    if (room.turnTimer) clearTimeout(room.turnTimer);
    if (room.emptyRoomTimer) clearTimeout(room.emptyRoomTimer);
    delete rooms[roomName];
    console.log(`[Stanza ${roomName}] Partita conclusa. Stanza eliminata su leave_game_final.`);
  };

  socket.on("tableReady", tableReady);
  socket.on("playCard", playCard);
  socket.on("callNumber", callNumber);
  socket.on("initGame", initGame);
  socket.on("prepareLastRound", prepareLastRound);
  socket.on("aggiornaDati", aggiornaDati);
  socket.on("disconnect", disconnectTable);
  socket.on("leave_game_final", leaveGameFinal);
};

// ==========================================================================
// FUNZIONI DI GIOCO CONDIVISE (SERVER-SIDE)
// ==========================================================================

function getGameRoom(socket) {
  return [...socket.rooms].find((room) => room !== socket.id);
}

function getGameRoomByPlayerId(playerCode, rooms) {
  return Object.keys(rooms).find((room) =>
    rooms[room].players.some((p) => p.playerId === playerCode),
  );
}

function socketMessaggio(roomName, messaggio) {
  if (ioIstance) {
    ioIstance.to(roomName).emit("gameLog", { messaggio: messaggio });
  }
}

// Costruisce il riepilogo pubblico di tutti i giocatori (prese e chiamate sincronizzate)
function buildPlayersSummary(room) {
  if (!room || !room.players) return [];
  return room.players.map(p => {
    const pState = (room.playerState || []).find(ps => ps.idPlayer === p.playerId);
    return {
      playerId: p.playerId,
      playerName: p.playerName,
      numeroPrese: pState ? (pState.numeroPrese || 0) : 0,
      numeroChiamata: (pState && pState.haChiamato) ? pState.numeroChiamata : "-",
      haChiamato: pState ? !!pState.haChiamato : false,
      cardCount: (pState && pState.cardsHands) ? pState.cardsHands.length : 0
    };
  });
}

// Invia a ogni client nella stanza il proprio payload initData aggiornato
function sendInitDataToAll(roomName) {
  const room = roomsIstance[roomName];
  if (!room || !ioIstance) return;

  const summary = buildPlayersSummary(room);

  room.players.forEach(p => {
    const pData = room.playerState.find(ps => ps.idPlayer === p.playerId);
    if (pData && p.socketId) {
      ioIstance.to(p.socketId).emit("initData", {
        playerData: pData,
        gameState: room.gameState,
        players: room.players,
        playersSummary: summary
      });
    }
  });
}

// Avvia il timer di 30 secondi per il giocatore di turno
function startTurn(playerId, room, roomName) {
  const player = Object.values(room.players).find(
    (p) => p.playerId === playerId,
  );
  if (!player) return;

  socketMessaggio(roomName, `Il giocatore ${player.playerName} ha 30 secondi`);

  if (ioIstance) {
    ioIstance.to(roomName).emit("turnTimerStarted", { activePlayerId: playerId, duration: 30000 });
  }

  if (roomsIstance[roomName]) {
    clearTimeout(roomsIstance[roomName].turnTimer);
    roomsIstance[roomName].turnTimer = setTimeout(() => {
      handleTurnTimeout(playerId, roomName);
    }, 30000);
  }
}

// Gestore scadenza 30 secondi: esecuzione DIRETTA lato server (senza dipendere dal browser)
function handleTurnTimeout(playerId, roomName) {
  const room = roomsIstance[roomName];
  if (!room || !room.gameState) return;

  // Verifica che sia ancora il turno di questo giocatore
  if (room.gameState.turnoAttualeId !== playerId) return;

  const player = room.playerState.find(p => p.idPlayer === playerId);
  const playerInfo = room.players.find(p => p.playerId === playerId);
  const playerName = playerInfo ? playerInfo.playerName : "Giocatore";

  if (room.gameState.giroChiamata) {
    // FASE CHIAMATA: calcola max consentito in base alle carte in mano
    const maxCall = (player && player.cardsHands) ? player.cardsHands.length : 1;
    let callVal;

    const isBanco = (playerId === room.gameState.bancoId);
    const valoreNegato = isBanco ? room.gameState.valoreNegato : null;

    if (valoreNegato !== undefined && valoreNegato !== null && valoreNegato !== -1) {
      callVal = generaRandomEscludendo(maxCall, valoreNegato);
    } else {
      callVal = Math.floor(Math.random() * (maxCall + 1));
    }

    socketMessaggio(roomName, `Tempo scaduto! ${playerName} chiama automaticamente ${callVal}`);
    processCallNumber(playerId, callVal, roomName);
  } else {
    // FASE CARTA: cala la prima carta valida
    if (!player || !player.cardsHands || player.cardsHands.length === 0) return;

    let cardToPlay;
    if (room.gameState.isLastCard || room.gameState.isLastRound) {
      cardToPlay = { carta: "last", valore: "last" };
    } else {
      cardToPlay = player.cardsHands[0];
    }

    socketMessaggio(roomName, `Tempo scaduto! ${playerName} gioca automaticamente una carta`);
    processPlayCard(playerId, cardToPlay, roomName);
  }
}

function generaRandomEscludendo(max, daEscludere) {
  let numeroRandom;
  let attempts = 0;
  do {
    numeroRandom = Math.floor(Math.random() * (max + 1));
    attempts++;
    if (attempts > 50) {
      return (daEscludere === 0 && max > 0) ? 1 : 0;
    }
  } while (numeroRandom === daEscludere);

  return numeroRandom;
}

// Logica di chiamata (usata sia dal click utente sia dal timeout automatico)
function processCallNumber(playerCode, valueCall, roomName) {
  const room = roomsIstance[roomName];
  if (!room || !room.gameState) return;

  const player = room.playerState.find(p => p.idPlayer === playerCode);
  if (!player) return;

  if (room.gameState.turnoAttualeId !== playerCode || !room.gameState.giroChiamata) {
    return;
  }

  // Verifica valore negato per il banco
  if (player.idPlayer === room.gameState.bancoId) {
    if (valueCall === room.gameState.valoreNegato) {
      socketMessaggio(roomName, `Non puoi dire ${valueCall}`);
      return;
    }
  }

  // Verifica limite chiamate (non superiore alle carte in mano)
  const maxAllowed = player.cardsHands ? player.cardsHands.length : room.gameState.currentRound;
  if (valueCall > maxAllowed) {
    socketMessaggio(roomName, `Non puoi chiamare ${valueCall}`);
    return;
  }

  player.numeroChiamata = valueCall;
  player.haChiamato = true;

  const currentPl = room.players.find(p => p.playerId === playerCode);
  socketMessaggio(roomName, `${currentPl ? currentPl.playerName : 'Giocatore'} ha chiamato ${valueCall}`);

  // Prossimo turno
  tripodo.prossimoTurno(room);

  const nextPl = room.players.find(p => p.playerId === room.gameState.turnoAttualeId);
  socketMessaggio(roomName, `${nextPl ? nextPl.playerName : 'Giocatore'} e' il tuo turno`);

  // Caso: il prossimo è il banco
  if (room.gameState.turnoAttualeId === room.gameState.bancoId) {
    let counter = 0;
    room.playerState.forEach(p => {
      counter += p.numeroChiamata;
    });

    let currentRound =
      room.gameState.currentRound > room.gameState.totalRound
        ? room.gameState.roundToDown
        : room.gameState.roundToUp;

    let valueValoreNegato = tripodo.getValoreNegatoBanco(counter, currentRound);
    room.gameState.valoreNegato = valueValoreNegato;

    const socketBanco = room.players.find(p => p.playerId === room.gameState.bancoId);
    if (socketBanco && socketBanco.socketId) {
      ioIstance.to(socketBanco.socketId).emit("chiamataBanco", { valoreNegato: valueValoreNegato });
    }

    startTurn(nextPl.playerId, room, roomName);
  }
  // Caso: chi ha appena chiamato era il banco -> CHIUDE IL GIRO CHIAMATA!
  else if (player.idPlayer === room.gameState.bancoId) {
    room.gameState.giroChiamata = false;
    room.gameState.valoreNegato = null;
    socketMessaggio(roomName, `Chiamate concluse! Inizia la mano.`);
    startTurn(nextPl.playerId, room, roomName);
  }
  // Caso: chiamata normale
  else {
    startTurn(nextPl.playerId, room, roomName);
  }

  // Sincronizza tutti i giocatori
  sendInitDataToAll(roomName);
}

// Logica di gioco carta (usata sia dal click utente sia dal timeout automatico)
function processPlayCard(playerCode, card, roomName) {
  const room = roomsIstance[roomName];
  if (!room || !room.gameState) return;

  const player = room.playerState.find(p => p.idPlayer === playerCode);
  if (!player) return;

  if (room.gameState.turnoAttualeId !== playerCode || room.gameState.giroChiamata) {
    return;
  }

  // Trova la carta da giocare
  let valueCard = card.valore;
  let findCard = player.cardsHands.find(p => p.valore === valueCard);

  if (!findCard && valueCard !== "last") {
    return;
  } else if (card.valore === "last" && card.carta === "last") {
    findCard = player.cardsHands[0];
  }

  if (!findCard) return;

  // Aggiunge carta al tavolo
  room.gameState.cardsTable.push(findCard);

  // Rimuove la carta dalla mano del giocatore
  player.cardsHands = player.cardsHands.filter(c => c !== findCard);

  // Notifica aggiornamento carte a tutti
  ioIstance.to(roomName).emit("updateTable");

  // Se tutti hanno giocato la carta
  if (room.gameState.cardsTable.length === room.playerState.length) {
    // Calcolo presa
    const cartaMassima = tripodo.calcoloMassimoTurno(room.gameState.cardsTable);
    const playerPresa = room.players.find(p => p.playerId === cartaMassima.idPlayer);

    // Assegna subito la presa e sincronizza così tutti vedono il contatore aggiornarsi in diretta durante la pausa
    tripodo.setPresa(cartaMassima.idPlayer, room.playerState);
    socketMessaggio(roomName, `${playerPresa.playerName} ha preso la mano`);
    sendInitDataToAll(roomName);

    setTimeout(() => {
      // Svuota tavolo
      room.gameState.cardsTable = [];

      let currentRound =
        room.gameState.currentRound > room.gameState.totalRound
          ? room.gameState.roundToDown
          : room.gameState.roundToUp;

      // FINE ROUND
      if (currentRound === room.gameState.currentRoundHand) {
        room.gameState.currentRoundHand = 1;
        tripodo.fineRound(room);
        room.gameState.valoreNegato = null;
        room.playerState.forEach(p => {
          p.haChiamato = false;
        });
        const playerRound = room.players.find(
          p => p.playerId === room.gameState.turnoAttualeId
        );
        socketMessaggio(roomName, `Fine Round! Calcolo punteggi completato.`);
        socketMessaggio(roomName, `${playerRound.playerName} deve chiamare per il Round ${room.gameState.currentRound}`);
        startTurn(playerRound.playerId, room, roomName);

        // Aggiorna punteggi
        const payloadUpdate = {
          players: room.players,
          punteggi: room.gameState.punteggi,
        };
        ioIstance.to(roomName).emit("updateScores", payloadUpdate);
      } else {
        // PROSSIMA MANO NEL ROUND
        room.gameState.currentRoundHand += 1;
        room.gameState.ultimaPresa = cartaMassima.idPlayer;
        tripodo.setTurnoPostPresa(cartaMassima.idPlayer, room);
        const nextPlayer = room.players.find(
          p => p.playerId === room.gameState.turnoAttualeId
        );
        socketMessaggio(roomName, `Tocca a ${nextPlayer.playerName}`);
        startTurn(nextPlayer.playerId, room, roomName);
      }

      if (room.gameState.isLastRound) {
        ioIstance.to(roomName).emit("lastRound");
        return;
      }

      if (tripodo.isPartitaFinita(room.gameState)) {
        const data = {
          players: room.players,
          punteggi: room.gameState.punteggi,
          redirect: "/gameOverComponent/game-over.html"
        };
        ioIstance.to(roomName).emit("redirect_to_game_over", data);
        return;
      }

      ioIstance.to(roomName).emit("finePlayCard");
      sendInitDataToAll(roomName);
    }, 3000);
  } else {
    // La mano continua: tocca al giocatore successivo
    tripodo.prossimoTurno(room);
    const nextPlayer = room.players.find(
      p => p.playerId === room.gameState.turnoAttualeId
    );
    socketMessaggio(roomName, `Tocca a ${nextPlayer.playerName}`);
    startTurn(nextPlayer.playerId, room, roomName);

    ioIstance.to(roomName).emit("finePlayCard");
    sendInitDataToAll(roomName);
  }
}