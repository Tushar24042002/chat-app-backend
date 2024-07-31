const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const db = require('./db');
const bcrypt = require('bcrypt');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
require('dotenv').config();

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

const authenticateWebSocket = async (ws, req) => {
    const token = req.url.split('?token=')[1];
    if (!token) {
      ws.close();
      return;
    }
  
    try {
      const result = await db.query('SELECT id, username FROM users WHERE id = $1', [token]);
      if (result.rows.length === 0) {
        ws.close();
        return;
      }
  
      ws.userId = result.rows[0].id;
      ws.username = result.rows[0].username;
    } catch (err) {
      console.error(err);
      ws.close();
    }
  };
  
  wss.on('connection', (ws, req) => {
    authenticateWebSocket(ws, req).then(() => {
      console.log('New client connected');
  
      ws.on('message', async (message) => {
        const messageData = JSON.parse(message);
        console.log(`Received: ${messageData.content}`);
  
        try {
          const senderId = ws.userId;
          const receiverResult = await db.query('SELECT id FROM users WHERE username = $1', [messageData.receiver]);
          const receiverId = receiverResult.rows[0].id;
          const newMessage = await db.query(
            'INSERT INTO messages (content, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *',
            [messageData.content, senderId, receiverId]
          );
  
          // Broadcast the message to the intended receiver
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.userId === receiverId) {
              client.send(JSON.stringify({
                content: newMessage.rows[0].content,
                sender: ws.username,
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
        console.log('Client disconnected');
      });
    });
  });
  

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});
