const tripodo = require("../../utils/tripodo.js");
const md5 = require('md5');
module.exports = (io, socket, rooms) => {

  ////////////////////////////// CREA ROOM
  const createRoom = (data) => {
    const { roomName, player: { playerId, playerName } } = data;

    //VALIDO I DATI DEL FRONT-END
    if (!roomName || !playerId || !playerName) {
      return socket.emit("error", {
        code: 400,
        message: "Dati insufficienti per creare la stanza",
      });
    }

    if (rooms[roomName]) {
      return socket.emit("error", {
        code: 500,
        message: "Room già esistente!",
      });
    }

    rooms[roomName] = {
      host: socket.id,
      players: [
        { socketId: socket.id, playerId: playerId, playerName: playerName },
      ],
      //sockets: [socket],
      playerState: [],
      gameState: {},
    };

    socket.join(roomName);
    socket.userId = playerId;
    console.log(`Room creata: ${roomName} da ${socket.id}`);

    const payload = {
      players: rooms[roomName].players,
      host: true,
    };
    socket.emit("roomCreated", payload);
  };



  ////////////////////////////////////////////////// JOIN ROOM
  const joinRoom = (data) => {
    const { roomName, player: { idPlayer, playerName } } = data;

    //VALIDO I DATI DEL FRONT-END
    if (!roomName || !idPlayer || !playerName) {
      return socket.emit("error", {
        code: 500,
        message: "Dati insufficienti per unirsi la stanza",
      });
    }

    //CONTROLLO ESISTENZA STANZA
    const room = rooms[roomName];
    if (!room) {
      return socket.emit("error", {
        code: 400,
        message: "Room non trovata!",
      });
    }

    //CONTROLLO SE E' GIA' NELLA STANZA
    const alreadyInRoom = room.players.some(
      (player) => player.playerId === idPlayer,
    );

    if (alreadyInRoom) {
      return;
    }

    socket.userId = idPlayer;

    //AGGIUNGO GIOCATORE NELLA STANZA
    room.players.push({
      socketId: socket.id,
      playerId: idPlayer,
      playerName: playerName,
    });
    socket.join(roomName);
    console.log(`${socket.id} è entrato in ${roomName}`);

    // aggiorno tutti nella stanza
    const payload = {
      players: room.players,
    };
    io.to(roomName).emit("updatePlayers", payload);
  };

  //////////////////////////////////////////// START GAME (solo host)
  const startGame = () => {
    // trova la room in cui è host
    const roomName = Object.keys(rooms).find(
      (r) => rooms[r].host === socket.id,
    );
    if (!roomName) return;

    socket.emit("gameStarted");
    console.log(`Partita ${roomName} iniziata dall'host ${socket.id}`);
  };

  ////////////////////////////////////REDIRECT TABLE
  const redirectTable = () => {
    const roomId = getGameRoom(socket);
    const playersCount = rooms[roomId].players.length;

    const carte = tripodo.dividiCarte(1, rooms[roomId].players);

    rooms[roomId].players.forEach((playerId, index) => {
      rooms[roomId].playerState[index] = tripodo.initPlayer(
        playerId.playerId,
        playersCount,
        index,
        carte[`${playerId.playerId}`],
      );
    });

    tripodo.aggiungiIdCarte(rooms[roomId].playerState);

    //CON QUESTO SETTO IL TURNO DE GIOCATORE PLAYER STATE
    let inizioTurno = tripodo.bancoInitGames(playersCount);

    const banco = rooms[roomId].playerState[inizioTurno - 1];

    rooms[roomId].gameState = tripodo.initGameState(
      banco.idPlayer,
      playersCount,
      inizioTurno - 1,
    );

    tripodo.initPunteggi(rooms[roomId].gameState, rooms[roomId].playerState);

    tripodo.prossimoTurno(rooms[roomId]);

    rooms[roomId].gameState.ultimaPresa =
      rooms[roomId].gameState.turnoAttualeId;

    io.to(roomId).emit("goTable", "./public/tavoloComponent/tavolo.html");
    //socketMessaggio(roomId, "E' il turno di x");
  };

  //////////////////////////////////////////////////////// START GAME PER TEST
  const startGameTest = () => {
    // trova la room in cui è host
    const roomName = Object.keys(rooms).find(
      (r) => rooms[r].host === socket.id,
    );
    if (!roomName) return;

    socket.emit("gameStartedTest");
    console.log(`Partita ${roomName} iniziata dall'host ${socket.id}`);
  };

  //////////////////////////////////////////////////////REDIRECT TABLE PER TEST
  const redirectTableTest = (numeroGiocatoriTest) => {
    const roomId = getGameRoom(socket);
    let playersCount = rooms[roomId].players.length;

    const carte = tripodo.dividiCarte(1, rooms[roomId].players);

    rooms[roomId].players.forEach((playerId, index) => {
      rooms[roomId].playerState[index] = tripodo.initPlayer(
        playerId.playerId,
        playersCount,
        index,
        carte[`${playerId.playerId}`],
      );
    });

    tripodo.aggiungiIdCarte(rooms[roomId].playerState);

    //CON QUESTO SETTO IL TURNO DE GIOCATORE PLAYER STATE
    let inizioTurno = tripodo.bancoInitGames(playersCount);

    const banco = rooms[roomId].playerState[inizioTurno - 1];

    playersCount = numeroGiocatoriTest;
    rooms[roomId].gameState = tripodo.initGameState(
      banco.idPlayer,
      playersCount,
      inizioTurno - 1,
    );
    playersCount = rooms[roomId].players.length;
    tripodo.initPunteggi(rooms[roomId].gameState, rooms[roomId].playerState);

    tripodo.prossimoTurno(rooms[roomId]);

    rooms[roomId].gameState.ultimaPresa =
      rooms[roomId].gameState.turnoAttualeId;

    io.to(roomId).emit("goTable", "./public/tavoloComponent/tavolo.html");
  };

  ///////////////////////////////////////////////////////GENERATE ID PLAYER
  const generatePlayerID = () => {
    let playerId = md5(socket.id);

    socket.emit("returnIdPlayer", playerId);
  };


  //////////////////////////////////////////////////////////DISCONNESIONE
  const disconnect = () => {
    const userId = socket.userId; // Il tuo playerId
    if (!userId) return;

    //Trovo la stanza in cui si trova l'utente
    let foundRoomName = null;
    for (const name in rooms) {
      if (rooms[name].players.some((p) => p.playerId === userId)) {
        foundRoomName = name;
        break;
      }
    }

    if (!foundRoomName) return;

    // Timer di attesa per far rientrare il giocatore
    setTimeout(() => {
      // Controllo se è tornato
      const isReconnected = Array.from(io.sockets.sockets.values()).some(
        (s) => s.userId === userId,
      );

      if (!isReconnected) {
        const room = rooms[foundRoomName];
        if (!room) return; // Verifico che la stanza effettivamente ancora esista per non fare spaccare tutto

        // Rimuovo il giocatore
        room.players = room.players.filter((p) => p.playerId !== userId);

        // Se la stanza è vuota, la elimino
        if (room.players.length === 0) {
          delete rooms[foundRoomName];
          console.log(`Stanza ${foundRoomName} eliminata.`);
          return;
        }

        // Cambio host stanza se il socket che è uscito era l'host
        //(DA CLAUDE CAPIRE) Confronto sul socketId (non playerId) perché room.host è sempre uno socketId
        if (room.host === userId) {
          room.host = room.players[0].playerId;
        }

        // Notifica gli altri ( questo me lo ha detto Gemini, devo capire un attimo meglio)
        io.to(foundRoomName).emit("updatePlayers", {
          players: room.players,
          host: room.host,
        });
      }
    }, 3000);
  };

  //DICHIARAZIONE SOCKET
  socket.on("createRoom", createRoom);
  socket.on("joinRoom", joinRoom);
  socket.on("disconnect", disconnect);
  socket.on("startGame", startGame);
  socket.on("startGameTest", startGameTest);
  socket.on("generatePlayerID", generatePlayerID);
  socket.on("redirectTable", redirectTable);
  socket.on("redirectTableTest", redirectTableTest)
}


function getGameRoom(socket) {
  return [...socket.rooms].find((room) => room !== socket.id);
}

