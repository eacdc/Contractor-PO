const mongoose = require('mongoose');

// Contractor collection
// Fields:
//  - ID (stored as contractorId)
//  - Name
//  - Creation date
const contractorSchema = new mongoose.Schema({
  contractorId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  creationDate: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'Contractor',
});

module.exports = mongoose.model('Contractor', contractorSchema);
