# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /app

# Copy the dependencies file to the working directory
COPY ingestion/api-python/requirements.txt .

# Install any needed dependencies specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the API code
COPY ingestion/api-python/main.py .

# Copy the parser, detection, and correlation modules (needed for imports)
COPY parser ./parser
COPY detection-engine ./detection-engine
COPY correlation-engine ./correlation-engine

# Specify the command to run on container startup
# Use 0.0.0.0 to make it accessible from outside the container
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
