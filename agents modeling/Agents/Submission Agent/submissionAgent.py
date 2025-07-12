import os
import json
import hashlib
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from pinecone import Pinecone
from google import genai
from google.genai.types import EmbedContentConfig


# --- Initialization ---
load_dotenv()
app = Flask(__name__)

# --- Client Configuration ---
GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY")
PINECONE_API_KEY = "" # removed for privacy
if not GEMINI_API_KEY or not PINECONE_API_KEY:
    raise ValueError("GEMINI_API_KEY and PINECONE_API_KEY must be set in the environment.")

# Initialize clients
pc = Pinecone(api_key=PINECONE_API_KEY)
client = genai.Client(api_key=GEMINI_API_KEY)

# Connect to your Pinecone index
index = pc.Index(host="https://hackathon.svc.aped.pinecone.io") # removed detailed host url for privacy)
print("--- Clients Initialized Successfully ---")


# --- Helper Functions ---

def generate_json_id(data: dict) -> str:
    """Creates a consistent SHA256 hash for a given dictionary."""
    json_str = json.dumps(data, sort_keys=True).encode()
    return hashlib.sha256(json_str).hexdigest()

def process_data_into_form(input_data: dict) -> dict:
    """Takes raw data, uses a template and LLM to create a structured form."""
    print("--- Generating form from input data... ---")
    try:
        return input_data
    except (json.JSONDecodeError, AttributeError) as e:
        raise ValueError(f"Failed to parse LLM response into JSON: {e}")


def submit_to_vector_db(form_data: dict):
    """Embeds the structured form data and upserts it into Pinecone."""
    text_to_embed = json.dumps(form_data)
    vector_id = generate_json_id(form_data)
    result = client.models.embed_content(
        model = "gemini-embedding-exp-03-07",
        contents = text_to_embed,
        config=EmbedContentConfig(
        output_dimensionality=1536,
        )
    )
    index.upsert(
        vectors=[{
            "id": vector_id,
            "values": result.embeddings[0].values
        }],
        namespace="example-ig"  # Using the namespace from your code
    )
    print(f"--- Successfully upserted vector with ID: {vector_id} ---")


# --- Flask API Endpoint ---

@app.route("/submit_report", methods=["POST"])
def submit_report_endpoint():
    """
    API endpoint to process raw data into a structured form,
    embed it, and store it in a vector database.
    """
    if not index:
        return jsonify({"error": "Server is not configured properly. Pinecone index not available."}), 503

    try:
        input_data = request.get_json()
        if not input_data:
            return jsonify({"error": "Request body must be non-empty JSON."}), 400
        report = process_data_into_form(input_data)
        submit_to_vector_db(report)
        ticket_id = generate_json_id(report)
        return jsonify({
            "status": "success",
            "ticket_id": ticket_id,
            "submitted_report": report
        }), 200

    except ValueError as ve:
        # Handle known errors like missing files or bad data
        return jsonify({"error": f"Bad Request or Configuration Error: {str(ve)}"}), 400
    except Exception as e:
        # Handle unexpected errors during processing
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

# --- Start Flask App ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8088))
    app.run(host="0.0.0.0", port=port, debug=True)
