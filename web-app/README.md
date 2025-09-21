# Valorant Discord Bot - Web App

A beautiful React web application showcasing the Valorant Discord Bot features and providing easy bot invitation.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   cd web-app
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```

3. **Open Browser**
   Navigate to `http://localhost:3000`

## 🛠️ Setup Bot Invite Link

### Method 1: Automatic (Recommended)
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Go to "General Information"
4. Copy the "Application ID" (Client ID)
5. Replace `YOUR_CLIENT_ID_HERE` in `src/App.js` line 45 with your actual Client ID

### Method 2: Manual URL
Use this template and replace `YOUR_CLIENT_ID` with your bot's Client ID:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

## 📋 Required Bot Permissions

Make sure your bot has these permissions:
- ✅ Send Messages
- ✅ Use Slash Commands  
- ✅ Manage Channels
- ✅ Manage Messages
- ✅ Embed Links
- ✅ Attach Files
- ✅ Read Message History

## 🎨 Features

- **Responsive Design**: Works on desktop and mobile
- **Interactive Guide**: Step-by-step bot setup instructions
- **Feature Showcase**: Highlights all bot capabilities
- **One-Click Invite**: Direct bot invitation link
- **Modern UI**: Beautiful gradient design with smooth animations

## 🚀 Deployment

### Deploy to Vercel (Recommended)
1. Push your code to GitHub
2. Connect your repository to [Vercel](https://vercel.com)
3. Deploy automatically

### Deploy to Netlify
1. Build the project: `npm run build`
2. Upload the `build` folder to [Netlify](https://netlify.com)

### Deploy to GitHub Pages
1. Install gh-pages: `npm install --save-dev gh-pages`
2. Add to package.json scripts:
   ```json
   "predeploy": "npm run build",
   "deploy": "gh-pages -d build"
   ```
3. Deploy: `npm run deploy`

## 🔧 Customization

### Change Colors
Edit the CSS variables in `src/index.css`:
```css
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --accent-color: #ff6b6b;
}
```

### Update Content
Edit `src/App.js` to modify:
- Bot features and descriptions
- Commands list
- Statistics
- Links and contact information

## 📱 Mobile Support

The web app is fully responsive and optimized for:
- 📱 Mobile phones (320px+)
- 📱 Tablets (768px+)
- 💻 Desktop (1024px+)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.
