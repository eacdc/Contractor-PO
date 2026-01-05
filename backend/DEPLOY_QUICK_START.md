# Quick Deployment Checklist

## ✅ Pre-Deployment Checklist

- [ ] Backend folder pushed to GitHub
- [ ] MongoDB Atlas account created
- [ ] MongoDB connection string ready
- [ ] Render account created

## 🚀 Deployment Steps

### 1. MongoDB Atlas Setup (5 minutes)
1. Create cluster at https://www.mongodb.com/cloud/atlas
2. Create database user
3. Whitelist IP: `0.0.0.0/0` (for Render)
4. Copy connection string

### 2. Render Deployment (10 minutes)
1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repo
4. Configure:
   - **Name**: `contractor-po-backend`
   - **Root Directory**: Leave empty (if backend is repo root) OR `backend` (if in subfolder)
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add Environment Variables:
   ```
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
   JWT_SECRET=<generate-random-string>
   MSSQL_SERVER=cdcindas.24mycloud.com
   MSSQL_PORT=51175
   MSSQL_DATABASE=IndusEnterprise
   MSSQL_USER=indus
   MSSQL_PASSWORD=Param@99811
   ```
6. Click "Create Web Service"
7. Wait for deployment (2-5 minutes)

### 3. Verify (2 minutes)
1. Check deployment logs
2. Test: `https://your-app.onrender.com/api/health`
3. Should return: `{"status":"OK","message":"Server is running"}`

### 4. Update Frontend
Update `frontend/api.js`:
```javascript
const API_BASE_URL = 'https://your-app.onrender.com';
```

## 📝 Environment Variables Reference

| Variable | Required | Example |
|----------|----------|---------|
| `MONGODB_URI` | ✅ Yes | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `JWT_SECRET` | ✅ Yes | Random string (use: `openssl rand -base64 32`) |
| `MSSQL_SERVER` | ✅ Yes | `cdcindas.24mycloud.com` |
| `MSSQL_PORT` | ✅ Yes | `51175` |
| `MSSQL_DATABASE` | ✅ Yes | `IndusEnterprise` |
| `MSSQL_USER` | ✅ Yes | `indus` |
| `MSSQL_PASSWORD` | ✅ Yes | `Param@99811` |
| `PORT` | ⚠️ Optional | Render sets automatically |
| `NODE_ENV` | ⚠️ Optional | `production` |

## 🔒 Security Notes

- ✅ Database credentials now use environment variables
- ⚠️ Never commit `.env` files to GitHub
- ⚠️ Mark sensitive variables as "Secret" in Render
- ⚠️ Use strong `JWT_SECRET` in production

## 🆘 Troubleshooting

**Build fails?**
- Check `package.json` has `start` script
- Verify Node.js version

**App crashes?**
- Check Render logs
- Verify all env vars are set
- Test MongoDB connection string

**Connection errors?**
- Verify MongoDB Atlas network access
- Check MSSQL server is accessible from Render

## 📚 Full Guide

See `RENDER_DEPLOYMENT.md` for detailed instructions.
