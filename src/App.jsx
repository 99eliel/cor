import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ApprovalShareToast from './components/ApprovalShareToast';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import StaffAuth from './components/StaffAuth';
import AdminPage from './pages/AdminPage';
import ApprovalPage from './pages/ApprovalPage';
import ArchivedGarmentsPage from './pages/ArchivedGarmentsPage';
import CustomizerPage from './pages/CustomizerPage';
import OrderRevisionPage from './pages/OrderRevisionPage';
import ProductionPipelinePage from './pages/ProductionPipelinePage';
import SellerOrdersPage from './pages/SellerOrdersPage';
import TeamManagementPage from './pages/TeamManagementPage';
import './catalog-trash.css';
import './operations.css';

function SellerRoute({ pwaEntry = false }) {
  return (
    <StaffAuth>
      {({ user, isAdmin, logout, profile, role }) => (
        role === 'production'
          ? <Navigate to="/admin/producao" replace />
          : (
            <>
              <CustomizerPage staffUser={user} staffProfile={profile} isAdmin={isAdmin} logout={logout} />
              <Link className="seller-orders-shortcut" to="/meus-pedidos">Meus pedidos</Link>
              {pwaEntry && <PwaInstallPrompt />}
            </>
          )
      )}
    </StaffAuth>
  );
}

function SellerOrdersRoute() {
  return (
    <StaffAuth>
      {({ user, isAdmin, logout, profile, role }) => (
        role === 'production'
          ? <Navigate to="/admin/producao" replace />
          : <SellerOrdersPage user={user} profile={profile} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function RevisionRoute() {
  return (
    <StaffAuth allowedRoles={['seller', 'admin']}>
      {({ user, isAdmin, logout }) => (
        <OrderRevisionPage user={user} isAdmin={isAdmin} logout={logout} />
      )}
    </StaffAuth>
  );
}

function AdminRoute() {
  return (
    <>
      <AdminPage />
      <Link className="admin-production-shortcut" to="/admin/producao">Produção</Link>
      <Link className="admin-team-shortcut" to="/admin/equipe">Equipe</Link>
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
        <Route path="/vendedor" element={<SellerRoute pwaEntry />} />
        <Route path="/customizar/:garmentId" element={<SellerRoute />} />
        <Route path="/meus-pedidos" element={<SellerOrdersRoute />} />
        <Route path="/revisar/:orderId" element={<RevisionRoute />} />
        <Route path="/admin" element={<AdminRoute />} />
        <Route path="/admin/producao" element={<ProductionPipelinePage />} />
        <Route path="/admin/equipe" element={<TeamManagementPage />} />
        <Route path="/admin/arquivadas" element={<ArchivedGarmentsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ApprovalShareToast />
    </>
  );
}
