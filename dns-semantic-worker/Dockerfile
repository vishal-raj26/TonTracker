FROM python:3.12.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY dns_semantic_worker ./dns_semantic_worker

RUN useradd --create-home --uid 10001 worker && chown -R worker:worker /app
USER worker

ENTRYPOINT ["python", "-m", "dns_semantic_worker.main"]
