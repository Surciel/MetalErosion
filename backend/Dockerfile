# Build with ./backend as the context. PyTorch exists only in the export stage.
FROM python:3.12-slim-bookworm AS system-libraries
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

FROM system-libraries AS exporter
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 \
    YOLO_CONFIG_DIR=/tmp/Ultralytics
WORKDIR /build
COPY requirements.txt ./requirements.txt
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install -r requirements.txt onnx onnxruntime onnxscript \
    && pip check
COPY image_quality.py memory_limits.py onnx_inference.py predictive_engine.py ./
COPY models/best.pt models/metal_cls.pt ./models/
COPY tools/verify_memory_optimizations.py tools/verify_memory_limits.py tools/verify_onnx_postprocessing.py tools/export_onnx_models.py ./tools/
# Keep the prior numerical checks, then compare exports to both original models.
RUN PYTHONPATH=/build python tools/verify_memory_optimizations.py \
    && PYTHONPATH=/build python tools/verify_memory_limits.py \
    && PYTHONPATH=/build python tools/verify_onnx_postprocessing.py \
    && PYTHONPATH=/build python tools/export_onnx_models.py

FROM python:3.12-slim-bookworm AS runtime-dependencies
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements-runtime.txt ./requirements-runtime.txt
RUN pip install -r requirements-runtime.txt && pip check

FROM system-libraries AS runtime
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000 \
    INFERENCE_BACKEND=onnx \
    MODEL_IMAGE_SIZE=512 \
    INFERENCE_MAX_SIDE=512 \
    MAX_IMAGE_PIXELS=4194304 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2 \
    MALLOC_TRIM_THRESHOLD_=131072 \
    ONEDNN_PRIMITIVE_CACHE_CAPACITY=0
RUN groupadd --system app \
    && useradd --system --gid app --create-home app
WORKDIR /app
COPY --from=runtime-dependencies /opt/venv /opt/venv
COPY --chown=app:app main.py image_quality.py memory_limits.py onnx_inference.py predictive_engine.py rust_measurement.py spread_analysis.py ./
COPY --from=exporter --chown=app:app /build/models/best.onnx /build/models/metal_cls.onnx ./models/
USER app
# Guard against accidentally restoring the heavy inference stack in this image.
RUN python -c "import importlib.util; import cv2, onnxruntime; assert all(importlib.util.find_spec(p) is None for p in ('torch', 'torchvision', 'ultralytics')), 'Export-only packages leaked into runtime'"
COPY --chown=app:app tools/verify_inference_memory.py /tmp/verify_inference_memory.py
# Keep the same 480 MiB release budget; never hide an incompatible Free build.
RUN PYTHONPATH=/app python /tmp/verify_inference_memory.py
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --timeout-graceful-shutdown 25"]
