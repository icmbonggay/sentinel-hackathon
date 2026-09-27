FROM python:3.11-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY target_app/requirements.txt target_app/requirements.txt
COPY sentinel/requirements.txt sentinel/requirements.txt
RUN pip install --no-cache-dir \
    -r target_app/requirements.txt \
    -r sentinel/requirements.txt

# Copy the full codebase
COPY . .

# Default command — overridden per service in Railway via the start command setting
CMD ["uvicorn", "sentinel.main:app", "--host", "0.0.0.0", "--port", "8000"]
