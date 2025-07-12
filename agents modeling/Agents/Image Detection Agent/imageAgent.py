import os
import json
import io
import base64
from typing import TypedDict
from PIL import Image, ImageDraw

from flask import Flask, request, jsonify
from langgraph.graph import StateGraph, END
import google.generativeai as genai

# --- Configuration ---
try:
    genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
except KeyError:
    print("ERROR: GOOGLE_API_KEY environment variable not set.")
    pass

# --- Initialize Flask App ---
app = Flask(__name__, static_url_path='', static_folder='static')

# --- LangGraph State Definition ---
class AgentState(TypedDict):
    image_bytes: bytes
    model_response: dict
    error_message: str

# --- LangGraph Node Functions ---
def call_gemini_vision(state: AgentState):
    """
    Calls the Gemini model to analyze the image. It now asks for the item name and type.
    """
    print("---CALLING GEMINI VISION API---")
    image_bytes = state.get("image_bytes")
    if not image_bytes:
        return {"error_message": "No image found in state."}

    image_parts = [{"mime_type": "image/jpeg", "data": image_bytes}]

    
    prompt_text = """
    You are an expert aviation maintenance inspector. Your task is to analyze the provided image, identify the item, classify the issue type, find any damage, and provide a detailed analysis in a JSON format.

    Follow these steps carefully:
    1.  **Identify Item:** First, identify the primary object in the image (e.g., "overhead bin", "suitcase", "winglet", "fuselage panel").
    2.  **Categorize Type:** Based on the item, classify the issue into one of three categories: "Damaged Baggage", "Damaged Aircraft Infrastructure", or "Lost Baggage". If the image shows a suitcase or personal bag, use "Damaged Baggage". If it shows a part of the plane, use "Damaged Aircraft Infrastructure".
    3.  **Locate Damage:** Third, mentally identify the most severe damage in the image.
    4.  **Generate Output:** Based on your analysis, generate a single JSON object with the following keys:
        * `"type"`: The category you identified in step 2.
        * `"item"`: The name of the aircraft part or baggage you identified.
        * `"description"`: A brief, clear description of the damage you identified.
        * `"priority"`: A severity level: "Low", "Medium", "High", or "Severe".
        * `"bbox"`: A bounding box object with `x_min`, `y_min`, `x_max`, `y_max` coordinates as percentages (0.0 to 1.0) that **precisely and tightly** encloses the damage.

    Example for a damaged aircraft part:
    {"type": "Damaged Aircraft Infrastructure", "item": "Overhead compartment latch", "description": "The latch mechanism is broken and hanging loose.", "priority": "Medium", "bbox": {"x_min": 0.45, "y_min": 0.55, "x_max": 0.6, "y_max": 0.65}}

    Example for damaged baggage:
    {"type": "Damaged Baggage", "item": "Blue suitcase", "description": "Large crack across the front shell.", "priority": "High", "bbox": {"x_min": 0.2, "y_min": 0.3, "x_max": 0.8, "y_max": 0.7}}

    If there is no damage, return this exact JSON with an appropriate item name and type:
    {"type": "Damaged Aircraft Infrastructure", "item": "Overhead compartment", "description": "No damage detected.", "priority": "None", "bbox": "none"}

    Analyze the image and provide only the JSON object.
    """
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    try:
        response = model.generate_content([prompt_text, *image_parts])
        # A more robust way to extract JSON from the response
        json_str = response.text.strip().lstrip("```json").rstrip("```").strip()
        model_output = json.loads(json_str)
        print(f"---GEMINI RESPONSE: {model_output}---")
        return {"model_response": model_output}
    except Exception as e:
        print(f"Error during Gemini API call: {e}")
        return {"error_message": f"Failed to get a valid response from AI model: {e}"}

def process_image_data(state: AgentState):
    """Placeholder node."""
    print("---DATA PROCESSING NODE---")
    return {}

# --- Build the LangGraph ---
workflow = StateGraph(AgentState)
workflow.add_node("call_gemini", call_gemini_vision)
workflow.add_node("process_image", process_image_data)
workflow.set_entry_point("call_gemini")
workflow.add_edge("call_gemini", "process_image")
workflow.add_edge("process_image", END)
agent = workflow.compile()

# --- Flask API Endpoint ---
@app.route("/")
def root():
    return app.send_static_file('index.html')

@app.route("/analyze", methods=["POST"])
def analyze_image_endpoint():
    """
    Receives an image, runs it through the agent, and returns a JSON response
    with the analysis data, including filename and bbox coordinates.
    """
    if 'GOOGLE_API_KEY' not in os.environ or not os.environ["GOOGLE_API_KEY"]:
        return jsonify({"error": "Server configuration error: GOOGLE_API_KEY not set."}), 500

    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files["image"]
    original_filename = image_file.filename
    image_bytes = image_file.read()
    
    inputs = {"image_bytes": image_bytes}
    final_state = agent.invoke(inputs)

    if final_state.get("error_message"):
        return jsonify({"error": final_state["error_message"]}), 500
        
    model_response = final_state.get("model_response", {})

    
    return jsonify({
        "image_filename": original_filename,
        "type": model_response.get("type", "Uncategorized"),
        "item": model_response.get("item", "Unknown item"),
        "description": model_response.get("description", "No description provided."),
        "bbox": model_response.get("bbox", "none"),
        "priority": model_response.get("priority", "Unknown")
    })

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9000))
    app.run(host="0.0.0.0", port=port, debug=True)
