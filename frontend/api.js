// API Configuration
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : 'https://cdcapi.onrender.com/api';

// Main backend base (non contractor-po prefixed routes in backend/src/routes.js)
const MAIN_API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : 'https://cdcapi.onrender.com/api';

// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Helper for main backend routes mounted at /api
async function apiCallMain(endpoint, options = {}) {
  const url = `${MAIN_API_BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Auth API
export const authAPI = {
  login: (userId, passkey) => apiCall('/auth/login', {
    method: 'POST',
    body: { userId, passkey }
  }),
  contractorLogin: (contractorIdOrName, password) => apiCall('/auth/contractor-login', {
    method: 'POST',
    body: { contractorIdOrName, password }
  }),
  register: (userId, passkey, name, role) => apiCall('/auth/register', {
    method: 'POST',
    body: { userId, passkey, name, role }
  })
};

// Jobs API
export const jobsAPI = {
  getAll: () => apiCall('/jobs'),
  search: (jobNumber) => apiCall(`/jobs/search/${encodeURIComponent(jobNumber)}`),
  getById: (id) => apiCall(`/jobs/${id}`),
  create: (jobData) => apiCall('/jobs', {
    method: 'POST',
    body: jobData
  }),
  addOperations: (jobId, operations) => apiCall(`/jobs/${jobId}/operations`, {
    method: 'POST',
    body: { operations }
  }),
  // Save to JobopsMaster (jobid = job number)
  // extraJobData can include qty, clientName, jobTitle, productCat, segmentName, unitPrice
  saveJobOpsMaster: (jobNumber, operations, extraJobData = {}) => apiCall('/jobs/jobopsmaster', {
    method: 'POST',
    body: { jobNumber, operations, ...extraJobData }
  }),
  // Get one JobopsMaster document by job number (used for copy-ops)
  getJobOpsMasterByJobNumber: (jobNumber) =>
    apiCall(`/jobs/jobopsmaster/by-job-number?jobNumber=${encodeURIComponent(jobNumber)}`),
  // Get all job numbers from JobopsMaster
  getJobNumbers: () => apiCall('/jobs/jobopsmaster/jobnumbers'),
  // Search job numbers from MSSQL (4+ digits)
  searchJobNumbers: (jobNumberPart) => apiCall(`/jobs/search-numbers/${encodeURIComponent(jobNumberPart)}`),
  // Get job details from MSSQL
  getJobDetails: (jobNumber) => apiCall(`/jobs/details/${encodeURIComponent(jobNumber)}`),
  // Delete an operation from JobopsMaster
  deleteOperationFromJob: (jobNumber, opId) => apiCall(`/jobs/jobopsmaster/operation?jobNumber=${encodeURIComponent(jobNumber)}&opId=${encodeURIComponent(opId)}`, {
    method: 'DELETE'
  })
};

// Operations API
export const operationsAPI = {
  getAll: (search) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiCall(`/operations${query}`);
  },
  getByCategory: (category) => {
    if (!category || !String(category).trim()) return Promise.resolve([]);
    return apiCall(`/operations?category=${encodeURIComponent(String(category).trim())}`);
  },
  getCategories: () => apiCall('/operations/categories'),
  getById: (id) => apiCall(`/operations/${id}`),
  create: (opsName, type, ratePerUnit, categories, isAdhocOp = false) => apiCall('/operations', {
    method: 'POST',
    body: { opsName, type, ratePerUnit, isAdhocOp: !!isAdhocOp, categories: Array.isArray(categories) ? categories : (categories != null && categories !== '' ? [String(categories)] : []) }
  }),
  update: (id, opsName, type, ratePerUnit, categories, isAdhocOp = false) => apiCall(`/operations/${id}`, {
    method: 'PUT',
    body: { opsName, type, ratePerUnit, isAdhocOp: !!isAdhocOp, categories: Array.isArray(categories) ? categories : (categories != null && categories !== '' ? [String(categories)] : []) }
  }),
  delete: (id) => apiCall(`/operations/${id}`, {
    method: 'DELETE'
  })
};

// Work API
export const workAPI = {
  getPending: (contractor, jobNumber) => apiCall(`/work/pending/${encodeURIComponent(contractor)}/${encodeURIComponent(jobNumber)}`),
  getPendingFromJobOpsMaster: (jobNumber) => apiCall(`/work/pending/jobopsmaster/${encodeURIComponent(jobNumber)}`),
  update: (contractor, jobNumber, operations) => apiCall('/work/update', {
    method: 'POST',
    body: { contractor, jobNumber, operations }
  }),
  updateJobOpsMaster: (contractorId, jobNumber, operations) => apiCall('/work/update/jobopsmaster', {
    method: 'POST',
    body: { contractorId, jobNumber, operations }
  }),
  // Save-only (no bill): reduces pending in JobOpsMaster + writes Contractor_WD with savedInBill:'No'
  saveJobOpsMaster: (contractorId, jobNumber, operations) => apiCall('/work/save/jobopsmaster', {
    method: 'POST',
    body: { contractorId, jobNumber, operations }
  }),
  // Save-only for ad-hoc
  saveAdhoc: (adhocOrderId, contractorId, operations) => apiCall('/work/save/adhoc', {
    method: 'POST',
    body: { adhocOrderId, contractorId, operations }
  }),
  // Fetch ALL Contractor_WD entries not yet in a bill, for a contractor (all jobs + adhoc)
  getAllUnsaved: (contractorId) =>
    apiCall(`/work/unsaved/all/${encodeURIComponent(contractorId)}`),
  // Fetch Contractor_WD entries not yet in a bill, for a job
  getUnsaved: (contractorId, jobNumber) =>
    apiCall(`/work/unsaved/${encodeURIComponent(contractorId)}/${encodeURIComponent(jobNumber)}`),
  // Fetch Contractor_WD entries not yet in a bill, for an ad-hoc order
  getUnsavedAdhoc: (contractorId, adhocOrderId) =>
    apiCall(`/work/unsaved/adhoc/${encodeURIComponent(contractorId)}/${encodeURIComponent(adhocOrderId)}`),
  // After bill creation, mark those Contractor_WD entries as savedInBill:'Yes'
  markBilled: (contractorId, items) => apiCall('/work/mark-billed', {
    method: 'POST',
    body: { contractorId, items }
  }),
  // Reverse a save: restores pending in JobOpsMaster/AdhocWorkOrder + removes Contractor_WD entry
  unsave: (contractorId, items) => apiCall('/work/unsave', {
    method: 'POST',
    body: { contractorId, items }
  })
};

// Contractors API
export const contractorsAPI = {
  getAll: () => apiCall('/contractors'),
  create: (name) => apiCall('/contractors', {
    method: 'POST',
    body: { name }
  }),
  update: (id, name) => apiCall(`/contractors/${id}`, {
    method: 'PUT',
    body: { name }
  }),
  delete: (id) => apiCall(`/contractors/${id}`, {
    method: 'DELETE'
  })
};

// Bills API
export const billsAPI = {
  getAll: () => apiCall('/bills'),
  getByJobNumber: (jobNumber) => apiCall(`/bills/by-job/${encodeURIComponent(jobNumber)}`),
  getByBillNumber: (billNumber) => apiCall(`/bills/${billNumber}`),
  create: (contractorName, jobs) => apiCall('/bills', {
    method: 'POST',
    body: { contractorName, jobs }
  }),
  update: (billNumber, contractorName, jobs) => apiCall(`/bills/${billNumber}`, {
    method: 'PUT',
    body: { contractorName, jobs }
  }),
  checkRoomRent: (contractorName) => apiCall(`/bills/check-roomrent/${encodeURIComponent(contractorName)}`),
  markAsPaid: (billNumber, roomRent) => apiCall(`/bills/${billNumber}/pay`, {
    method: 'PATCH',
    body: roomRent !== undefined ? { roomRent } : {}
  }),
  delete: (billNumber) => apiCall(`/bills/${billNumber}`, {
    method: 'DELETE'
  })
};

// Bill editing API (qtyCompleted only)
export const billEditAPI = {
  editQuantities: (billNumber, contractorId, changes) =>
    apiCall(`/bills/${encodeURIComponent(billNumber)}/edit-qty`, {
      method: 'PUT',
      body: { contractorId, changes }
    })
};

// Summary API
export const summaryAPI = {
  getSummary: () => apiCall('/summary'),
  getChartData: (filterType = 'year', year, month, quarter) => {
    const params = new URLSearchParams();
    params.set('filterType', filterType);
    if (year != null) params.set('year', String(year));
    if (month != null) params.set('month', String(month));
    if (quarter != null) params.set('quarter', String(quarter));
    return apiCall(`/summary/chart?${params.toString()}`);
  }
};

// Series API
export const seriesAPI = {
  getAll: () => apiCall('/series'),
  getById: (id) => apiCall(`/series/${id}`),
  create: (jobNumbers) => apiCall('/series', {
    method: 'POST',
    body: { jobNumbers }
  }),
  searchByJobNumber: (jobNumber) => apiCall(`/series/search/${encodeURIComponent(jobNumber)}`)
};

// Ad-hoc work orders API
export const adhocOrdersAPI = {
  getAll: () => apiCallMain('/adhoc-orders'),
  getById: (id) => apiCallMain(`/adhoc-orders/${id}`),
  getStatus: (id) => apiCallMain(`/adhoc-orders/${id}/status`),
  getPending: (id) => apiCallMain(`/work/pending/adhoc/${id}`),
  create: (data) => apiCallMain('/adhoc-orders', {
    method: 'POST',
    body: data
  }),
  update: (id, data) => apiCallMain(`/adhoc-orders/${id}`, {
    method: 'PUT',
    body: data
  }),
  delete: (id) => apiCallMain(`/adhoc-orders/${id}`, {
    method: 'DELETE'
  }),
  updateWorkDone: (adhocOrderId, contractorId, operations) => apiCallMain('/work/update/adhoc', {
    method: 'POST',
    body: { adhocOrderId, contractorId, operations }
  })
};

