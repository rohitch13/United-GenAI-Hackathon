# Use official Python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy requirements and app files
COPY main.py .
COPY manual_loader.py .
COPY prompt_utils.py .
COPY config.json .
COPY credentials/ ./credentials/sky12-462619-6b005e8a41c0.json
COPY requirements.txt .


# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port (Cloud Run expects 8080)
EXPOSE 8080

# Run the app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
