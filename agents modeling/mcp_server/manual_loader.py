from google.cloud import storage
import fitz
import json

def load_text_from_pdf(blob):
    with blob.open("rb") as f:
        pdf_bytes = f.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def load_text_from_json(blob):
    raw = blob.download_as_text(encoding="utf-8")
    obj = json.loads(raw)
    # Flatten the JSON object into readable text for LLM prompt
    return json.dumps(obj, indent=2)

def extract_text_from_pdf_bytes(pdf_bytes):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in doc)

def download_documents(bucket_name, prefix):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=prefix)

    content = {}
    for blob in blobs:
        if blob.name.endswith("/"):
            continue  # skip folders

        if blob.name.endswith(".pdf"):
            try:
                content[blob.name] = load_text_from_pdf(blob)
            except Exception as e:
                content[blob.name] = f"Error reading PDF: {e}"

        elif blob.name.endswith(".json"):
            try:
                content[blob.name] = load_text_from_json(blob)
            except Exception as e:
                content[blob.name] = f"Error reading JSON: {e}"

    return content
    
def download_manuals(bucket_name, prefix='manuals/'):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = bucket.list_blobs(prefix=prefix)

    manuals = {}
    for blob in blobs:
        if blob.name.endswith("/"):
            continue
        
        if blob.name.lower().endswith(".pdf"):
            try:
                pdf_bytes = blob.download_as_bytes()
                content = extract_text_from_pdf_bytes(pdf_bytes)
                manuals[blob.name] = content
            except Exception as e:
                print(f"[ERROR] Failed to parse PDF {blob.name}: {e}")
        else:  # assume it's a text file
            try:
                content = blob.download_as_text(encoding="utf-8")
            except UnicodeDecodeError:
                content = blob.download_as_text(encoding="latin1")
            manuals[blob.name] = content
    
    return manuals