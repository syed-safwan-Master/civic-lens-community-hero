require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SAMPLE DATA (used as fallback and for seeding)
// ============================================================
const sampleIssues = [
  {
    id: 'sample_001',
    title: 'Large Pothole on 80ft Road',
    description: 'A deep pothole approximately 2 feet wide has formed near the junction, causing damage to vehicles. Multiple accidents reported in the last week.',
    category: 'pothole',
    severity: 5,
    lat: 12.9352,
    lng: 77.6245,
    address: '80ft Road, Koramangala 4th Block, Bengaluru',
    imageUrl: null,
    status: 'open',
    upvotes: 12,
    reportedBy: 'Arjun Sharma',
    reportedByUid: 'sample_user_1',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'high'
  },
  {
    id: 'sample_002',
    title: 'Street Light Out for 2 Weeks',
    description: 'Three consecutive streetlights near the park entrance have been non-functional for over two weeks. The area becomes dangerously dark at night.',
    category: 'streetlight',
    severity: 3,
    lat: 12.9784,
    lng: 77.6408,
    address: 'CMH Road, Indiranagar, Bengaluru',
    imageUrl: null,
    status: 'in-progress',
    upvotes: 8,
    reportedBy: 'Priya Menon',
    reportedByUid: 'sample_user_2',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'medium'
  },
  {
    id: 'sample_003',
    title: 'Garbage Overflow at Collection Point',
    description: 'The garbage collection point at the corner has been overflowing for 3 days. Waste is spilling onto the road creating health hazards.',
    category: 'waste',
    severity: 4,
    lat: 12.9116,
    lng: 77.6389,
    address: 'HSR Layout Sector 2, Bengaluru',
    imageUrl: null,
    status: 'open',
    upvotes: 6,
    reportedBy: 'Kavitha Reddy',
    reportedByUid: 'sample_user_3',
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'high'
  },
  {
    id: 'sample_004',
    title: 'Water Main Burst - Road Flooding',
    description: 'A burst water main is flooding the street and causing water to enter nearby shops and residences. Immediate repair needed.',
    category: 'waterLeakage',
    severity: 5,
    lat: 12.9698,
    lng: 77.6411,
    address: 'Domlur Ring Road, Bengaluru',
    imageUrl: null,
    status: 'resolved',
    upvotes: 15,
    reportedBy: 'Vikram Nair',
    reportedByUid: 'sample_user_4',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'high'
  },
  {
    id: 'sample_005',
    title: 'Flooding in Underpass During Rain',
    description: 'The underpass floods severely during even light rainfall. Water level reaches knee height making it impassable for pedestrians.',
    category: 'flooding',
    severity: 4,
    lat: 12.9250,
    lng: 77.6180,
    address: 'Koramangala 6th Block Underpass, Bengaluru',
    imageUrl: null,
    status: 'open',
    upvotes: 9,
    reportedBy: 'Deepa Kumar',
    reportedByUid: 'sample_user_5',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'medium'
  },
  {
    id: 'sample_006',
    title: 'Broken Footpath Causing Accidents',
    description: 'Multiple sections of the footpath have cracked and collapsed. Elderly pedestrians have reportedly tripped and injured themselves.',
    category: 'other',
    severity: 2,
    lat: 12.9742,
    lng: 77.6374,
    address: 'Indiranagar 100ft Road, Bengaluru',
    imageUrl: null,
    status: 'in-progress',
    upvotes: 4,
    reportedBy: 'Rajesh Iyer',
    reportedByUid: 'sample_user_1',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: false,
    urgency: 'low'
  },
  {
    id: 'sample_007',
    title: 'Stray Dogs Menace Near School',
    description: 'A large pack of stray dogs has been aggressive near the school entrance, scaring children and parents during drop-off hours.',
    category: 'other',
    severity: 3,
    lat: 12.9068,
    lng: 77.6488,
    address: 'HSR Layout Sector 6, Near BDA Complex, Bengaluru',
    imageUrl: null,
    status: 'open',
    upvotes: 11,
    reportedBy: 'Sunita Rao',
    reportedByUid: 'sample_user_2',
    timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'medium'
  },
  {
    id: 'sample_008',
    title: 'Damaged Drainage Causing Waterlogging',
    description: 'Blocked and damaged drainage near the market area causes severe waterlogging after every rain. The stagnant water is a breeding ground for mosquitoes.',
    category: 'waterLeakage',
    severity: 3,
    lat: 12.9443,
    lng: 77.6281,
    address: 'Koramangala 1st Block Market, Bengaluru',
    imageUrl: null,
    status: 'resolved',
    upvotes: 7,
    reportedBy: 'Mohammed Ali',
    reportedByUid: 'sample_user_3',
    timestamp: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    communityVerified: true,
    urgency: 'medium'
  }
];

// In-memory issues store (used when Firebase is not configured)
let issuesStore = [...sampleIssues];
let userUpvotes = {}; // track {userId: [issueIds]}

// ============================================================
// API ROUTES
// ============================================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Civic Lens API' });
});

// Get Firebase config (safe to expose these to frontend)
app.get('/api/config', (req, res) => {
  res.json({
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
      projectId: process.env.FIREBASE_PROJECT_ID || '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
      appId: process.env.FIREBASE_APP_ID || ''
    },
    googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
    hasGemini: !!process.env.GEMINI_API_KEY,
    hasFirebase: !!(process.env.FIREBASE_API_KEY && process.env.FIREBASE_PROJECT_ID),
    hasCloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
  });
});

// Get all issues (fallback for when Firebase is not configured)
app.get('/api/issues', (req, res) => {
  const { category, status, sort } = req.query;
  let filtered = [...issuesStore];

  if (category && category !== 'all') {
    filtered = filtered.filter(i => i.category === category);
  }
  if (status && status !== 'all') {
    filtered = filtered.filter(i => i.status === status);
  }

  if (sort === 'upvotes') {
    filtered.sort((a, b) => b.upvotes - a.upvotes);
  } else if (sort === 'severity') {
    filtered.sort((a, b) => b.severity - a.severity);
  } else {
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  res.json({ issues: filtered, total: filtered.length });
});

// Create issue (fallback)
app.post('/api/issues', (req, res) => {
  const issue = {
    id: 'issue_' + Date.now(),
    ...req.body,
    upvotes: 0,
    status: 'open',
    communityVerified: false,
    timestamp: new Date().toISOString()
  };
  issuesStore.unshift(issue);
  res.json({ success: true, issue });
});

// Upvote issue (fallback)
app.post('/api/issues/:id/upvote', (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const issue = issuesStore.find(i => i.id === id);

  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  if (!userUpvotes[userId]) userUpvotes[userId] = [];
  if (userUpvotes[userId].includes(id)) {
    return res.json({ success: false, message: 'Already upvoted', upvotes: issue.upvotes });
  }

  issue.upvotes++;
  userUpvotes[userId].push(id);
  if (issue.upvotes >= 5) issue.communityVerified = true;

  res.json({ success: true, upvotes: issue.upvotes, communityVerified: issue.communityVerified });
});

// Update issue status
app.patch('/api/issues/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const issue = issuesStore.find(i => i.id === id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  issue.status = status;
  res.json({ success: true, issue });
});

// ============================================================
// CLOUDINARY IMAGE UPLOAD
// ============================================================

// Upload image to Cloudinary (standalone endpoint)
app.post('/api/upload-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
      return res.status(503).json({ error: 'Cloudinary not configured' });
    }

    const dataUri = `data:${mimeType};base64,${imageBase64}`;
    const uploadResult = await cloudinary.uploader.upload(dataUri, {
      folder: 'community-hero',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    });

    res.json({ url: uploadResult.secure_url });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// ============================================================
// GEMINI AI ENDPOINTS
// ============================================================

// Analyze image with Gemini Vision AND upload to Cloudinary in one call.
// Returns: { url, category, severity, title, description, urgency }
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // ── Step 1: Upload to Cloudinary ─────────────────────────
    let imageUrl = null;
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
      try {
        const dataUri = `data:${mimeType};base64,${imageBase64}`;
        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder: 'community-hero',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }]
        });
        imageUrl = uploadResult.secure_url;
      } catch (uploadErr) {
        // Non-fatal: continue with AI analysis even if upload fails
        console.warn('Cloudinary upload failed (non-fatal):', uploadErr.message);
      }
    }

    // ── Step 2: Gemini Vision analysis ───────────────────────
    if (!process.env.GEMINI_API_KEY) {
      // Return mock response with cloudinary URL if we got one
      return res.json({
        url: imageUrl,
        category: 'pothole',
        severity: 3,
        title: 'Road Damage Detected',
        description: 'A road damage issue has been detected in the uploaded image. Please verify the details and add more context before submitting.',
        urgency: 'medium'
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Analyze this image of a community issue in an Indian urban setting.
Return ONLY a valid JSON object (no markdown, no code blocks) with exactly these fields:
{
  "category": "one of: pothole, waterLeakage, streetlight, waste, flooding, other",
  "severity": integer 1-5 where 1=minor and 5=critical emergency,
  "title": "short descriptive title under 60 chars",
  "description": "exactly 2 sentences describing the issue and its impact on residents",
  "urgency": "one of: low, medium, high"
}`;

    const imagePart = {
      inlineData: { data: imageBase64, mimeType }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text().trim();

    // Strip markdown code fences if present
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Return combined result: cloudinary URL + AI fields
    res.json({ url: imageUrl, ...parsed });
  } catch (error) {
    console.error('Analyze-image error:', error);
    // Graceful fallback — still return any URL we may have obtained
    res.json({
      url: null,
      category: 'other',
      severity: 2,
      title: 'Community Issue Reported',
      description: 'An issue has been detected in the uploaded image. Please review and add more details before submitting.',
      urgency: 'medium'
    });
  }
});

// AI Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, issuesContext = [], language = 'en', history = [] } = req.body;

    const languageInstruction = language === 'kn'
      ? 'Always respond entirely in Kannada (ಕನ್ನಡ) script. Use formal Kannada.'
      : language === 'hi'
      ? 'Always respond entirely in Hindi (हिंदी). Use formal Hindi.'
      : 'Respond in English.';

    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        response: "I'm CivicPulse AI! I'm here to help you report issues, understand the resolution process, and draft formal complaints. However, the AI service needs to be configured with a Gemini API key to provide intelligent responses. Please contact your administrator."
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const issuesSummary = issuesContext.slice(0, 10).map(issue =>
      `- [${issue.category}] ${issue.title} at ${issue.address} (Severity: ${issue.severity}/5, Status: ${issue.status}, Upvotes: ${issue.upvotes})`
    ).join('\n');

    const systemContext = `You are CivicPulse AI, a helpful and empathetic assistant for community issue reporting in Indian cities, especially Bengaluru.

Your role:
1. Help citizens report civic issues effectively
2. Explain the municipal resolution process in simple terms
3. Draft formal complaint letters when requested
4. Provide guidance on escalation paths (BBMP, BWSSB, BESCOM, etc.)
5. Motivate citizens to participate in civic improvement

Communication style:
- Friendly, helpful, and encouraging
- Be specific about Bengaluru's civic bodies when relevant
- Keep responses concise but comprehensive
- ${languageInstruction}

Current open issues in the area:
${issuesSummary || 'No issues loaded yet. Ask the user to refresh the feed.'}

Important contacts:
- BBMP (Roads, Waste): 1533 or bbmp.gov.in
- BWSSB (Water): 1916
- BESCOM (Electricity): 1912
- Emergency: 112`;

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: 'System context: ' + systemContext }]
        },
        {
          role: 'model',
          parts: [{ text: 'Understood! I am CivicPulse AI, ready to help the community of Bengaluru with civic issues.' }]
        },
        ...history
      ]
    });

    const result = await chat.sendMessage(message);
    const response = result.response.text();

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat service temporarily unavailable', response: 'I apologize, I\'m having trouble connecting right now. Please try again in a moment.' });
  }
});

// Generate formal complaint letter
app.post('/api/generate-complaint', async (req, res) => {
  try {
    const { issue } = req.body;

    if (!issue) {
      return res.status(400).json({ error: 'Issue data required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      // Return template letter
      const templateLetter = generateTemplateLetter(issue);
      return res.json({ letter: templateLetter });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `Generate a formal complaint letter in English to the Bruhat Bengaluru Mahanagara Palike (BBMP) Municipal Corporation regarding the following civic issue:

Issue Details:
- Title: ${issue.title}
- Category: ${issue.category}
- Description: ${issue.description}
- Location: ${issue.address}
- Severity: ${issue.severity}/5
- Status: ${issue.status}
- Community Upvotes: ${issue.upvotes} (${issue.communityVerified ? 'Community Verified' : 'Not yet verified'})
- Reported: ${new Date(issue.timestamp).toLocaleDateString('en-IN')}

Write a professional, firm but respectful complaint letter that:
1. Starts with "To, The Commissioner, BBMP..."
2. Includes today's date: ${new Date().toLocaleDateString('en-IN')}
3. States the issue clearly with location and duration
4. Mentions the community impact and number of affected citizens
5. References any applicable BBMP regulations or service standards
6. Requests specific action within a reasonable timeframe (7-14 days based on severity)
7. Includes a follow-up threat (RTI application, escalation to ward councilor) if not addressed
8. Ends with "Yours faithfully," placeholder

Make it 300-400 words, formal but readable.`;

    const result = await model.generateContent(prompt);
    const letter = result.response.text();

    res.json({ letter });
  } catch (error) {
    console.error('Complaint generation error:', error);
    const templateLetter = generateTemplateLetter(req.body.issue || {});
    res.json({ letter: templateLetter });
  }
});

function generateTemplateLetter(issue) {
  const today = new Date().toLocaleDateString('en-IN');
  return `To,
The Commissioner,
Bruhat Bengaluru Mahanagara Palike (BBMP),
N.R. Square, Bengaluru - 560002

Date: ${today}

Subject: Urgent Complaint Regarding ${issue.title || 'Civic Issue'} at ${issue.address || 'Bengaluru'}

Respected Sir/Madam,

I, a resident of Bengaluru, write to bring to your urgent attention a critical civic issue that has been affecting our community for several days.

The issue pertains to: ${issue.title || 'Civic infrastructure problem'} located at ${issue.address || 'Bengaluru'}. ${issue.description || 'This issue requires immediate attention from the concerned authorities.'}

This problem has been rated ${issue.severity || 3}/5 in severity by community members, and has received ${issue.upvotes || 0} community confirmations, indicating widespread concern among residents.

The continued neglect of this issue poses significant risks to public safety and quality of life. I respectfully request that BBMP take immediate corrective action within 7 working days of receiving this complaint.

If the matter is not addressed within the stipulated time, I shall be constrained to file an RTI application and escalate the matter to the Ward Councilor and the office of the Mayor.

I trust that BBMP will treat this matter with the urgency it deserves.

Yours faithfully,
[Your Name]
[Your Address]
[Contact Number]
[Civic Lens Issue ID: ${issue.id || 'N/A'}]`;
}

// Dashboard stats endpoint
app.get('/api/stats', (req, res) => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const total = issuesStore.length;
  const resolvedThisMonth = issuesStore.filter(i =>
    i.status === 'resolved' && new Date(i.timestamp) >= thisMonthStart
  ).length;
  const activeReports = issuesStore.filter(i => i.status !== 'resolved').length;

  // Calculate avg resolution time (mock)
  const resolvedIssues = issuesStore.filter(i => i.status === 'resolved');
  const avgResolutionDays = resolvedIssues.length > 0 ? 4.2 : 0;

  // Category breakdown
  const categoryCount = {};
  issuesStore.forEach(i => {
    categoryCount[i.category] = (categoryCount[i.category] || 0) + 1;
  });

  // Leaderboard
  const userStats = {};
  issuesStore.forEach(i => {
    if (!userStats[i.reportedBy]) {
      userStats[i.reportedBy] = { name: i.reportedBy, issues: 0, upvotes: 0, points: 0 };
    }
    userStats[i.reportedBy].issues++;
    userStats[i.reportedBy].upvotes += i.upvotes;
    userStats[i.reportedBy].points += 10 + (i.upvotes * 2) + (i.status === 'resolved' ? 50 : 0);
  });

  const leaderboard = Object.values(userStats)
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  res.json({
    total,
    resolvedThisMonth,
    activeReports,
    avgResolutionDays: avgResolutionDays.toFixed(1),
    categoryCount,
    leaderboard
  });
});

// ============================================================
// CATCH-ALL & FRONTEND SERVE
// ============================================================

// ── Duplicate Detection ────────────────────────────────────────
// POST /api/check-duplicate
// Body: { category, lat, lng, title, description }
// Finds issues within ~500m with same/similar category, then asks
// Gemini if the new report is likely a duplicate.
app.post('/api/check-duplicate', async (req, res) => {
  try {
    const { category, lat, lng, title = '', description = '' } = req.body;

    if (!lat || !lng) return res.json({ isDuplicate: false });

    // Haversine distance in metres
    const haversine = (lat1, lng1, lat2, lng2) => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Find open/in-progress issues within 500 m with same or related category
    const relatedCategories = { waterLeakage: ['flooding'], flooding: ['waterLeakage'] };
    const allowedCats = new Set([category, ...(relatedCategories[category] || [])]);

    const nearby = issuesStore.filter(i =>
      i.status !== 'resolved' &&
      allowedCats.has(i.category) &&
      haversine(lat, lng, i.lat || 0, i.lng || 0) < 500
    ).slice(0, 5);

    if (nearby.length === 0) return res.json({ isDuplicate: false });

    // If no Gemini key, do simple heuristic match
    if (!process.env.GEMINI_API_KEY) {
      return res.json({
        isDuplicate: true,
        matchedIssue: nearby[0],
        confidence: 'medium',
        reason: 'A similar issue exists within 500 metres.'
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const nearbyList = nearby.map((i, idx) =>
      `${idx + 1}. ID: ${i.id} | "${i.title}" at ${i.address || 'unknown'} — ${i.upvotes} upvotes`
    ).join('\n');

    const prompt = `A citizen is trying to report the following civic issue in Bengaluru:
Title: "${title}"
Category: ${category}
Description: "${description}"

These existing OPEN issues are within 500 metres:
${nearbyList}

Return ONLY a valid JSON object (no markdown, no code fences):
{
  "isDuplicate": true or false,
  "matchedIssueIndex": index (1-based) of the best match, or null,
  "confidence": "high", "medium", or "low",
  "reason": "one sentence explaining your assessment"
}

Be conservative: only return isDuplicate=true if the new report is clearly about the same physical problem.`;

    const result = await model.generateContent(prompt);
    const cleaned = result.response.text().trim()
      .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const matchedIssue = parsed.matchedIssueIndex
      ? nearby[parsed.matchedIssueIndex - 1]
      : nearby[0];

    res.json({ ...parsed, matchedIssue });
  } catch (err) {
    console.error('Duplicate check error:', err);
    res.json({ isDuplicate: false });
  }
});

// ── AI Weekly City Health Report ───────────────────────────────
// GET /api/weekly-report?language=en|kn|hi
app.get('/api/weekly-report', async (req, res) => {
  try {
    const language = req.query.language || 'en';
    const langNote = language === 'kn'
      ? 'Write the ENTIRE report in Kannada (ಕನ್ನಡ) script.'
      : language === 'hi'
      ? 'Write the ENTIRE report in Hindi (हिंदी).'
      : 'Write in English.';

    const now = new Date();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekIssues = issuesStore.filter(i => new Date(i.timestamp) >= weekAgo);
    const resolvedThisWeek = issuesStore.filter(i => i.status === 'resolved' && new Date(i.timestamp) >= weekAgo);
    const criticalIssues = issuesStore.filter(i => i.severity >= 4 && i.status !== 'resolved')
      .sort((a, b) => b.severity - a.severity).slice(0, 5);

    const categoryCount = {};
    issuesStore.forEach(i => { categoryCount[i.category] = (categoryCount[i.category] || 0) + 1; });

    const topAreas = {};
    issuesStore.forEach(i => {
      const area = (i.address || '').split(',')[1]?.trim() || 'Unknown';
      topAreas[area] = (topAreas[area] || 0) + 1;
    });
    const hotspots = Object.entries(topAreas).sort((a, b) => b[1] - a[1]).slice(0, 3);

    if (!process.env.GEMINI_API_KEY) {
      // Fallback template report
      return res.json({
        report: generateFallbackReport(now, thisWeekIssues, resolvedThisWeek, criticalIssues, categoryCount, hotspots)
      });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const dataContext = `
Report Date: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Total Issues in System: ${issuesStore.length}
New Issues This Week: ${thisWeekIssues.length}
Resolved This Week: ${resolvedThisWeek.length}
Resolution Rate: ${issuesStore.length > 0 ? ((issuesStore.filter(i => i.status === 'resolved').length / issuesStore.length) * 100).toFixed(1) : 0}%
Active Critical Issues (Severity 4-5): ${criticalIssues.length}

Category Breakdown: ${JSON.stringify(categoryCount)}
Top Hotspot Areas: ${hotspots.map(([area, count]) => `${area} (${count} issues)`).join(', ')}

Top 5 Urgent Open Issues:
${criticalIssues.map(i => `- [Sev ${i.severity}] ${i.title} at ${i.address} (${i.upvotes} upvotes)`).join('\n')}
`;

    const prompt = `You are generating an official Bengaluru Civic Health Weekly Report for the Civic Lens platform.
${langNote}

Data for this week:
${dataContext}

Generate a professional, comprehensive municipal report with these sections:
1. EXECUTIVE SUMMARY (2-3 sentences, key highlights)
2. WEEK AT A GLANCE (bullet stats)
3. CRITICAL ISSUES REQUIRING IMMEDIATE ACTION (list the top issues with recommended actions)
4. NEIGHBOURHOOD HOTSPOTS (areas with most activity)
5. CATEGORY ANALYSIS (insights from the category breakdown)
6. RECOMMENDATIONS TO BBMP (3-5 actionable recommendations)
7. CITIZEN ENGAGEMENT NOTE (encouraging message to citizens)

Format the report in clean HTML (use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <table> tags). Make it print-ready and professional.
Do NOT include <html>, <head>, or <body> tags — just the inner content.`;

    const result = await model.generateContent(prompt);
    const report = result.response.text()
      .replace(/```html\n?/g, '').replace(/```\n?/g, '').trim();

    res.json({ report, generatedAt: now.toISOString(), stats: { total: issuesStore.length, newThisWeek: thisWeekIssues.length, resolved: resolvedThisWeek.length } });
  } catch (err) {
    console.error('Weekly report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

function generateFallbackReport(now, thisWeek, resolved, critical, categories, hotspots) {
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  return `<h2>Bengaluru Civic Health Report</h2>
<p><strong>Generated:</strong> ${dateStr} | <strong>Platform:</strong> Civic Lens – Community Hero</p>
<hr>
<h3>Executive Summary</h3>
<p>This week, the community reported <strong>${thisWeek.length} new issues</strong> and resolved <strong>${resolved.length} issues</strong>. There are currently <strong>${critical.length} critical issues</strong> requiring immediate municipal attention.</p>
<h3>Week at a Glance</h3>
<ul>
  <li>New issues reported: ${thisWeek.length}</li>
  <li>Issues resolved: ${resolved.length}</li>
  <li>Critical open issues: ${critical.length}</li>
  <li>Top hotspot: ${hotspots[0]?.[0] || 'N/A'}</li>
</ul>
<h3>Critical Issues Requiring Immediate Action</h3>
<ul>${critical.map(i => `<li><strong>[Severity ${i.severity}]</strong> ${i.title} — ${i.address} (${i.upvotes} community upvotes)</li>`).join('')}</ul>
<h3>Recommendations to BBMP</h3>
<ul>
  <li>Prioritise all Severity 4-5 issues for resolution within 48 hours</li>
  <li>Deploy rapid response teams to hotspot areas</li>
  <li>Improve drainage infrastructure in flooding-prone zones</li>
</ul>
<p style="margin-top:24px;font-size:0.85em;color:#64748b">Report generated by Civic Lens – Community Hero platform</p>`;
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🏙️  Civic Lens - Community Hero`);
  console.log(`📡  Server running at http://localhost:${PORT}`);
  console.log(`🔑  Gemini AI:    ${process.env.GEMINI_API_KEY ? '✅ Configured' : '⚠️  Not configured (using fallbacks)'}`);
  console.log(`🗺️   Google Maps:  ${process.env.GOOGLE_MAPS_API_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
  console.log(`🔥  Firebase:     ${process.env.FIREBASE_API_KEY ? '✅ Configured' : '⚠️  Not configured (using in-memory)'}`);
  console.log(`☁️   Cloudinary:   ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configured' : '⚠️  Not configured (images stored as URLs only)'}\n`);
});
