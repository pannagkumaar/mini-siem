FROM python:3.11-slim

WORKDIR /app

# Copy requirements
COPY scripts/requirements.txt ./requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy correlation engine code
COPY correlation-engine/ ./correlation-engine/

WORKDIR /app/correlation-engine

CMD ["python", "correlator.py"]
