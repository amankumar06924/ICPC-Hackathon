import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase'; 
import AuthPage from './components/AuthPage';
import UploadPage from './components/UploadPage';
import DashboardPage from './components/DashboardPage'; // New Component
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Navigation State Management: 'AUTH' | 'UPLOAD' | 'DASHBOARD'
  const [currentView, setCurrentView] = useState('AUTH');
  const [activeTest, setActiveTest] = useState(null); // Holds running test metadata

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          setCurrentView('UPLOAD'); // Redirect to upload once authenticated
        } catch (error) {
          console.error("Error fetching token:", error);
        }
      } else {
        setUser(null);
        setToken(null);
        setCurrentView('AUTH');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Triggered when contestant submits code successfully
  const handleUploadSuccess = (payload) => {
    setActiveTest(payload); // Contains filename, teamId, etc.
    setCurrentView('DASHBOARD'); // Instant redirection to Live Dashboard Page
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Verifying secure session parameters...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {user && (
        <nav className="main-navbar">
          <div className="brand-title" onClick={() => setCurrentView('UPLOAD')} style={{cursor: 'pointer'}}>
            IICPC Benchmark 2026
          </div>
          <div className="nav-profile">
            <span className="user-email">{user.email}</span>
            <button onClick={handleLogout} className="signout-button">Sign Out</button>
          </div>
        </nav>
      )}

      <main className="content-area">
        {currentView === 'AUTH' && <AuthPage />}
        
        {currentView === 'UPLOAD' && (
          <UploadPage 
            userToken={token} 
            onUploadSuccess={handleUploadSuccess} // Callback to transition state
          />
        )}
        
        {currentView === 'DASHBOARD' && activeTest && (
          <DashboardPage 
            activeTest={activeTest} 
            userToken={token}
            onBackToUpload={() => setCurrentView('UPLOAD')} // Allows to re-test
          />
        )}
      </main>
    </div>
  );
}

export default App;