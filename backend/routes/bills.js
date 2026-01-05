const express = require('express');
const router = express.Router();
const Bill = require('../models/Bill');
const Operation = require('../models/Operation');
const JobopsMaster = require('../models/JobOpsMaster');
const ContractorWD = require('../models/ContractorWD');
const Contractor = require('../models/Contractor');
const mongoose = require('mongoose');

// Helper function to generate next bill number (8-digit, starting from 00000001)
async function generateNextBillNumber() {
  try {
    // Find the highest bill number
    const lastBill = await Bill.findOne().sort({ billNumber: -1 });
    
    if (!lastBill) {
      // No bills exist, start from 00000001
      return '00000001';
    }
    
    // Extract the numeric part and increment
    const lastNumber = parseInt(lastBill.billNumber, 10);
    const nextNumber = lastNumber + 1;
    
    // Format as 8-digit string with leading zeros
    return nextNumber.toString().padStart(8, '0');
  } catch (error) {
    console.error('Error generating bill number:', error);
    throw error;
  }
}

// Get all bills (excluding deleted ones)
// Handles both new bills (with isDeleted field) and old bills (without isDeleted field)
router.get('/', async (req, res) => {
  try {
    // Query: isDeleted is not 1, OR isDeleted field doesn't exist (for backward compatibility)
    const bills = await Bill.find({
      $or: [
        { isDeleted: { $ne: 1 } },
        { isDeleted: { $exists: false } }
      ]
    }).sort({ billNumber: -1 });
    res.json(bills);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ error: 'Error fetching bills' });
  }
});

// Get bill by bill number
router.get('/:billNumber', async (req, res) => {
  try {
    const { billNumber } = req.params;
    const bill = await Bill.findOne({ billNumber });
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    res.json(bill);
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ error: 'Error fetching bill' });
  }
});

// Create new bill
router.post('/', async (req, res) => {
  try {
    const { contractorName, jobs } = req.body;

    if (!contractorName || !contractorName.trim()) {
      return res.status(400).json({ error: 'Contractor name is required' });
    }

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'At least one job is required' });
    }

    // Validate jobs structure
    for (const job of jobs) {
      if (!job.jobNumber || !job.jobNumber.trim()) {
        return res.status(400).json({ error: 'Each job must have a job number' });
      }
      if (!job.ops || !Array.isArray(job.ops) || job.ops.length === 0) {
        return res.status(400).json({ error: 'Each job must have at least one operation' });
      }

      for (const op of job.ops) {
        if (!op.opsName || !op.opsName.trim()) {
          return res.status(400).json({ 
            error: 'Each operation must have an operation name (opsName)' 
          });
        }
        if (
          op.qtyBook === undefined || 
          op.rate === undefined || 
          op.qtyCompleted === undefined || 
          op.totalValue === undefined
        ) {
          return res.status(400).json({ 
            error: 'Each operation must have qtyBook, rate, qtyCompleted, and totalValue' 
          });
        }

        // Validate numbers
        if (
          isNaN(Number(op.qtyBook)) || 
          isNaN(Number(op.rate)) || 
          isNaN(Number(op.qtyCompleted)) || 
          isNaN(Number(op.totalValue))
        ) {
          return res.status(400).json({ 
            error: 'All operation fields must be valid numbers' 
          });
        }

        if (
          Number(op.qtyBook) < 0 || 
          Number(op.rate) < 0 || 
          Number(op.qtyCompleted) < 0 || 
          Number(op.totalValue) < 0
        ) {
          return res.status(400).json({ 
            error: 'All operation values must be non-negative' 
          });
        }
      }
    }

    // Generate bill number
    const billNumber = await generateNextBillNumber();

    // Collect all unique opIds from all jobs
    const allOpIds = [];
    jobs.forEach(job => {
      job.ops.forEach(op => {
        if (op.opId) {
          allOpIds.push(op.opId);
        }
      });
    });

    // Fetch operation types for all operations
    const operationTypeMap = {};
    if (allOpIds.length > 0) {
      const opObjectIds = allOpIds.map(opId => {
        try {
          return new mongoose.Types.ObjectId(opId);
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      if (opObjectIds.length > 0) {
        const operationDocs = await Operation.find({ _id: { $in: opObjectIds } }).lean();
        operationDocs.forEach(op => {
          const idStr = op._id.toString();
          operationTypeMap[idStr] = op.type;
        });
      }
    }

    // Create bill
    const bill = new Bill({
      billNumber,
      contractorName: contractorName.trim(),
      jobs: jobs.map(job => ({
        jobNumber: job.jobNumber,
        clientName: job.clientName || '',
        jobTitle: job.jobTitle || '',
        ops: job.ops.map(op => {
          // Save qtyBook and rate as is, no calculations
          return {
            opsName: op.opsName.trim(),
            qtyBook: Number(op.qtyBook), // Save qtyBook as is, no calculation
            rate: Number(op.rate), // Save rate (which contains valuePerBook) as is, no calculation
            qtyCompleted: Number(op.qtyCompleted),
            totalValue: Number(op.totalValue)
          };
        })
      }))
    });

    await bill.save();
    res.status(201).json(bill);
  } catch (error) {
    console.error('Error creating bill:', error);
    if (error.code === 11000) {
      // Duplicate key error (bill number)
      return res.status(400).json({ error: 'Bill number already exists' });
    }
    res.status(500).json({ error: 'Error creating bill' });
  }
});

// Update bill
router.put('/:billNumber', async (req, res) => {
  try {
    const { billNumber } = req.params;
    const { contractorName, jobs } = req.body;

    const bill = await Bill.findOne({ billNumber });
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (contractorName !== undefined) {
      if (!contractorName || !contractorName.trim()) {
        return res.status(400).json({ error: 'Contractor name cannot be empty' });
      }
      bill.contractorName = contractorName.trim();
    }

    if (jobs !== undefined) {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'At least one job is required' });
      }

      // Validate jobs structure (same as create)
      for (const job of jobs) {
        if (!job.jobNumber || !job.jobNumber.trim()) {
          return res.status(400).json({ error: 'Each job must have a job number' });
        }
        if (!job.ops || !Array.isArray(job.ops) || job.ops.length === 0) {
          return res.status(400).json({ error: 'Each job must have at least one operation' });
        }

        for (const op of job.ops) {
          if (
            op.qtyBook === undefined || 
            op.rate === undefined || 
            op.qtyCompleted === undefined || 
            op.totalValue === undefined
          ) {
            return res.status(400).json({ 
              error: 'Each operation must have qtyBook, rate, qtyCompleted, and totalValue' 
            });
          }
        }
      }

      // Collect all unique opIds from all jobs
      const allOpIds = [];
      jobs.forEach(job => {
        job.ops.forEach(op => {
          if (op.opId) {
            allOpIds.push(op.opId);
          }
        });
      });

      // Fetch operation types for all operations
      const operationTypeMap = {};
      if (allOpIds.length > 0) {
        const opObjectIds = allOpIds.map(opId => {
          try {
            return new mongoose.Types.ObjectId(opId);
          } catch (error) {
            return null;
          }
        }).filter(Boolean);

        if (opObjectIds.length > 0) {
          const operationDocs = await Operation.find({ _id: { $in: opObjectIds } }).lean();
          operationDocs.forEach(op => {
            const idStr = op._id.toString();
            operationTypeMap[idStr] = op.type;
          });
        }
      }

      bill.jobs = jobs.map(job => ({
        jobNumber: job.jobNumber,
        clientName: job.clientName || '',
        jobTitle: job.jobTitle || '',
        ops: job.ops.map(op => {
          // Save qtyBook and rate as is, no calculations
          return {
            opsName: op.opsName.trim(),
            qtyBook: Number(op.qtyBook), // Save qtyBook as is, no calculation
            rate: Number(op.rate), // Save rate (which contains valuePerBook) as is, no calculation
            qtyCompleted: Number(op.qtyCompleted),
            totalValue: Number(op.totalValue)
          };
        })
      }));
    }

    await bill.save();
    res.json(bill);
  } catch (error) {
    console.error('Error updating bill:', error);
    res.status(500).json({ error: 'Error updating bill' });
  }
});

// Mark bill as paid
router.patch('/:billNumber/pay', async (req, res) => {
  try {
    const { billNumber } = req.params;
    const bill = await Bill.findOne({ billNumber });
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    
    bill.paymentStatus = 'Yes';
    bill.paymentDate = new Date();
    
    await bill.save();
    res.json(bill);
  } catch (error) {
    console.error('Error marking bill as paid:', error);
    res.status(500).json({ error: 'Error marking bill as paid' });
  }
});

// Soft delete bill (set isDeleted = 1 and update pending/completed quantities)
router.delete('/:billNumber', async (req, res) => {
  try {
    const { billNumber } = req.params;
    // Query: billNumber matches AND (isDeleted is not 1 OR isDeleted doesn't exist)
    const bill = await Bill.findOne({
      billNumber,
      $or: [
        { isDeleted: { $ne: 1 } },
        { isDeleted: { $exists: false } }
      ]
    });
    
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found or already deleted' });
    }

    // Find contractorId from contractorName (once, outside the loop)
    const contractor = await Contractor.findOne({ name: bill.contractorName.trim() });
    if (!contractor) {
      return res.status(404).json({ error: `Contractor not found for name: ${bill.contractorName}` });
    }
    const contractorId = contractor.contractorId;

    // Update JobopsMaster: increase pendingOpsQty for each operation
    for (const job of bill.jobs) {
      const jobOpsMaster = await JobopsMaster.findOne({ jobId: job.jobNumber });
      
      if (jobOpsMaster) {
        for (const op of job.ops) {
          // Find the operation by opsName to get its ID
          const operation = await Operation.findOne({ opsName: op.opsName.trim() });
          
          if (operation) {
            const opIdStr = operation._id.toString();
            const jobOp = jobOpsMaster.ops.find(jop => String(jop.opId) === opIdStr);
            
            if (jobOp) {
              const qtyCompleted = Number(op.qtyCompleted || 0);
              // Increase pendingOpsQty (reverse the deduction that was made when bill was created)
              jobOp.pendingOpsQty = Math.max(0, jobOp.pendingOpsQty + qtyCompleted);
              jobOp.lastUpdatedDate = new Date();
            }
          }
        }
        
        await jobOpsMaster.save();
      }

      // Update Contractor_WD: decrease opsDoneQty for each operation
      const contractorWD = await ContractorWD.findOne({
        contractorId: contractorId,
        jobId: job.jobNumber
      });
      
      if (contractorWD) {
        for (const op of job.ops) {
          // Find the operation in Contractor_WD
          const operation = await Operation.findOne({ opsName: op.opsName.trim() });
          
          if (operation) {
            const opIdStr = operation._id.toString();
            const wdOp = contractorWD.opsDone.find(od => String(od.opsId) === opIdStr);
            
            if (wdOp) {
              const qtyCompleted = Number(op.qtyCompleted || 0);
              // Decrease opsDoneQty (reverse the addition that was made when bill was created)
              wdOp.opsDoneQty = Math.max(0, wdOp.opsDoneQty - qtyCompleted);
              
              // If opsDoneQty becomes 0, we could remove the entry, but let's keep it
              // Remove entry if qty becomes 0 or less
              if (wdOp.opsDoneQty <= 0) {
                contractorWD.opsDone = contractorWD.opsDone.filter(od => String(od.opsId) !== opIdStr);
              }
            }
          }
        }
        
        // Only save if there are still operations, otherwise delete the document
        if (contractorWD.opsDone.length > 0) {
          await contractorWD.save();
        } else {
          await ContractorWD.deleteOne({ _id: contractorWD._id });
        }
      }
    }

    // Soft delete the bill
    bill.isDeleted = 1;
    await bill.save();
    
    res.json({ message: 'Bill deleted successfully' });
  } catch (error) {
    console.error('Error deleting bill:', error);
    res.status(500).json({ error: 'Error deleting bill', details: error.message });
  }
});

module.exports = router;
