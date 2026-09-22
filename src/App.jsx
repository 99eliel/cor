import { Navigate, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import CustomizerPage from './pages/CustomizerPage';
import StaffAuth from './components/StaffAuth';

function SellerRoute() {
  return (
    <StaffAuth>
      {({ user, isAdmin, logout }) => (
        <CustomizerPage staffUser={user} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SellerRoute />} />
      <Route path="/customizar/:garmentId" element={<SellerRoute />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
