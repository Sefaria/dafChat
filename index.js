'use strict';


const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/chatrooms.db');
db.run(`DELETE FROM chatrooms WHERE 1==1`)
console.log('creating and clearing db');
var os = require('os');

var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

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
    // for a real app, would be room-only (not broadcast)
    socket.broadcast.emit('message', message);
  });

  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    db.run(`INSERT INTO chatrooms(name) VALUES(?)`, [room], function(err) {
      if (err) {
        log(err.message);
      }
    });

    var numClients = getUsersInRoom(room);
    log('Room ' + room + ' now has ' + numClients + ' client(s)');
    console.log(`Room: ${room} now has ${numClients} client(s)`);

    if (numClients === 0) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);

    } else if (numClients === 1) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      socket.emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max two clients
      socket.emit('full', room);
    }
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
    if (getUsersInRoom(room) == 1) {
      console.log(`Room: ${room} is empty`);
      db.run(`DELETE FROM chatrooms WHERE name=?`, room)
    }

  });

});
