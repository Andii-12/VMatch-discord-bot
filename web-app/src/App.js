import React, { useState } from 'react';
import './App.css';

function App() {
  const [showInviteGuide, setShowInviteGuide] = useState(false);

  const features = [
    {
      icon: '⚔️',
      title: 'Matchmaking',
      description: '1v1 duels and 5v5 team battles with MMR-based matching.',
      commands: ['/vmode', '/vplay', '/vmatch']
    },
    {
      icon: '🏆',
      title: 'MMR System',
      description: 'Dynamic ranking system with separate 1v1 and 5v5 stats.',
      commands: ['/rank', 'Smart calculations', 'Win/Loss tracking']
    },
    {
      icon: '⚡',
      title: 'Quick Setup',
      description: 'Accept/decline system with automatic match management.',
      commands: ['30s for 1v1', '60s for 5v5', 'Auto-cancel']
    }
  ];

  const stats = [
    { number: '2', label: 'Modes' },
    { number: '10', label: 'Players' },
    { number: '∞', label: 'Matches' }
  ];

  const generateInviteLink = () => {
    const clientId = '1419196946198827088'; // Your bot's client ID
    const permissions = '8'; // Administrator permission
    const scope = 'bot%20applications.commands';
    
    return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=${scope}`;
  };

  return (
    <div className="App">
      <div className="container">
        <div className="hero">
          <h1>Valorant Bot</h1>
          <p>Custom matchmaking with MMR ranking</p>
          
          <div className="cta-section">
            <a 
              href={generateInviteLink()} 
              className="cta-button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Invite Bot
            </a>
            
            <button 
              className="cta-button secondary-button"
              onClick={() => setShowInviteGuide(!showInviteGuide)}
            >
              Setup Guide
            </button>
          </div>

          {showInviteGuide && (
            <div className="invite-guide">
              <h3>Setup Guide</h3>
              <div className="guide-steps">
                <div className="step">
                  <h4>1. Get Client ID</h4>
                  <p>Go to <a href="https://discord.com/developers/applications" target="_blank" rel="noopener noreferrer">Discord Developer Portal</a></p>
                  <p>Copy your bot's "Application ID"</p>
                </div>
                
                <div className="step">
                  <h4>2. Generate Link</h4>
                  <p>Replace "YOUR_CLIENT_ID_HERE" with your Client ID</p>
                  <code>https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands</code>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="stats">
          {stats.map((stat, index) => (
            <div key={index} className="stat-card">
              <div className="stat-number">{stat.number}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="features">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <h3>
                <span>{feature.icon}</span>
                {feature.title}
              </h3>
              <p>{feature.description}</p>
              <div className="command-list">
                <h4>Commands & Features:</h4>
                <ul>
                  {feature.commands.map((command, cmdIndex) => (
                    <li key={cmdIndex}>{command}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="footer">
          <p>© 2024 Valorant Bot</p>
        </div>
      </div>
    </div>
  );
}

export default App;
