# Autonomous Ecosystem Architect - PRD

## Original Problem Statement
We are currently losing biodiversity at an alarming rate. This system uses swarms of ASI-controlled drones and sensors to "re-wild" the planet, managing predator-prey balances and soil health with the precision of a master gardener on a global scale.

## Architecture
- **Frontend**: React 18 + Craco + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: FastAPI + MongoDB + Motor (async)
- **AI Integration**: Local `emergentintegrations` compatibility layer with OpenAI/Anthropic support when real API keys are configured, deterministic offline fallback otherwise

## User Personas
1. **Ecosystem Manager** - Monitors global rewilding efforts, deploys drone missions
2. **Conservation Scientist** - Analyzes biodiversity trends, soil health metrics
3. **Field Operator** - Manages drone fleet, sensor networks

## Core Requirements (Static)
- Real-time drone fleet monitoring dashboard
- Ecosystem health metrics (biodiversity, soil, predator-prey balance)
- AI-powered rewilding recommendations
- Zone management for ecosystem areas
- Sensor network tracking
- Alert notification system

## What's Been Implemented (Apr 27, 2026)

### Backend APIs
- Drone CRUD operations + deployment missions
- Zone CRUD operations + metrics updates
- Sensor management
- Alert system
- Dashboard statistics + trends
- Authentication, refresh tokens, and role-based access control
- AI analysis with provider-configurable LLM integration and offline fallback
- **AI Patrol Scheduling with optimized routes**
- **WebSocket real-time updates for drone positions**
- **Patrol completion reports with biodiversity data**
- Weather, forecasting, geofencing, intervention rules, team tasks/comments, public dashboard, notifications, report exports, and species identification history/statistics
- **Species identification from image URLs and uploaded image files**

### Frontend Features
- Dashboard with stats cards, health trends chart, alerts panel
- Drone Fleet page with grid view, status management, deployment dialogs
- Zone Management with metrics visualization, edit capabilities
- Analytics page with trends, zone comparison, sensor data tabs
- AI Insights page with analysis configuration and history
- Login/register flows with protected routes and role gates
- Camera feeds, species identification, weather, forecasting, geofencing, interventions, team collaboration, reports, notifications, and public dashboard pages
- **Patrol Routes page with AI-optimized scheduling**
  - Generate patrols with priority-based waypoints
  - View AI reasoning and route details
  - Start/Pause/Complete patrol controls
  - Patrol Reports with biodiversity observations
- **Interactive Leaflet Map**
  - Live drone positions with real-time updates
  - Zone circles with priority-based coloring
  - Patrol route polylines
  - Legend and stats overlay
  - Filter tabs (All/Drones/Zones/Patrols)

### Design Implementation
- Earthy organic theme (warm sand background, moss green primary)
- Control room grid layout with technical aesthetic
- Outfit + DM Sans fonts
- Shadcn UI components

## Prioritized Backlog

### P0 (Critical)
- ✅ Core dashboard with ecosystem metrics
- ✅ Drone fleet management
- ✅ AI recommendations engine
- ✅ User authentication and role-based access
- ✅ Automated patrol scheduling with AI-optimized routes
- ✅ Interactive map visualization for patrol routes
- ✅ Real-time WebSocket updates for drone positions
- ✅ Patrol completion reports with biodiversity data
- ✅ Species identification via image URL and image upload

### P1 (High)
- Real-time drone camera feeds backed by real stream metadata and offline/online status
- Email/push notifications for critical alerts
- Evidence-backed AI recommendations with input snapshots, model/provider metadata, and accepted/ignored/actioned status
- Stronger frontend loading/error/empty states across feature pages

### P2 (Medium)
- Historical data export polish for CSV/PDF report workflows
- Custom alert threshold configuration
- Mongo indexes and structured backend logging
- `.env.example` files and seed/reset developer scripts

### P3 (Low)
- Dark mode theme
- Mobile app companion
- Integration with satellite imagery APIs
- Machine learning for predictive analytics

## Next Tasks
1. Add real stream metadata and health states to drone camera feeds.
2. Implement email notifications for critical alerts using SendGrid or a local adapter.
3. Add AI recommendation evidence tracking: input snapshot, provider/model, rationale, and action status.
4. Polish historical CSV/PDF exports for operational reporting.
