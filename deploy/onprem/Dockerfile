# DocuAX On-premise 단일 도커 — 폐쇄망 배포용.
# 외부 통신 0건. 모델·서빙·UI 모두 컨테이너 내부.
#
# 빌드:
#   docker build -f deploy/onprem/Dockerfile -t docuax:onprem .
# 실행 (vLLM 별도 컨테이너 또는 호스트):
#   docker run -p 8000:8000 -p 3000:3000 \
#     -e TENOS_BASE_URL=http://host.docker.internal:8001/v1 \
#     -e ON_PREMISE=true \
#     -v $PWD/data:/data docuax:onprem

FROM node:20-alpine AS frontend-builder
WORKDIR /front
COPY apps/frontend/package.json ./
RUN npm install --legacy-peer-deps
COPY apps/frontend/. ./
RUN npm run build

FROM python:3.11-slim AS final

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core libreoffice-writer \
    fonts-nanum fonts-noto-cjk \
    libpango-1.0-0 libpangoft2-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi-dev build-essential \
    nodejs npm supervisor curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 백엔드 — pyproject.toml 기반으로 설치 (의존성 단일 출처)
COPY apps/backend/pyproject.toml /app/backend/pyproject.toml
COPY apps/backend/README.md /app/backend/README.md
WORKDIR /app/backend
RUN pip install --no-cache-dir .
WORKDIR /app

COPY apps/backend/app /app/backend/app
COPY apps/backend/.env.example /app/backend/.env.example

# 프론트엔드 빌드 결과 복사
COPY --from=frontend-builder /front/.next /app/frontend/.next
COPY --from=frontend-builder /front/public /app/frontend/public
COPY --from=frontend-builder /front/package.json /app/frontend/package.json
COPY --from=frontend-builder /front/node_modules /app/frontend/node_modules

# Supervisor — 백·프 동시 기동
COPY deploy/onprem/supervisord.conf /etc/supervisord.conf

# On-premise 기본값
ENV ON_PREMISE=true \
    LLM_PROVIDER=tenos \
    EMBEDDING_PROVIDER=local \
    DATABASE_URL=sqlite+aiosqlite:////data/docuax.db \
    CHROMA_PERSIST_DIR=/data/chroma \
    STORAGE_LOCAL_DIR=/data/documents \
    NEXT_PUBLIC_API_BASE=http://localhost:8000

VOLUME /data
EXPOSE 8000 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
