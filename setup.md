# Quick Setup Guide

## Step 1: Install MongoDB

### Option A: Local MongoDB
- Download from: https://www.mongodb.com/try/download/community
- Install and start MongoDB service
- Default connection: `mongodb://localhost:27017/contractor-po-system`

### Option B: MongoDB Atlas (Cloud - Free)
- Sign up at: https://www.mongodb.com/cloud/atlas
- Create a free cluster
- Get connection string and update `.env` file

## Step 2: Setup Backend

```bash
cd backend
npm install
```

Create `.env` file:
```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/contractor-po-system
JWT_SECRET=your-secret-key-here
NODE_ENV=development
```

Start backend:
```bash
npm start
```

## Step 3: Setup Frontend

Open a new terminal:

```bash
cd frontend
# Option 1: Python
python -m http.server 8000

# Option 2: Node.js
npx http-server -p 8000
```

## Step 4: Create First User

Open browser console or use curl:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin","passkey":"admin123","name":"Admin User"}'
```

Or use Postman/Thunder Client to POST to `http://localhost:3000/api/auth/register` with:
```json
{
  "userId": "admin",
  "passkey": "admin123",
  "name": "Admin User",
  "role": "admin"
}
```

## Step 5: Access Application

1. Open browser: `http://localhost:8000`
2. Login with your credentials
3. Start using the system!

## Troubleshooting

- **Backend won't start**: Check if MongoDB is running
- **CORS errors**: Make sure backend is running on port 3000
- **Module errors**: Use a local server (not file://) for frontend
