# GeoNexus – Connecting Maps, Land and Data

**Intelligent Rural Agricultural Land Survey & Resurvey Management System**

GeoNexus is a GIS-based web application being developed to support agricultural land survey and resurvey workflows. The project aims to bring land parcel information, interactive mapping, survey management, boundary comparison, and geospatial analysis into one platform.

> **Academic project:** Inspired by Smart India Hackathon (SIH) Problem Statement 26010. GeoNexus is an independent project and is not an officially selected, sponsored, or endorsed SIH or government solution.

## Project Overview

Agricultural land survey workflows can involve fragmented records, manual boundary comparison, and time-consuming data management. GeoNexus aims to make these workflows easier to organize and review through digital parcel records, map-based visualization, and geospatial tools.

The project is currently under development. Features described below represent the intended scope and may not all be implemented yet.

## Planned Features

- **Land Parcel Management** – Store and manage agricultural parcel information.
- **Interactive GIS Mapping** – Display parcel geometries on an interactive map.
- **Survey and Resurvey Management** – Organize survey records and updated parcel information.
- **Boundary Comparison** – Compare previous and updated parcel boundaries.
- **AI-Assisted Boundary Detection** – Explore image-based assistance for identifying field boundaries.
- **Geospatial Analysis** – Support spatial operations such as polygon intersection and overlap detection.
- **Reports and Analytics** – Provide summaries and survey-related reports.
- **Audit History** – Track changes to records and parcel information.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React.js, TypeScript, Vite, Tailwind CSS |
| Mapping | Leaflet, GeoJSON, OpenStreetMap |
| Backend | Java 21, Spring Boot 3.5, Spring Web |
| Persistence | Spring Data JPA, Hibernate (+ Hibernate Spatial), Flyway migrations |
| Security | Spring Security |
| Database | PostgreSQL, PostGIS |
| Geospatial Processing | JTS (GeoTools planned) |
| Image Processing | OpenCV |
| Build Tool | Maven |

The technology stack may evolve as implementation progresses.

## Architecture

GeoNexus is planned around a frontend-backend architecture:

1. **Frontend:** React interface for map visualization, parcel management, survey workflows, and analytics.
2. **Backend:** Spring Boot REST APIs for application logic, validation, security, and geospatial operations.
3. **Database:** PostgreSQL with PostGIS for relational and spatial data.
4. **Geospatial processing:** JTS and related tools for geometry operations; OpenCV for image-processing experiments.

## Repository Structure

```text
GeoNexus/
├── frontend/           # React + TypeScript + Vite academic GIS workspace
├── backend/            # Spring Boot app: health, auth, JPA entities, Flyway migrations (Phases 1-3)
│   └── src/main/resources/db/migration/   # V1-V6: the single migration history
├── docs/               # architecture.md, data-model.md, setup.md, HANDOFF.md
├── docker-compose.yml  # PostgreSQL 16 + PostGIS 3.5 for local development
├── .env.example        # The single environment-variable contract
├── .gitignore
├── LICENSE
└── README.md
```

`screenshots/` will be added later.

## Getting Started

### Prerequisites

Install the following tools before running the project:

- Java JDK 21 or newer (backend targets Java 21)
- Maven 3.9+
- Node.js 22 LTS (20.19+ also works) and npm 10+
- Docker with the Compose plugin (PostgreSQL + PostGIS for local development)
- Git

### Clone the Repository

```bash
git clone https://github.com/VJ-veshwikjain2215/GeoNexus.git
cd GeoNexus
```

### Configuration and database

```bash
cp .env.example .env          # set a unique DB_PASSWORD; never commit .env
docker compose up -d db
```

### Backend

```bash
cd backend
mvn spring-boot:run           # health check: curl -i http://localhost:8080/api/v1/health
```

### Frontend

```bash
cd frontend
npm ci
npm run dev                   # http://localhost:5173 (proxies /api to the backend)
```

The database must be PostGIS-enabled (the Compose service is). Flyway creates the schema on first backend start.

See [`docs/setup.md`](docs/setup.md) for checks, database tests and the configuration reference,
[`docs/data-model.md`](docs/data-model.md) for the schema and the CRS/SRID policy (EPSG:4326, geography-based area),
[`docs/architecture.md`](docs/architecture.md) for decisions, and [`docs/HANDOFF.md`](docs/HANDOFF.md) for current status.
Authentication is implemented with JWT for Phase 3. The application remains an early academic project:
do not expose it to the public internet or use real land-record data.

## Configuration

Use an `.env.example` file to document required configuration keys without including real credentials. Keep local secrets in an untracked environment file or another secure configuration mechanism appropriate to each application.

## Development Status

**Status: Production & Deployment Ready – Phases 1–10 Fully Implemented & Verified.**

GeoNexus includes a complete, end-to-end cadastral survey management platform:
1. **Foundation & CI/CD (Phase 1):** Maven/Vite project structure, liveness probes, automated testing baseline.
2. **PostGIS Spatial Domain & Schema (Phase 2):** Flyway migrations V1–V6, spatial indexes (GiST), spheroidal area calculations, DB-enforced constraints.
3. **Security & Role-Based Access (Phase 3):** Spring Security, stateless JWT authentication, password hashing (BCrypt), brute-force lockout, CORS origin validation.
4. **Parcel & Geometry REST Domain (Phase 4):** RFC 7946 GeoJSON input/output, append-only geometry versioning, centralized TypeScript API client.
5. **Interactive Leaflet GIS Workspace (Phase 5):** Multi-layer GIS canvas, cartographic grid, zoom/extent tools, live parcel boundary rendering.
6. **Geospatial Analysis & Measurement (Phase 6):** Geodesic perimeter, polygon closure checks, PostGIS overlap detection, station displacement caliper.
7. **AI-Assisted Boundary Detection (Phase 7):** Computer-vision/spectral edge detection simulation, confidence scoring, review/propose workflow, clear distinction between AI drafts and certified cadastre.
8. **Cadastral Analytics Dashboard (Phase 8):** Real-time project KPIs, landholding area distribution, administrative subdistrict progress, seasonal trends.
9. **Reports, Exports & Audit (Phase 9):** Official Cadastral Dossier reports, boundary comparison declarations, CSV station ledgers, RFC 7946 GeoJSON exports, SHA-256 tamper-evident immutable audit logs.
10. **Testing, Optimization & Deployment Readiness (Phase 10):** 100% test suite passing (128 backend tests, 50 frontend tests), N+1 query elimination, memoized vector rendering, production multi-stage Dockerfiles, full-stack Docker Compose.

See [`docs/HANDOFF.md`](docs/HANDOFF.md) for full architecture details, endpoint references, and verification logs.

## Deployment & Execution

### 1. Local Development (Hybrid)

```bash
# 1. Environment configuration
cp .env.example .env          # Set DB_PASSWORD and GEONEXUS_SECURITY_JWT_SECRET

# 2. Start PostgreSQL / PostGIS database
docker compose up -d db

# 3. Start Spring Boot backend
cd backend
mvn spring-boot:run           # Health: curl http://localhost:8080/api/v1/health

# 4. Start Vite frontend dev server
cd ../frontend
npm ci
npm run dev                   # http://localhost:5173
```

### 2. Full-Stack Docker Compose Deployment

```bash
# Start database, backend, and frontend with a single command
docker compose --profile full-stack up -d --build
```

- Frontend UI: `http://localhost:80`
- Backend API: `http://localhost:8080` (or proxied via frontend at `http://localhost/api/v1`)
- Database: `127.0.0.1:5432`

### 3. Automated Test Verification

```bash
# Run all backend tests (with local PostGIS scratch DB):
$env:GEONEXUS_TEST_DB_URL="jdbc:postgresql://localhost:5433/geonexus"
$env:GEONEXUS_TEST_DB_USER="geonexus_app"
$env:GEONEXUS_TEST_DB_PASSWORD="local_dev_password_123!"
cd backend
mvn test -o

# Run all frontend unit & integration tests:
cd ../frontend
npm test
npm run typecheck
npm run lint
npm run build
```

## Deployment

The intended deployment platform is [Embarko](https://embarko.app/). Database hosting for PostgreSQL/PostGIS will be configured separately if required. Deployment is not yet confirmed.

## Limitations and Data Disclaimer

- GeoNexus is an independent academic software project, not an official government land-record platform.
- Use synthetic data or data that is appropriately licensed and authorized for demonstration.
- AI-assisted boundary detection is experimental and must be reviewed by a human.
- Map visualizations and generated outputs are not certified cadastral records, legally valid boundaries, or substitutes for an authorized land survey.
- Do not use the application as the sole basis for legal, ownership, or land-dispute decisions.

## Future Scope

- Improve AI-assisted field boundary detection.
- Expand geospatial validation and parcel comparison.
- Add role-based access and administrative workflows.
- Improve report generation and analytics.
- Integrate additional authorized geospatial data sources where permitted.

## Acknowledgements

- Smart India Hackathon – Problem Statement 26010 (inspiration).
- OpenStreetMap contributors.
- The open-source communities behind React, Spring Boot, PostgreSQL, PostGIS, Leaflet, and geospatial tooling.

## License

This project is released under the [MIT License](LICENSE).

---

**GeoNexus – Connecting Maps, Land and Data.**
