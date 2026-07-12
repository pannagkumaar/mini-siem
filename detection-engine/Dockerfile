FROM python:3.11-slim

WORKDIR /app

# Copy requirements
COPY scripts/requirements.txt ./requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy detection engine code and rules
COPY detection-engine/ ./detection-engine/
COPY rules/ ./rules/

WORKDIR /app/detection-engine

CMD ["python", "engine.py"]
