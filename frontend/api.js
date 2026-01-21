// API Configuration
// Automatically detect environment: use production URL if not on localhost
// Points to contractor-po backend in main backend folder
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api'  // Local: contractor-po backend runs on port 3000
  : 'https://contractor-po-backend.onrender.com/api';  // Production: contractor-po backend subfolder

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

// Auth API
export const authAPI = {
  login: (userId, passkey) => apiCall('/auth/login', {
    method: 'POST',
    body: { userId, passkey }
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
  // extraJobData can include qty, clientName, jobTitle, productCat, unitPrice
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
  getById: (id) => apiCall(`/operations/${id}`),
  create: (opsName, type, ratePerUnit) => apiCall('/operations', {
    method: 'POST',
    body: { opsName, type, ratePerUnit }
  }),
  update: (id, opsName, type, ratePerUnit) => apiCall(`/operations/${id}`, {
    method: 'PUT',
    body: { opsName, type, ratePerUnit }
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

