FROM python:3.11-slim

WORKDIR /app

# Copy backend files
COPY deepfake_model_ela_rf.py .
COPY requirements.txt .
COPY feature_model_output /app/feature_model_output

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 8080

# Run the application
CMD exec uvicorn deepfake_model_ela_rf:app --host 0.0.0.0 --port ${PORT:-8080}
