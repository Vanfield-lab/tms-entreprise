// src/layouts/CorporateLayout.tsx
import AppShell from "../app/AppShell";
import ApprovalQueue from "@/modules/approvals/pages/ApprovalQueue";
import FuelReviewQueue from "@/modules/fuel/pages/FuelReviewQueue";
import FuelApprovalHistory from "@/modules/fuel/pages/FuelApprovalHistory";
import MaintenanceApprovalQueue from "@/modules/maintenance/pages/MaintenanceApprovalQueue";
import ReportsDashboard from "@/modules/reports/pages/ReportsDashboard";
import ProfilePage from "@/pages/profile/ProfilePage";

export default function CorporateLayout() {
  return (
    <AppShell
      title="Corporate"
      navItems={[
        { label: "Booking Approvals",    element: <ApprovalQueue /> },
        { label: "Fuel Approvals",       element: <FuelReviewQueue /> },
        { label: "Fuel History",         element: <FuelApprovalHistory /> },
        { label: "Maintenance Approvals",element: <MaintenanceApprovalQueue /> },
        { label: "Reports",              element: <ReportsDashboard /> },
        { label: "Profile",              element: <ProfilePage /> },
      ]}
    />
  );
}