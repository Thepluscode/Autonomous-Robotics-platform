import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPercent(value) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

export function getStatusColor(status) {
  const colors = {
    active: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    deployed: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    patrolling: "bg-blue-500/15 text-blue-700 border-blue-200",
    idle: "bg-gray-500/15 text-gray-600 border-gray-200",
    charging: "bg-amber-500/15 text-amber-700 border-amber-200",
    completed: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
    pending: "bg-amber-500/15 text-amber-700 border-amber-200",
    critical: "bg-red-500/15 text-red-700 border-red-200",
    high: "bg-orange-500/15 text-orange-700 border-orange-200",
    medium: "bg-blue-500/15 text-blue-700 border-blue-200",
    low: "bg-gray-500/15 text-gray-600 border-gray-200",
    info: "bg-blue-500/15 text-blue-700 border-blue-200",
    warning: "bg-amber-500/15 text-amber-700 border-amber-200",
    error: "bg-red-500/15 text-red-700 border-red-200",
  };
  return colors[status] || colors.idle;
}

export function getPriorityColor(priority) {
  const colors = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#3b82f6",
    low: "#6b7280",
  };
  return colors[priority] || colors.medium;
}
