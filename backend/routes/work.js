const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Job = require('../models/Job');
const JobOperation = require('../models/JobOperation');
const JobopsMaster = require('../models/JobOpsMaster');
const Operation = require('../models/Operation');
const ContractorWD = require('../models/ContractorWD');

// Get pending operations from JobOpsMaster by job number
router.get('/pending/jobopsmaster/:jobNumber', async (req, res) => {
  try {
    const { jobNumber } = req.params;

    // Find job in JobOpsMaster
    const jobOpsMaster = await JobopsMaster.findOne({ jobId: jobNumber }).lean();
    
    if (!jobOpsMaster) {
      return res.status(404).json({ error: 'Job not found in JobOpsMaster' });
    }

    // Filter operations where pendingOpsQty > 0
    const pendingOps = jobOpsMaster.ops.filter(op => op.pendingOpsQty > 0);

    if (pendingOps.length === 0) {
      return res.json({
        jobNumber,
        operations: []
      });
    }

    // Get all unique opIds and convert to ObjectIds
    const opIds = pendingOps.map(op => {
      try {
        return new mongoose.Types.ObjectId(op.opId);
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    // Fetch operation names from Operation collection
    // opId in JobOpsMaster is stored as String (ObjectId string), so we convert to ObjectId for query
    const operations = await Operation.find({
      _id: { $in: opIds }
    }).lean();

    // Create a map of opId to operation name
    const opsNameMap = {};
    operations.forEach(op => {
      opsNameMap[op._id.toString()] = op.opsName;
    });

    // Build response with operation name, totalOpsQty, pendingOpsQty, qtyPerBook, and rate
    const operationsWithNames = pendingOps.map(op => {
      // Calculate rate per unit: valuePerBook / qtyPerBook
      const rate = op.qtyPerBook > 0 ? op.valuePerBook / op.qtyPerBook : 0;
      
      return {
        opId: op.opId,
        opsName: opsNameMap[op.opId] || 'Unknown',
        totalOpsQty: op.totalOpsQty,
        pendingOpsQty: op.pendingOpsQty,
        qtyPerBook: op.qtyPerBook,
        rate: rate
      };
    });

    res.json({
      jobNumber,
      operations: operationsWithNames
    });
  } catch (error) {
    console.error('Error fetching pending operations from JobOpsMaster:', error);
    res.status(500).json({ error: 'Error fetching pending operations' });
  }
});

// Get pending operations for a contractor and job (legacy endpoint)
router.get('/pending/:contractor/:jobNumber', async (req, res) => {
  try {
    const { contractor, jobNumber } = req.params;

    const job = await Job.findOne({ jobNumber });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobOperations = await JobOperation.find({ job: job._id })
      .populate('operation', 'opsName type');

    const pendingOps = jobOperations.map(jobOp => {
      const contractorWork = jobOp.contractorWork.find(cw => cw.contractor === contractor);
      const completedQty = contractorWork ? contractorWork.completedQty : 0;
      const pendingQty = jobOp.qtyPerBook - completedQty;

      return {
        _id: jobOp._id,
        operation: jobOp.operation,
        qtyPerBook: jobOp.qtyPerBook,
        pendingQty: Math.max(0, pendingQty),
        completedQty
      };
    });

    res.json({
      job,
      operations: pendingOps
    });
  } catch (error) {
    console.error('Error fetching pending work:', error);
    res.status(500).json({ error: 'Error fetching pending work' });
  }
});

// Update work done in JobOpsMaster and Contractor_WD
router.post('/update/jobopsmaster', async (req, res) => {
  try {
    const { contractorId, jobNumber, operations } = req.body;

    if (!contractorId || !jobNumber || !operations || !Array.isArray(operations)) {
      return res.status(400).json({ error: 'Missing required fields: contractorId, jobNumber, and operations are required' });
    }

    // Find job in JobOpsMaster
    const jobOpsMaster = await JobopsMaster.findOne({ jobId: jobNumber });
    
    if (!jobOpsMaster) {
      return res.status(404).json({ error: 'Job not found in JobOpsMaster' });
    }

    const updates = [];
    const contractorWDOps = [];

    for (const op of operations) {
      const { opId, qtyToAdd } = op;

      if (!opId || qtyToAdd === undefined || qtyToAdd <= 0) {
        continue;
      }

      // Find the operation in the ops array
      const jobOp = jobOpsMaster.ops.find(jop => jop.opId === opId);
      
      if (!jobOp) {
        continue;
      }

      // Deduct qtyToAdd from pendingOpsQty
      const qtyToDeduct = Number(qtyToAdd);
      jobOp.pendingOpsQty = Math.max(0, jobOp.pendingOpsQty - qtyToDeduct);
      jobOp.lastUpdatedDate = new Date();

      updates.push({
        opId: jobOp.opId,
        pendingOpsQty: jobOp.pendingOpsQty
      });

      // Add to Contractor_WD operations array
      contractorWDOps.push({
        opsId: opId,
        opsDoneQty: qtyToDeduct,
        completionDate: new Date()
      });
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid operations to update' });
    }

    // Save JobOpsMaster
    await jobOpsMaster.save();

    // Update or create Contractor_WD document
    let contractorWD = await ContractorWD.findOne({
      contractorId: contractorId,
      jobId: jobNumber
    });

    if (contractorWD) {
      // Add new operations to existing opsDone array
      contractorWD.opsDone.push(...contractorWDOps);
    } else {
      // Create new Contractor_WD document
      contractorWD = new ContractorWD({
        contractorId: contractorId,
        jobId: jobNumber,
        opsDone: contractorWDOps
      });
    }

    await contractorWD.save();

    res.json({ 
      message: 'Work updated successfully', 
      updates,
      jobNumber,
      contractorId
    });
  } catch (error) {
    console.error('Error updating work in JobOpsMaster and Contractor_WD:', error);
    res.status(500).json({ error: 'Error updating work' });
  }
});

// Update work done (legacy endpoint)
router.post('/update', async (req, res) => {
  try {
    const { contractor, jobNumber, operations } = req.body;

    if (!contractor || !jobNumber || !operations || !Array.isArray(operations)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const job = await Job.findOne({ jobNumber });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const updates = [];

    for (const op of operations) {
      const { jobOperationId, qtyToAdd } = op;

      if (!jobOperationId || qtyToAdd === undefined) {
        continue;
      }

      const jobOperation = await JobOperation.findById(jobOperationId);
      if (!jobOperation) {
        continue;
      }

      // Find or create contractor work entry
      let contractorWork = jobOperation.contractorWork.find(
        cw => cw.contractor === contractor
      );

      if (contractorWork) {
        contractorWork.completedQty += qtyToAdd;
        // Ensure it doesn't exceed qtyPerBook
        contractorWork.completedQty = Math.min(
          contractorWork.completedQty,
          jobOperation.qtyPerBook
        );
      } else {
        jobOperation.contractorWork.push({
          contractor,
          completedQty: Math.min(qtyToAdd, jobOperation.qtyPerBook)
        });
      }

      await jobOperation.save();
      updates.push(jobOperation);
    }

    res.json({ message: 'Work updated successfully', updates });
  } catch (error) {
    console.error('Error updating work:', error);
    res.status(500).json({ error: 'Error updating work' });
  }
});

module.exports = router;
