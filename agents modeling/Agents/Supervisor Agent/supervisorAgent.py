import os
import base64
import io
import requests
import json
from flask import Flask, request, jsonify, Response
from langgraph.graph import StateGraph, END
from typing import TypedDict, Optional, Any
import google.generativeai as genai

app = Flask(__name__)

# --- Configuration ---
# URLs for your deployed downstream services (removed detailed url address for privacy)
DETECTION_API_URL = "https://gemini-api.us.run.app/analyze"
FORMS_API_URL = "https://forms-agent.us.run.app/generate_form"
SUBMISSION_API_URL = "https://submission-agent.us.run.app/submit_report"

genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
conversation_history = {}

# --- State Schema for the Supervisor Agent ---
class SupervisorState(TypedDict):

    user_info: dict
    image_base64: str
    detection_result: Optional[dict]
    form_response: Optional[dict]
    submission_response: Optional[dict]
    progress_message: Optional[str]
    error: Optional[str]

def generate_chat_response(user_id: str, user_message: str) -> str:
    """Generates a conversational response using the Gemini model."""
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    history = conversation_history.get(user_id, [])
    # The core prompt defining the agent's persona and goal
    system_prompt = """
    You are a friendly and helpful AI assistant for United Airlines. Your role is to assist users in reporting airline-related problems.
    Engage in a natural conversation to understand their issue.
    Your primary goal is to determine if the user is reporting a physical issue (like damage, a broken seat, a mess, etc.).
    If they are describing a physical issue, your final response must be to gently ask for a picture.
    For example, say: "I understand. To properly document this, it would be very helpful if you could share a picture of the issue."
    Keep your responses concise and empathetic.
    """

    prompt_with_history = f"{system_prompt}\n\n--- Conversation History ---\n"
    for entry in history:
        prompt_with_history += f"{entry['role']}: {entry['content']}\n"
    prompt_with_history += f"user: {user_message}\n"
    prompt_with_history += "model: " # Prompt the model to generate the next part

    try:
        response = model.generate_content(prompt_with_history)
        ai_response = response.text

        history.append({"role": "user", "content": user_message})
        history.append({"role": "model", "content": ai_response})
        conversation_history[user_id] = history

        return ai_response
    except Exception as e:
        return f"Sorry, I encountered an error: {str(e)}"


# --- NEW: Flask Endpoint for Conversation ---
@app.route("/chat", methods=["POST"])
def chat_handler():
    """Handles the conversational chat with the user."""
    data = request.get_json()
    if not data or "user_id" not in data or "message" not in data:
        return jsonify({"error": "Request must be JSON with 'user_id' and 'message' fields"}), 400

    user_id = data["user_id"]
    user_message = data["message"]

    ai_reply = generate_chat_response(user_id, user_message)

    return jsonify({"reply": ai_reply})

# --- Graph Node Functions ---
def detect_damage(state: SupervisorState) -> SupervisorState:
    """Node 1: Calls the external damage detection API."""
    state["progress_message"] = "Step 1/3: Analyzing image for damage..."
    print(f"---SUPERVISOR: {state['progress_message']}---")
    try:
        image_bytes = base64.b64decode(state["image_base64"])
        image_file = io.BytesIO(image_bytes)
        response = requests.post(DETECTION_API_URL, files={"image": ("image.jpg", image_file, "image/jpeg")})
        response.raise_for_status()
        state["detection_result"] = response.json()
        popped_value = state.pop('image_base64')
        print(state.keys())
    except Exception as e:
        state["error"] = f"Detection Agent failed: {str(e)}"
    return state

def generate_form(state: SupervisorState) -> SupervisorState:
    """Node 2: Calls the external Forms Agent API."""
    state["progress_message"] = "Step 2/3: Generating maintenance form..."
    print(f"---SUPERVISOR: {state['progress_message']}---")
    try:
        payload = state["detection_result"] # Pass the entire detection result
        response = requests.post(FORMS_API_URL, json=payload)
        response.raise_for_status()
        state["form_response"] = response.json()
        state.pop('image_base64')
    except Exception as e:
        state["error"] = f"Forms Agent failed: {str(e)}"
    return state
    
def submit_report(state: SupervisorState) -> SupervisorState:
    """Node 3: Calls the final Submission Agent API."""
    state["progress_message"] = "Step 3/3: Submitting final report to database..."
    print(f"---SUPERVISOR: {state['progress_message']}---")
    try:
        form_string = state["form_response"]
        response = requests.post(SUBMISSION_API_URL, json=form_string)
        response.raise_for_status()
        state["submission_response"] = response.json()
        state["progress_message"] = "Done. Report submitted successfully."
        state.pop('image_base64')
    except json.JSONDecodeError:
        state["error"] = "Forms agent returned invalid JSON."
    except Exception as e:
        state["error"] = f"Submission Agent failed: {str(e)}"
    return state

# --- Conditional Logic for the Graph ---
def should_proceed(state: SupervisorState) -> str:
    """Determines if the workflow should continue after damage detection."""
    print("---SUPERVISOR: Making a decision...---")
    if state.get("error"):
        return "end_workflow"
    if state.get("detection_result", {}).get("priority") != "None":
        return "continue_to_form"
    else:
        state["progress_message"] = "Done. No damage detected."
        return "end_workflow"

# --- Build the LangGraph Workflow ---
workflow = StateGraph(SupervisorState)
workflow.add_node("detect_damage_node", detect_damage)
workflow.add_node("generate_form_node", generate_form)
workflow.add_node("submit_report_node", submit_report)

workflow.set_entry_point("detect_damage_node")
workflow.add_conditional_edges("detect_damage_node", should_proceed, {
    "continue_to_form": "generate_form_node",
    "end_workflow": END
})
workflow.add_edge("generate_form_node", "submit_report_node")
workflow.add_edge("submit_report_node", END)

supervisor_graph = workflow.compile()

# --- Flask Endpoint with Streaming ---
@app.route("/supervisor", methods=["POST"])
def supervisor_endpoint():
    """Handles a single POST request and returns final structured output once."""
    try:
        if "image" not in request.files or "user" not in request.form:
            return jsonify({"error": "Request must be multipart/form-data with 'image' and 'user' fields"}), 400

        image_bytes = request.files["image"].read()
        initial_state = {
            "image_base64": base64.b64encode(image_bytes).decode('utf-8'),
            "user_info": json.loads(request.form["user"])
        }

        final_state = supervisor_graph.invoke(initial_state)
        final_state.pop("image_base64", None)
        final_state.pop("progress_message", None)

        return jsonify(final_state)

    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

# --- Start the Supervisor Flask App ---
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8085))
    app.run(host="0.0.0.0", port=port, debug=True)
