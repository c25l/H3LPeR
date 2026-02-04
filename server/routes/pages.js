const express = require('express');
const router = express.Router();

// Main page - simple whiteboard view
router.get('/', async (req, res) => {
  try {
    res.render('editor-simple', {
      whiteboard: req.app.locals.whiteboard
    });
  } catch (err) {
    res.status(500).render('error', { error: err.message });
  }
});

module.exports = router;
