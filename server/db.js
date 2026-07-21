// Asegúrate de tener instalado dotenv: npm install dotenv
require('dotenv').config(); 
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// El pool.connect es bueno para probar, pero el pool en sí mismo 
// maneja la conexión de forma eficiente para consultas múltiples.
pool.connect((err) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err.stack);
  } else {
    console.log('✅ Conectado exitosamente a PostgreSQL');
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};