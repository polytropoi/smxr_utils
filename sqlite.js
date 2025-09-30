

import sqlite3 from 'sqlite3';
const SQLite3 = sqlite3.verbose(); // For verbose mode
let db = new sqlite3.Database('./smxr_bu.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

import express from 'express';
import { SqliteGuiNode } from 'sqlite-gui-node';

const app = express();


// use the GUI
SqliteGuiNode(db).catch((err) => {
  console.error("Error starting the GUI:", err);
});

app.listen(5100);

//   db.serialize(() => {
//       db.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)");
//       db.run("INSERT INTO users (name) VALUES (?)", [Math.random() + "_John Doe"]);
//       db.all("SELECT * FROM users", [], (err, rows) => {
//           if (err) {
//               throw err;
//           }
//           rows.forEach((row) => {
//               console.log(row.name);
//           });
//       });
//   });

//   db.close((err) => {
//       if (err) {
//           console.error(err.message);
//       }
//       console.log('Closed the database connection.');
//   });

