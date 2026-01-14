# 🤖 AI DB Agent - Universal Database Natural Language Interface

<div align="center">

![AI DB Agent Banner](https://img.shields.io/badge/AI-DB_Agent-blue?style=for-the-badge&logo=openai)
![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![Ollama](https://img.shields.io/badge/Ollama-Qwen2.5-green?style=for-the-badge&logo=llama)
![Multi-DB](https://img.shields.io/badge/Multi--DB-Support-orange?style=for-the-badge)

**Talk to your databases in plain English, Hindi, or Marathi - No SQL required!**

[Features](#-features) • [Architecture](#-architecture) • [Installation](#-installation) • [Usage](#-usage)

</div>

---

## 🎯 What is AI DB Agent?

AI DB Agent is a **universal database natural language query system** that transforms how you interact with databases. Instead of writing complex SQL queries, simply ask questions in natural language - just like chatting with a colleague.

### 🌟 Key Highlights

- **🗣️ Multilingual Support**: English, Hindi (हिंदी), and Marathi (मराठी)
- **🗄️ Universal Database Support**: MongoDB, PostgreSQL, MySQL, Redis, Supabase
- **🔒 Safety First**: Built-in guardrails prevent accidental data loss
- **⚡ Lightning Fast**: Smart caching and parallel processing
- **🎨 Beautiful UI**: Clean, intuitive chat interface

---

## ✨ Features

### 🌍 Multilingual Natural Language Queries
```
English: "Show all users who registered last month"
Hindi: "पिछले महीने पंजीकृत सभी उपयोगकर्ता दिखाएं"
Marathi: "गेल्या महिन्यात नोंदणी केलेले सर्व वापरकर्ते दाखवा"
```

### 🛡️ Smart Safety Features
- **Read-Only Mode by Default**: Prevents accidental data modifications
- **Confirmation Dialogs**: For UPDATE/DELETE operations
- **Confidence Scoring**: AI validates query accuracy before execution
- **SQL Injection Prevention**: Built-in sanitization

### ⚡ Performance Optimizations
- **Parallel Processing**: Schema introspection + normalization run simultaneously (~40% faster)
- **Smart Caching**: Database schemas cached for 5 minutes
- **Model Pre-warming**: Ollama models loaded on startup
- **Hybrid Intent Detection**: Rule-based + AI-based classification

---

## 🏗️ Architecture

### 📊 Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│                      (Next.js Frontend)                         │
│  ┌──────────────┐              ┌──────────────┐                │
│  │ Chat Page    │              │ Connect Page │                │
│  │ /chat        │              │ /connect     │                │
│  └──────┬───────┘              └──────┬───────┘                │
└─────────┼──────────────────────────────┼──────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       API GATEWAY LAYER                         │
│                    (Next.js API Routes)                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐    │
│  │ /run-query  │ /normalize  │ /classify   │ /execute    │    │
│  │             │             │ -intent     │             │    │
│  └──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┘    │
└─────────┼─────────────┼─────────────┼─────────────┼───────────┘
          │             │             │             │
          ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYERS                            │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  1️⃣ LANGUAGE DETECTION & NORMALIZATION                    │  │
│  │     ├─ Detects Devanagari script (Hindi/Marathi)         │  │
│  │     └─ Translation Service (Python FastAPI + Ollama)     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  2️⃣ PARALLEL PROCESSING                                   │  │
│  │     ├─ Schema Introspection (multiDbIntrospect.js)       │  │
│  │     └─ Query Normalization (if needed)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  3️⃣ INTENT CLASSIFICATION                                 │  │
│  │     ├─ Rule-based (fast, 0-10ms)                         │  │
│  │     └─ AI-based (accurate, 500-2000ms)                   │  │
│  │     Result: READ/WRITE/UPDATE/DELETE                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  4️⃣ SAFETY GUARDRAILS                                     │  │
│  │     ├─ Read-only enforcement                             │  │
│  │     ├─ Confidence threshold check (<0.6 = confirm)       │  │
│  │     └─ Destructive operation warning                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  5️⃣ AI QUERY GENERATION (Ollama - Qwen2.5)               │  │
│  │     ├─ universalAi.js                                    │  │
│  │     ├─ Schema-aware query building                       │  │
│  │     └─ Database-specific syntax (MongoDB/SQL/Redis)      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  6️⃣ QUERY VALIDATION & SANITIZATION                       │  │
│  │     ├─ SQL injection prevention                          │  │
│  │     ├─ Schema validation                                 │  │
│  │     └─ Policy enforcement                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE ADAPTER LAYER                        │
│                     (dbAdapters.js)                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ MongoDB  │PostgreSQL│  MySQL   │  Redis   │ Supabase │      │
│  │ Adapter  │ Adapter  │ Adapter  │ Adapter  │ Adapter  │      │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘      │
└───────┼──────────┼──────────┼──────────┼──────────┼────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ACTUAL DATABASES                           │
│   🍃MongoDB   🐘PostgreSQL   🐬MySQL   🔴Redis   ⚡Supabase     │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 Message Flow Diagram

```
User Types Query
      │
      ▼
┌─────────────────────┐
│ Language Detection  │ ─── Is it Hindi/Marathi? ──┐
└─────────┬───────────┘                            │
          │ NO (English)                           │ YES
          │                                        ▼
          │                              ┌──────────────────┐
          │                              │ Translation API  │
          │                              │ (Ollama Service) │
          │                              └────────┬─────────┘
          │◄─────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────┐
    │   PARALLEL PROCESSING (Async)       │
    │  ┌──────────────┬─────────────────┐ │
    │  │ Schema Scan  │ Normalization   │ │
    │  └──────┬───────┴────────┬────────┘ │
    └─────────┼────────────────┼──────────┘
              └────────┬───────┘
                       ▼
              ┌────────────────┐
              │Intent Detection│
              │ READ/WRITE/... │
              └────────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Is Safe?     │
                │ READ only?   │
                └──────┬───────┘
                       │
         ┌─────────────┴─────────────┐
         │ YES                       │ NO
         ▼                           ▼
    Execute                  ┌────────────────┐
    Immediately              │ Show Warning   │
         │                   │ Ask Confirm    │
         │                   └────────┬───────┘
         │                            │
         │                   User Confirms?
         │                            │
         │◄───────────────────────────┘
         │
         ▼
┌──────────────────┐
│ AI Query Gen     │
│ (Qwen 2.5 Coder) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Query Validation │
│ & Sanitization   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Execute on DB    │
│ (via Adapters)   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Format Results   │
│ + AI Explanation │
└────────┬─────────┘
         │
         ▼
    Show to User
```

### 🧩 Component Breakdown

| Component | Purpose | Technology |
|-----------|---------|------------|
| **universalAi.js** | Generates database queries from NL using Ollama | Ollama + Qwen2.5-Coder |
| **multiDbIntrospect.js** | Scans and caches database structure | Node.js |
| **dbAdapters.js** | Universal database execution layer | MongoDB, pg, mysql2, redis |
| **classify-intent** | Determines operation type (CRUD) | Hybrid: Rules + AI |
| **run-query** | Orchestrates entire pipeline | Next.js API Route |
| **Translation Service** | Hindi/Marathi → English | Python FastAPI + Ollama |

---

## 🚀 Installation

### Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js** v18+ installed
- ✅ **Python** 3.8+ installed
- ✅ **Ollama** installed ([Download](https://ollama.ai))
- ✅ At least one database (MongoDB/PostgreSQL/MySQL/Redis)

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/ai-db-agent.git
cd ai-db-agent
```

### Step 2: Install Node.js Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install
```

### Step 3: Install Ollama Models

The project uses Ollama for AI processing. Install the required model:

```bash
# Install Qwen 2.5 Coder (7B) - for query generation
ollama pull qwen2.5-coder:7b

# Verify installation
ollama list
```

### Step 4: Set Up Translation Service (Optional - for Hindi/Marathi support)

```bash
# Navigate to translation service directory
cd translation-service

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start translation service
python indictrans2_service_simple.py
```

The translation service will run on `http://localhost:8000`

### Step 5: Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434

# Translation Service (Optional)
TRANSLATION_SERVICE_URL=http://localhost:8000

# Database Connections (Add as needed)
MONGODB_URI=mongodb://localhost:27017/your_database
POSTGRES_URI=postgresql://user:password@localhost:5432/your_database
MYSQL_URI=mysql://user:password@localhost:3306/your_database
REDIS_URI=redis://localhost:6379

# Security
ENABLE_WRITE_OPERATIONS=false  # Set to true to allow UPDATE/DELETE
```

### Step 6: Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 7: Connect Your Database

1. Navigate to **Connect** page (`/connect`)
2. Select your database type
3. Enter connection details
4. Click **Test Connection**
5. If successful, click **Save & Continue**

### Step 8: Start Querying!

Go to the **Chat** page (`/chat`) and start asking questions:

```
"Show all users"
"How many orders were placed today?"
"Find customers from Mumbai"
"सभी उत्पाद दिखाएं" (Show all products in Hindi)
```

---

## 💡 Usage Examples

### Example 1: Simple Read Query

**Input:**
```
Show me all active users
```

**What Happens:**
1. ✅ Intent detected: READ
2. ✅ Schema analyzed automatically
3. ✅ Query generated: `SELECT * FROM users WHERE status = 'active'`
4. ✅ Executed immediately
5. ✅ Results displayed in table format

---

### Example 2: Multilingual Query (Hindi)

**Input:**
```
पिछले हफ्ते के सभी ऑर्डर दिखाएं
```

**What Happens:**
1. 🔄 Detected Hindi script
2. 🌐 Translated to: "Show all orders from last week"
3. ✅ Intent: READ
4. ✅ Query: `SELECT * FROM orders WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
5. ✅ Results shown

---

### Example 3: Protected Write Operation

**Input:**
```
Delete all inactive accounts
```

**What Happens:**
1. ⚠️ Intent detected: DELETE
2. 🛑 Safety guardrail triggered
3. 📋 Confirmation dialog appears:
   ```
   ⚠️ DESTRUCTIVE OPERATION
   This will DELETE records from your database.
   
   Generated Query:
   DELETE FROM accounts WHERE status = 'inactive'
   
   Estimated affected rows: ~145
   
   [Cancel] [Confirm Delete]
   ```
4. ✅ User must explicitly confirm
5. 🚀 Only then executed

---

## 🔒 Security Features

### 1. Read-Only Mode (Default)
All connections start in read-only mode. No data can be modified accidentally.

### 2. Confirmation System
UPDATE/DELETE operations require explicit user confirmation with preview of changes.

### 3. Confidence Scoring
```javascript
Overall Confidence = 
  (Intent Confidence × 0.5) + 
  (Language Confidence × 0.3) + 
  (Query Completeness × 0.2)
```

If confidence < 0.6, user is asked to confirm before execution.

### 4. SQL Injection Prevention
All queries are parameterized and sanitized through database adapters.

### 5. Audit Logging
Every query execution is logged with:
- User query
- Generated SQL/command
- Execution time
- Result status

---

## 📁 Project Structure

```
ai-db-agent/
├── app/
│   ├── chat/
│   │   └── page.js              # Main chat interface
│   ├── connect/
│   │   └── page.js              # Database connection setup
│   └── api/
│       ├── ai/
│       │   ├── run-query/       # Main query orchestrator
│       │   ├── normalize/       # Language normalization
│       │   ├── classify-intent/ # Intent detection
│       │   ├── execute/         # Query execution
│       │   └── prewarm/         # Model pre-warming
│       ├── connect/             # DB connection testing
│       └── db/
│           └── introspect/      # Schema scanning
├── lib/
│   ├── universalAi.js           # Ollama query generation
│   ├── multiDbIntrospect.js     # Database schema scanner
│   ├── dbAdapters.js            # Universal DB adapters
│   ├── db.js                    # DB client factory
│   └── utils.ts                 # Helper functions
├── translation-service/
│   └── indictrans2_service_simple.py  # Translation API
├── components/
│   └── ui/                      # Reusable UI components
├── public/
├── .env.local                   # Environment configuration
└── package.json
```

---

## 🎨 Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React, Tailwind CSS |
| **Backend** | Next.js API Routes, Node.js |
| **AI/ML** | Ollama (Qwen 2.5 Coder 7B) |
| **Translation** | Python FastAPI + Ollama |
| **Databases** | MongoDB, PostgreSQL, MySQL, Redis, Supabase |
| **Caching** | In-memory cache (5-minute schema TTL) |

---

## 🛠️ Advanced Configuration

### Custom Confidence Thresholds

Edit `lib/universalAi.js`:

```javascript
const CONFIDENCE_THRESHOLD = 0.6; // Adjust as needed
```

### Enable Write Operations Globally

In `.env.local`:

```env
ENABLE_WRITE_OPERATIONS=true
```

### Custom Schema Cache Duration

In `lib/multiDbIntrospect.js`:

```javascript
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (adjust as needed)
```

---

## 🐛 Troubleshooting

### Issue: Ollama connection failed

**Solution:**
```bash
# Check if Ollama is running
ollama list

# Start Ollama service if not running
ollama serve

# Verify model is installed
ollama pull qwen2.5-coder:7b
```

### Issue: Translation service not responding

**Solution:**
```bash
# Check if service is running
curl http://localhost:8000/health

# Restart service
cd translation-service
python indictrans2_service_simple.py
```

### Issue: Database connection timeout

**Solution:**
- Verify database is running
- Check connection string in `.env.local`
- Ensure firewall allows connections
- Try increasing timeout in `lib/db.js`

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Ollama** for making local LLM deployment simple
- **Qwen Team** for the excellent code-optimized model
- **Next.js Team** for the amazing framework
- All contributors and testers

---

## 📞 Support

For issues, questions, or suggestions:

- 🐛 [GitHub Issues](https://github.com/yourusername/ai-db-agent/issues)
- 💬 [Discussions](https://github.com/yourusername/ai-db-agent/discussions)
- 📧 Email: your.email@example.com

---

<div align="center">

**Made with ❤️ by [Your Name]**

⭐ Star this repo if you find it helpful!

</div>