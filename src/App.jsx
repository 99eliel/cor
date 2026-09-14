import { Navigate, Route, Routes } from 'react-router-dom';
import AdminPage from './pages/AdminPage';
import CustomizerPage from './pages/CustomizerPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CustomizerPage />} />
      <Route path="/customizar/:garmentId" element={<CustomizerPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
