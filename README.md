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
| Backend | Java 25, Spring Boot, Spring Web |
| Persistence | Spring Data JPA, Hibernate |
| Security | Spring Security |
| Database | PostgreSQL, PostGIS |
| Geospatial Processing | JTS, GeoTools |
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
├── frontend/       # React + TypeScript application
├── backend/        # Java + Spring Boot application
├── docs/           # Project documentation and diagrams
├── screenshots/    # Application screenshots
├── .env.example    # Example environment configuration
├── .gitignore
├── LICENSE
└── README.md
```

This is the intended structure; directories will be added as development progresses.

## Getting Started

### Prerequisites

Install the following tools before running the project:

- Java JDK 25
- Maven
- Node.js (LTS) and npm
- PostgreSQL with PostGIS
- Git

### Clone the Repository

```bash
git clone https://github.com/VJ-veshwikjain2215/GeoNexus.git
cd GeoNexus
```

### Backend

Once the Spring Boot application is available in `backend/`:

```bash
cd backend
mvn spring-boot:run
```

### Frontend

Once the React application is available in `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

> The run commands and configuration will be finalized alongside the application. Database connection settings should be supplied through local environment configuration. Do not commit credentials or secrets.

## Configuration

Use an `.env.example` file to document required configuration keys without including real credentials. Keep local secrets in an untracked environment file or another secure configuration mechanism appropriate to each application.

## Development Status

**Status:** Planning / early development.

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
