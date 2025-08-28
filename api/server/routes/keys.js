const express = require('express');
const router = express.Router();
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('../services/UserService');
const { requireJwtAuth } = require('../middleware/');
const { provisionApiKey } = require('../services/ApiKeyProvisioningService');

router.put('/', requireJwtAuth, async (req, res) => {
  await updateUserKey({ userId: req.user.id, ...req.body });
  res.status(201).send();
});

router.delete('/:name', requireJwtAuth, async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', requireJwtAuth, async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

// New endpoint for provisioning API keys for client-side LLM calls
router.post('/provision', requireJwtAuth, async (req, res) => {
  try {
    const { provider, purpose = 'chat' } = req.body;
    
    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' });
    }

    const provisionedKey = await provisionApiKey({
      userId: req.user.id,
      provider,
      purpose
    });

    res.status(200).json(provisionedKey);
  } catch (error) {
    console.error('[/keys/provision] Error:', error);
    res.status(500).json({ 
      error: 'Failed to provision API key',
      message: error.message 
    });
  }
});

module.exports = router;
