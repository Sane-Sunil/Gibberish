// relay.js
const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

const sessions = {}; // sessionId -> ws connection
const connections = {}; // sessionId -> connected peer sessionId

wss.on('connection', (ws) => {
  let sessionId;

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      const { register, sessionId: sId, to, payload, type, from } = data;

      if (register) {
        sessionId = sId;
        sessions[sessionId] = ws;
        console.log(`Registered: ${sessionId}`);
      } else if (to && payload) {
        const recipient = sessions[to];
        if (recipient) {
          recipient.send(JSON.stringify({ from, payload, type }));
          connections[from] = to;
          connections[to] = from;
          if(type == "msg"){
            // console.log(`Data passed from ${from} to ${to}: ${type} ${payload}`);
            console.log(`Data passed from ${from} to ${to}: ${type} [message]`);
          }
          else{
            console.log(`Data passed from ${from} to ${to}: ${type} [public_key]`);
          }
        } 
        else {
          console.log(`Recipient ${to} not connected`);
        }
      }
    } catch (e) {
      console.error("Invalid message:", e);
    }
  });

  ws.on('close', () => {
    if (sessionId) {
      console.log(`Connection ended for: ${sessionId}`);

      const peerId = connections[sessionId];
      if (peerId && sessions[peerId]) {
        sessions[peerId].send(JSON.stringify({ type: "peer_disconnected", peer: sessionId }));
        delete connections[peerId];
      }

      delete sessions[sessionId];
      delete connections[sessionId];
    }
  });
});

console.log(`Relay running on port ${PORT}`);
