// src/layouts/TransportLayout.tsx
import AppShell from "../app/AppShell";
import DispatchBoard from "../modules/dispatch/pages/DispatchBoard";
import CloseTrips from "../modules/bookings/pages/CloseTrips";
import ScheduleManager from "../modules/shifts/pages/ScheduleManager";
import ShiftAdmin from "../modules/shifts/pages/ShiftAdmin";
import MaintenanceBoard from "../modules/maintenance/pages/MaintenanceBoard";
import MaintenanceHistory from "../modules/maintenance/pages/MaintenanceHistory";
import IncidentBoard from "../modules/incidents/pages/IncidentBoard";
import FuelRecordQueue from "../modules/fuel/pages/FuelRecordQueue";
import CreateFuelRequest from "../modules/fuel/pages/CreateFuelRequest";
import MyFuelRequests from "../modules/fuel/pages/MyFuelRequests";
import VehicleManagement from "../modules/vehicles/pages/VehicleManagement";
import DriverManagement from "../modules/drivers/pages/DriverManagement";
import MileageLog from "../modules/fleet/pages/MileageLog";
import ReportsDashboard from "../modules/reports/pages/ReportsDashboard";
import ProfilePage from "@/pages/profile/ProfilePage";

export default function TransportLayout() {
  return (
    <AppShell
      title="Transport"
      navItems={[
        { label: "Dispatch",        element: <DispatchBoard /> },
        { label: "Close Trips",     element: <CloseTrips /> },
        { label: "Driver Schedule", element: <ScheduleManager /> },
        { label: "Shift Overrides", element: <ShiftAdmin /> },
        { label: "Maintenance",     element: <MaintenanceBoard /> },
        { label: "Maint. History",  element: <MaintenanceHistory /> },
        { label: "Incidents",       element: <IncidentBoard /> },
        { label: "Record Fuel",     element: <FuelRecordQueue /> },
        {
          label: "Fuel Request",
          element: (
            <div className="space-y-6">
              <CreateFuelRequest />
              <MyFuelRequests />
            </div>
          ),
        },
        { label: "Vehicles",        element: <VehicleManagement /> },
        { label: "Mileage Log",     element: <MileageLog /> },
        { label: "Drivers",         element: <DriverManagement /> },
        { label: "Reports",         element: <ReportsDashboard /> },
        { label: "Profile",         element: <ProfilePage /> },
      ]}
    />
  );
}