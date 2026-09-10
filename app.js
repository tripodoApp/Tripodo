const express = require("express");
const app = express();
const staticOptions = {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".css")) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
};

app.use(express.static('public', staticOptions));
const tripodo = require("./src/utils/tripodo");
const homeSocketController = require("./src/controllers/socket/homeSocketController");

const md5 = require("crypto-md5");

const http = require("http").Server(app);

var path = require("path");
const tableSocketController = require("./src/controllers/socket/tableSocketController");

var io = require("socket.io")(http);

app.use(express.static(path.join(__dirname, ""), staticOptions));

app.get("/", (req, res) => {
  res.sendFile("./public/homeComponent/home.html", {
    root: path.join(__dirname),
  });
});

const rooms = {}; // { roomName: { host: socket.id, players: [username], sockets: [socket.id] } }

io.on("connection", (socket) => {


  console.log("Nuovo client:", socket.id);

  homeSocketController(io, socket, rooms);
  tableSocketController(io, socket, rooms);



  socket.on("handshakeChiamata", data => {

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

    const player = rooms[roomName].playerState.find(
      (p) => p.idPlayer === playerCode,
    );

    socket.emit("fineHandshakeChiamata", player, rooms[roomName].gameState);
  });

});

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