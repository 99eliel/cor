import { Navigate, Route, Routes } from 'react-router-dom';
import ApprovalShareToast from './components/ApprovalShareToast';
import StaffAuth from './components/StaffAuth';
import AdminPage from './pages/AdminPage';
import ApprovalPage from './pages/ApprovalPage';
import CustomizerPage from './pages/CustomizerPage';

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
    <>
      <Routes>
        <Route path="/aprovar/:orderId/:token" element={<ApprovalPage />} />
        <Route path="/" element={<SellerRoute />} />
        <Route path="/customizar/:garmentId" element={<SellerRoute />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ApprovalShareToast />
    </>
  );
}
