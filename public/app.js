/**
 * Civic Lens – Community Hero
 * Main Application JavaScript (ES Modules)
 * ============================================================
 */

// ============================================================
// GLOBAL STATE
// ============================================================
const STATE = {
  currentView: 'map',
  issues: [],
  filteredIssues: [],
  userLocation: null,
  currentUser: null,
  chatHistory: [],
  upvotedIssues: new Set(),
  config: null,
  mapInstance: null,
  mapMarkers: [],
  mapInfoWindow: null,
  firebaseApp: null,
  firestore: null,
  firebaseAuth: null,
  mapFilter: 'all',
  categoryChart: null,
  reportData: {
    imageBase64: null,
    imageMimeType: null,
    imageUrl: null,      // Cloudinary URL returned by /api/analyze-image
    lat: null,
    lng: null,
    severity: null,
  },
  points: 0,
  badges: new Set(),
  language: 'en',
  markerClusterInstance: null,
  duplicateBypass: false,
  matchedDuplicateIssueId: null,
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function categoryEmoji(cat) {
  const map = {
    pothole: '🕳️',
    waterLeakage: '💧',
    streetlight: '💡',
    waste: '🗑️',
    flooding: '🌊',
    other: '📦',
  };
  return map[cat] || '📦';
}

function categoryLabel(cat) {
  const map = {
    pothole: 'Pothole',
    waterLeakage: 'Water Leakage',
    streetlight: 'Streetlight',
    waste: 'Waste',
    flooding: 'Flooding',
    other: 'Other',
  };
  return map[cat] || cat;
}

function severityColor(severity) {
  if (severity >= 5) return '#EF4444';
  if (severity >= 4) return '#F97316';
  if (severity >= 2) return '#F59E0B';
  return '#10B981';
}

function severityLabel(severity) {
  if (severity >= 5) return '🔥 Critical';
  if (severity >= 4) return '🟠 High';
  if (severity >= 3) return '🟡 Moderate';
  if (severity >= 2) return '🟢 Low';
  return '⚪ Minor';
}

function statusEmoji(status) {
  return { open: '🔴', 'in-progress': '🟡', resolved: '✅' }[status] || '❓';
}

function renderSeverityFlames(severity) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span style="opacity:${i <= severity ? '1' : '0.2'};color:${severityColor(severity)}">🔥</span>`;
  }
  return html;
}

function generateId() {
  return 'issue_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// ============================================================
// TOAST SYSTEM
// ============================================================
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-text">${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

// ============================================================
// LOADING SCREEN
// ============================================================
function updateLoading(progress, status) {
  document.getElementById('loading-bar').style.width = progress + '%';
  document.getElementById('loading-status').textContent = status;
}

function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  screen.classList.add('fade-out');
  setTimeout(() => {
    screen.style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  }, 500);
}

// ============================================================
// NAVIGATION
// ============================================================
function switchView(viewName) {
  // Update state
  STATE.currentView = viewName;

  // Desktop nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Mobile bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  // Trigger view-specific actions
  if (viewName === 'dashboard') {
    loadDashboard();
  } else if (viewName === 'feed') {
    renderFeed();
  } else if (viewName === 'map') {
    setTimeout(() => {
      if (STATE.mapInstance) {
        window.google?.maps && window.google.maps.event.trigger(STATE.mapInstance, 'resize');
      }
    }, 100);
  } else if (viewName === 'profile') {
    renderProfile();
  }
}

// Bind navigation events
function initNavigation() {
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  sidebarToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

// ============================================================
// FETCH CONFIG & INITIALIZE
// ============================================================
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    STATE.config = await res.json();
    return STATE.config;
  } catch (e) {
    console.error('Config fetch failed:', e);
    STATE.config = { hasGemini: false, hasFirebase: false, googleMapsKey: '' };
    return STATE.config;
  }
}

// ============================================================
// FIREBASE INITIALIZATION
// ============================================================
async function initFirebase(config) {
  if (!config.hasFirebase || !config.firebase.apiKey) {
    console.log('Firebase not configured, using in-memory data');
    return false;
  }

  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, getDoc } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
      await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

    STATE.firebaseApp = initializeApp(config.firebase);
    STATE.firestore = getFirestore(STATE.firebaseApp);
    STATE.firebaseAuth = getAuth(STATE.firebaseApp);

    // Store Firebase functions for later use
    window.FB = {
      getFirestore, collection, onSnapshot, addDoc, updateDoc, doc,
      serverTimestamp, query, orderBy, getDoc,
      getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
    };

    // Listen for auth changes
    onAuthStateChanged(STATE.firebaseAuth, (user) => {
      STATE.currentUser = user;
      updateUserUI(user);
    });

    // Listen to Firestore issues in real-time
    const q = query(collection(STATE.firestore, 'issues'), orderBy('timestamp', 'desc'));
    onSnapshot(q, (snapshot) => {
      const firestoreIssues = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        firestoreIssues.push({
          id: docSnap.id,
          ...data,
          timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString()
        });
      });

      if (firestoreIssues.length > 0) {
        STATE.issues = firestoreIssues;
      } else {
        // Seed with sample data if Firestore is empty
        seedFirestore(collection, addDoc, serverTimestamp);
      }

      updateIssuesUI();
    });

    document.getElementById('firebase-status').innerHTML = `
      <span class="status-dot online"></span>
      <span>Firebase Live</span>
    `;

    return true;
  } catch (error) {
    console.error('Firebase init failed:', error);
    showToast('Firebase connection failed. Using local data.', 'warning');
    return false;
  }
}

async function seedFirestore(collection, addDoc, serverTimestamp) {
  const sampleIssues = await fetch('/api/issues').then(r => r.json()).then(d => d.issues);
  for (const issue of sampleIssues) {
    try {
      const { id, ...rest } = issue;
      await addDoc(collection(STATE.firestore, 'issues'), {
        ...rest,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.warn('Seed failed for issue:', issue.title);
    }
  }
}

// ============================================================
// ISSUES DATA LOADING (fallback to API)
// ============================================================
async function loadIssues() {
  if (STATE.firestore && STATE.issues.length > 0) return; // Firebase handles this

  try {
    const res = await fetch('/api/issues');
    const data = await res.json();
    STATE.issues = data.issues;
    updateIssuesUI();
  } catch (e) {
    console.error('Failed to load issues:', e);
    showToast('Failed to load issues', 'error');
  }
}

function updateIssuesUI() {
  renderFeed();
  updateMapMarkers();
  document.getElementById('feed-badge').textContent = STATE.issues.length;
}

// ============================================================
// USER AUTHENTICATION UI
// ============================================================
function updateUserUI(user) {
  const avatarIcon = document.getElementById('avatar-icon');
  const profileName = document.getElementById('profile-name');
  const profileEmail = document.getElementById('profile-email');
  const profileAvatarLarge = document.getElementById('profile-avatar-large');
  const authSection = document.getElementById('auth-section');

  if (user) {
    // Signed in
    if (user.photoURL) {
      avatarIcon.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`;
      profileAvatarLarge.innerHTML = `<img src="${user.photoURL}" alt="${user.displayName}" />`;
    } else {
      const initials = (user.displayName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2);
      avatarIcon.textContent = initials;
    }

    if (profileName) profileName.textContent = user.displayName || 'Civic Hero';
    if (profileEmail) profileEmail.textContent = user.email || '';

    if (authSection) {
      authSection.innerHTML = `
        <div style="display:flex;gap:10px;align-items:center;padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md)">
          <span style="font-size:1.5rem">👤</span>
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.9rem">${user.displayName}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${user.email}</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="signout-btn">Sign Out</button>
        </div>
      `;
      document.getElementById('signout-btn')?.addEventListener('click', handleSignOut);
    }

    // Load user-specific data
    loadUserData(user.uid);
  } else {
    // Not signed in
    avatarIcon.textContent = '👤';
    if (profileName) profileName.textContent = 'Guest User';
    if (profileEmail) profileEmail.textContent = 'Sign in to track your contributions';
    if (authSection) {
      authSection.innerHTML = `
        <button class="btn btn-primary btn-full" id="google-signin-btn">
          <img src="https://www.google.com/favicon.ico" alt="Google" width="18" height="18" style="border-radius:2px" />
          Sign in with Google
        </button>
      `;
      document.getElementById('google-signin-btn')?.addEventListener('click', handleGoogleSignIn);
    }
  }
}

async function handleGoogleSignIn() {
  if (!window.FB || !STATE.firebaseAuth) {
    showToast('Authentication requires Firebase configuration', 'warning');
    // Demo mode: create a guest user
    STATE.currentUser = {
      uid: 'guest_' + Date.now(),
      displayName: 'Demo User',
      email: 'demo@civiclens.in',
      photoURL: null
    };
    updateUserUI(STATE.currentUser);
    showToast('Signed in as Demo User', 'success');
    return;
  }

  try {
    const provider = new window.FB.GoogleAuthProvider();
    const result = await window.FB.signInWithPopup(STATE.firebaseAuth, provider);
    showToast(`Welcome, ${result.user.displayName}! 🎉`, 'success');
  } catch (error) {
    console.error('Sign-in failed:', error);
    showToast('Sign-in failed. Please try again.', 'error');
  }
}

async function handleSignOut() {
  if (!window.FB || !STATE.firebaseAuth) {
    STATE.currentUser = null;
    updateUserUI(null);
    showToast('Signed out', 'info');
    return;
  }

  try {
    await window.FB.signOut(STATE.firebaseAuth);
    STATE.currentUser = null;
    showToast('Signed out successfully', 'info');
  } catch (error) {
    showToast('Sign-out failed', 'error');
  }
}

function loadUserData(uid) {
  // Calculate points and badges from issues
  const userIssues = STATE.issues.filter(i => i.reportedByUid === uid);
  const totalUpvotes = userIssues.reduce((sum, i) => sum + (i.upvotes || 0), 0);
  const resolvedIssues = userIssues.filter(i => i.status === 'resolved');

  STATE.points = (userIssues.length * 10) + (totalUpvotes * 2) + (resolvedIssues.length * 50);

  // Update points display
  const pointsEl = document.getElementById('profile-points');
  if (pointsEl) {
    pointsEl.textContent = STATE.points;
    // Animate counter
    animateCounter(pointsEl, 0, STATE.points, 800);
  }

  // Determine badges
  STATE.badges.clear();
  if (userIssues.length >= 1) STATE.badges.add('first-reporter');
  if (userIssues.length >= 10) STATE.badges.add('civic-champion');
  if (userIssues.filter(i => i.upvotes >= 1).length >= 5) STATE.badges.add('verified-hero');
  if (STATE.points >= 500) STATE.badges.add('city-guardian');
  if (resolvedIssues.length >= 3) STATE.badges.add('change-maker');

  updateBadgesUI();
  renderMyReports(userIssues);
}

function animateCounter(el, from, to, duration) {
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function updateBadgesUI() {
  document.querySelectorAll('.badge-item').forEach(badge => {
    const badgeId = badge.dataset.badge;
    if (STATE.badges.has(badgeId)) {
      badge.classList.remove('locked');
      badge.classList.add('unlocked');
    }
  });

  // Update header badge
  const avatarBadge = document.getElementById('avatar-badge');
  if (STATE.badges.size > 0) {
    avatarBadge.textContent = STATE.badges.has('civic-champion') ? '🏆' :
                               STATE.badges.has('verified-hero') ? '⭐' :
                               STATE.badges.has('first-reporter') ? '🌱' : '';
    avatarBadge.classList.remove('hidden');
  }
}

// ============================================================
// ISSUE FEED
// ============================================================
function renderFeed() {
  const grid = document.getElementById('issues-grid');
  if (!grid) return;

  const category = document.getElementById('filter-category')?.value || 'all';
  const status = document.getElementById('filter-status')?.value || 'all';
  const sortBy = document.getElementById('sort-by')?.value || 'newest';

  let issues = [...STATE.issues];

  // Filter
  if (category !== 'all') issues = issues.filter(i => i.category === category);
  if (status !== 'all') issues = issues.filter(i => i.status === status);

  // Sort
  if (sortBy === 'upvotes') {
    issues.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
  } else if (sortBy === 'severity') {
    issues.sort((a, b) => (b.severity || 0) - (a.severity || 0));
  } else if (sortBy === 'nearest' && STATE.userLocation) {
    issues.sort((a, b) => {
      const distA = getDistance(STATE.userLocation.lat, STATE.userLocation.lng, a.lat, a.lng);
      const distB = getDistance(STATE.userLocation.lat, STATE.userLocation.lng, b.lat, b.lng);
      return distA - distB;
    });
  } else {
    issues.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  STATE.filteredIssues = issues;

  if (issues.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:12px">🔍</div>
        <p style="font-size:1rem;font-weight:600;color:var(--text-secondary)">No issues found</p>
        <p style="font-size:0.85rem;margin-top:4px">Try adjusting your filters</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = issues.map(issue => renderIssueCard(issue)).join('');

  // Bind events
  grid.querySelectorAll('.issue-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.upvote-btn')) {
        showIssueModal(card.dataset.id);
      }
    });
  });

  grid.querySelectorAll('.upvote-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUpvote(btn.dataset.id, btn);
    });
  });
}

function renderIssueCard(issue) {
  const isUpvoted = STATE.upvotedIssues.has(issue.id);

  const imagePart = issue.imageUrl
    ? `<img src="${issue.imageUrl}" class="issue-card-image" alt="${issue.title}" loading="lazy" />`
    : `<div class="issue-card-image-placeholder">${categoryEmoji(issue.category)}</div>`;

  return `
    <article class="issue-card${issue.communityVerified ? ' community-verified' : ''}" data-id="${issue.id}">
      ${imagePart}
      ${issue.communityVerified ? '<div class="verified-badge">✓ Verified</div>' : ''}
      <div class="issue-card-body">
        <div class="issue-card-meta">
          <span class="category-badge category-${issue.category}">${categoryEmoji(issue.category)} ${categoryLabel(issue.category)}</span>
          <span class="status-pill status-${issue.status}">${statusEmoji(issue.status)} ${issue.status.replace('-', ' ')}</span>
        </div>
        <h3 class="issue-card-title">${escHtml(issue.title)}</h3>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px">📍 ${escHtml(issue.address || 'Location not specified')}</div>
        <div class="issue-card-footer">
          <div class="severity-display">
            ${renderSeverityFlames(issue.severity)}
          </div>
          <button class="upvote-btn ${isUpvoted ? 'upvoted' : ''}" data-id="${issue.id}">
            👍 ${issue.upvotes || 0}
          </button>
        </div>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;display:flex;justify-content:space-between">
          <span>👤 ${escHtml(issue.reportedBy || 'Anonymous')}</span>
          <span>${timeAgo(issue.timestamp)}</span>
        </div>
      </div>
    </article>
  `;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// UPVOTING
// ============================================================
async function handleUpvote(issueId, btn) {
  if (!STATE.currentUser) {
    showToast('Please sign in to upvote issues', 'warning');
    switchView('profile');
    return;
  }

  if (STATE.upvotedIssues.has(issueId)) {
    showToast('You already upvoted this issue', 'info');
    return;
  }

  try {
    // Optimistic update
    STATE.upvotedIssues.add(issueId);
    const issue = STATE.issues.find(i => i.id === issueId);
    if (issue) {
      issue.upvotes = (issue.upvotes || 0) + 1;
      if (issue.upvotes >= 5) {
        issue.communityVerified = true;
        showToast(`"${issue.title}" is now Community Verified! 🌟`, 'success');
      }
    }

    btn.classList.add('upvoted');
    btn.textContent = `👍 ${issue?.upvotes || 0}`;

    if (STATE.firestore && window.FB) {
      const issueRef = window.FB.doc(STATE.firestore, 'issues', issueId);
      const { increment, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      await updateDoc(issueRef, {
        upvotes: increment(1),
        communityVerified: (issue?.upvotes || 0) >= 5
      });
    } else {
      await fetch(`/api/issues/${issueId}/upvote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: STATE.currentUser.uid })
      });
    }

    showToast('+2 Civic Points for upvoting! 👍', 'success', 2000);
    updateMapMarkers();
  } catch (error) {
    console.error('Upvote failed:', error);
    showToast('Upvote failed. Please try again.', 'error');
  }
}

// ============================================================
// ISSUE MODAL
// ============================================================
function showIssueModal(issueId) {
  const issue = STATE.issues.find(i => i.id === issueId);
  if (!issue) return;

  const modalContent = document.getElementById('modal-content');

  const imagePart = issue.imageUrl
    ? `<img src="${issue.imageUrl}" class="modal-issue-image" alt="${issue.title}" />`
    : `<div class="modal-issue-placeholder">${categoryEmoji(issue.category)}</div>`;

  modalContent.innerHTML = `
    ${imagePart}
    <div class="modal-badges-row">
      <span class="category-badge category-${issue.category}">${categoryEmoji(issue.category)} ${categoryLabel(issue.category)}</span>
      <span class="status-pill status-${issue.status}">${statusEmoji(issue.status)} ${issue.status.replace('-', ' ')}</span>
      ${issue.communityVerified ? '<span class="community-verified-tag">⭐ Community Verified</span>' : ''}
    </div>
    <h2 class="modal-title">${escHtml(issue.title)}</h2>
    <p class="modal-desc">${escHtml(issue.description || 'No description provided.')}</p>
    <div class="modal-meta-grid">
      <div class="modal-meta-item">
        <span class="modal-meta-label">📍 Location</span>
        <span class="modal-meta-value">${escHtml(issue.address || 'Not specified')}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">🔥 Severity</span>
        <span class="modal-meta-value">${severityLabel(issue.severity)}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">👤 Reported By</span>
        <span class="modal-meta-value">${escHtml(issue.reportedBy || 'Anonymous')}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">🕐 Reported</span>
        <span class="modal-meta-value">${timeAgo(issue.timestamp)}</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">👍 Upvotes</span>
        <span class="modal-meta-value">${issue.upvotes || 0} community confirmations</span>
      </div>
      <div class="modal-meta-item">
        <span class="modal-meta-label">⚡ Urgency</span>
        <span class="modal-meta-value" style="text-transform:capitalize">${issue.urgency || 'medium'}</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-sm" onclick="handleUpvoteModal('${issue.id}', this)">
        👍 Upvote (${issue.upvotes || 0})
      </button>
      <button class="btn btn-secondary btn-sm" onclick="generateComplaintLetter('${issue.id}')">
        📝 Complaint Letter
      </button>
      <button class="btn btn-secondary btn-sm" onclick="viewOnMap(${issue.lat}, ${issue.lng})">
        🗺️ View on Map
      </button>
    </div>
    ${STATE.currentUser ? `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <label style="font-size:0.8rem;color:var(--text-muted);font-weight:600">Update Status:</label>
        <select class="status-select-modal" onchange="updateIssueStatus('${issue.id}', this.value)" style="margin-left:8px">
          <option value="open" ${issue.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="in-progress" ${issue.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
          <option value="resolved" ${issue.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </div>
    ` : ''}
  `;

  document.getElementById('issue-modal').classList.remove('hidden');
}

// Make functions accessible globally from modal HTML
window.handleUpvoteModal = (issueId, btn) => {
  handleUpvote(issueId, btn);
  const issue = STATE.issues.find(i => i.id === issueId);
  if (issue) btn.textContent = `👍 Upvote (${issue.upvotes})`;
};

window.generateComplaintLetter = async (issueId) => {
  const issue = STATE.issues.find(i => i.id === issueId);
  if (!issue) return;

  showToast('Generating complaint letter...', 'info', 3000);

  try {
    const res = await fetch('/api/generate-complaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue })
    });
    const data = await res.json();

    // Show letter in a new modal-like overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '600';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:640px">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        <div class="modal-content">
          <h3 style="margin-bottom:16px;font-size:1.1rem">📄 Formal Complaint Letter</h3>
          <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:20px;font-family:serif;font-size:0.88rem;line-height:1.8;white-space:pre-wrap;color:var(--text-primary);max-height:400px;overflow-y:auto">${escHtml(data.letter)}</div>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary btn-sm" onclick="copyLetter(this, \`${escHtml(data.letter).replace(/`/g, '\\`')}\`)">📋 Copy Letter</button>
            <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal-overlay').remove()">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  } catch (err) {
    showToast('Failed to generate complaint letter', 'error');
  }
};

window.copyLetter = (btn, text) => {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy Letter', 2000);
  });
};

window.viewOnMap = (lat, lng) => {
  document.getElementById('issue-modal').classList.add('hidden');
  switchView('map');
  setTimeout(() => {
    if (STATE.mapInstance) {
      STATE.mapInstance.setCenter({ lat, lng });
      STATE.mapInstance.setZoom(16);
    }
  }, 300);
};

window.updateIssueStatus = async (issueId, status) => {
  const issue = STATE.issues.find(i => i.id === issueId);
  if (!issue) return;

  const prevStatus = issue.status;
  issue.status = status;

  try {
    if (STATE.firestore && window.FB) {
      await window.FB.updateDoc(window.FB.doc(STATE.firestore, 'issues', issueId), { status });
    } else {
      await fetch(`/api/issues/${issueId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    }

    showToast(`Status updated to "${status}"`, 'success');
    if (status === 'resolved' && prevStatus !== 'resolved') {
      STATE.points += 50;
      showToast('🎉 +50 Civic Points for resolved issue!', 'success', 5000);
    }
    updateIssuesUI();
  } catch (err) {
    issue.status = prevStatus;
    showToast('Failed to update status', 'error');
  }
};

// Close modal
document.getElementById('modal-close')?.addEventListener('click', () => {
  document.getElementById('issue-modal').classList.add('hidden');
});
document.getElementById('issue-modal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// ============================================================
// GOOGLE MAPS INTEGRATION
// ============================================================
function loadGoogleMaps(apiKey) {
  if (!apiKey) {
    showMapFallback();
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMaps&v=weekly`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  // Set callback
  window.__mapsCallback = initMap;

  // If already loaded
  if (window.__mapsLoaded) initMap();
}

function showMapFallback() {
  const searchWrap = document.getElementById('map-search-bar-wrap');
  if (searchWrap) searchWrap.style.display = 'none';

  const mapContainer = document.getElementById('map-container');
  document.getElementById('map-loading')?.classList.add('hidden');
  mapContainer.innerHTML = `
    <div class="map-fallback">
      <div class="map-fallback-icon">🗺️</div>
      <h3>Map requires Google Maps API Key</h3>
      <p>Add your GOOGLE_MAPS_API_KEY to the .env file to see the interactive map with all reported issues.</p>
      <div style="margin-top:20px;display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px">
        ${STATE.issues.map(issue => `
          <div onclick="showIssueModal('${issue.id}')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-md);text-align:left;transition:var(--transition)">
            <span style="font-size:1.5rem">${categoryEmoji(issue.category)}</span>
            <div style="flex:1">
              <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary)">${escHtml(issue.title)}</div>
              <div style="font-size:0.72rem;color:var(--text-muted)">${escHtml(issue.address)}</div>
            </div>
            <span class="status-pill status-${issue.status}" style="font-size:0.7rem">${issue.status}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function initMap() {
  const mapEl = document.getElementById('google-map');
  if (!mapEl || !window.google) return;

  document.getElementById('map-loading')?.classList.add('hidden');

  // Light theme map styles
  const lightMapStyle = [
    { elementType: 'geometry', stylers: [{ color: '#f8fafc' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
    { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f1f5f9' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cbd5e1' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#f1f5f9' }] },
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#e2e8f0' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
    { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#475569' }] },
  ];

  STATE.mapInstance = new google.maps.Map(mapEl, {
    center: { lat: 12.9352, lng: 77.6245 },
    zoom: 13,
    styles: lightMapStyle,
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  });

  STATE.mapInfoWindow = new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(0, -5)
  });

  // Initialize MarkerClusterer if loaded
  if (window.markerClusterer?.MarkerClusterer) {
    STATE.markerClusterInstance = new markerClusterer.MarkerClusterer({
      map: STATE.mapInstance,
      markers: []
    });
  }

  // Click on empty map
  STATE.mapInstance.addListener('click', (e) => {
    STATE.mapInfoWindow.close();
    // Pre-fill location
    STATE.reportData.lat = e.latLng.lat();
    STATE.reportData.lng = e.latLng.lng();
    reverseGeocode(e.latLng.lat(), e.latLng.lng());
  });

  // Initialize Places Search Box
  const searchInput = document.getElementById('map-search-input');
  if (searchInput && window.google?.maps?.places) {
    const searchBox = new google.maps.places.SearchBox(searchInput);
    
    // Bias SearchBox results towards current map's bounds.
    STATE.mapInstance.addListener('bounds_changed', () => {
      searchBox.setBounds(STATE.mapInstance.getBounds());
    });

    // Listen for place selections
    searchBox.addListener('places_changed', () => {
      const places = searchBox.getPlaces();
      if (places.length === 0) return;

      const bounds = new google.maps.LatLngBounds();
      places.forEach((place) => {
        if (!place.geometry || !place.geometry.location) return;

        if (place.geometry.viewport) {
          bounds.union(place.geometry.viewport);
        } else {
          bounds.extend(place.geometry.location);
        }
      });
      STATE.mapInstance.fitBounds(bounds);
      
      if (STATE.mapInstance.getZoom() > 15) {
        STATE.mapInstance.setZoom(15);
      }
    });
  }

  updateMapMarkers();

  // Try to center on user location
  if (STATE.userLocation) {
    STATE.mapInstance.setCenter(STATE.userLocation);
    STATE.mapInstance.setZoom(14);
  }
}

function updateMapMarkers() {
  if (!STATE.mapInstance || !window.google) return;

  // Clear existing markers from map and clusterer
  if (STATE.markerClusterInstance) {
    STATE.markerClusterInstance.clearMarkers();
  }
  STATE.mapMarkers.forEach(m => m.setMap(null));
  STATE.mapMarkers = [];

  // Filter issues based on map filter
  let issues = STATE.issues;
  if (STATE.mapFilter !== 'all') {
    issues = issues.filter(i => i.status === STATE.mapFilter);
  }

  issues.forEach(issue => {
    if (!issue.lat || !issue.lng) return;

    const color = issue.communityVerified ? '#FFD700' : severityColor(issue.severity);
    const borderColor = issue.communityVerified ? '#B8860B' : color;
    const size = issue.severity >= 4 ? 14 : 11;

    const markerIcon = {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: borderColor,
      strokeWeight: issue.communityVerified ? 2.5 : 1.5,
      scale: size,
    };

    const marker = new google.maps.Marker({
      position: { lat: issue.lat, lng: issue.lng },
      icon: markerIcon,
      title: issue.title,
      animation: issue.severity >= 5 ? google.maps.Animation.BOUNCE : null,
    });

    // Stop bouncing after 2 seconds for critical issues
    if (issue.severity >= 5) {
      setTimeout(() => marker.setAnimation(null), 2000);
    }

    marker.addListener('click', () => {
      const contentStr = `
        <div class="map-popup">
          <div class="map-popup-meta">
            <span class="category-badge category-${issue.category}" style="font-size:0.68rem">${categoryEmoji(issue.category)} ${categoryLabel(issue.category)}</span>
            <span class="status-pill status-${issue.status}" style="font-size:0.68rem">${statusEmoji(issue.status)} ${issue.status}</span>
          </div>
          <div class="map-popup-title">${escHtml(issue.title)}</div>
          <div class="map-popup-desc">${escHtml(issue.description?.substring(0, 100) || '')}${issue.description?.length > 100 ? '...' : ''}</div>
          <div style="font-size:0.75rem;color:#94a3b8;margin-bottom:8px">👍 ${issue.upvotes || 0} upvotes · ${renderSeverityFlames(issue.severity)}</div>
          <div class="map-popup-actions">
            <button class="map-popup-btn primary" onclick="showIssueModal('${issue.id}')">View Details</button>
            <button class="map-popup-btn secondary" onclick="document.getElementById('issue-modal').classList.add('hidden')">Close</button>
          </div>
        </div>
      `;

      STATE.mapInfoWindow.setContent(contentStr);
      STATE.mapInfoWindow.open(STATE.mapInstance, marker);
    });

    STATE.mapMarkers.push(marker);
  });

  // Re-add to MarkerClusterer or directly to Map as fallback
  if (STATE.markerClusterInstance) {
    STATE.markerClusterInstance.addMarkers(STATE.mapMarkers);
  } else {
    STATE.mapMarkers.forEach(m => m.setMap(STATE.mapInstance));
  }
}

// Map filter buttons
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    STATE.mapFilter = chip.dataset.filter;
    updateMapMarkers();
  });
});

// Report Here button
document.getElementById('report-here-btn')?.addEventListener('click', () => {
  switchView('report');
});

// ============================================================
// GEOLOCATION
// ============================================================
function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        STATE.userLocation = location;
        resolve(location);
      },
      () => resolve(null),
      { timeout: 8000, enableHighAccuracy: true }
    );
  });
}

async function reverseGeocode(lat, lng) {
  if (!window.google || !STATE.mapInstance) return;

  const geocoder = new google.maps.Geocoder();
  try {
    const result = await geocoder.geocode({ location: { lat, lng } });
    if (result.results[0]) {
      const address = result.results[0].formatted_address;
      document.getElementById('issue-address').value = address;
      switchView('report');
    }
  } catch (e) {
    console.warn('Reverse geocode failed:', e);
  }
}

function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Get location button
document.getElementById('get-location-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('get-location-btn');
  btn.textContent = '⏳ Getting...';
  btn.disabled = true;

  const loc = await getUserLocation();
  if (loc) {
    STATE.reportData.lat = loc.lat;
    STATE.reportData.lng = loc.lng;

    const coordsEl = document.getElementById('location-coords');
    const coordsText = document.getElementById('coords-text');
    coordsEl.classList.remove('hidden');
    coordsText.textContent = `📍 ${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)}`;

    // Reverse geocode if Maps is available
    if (window.google && STATE.mapInstance) {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: loc }, (results) => {
        if (results?.[0]) {
          document.getElementById('issue-address').value = results[0].formatted_address;
        }
      });
    }

    showToast('Location captured! 📍', 'success', 2000);
  } else {
    showToast('Could not get location. Please enter manually.', 'warning');
  }

  btn.textContent = '📍 Use GPS';
  btn.disabled = false;
});

// ============================================================
// IMAGE UPLOAD & GEMINI ANALYSIS (via Cloudinary + Gemini Vision)
// ============================================================
const imageUploadArea = document.getElementById('image-upload-area');
const imageInput = document.getElementById('image-input');

imageUploadArea?.addEventListener('click', (e) => {
  if (!e.target.closest('.remove-image-btn')) {
    imageInput.click();
  }
});

imageUploadArea?.addEventListener('dragover', (e) => {
  e.preventDefault();
  imageUploadArea.style.borderColor = 'var(--primary)';
});

imageUploadArea?.addEventListener('dragleave', () => {
  imageUploadArea.style.borderColor = '';
});

imageUploadArea?.addEventListener('drop', (e) => {
  e.preventDefault();
  imageUploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

imageInput?.addEventListener('change', () => {
  const file = imageInput.files[0];
  if (file) handleImageFile(file);
});

document.getElementById('remove-image-btn')?.addEventListener('click', () => {
  STATE.reportData.imageBase64 = null;
  STATE.reportData.imageMimeType = null;
  STATE.reportData.imageUrl = null;
  imageInput.value = '';
  document.getElementById('image-preview').classList.add('hidden');
  document.getElementById('upload-placeholder').classList.remove('hidden');
  document.getElementById('ai-result-card').classList.add('hidden');
});

/**
 * handleImageFile:
 * 1. Read file as base64 via FileReader
 * 2. Show local preview immediately (fast)
 * 3. Show "AI is analyzing your image..." overlay
 * 4. POST base64 to /api/analyze-image
 *    → server uploads to Cloudinary AND runs Gemini Vision
 *    → returns { url, category, severity, title, description, urgency }
 * 5. Swap preview src to Cloudinary URL (CDN-optimised)
 * 6. Auto-fill form fields
 */
async function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result.split(',')[1];
    STATE.reportData.imageBase64 = base64;
    STATE.reportData.imageMimeType = file.type;

    // Step 1: Show local blob preview immediately
    const previewImg = document.getElementById('preview-img');
    previewImg.src = e.target.result;
    document.getElementById('upload-placeholder').classList.add('hidden');
    document.getElementById('image-preview').classList.remove('hidden');

    // Step 2: Send to backend (Cloudinary upload + Gemini Vision)
    await analyzeImageWithGemini(base64, file.type, previewImg);
  };
  reader.readAsDataURL(file);
}

async function analyzeImageWithGemini(base64, mimeType, previewImg) {
  const overlay = document.getElementById('analyzing-overlay');
  // Update overlay text for clarity
  overlay.innerHTML = `
    <div class="spinner-sm"></div>
    <span>AI is analyzing your image...</span>
  `;
  overlay.classList.remove('hidden');

  try {
    const res = await fetch('/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mimeType })
    });

    const data = await res.json();

    // Step 3: Swap preview to Cloudinary URL if available
    if (data.url) {
      STATE.reportData.imageUrl = data.url;
      if (previewImg) previewImg.src = data.url;
    }

    // Step 4: Auto-fill form fields
    if (data.title)       document.getElementById('issue-title').value = data.title;
    if (data.category)    document.getElementById('issue-category').value = data.category;
    if (data.description) document.getElementById('issue-description').value = data.description;
    if (data.severity)    selectSeverity(data.severity);

    // Step 5: Show AI result card
    const resultCard = document.getElementById('ai-result-card');
    const resultBody = document.getElementById('ai-result-body');
    resultBody.innerHTML = `
      <div class="ai-result-item">
        <span class="ai-result-label">Category</span>
        <span class="ai-result-value">${categoryEmoji(data.category)} ${categoryLabel(data.category)}</span>
      </div>
      <div class="ai-result-item">
        <span class="ai-result-label">Severity</span>
        <span class="ai-result-value" style="color:${severityColor(data.severity)}">${severityLabel(data.severity)}</span>
      </div>
      <div class="ai-result-item">
        <span class="ai-result-label">Urgency</span>
        <span class="ai-result-value" style="text-transform:capitalize">${data.urgency || 'medium'}</span>
      </div>
      ${data.url ? `<div class="ai-result-item" style="grid-column:1/-1">
        <span class="ai-result-label">☁️ Uploaded to Cloudinary</span>
        <span class="ai-result-value" style="font-size:0.72rem;color:var(--emerald)">✅ Image saved securely</span>
      </div>` : ''}
    `;
    resultCard.classList.remove('hidden');

    showToast('✨ AI analysis complete! Form auto-filled.', 'success');
  } catch (err) {
    console.error('Image analysis failed:', err);
    showToast('AI analysis failed. Please fill in details manually.', 'warning');
  } finally {
    overlay.classList.add('hidden');
  }
}

// ============================================================
// SEVERITY PICKER
// ============================================================
function selectSeverity(value) {
  document.querySelectorAll('.sev-btn').forEach(btn => {
    btn.className = 'sev-btn';
    if (parseInt(btn.dataset.value) === parseInt(value)) {
      btn.classList.add(`selected-${value}`);
    }
  });
  document.getElementById('issue-severity').value = value;
  STATE.reportData.severity = parseInt(value);
}

document.querySelectorAll('.sev-btn').forEach(btn => {
  btn.addEventListener('click', () => selectSeverity(btn.dataset.value));
});

// ============================================================
// REPORT FORM SUBMISSION
// ============================================================
document.getElementById('report-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!STATE.currentUser) {
    showToast('Please sign in to report issues', 'warning');
    switchView('profile');
    return;
  }

  const title = document.getElementById('issue-title').value.trim();
  const category = document.getElementById('issue-category').value;
  const description = document.getElementById('issue-description').value.trim();
  const address = document.getElementById('issue-address').value.trim();
  const severity = parseInt(document.getElementById('issue-severity').value);

  if (!title || !category || !severity) {
    showToast('Please fill in all required fields', 'warning');
    return;
  }

  const submitBtn = document.getElementById('submit-issue-btn');
  const submitText = document.getElementById('submit-text');
  const submitSpinner = document.getElementById('submit-spinner');

  submitBtn.disabled = true;
  submitText.classList.add('hidden');
  submitSpinner.classList.remove('hidden');

  // Check for duplicate issues before submitting
  if (!STATE.duplicateBypass) {
    try {
      const duplicateRes = await fetch('/api/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          lat: STATE.reportData.lat || 12.9352 + (Math.random() - 0.5) * 0.05,
          lng: STATE.reportData.lng || 77.6245 + (Math.random() - 0.5) * 0.05,
          title,
          description
        })
      });
      const dupData = await duplicateRes.json();

      if (dupData.isDuplicate) {
        // Show duplicate warning card
        const warningCard = document.getElementById('duplicate-warning');
        const reasonEl = document.getElementById('duplicate-reason');
        reasonEl.innerHTML = `
          <strong>${dupData.confidence.toUpperCase()} CONFIDENCE:</strong> ${dupData.reason}<br>
          <em>Existing: "${dupData.matchedIssue.title}" at ${dupData.matchedIssue.address}</em>
        `;
        warningCard.classList.remove('hidden');
        warningCard.scrollIntoView({ behavior: 'smooth' });

        // Save matched issue id to view it
        STATE.matchedDuplicateIssueId = dupData.matchedIssue.id;

        // Reset submit button state
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        submitSpinner.classList.add('hidden');
        return; // Stop submission
      }
    } catch (err) {
      console.warn('Duplicate check failed, proceeding...', err);
    }
  }

  try {
    // Image URL comes from Cloudinary via /api/analyze-image (already uploaded during the analysis step)
    const imageUrl = STATE.reportData.imageUrl || null;

    const newIssue = {
      title,
      category,
      description,
      address: address || 'Bengaluru, Karnataka',
      severity,
      lat: STATE.reportData.lat || 12.9352 + (Math.random() - 0.5) * 0.05,
      lng: STATE.reportData.lng || 77.6245 + (Math.random() - 0.5) * 0.05,
      imageUrl,
      status: 'open',
      upvotes: 0,
      reportedBy: STATE.currentUser.displayName || 'Anonymous',
      reportedByUid: STATE.currentUser.uid,
      communityVerified: false,
      urgency: severity >= 4 ? 'high' : severity >= 2 ? 'medium' : 'low',
    };

    if (STATE.firestore && window.FB) {
      await window.FB.addDoc(
        window.FB.collection(STATE.firestore, 'issues'),
        { ...newIssue, timestamp: window.FB.serverTimestamp() }
      );
    } else {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIssue)
      });
      const data = await res.json();
      STATE.issues.unshift(data.issue);
    }

    // Points
    STATE.points += 10;

    // Check first reporter badge
    const userIssues = STATE.issues.filter(i => i.reportedByUid === STATE.currentUser.uid);
    if (userIssues.length === 1 && !STATE.badges.has('first-reporter')) {
      STATE.badges.add('first-reporter');
      showToast('🌱 Badge Unlocked: First Reporter!', 'success', 6000);
    }
    if (userIssues.length >= 10 && !STATE.badges.has('civic-champion')) {
      STATE.badges.add('civic-champion');
      showToast('🏆 Badge Unlocked: Civic Champion!', 'success', 6000);
    }

    // Reset form
    resetReportForm();
    updateIssuesUI();

    // Show success overlay
    document.getElementById('success-overlay').classList.remove('hidden');

  } catch (err) {
    console.error('Submit failed:', err);
    showToast('Failed to submit issue. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitText.classList.remove('hidden');
    submitSpinner.classList.add('hidden');
  }
});

function resetReportForm() {
  document.getElementById('report-form').reset();
  STATE.reportData = { imageBase64: null, imageMimeType: null, imageUrl: null, lat: null, lng: null, severity: null };
  document.getElementById('image-preview').classList.add('hidden');
  document.getElementById('upload-placeholder').classList.remove('hidden');
  document.getElementById('ai-result-card').classList.add('hidden');
  document.getElementById('location-coords').classList.add('hidden');
  document.querySelectorAll('.sev-btn').forEach(b => b.className = 'sev-btn');
  document.getElementById('issue-severity').value = '';

  // Reset duplicate states
  STATE.duplicateBypass = false;
  STATE.matchedDuplicateIssueId = null;
  document.getElementById('duplicate-warning').classList.add('hidden');
}

document.getElementById('reset-form-btn')?.addEventListener('click', resetReportForm);

// Success overlay buttons
document.getElementById('view-feed-after')?.addEventListener('click', () => {
  document.getElementById('success-overlay').classList.add('hidden');
  switchView('feed');
});
document.getElementById('report-another')?.addEventListener('click', () => {
  document.getElementById('success-overlay').classList.add('hidden');
});

// ============================================================
// FEED FILTERS
// ============================================================
document.getElementById('filter-category')?.addEventListener('change', renderFeed);
document.getElementById('filter-status')?.addEventListener('change', renderFeed);
document.getElementById('sort-by')?.addEventListener('change', renderFeed);

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  if (STATE.firestore) {
    const localStats = computeLocalStats();
    animateCounter(document.getElementById('stat-total-val'), 0, localStats.total, 600);
    animateCounter(document.getElementById('stat-resolved-val'), 0, localStats.resolved, 600);
    animateCounter(document.getElementById('stat-active-val'), 0, localStats.active, 600);
    document.getElementById('stat-time-val').innerHTML = `3.5<span class="stat-unit">days</span>`;
    renderCategoryChart(localStats.categoryCount);
    renderSeverityHeatmap();
    renderLeaderboard(localStats.leaderboard);
    return;
  }

  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    // Update stat cards with animation
    animateCounter(document.getElementById('stat-total-val'), 0, data.total, 600);
    animateCounter(document.getElementById('stat-resolved-val'), 0, data.resolvedThisMonth, 600);
    animateCounter(document.getElementById('stat-active-val'), 0, data.activeReports, 600);
    document.getElementById('stat-time-val').innerHTML = `${data.avgResolutionDays}<span class="stat-unit">days</span>`;

    // Category chart
    renderCategoryChart(data.categoryCount);

    // Severity heatmap
    renderSeverityHeatmap();

    // Leaderboard
    renderLeaderboard(data.leaderboard);

  } catch (err) {
    console.error('Dashboard load failed:', err);
    // Compute from local data
    const localStats = computeLocalStats();
    animateCounter(document.getElementById('stat-total-val'), 0, localStats.total, 600);
    animateCounter(document.getElementById('stat-resolved-val'), 0, localStats.resolved, 600);
    animateCounter(document.getElementById('stat-active-val'), 0, localStats.active, 600);
    document.getElementById('stat-time-val').innerHTML = `4.2<span class="stat-unit">days</span>`;
    renderCategoryChart(localStats.categoryCount);
    renderSeverityHeatmap();
    renderLeaderboard(localStats.leaderboard);
  }
}

function computeLocalStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const total = STATE.issues.length;
  const resolved = STATE.issues.filter(i => i.status === 'resolved' && new Date(i.timestamp) >= monthStart).length;
  const active = STATE.issues.filter(i => i.status !== 'resolved').length;

  const categoryCount = {};
  STATE.issues.forEach(i => {
    categoryCount[i.category] = (categoryCount[i.category] || 0) + 1;
  });

  const userStats = {};

  if (STATE.currentUser) {
    const currentName = STATE.currentUser.displayName || STATE.currentUser.email || 'You';
    userStats[STATE.currentUser.uid] = {
      name: currentName,
      issues: 0,
      upvotes: 0,
      points: STATE.points || 0,
      isCurrentUser: true
    };
  }

  STATE.issues.forEach(i => {
    const key = i.reportedByUid || i.reportedBy || 'Anonymous';
    if (!userStats[key]) {
      userStats[key] = { name: i.reportedBy || 'Anonymous', issues: 0, upvotes: 0, points: 0 };
    }
    userStats[key].issues++;
    userStats[key].upvotes += i.upvotes || 0;
    if (!userStats[key].isCurrentUser) {
      userStats[key].points += 10 + (i.upvotes || 0) * 2 + (i.status === 'resolved' ? 50 : 0);
    }
  });

  const allUsersSorted = Object.values(userStats).sort((a, b) => b.points - a.points);
  const leaderboard = allUsersSorted.slice(0, 5);

  if (STATE.currentUser) {
    const currentUserIndex = allUsersSorted.findIndex(u => u.isCurrentUser || u.name === STATE.currentUser.displayName || u.name === STATE.currentUser.email);
    if (currentUserIndex >= 5 && currentUserIndex !== -1) {
      allUsersSorted[currentUserIndex].rank = currentUserIndex + 1;
      STATE.currentUserLeaderboardStats = allUsersSorted[currentUserIndex];
    } else {
      STATE.currentUserLeaderboardStats = null;
    }
  } else {
    STATE.currentUserLeaderboardStats = null;
  }

  return { total, resolved, active, categoryCount, leaderboard };
}

function renderCategoryChart(categoryCount) {
  const canvas = document.getElementById('category-chart');
  if (!canvas) return;

  const labels = Object.keys(categoryCount).map(k => `${categoryEmoji(k)} ${categoryLabel(k)}`);
  const values = Object.values(categoryCount);
  const colors = ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#22D3EE', '#94A3B8'];

  if (STATE.categoryChart) {
    STATE.categoryChart.destroy();
  }

  STATE.categoryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Issues',
        data: values,
        backgroundColor: colors.slice(0, values.length).map(c => c + '99'),
        borderColor: colors.slice(0, values.length),
        borderWidth: 1.5,
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#FFFFFF',
          borderColor: '#E2E8F0',
          borderWidth: 1,
          titleColor: '#0F172A',
          bodyColor: '#475569',
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#64748B', stepSize: 1 },
          grid: { color: 'rgba(15,23,42,0.06)' }
        },
        x: {
          ticks: { color: '#64748B', font: { size: 10 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderSeverityHeatmap() {
  const container = document.getElementById('severity-heatmap');
  if (!container) return;

  const severityCounts = [0, 0, 0, 0, 0];
  STATE.issues.forEach(i => {
    if (i.severity >= 1 && i.severity <= 5) {
      severityCounts[i.severity - 1]++;
    }
  });

  const maxCount = Math.max(...severityCounts, 1);
  const colors = ['#10B981', '#84CC16', '#F59E0B', '#F97316', '#EF4444'];
  const labels = ['Minor', 'Low', 'Moderate', 'High', 'Critical'];

  container.innerHTML = '';

  severityCounts.forEach((count, i) => {
    const opacity = 0.15 + (count / maxCount) * 0.85;
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.style.cssText = `background:${colors[i]};opacity:${opacity.toFixed(2)};`;
    cell.title = `${labels[i]}: ${count} issue${count !== 1 ? 's' : ''}`;
    cell.innerHTML = `<div style="text-align:center"><div style="font-size:1rem">${i + 1}🔥</div><div>${count}</div></div>`;
    container.appendChild(cell);
  });
}

function renderLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;

  if (!leaderboard || leaderboard.length === 0) {
    list.innerHTML = '<p class="loading-placeholder">No data yet. Start reporting!</p>';
    return;
  }

  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
  const rankEmoji = (i) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;

  let html = leaderboard.map((user, i) => {
    const isSelf = user.isCurrentUser || (STATE.currentUser && (user.name === STATE.currentUser.displayName || user.name === STATE.currentUser.email));
    return `
      <div class="leaderboard-item${isSelf ? ' current-user-row' : ''}">
        <div class="leaderboard-rank ${rankClass(i)}">${rankEmoji(i)}</div>
        <div class="leaderboard-avatar">${(user.name || 'U')[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="leaderboard-name">${escHtml(user.name || 'Unknown')}${isSelf ? ' (You)' : ''}</div>
          <div class="leaderboard-sub">${user.issues} reports · ${user.upvotes} upvotes</div>
        </div>
        <div class="leaderboard-points">${user.points} pts</div>
      </div>
    `;
  }).join('');

  if (STATE.currentUserLeaderboardStats) {
    const user = STATE.currentUserLeaderboardStats;
    html += `
      <div class="leaderboard-separator">•••</div>
      <div class="leaderboard-item current-user-row">
        <div class="leaderboard-rank">#${user.rank}</div>
        <div class="leaderboard-avatar" style="background:var(--primary);color:white">${(user.name || 'U')[0].toUpperCase()}</div>
        <div style="flex:1">
          <div class="leaderboard-name">${escHtml(user.name || 'Unknown')} (You)</div>
          <div class="leaderboard-sub">${user.issues} reports · ${user.upvotes} upvotes</div>
        </div>
        <div class="leaderboard-points">${user.points} pts</div>
      </div>
    `;
  }

  list.innerHTML = html;
}
}

// ============================================================
// PROFILE
// ============================================================
function renderProfile() {
  if (STATE.currentUser) {
    loadUserData(STATE.currentUser.uid);
  }

  // Update profile points display
  document.getElementById('profile-points').textContent = STATE.points;
}

function renderMyReports(issues) {
  const list = document.getElementById('my-reports-list');
  if (!list) return;

  if (!issues || issues.length === 0) {
    list.innerHTML = '<p class="empty-state">No reports yet. Be the first to report an issue!</p>';
    return;
  }

  list.innerHTML = issues.slice(0, 5).map(issue => `
    <div onclick="showIssueModal('${issue.id}')" style="cursor:pointer;display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;transition:var(--transition)">
      <span style="font-size:1.5rem">${categoryEmoji(issue.category)}</span>
      <div style="flex:1">
        <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary)">${escHtml(issue.title)}</div>
        <div style="font-size:0.72rem;color:var(--text-muted)">${timeAgo(issue.timestamp)} · 👍 ${issue.upvotes}</div>
      </div>
      <span class="status-pill status-${issue.status}" style="font-size:0.7rem">${issue.status}</span>
    </div>
  `).join('');
}

// ============================================================
// AI CHAT
// ============================================================
const chatFab = document.getElementById('chat-fab');
const chatPanel = document.getElementById('chat-panel');
const chatClose = document.getElementById('chat-close');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatMessages = document.getElementById('chat-messages');

chatFab?.addEventListener('click', () => {
  chatPanel.classList.toggle('hidden');
});

chatClose?.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
});

chatSend?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

document.querySelectorAll('.quick-prompt').forEach(btn => {
  btn.addEventListener('click', () => {
    chatInput.value = btn.dataset.prompt;
    sendChatMessage();
    document.getElementById('chat-quick-prompts').style.display = 'none';
  });
});

async function sendChatMessage() {
  const message = chatInput.value.trim();
  if (!message) return;

  chatInput.value = '';

  // Add user message
  appendChatMessage(message, 'user');

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const issuesContext = STATE.issues.slice(0, 10);
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        issuesContext, 
        language: STATE.language || 'en',
        history: STATE.chatHistory 
      })
    });
    const data = await res.json();

    removeTypingIndicator(typingId);
    
    if (data.response) {
      // Append to local chat history for subsequent calls
      STATE.chatHistory.push({ role: 'user', parts: [{ text: message }] });
      STATE.chatHistory.push({ role: 'model', parts: [{ text: data.response }] });
      appendChatMessage(data.response, 'ai');
    } else {
      appendChatMessage(data.error || 'Sorry, I had trouble processing that.', 'ai');
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendChatMessage('Sorry, I\'m having connection issues. Please try again.', 'ai');
  }
}

function appendChatMessage(text, role) {
  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  div.innerHTML = `<div class="message-bubble">${text.replace(/\n/g, '<br>')}</div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTypingIndicator() {
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-message ai typing';
  div.id = id;
  div.innerHTML = `
    <div class="message-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

// ============================================================
// NOTIFICATION BUTTON
// ============================================================
document.getElementById('notification-btn')?.addEventListener('click', () => {
  const notifications = [
    { msg: '🔥 Critical: Water main burst on Koramangala 80ft Road', type: 'error' },
    { msg: '✅ Issue #sample_004 has been resolved by BWSSB!', type: 'success' },
    { msg: '⭐ Your report got 5 upvotes — Community Verified!', type: 'info' },
  ];

  notifications.forEach((n, i) => {
    setTimeout(() => showToast(n.msg, n.type, 5000), i * 800);
  });

  document.getElementById('notif-badge').classList.add('hidden');
});

// ============================================================
// MULTILINGUAL TRANSLATION SYSTEM
// ============================================================
const TRANSLATIONS = {
  en: {
    brand_name: "Civic Lens",
    brand_sub: "Community Hero",
    nav_map: "Map View",
    nav_feed: "Issue Feed",
    nav_report: "Report Issue",
    nav_dashboard: "Dashboard",
    nav_profile: "My Profile",
    view_title_feed: "Issue Feed",
    view_title_report: "Report an Issue",
    view_subtitle_report: "Help improve your community by reporting civic issues",
    view_title_dashboard: "Impact Dashboard",
    view_subtitle_dashboard: "Real-time civic health of your community",
    ai_banner_title: "AI-Powered Analysis",
    ai_banner_desc: "Upload a photo and Gemini AI will automatically detect the issue type and severity",
    form_label_photo: "📷 Upload Photo / Video",
    upload_text: "Tap to upload or drag & drop",
    upload_hint: "Supports JPG, PNG, WebP, MP4",
    form_label_title: "📝 Issue Title *",
    form_label_category: "🏷️ Category *",
    form_label_severity: "🔥 Severity *",
    form_label_description: "📄 Description",
    form_label_location: "📍 Location *",
    btn_gps: "📍 Use GPS",
    btn_reset: "Reset",
    btn_submit: "Submit Issue",
    stat_total: "Total Issues",
    stat_resolved: "Resolved This Month",
    stat_active: "Active Reports",
    stat_time: "Avg. Resolution Time",
    chart_category: "Issues by Category",
    chart_severity: "Severity Overview",
    leaderboard_title: "🏆 Top Civic Heroes",
    leaderboard_sub: "Citizens making the biggest impact this month",
    weekly_report_title: "📄 AI Weekly City Report",
    weekly_report_sub: "Gemini-generated municipal health report for BBMP",
    btn_generate_report: "⚡ Generate Report",
    profile_points: "Civic Points",
    badges_title: "🏅 Your Badges",
    reports_title: "📋 My Reports",
    bnav_map: "Map",
    bnav_feed: "Feed",
    bnav_report: "Report",
    bnav_stats: "Stats",
    bnav_profile: "Profile",
    placeholder_title: "e.g., Large pothole on 80ft Road",
    placeholder_desc: "Describe the issue, how long it's been there, and its impact on the community...",
    search_placeholder: "Search location..."
  },
  kn: {
    brand_name: "ಸಿವಿಕ್ ಲೆನ್ಸ್",
    brand_sub: "ಕಮ್ಯುನಿಟಿ ಹೀರೋ",
    nav_map: "ನಕ್ಷೆ ನೋಟ",
    nav_feed: "ಸಮಸ್ಯೆಗಳ ಫೀಡ್",
    nav_report: "ವರದಿ ಮಾಡಿ",
    nav_dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    nav_profile: "ನನ್ನ ಪ್ರೊಫೈಲ್",
    view_title_feed: "ಸಮಸ್ಯೆಗಳ ಫೀಡ್",
    view_title_report: "ಸಮಸ್ಯೆಯನ್ನು ವರದಿ ಮಾಡಿ",
    view_subtitle_report: "ನಾಗರಿಕ ಸಮಸ್ಯೆಗಳನ್ನು ವರದಿ ಮಾಡುವ ಮೂಲಕ ನಿಮ್ಮ ಸಮುದಾಯವನ್ನು ಸುಧಾರಿಸಲು ಸಹಾಯ ಮಾಡಿ",
    view_title_dashboard: "ಪ್ರಭಾವದ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    view_subtitle_dashboard: "ನಿಮ್ಮ ಸಮುದಾಯದ ನೈಜ-ಸಮಯದ ನಾಗರಿಕ ಆರೋಗ್ಯ",
    ai_banner_title: "AI-ಚಾಲಿತ ವಿಶ್ಲೇಷಣೆ",
    ai_banner_desc: "ಫೋಟೋವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಮತ್ತು ಜೆಮಿನಿ AI ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸಮಸ್ಯೆಯ ಪ್ರಕಾರ ಮತ್ತು ತೀವ್ರತೆಯನ್ನು ಪತ್ತೆ ಮಾಡುತ್ತದೆ",
    form_label_photo: "📷 ಫೋಟೋ / ವಿಡಿಯೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    upload_text: "ಅಪ್‌ಲೋಡ್ ಮಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ ಅಥವಾ ಡ್ರ್ಯಾಗ್ ಮಾಡಿ",
    upload_hint: "JPG, PNG, WebP, MP4 ಅನ್ನು ಬೆಂಬಲಿಸುತ್ತದೆ",
    form_label_title: "📝 ಸಮಸ್ಯೆಯ ಶೀರ್ಷಿಕೆ *",
    form_label_category: "🏷️ ವರ್ಗ *",
    form_label_severity: "🔥 ತೀವ್ರತೆ *",
    form_label_description: "📄 ವಿವರಣೆ",
    form_label_location: "📍 ಸ್ಥಳ *",
    btn_gps: "📍 ಜಿಪಿಎಸ್ ಬಳಸಿ",
    btn_reset: "ಮರುಹೊಂದಿಸಿ",
    btn_submit: "ವರದಿ ಸಲ್ಲಿಸಿ",
    stat_total: "ಒಟ್ಟು ಸಮಸ್ಯೆಗಳು",
    stat_resolved: "ಈ ತಿಂಗಳು ಪರಿಹರಿಸಲಾದವು",
    stat_active: "ಸಕ್ರಿಯ ವರದಿಗಳು",
    stat_time: "ಸರಾಸರಿ ಪರಿಹಾರ ಸಮಯ",
    chart_category: "ವರ್ಗದ ಪ್ರಕಾರ ಸಮಸ್ಯೆಗಳು",
    chart_severity: "ತೀವ್ರತೆಯ ಅವಲೋಕನ",
    leaderboard_title: "🏆 ಪ್ರಮುಖ ಸಿವಿಕ್ ಹೀರೋಗಳು",
    leaderboard_sub: "ಈ ತಿಂಗಳು ಅತಿ ಹೆಚ್ಚು ಪ್ರಭಾವ ಬೀರಿದ ನಾಗರಿಕರು",
    weekly_report_title: "📄 AI ಸಾಪ್ತಾಹಿಕ ನಗರ ವರದಿ",
    weekly_report_sub: "BBMP ಗಾಗಿ ಜೆಮಿನಿ ರಚಿಸಿದ ಮುನ್ಸಿಪಲ್ ಆರೋಗ್ಯ ವರದಿ",
    btn_generate_report: "⚡ ವರದಿ ರಚಿಸಿ",
    profile_points: "ನಾಗರಿಕ ಅಂಕಗಳು",
    badges_title: "🏅 ನಿಮ್ಮ ಬ್ಯಾಡ್ಜ್‌ಗಳು",
    reports_title: "📋 ನನ್ನ ವರದಿಗಳು",
    bnav_map: "ನಕ್ಷೆ",
    bnav_feed: "ಫೀಡ್",
    bnav_report: "ವರದಿ",
    bnav_stats: "ಅಂಕಿ-ಅಂಶ",
    bnav_profile: "ಪ್ರೊಫೈಲ್",
    placeholder_title: "ಉದಾ. ೮೦ ಅಡಿ ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ",
    placeholder_desc: "ಸಮಸ್ಯೆಯನ್ನು ವಿವರಿಸಿ, ಅದು ಎಷ್ಟು ದಿನಗಳಿಂದ ಇದೆ ಮತ್ತು ಸಮುದಾಯದ ಮೇಲಿನ ಪ್ರಭಾವ...",
    search_placeholder: "ಸ್ಥಳ ಹುಡುಕಿ..."
  },
  hi: {
    brand_name: "सिविक लेंस",
    brand_sub: "कम्युनिटी हीरो",
    nav_map: "नक्शा दृश्य",
    nav_feed: "समस्या फ़ीड",
    nav_report: "समस्या रिपोर्ट करें",
    nav_dashboard: "डैशबोर्ड",
    nav_profile: "मेरी प्रोफ़ाइल",
    view_title_feed: "समस्या फ़ीड",
    view_title_report: "एक समस्या रिपोर्ट करें",
    view_subtitle_report: "नागरिक समस्याओं की रिपोर्ट करके अपने समुदाय को बेहतर बनाने में मदद करें",
    view_title_dashboard: "प्रभाव डैशबोर्ड",
    view_subtitle_dashboard: "आपके समुदाय का वास्तविक समय का नागरिक स्वास्थ्य",
    ai_banner_title: "AI-संचालित विश्लेषण",
    ai_banner_desc: "एक फोटो अपलोड करें और जेमिनी AI स्वचालित रूप से समस्या के प्रकार और गंभीरता का पता लगा लेगा",
    form_label_photo: "📷 फोटो / वीडियो अपलोड करें",
    upload_text: "अपलोड करने के लिए टैप करें या खींचें और छोड़ें",
    upload_hint: "JPG, PNG, WebP, MP4 समर्थित हैं",
    form_label_title: "📝 समस्या का शीर्षक *",
    form_label_category: "🏷️ श्रेणी *",
    form_label_severity: "🔥 गंभीरता *",
    form_label_description: "📄 विवरण",
    form_label_location: "📍 स्थान *",
    btn_gps: "📍 GPS का उपयोग करें",
    btn_reset: "रीसेट करें",
    btn_submit: "समस्या जमा करें",
    stat_total: "कुल समस्याएं",
    stat_resolved: "इस महीने हल की गईं",
    stat_active: "सक्रिय रिपोर्ट",
    stat_time: "औसत समाधान समय",
    chart_category: "श्रेणी के अनुसार समस्याएं",
    chart_severity: "गंभीरता अवलोकन",
    leaderboard_title: "🏆 शीर्ष सिविक हीरोज",
    leaderboard_sub: "इस महीने सबसे बड़ा प्रभाव डालने वाले नागरिक",
    weekly_report_title: "📄 AI साप्ताहिक नगर रिपोर्ट",
    weekly_report_sub: "बीबीएमपी के लिए जेमिनी-जनरेटेड नगर स्वास्थ्य रिपोर्ट",
    btn_generate_report: "⚡ रिपोर्ट जनरेट करें",
    profile_points: "सिविक अंक",
    badges_title: "🏅 आपके बैच",
    reports_title: "📋 मेरी रिपोर्ट",
    bnav_map: "नक्शा",
    bnav_feed: "फ़ीड",
    bnav_report: "रिपोर्ट",
    bnav_stats: "आँकड़े",
    bnav_profile: "प्रोफ़ाइल",
    placeholder_title: "जैसे, 80 फीट रोड पर बड़ा गड्ढा",
    placeholder_desc: "समस्या का वर्णन करें, यह कब से है और समुदाय पर इसका क्या प्रभाव है...",
    search_placeholder: "स्थान खोजें..."
  }
};

function applyLanguage(lang) {
  const dictionary = TRANSLATIONS[lang] || TRANSLATIONS.en;
  STATE.language = lang;
  localStorage.setItem('civic_lens_lang', lang);

  // Update active state of language toggle buttons
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  // Selector mapping for translation
  const mappings = {
    '.brand-name': 'brand_name',
    '.brand-sub': 'brand_sub',
    '#nav-map .nav-label': 'nav_map',
    '#nav-feed .nav-label': 'nav_feed',
    '#nav-report .nav-label': 'nav_report',
    '#nav-dashboard .nav-label': 'nav_dashboard',
    '#nav-profile .nav-label': 'nav_profile',
    '#view-feed .view-title': 'view_title_feed',
    '#view-report .view-title': 'view_title_report',
    '#view-report .view-subtitle': 'view_subtitle_report',
    '#view-dashboard .view-title': 'view_title_dashboard',
    '#view-dashboard .view-subtitle': 'view_subtitle_dashboard',
    '#ai-banner strong': 'ai_banner_title',
    '#ai-banner p': 'ai_banner_desc',
    '#upload-placeholder .upload-text': 'upload_text',
    '#upload-placeholder .upload-hint': 'upload_hint',
    'label[for="issue-title"]': 'form_label_title',
    'label[for="issue-category"]': 'form_label_category',
    'label[for="issue-description"]': 'form_label_description',
    '#get-location-btn': 'btn_gps',
    '#reset-form-btn': 'btn_reset',
    '#submit-text': 'btn_submit',
    '#stat-total .stat-label': 'stat_total',
    '#stat-resolved .stat-label': 'stat_resolved',
    '#stat-active .stat-label': 'stat_active',
    '#stat-time .stat-label': 'stat_time',
    '.leaderboard-card .chart-title': 'leaderboard_title',
    '.leaderboard-card .chart-subtitle': 'leaderboard_sub',
    '.weekly-report-card .chart-title': 'weekly_report_title',
    '.weekly-report-card .chart-subtitle': 'weekly_report_sub',
    '#report-btn-text': 'btn_generate_report',
    '.profile-points .points-label': 'profile_points',
    '.badges-section .section-title': 'badges_title',
    '.my-reports-section .section-title': 'reports_title',
    '.bottom-nav-item[data-view="map"] .bnav-label': 'bnav_map',
    '.bottom-nav-item[data-view="feed"] .bnav-label': 'bnav_feed',
    '.bottom-nav-item[data-view="report"] .bnav-label': 'bnav_report',
    '.bottom-nav-item[data-view="dashboard"] .bnav-label': 'bnav_stats',
    '.bottom-nav-item[data-view="profile"] .bnav-label': 'bnav_profile'
  };

  for (const [selector, key] of Object.entries(mappings)) {
    const el = document.querySelector(selector);
    if (el && dictionary[key]) {
      el.textContent = dictionary[key];
    }
  }

  // Update input placeholders
  const searchInput = document.getElementById('map-search-input');
  if (searchInput && dictionary.search_placeholder) {
    searchInput.placeholder = dictionary.search_placeholder;
  }

  const titleInput = document.getElementById('issue-title');
  if (titleInput && dictionary.placeholder_title) {
    titleInput.placeholder = dictionary.placeholder_title;
  }
  const descInput = document.getElementById('issue-description');
  if (descInput && dictionary.placeholder_desc) {
    descInput.placeholder = dictionary.placeholder_desc;
  }

  // Update category select options dropdown dynamically
  const catSelect = document.getElementById('issue-category');
  if (catSelect) {
    const opts = catSelect.options;
    const catLabels = {
      en: ['Select category', '🕳️ Pothole', '💧 Water Leakage', '💡 Streetlight', '🗑️ Waste Management', '🌊 Flooding', '📦 Other'],
      kn: ['ವರ್ಗ ಆಯ್ಕೆಮಾಡಿ', '🕳️ ರಸ್ತೆ ಗುಂಡಿ', '💧 ನೀರಿನ ಸೋರಿಕೆ', '💡 ಬೀದಿ ದೀಪ', '🗑️ ಕಸ ನಿರ್ವಹಣೆ', '🌊 ಪ್ರವಾಹ', '📦 ಇತರೆ'],
      hi: ['श्रेणी चुनें', '🕳️ सड़क का गड्ढा', '💧 पानी का रिसाव', '💡 स्ट्रीटलाइट', '🗑️ कचरा प्रबंधन', '🌊 बाढ़', '📦 अन्य']
    };
    const currentCats = catLabels[lang] || catLabels.en;
    for (let i = 0; i < opts.length; i++) {
      if (currentCats[i]) opts[i].text = currentCats[i];
    }
  }

  // Sync Weekly Report language dropdown with current selection
  const reportLangSelect = document.getElementById('report-lang-select');
  if (reportLangSelect) {
    reportLangSelect.value = lang;
  }
}

// ============================================================
// ADD-ONS INTIALIZATION
// ============================================================
function initAddons() {
  // Bind language toggles
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.dataset.lang;
      applyLanguage(lang);
      showToast(`Language switched to ${lang.toUpperCase()}`, 'info', 1500);
    });
  });

  // Set initial language from storage or default
  const savedLang = localStorage.getItem('civic_lens_lang') || 'en';
  applyLanguage(savedLang);

  // Bind Duplicate Warning actions
  document.getElementById('dismiss-duplicate-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    STATE.duplicateBypass = true;
    document.getElementById('duplicate-warning').classList.add('hidden');
    // Resubmit report-form
    document.getElementById('report-form').dispatchEvent(new Event('submit', { cancelable: true }));
  });

  document.getElementById('view-duplicate-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (STATE.matchedDuplicateIssueId) {
      showIssueModal(STATE.matchedDuplicateIssueId);
    }
  });

  // Reset duplicate status on input changes
  document.getElementById('issue-title')?.addEventListener('input', () => {
    STATE.duplicateBypass = false;
    document.getElementById('duplicate-warning').classList.add('hidden');
  });
  document.getElementById('issue-category')?.addEventListener('change', () => {
    STATE.duplicateBypass = false;
    document.getElementById('duplicate-warning').classList.add('hidden');
  });

  // Bind Weekly Report generation
  const generateBtn = document.getElementById('generate-report-btn');
  const reportSpinner = document.getElementById('report-spinner');
  const reportBtnText = document.getElementById('report-btn-text');
  const reportPreview = document.getElementById('weekly-report-preview');
  const reportContent = document.getElementById('weekly-report-content');
  const langSelect = document.getElementById('report-lang-select');
  const copyBtn = document.getElementById('copy-report-btn');

  generateBtn?.addEventListener('click', async () => {
    const lang = langSelect.value || STATE.language || 'en';
    generateBtn.disabled = true;
    reportSpinner?.classList.remove('hidden');
    reportBtnText?.classList.add('hidden');

    showToast('Generating AI City Health Report...', 'info', 3000);

    try {
      const res = await fetch(`/api/weekly-report?language=${lang}`);
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();

      if (reportContent) reportContent.innerHTML = data.report;
      reportPreview?.classList.remove('hidden');

      showToast('Weekly Report generated successfully! ⚡', 'success');
      reportPreview?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      showToast('Failed to generate report. Please try again.', 'error');
    } finally {
      generateBtn.disabled = false;
      reportSpinner?.classList.add('hidden');
      reportBtnText?.classList.remove('hidden');
    }
  });

  copyBtn?.addEventListener('click', () => {
    if (reportContent) {
      const text = reportContent.innerText;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Report copied to clipboard! 📋', 'success');
      }).catch(() => {
        showToast('Failed to copy text', 'error');
      });
    }
  });
}

// ============================================================
// SIMULATE REAL-TIME CIVIC UPDATES
// ============================================================
function simulateRealtimeToasts() {
  const users = [
    'Rahul Verma', 'Sneha Rao', 'Amit Patel', 'Anjali Sharma', 'Rajesh Iyer', 
    'Priya Menon', 'Kavitha Reddy', 'Arjun Sharma', 'Vikram Nair', 'Deepa Kumar'
  ];
  
  const events = [
    {
      template: (user) => `⭐ ${user} upvoted a report in their ward!`,
      type: 'info'
    },
    {
      template: (user) => `🔥 Critical: New issue reported by ${user}!`,
      type: 'error'
    },
    {
      template: (user) => `✅ Issue resolved by BBMP rapidly! Great job, ${user}!`,
      type: 'success'
    },
    {
      template: (user) => `📢 ${user} shared an update regarding local drainage.`,
      type: 'warning'
    }
  ];

  // Show a simulated toast every 25 to 45 seconds randomly
  setInterval(() => {
    if (document.hidden) return;

    const randomUser = users[Math.floor(Math.random() * users.length)];
    const randomEvent = events[Math.floor(Math.random() * events.length)];
    
    showToast(randomEvent.template(randomUser), randomEvent.type, 5000);
  }, Math.random() * (45000 - 25000) + 25000);
}

// ============================================================
// APP INITIALIZATION
// ============================================================
async function initApp() {
  // Step 1: Fetch config
  updateLoading(10, 'Fetching configuration...');
  const config = await fetchConfig();

  // Step 2: Initialize navigation
  updateLoading(20, 'Setting up navigation...');
  initNavigation();
  initAddons();

  // Step 3: Get user location
  updateLoading(35, 'Getting your location...');
  const location = await getUserLocation();
  if (location) {
    document.getElementById('location-text').textContent = 'Near You';
    STATE.userLocation = location;
  }

  // Step 4: Initialize Firebase
  updateLoading(50, 'Connecting to Firebase...');
  const firebaseReady = await initFirebase(config);

  // Step 5: Load issues (fallback if no Firebase)
  updateLoading(65, 'Loading issues...');
  if (!firebaseReady) {
    await loadIssues();
  }

  // Step 6: Load Google Maps
  updateLoading(80, 'Loading map...');
  loadGoogleMaps(config.googleMapsKey);

  // Step 7: Bind filter events  
  updateLoading(90, 'Initializing UI...');

  // Initial render
  renderFeed();

  // Init dashboard data in background
  setTimeout(() => {
    if (STATE.currentView === 'dashboard') loadDashboard();
  }, 500);

  // Step 8: Complete
  updateLoading(100, 'Ready!');
  await new Promise(r => setTimeout(r, 500));

  hideLoadingScreen();
  simulateRealtimeToasts();

  // Welcome toast
  setTimeout(() => {
    showToast('Welcome to Civic Lens! 🏙️ Help make Bengaluru better.', 'info', 5000);
  }, 1000);
}

// Start the app
initApp().catch(err => {
  console.error('App init failed:', err);
  hideLoadingScreen();
});
