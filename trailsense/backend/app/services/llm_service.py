import httpx
import json
from typing import Optional


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


async def parse_trip_report(report_text: str, api_key: str) -> Optional[dict]:
    """Parse trip report using Groq LLM, return structured data"""

    prompt = f'''You are extracting structured trail condition data from a hiking trip report.

Trip Report:
"""
{report_text}
"""

Extract the following and return ONLY valid JSON:
{{
  "report_date": "YYYY-MM-DD" or null,
  "snow_level_ft": integer or null,
  "trail_status": "clear" | "muddy" | "icy" | "snowy" | "closed" | null,
  "mud_level": "none" | "light" | "moderate" | "heavy" | null,
  "water_crossing_status": "low" | "moderate" | "high" | "impassable" | null,
  "hazards": [],
  "required_gear": [],
  "difficulty_sentiment": "easier" | "as-expected" | "harder" | null,
  "overall_sentiment": "positive" | "neutral" | "negative",
  "confidence": float 0.0-1.0
}}

Rules:
- If information not mentioned, use null
- Return ONLY JSON, no explanation'''

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                GROQ_API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "llama-3.1-70b-versatile",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 500
                }
            )

            if response.status_code == 200:
                content = response.json()["choices"][0]["message"]["content"]
                try:
                    content_clean = content.strip()
                    if content_clean.startswith("```json"):
                        content_clean = content_clean[7:]
                    if content_clean.endswith("```"):
                        content_clean = content_clean[:-3]
                    content_clean = content_clean.strip()

                    parsed = json.loads(content_clean)
                    return parsed
                except json.JSONDecodeError:
                    return None
            return None
    except Exception as e:
        print(f"LLM parsing error: {e}")
        return None
