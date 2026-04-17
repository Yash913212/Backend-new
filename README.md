# CampusHub Lost & Found — Backend API

A production-ready Node.js/Express backend with an **AI Match & Report Generator** powered by Roboflow (object detection) and LLaMA 3.2 via Ollama.

---

## Quick Start

```bash
# 1. Install dependencies
cd backend
npm install

# 2. Configure environment
cp .env.example .env
# → Fill in ROBOFLOW_API_KEY, ROBOFLOW_WORKSPACE, ROBOFLOW_WORKFLOW

# 3. Start MongoDB (if local)
mongod --dbpath /data/db

# 4. Start Ollama + pull model
ollama serve &
ollama pull llama3.2

# 5. Seed sample data (optional)
npm run seed

# 6. Run dev server
npm run dev
```

Server starts on `http://localhost:5000`

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 5000) |
| `MONGO_URI` | MongoDB connection string |
| `ROBOFLOW_API_KEY` | Your Roboflow API key |
| `ROBOFLOW_WORKSPACE` | Roboflow workspace slug |
| `ROBOFLOW_WORKFLOW` | Roboflow workflow ID |
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name (default: `llama3.2`) |
| `MIN_CONFIDENCE` | Minimum Roboflow detection confidence (default: `0.6`) |
| `STRONG_MATCH_THRESHOLD` | Score to classify as strong match (default: `70`) |
| `POSSIBLE_MATCH_THRESHOLD` | Score to classify as possible match (default: `50`) |
| `TOP_MATCHES` | Max matches to return (default: `5`) |
| `MAX_FILE_SIZE_MB` | Max upload size in MB (default: `10`) |

---

## API Reference

### `POST /api/ai/match` — AI Match (Core Feature)

> **This is the endpoint triggered by the "Try AI Match" button in the React Native app.**

**Form-data fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `image` | File | ✅ | JPEG, PNG, or WebP image |
| `location` | String | ❌ | Where item was last seen |
| `date` | String | ❌ | `YYYY-MM-DD` |
| `time` | String | ❌ | `HH:MM` |

**Success response (200):**
```json
{
  "status": "success",
  "detected_object": "phone",
  "confidence": 0.9231,
  "match_status": "strong_match",
  "matches": [
    {
      "id": "...",
      "category": "found",
      "objectType": "phone",
      "location": "Library Entrance",
      "date": "2026-04-09",
      "time": "15:00",
      "contact": "+91-9777888999",
      "score": 80,
      "strength": "strong_match",
      "breakdown": { "objectType": 40, "location": 10, "date": 20, "time": 10, "image": 0 }
    }
  ],
  "ai_report": "Great news! Your lost phone has a strong match in our system...",
  "llama_used": true,
  "processing_ms": 3421
}
```

**No-match response (200):**
```json
{
  "status": "no_match",
  "detected_object": "glasses",
  "matches": [],
  "ai_report": "No matching items were found. Please report it to campus security."
}
```

**Rejection (422 — blurry image):**
```json
{
  "status": "error",
  "message": "The uploaded image appears to be blurry. Please upload a clear photo."
}
```

---

### Lost Items CRUD

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/lost` | Report a lost item (multipart/form-data) |
| `GET` | `/api/lost` | Get all unresolved lost items |
| `GET` | `/api/lost/:id` | Get a specific lost item |
| `PATCH` | `/api/lost/:id/resolve` | Mark item as resolved |
| `DELETE` | `/api/lost/:id` | Delete a lost item |

### Found Items CRUD

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/found` | Report a found item (multipart/form-data) |
| `GET` | `/api/found` | Get all unresolved found items |
| `GET` | `/api/found/:id` | Get a specific found item |
| `PATCH` | `/api/found/:id/resolve` | Mark item as resolved |
| `DELETE` | `/api/found/:id` | Delete a found item |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/ai/logs` | Last 50 AI detection logs |
| `GET` | `/api/ai/health` | MongoDB + Ollama health check |
| `GET` | `/` | Server info & endpoint list |

---

## Scoring System

| Factor | Points |
|---|---|
| Object type exact match | 40 |
| Location similarity (Jaccard) | 0–20 |
| Date proximity | 0–20 |
| Time proximity | 0–10 |
| Image similarity (placeholder) | 0–10 |

- **Score ≥ 70** → `strong_match`
- **Score ≥ 50** → `possible_match`
- **Score < 50** → filtered out

---

## Project Structure

```
backend/
├── config/
│   └── db.js                  # MongoDB connection with retry logic
├── controllers/
│   └── aiMatchController.js   # Full AI pipeline controller
├── middleware/
│   └── upload.js              # Multer config + error handler
├── models/
│   ├── LostItem.js            # Lost item schema
│   ├── FoundItem.js           # Found item schema
│   └── AIMatchLog.js          # Detection audit log schema
├── routes/
│   ├── aiMatchRoutes.js       # POST /api/ai/match + logs + health
│   ├── lostItemRoutes.js      # CRUD for /api/lost
│   └── foundItemRoutes.js     # CRUD for /api/found
├── scripts/
│   └── seed.js                # Sample data seeder
├── services/
│   ├── roboflowService.js     # Roboflow Serverless API integration
│   ├── matchingService.js     # Weighted scoring & DB matching
│   └── llamaService.js        # Ollama/LLaMA report generation
├── uploads/                   # Uploaded images (gitignored)
├── logs/                      # Log files (gitignored)
├── .env                       # Private environment variables
├── .env.example               # Template to share with team
├── server.js                  # Express app entry point
└── package.json
```

---

## React Native Integration

```javascript
// "Try AI Match" button handler
const tryAIMatch = async (imageUri) => {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  });
  // Optional context fields
  formData.append('location', 'Library');
  formData.append('date', '2026-04-10');
  formData.append('time', '14:00');

  const res = await fetch('http://<YOUR_IP>:5000/api/ai/match', {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  const data = await res.json();
  console.log(data.ai_report);   // Display this in the UI
  console.log(data.matches);     // Render match cards
};
```

---

## Postman Testing

1. Import collection or manually create requests
2. `POST http://localhost:5000/api/ai/match`
   - Body → form-data
   - Key: `image`, Type: File → attach any photo
   - Optional: `location`, `date`, `time` as Text fields
3. Check `GET http://localhost:5000/api/ai/logs` to see all detection history
4. Check `GET http://localhost:5000/api/ai/health` to verify service status
