# Contractor PO System

A full-stack application for managing contractor purchase orders, jobs, operations, and work tracking.

## Project Structure

```
Contractor PO System/
├── frontend/          # Frontend HTML/CSS/JS files
│   ├── index.html
│   ├── home.html
│   ├── add-ops.html
│   ├── add-new-ops.html
│   ├── work-done.html
│   ├── styles.css
│   └── api.js         # API client for backend communication
│
└── backend/           # Node.js/Express backend
    ├── server.js      # Main server file
    ├── models/        # MongoDB models
    │   ├── User.js
    │   ├── Job.js
    │   ├── Operation.js
    │   └── JobOperation.js
    └── routes/        # API routes
        ├── auth.js
        ├── jobs.js
        ├── operations.js
        └── work.js
```

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas)
- npm or yarn

## Setup Instructions

### 1. Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the backend directory:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/contractor-po-system
   JWT_SECRET=your-secret-key-change-this-in-production
   NODE_ENV=development
   ```

   **For MongoDB Atlas (cloud):**
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/contractor-po-system
   ```

4. Start MongoDB (if using local installation):
   - Windows: Make sure MongoDB service is running
   - Mac/Linux: `mongod` or `brew services start mongodb-community`

5. Start the backend server:
   ```bash
   npm start
   ```
   
   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

   The server will run on `http://localhost:3000`

### 2. Frontend Setup

The frontend is static HTML/CSS/JS files. You can:

1. **Option A: Use a simple HTTP server** (recommended for development):
   ```bash
   cd frontend
   # Using Python
   python -m http.server 8000
   
   # Or using Node.js http-server
   npx http-server -p 8000
   ```

2. **Option B: Open directly in browser** (may have CORS issues):
   - Simply open `index.html` in your browser
   - Note: You may need to configure CORS in the backend for this to work

3. Access the application at `http://localhost:8000`

### 3. Initial Setup

1. **Create a user account:**
   - You can use the API directly or create a simple script:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"userId":"admin","passkey":"password123","name":"Admin","role":"admin"}'
   ```

2. **Login** using the credentials you created.

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with userId and passkey
- `POST /api/auth/register` - Register new user

### Jobs
- `GET /api/jobs` - Get all jobs
- `GET /api/jobs/search/:jobNumber` - Search job by number
- `GET /api/jobs/:id` - Get job by ID
- `POST /api/jobs` - Create new job
- `POST /api/jobs/:jobId/operations` - Add operations to job

### Operations
- `GET /api/operations` - Get all operations (optional ?search=query)
- `GET /api/operations/:id` - Get operation by ID
- `POST /api/operations` - Create new operation
- `PUT /api/operations/:id` - Update operation
- `DELETE /api/operations/:id` - Delete operation

### Work
- `GET /api/work/pending/:contractor/:jobNumber` - Get pending operations
- `POST /api/work/update` - Update work done

## Features

- **User Authentication**: Login system with JWT tokens
- **Job Management**: Create and search jobs
- **Operations Management**: Create and manage standard operations
- **Job Operations**: Add operations to specific jobs
- **Work Tracking**: Track work done by contractors for each job
- **Real-time Updates**: Frontend communicates with MongoDB through REST API

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens), bcryptjs

## Development Notes

- The frontend uses ES6 modules for API communication
- CORS is enabled for development (configure for production)
- JWT tokens are stored in localStorage
- MongoDB connection string can be configured via environment variables

## Troubleshooting

1. **MongoDB Connection Error**: 
   - Ensure MongoDB is running
   - Check the MONGODB_URI in `.env` file
   - Verify network connectivity for MongoDB Atlas

2. **CORS Errors**:
   - Make sure backend is running on port 3000
   - Check that frontend is accessing the correct API URL in `api.js`

3. **Port Already in Use**:
   - Change PORT in `.env` file
   - Or stop the process using the port

## License

ISC
