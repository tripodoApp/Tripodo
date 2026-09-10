const enumCarte = require('./EnumCarte');

const numberCard = 40;

function initPlayer(idPlayer, numberPlayers, index, carte) {

  var player = {

    idPlayer: idPlayer,
    punteggio: [],
    playedCard: 0,
    cardsHands: carte,
    numeroPrese: 0,
    numeroChiamata: 0,
    haChiamato: false,
    currentRound: 1,
    currentRoundHand: 0,
    totalRound: 40 / numberPlayers,
    index: index
  }

  return player
}

function prossimoTurno(room) {

  // Incrementa l'indice e usa il modulo per tornare a 0 dopo il quinto giocatore
  // (5 % 5 fa 0)
  room.gameState.indiceTurno = (room.gameState.indiceTurno + 1) % room.players.length;
  room.gameState.turnoAttualeId = room.players[room.gameState.indiceTurno].playerId

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

function prossimoBanco(indice, sizePlayer) {

  return (indice + 1) % sizePlayer;
}


function dividiCarte(currentRound, players) {

  const cardForPlayer = {};
  let numberPlayers = players.length;
  const deck = createDeck();
  shuffle(deck);

  for (let i = 0; i < numberPlayers; i++) {

    cardForPlayer[`${players[i].playerId}`] = [];

    for (let j = 0; j < currentRound; j++) {

      cardForPlayer[`${players[i].playerId}`].push(deck.pop());
    }

  }

  return cardForPlayer;
}


function createDeck() {
  const deck = [];
  const suits = ['d', 's', 'b', 'c'];

  for (const suit of suits) {
    for (let num = 1; num <= 10; num++) {

      deck.push({
        carta: `${num}${suit}`, // es: "7c"
        valore: enumCarte.getById(`${num}${suit}`) // gestisci tu la logica
      });

    }
  }

  return deck;
}


function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function bancoInitGames(numberPlayers) {
  return Math.floor(Math.random() * numberPlayers) + 1;
}

function isPartitaFinita(gameState) {

  let totalRound = gameState.totalRound * 2;
  return gameState.currentRound > totalRound ? true : false;

}

function initGameState(bancoId, numberPlayers, indiceTurno) {

  var gameState = {

    bancoId: bancoId,
    ultimaPresa: undefined,
    turnoAttualeId: undefined,
    cardsTable: [],
    currentRound: 1,
    currentRoundHand: 1,
    totalRound: Math.floor(40 / numberPlayers),
    roundToUp: 1,
    roundToDown: Math.floor(40 / numberPlayers) + 1,
    giroChiamata: true,
    valoreNegato: undefined,
    indiceTurno: indiceTurno,
    punteggi: {},
    isLastRound: false
  }

  return gameState;
}
function setTurnoPostPresa(idPlayer, room) {

  const indiceGiocatorePresa = room.players.findIndex(player => player.playerId === idPlayer);
  room.gameState.indiceTurno = indiceGiocatorePresa;
  room.gameState.turnoAttualeId = idPlayer;
}

function calcoloMassimoTurno(cardTable) {

  return cardTable.reduce((max, obj) =>
    (Number(obj.valore) > Number(max.valore) ? obj : max),
    cardTable[0]);

}

function fineRound(room) {

  calcoloPunteggio(room.playerState, room.gameState);

  room.gameState.currentRound >= room.gameState.totalRound ? room.gameState.roundToDown = room.gameState.roundToDown - 1 : room.gameState.roundToUp = room.gameState.roundToUp + 1;
  room.gameState.currentRound++;

  room.gameState.giroChiamata = true;
  let currentRound = room.gameState.currentRound > room.gameState.totalRound ? room.gameState.roundToDown : room.gameState.roundToUp;

  if (room.gameState.currentRound >= room.gameState.totalRound && currentRound == 1) {

    room.gameState.isLastRound = true;
    room.gameState.isLastCard = true;
  }

  const carte = dividiCarte(currentRound, room.players);
  room.playerState.forEach(player => {
    player.cardsHands = carte[`${player.idPlayer}`];
  });

  aggiungiIdCarte(room.playerState);
  room.players.forEach((playerId, index) => {
    room.playerState[index].cardsHands = carte[`${playerId.playerId}`]
  });


  setBancoSuccessivo(room);
  prossimoTurno(room);



}

function calcoloPunteggio(playerState, gameState) {

  playerState.forEach(player => {

    const cartePrese = player.numeroPrese;
    const numeroChiamata = player.numeroChiamata;

    if (cartePrese != numeroChiamata) {

      gameState.punteggi[player.idPlayer].push(0);
      player.punteggio.push(0)

    } else if (cartePrese === numeroChiamata && cartePrese === 0) {

      gameState.punteggi[player.idPlayer].push(10);
      player.punteggio.push(10);

    } else {

      let punteggioGiocatore = 10 + (cartePrese * 3);
      gameState.punteggi[player.idPlayer].push(punteggioGiocatore)
      player.punteggio.push(punteggioGiocatore);

    }

    //Reset punteggio mano
    player.numeroPrese = 0;
    player.numeroChiamata = 0;
    player.haChiamato = false;

  })
}

function setBancoSuccessivo(room) {

  const bancoId = room.gameState.bancoId;
  const indiceBanco = room.players.findIndex(player => player.playerId === bancoId);
  const indiceBancoSuccessivo = prossimoBanco(indiceBanco, room.players.length);
  room.gameState.bancoId = room.players[indiceBancoSuccessivo].playerId;
  room.gameState.indiceTurno = indiceBancoSuccessivo;

}

function setPresa(idPlayer, playerState) {

  const player = playerState.find(player => player.idPlayer === idPlayer);
  player.numeroPrese = player.numeroPrese + 1;
}

function aggiungiIdCarte(playerState) {

  playerState.forEach(player => {

    player.cardsHands.forEach(carta => {

      carta.idPlayer = player.idPlayer;
    })
  })
}

function initPunteggi(gameState, playerState) {

  playerState.forEach(player => {

    gameState.punteggi[player.idPlayer] = []
  })
}


module.exports = {
  dividiCarte,
  initPlayer,
  bancoInitGames,
  initGameState,
  prossimoTurno,
  aggiungiIdCarte,
  calcoloMassimoTurno,
  setPresa,
  setTurnoPostPresa,
  fineRound,
  initPunteggi,
  isPartitaFinita,
  getValoreNegatoBanco,
};