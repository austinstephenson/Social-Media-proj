import ProtectedRoute from "./components/ProtectedRoute";

<Route element={<ProtectedRoute />}>
  <Route path="/workspace" element={<DesktopWorkspace />} />
</Route>