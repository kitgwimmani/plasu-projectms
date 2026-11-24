import { Link } from 'react-router-dom';
import { Empty, Loading, PageHead, useFetch } from '../components/ui.jsx';
import { ProjectView } from './ProjectDetail.jsx';

export default function MyProject() {
  const { data, loading } = useFetch('/projects/mine');
  if (loading) return <Loading />;
  if (!data) return <Empty>No project record found. Contact your HOD.</Empty>;
  return (
    <div>
      <PageHead title="My Project" sub="Track your progress, propose topics, submit chapters and read supervisor feedback.">
        <Link className="btn ghost" to="/studio">Open Writing Studio</Link>
        <Link className="btn ghost" to="/resources">Templates & guidelines</Link>
      </PageHead>
      <ProjectView id={data.id} />
    </div>
  );
}
