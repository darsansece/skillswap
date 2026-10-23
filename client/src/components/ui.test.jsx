import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Coin, Stars, Pager, Tabs, timeAgo } from './ui';
import { HBars, LineChart } from './Charts';
import SkillCard from '../pages/SkillCard';

describe('UI primitives', () => {
  test('Coin exposes an accessible credit label', () => {
    render(<Coin value={12} />);
    expect(screen.getByLabelText('12 credits')).toHaveTextContent('12');
  });

  test('Stars shows "New" when unrated and the score otherwise', () => {
    const { rerender } = render(<Stars value={0} />);
    expect(screen.getByText(/New/)).toBeInTheDocument();
    rerender(<Stars value={4.5} count={3} />);
    expect(screen.getByText(/4\.5/)).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  test('Pager disables edges and reports page changes', () => {
    const onPage = vi.fn();
    render(<Pager page={1} pages={3} onPage={onPage} />);
    expect(screen.getByText('Previous')).toBeDisabled();
    fireEvent.click(screen.getByText('Next'));
    expect(onPage).toHaveBeenCalledWith(2);
  });

  test('Tabs mark the selected tab', () => {
    const onChange = vi.fn();
    render(<Tabs value="b" onChange={onChange} tabs={[['a', 'Alpha'], ['b', 'Beta']]} />);
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });

  test('timeAgo formats relative times', () => {
    expect(timeAgo(new Date())).toBe('just now');
    expect(timeAgo(Date.now() - 2 * 3600 * 1000)).toBe('2h ago');
    expect(timeAgo(Date.now() - 3 * 86400 * 1000)).toBe('3d ago');
  });
});

describe('Charts', () => {
  test('LineChart renders a polyline per series and a legend', () => {
    const data = [{ date: '2026-10-01', value: 1 }, { date: '2026-10-02', value: 3 }];
    const { container } = render(<LineChart series={[{ name: 'Earned', color: 'red', data }, { name: 'Spent', color: 'blue', data }]} />);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
    expect(screen.getByText('Earned')).toBeInTheDocument();
  });

  test('HBars handles empty data', () => {
    render(<HBars items={[]} />);
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });
});

describe('SkillCard', () => {
  const skill = { _id: 's1', title: 'Acoustic Guitar', category: 'Music', level: 'expert', creditsPerHour: 2, acceptsSwap: true, rating: 4.8, ratingCount: 5, verification: { status: 'verified' }, owner: { name: 'Arjun Mehta' } };
  test('shows title, rate, swap and verified marker, linking to the skill', () => {
    render(<MemoryRouter><SkillCard skill={skill} /></MemoryRouter>);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/skills/s1');
    expect(screen.getByText('Acoustic Guitar')).toBeInTheDocument();
    expect(screen.getByLabelText('2 credits')).toBeInTheDocument();
    expect(screen.getByText('or swap')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Arjun Mehta')).toBeInTheDocument();
  });
  test('shows a recommendation reason instead of stars', () => {
    render(<MemoryRouter><SkillCard skill={skill} reason="Matches a skill you want to learn" /></MemoryRouter>);
    expect(screen.getByText('Matches a skill you want to learn')).toBeInTheDocument();
  });
});
