from fastapi import FastAPI, Request
import google.generativeai as genai
import json
import os
from manual_loader import download_documents
from prompt_utils import build_prompt

# Load API key and credentials
with open("config.json") as f:
    config = json.load(f)

# Configure Gemini
genai.configure(api_key=config["api_key"])
model = genai.GenerativeModel("gemini-2.0-flash-001")

# Load both manuals and forms from GCS
manuals_cache = download_documents("airline_data_mcp", prefix="manuals/")
forms_cache = download_documents("airline_data_mcp", prefix="forms/")

app = FastAPI()

@app.post("/query")
async def handle_query(request: Request):
    data = await request.json()
    user_query = data.get("query", "")

    if "form" in user_query.lower():
        prompt = build_prompt(user_query, forms_cache)
    elif "manual" in user_query.lower():
        prompt = build_prompt(user_query, manuals_cache)
    else:
        combined_docs = {**manuals_cache, **forms_cache}
        prompt = build_prompt(user_query, combined_docs)

    try:
        response = model.generate_content(prompt)
        return {"response": response.text}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)
