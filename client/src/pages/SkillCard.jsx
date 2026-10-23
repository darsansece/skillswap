import { Link } from 'react-router-dom';
import { Avatar, Coin, Stars } from '../components/ui';

export default function SkillCard({ skill, reason }) {
  return (
    <Link to={`/skills/${skill._id}`} className="ticket">
      <div className="body">
        <div className="row" style={{ gap: '.4rem' }}>
          <span className="chip">{skill.category}</span>
          <span className="chip">{skill.level}</span>
          {skill.verification?.status === 'verified' && <span className="chip teal">Verified</span>}
        </div>
        <div className="title">{skill.title}</div>
        {reason ? <div className="small" style={{ color: 'var(--teal-strong)' }}>{reason}</div> : <Stars value={skill.rating} count={skill.ratingCount} />}
        {skill.owner && <div className="owner"><Avatar user={skill.owner} /> {skill.owner.name}</div>}
      </div>
      <div className="stub">
        <Coin value={skill.creditsPerHour} />
        <span className="per">per hour</span>
        {skill.acceptsSwap && <span className="per" style={{ color: 'var(--teal-strong)' }}>or swap</span>}
      </div>
    </Link>
  );
}
