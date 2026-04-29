import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "./contexts/AuthContext";

// Layout
import Sidebar from "./components/layout/Sidebar";
import Header from "./components/layout/Header";

// Pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import DroneFleet from "./pages/DroneFleet";
import ZoneManagement from "./pages/ZoneManagement";
import Analytics from "./pages/Analytics";
import AIRecommendations from "./pages/AIRecommendations";
import PatrolScheduling from "./pages/PatrolScheduling";
import PatrolReports from "./pages/PatrolReports";
import EcosystemMap from "./pages/EcosystemMap";
import DroneCameraFeeds from "./pages/DroneCameraFeeds";
import SpeciesIdentification from "./pages/SpeciesIdentification";
import WeatherDashboard from "./pages/WeatherDashboard";
import EcosystemForecasting from "./pages/EcosystemForecasting";
import InterventionRules from "./pages/InterventionRules";
import GeofencingPage from "./pages/Geofencing";
import TeamCollaboration from "./pages/TeamCollaboration";
import Reports from "./pages/Reports";
import PublicDashboard from "./pages/PublicDashboard";
import NotificationSettings from "./pages/NotificationSettings";
import MissionControl from "./pages/MissionControl";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function DashboardLayout({ children, title }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 scrollbar-thin">
          <div className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}

function ProtectedPage({ children, title, roles }) {
  return (
    <ProtectedRoute roles={roles}>
      <DashboardLayout title={title}>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter future={routerFuture}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/public" element={<PublicDashboard />} />
          <Route path="/gaia-prime" element={<PublicDashboard />} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedPage title="Dashboard"><Dashboard /></ProtectedPage>} />
          <Route path="/drones" element={<ProtectedPage title="Drone Fleet" roles={["admin", "field_operator"]}><DroneFleet /></ProtectedPage>} />
          <Route path="/zones" element={<ProtectedPage title="Zone Management" roles={["admin", "field_operator", "scientist"]}><ZoneManagement /></ProtectedPage>} />
          <Route path="/analytics" element={<ProtectedPage title="Analytics" roles={["admin", "scientist"]}><Analytics /></ProtectedPage>} />
          <Route path="/ai" element={<ProtectedPage title="AI Recommendations" roles={["admin", "scientist"]}><AIRecommendations /></ProtectedPage>} />
          <Route path="/patrols" element={<ProtectedPage title="Patrol Scheduling" roles={["admin", "field_operator"]}><PatrolScheduling /></ProtectedPage>} />
          <Route path="/patrol-reports" element={<ProtectedPage title="Patrol Reports"><PatrolReports /></ProtectedPage>} />
          <Route path="/map" element={<ProtectedPage title="Ecosystem Map"><EcosystemMap /></ProtectedPage>} />
          <Route path="/mission-control" element={<ProtectedPage title="Mission Control" roles={["admin", "field_operator", "scientist"]}><MissionControl /></ProtectedPage>} />
          <Route path="/feeds" element={<ProtectedPage title="Camera Feeds" roles={["admin", "field_operator"]}><DroneCameraFeeds /></ProtectedPage>} />
          <Route path="/species" element={<ProtectedPage title="Species Identification" roles={["admin", "scientist"]}><SpeciesIdentification /></ProtectedPage>} />
          <Route path="/weather" element={<ProtectedPage title="Weather"><WeatherDashboard /></ProtectedPage>} />
          <Route path="/forecasting" element={<ProtectedPage title="Ecosystem Forecasting" roles={["admin", "scientist"]}><EcosystemForecasting /></ProtectedPage>} />
          <Route path="/interventions" element={<ProtectedPage title="Intervention Rules" roles={["admin", "scientist"]}><InterventionRules /></ProtectedPage>} />
          <Route path="/geofencing" element={<ProtectedPage title="Geofencing" roles={["admin", "field_operator"]}><GeofencingPage /></ProtectedPage>} />
          <Route path="/team" element={<ProtectedPage title="Team Collaboration"><TeamCollaboration /></ProtectedPage>} />
          <Route path="/reports" element={<ProtectedPage title="Reports"><Reports /></ProtectedPage>} />
          <Route path="/notifications" element={<ProtectedPage title="Notifications"><NotificationSettings /></ProtectedPage>} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
