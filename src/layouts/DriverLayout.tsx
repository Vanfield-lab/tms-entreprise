// src/layouts/DriverLayout.tsx
import AppShell from "../app/AppShell";
import MyShifts from "../modules/shifts/pages/MyShifts";
import DriverTrips from "@/modules/trips/pages/DriverTrips";
import MyFuelRequests from "@/modules/fuel/pages/MyFuelRequests";
import CreateFuelRequest from "@/modules/fuel/pages/CreateFuelRequest";

export default function DriverLayout() {
  return (
    <AppShell
      title="Driver"
      navItems={[
        { label: "My Trips", element: <DriverTrips /> },
        { label: "My Shifts", element: <MyShifts /> },
        {
          label: "Fuel Requests",
          element: (
            <div className="space-y-6">
              <CreateFuelRequest />
              <MyFuelRequests />
            </div>
          ),
        },
      ]}
    />
  );
}