# TeePublic Intelligence

AI-powered market intelligence for TeePublic — scrapes, classifies, and searches t-shirt designs.

## Setup

```bash
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt
```

Copy `.env.example` to `.env` and add your `GOOGLE_API_KEY`.

## Run

```bash
python app.py
```

Dashboard at `http://localhost:5000`

## Requirements

- Python 3.10+
- Qdrant running on `localhost:6333`
- Google Gemini API key (for deep vision classification)
