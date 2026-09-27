require('dotenv').config();
const { createApp } = require('./app');
const { getDb } = require('./db');

const PORT = process.env.PORT || 4000;
getDb(); // create tables on startup
createApp().listen(PORT, () => console.log(`CareerConnect API listening on http://localhost:${PORT}`));
