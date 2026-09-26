import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ApprovalShareToast from './components/ApprovalShareToast';
import StaffAuth from './components/StaffAuth';
import AdminPage from './pages/AdminPage';
import ApprovalPage from './pages/ApprovalPage';
import ArchivedGarmentsPage from './pages/ArchivedGarmentsPage';
import CustomizerPage from './pages/CustomizerPage';
import './catalog-trash.css';

function SellerRoute() {
  return (
    <StaffAuth>
      {({ user, isAdmin, logout }) => (
        <CustomizerPage staffUser={user} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function AdminRoute() {
  return (
    <>
      <AdminPage />
      <Link className="admin-archive-shortcut" to="/admin/arquivadas">Peças arquivadas</Link>
    </>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/aprovar/:orderId/:token" element={<ApprovalPage />} />
        <Route path="/" element={<SellerRoute />} />
        <Route path="/customizar/:garmentId" element={<SellerRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/admin/arquivadas" element={<ArchivedGarmentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ApprovalShareToast />
    </>
  );
}
