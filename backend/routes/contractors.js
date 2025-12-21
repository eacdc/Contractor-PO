const express = require('express');
const router = express.Router();
const Contractor = require('../models/Contractor');

// Get all contractors
router.get('/', async (req, res) => {
  try {
    const contractors = await Contractor.find().sort({ creationDate: -1 });
    res.json(contractors);
  } catch (error) {
    console.error('Error fetching contractors:', error);
    res.status(500).json({ error: 'Error fetching contractors' });
  }
});

// Create new contractor
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Contractor name is required' });
    }

    // Generate a unique contractorId
    // Using timestamp + random string to ensure uniqueness
    let contractorId;
    let existingContractor;
    do {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
      contractorId = `CTR${timestamp}${randomStr}`;
      existingContractor = await Contractor.findOne({ contractorId });
    } while (existingContractor); // Keep generating until unique

    const contractor = new Contractor({
      contractorId,
      name: name.trim(),
      creationDate: new Date()
    });

    await contractor.save();
    res.status(201).json(contractor);
  } catch (error) {
    console.error('Error creating contractor:', error);
    if (error.code === 11000) {
      // Duplicate key error
      return res.status(400).json({ error: 'Contractor ID already exists' });
    }
    res.status(500).json({ error: 'Error creating contractor' });
  }
});

module.exports = router;
