FROM python:3.11-slim

WORKDIR /app

COPY ai-agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ai-agent/ ./

USER 1000

CMD ["python", "agent.py"]