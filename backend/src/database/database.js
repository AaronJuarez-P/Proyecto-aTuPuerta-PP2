require("dotenv").config();

const mysql = require("mysql2/promise");

// Semana 14: DB_HOST / DB_NAME / DB_USER / DB_PASSWORD, con los nombres de siempre
// (HOST, DATABASE, USER, PASSWORD) como respaldo para no romper los .env que ya existen.
//
// El cambio no es cosmetico. En Mac y Linux USER es una variable del sistema operativo
// (el usuario de la terminal) y dotenv NO pisa las variables que ya existen, asi que el
// USER=root del .env se ignoraba en silencio y la conexion salia con el usuario de la
// computadora: "Access denied" sin ninguna pista de por que.
const configuracion = {
  host:     process.env.DB_HOST     || process.env.HOST,
  database: process.env.DB_NAME     || process.env.DATABASE,
  user:     process.env.DB_USER     || process.env.USER,
  password: process.env.DB_PASSWORD ?? process.env.PASSWORD,
  port:     Number(process.env.DB_PORT) || 3306
};

const pool = mysql.createPool(configuracion);

console.log("Intentando conectar a la base de datos...");

pool.getConnection()
  .then(conn => {
    console.log("Conectado a la base de datos:", configuracion.database);
    conn.release();
  })
  .catch(err => {
    console.error("Error al conectar a la base de datos:", err.message);
  });

module.exports = pool;
