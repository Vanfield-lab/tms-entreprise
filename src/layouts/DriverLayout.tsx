// src/layouts/DriverLayout.tsx
import AppShell from "../app/AppShell";
import DriverTrips from "../modules/trips/pages/DriverTrips";
import MyShifts from "../modules/shifts/pages/MyShifts";
import CreateFuelRequest from "../modules/fuel/pages/CreateFuelRequest";
import MyFuelRequests from "../modules/fuel/pages/MyFuelRequests";
import IncidentReportForm from "../modules/incidents/pages/IncidentReportForm";
import MyIncidentReports from "../modules/incidents/pages/MyIncidentReports";
import ProfilePage from "@/pages/profile/ProfilePage";

export default function DriverLayout() {
  return (
    <AppShell
      title="Driver"
      navItems={[
        { label: "My Trips",   element: <DriverTrips /> },
        { label: "My Shifts",  element: <MyShifts /> },
        {
          label: "Fuel Request",
          element: (
            <div className="space-y-6">
              <CreateFuelRequest />
              <MyFuelRequests />
            </div>
          ),
        },
        {
          label: "Incidents",
          element: (
            <div className="space-y-6">
              <IncidentReportForm />
              <MyIncidentReports />
            </div>
          ),
        },
        { label: "Profile",    element: <ProfilePage /> },
      ]}
    />
  );
}