// src/layouts/TransportLayout.tsx — UPDATED with ScheduleManager
import AppShell from "../app/AppShell";
import ReportsDashboard from "@/modules/reports/pages/ReportsDashboard";
import DispatchBoard from "@/modules/dispatch/pages/DispatchBoard";
import CloseTrips from "@/modules/bookings/pages/CloseTrips";
import MaintenanceBoard from "@/modules/maintenance/pages/MaintenanceBoard";
import MaintenanceHistory from "@/modules/maintenance/pages/MaintenanceHistory";
import ShiftAdmin from "@/modules/shifts/pages/ShiftAdmin";
import ScheduleManager from "@/modules/shifts/pages/ScheduleManager";
import FuelRecordQueue from "@/modules/fuel/pages/FuelRecordQueue";
import VehicleManagement from "@/modules/vehicles/pages/VehicleManagement";
import DriverManagement from "@/modules/drivers/pages/DriverManagement";

export default function TransportLayout() {
  return (
    <AppShell
      title="Transport"
      navItems={[
        { label: "Dispatch", element: <DispatchBoard /> },
        { label: "Close Trips", element: <CloseTrips /> },
        { label: "Driver Schedule", element: <ScheduleManager /> },
        { label: "Shift Overrides", element: <ShiftAdmin /> },
        { label: "Maintenance", element: <MaintenanceBoard /> },
        { label: "Maint. History", element: <MaintenanceHistory /> },
        { label: "Record Fuel", element: <FuelRecordQueue /> },
        { label: "Vehicles", element: <VehicleManagement /> },
        { label: "Drivers", element: <DriverManagement /> },
        { label: "Reports", element: <ReportsDashboard /> },
      ]}
    />
  );
}