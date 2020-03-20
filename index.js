'use strict';

var socketIO = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/chatrooms.db');
db.run(`DELETE FROM chatrooms WHERE 1==1`)
console.log('creating and clearing db');
var os = require('os');

var nodeStatic = require('node-static');
var http = require('http');

var PORT = process.env.PORT || 8080;
var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function(req, res) {
    fileServer.serve(req, res);
}).listen(PORT);

var io = socketIO.listen(app);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }


  function getUsersInRoom(room) {
    var clientsInRoom = io.sockets.adapter.rooms[room];
    return clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    var roomId = (Object.keys(socket.rooms).filter(item => item!=socket.id))[0]
    socket.to(roomId).emit('message', message);
  });

  function createNewRoom() {
    var room = Math.random().toString(36).substring(7);
    socket.join(room);
    console.log(`${socket.id} created room ${room}`)
    log('Client ID ' + socket.id + ' created room ' + room);
    socket.emit('created', room, socket.id);
    db.run(`INSERT INTO chatrooms(name, clients, roomStarted) VALUES(?, ?, ?)`, [room, 1, +new Date], function(err) {
      if (err) {
        log(err.message);
      }
    });
  }

  socket.on('new room', function() {
    console.log(`${socket.id} searching for a room`)
    createNewRoom();
  });

  socket.on('create or join', function() {

    console.log(`${socket.id} searching for a room`)
    // log('Received request to create or join room ' + room);
      db.all(`SELECT name name, clients, clients from chatrooms WHERE clients = ? ORDER BY roomStarted`, [1], (err, rows) => {
        if (err) {
          return console.error(err.message);
        }
        if (rows.length >= 2)  {
          var row = rows[0];
          var room = row.name;
          log('Client ID ' + socket.id + ' joined room ' + room);
          console.log('Client ID ' + socket.id + ' joined room ' + room);

          io.sockets.in(room).emit('join', room);
          socket.join(room);
          socket.emit('joined', room, socket.id);
          io.sockets.in(room).emit('ready');
          db.run(`UPDATE chatrooms SET clients=? WHERE name=?`, [row.clients+1, room])
        }
        else {
          createNewRoom();
        }
      });


    //
    //
    // if (numClients === 0) {
    //   socket.join(room);
    //   log('Client ID ' + socket.id + ' created room ' + room);
    //   socket.emit('created', room, socket.id);
    //
    // } else if (numClients === 1) {
    //   log('Client ID ' + socket.id + ' joined room ' + room);
    //   io.sockets.in(room).emit('join', room);
    //   socket.join(room);
    //   socket.emit('joined', room, socket.id);
    //   io.sockets.in(room).emit('ready');
    // } else { // max two clients
    //   socket.emit('full', room);
    // }
  });

  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

  socket.on('bye', function(room){
    console.log(`bye received from ${socket.id} for room ${room}`)
    db.run(`DELETE FROM chatrooms WHERE name=?`, room);
    socket.leave(room);
    socket.to(room).emit('message', 'bye');
  })

});
