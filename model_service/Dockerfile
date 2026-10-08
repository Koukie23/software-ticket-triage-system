FROM python:3.11-slim

WORKDIR /app
COPY model_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r /tmp/requirements.txt

COPY shared /app/shared
COPY training/issue_ml /app/training/issue_ml
COPY model_service /app/model_service

WORKDIR /app/model_service
ENV PYTHONPATH=/app/training
ENV MODEL_DIR=/models
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
