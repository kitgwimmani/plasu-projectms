import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyProject from './pages/MyProject.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import Projects from './pages/Projects.jsx';
import Supervision from './pages/Supervision.jsx';
import Reviews from './pages/Reviews.jsx';
import Approvals from './pages/Approvals.jsx';
import Users from './pages/Users.jsx';
import Structure from './pages/Structure.jsx';
import Settings from './pages/Settings.jsx';
import Activity from './pages/Activity.jsx';
import Reports from './pages/Reports.jsx';
import Defenses from './pages/Defenses.jsx';
import Studio from './pages/Studio.jsx';
import References from './pages/References.jsx';
import Resources from './pages/Resources.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';
import Announcements from './pages/Announcements.jsx';
import Community from './pages/Community.jsx';
import Manuscripts from './pages/Manuscripts.jsx';
import ManuscriptDetail from './pages/ManuscriptDetail.jsx';
import Profile from './pages/Profile.jsx';

const Guard = ({ roles, children }) => {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
};
const ADM = ['superadmin', 'sysadmin'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen"><Loading /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="my-project" element={<Guard roles={['student']}><MyProject /></Guard>} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="projects" element={<Guard roles={['hod', 'dean', ...ADM]}><Projects /></Guard>} />
        <Route path="supervision" element={<Guard roles={['lecturer', 'hod', 'dean']}><Supervision /></Guard>} />
        <Route path="reviews" element={<Guard roles={['lecturer', 'hod', 'dean']}><Reviews /></Guard>} />
        <Route path="approvals" element={<Guard roles={['hod', ...ADM]}><Approvals /></Guard>} />
        <Route path="users" element={<Guard roles={['hod', 'dean', ...ADM]}><Users /></Guard>} />
        <Route path="structure" element={<Guard roles={ADM}><Structure /></Guard>} />
        <Route path="settings" element={<Guard roles={ADM}><Settings /></Guard>} />
        <Route path="activity" element={<Guard roles={ADM}><Activity /></Guard>} />
        <Route path="reports" element={<Guard roles={['lecturer', 'hod', 'dean', ...ADM]}><Reports /></Guard>} />
        <Route path="defenses" element={<Guard roles={['hod', 'dean', ...ADM]}><Defenses /></Guard>} />
        <Route path="studio" element={<Studio />} />
        <Route path="studio/:id" element={<Studio />} />
        <Route path="references" element={<References />} />
        <Route path="resources" element={<Resources />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:uid" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="community" element={<Community />} />
        <Route path="manuscripts" element={<Manuscripts />} />
        <Route path="manuscripts/:id" element={<ManuscriptDetail />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
