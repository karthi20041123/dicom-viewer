// CollaborationManager.js - Handles real-time collaboration via WebSocket
class CollaborationManager {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.isHost = false;
    this.eventListeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    // For demo purposes, we'll simulate WebSocket with local state
    // In production, replace with actual WebSocket server
    this.simulatedServer = this.createSimulatedServer();
  }

  // Event emitter methods
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
  }

  emit(event, data) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event].forEach(callback => callback(data));
  }

  // Simulated server for demo - replace with real WebSocket server
  createSimulatedServer() {
    return {
      sessions: new Map(),
      
      createSession: (sessionId, hostId, shareSettings) => {
        const session = {
          id: sessionId,
          hostId,
          users: new Map(),
          shareSettings,
          state: {},
          createdAt: new Date()
        };
        session.users.set(hostId, { id: hostId, role: 'host', joinedAt: new Date() });
        this.simulatedServer.sessions.set(sessionId, session);
        return session;
      },
      
      joinSession: (sessionId, userId) => {
        const session = this.simulatedServer.sessions.get(sessionId);
        if (!session) return null;
        
        session.users.set(userId, { id: userId, role: 'guest', joinedAt: new Date() });
        return session;
      },
      
      leaveSession: (sessionId, userId) => {
        const session = this.simulatedServer.sessions.get(sessionId);
        if (!session) return false;
        
        session.users.delete(userId);
        if (session.users.size === 0) {
          this.simulatedServer.sessions.delete(sessionId);
        }
        return true;
      },
      
      broadcastToSession: (sessionId, data, excludeUserId = null) => {
        const session = this.simulatedServer.sessions.get(sessionId);
        if (!session) return;
        
        // In a real implementation, this would send to WebSocket clients
        // For demo, we'll use setTimeout to simulate async behavior
        setTimeout(() => {
          session.users.forEach((user, userId) => {
            if (userId !== excludeUserId) {
              // Simulate receiving message
              this.simulateMessage(userId, data);
            }
          });
        }, 50);
      }
    };
  }

  // Simulate receiving a message (replace with actual WebSocket onmessage)
  simulateMessage(userId, data) {
    if (this.userId === userId) {
      this.handleMessage(data);
    }
  }

  // Generate unique ID
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create a new collaboration session
  async createSession(shareSettings) {
    try {
      this.sessionId = this.generateId();
      this.userId = this.generateId();
      this.isHost = true;
      
      const session = this.simulatedServer.createSession(this.sessionId, this.userId, shareSettings);
      
      if (session) {
        this.emit('connectionStatus', true);
        this.emit('usersUpdate', Array.from(session.users.values()));
        
        // Generate share URL
        const shareUrl = `${window.location.origin}${window.location.pathname}?sessionId=${this.sessionId}&permissions=${encodeURIComponent(JSON.stringify(shareSettings))}`;
        console.log('Share URL generated:', shareUrl);
        
        return this.sessionId;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to create session:', error);
      return null;
    }
  }

  // Join an existing session
  async joinSession(sessionId, permissionsString) {
    try {
      this.sessionId = sessionId;
      this.userId = this.generateId();
      this.isHost = false;
      
      let permissions = {};
      try {
        permissions = JSON.parse(permissionsString || '{"view": true, "edit": false}');
      } catch (e) {
        permissions = { view: true, edit: false };
      }
      
      this.permissions = permissions;
      
      const session = this.simulatedServer.joinSession(sessionId, this.userId);
      
      if (session) {
        this.emit('connectionStatus', true);
        this.emit('usersUpdate', Array.from(session.users.values()));
        
        // Request current state from host
        this.requestStateSync();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to join session:', error);
      return false;
    }
  }

  // Broadcast state to all connected users
  broadcastState(state) {
    if (!this.sessionId || !this.isHost) return;
    
    const message = {
      type: 'STATE_SYNC',
      sessionId: this.sessionId,
      userId: this.userId,
      data: state,
      timestamp: Date.now()
    };
    
    this.simulatedServer.broadcastToSession(this.sessionId, message, this.userId);
  }

  // Broadcast viewer action (pan, zoom, etc.)
  broadcastViewerAction(action) {
    if (!this.sessionId || !this.isHost) return;
    
    const message = {
      type: 'VIEWER_ACTION',
      sessionId: this.sessionId,
      userId: this.userId,
      data: action,
      timestamp: Date.now()
    };
    
    this.simulatedServer.broadcastToSession(this.sessionId, message, this.userId);
  }

  // Request state sync from host (for guests)
  requestStateSync() {
    if (!this.sessionId || this.isHost) return;
    
    const message = {
      type: 'REQUEST_STATE_SYNC',
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now()
    };
    
    // In real implementation, send to host via WebSocket
    console.log('Requesting state sync from host');
  }

  // Handle incoming messages
  handleMessage(message) {
    switch (message.type) {
      case 'STATE_SYNC':
        if (!this.isHost) {
          this.emit('stateSync', message.data);
        }
        break;
        
      case 'VIEWER_ACTION':
        if (!this.isHost) {
          this.emit('viewerAction', message.data);
        }
        break;
        
      case 'USER_JOINED':
        this.updateUserList(message.data.users);
        break;
        
      case 'USER_LEFT':
        this.updateUserList(message.data.users);
        break;
        
      case 'REQUEST_STATE_SYNC':
        if (this.isHost) {
          // Host should respond with current state
          this.emit('stateSyncRequested', message.userId);
        }
        break;
        
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  // Update user list
  updateUserList(users) {
    this.emit('usersUpdate', users);
  }

  // End session (host only)
  endSession() {
    if (!this.sessionId || !this.isHost) return;
    
    const message = {
      type: 'SESSION_ENDED',
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now()
    };
    
    this.simulatedServer.broadcastToSession(this.sessionId, message, this.userId);
    this.simulatedServer.sessions.delete(this.sessionId);
    
    this.cleanup();
  }

  // Leave session (guest)
  leaveSession() {
    if (!this.sessionId) return;
    
    this.simulatedServer.leaveSession(this.sessionId, this.userId);
    this.cleanup();
  }

  // Cleanup
  cleanup() {
    this.sessionId = null;
    this.userId = null;
    this.isHost = false;
    this.permissions = null;
    this.emit('connectionStatus', false);
    this.emit('usersUpdate', []);
  }

  // Disconnect
  disconnect() {
    if (this.sessionId) {
      if (this.isHost) {
        this.endSession();
      } else {
        this.leaveSession();
      }
    }
    
    this.cleanup();
  }

  // Get session info
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      isHost: this.isHost,
      permissions: this.permissions
    };
  }
}

export default CollaborationManager;