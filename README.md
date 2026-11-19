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
├── frontend/           # React + TypeScript + Vite shell (Phase 1)
├── backend/            # Spring Boot app: health API, JPA entities, Flyway migrations (Phases 1-2)
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
No authentication exists yet: do not expose this build to a network.

## Configuration

Use an `.env.example` file to document required configuration keys without including real credentials. Keep local secrets in an untracked environment file or another secure configuration mechanism appropriate to each application.

## Development Status

**Status:** Early development – Phase 1 (foundation) and Phase 2 (data layer) integrated. Maven/Docker verification is still pending (see `docs/HANDOFF.md`). Authentication (Phase 3) and the parcel API are not implemented.

Implementation details, screenshots, API documentation, and deployment instructions will be added as the project progresses.

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

This project is intended to use the [MIT License](LICENSE). The license applies once the LICENSE file has been added to the repository.

---

**GeoNexus – Connecting Maps, Land and Data.**
