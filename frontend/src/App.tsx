import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { ExperimentsPage } from "./pages/ExperimentsPage";
import { StatsPage } from "./pages/StatsPage";
import { SubmitPage } from "./pages/SubmitPage";
import { TicketDetailPage } from "./pages/TicketDetailPage";
import { TicketListPage } from "./pages/TicketListPage";

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/submit" replace />} />
        <Route path="/submit" element={<SubmitPage />} />
        <Route path="/tickets" element={<TicketListPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
      </Route>
    </Routes>
  );
}
