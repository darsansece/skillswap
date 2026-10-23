/* eslint-disable no-console */
require('dotenv').config();
const crypto = require('crypto');
const connectDB = require('./config/db');
const m = require('./models');

const days = (n) => new Date(Date.now() + n * 86400000);

async function seed() {
  await connectDB();
  await Promise.all(Object.values(m).map((Model) => Model.deleteMany({})));

  const mk = async (name, email, extra = {}) => {
    const u = await m.User.create({ name, email, password: 'password123', credits: 20, emailVerified: true, lastLoginDate: new Date(), loginStreak: 1, ...extra });
    await m.CreditTransaction.create({ user: u._id, amount: 20, type: 'signup_bonus', description: 'Welcome bonus', balanceAfter: 20 });
    return u;
  };

  const admin = await mk('Admin User', 'admin@skillswap.dev', { role: 'admin', headline: 'Platform admin' });
  const mod = await mk('Maya Moderator', 'mod@skillswap.dev', { role: 'moderator', headline: 'Community moderator' });
  const priya = await mk('Priya Raman', 'priya@skillswap.dev', { headline: 'Data scientist who loves teaching', bio: 'Five years building analytics at a logistics startup. I teach Python and statistics on weekends.', location: 'Chennai', languages: ['English', 'Tamil'], skillsWanted: [{ name: 'Guitar', category: 'Music' }, { name: 'Spanish', category: 'Languages' }], interests: ['music', 'travel'], points: 320, level: 3, stats: { sessionsTaught: 6, sessionsLearned: 2, hoursTaught: 7, hoursLearned: 2, ratingSum: 28, ratingCount: 6 }, availability: [{ day: 'sat', from: '10:00', to: '13:00' }, { day: 'sun', from: '16:00', to: '19:00' }], portfolio: [{ title: 'Delivery-time forecasting notebook', url: 'https://github.com/example/forecast', skill: 'Python' }] });
  const arjun = await mk('Arjun Mehta', 'arjun@skillswap.dev', { headline: 'Session guitarist', bio: 'Played in bands for a decade. Patient with absolute beginners.', location: 'Bengaluru', skillsWanted: [{ name: 'Python', category: 'Technology' }], points: 180, level: 2, stats: { sessionsTaught: 4, hoursTaught: 5, ratingSum: 19, ratingCount: 4 } });
  const lucia = await mk('Lucía Fernández', 'lucia@skillswap.dev', { headline: 'Spanish tutor & UX designer', location: 'Remote', languages: ['Spanish', 'English'], skillsWanted: [{ name: 'Sourdough baking', category: 'Cooking' }, { name: 'Data analysis' }], points: 90 });
  const ken = await mk('Ken Okafor', 'ken@skillswap.dev', { headline: 'Home baker, retired chef', skillsWanted: [{ name: 'Figma', category: 'Design' }], points: 60 });
  const sara = await mk('Sara Lee', 'sara@skillswap.dev', { headline: 'Learning everything', skillsWanted: [{ name: 'Python', category: 'Technology' }, { name: 'Guitar' }], interests: ['data', 'music'] });

  const S = (owner, o) => m.Skill.create({ owner: owner._id, ...o });
  const py = await S(priya, { title: 'Python for Data Analysis', description: 'Hands-on pandas, numpy and matplotlib using real public datasets. We start from your goals and build a small analysis project together.', category: 'Technology', level: 'advanced', tags: ['python', 'pandas', 'data'], creditsPerHour: 2, yearsExperience: 5, verification: { status: 'verified', evidence: 'GitHub portfolio' }, sessionsCompleted: 6, ratingSum: 28, ratingCount: 6, views: 140 });
  await S(priya, { title: 'Intro to Statistics', description: 'Mean, variance, distributions, hypothesis tests — explained with everyday examples and lots of drawing.', category: 'Academics', level: 'intermediate', tags: ['statistics', 'math'], creditsPerHour: 1, views: 44 });
  const gtr = await S(arjun, { title: 'Acoustic Guitar from Zero', description: 'Chords, strumming patterns and your first three songs. Bring any guitar; I will help you tune it.', category: 'Music', level: 'expert', tags: ['guitar', 'music'], creditsPerHour: 2, mode: 'both', location: 'Bengaluru', sessionsCompleted: 4, ratingSum: 19, ratingCount: 4, views: 98 });
  const es = await S(lucia, { title: 'Conversational Spanish', description: 'Relaxed conversation practice for A2–B2 learners, with vocabulary notes after each session.', category: 'Languages', level: 'expert', tags: ['spanish', 'language'], creditsPerHour: 1, views: 61 });
  await S(lucia, { title: 'Figma for Beginners', description: 'Frames, auto layout, components. We will design a simple mobile screen together from scratch.', category: 'Design', level: 'advanced', tags: ['figma', 'ux', 'design'], creditsPerHour: 2, verification: { status: 'pending', evidence: 'https://dribbble.com/example' } });
  const bread = await S(ken, { title: 'Sourdough Baking', description: 'Starter care, hydration, shaping and scoring. Includes a printable feeding schedule.', category: 'Cooking', level: 'expert', tags: ['baking', 'sourdough'], creditsPerHour: 1, mode: 'in-person', location: 'Chennai', views: 37 });
  await S(ken, { title: 'Knife Skills for Home Cooks', description: 'Safe, fast cutting techniques: dice, julienne, chiffonade. Bring a chef knife.', category: 'Cooking', level: 'expert', tags: ['cooking'], creditsPerHour: 1 });

  // Exchanges
  const done = await m.Exchange.create({ requester: sara._id, provider: priya._id, skill: py._id, type: 'credit', hoursRequested: 2, status: 'completed', message: 'I want to analyse my running data!', sharedNotes: '## Session 1\n- read_csv, head, describe\n- groupby by week', sessions: [{ startTime: days(-6), durationMinutes: 60, status: 'completed', confirmedBy: [sara._id, priya._id], creditsCharged: 2, completedAt: days(-6), teacher: priya._id }], reviewedBy: [sara._id] });
  await m.Review.create({ exchange: done._id, reviewer: sara._id, reviewee: priya._id, skill: py._id, rating: 5, comment: 'Clear, patient and practical. Loved it.' });
  const active = await m.Exchange.create({ requester: priya._id, provider: arjun._id, skill: gtr._id, type: 'swap', offeredSkill: py._id, hoursRequested: 4, status: 'accepted', message: 'Swap guitar for Python?', sessions: [{ startTime: days(2), durationMinutes: 60, meetingLink: 'https://meet.example.com/gtr', status: 'scheduled', teacher: arjun._id }, { startTime: days(4), durationMinutes: 60, status: 'scheduled', teacher: priya._id }] });
  await m.Exchange.create({ requester: sara._id, provider: lucia._id, skill: es._id, type: 'credit', hoursRequested: 1, status: 'pending', message: 'Hola! Can we practise travel phrases?' });
  await m.Exchange.create({ requester: lucia._id, provider: ken._id, skill: bread._id, type: 'credit', hoursRequested: 2, status: 'pending', message: 'My starter keeps dying 😅' });

  const convo = await m.Conversation.create({ participants: [priya._id, arjun._id], exchange: active._id, lastMessage: { text: 'See you Saturday!', sender: arjun._id, at: new Date() } });
  await m.Message.insertMany([
    { conversation: convo._id, sender: priya._id, text: 'Hi Arjun, excited to start guitar!', readBy: [priya._id, arjun._id] },
    { conversation: convo._id, sender: arjun._id, text: 'Same here. Do you have a capo?', readBy: [arjun._id, priya._id] },
    { conversation: convo._id, sender: arjun._id, text: 'See you Saturday!', readBy: [arjun._id] },
  ]);

  // Assessments
  const js = await m.Assessment.create({ title: 'Python Fundamentals', skillName: 'Python', category: 'Technology', level: 'beginner', description: 'Check your grasp of core Python syntax and data types.', createdBy: mod._id, passingScore: 70, timeLimitMinutes: 15, questions: [
    { prompt: 'What does len([1, 2, 3]) return?', options: ['2', '3', '4'], correctIndex: 1, explanation: 'len counts the elements.' },
    { prompt: 'Which type is immutable?', options: ['list', 'dict', 'tuple', 'set'], correctIndex: 2, explanation: 'Tuples cannot be modified after creation.' },
    { prompt: 'How do you start a comment?', options: ['//', '#', '<!--'], correctIndex: 1 },
    { prompt: 'What is 7 // 2?', options: ['3.5', '3', '4'], correctIndex: 1, explanation: '// is floor division.' },
    { prompt: 'Which keyword defines a function?', options: ['func', 'def', 'function'], correctIndex: 1 },
  ] });
  await m.Assessment.create({ title: 'Guitar Theory Basics', skillName: 'Guitar', category: 'Music', level: 'beginner', createdBy: mod._id, passingScore: 60, questions: [
    { prompt: 'How many strings does a standard guitar have?', options: ['4', '6', '7'], correctIndex: 1 },
    { prompt: 'Standard tuning, lowest string?', options: ['E', 'A', 'D'], correctIndex: 0 },
    { prompt: 'A capo is used to…', options: ['Raise pitch of all strings', 'Mute strings', 'Tune the guitar'], correctIndex: 0 },
  ] });
  await m.Certificate.create({ user: priya._id, assessment: js._id, skillName: 'Python', level: 'beginner', score: 100, code: crypto.randomBytes(6).toString('hex').toUpperCase() });
  await m.Goal.create({ user: priya._id, skillName: 'Guitar', targetLevel: 'intermediate', targetDate: days(60), milestones: [{ title: 'Learn open chords', done: true, doneAt: days(-2) }, { title: 'Play a full song' }, { title: 'Strum in 3/4 time' }], hoursLogged: 3 });

  // Forum
  const q = await m.Post.create({ author: sara._id, title: 'Best way to stay consistent while learning a new skill?', body: 'I start strong and fade after two weeks. How do you all keep going?', category: 'question', tags: ['motivation', 'habits'], commentCount: 1 });
  const c = await m.Comment.create({ post: q._id, author: priya._id, body: 'Book recurring sessions with a mentor — the commitment carries you through the dip.' });
  q.acceptedComment = c._id; await q.save();
  await m.Post.create({ author: mod._id, title: 'Welcome to the community forum', body: 'Introduce yourself, ask questions and share resources. Be kind and specific.', category: 'announcement', pinned: true });
  await m.Post.create({ author: ken._id, title: 'My sourdough starter feeding chart', body: 'Feed 1:1:1 at room temperature, twice daily for the first week. Discard before each feed.', category: 'resource', tags: ['baking', 'sourdough'] });
  await m.Announcement.create({ title: 'Community skill fair this Saturday', body: 'Drop in online to try 15-minute taster sessions.', createdBy: admin._id });
  await m.Report.create({ reporter: ken._id, targetType: 'post', targetId: q._id, reason: 'other', details: 'Test report for the moderation queue' });
  await m.Notification.create({ user: priya._id, type: 'session', title: 'Guitar session in 2 days', link: `/exchanges/${active._id}` });

  console.log('Seeded. Log in with any of these (password: password123):');
  ['admin@skillswap.dev', 'mod@skillswap.dev', 'priya@skillswap.dev', 'arjun@skillswap.dev', 'lucia@skillswap.dev', 'ken@skillswap.dev', 'sara@skillswap.dev'].forEach((e) => console.log('  ', e));
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
