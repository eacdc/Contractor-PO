# Deploying Contractor PO Backend to Render

This guide will walk you through deploying your Contractor PO backend to Render.

## Prerequisites

1. ✅ Backend folder pushed to GitHub (already done)
2. MongoDB Atlas account (free tier available)
3. Render account (free tier available)

## Step 1: Prepare Your GitHub Repository

Make sure your backend folder is the **root** of your GitHub repository, or note the path to the backend folder.

**Repository Structure Options:**

**Option A: Backend folder is the root** (Recommended)
```
your-repo/
├── server.js
├── package.json
├── config/
├── models/
└── routes/
```

**Option B: Backend folder is in a subdirectory**
```
your-repo/
└── backend/
    ├── server.js
    ├── package.json
    └── ...
```

## Step 2: Set Up MongoDB Atlas (Cloud Database)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up or log in
3. Create a new cluster (free tier: M0)
4. Create a database user:
   - Go to "Database Access"
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Save the username and password
5. Whitelist IP addresses:
   - Go to "Network Access"
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0) for Render
6. Get your connection string:
   - Go to "Database" → "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Example: `mongodb+srv://username:password@cluster.mongodb.net/contractor-po-system`

## Step 3: Deploy to Render

### 3.1 Create a New Web Service

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click "New +" → "Web Service"
3. Connect your GitHub account if not already connected
4. Select your repository containing the backend
5. Configure the service:

   **Basic Settings:**
   - **Name**: `contractor-po-backend` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `main` (or your default branch)
   - **Root Directory**: 
     - If backend is root: Leave empty
     - If backend is in subfolder: Enter `backend` (or your folder name)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

   **Advanced Settings → Environment Variables:**
   Add these environment variables:
   ```
   PORT=10000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/contractor-po-system
   JWT_SECRET=your-super-secret-jwt-key-change-this-to-random-string
   NODE_ENV=production
   ```

   **Important Notes:**
   - Render automatically sets `PORT`, but you can override it
   - Use your MongoDB Atlas connection string from Step 2
   - Generate a strong random string for `JWT_SECRET` (you can use: `openssl rand -base64 32`)

### 3.2 Create the Service

1. Click "Create Web Service"
2. Render will start building and deploying your application
3. Wait for the build to complete (usually 2-5 minutes)

## Step 4: Verify Deployment

1. Once deployed, Render will provide a URL like: `https://contractor-po-backend.onrender.com`
2. Test the health endpoint: `https://your-app-url.onrender.com/api/health`
3. You should see: `{"status":"OK","message":"Server is running"}`

## Step 5: Update Frontend API URL

Update your frontend `api.js` file to point to your Render backend URL:

```javascript
const API_BASE_URL = 'https://your-app-url.onrender.com';
```

## Important Security Notes

⚠️ **CRITICAL**: Your `config/db.js` file contains hardcoded database credentials. For production:

1. **Update `config/db.js`** to use environment variables:
   ```javascript
   const config = {
     server: process.env.MSSQL_SERVER || 'cdcindas.24mycloud.com',
     port: parseInt(process.env.MSSQL_PORT || '51175'),
     database: process.env.MSSQL_DATABASE || 'IndusEnterprise',
     user: process.env.MSSQL_USER || 'indus',
     password: process.env.MSSQL_PASSWORD || 'Param@99811',
     // ... rest of config
   };
   ```

2. **Add these environment variables in Render:**
   ```
   MSSQL_SERVER=cdcindas.24mycloud.com
   MSSQL_PORT=51175
   MSSQL_DATABASE=IndusEnterprise
   MSSQL_USER=indus
   MSSQL_PASSWORD=Param@99811
   ```

3. **Never commit `.env` files or hardcoded credentials to GitHub**

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure `package.json` has correct `start` script
- Verify Node.js version compatibility

### Application Crashes
- Check logs in Render dashboard
- Verify all environment variables are set correctly
- Ensure MongoDB connection string is correct
- Check that MongoDB Atlas allows connections from Render's IPs

### Database Connection Errors
- Verify MongoDB Atlas connection string
- Check network access settings in MongoDB Atlas
- Ensure database user has proper permissions

### CORS Errors
- Your backend already has `cors()` enabled, which should work
- If issues persist, you may need to configure CORS for your frontend domain

## Render Free Tier Limitations

- Services spin down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- Consider upgrading to paid plan for always-on service

## Next Steps

1. ✅ Backend deployed to Render
2. 🔄 Update frontend API URL
3. 🔒 Secure database credentials (use environment variables)
4. 🧪 Test all API endpoints
5. 📝 Update documentation with production URLs

## Support

If you encounter issues:
1. Check Render build and runtime logs
2. Verify environment variables are set correctly
3. Test MongoDB connection string locally
4. Check Render status page: https://status.render.com/
