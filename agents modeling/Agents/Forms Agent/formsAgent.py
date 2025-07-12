import os
import requests
from flask import Flask, request, jsonify
from dotenv import load_dotenv
from jinja2 import Template
import google.generativeai as genai
import datetime

# --- Initialize Flask App and Load Environment Variables ---
app = Flask(__name__)
load_dotenv()

try:
    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
except KeyError:
    print("FATAL ERROR: GEMINI_API_KEY environment variable not set.")


def retrieve_from_mcp(text: str) -> str:
    """
    Generates a query from text and retrieves data from the MCP system.
    (This function assumes your prompt files are in a './Prompts' directory)
    """
    print(f"---FORMS AGENT: Retrieving MCP context for: '{text[:50]}...'---")


    filled_prompt = f"""
    Context: You are assisting a flight attendant in assessing damage in an aircraft cabin. You are given 
        a description of an issue. 

        {text}

        Instructions: Given this description, return a brief query that can be used on a vector database
        to retrieve relevant information. The query should look like something someone would put into a google search.
        Please do not include any formalities or greetings

        Example : "How to check if seats are okay"
    
    """

    model = genai.GenerativeModel('gemini-2.5-flash')
    query_response = model.generate_content(filled_prompt)

    payload = {"query": query_response.text}
    headers = {"Content-Type": "application/json"}
    mcp_url = "https://airline-mcp-app.us-central1.run.app/query" # removed detail

    if not mcp_url:
        raise ValueError("MCP_URL environment variable is not set.")

    mcp_response = requests.post(mcp_url, json=payload, headers=headers)
    mcp_response.raise_for_status()  # Will raise an error for bad responses
    return mcp_response.json()["response"]

def generate_form(mcp_data: str) -> str:
    """
    Generates a structured form from the MCP context data.
    """
    print(f"---FORMS AGENT: Generating form from MCP data...---")
    todays_date = datetime.datetime.now()
    filled_prompt = f"""
        Context: You are a helpful assistant to a flight attendant. You are receiving data with relevant
        information on what to do with a broken seat as well as which form to use.

        {mcp_data}

        Instructions: Given the context above, please fill out the blank spaces
        in the following JSON structure.

        - Do not make up information. If a value is not available in the provided text, use the value "N/A".
        - For "date", use today's date {todays_date}.

        {{
            "form_id": "_____",
            "date": "_____",
            "aircraft_id": "_____",
            "inspection_zone": "_____",
            "issue_type": "_____",
            "issue_description": "_____",
            "severity": "_____",
            "action_taken": "_____",
            "department_contacted": "_____",
            "status": "open"
        }}

        Do not include ```json``` in your response.
    """
    
    model = genai.GenerativeModel('gemini-2.5-flash')
    form_response = model.generate_content(filled_prompt)

    return form_response.text

@app.route("/generate_form", methods=["POST"])
def generate_form_endpoint():
    """
    The main API endpoint for the forms agent.
    Expects a JSON payload with 'item', 'description', and 'priority'.
    """
    try:
        data = request.get_json()
        if not data or not all(key in data for key in ["item", "description", "priority"]):
            return jsonify({"error": "Missing required fields: 'item', 'description', and 'priority'."}), 400

        damage_details_text = f"Item: {data['item']}. Priority: {data['priority']}. Description: {data['description']}"

        mcp_context = retrieve_from_mcp(damage_details_text)

        generated_form_text = generate_form(mcp_context)

        return jsonify({"generated_form": generated_form_text})

    except ValueError as ve:
        # Handle configuration errors
        return jsonify({"error": f"Configuration error: {str(ve)}"}), 500
    except requests.exceptions.RequestException as re:
        # Handle network errors when calling MCP
        return jsonify({"error": f"MCP API request failed: {str(re)}"}), 502
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

# --- Start Flask App ---
if __name__ == "__main__":
    # Run the app on the requested port 8086
    port = int(os.environ.get("PORT", 9001))
    app.run(host="0.0.0.0", port=port, debug=True)
