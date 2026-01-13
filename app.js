const express  = require('express');
const app = express();
const tripodo = require('./tripodo')

const md5 = require('crypto-md5');


const http = require('http').Server(app);

var path = require('path');

var io = require('socket.io')(http);

app.use(express.static(path.join(__dirname, '')));

 app.get('/', (req, res) => {
   res.sendFile('home.html', {root: path.join(__dirname)})
 })


const rooms = {}; // { roomName: { host: socket.id, players: [username], sockets: [socket.id] } }

io.on('connection', socket => {

  console.log('Nuovo client:', socket.id);
  

  // CREA ROOM
  socket.on('createRoom', (roomName, playerId, playerName) => {
    if (rooms[roomName]) {
      socket.emit('errorMsg', 'Room già esistente!');
      return;
    }

    rooms[roomName] = {
      host: socket.id,
      players: [{ socketId: socket.id, playerId: playerId, playerName: playerName }],
      sockets: [socket],
      playerState: [],
      gameState: {}
    };

    socket.join(roomName);
    console.log(`Room creata: ${roomName} da ${socket.id}`);

    socket.emit('roomCreated', {
      players: rooms[roomName].players,
      host: true
    });
  });

  // JOIN ROOM
  socket.on('joinRoom', (roomName, idPlayer, playerName) => {
    const room =  rooms[roomName];
    if (!room) {
      socket.emit('errorMsg', 'Room non trovata!');
      return;

    } 

  const alreadyInRoom = room.players.some(
    player => player.playerId === idPlayer
  );

  if (alreadyInRoom) {
    
    return;
  }

    room.players.push({ socketId: socket.id, playerId: idPlayer, playerName: playerName });
    room.sockets.push(socket);
    socket.join(roomName);
    console.log(`${socket.id} è entrato in ${roomName}`);

    // aggiorno tutti nella stanza
    io.to(roomName).emit('updatePlayers', {
      players: room.players,
      host: false
    });

    socket.emit('roomJoined', {
      players: room.players
    });
  });

  socket.on('redirectTable', ()=> {

    const roomId = getGameRoom(socket);
    const playersCount = rooms[roomId].sockets.length;

    const carte = tripodo.dividiCarte(1, rooms[roomId].players )

    rooms[roomId].players.forEach((playerId, index) => {
      rooms[roomId].playerState[index] = tripodo.initPlayer(
      playerId.playerId,
      playersCount, 
      index,
      carte[`${playerId.playerId}`]
      );
    });

    tripodo.aggiungiIdCarte(rooms[roomId].playerState);

    //CON QUESTO SETTO IL TURNO DE GIOCATORE PLAYER STATE
    let inizioTurno = tripodo.bancoInitGames(playersCount);
    
   
    const banco = rooms[roomId].playerState[inizioTurno-1];

    rooms[roomId].gameState = tripodo.initGameState(banco.idPlayer, playersCount, inizioTurno - 1);

    tripodo.initPunteggi(rooms[roomId].gameState, rooms[roomId].playerState);
     
    tripodo.prossimoTurno(rooms[roomId]);

    rooms[roomId].gameState.ultimaPresa = rooms[roomId].gameState.turnoAttualeId;
    
    io.to(roomId).emit('goTable', '/tavolo.html');
 
  });

  socket.on('tableReady', (playerCode) => {

  const roomName = Object.keys(rooms).find(room =>
    rooms[room].players.some(p => p.playerId === playerCode)
  );

  if (!roomName) return;

  const player = rooms[roomName].players.find(
    p => p.playerId === playerCode
  );
  player.socketId = socket.id;
  socket.join(roomName);

  const playerData = rooms[roomName].playerState.find( p => p.idPlayer === playerCode);
  const gameState = rooms[roomName].gameState;

  socket.emit('initData', playerData, gameState, rooms[roomName].players);
});

  // START GAME (solo host)
  socket.on('startGame', () => {
    // trova la room in cui è host
    const roomName = Object.keys(rooms).find(r => rooms[r].host === socket.id);
    if (!roomName) return;

    socket.emit('gameStarted');
    console.log(`Partita ${roomName} iniziata dall'host ${socket.id}`);
  });

  // DISCONNESSIONE
  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);

    // cerca la room in cui era
    for (const roomName in rooms) {
      const room = rooms[roomName];
      const index = room.players.indexOf(socket.id);
      if (index !== -1) {
        room.players.splice(index, 1);
        room.sockets = room.sockets.filter(s => s.id !== socket.id);

        // se era host, nomina nuovo host se possibile
        if (room.host === socket.id && room.players.length > 0) {
          room.host = room.players[0];
          io.to(room.host).emit('roomCreated', {
            players: room.players,
            host: true
          });
        }

        // aggiorno tutti
        io.to(roomName).emit('updatePlayers', {
          players: room.players,
          host: room.host === socket.id ? false : true
        });

        // se nessuno rimane, cancello la stanza
        if (room.players.length === 0) delete rooms[roomName];

        break;
      }
    }
  });

  socket.on("generatePlayerID", () => {

    let playerId =  md5(socket.id);

    socket.emit("returnIdPlayer", playerId);
  })

   socket.on("playCard", (card, playerCode) => {


      const roomName = getGameRoomByPlayerId(playerCode);
      
      const player = Object.values(rooms[roomName].playerState).find(
        p => p.idPlayer === playerCode
      );

      const isChiamata = rooms[roomName].gameState.giroChiamata

      if ( rooms[roomName].gameState.turnoAttualeId != playerCode || isChiamata  ) {

        return;
      }
      
      //TROVA CARTA 
      let valueCard = card.valore;
      let findCard = player.cardsHands.find(
        p => p.valore === valueCard
      );

      if ( !findCard && valueCard != "last" ) {

        return;

      } else if ( /*!findCard && rooms[roomName].gameState.isLastRound == true &&*/ card.valore === "last" && card.carta === "last") {


        const player = rooms[roomName].playerState.find(p => p.idPlayer === playerCode);
        findCard = player.cardsHands[0];
      }

      //Aggiungo la carta al tavolo
      rooms[roomName].gameState.cardsTable.push(findCard); 

      //Tolgo la carta dal giocatore
      player.cardsHands = player.cardsHands.filter(c => c !== findCard);

      const playerName = rooms[roomName].players.find( player => 

      player.playerId === rooms[roomName].gameState.turnoAttualeId
    )

    socketMessaggio(roomName, `${playerName.playerName} ha tirato la  carta`);

      let currentRound = rooms[roomName].gameState.currentRound > rooms[roomName].gameState.totalRound ? rooms[roomName].gameState.roundToDown : rooms[roomName].gameState.roundToUp;   

      if ( rooms[roomName].gameState.cardsTable.length === rooms[roomName].playerState.length && currentRound === rooms[roomName].gameState.currentRoundHand ) {

          const cartaMassima = tripodo.calcoloMassimoTurno(rooms[roomName].gameState.cardsTable);
          tripodo.setPresa(cartaMassima.idPlayer, rooms[roomName].playerState);

          const playerPresa = rooms[roomName].players.find( player => 

            player.playerId === cartaMassima.idPlayer
          )

          socketMessaggio(roomName, `${playerPresa.playerName} ha preso la mano`);

          rooms[roomName].gameState.cardsTable.length = 0;

          rooms[roomName].gameState.currentRoundHand = 1;

          tripodo.fineRound(rooms[roomName]);

          const playerRound = rooms[roomName].players.find( player => 

            player.playerId === rooms[roomName].gameState.turnoAttualeId
          );
          socketMessaggio(roomName, `${playerRound.playerName} deve chiamare`);

      } else if ( rooms[roomName].gameState.cardsTable.length === rooms[roomName].playerState.length ) {

          const cartaMassima = tripodo.calcoloMassimoTurno(rooms[roomName].gameState.cardsTable);
          tripodo.setPresa(cartaMassima.idPlayer, rooms[roomName].playerState);

          const playerPresa = rooms[roomName].players.find( player => 

            player.playerId === cartaMassima.idPlayer
          )

          socketMessaggio(roomName, `${playerPresa.playerName} ha preso la mano`);
          rooms[roomName].gameState.cardsTable.length = 0;

          rooms[roomName].gameState.currentRoundHand = rooms[roomName].gameState.currentRoundHand + 1;

          rooms[roomName].gameState.ultimaPresa = cartaMassima.idPlayer;

          tripodo.setTurnoPostPresa(cartaMassima.idPlayer, rooms[roomName]);

          const playerRound = rooms[roomName].players.find( player => 

            player.playerId === rooms[roomName].gameState.turnoAttualeId
          );
          socketMessaggio(roomName, `${playerRound.playerName} tocca a te`);
      
      } else {

        tripodo.prossimoTurno(rooms[roomName]);
        const playerRound = rooms[roomName].players.find( player => 

            player.playerId === rooms[roomName].gameState.turnoAttualeId
          );
          socketMessaggio(roomName, `${playerRound.playerName} tocca a te`);
      }

      if ( rooms[roomName].gameState.isLastRound ) {

        io.to(roomName).emit("lastRound");
        return;
      }

      io.to(roomName).emit("finePlayCard");

   })

   socket.on("prepareLastRound", playerCode => {

    const roomName = getGameRoomByPlayerId(playerCode);

    rooms[roomName].gameState.isLastRound = false;
      
    const player = Object.values(rooms[roomName].playerState).find(
      p => p.idPlayer === playerCode
    );

    const carteGiocatori = [];
    
    rooms[roomName].playerState.forEach( player => {

      if ( player.idPlayer != playerCode ) {


        carteGiocatori.push(player.cardsHands[0]);
      }
    })

    socket.emit('cardsLastRound', player, rooms[roomName].gameState, rooms[roomName].players, carteGiocatori);

   });

   socket.on("aggiornaDati", playerCode => {

    const roomName = Object.keys(rooms).find(room =>
        rooms[room].players.some(p => p.playerId === playerCode)
      );

      if (!roomName) return;

      const player = rooms[roomName].playerState.find(
        p => p.idPlayer === playerCode
      );

      socket.emit('initData', player, rooms[roomName].gameState, rooms[roomName].players);
   })

   socket.on("handshakeChiamata", playerCode => {
      //console.log('HANDSHAKE da', socket.id);
      const roomName = Object.keys(rooms).find(room =>
        rooms[room].players.some(p => p.playerId === playerCode)
      );

      if (!roomName) return;

      const player = rooms[roomName].playerState.find(
        p => p.idPlayer === playerCode
      );

      socket.emit('fineHandshakeChiamata', player, rooms[roomName].gameState);
   })

   socket.on( "callNumber", (valueCall, playerCode) => {

    const roomName = getGameRoomByPlayerId(playerCode);
    const player = Object.values(rooms[roomName].playerState).find(
        p => p.idPlayer === playerCode
    );
    

    const idTurnoAttuale = rooms[roomName].gameState.turnoAttualeId

    if ( idTurnoAttuale !== playerCode || !rooms[roomName].gameState.giroChiamata  ) {

      return;
    }

    if ( player.idPlayer === rooms[roomName].gameState.bancoId ) {

      if ( valueCall == rooms[roomName].gameState.valoreNegato )

        return;
    }

    player.numeroChiamata = valueCall;

    let playerName = rooms[roomName].players.find( player => 

      player.playerId === rooms[roomName].gameState.turnoAttualeId
    )

    socketMessaggio(roomName, `${playerName.playerName} ha chiamato ${valueCall}`);

    tripodo.prossimoTurno(rooms[roomName]);

    playerName = rooms[roomName].players.find( player => 

      player.playerId === rooms[roomName].gameState.turnoAttualeId
    )

    socketMessaggio(roomName, `${playerName.playerName} e' il tuo turno`);

    //rooms[roomName].gameState.turnoAttualeId = turnoSuccessivo.idPlayer

    //CASO BANCO 
    if ( rooms[roomName].gameState.turnoAttualeId === rooms[roomName].gameState.bancoId) {

      let counter = 0;

      rooms[roomName].playerState.forEach(player => {
        counter += player.numeroChiamata;
      });

      let valueValoreNegato = getValoreNegatoBanco(counter, rooms[roomName].gameState.currentRound);
      rooms[roomName].gameState.valoreNegato = valueValoreNegato;

      let bancoId = rooms[roomName].gameState.bancoId;
      const socketBanco = Object.values(rooms[roomName].players).find( p => p.playerId === bancoId);

      io.to(socketBanco.socketId).emit("chiamataBanco", valueValoreNegato);

      io.to(roomName).emit("chiamataFatta");

    } else if ( player.idPlayer === rooms[roomName].gameState.bancoId ) {

      rooms[roomName].gameState.giroChiamata = false;
      io.to(roomName).emit("chiamataFatta");

    }else {

      io.to(roomName).emit("chiamataFatta");
    }

    //Aggiorno ultima chiamata e turno

   })

   function setGiocatoreSuccessivo(roomName, playerId) {

     let indiceGiocatoreSuccessivo = getGiocatoreSuccessivo(player, playersCount);
    const turnoSuccessivo = Object.values(rooms[roomName].playerState).find(
      elemento => elemento.index === indiceGiocatoreSuccessivo
    );

    turnoSuccessivo.myTurn = true;

    rooms[roomName].gameState.turnoAttualeId = turnoSuccessivo.idPlayer


   }

   function getValoreNegatoBanco( counter, currentRound) {

    if ( counter == currentRound ) {

      return 0;

    } else if ( counter > currentRound ) {

      return -1;

    } else if ( counter < currentRound ) {

      return currentRound - counter; 
    }
   }

   function socketMessaggio(roomName, messaggio) {

    io.to(roomName).emit("gameLog", messaggio);
   }



  //INIZIO GIOCO

  socket.on("initGame", () => {

    const roomId = getGameRoom(socket);
    const playersCount = rooms[roomId].sockets.length;

    rooms[roomName].players.forEach((playerSocketId, index) => {
      rooms[roomName].gameState[playerSocketId] = tripodo.initPlayer(
      playerSocketId,
      playersCount
    );
  });



  })

});

function getGameRoom(socket) {
  return [...socket.rooms].find(room => room !== socket.id);
}

function getGameRoomByPlayerId(playerCode) {

  return Object.keys(rooms).find(room =>
    rooms[room].players.some(p => p.playerId === playerCode));
  
}

function getGiocatoreSuccessivo(playerAttuale, numberOfPlayer) {

  let indicePlayerAttuale = playerAttuale.index;
  let indicePlayerSuccessivo;

  if ( indicePlayerAttuale + 1 == numberOfPlayer ) {

    indicePlayerSuccessivo = 0;

  } else {

    indicePlayerSuccessivo = indicePlayerAttuale + 1;
  }

  return indicePlayerSuccessivo

}

http.listen(3000, function() {
    console.log("Server su 3000")
})

// import {io} from 'socket.io-client';
// import express from 'express';

// const socket = io("http://localhost:5000")
// const app = express()

// app.get('/', (req, res) => {
//   res.sendFile('chatbox.html', {root: "D:\\Desktop\\ProvaSocket\\CLIENT"})
//   app.get('/', (req, res) => {
//     res.sendFile('app.js', {root: "D:\\Desktop\\ProvaSocket\\CLIENT"})
//     })
// })

// app.listen(3000, () => {
//   console.log('Server is running on http://localhost:3000')
// })