require("dotenv").config();  

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host:     process.env.HOST,
  database: process.env.DATABASE,
  user:     process.env.USER,
  password: process.env.PASSWORD,
});

console.log("Intentando conectar a la base de datos...");

pool.getConnection()
  .then(conn => {
    console.log("Conectado a la base de datos:", process.env.DATABASE);
    conn.release();
  })
  .catch(err => {
    console.error("Error al conectar a la base de datos:", err.message);
  });

module.exports = pool;
