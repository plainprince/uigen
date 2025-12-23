import { Database } from "bun:sqlite";

const db = new Database("database.sqlite");

// Initialize tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    userdata_json TEXT DEFAULT '{}'
  )
`);

export const createUser = (username, email, passwordHash) => {
  const query = db.query(`
    INSERT INTO users (username, email, password_hash, userdata_json)
    VALUES ($username, $email, $passwordHash, $userdataJson)
  `);
  return query.run({
    $username: username,
    $email: email,
    $passwordHash: passwordHash,
    $userdataJson: JSON.stringify({ js: "", css: "", html: "" }),
  });
};

export const getUserByUsername = (username) => {
  const query = db.query("SELECT * FROM users WHERE username = $username");
  return query.get({ $username: username });
};

export const getUserById = (id) => {
  const query = db.query("SELECT * FROM users WHERE id = $id");
  return query.get({ $id: id });
};

export const updateUserdata = (id, userdata) => {
  const query = db.query(`
    UPDATE users SET userdata_json = $userdata WHERE id = $id
  `);
  return query.run({
    $userdata: userdata, // Correct: No JSON.stringify here
    $id: id
  });
};

export default db;

