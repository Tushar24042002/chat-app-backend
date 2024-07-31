const db = require('./db');

const createOrAlterTables = async () => {
  try {
    // Create users table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      );
    `);

    // Alter users table to change the length of username and password columns
    await db.query(`
      ALTER TABLE users
      ALTER COLUMN username TYPE VARCHAR(255),
      ALTER COLUMN password TYPE VARCHAR(255);
    `);

    // Create messages table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sender_id INTEGER REFERENCES users(id),
        receiver_id INTEGER REFERENCES users(id)
      );
    `);
    await db.query(`
        ALTER TABLE messages
        ADD COLUMN  receiver_id INTEGER REFERENCES users(id)
      `);
  

    console.log('Tables created or altered successfully');
  } catch (err) {
    console.error('Error creating or altering tables:', err);
  } finally {
    process.exit();
  }
};

createOrAlterTables();
