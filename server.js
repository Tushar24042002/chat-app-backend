const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const db = require('./db'); // Assume db is configured correctly for your database
const bcrypt = require('bcrypt');
const app = express();
const cors = require("cors");
app.use(cors());
require('dotenv').config();

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashedPassword]);
    res.status(201).send('User registered');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error registering user');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ userId: user.id, username: user.username });
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error logging in');
  }
});

app.get('/users', async (req, res) => {
  try {
    const result = await db.query('SELECT id, username FROM users');
    res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching users');
  }
});

app.get('/messages', async (req, res) => {
    const { sender, receiver } = req.query;
  
    try {
      const result = await db.query(
        `SELECT content, sender_id AS sender, receiver_id AS receiver, timestamp FROM messages 
         WHERE (sender_id = $1 AND receiver_id = $2) 
         OR (sender_id = $2 AND receiver_id = $1) 
         ORDER BY timestamp ASC`,
        [sender, receiver]
      );
      res.status(200).json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching messages');
    }
  });

const clients = {};
const userCache = {};

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const userId = params.get('token');

  if (!userId) {
    ws.close();
    return;
  }

  clients[userId] = ws;

  console.log(`User ${userId} connected`);

  ws.on('message', async (message) => {
    const messageData = JSON.parse(message);
    console.log(`Received: ${messageData.content} from ${messageData.sender} to ${messageData.receiver}`);

    try {
      const getUserId = async (username) => {
        if (userCache[username]) {
          return userCache[username];
        }
        const result = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        console.log(result);
        const userId = result.rows[0].id;
        userCache[username] = userId;
        return userId;
      };

      const senderId =await messageData.sender;
      const receiverId = await messageData.receiver;
      const newMessage = await db.query(
        'INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *',
        [messageData.content, senderId, receiverId]
      );

      const messageToSend = {
        content: newMessage.rows[0].content,
        sender: messageData.sender,
        receiver: messageData.receiver,
        timestamp: newMessage.rows[0].timestamp,
      };

      // Send message to the sender
      ws.send(JSON.stringify(messageToSend));

      // Broadcast the message to the intended receiver
      const receiverSocket = clients[receiverId];
      if (receiverSocket && receiverSocket.readyState === WebSocket.OPEN) {
        receiverSocket.send(JSON.stringify(messageToSend));
      }
    } catch (err) {
      console.error(err);
    }
  });

  ws.on('close', () => {
    console.log(`User ${userId} disconnected`);
    delete clients[userId];
  });
});

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});
