import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Login, Register, ForgotPassword, ResetPassword, VerifyEmail } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Marketplace from './pages/Marketplace';
import SkillDetail from './pages/SkillDetail';
import { SkillForm, MySkills } from './pages/SkillForm';
import { ProfileEdit, PublicProfile } from './pages/Profile';
import { ExchangeList, ExchangeDetail } from './pages/Exchanges';
import Messages from './pages/Messages';
import Assistant from './pages/Assistant';
import Rewards from './pages/Rewards';
import { Learn, TakeAssessment, CreateAssessment, VerifyCertificate } from './pages/Learn';
import { ForumList, ForumPost, NewPost } from './pages/Forum';
import Admin from './pages/admin/Admin';

function Private({ children, adminOnly }) {
  const { user, loading, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="content"><p className="muted">Loading…</p></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />
      <Route path="/verify-email/:token" element={<VerifyEmail />} />
      <Route path="/verify/:code?" element={<VerifyCertificate />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="skills/new" element={<SkillForm />} />
        <Route path="skills/:id/edit" element={<SkillForm />} />
        <Route path="skills/:id" element={<SkillDetail />} />
        <Route path="my-skills" element={<MySkills />} />
        <Route path="profile" element={<ProfileEdit />} />
        <Route path="users/:id" element={<PublicProfile />} />
        <Route path="exchanges" element={<ExchangeList />} />
        <Route path="exchanges/:id" element={<ExchangeDetail />} />
        <Route path="messages/:id?" element={<Messages />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="rewards" element={<Rewards />} />
        <Route path="wallet" element={<Navigate to="/rewards" replace />} />
        <Route path="learn" element={<Learn />} />
        <Route path="learn/new" element={<CreateAssessment />} />
        <Route path="learn/:id" element={<TakeAssessment />} />
        <Route path="forum" element={<ForumList />} />
        <Route path="forum/new" element={<NewPost />} />
        <Route path="forum/:id" element={<ForumPost />} />
        <Route path="admin/*" element={<Private adminOnly><Admin /></Private>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
