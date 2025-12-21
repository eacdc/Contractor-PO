const express = require('express');

const router = express.Router();

const Job = require('../models/Job');

const JobOperation = require('../models/JobOperation');

const Operation = require('../models/Operation');

const ContractorWD = require('../models/ContractorWD');

const Contractor = require('../models/Contractor');

const JobopsMaster = require('../models/JobOpsMaster');

const { getConnection, sql } = require('../config/db');



// Get all jobs

router.get('/', async (req, res) => {

  try {

    const jobs = await Job.find().sort({ createdAt: -1 });

    res.json(jobs);

  } catch (error) {

    console.error('Error fetching jobs:', error);

    res.status(500).json({ error: 'Error fetching jobs' });

  }

});



// Search job by number

router.get('/search/:jobNumber', async (req, res) => {

  try {

    const { jobNumber } = req.params;



    // Get previous operations from JobopsMaster (jobId = job number)

    const jobOpsMaster = await JobopsMaster.findOne({ jobId: jobNumber }).lean();



    // Build previous operations summary from JobopsMaster + Contractor_WD

    let previousOps = null;



    if (jobOpsMaster && jobOpsMaster.ops && jobOpsMaster.ops.length > 0) {

      try {

        // Get all opIds from JobopsMaster

        const opIds = jobOpsMaster.ops.map(op => op.opId);



        // Get operation names from Operation collection

        const opsDocs = await Operation.find(

          { _id: { $in: opIds } },

          { _id: 1, opsName: 1 }

        ).lean();



        const opsNameById = {};

        opsDocs.forEach(op => {

          opsNameById[op._id.toString()] = op.opsName;

        });



        // Check Contractor_WD for completed work (jobId is job number string)

        const contractorWDDocs = await ContractorWD.find({

          jobId: jobNumber

        }).lean();



        // Collect unique contractor IDs

        const contractorIds = [

          ...new Set(contractorWDDocs.map(doc => doc.contractorId))

        ];



        // Get contractor names

        const contractors = await Contractor.find({

          contractorId: { $in: contractorIds }

        }).lean();



        const contractorNameById = {};

        contractors.forEach(c => {

          contractorNameById[c.contractorId] = c.name;

        });



        // Aggregate completed quantities by operation and contractor

        const quantitiesByOpAndContractor = {};

        const totalCompletedByOp = {}; // Track total completed across all contractors



        contractorWDDocs.forEach(doc => {

          const contractorId = doc.contractorId;

          (doc.opsDone || []).forEach(od => {

            if (!od.opsId || od.opsDoneQty == null) {

              return;

            }

            // Only count if this opId exists in JobopsMaster

            if (opIds.includes(od.opsId)) {

              if (!quantitiesByOpAndContractor[od.opsId]) {

                quantitiesByOpAndContractor[od.opsId] = {};

              }

              if (!quantitiesByOpAndContractor[od.opsId][contractorId]) {

                quantitiesByOpAndContractor[od.opsId][contractorId] = 0;

              }

              quantitiesByOpAndContractor[od.opsId][contractorId] += od.opsDoneQty;

              

              // Track total completed for this operation

              if (!totalCompletedByOp[od.opsId]) {

                totalCompletedByOp[od.opsId] = 0;

              }

              totalCompletedByOp[od.opsId] += od.opsDoneQty;

            }

          });

        });



        // Build previousOps from JobopsMaster.ops

        previousOps = {

          contractors: contractorIds.map(id => ({

            contractorId: id,

            name: contractorNameById[id] || id

          })),

          operations: jobOpsMaster.ops.map(op => {

            const totalOpsQty = op.totalOpsQty || 0;

            const totalCompleted = totalCompletedByOp[op.opId] || 0;

            const pending = Math.max(0, totalOpsQty - totalCompleted);

            

            return {

              opsId: op.opId,

              opsName: opsNameById[op.opId] || 'Unknown',

              totalOpsQty,

              totalCompleted,

              pending,

              quantitiesByContractor:

                quantitiesByOpAndContractor[op.opId] || {}

            };

          })

        };

      } catch (aggError) {

        console.error('Error building previous ops summary:', aggError);

      }

    }



    // Return response (job can be null if not in Job collection, but we don't need it)

    res.json({

      job: null, // Not using Job collection anymore

      operations: [], // Not using JobOperation collection anymore

      previousOps

    });

  } catch (error) {

    console.error('Error searching job:', error);

    res.status(500).json({ error: 'Error searching job' });

  }

});



// Get job by ID

router.get('/:id', async (req, res) => {

  try {

    const job = await Job.findById(req.params.id);

    if (!job) {

      return res.status(404).json({ error: 'Job not found' });

    }



    const operations = await JobOperation.find({ job: job._id })

      .populate('operation', 'opsName type');



    res.json({

      job,

      operations

    });

  } catch (error) {

    console.error('Error fetching job:', error);

    res.status(500).json({ error: 'Error fetching job' });

  }

});



// Create new job

router.post('/', async (req, res) => {

  try {

    const { jobNumber, clientName, jobTitle, qty, productCat, unitPrice } = req.body;



    if (!jobNumber || !clientName || !jobTitle || !qty) {

      return res.status(400).json({ error: 'Missing required fields' });

    }



    // Check if job number already exists

    const existingJob = await Job.findOne({ jobNumber });

    if (existingJob) {

      return res.status(400).json({ error: 'Job number already exists' });

    }



    const job = new Job({

      jobNumber,

      clientName,

      jobTitle,

      qty,

      productCat: productCat || '',

      unitPrice: unitPrice || 0

    });



    await job.save();

    res.status(201).json(job);

  } catch (error) {

    console.error('Error creating job:', error);

    res.status(500).json({ error: 'Error creating job' });

  }

});



// Add operations to job (existing JobOperation-based endpoint)

router.post('/:jobId/operations', async (req, res) => {

  try {

    const { jobId } = req.params;

    const { operations } = req.body; // Array of { operationId, qtyPerBook, rate, ratePerBook }



    const job = await Job.findById(jobId);

    if (!job) {

      return res.status(404).json({ error: 'Job not found' });

    }



    const createdOperations = [];



    for (const op of operations) {

      const { operationId, qtyPerBook, rate, ratePerBook } = op;



      if (!operationId || qtyPerBook === undefined || rate === undefined || ratePerBook === undefined) {

        continue; // Skip invalid operations

      }



      const jobOperation = new JobOperation({

        job: jobId,

        operation: operationId,

        qtyPerBook,

        rate,

        ratePerBook,

        contractorWork: []

      });



      await jobOperation.save();

      createdOperations.push(jobOperation);

    }



    res.status(201).json(createdOperations);

  } catch (error) {

    console.error('Error adding operations to job:', error);

    res.status(500).json({ error: 'Error adding operations to job' });

  }

});



// Save Job Ops to JobopsMaster only (no Job / JobOperation)

router.post('/jobopsmaster', async (req, res) => {

  try {

    const {

      jobNumber,

      operations,

      qty

    } = req.body;



    if (!jobNumber || !operations || !Array.isArray(operations) || operations.length === 0) {

      return res.status(400).json({ error: 'Job number and at least one operation are required' });

    }



    // totalQty in JobopsMaster should be the qty from UI

    const totalQty = Number(qty || 0);



    const ops = operations

      .map(op => {

        const { operationId, qtyPerBook, ratePerBook } = op;

        if (!operationId || qtyPerBook === undefined || ratePerBook === undefined) {

          return null;

        }



        const qtyPerBookNum = Number(qtyPerBook);

        const valuePerBookNum = Number(ratePerBook);



        if (isNaN(qtyPerBookNum) || qtyPerBookNum < 0 || isNaN(valuePerBookNum) || valuePerBookNum < 0) {

          return null;

        }



        const totalOpsQty = qtyPerBookNum * totalQty;



        return {

          opId: String(operationId),

          qtyPerBook: qtyPerBookNum,

          totalOpsQty,

          pendingOpsQty: totalOpsQty, // completed qty = 0 initially

          valuePerBook: valuePerBookNum

        };

      })

      .filter(Boolean);



    if (ops.length === 0) {

      return res.status(400).json({ error: 'No valid operations to save' });

    }



    // jobId in JobopsMaster is exactly the job number from UI

    let jobOpsMaster = await JobopsMaster.findOne({ jobId: jobNumber });



    if (!jobOpsMaster) {

      // Create new JobopsMaster document

      jobOpsMaster = new JobopsMaster({

        jobId: jobNumber,

        totalQty,

        ops

      });

    } else {

      // Update totalQty (use the latest value from UI)

      jobOpsMaster.totalQty = totalQty;

      

      // Get existing opIds to avoid duplicates

      const existingOpIds = new Set(jobOpsMaster.ops.map(existingOp => existingOp.opId));

      

      // Filter out new ops that already exist (same opId)

      const newOpsToAdd = ops.filter(newOp => !existingOpIds.has(newOp.opId));

      

      // Append new operations to existing ones

      if (newOpsToAdd.length > 0) {

        jobOpsMaster.ops = [...jobOpsMaster.ops, ...newOpsToAdd];

      }

    }



    await jobOpsMaster.save();



    res.status(201).json(jobOpsMaster);

  } catch (error) {

    console.error('Error saving job operations to JobopsMaster:', error);

    res.status(500).json({ error: 'Error saving job operations' });

  }

});



// Get all job numbers from JobopsMaster

router.get('/jobopsmaster/jobnumbers', async (req, res) => {

  try {

    const jobOpsMasters = await JobopsMaster.find({}, 'jobId').sort({ jobId: 1 }).lean();

    const jobNumbers = jobOpsMasters.map(job => job.jobId);

    res.json(jobNumbers);

  } catch (error) {

    console.error('Error fetching job numbers:', error);

    res.status(500).json({ error: 'Error fetching job numbers' });

  }

});



// Search job numbers from MSSQL (when 4+ digits entered)

router.get('/search-numbers/:jobNumberPart', async (req, res) => {

  try {

    const { jobNumberPart } = req.params;

    console.log('🔍 [BACKEND] /jobs/search-numbers called with jobNumberPart:', jobNumberPart);

    if (!jobNumberPart || jobNumberPart.length < 4) {

      return res.status(400).json({ error: 'Job number part must be at least 4 characters' });

    }



    const connectionStartTime = Date.now();
    const pool = await getConnection();
    const connectionTime = Date.now() - connectionStartTime;
    console.log(`⏱️ [MSSQL] Connection obtained in ${connectionTime}ms`);

    const request = pool.request();

    // Pass as string parameter to stored procedure

    request.input('JobNumberPart', sql.NVarChar(255), String(jobNumberPart));

    console.log('🔍 [MSSQL] Calling dbo.contractor_search_jobnumbers with @JobNumberPart =', jobNumberPart);

    const queryStartTime = Date.now();
    const result = await request.execute('dbo.contractor_search_jobnumbers');
    const queryTime = Date.now() - queryStartTime;
    console.log(`⏱️ [MSSQL] Stored procedure executed in ${queryTime}ms`);

    console.log('🔍 [MSSQL] Raw result.recordset:', JSON.stringify(result.recordset, null, 2));

    console.log('🔍 [MSSQL] result.recordset.length:', result.recordset.length);

    

    // Extract job numbers from result

    // The procedure should return a recordset with job numbers

    const jobNumbers = result.recordset.map((row, index) => {

      console.log(`🔍 [MSSQL] Row ${index}:`, JSON.stringify(row, null, 2));

      // Try common column name variations

      const jobNum = row.JobNumber || row.Job_Number || row.jobNumber || row.job_number || 

             row.JobNo || row.Job_NO || Object.values(row)[0];

      console.log(`🔍 [MSSQL] Row ${index} extracted jobNumber:`, jobNum);

      return jobNum;

    }).filter(Boolean); // Remove any undefined/null values

    console.log('🔍 [BACKEND] Final jobNumbers array:', jobNumbers);

    res.json(jobNumbers);

  } catch (error) {

    console.error('❌ [BACKEND] Error searching job numbers:', error);

    console.error('❌ [BACKEND] Error stack:', error.stack);

    res.status(500).json({ error: 'Error searching job numbers: ' + error.message });

  }

});



// Get job details from MSSQL (when job number selected)

router.get('/details/:jobNumber', async (req, res) => {

  try {

    const { jobNumber } = req.params;

    

    if (!jobNumber) {

      return res.status(400).json({ error: 'Job number is required' });

    }



    const connectionStartTime = Date.now();
    const pool = await getConnection();
    const connectionTime = Date.now() - connectionStartTime;
    console.log(`⏱️ [MSSQL] Connection obtained in ${connectionTime}ms`);

    const request = pool.request();

    request.input('JobBookingNo', sql.NVarChar(255), jobNumber);

    console.log('🔍 [MSSQL] Calling dbo.contractor_get_job_details with @JobBookingNo =', jobNumber);
    const queryStartTime = Date.now();
    const result = await request.execute('dbo.contractor_get_job_details');
    const queryTime = Date.now() - queryStartTime;
    console.log(`⏱️ [MSSQL] Stored procedure executed in ${queryTime}ms`);

    

    if (result.recordset.length === 0) {

      return res.status(404).json({ error: 'Job not found' });

    }



    const jobDetails = result.recordset[0];

    

    // Map MSSQL column names to our expected format based on the image description

    // Columns: Client Name, Job Title, OrderQty, ProductCategory, UnitPrice

    res.json({

      clientName: jobDetails['Client Name'] || jobDetails.ClientName || jobDetails.clientName || '',

      jobTitle: jobDetails['Job Title'] || jobDetails.JobTitle || jobDetails.jobTitle || '',

      qty: jobDetails.OrderQty || jobDetails.orderQty || jobDetails.Qty || jobDetails.qty || 0,

      productCat: jobDetails.ProductCategory || jobDetails.productCategory || jobDetails.ProductCat || jobDetails.productCat || '',

      unitPrice: jobDetails.UnitPrice || jobDetails.unitPrice || jobDetails.unit_price || 0

    });

  } catch (error) {

    console.error('Error fetching job details:', error);

    res.status(500).json({ error: 'Error fetching job details: ' + error.message });

  }

});



module.exports = router;

