# CrisisAI

**AI-Powered Disaster Response & Resource Optimization Platform**

CrisisAI turns unstructured emergency reports into prioritized, actionable, location-aware response plans — helping citizens, volunteers, and authorities coordinate faster when it matters most.

Report → Understand → Prioritize → Deduplicate → Find Resources → Recommend Action → Coordinate in Real Time

---

## Table of Contents
- [Overview](#overview)
- [Live Demo](#live-demo)
- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [User Roles](#user-roles)
- [How the Priority Engine Works](#how-the-priority-engine-works)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Scope & Limitations](#scope--limitations)
- [Acknowledgments](#acknowledgments)
- [License](#license)

---

## Overview
During a disaster, reports pour in from many people at once — duplicated, unstructured, and impossible to triage by hand fast enough. **CrisisAI** gives responders a single operational view: it uses an LLM to convert raw citizen reports into structured incidents, calculates an explainable priority score, flags likely duplicates, ranks nearby resources, and recommends next actions — all visible on a live map and a real-time command dashboard.

This is a full-stack solo build (30-day sprint) demonstrating end-to-end product thinking: AI integration with validation, algorithmic decision support, geospatial computing, real-time systems, and role-based access control.

## Live Demo
- **App**: your-deployment-url.vercel.app
- **API**: your-api-url.onrender.com
- **Demo video**: link to walkthrough

*(Seed/demo credentials for each role are listed at the bottom of the login page.)*

## Core Features

| # | Feature | What it does |
|---|---|---|
| 1 | **Emergency Reporting** | Citizens submit structured or natural-language reports with location, urgency, and needs. |
| 2 | **AI Emergency Intelligence** | An LLM extracts category, severity, affected count, required resources, urgency, and confidence from free text. |
| 3 | **Dynamic Priority Engine** | A transparent, weighted score ranks incidents — every factor behind the number is visible. |
| 4 | **Duplicate Detection** | Text similarity + geographic proximity + time window flags likely duplicate reports for human review. |
| 5 | **Smart Resource Allocation** | Ranks nearby resources/responders by type, availability, distance, priority, and urgency. |
| 6 | **Live Crisis Map** | Leaflet map showing incidents, shelters, resources, and responders with priority/availability states. |
| 7 | **Real-Time Command Center** | Socket.IO pushes incident, assignment, and status updates instantly — no refresh needed. |
| 8 | **Role-Based Access** | Citizen, Volunteer/Responder, Authority, and Admin each get a tailored dashboard and permission set. |
| 9 | **Emergency Alerts** | Critical incidents automatically notify relevant users in-app. |
| 10 | **Analytics Dashboard** | Live metrics on incident volume, severity distribution, resource demand, and response times. |
| 11 | **AI Situation Summary** | A concise, AI-generated operational briefing across all active incidents. |
| 12 | **Recommended Actions** | Ranked next-step suggestions with the reasoning behind each one — never a black box. |
| 13 | **Trust & Confidence Signals** | AI/report confidence feeds into review and prioritization; AI is a decision-support signal, never treated as ground truth. |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| State / Auth | React Context |
| HTTP | Axios |
| Maps | Leaflet + OpenStreetMap |
| Backend | Node.js + Express |
| Real-time | Socket.IO |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |
| Validation | Zod |
| AI | Gemini API |
| Algorithms | Custom JS modules (priority scoring, similarity, distance, ranking) |
| Geospatial | MongoDB geospatial queries + Haversine |
| Testing | Jest / Vitest + Supertest |
| Deployment | Vercel (frontend) + Render (backend) |

## Architecture

```text
Browser (React UI)
│   REST API + Socket.IO
▼
Express Routes / Controllers / Services
│
├──▶ MongoDB (users, incidents, resources, assignments, alerts, orgs)
├──▶ AI Service (Gemini) — extraction, validation, summarization
└──▶ Algorithm Modules — priority scoring, duplicate detection, resource ranking, geospatial search
│
▼
Real-time events (Socket.IO) ──▶ Live dashboards & map
```

**Frontend responsibilities:** pages, forms, maps, dashboards, API calls, auth UI, real-time listeners. 
**Backend responsibilities:** validation, authorization, database access, AI orchestration, priority calculation, duplicate detection, geospatial queries, resource ranking, alerts, Socket.IO events. 
**Database responsibilities:** persistent storage for users, incidents, resources, assignments, alerts, organizations, and status history.

## User Roles

| Role | Capabilities |
|---|---|
| **Citizen** | Report emergencies, request help, view nearby shelters/resources, track own reports. |
| **Volunteer / Responder** | View assignments, accept tasks, update status, optionally share live location. |
| **Authority** | Verify incidents, prioritize, assign resources/responders, resolve incidents, monitor the live map. |
| **Admin** | Manage users/organizations, oversee system configuration and analytics. |

## How the Priority Engine Works

```
Priority = weighted( severity, affected population, vulnerability, 
                     resource shortage, time sensitivity, 
                     confidence, location/context )
```
Every score is decomposed into its contributing factors and shown alongside the number — this is decision *support*, not an automated dispatch decision. Weights are documented in `server/algorithms/priorityScore.js` and covered by unit tests against representative disaster scenarios.

## Getting Started

### Prerequisites
- Node.js ≥ 18
- MongoDB (local or Atlas)
- A Gemini API key

### Installation

```bash
# Clone the repo
git clone https://github.com/<your-username>/crisisai.git
cd crisisai

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Running locally

```bash
# From /server
npm run dev      # starts Express + Socket.IO on http://localhost:5000

# From /client (separate terminal)
npm run dev      # starts Vite dev server on http://localhost:5173
```

### Running tests

```bash
# From /server
npm test         # Jest/Vitest unit + Supertest API tests
```

## Environment Variables
Create a `.env` file in `/server` (see `.env.example`):
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GEMINI_API_KEY=your_gemini_api_key
CLIENT_URL=http://localhost:5173
```

## API Reference

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| **Incidents** | `POST /api/incidents`, `GET /api/incidents`, `GET /api/incidents/:id`, `PATCH /api/incidents/:id`, `POST /api/incidents/:id/verify`, `POST /api/incidents/:id/resolve` |
| **Resources** | `POST /api/resources`, `GET /api/resources`, `PATCH /api/resources/:id`, `POST /api/resources/:id/assign` |
| **AI** | `POST /api/ai/analyze`, `POST /api/ai/summary`, `POST /api/ai/detect-duplicate` |
| **Analytics** | `GET /api/analytics/summary`, `GET /api/analytics/metrics` |
| **Alerts** | `GET /api/alerts`, `PATCH /api/alerts/:id/read` |

Full request/response schemas are documented in `/docs/api.md`.

## Testing
- **Unit tests:** priority scoring, resource ranking, duplicate-detection logic.
- **API tests (Supertest):** auth flows, role-based permission checks, CRUD endpoints.
- **Integration test:** full pipeline — report → AI extraction → validation → priority → duplicate check → dashboard.
- **Resilience tests:** malformed AI responses, AI service timeouts, Socket.IO event delivery.

```bash
npm test                 # run full suite
npm run test:coverage    # coverage report
```

## Project Structure

```text
crisisai/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── context/
│   │   └── api/
├── server/                 # Node + Express backend
│   ├── routes/
│   ├── controllers/
│   ├── services/           # AI service, socket service
│   ├── algorithms/         # priorityScore.js, duplicateDetection.js, resourceRanking.js
│   ├── models/             # User, Incident, Resource, Assignment, Alert, Organization
│   └── tests/
├── docs/
│   ├── architecture.png
│   └── api.md
└── README.md
```

## Roadmap
Built as a 30-day sprint — see the detailed day-by-day build log for the full sequencing (AI pipeline de-risked early via a vertical slice by Day 12; roles, real-time, and analytics layered in afterward).

**Future enhancements:** 
- Weather API and satellite/remote-sensing data integration 
- Computer vision for uploaded incident images 
- Predictive risk/hotspot modeling 
- SMS/email alert channels 
- Multilingual reporting 
- Native mobile app 
- Advanced optimization / vehicle routing for responders 
- Offline-first field mode

## Scope & Limitations
CrisisAI is a **portfolio/prototype coordination system**. It does not autonomously dispatch real emergency services, make medical diagnoses, or replace trained emergency authorities. All AI-generated priorities and recommendations are decision-support signals — critical decisions require human review.

## Acknowledgments
Architectural patterns referenced from CrisisGrid as inspiration; all code, algorithms, and implementation decisions in this repository are original.

## License
This project is licensed under the MIT License — see LICENSE for details.

---

**Built by [Your Name]** — Portfolio · LinkedIn · GitHub
