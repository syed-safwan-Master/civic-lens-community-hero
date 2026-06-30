# Civic Lens – Community Hero
### 🏙️ A Hyperlocal Civic Grievance & AI-Powered Resolution Platform

**Civic Lens – Community Hero** is a modern, crowdsourced web application that empowers citizens of Bengaluru to report, track, and resolve hyperlocal civic incidents (like potholes, garbage overflows, or drainage issues). By combining real-time community engagement with Google Gemini AI analysis and Google Maps, it turns local reports into structured, BBMP-ready municipal insights.

---

## 🚀 Key Features

*   **Interactive City Map**: View, search, and report civic incidents directly by coordinates or address, with custom category pins.
*   **AI Weekly City Health Report**: One-click, Gemini-generated official reports for municipal authorities, featuring week-at-a-glance metrics and neighborhood hotspots.
*   **Civic Leaderboard & Gamification**: A live, Firestore-synced leaderboard tracking citizen contributions. Earn civic points, unlock badges (e.g., *First Reporter*, *Civic Champion*, *City Guardian*), and view your highlighted rank.
*   **AI Civic Assistant**: An integrated chat interface powered by Gemini to help citizens understand bylaws, draft grievances, and find local ward information.
*   **Visual Hazard Verification**: Image uploads processed via Cloudinary, with Gemini analyzing hazard severity and auto-completing report details.
*   **Premium Responsive UI**: A fully optimized, custom Light-Theme dashboard featuring float animations, glassmorphism headers, and smooth hover translations.

---

## 🛠️ Technology Stack

*   **Frontend**: HTML5 (Semantic Layout), Vanilla CSS3 (Custom Design System, Variables, Animations), ES6 JavaScript.
*   **Backend**: Node.js, Express.
*   **Database & Auth**: Google Firebase (Cloud Firestore & Google Client-Side Auth).
*   **AI Integration**: Google Generative AI (Gemini 1.5 Flash).
*   **Media Hosting**: Cloudinary API (Image Uploads & Storage).
*   **Mapping**: Google Maps JavaScript API (Geocoding & Autocomplete).
*   **Hosting**: Google Cloud Run (Containerized Docker deployment).

---

## 💻 Local Setup & Installation

### 1. Clone the repository
```bash
git clone https://github.com/syed-safwan-Master/civic-lens-community-hero.git
cd civic-lens-community-hero
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory based on `.env.example`:
```ini
# Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key

# Google Maps
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Firebase Configuration
FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=your_upload_preset

# Server
PORT=8080
```

### 3. Install dependencies and start the app
```bash
npm install
npm run dev
```
Open your browser and navigate to `http://localhost:8080`.

---

## ☁️ Google Cloud Deployment (Cloud Run)

This application is fully containerized and ready for Google Cloud Run:

1. **Initialize the gcloud CLI**:
   ```bash
   gcloud init
   ```
2. **Enable required services**:
   ```bash
   gcloud services enable run.googleapis.com build.googleapis.com
   ```
3. **Deploy from Source**:
   ```bash
   gcloud run deploy civic-lens-hero --source . --port 8080 --allow-unauthenticated
   ```
4. **Set Environment Variables**: Link your `.env` credentials in the Cloud Run service variables dashboard in the Google Cloud Console to activate Gemini, Maps, Firebase, and Cloudinary.
