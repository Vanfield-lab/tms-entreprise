// src/layouts/TransportLayout.tsx
import AppShell from "../app/AppShell";
import ReportsDashboard from "@/modules/reports/pages/ReportsDashboard";
import DispatchBoard from "@/modules/dispatch/pages/DispatchBoard";
import CloseTrips from "@/modules/bookings/pages/CloseTrips";
import MaintenanceBoard from "@/modules/maintenance/pages/MaintenanceBoard";
import MaintenanceHistory from "@/modules/maintenance/pages/MaintenanceHistory";
import ShiftAdmin from "@/modules/shifts/pages/ShiftAdmin";
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
        { label: "Maintenance", element: <MaintenanceBoard /> },
        { label: "Maint. History", element: <MaintenanceHistory /> },
        { label: "Record Fuel", element: <FuelRecordQueue /> },
        { label: "Vehicles", element: <VehicleManagement /> },
        { label: "Drivers", element: <DriverManagement /> },
        { label: "Shift Overrides", element: <ShiftAdmin /> },
        { label: "Reports", element: <ReportsDashboard /> },
      ]}
    />
  );
}