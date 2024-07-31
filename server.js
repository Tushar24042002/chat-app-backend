const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const db = require('./db');
const bcrypt = require('bcrypt');
const app = express();
const server = http.createServer(app);
const cors = require("cors");
const wss = new WebSocket.Server({ server });
require('dotenv').config();
app.use(cors());
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

wss.on('connection', (ws, req) => {
    const params = new URLSearchParams(req.url.split('?')[1]);
    const userId = params.get('token');
  
    if (!userId) {
      ws.close();
      return;
    }
  
    ws.userId = userId;
  
    console.log(`User ${userId} connected`);
  
    ws.on('message', async (message) => {
      const messageData = JSON.parse(message);
      console.log(`Received: ${messageData.content} from ${messageData.sender} to ${messageData.receiver}`);
  
      try {
        const senderResult = await db.query('SELECT id FROM users WHERE username = $1', [messageData.sender]);
        const senderId = senderResult.rows[0].id;
        const receiverResult = await db.query('SELECT id FROM users WHERE username = $1', [messageData.receiver]);
        const receiverId = receiverResult.rows[0].id;
        const newMessage = await db.query(
          'INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *',
          [messageData.content, senderId, receiverId]
        );
  
        // Send message to the sender
        ws.send(JSON.stringify({
          content: newMessage.rows[0].content,
          sender: messageData.sender,
          receiver: messageData.receiver,
          timestamp: newMessage.rows[0].timestamp,
        }));
  
        // Broadcast the message to the intended receiver
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN && client.userId == receiverId) {
            client.send(JSON.stringify({
              content: newMessage.rows[0].content,
              sender: messageData.sender,
              receiver: messageData.receiver,
              timestamp: newMessage.rows[0].timestamp,
            }));
          }
        });
      } catch (err) {
        console.error(err);
      }
    });
  
    ws.on('close', () => {
      console.log(`User ${userId} disconnected`);
    });
  });
server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});
