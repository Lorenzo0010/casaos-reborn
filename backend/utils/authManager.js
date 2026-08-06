const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

const isSetupComplete = () => {
  return fs.existsSync(USERS_FILE);
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
};

const verifyPassword = (password, salt, hash) => {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};

const setupUser = (username, password) => {
  if (isSetupComplete()) {
    throw new Error('Setup is already complete.');
  }

  const { salt, hash } = hashPassword(password);
  const data = {
    username,
    salt,
    hash
  };

  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf8');
};

const login = (username, password) => {
  if (!isSetupComplete()) {
    throw new Error('Setup required');
  }

  const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  
  if (data.username !== username) {
    return false;
  }

  return verifyPassword(password, data.salt, data.hash);
};

// Se non c'è il file users.json ma abbiamo le variabili d'ambiente, auto-eseguiamo il setup
if (!isSetupComplete() && process.env.ADMIN_USER && process.env.ADMIN_PASS) {
  try {
    setupUser(process.env.ADMIN_USER, process.env.ADMIN_PASS);
    console.log('Credenziali migrate con successo dalle variabili d\'ambiente a users.json');
  } catch (error) {
    console.error('Errore durante la migrazione automatica delle credenziali:', error.message);
  }
}

module.exports = {
  isSetupComplete,
  setupUser,
  login
};
