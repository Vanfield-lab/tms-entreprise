// src/layouts/AdminLayout.tsx
import AppShell from "../app/AppShell";
import ReportsDashboard from "@/modules/reports/pages/ReportsDashboard";
import AuditLogs from "../modules/reports/pages/AuditLogs";
import BookingsTable from "@/modules/bookings/pages/BookingsTable";
import VehicleManagement from "@/modules/vehicles/pages/VehicleManagement";
import DriverManagement from "@/modules/drivers/pages/DriverManagement";
import DivisionManagement from "@/modules/divisions/pages/DivisionManagement";
import MaintenanceHistory from "@/modules/maintenance/pages/MaintenanceHistory";
import AdminUserManagement from "@/modules/users/pages/AdminUserManagement";

export default function AdminLayout() {
  return (
    <AppShell
      title="Admin"
      navItems={[
        { label: "Reports", element: <ReportsDashboard /> },
        { label: "All Bookings", element: <BookingsTable /> },
        { label: "Users", element: <AdminUserManagement /> },
        { label: "Maintenance History", element: <MaintenanceHistory /> },
        { label: "Vehicles", element: <VehicleManagement /> },
        { label: "Drivers", element: <DriverManagement /> },
        { label: "Divisions & Units", element: <DivisionManagement /> },
        { label: "Audit Logs", element: <AuditLogs /> },
      ]}
    />
  );
}