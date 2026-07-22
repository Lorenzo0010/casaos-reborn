const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// GET /api/store
router.get('/', (req, res) => {
  try {
    const storePath = path.join(__dirname, '..', 'store.json');
    if (fs.existsSync(storePath)) {
      const storeData = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      res.json(storeData);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error reading store data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
