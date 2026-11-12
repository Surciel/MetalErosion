# Build with the backend directory as the context:
# docker build -t metalerosion-api ./backend
FROM python:3.12-slim-bookworm AS dependencies

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./requirements.txt
# Install CPU wheels first so the requirements install reuses them instead of
# downloading PyPI's much larger CUDA-enabled PyTorch distribution.
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install -r requirements.txt \
    && pip check

FROM python:3.12-slim-bookworm AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    MODEL_IMAGE_SIZE=512 \
    INFERENCE_MAX_SIDE=512 \
    MAX_IMAGE_PIXELS=4194304 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2 \
    MALLOC_TRIM_THRESHOLD_=131072 \
    ONEDNN_PRIMITIVE_CACHE_CAPACITY=0 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics

# Headless OpenCV avoids loading desktop/Qt libraries. Keep the runtime
# libraries used by numerical and image-processing wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --create-home app

WORKDIR /app
COPY --from=dependencies /opt/venv /opt/venv
COPY --chown=app:app main.py image_quality.py memory_limits.py predictive_engine.py rust_measurement.py spread_analysis.py ./
COPY --chown=app:app models/best.pt models/metal_cls.pt ./models/
RUN test -s models/best.pt && test -s models/metal_cls.pt

# Use the container's compatible NumPy/OpenCV wheels to verify numerical parity.
# scikit-learn is imported only by this build-time process, never by the API.
COPY tools/verify_memory_optimizations.py /tmp/verify_memory_optimizations.py
COPY tools/verify_memory_limits.py /tmp/verify_memory_limits.py
RUN PYTHONPATH=/app python /tmp/verify_memory_optimizations.py \
    && PYTHONPATH=/app python /tmp/verify_memory_limits.py \
    && rm /tmp/verify_memory_optimizations.py /tmp/verify_memory_limits.py

USER app
# Catch missing shared libraries or an accidental CUDA build during image build,
# before deploying a service that fails as soon as it imports the ML stack.
RUN python -c "import cv2, torch, torchvision; from ultralytics import YOLO; assert torch.version.cuda is None, 'CPU-only PyTorch is required'"
# Exercise both bundled models before releasing the image. This synthetic test
# checks runtime compatibility and memory headroom, not rust-detection accuracy.
COPY --chown=app:app tools/verify_inference_memory.py /tmp/verify_inference_memory.py
RUN PYTHONPATH=/app python /tmp/verify_inference_memory.py
EXPOSE 10000

# exec forwards Render's SIGTERM to Uvicorn. One worker loads one copy of the
# models; WEB_CONCURRENCY must not silently multiply inference memory usage.
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --timeout-graceful-shutdown 25"]
