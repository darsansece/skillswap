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
    const u = await m.User.create({
      name,
      email,
      password: 'password123',
      credits: 20,
      emailVerified: true,
      lastLoginDate: new Date(),
      loginStreak: 1,
      createdAt: days(-28),
      ...extra,
    });
    await m.CreditTransaction.create({
      user: u._id,
      amount: u.credits,
      type: 'signup_bonus',
      description: 'Welcome bonus',
      balanceAfter: u.credits,
      createdAt: u.createdAt,
    });
    return u;
  };

  // 1. Members
  const admin = await mk('Admin User', 'admin@skillswap.dev', {
    role: 'admin',
    headline: 'Platform administrator',
    bio: 'Overseeing community quality, security, and moderation.',
    createdAt: days(-30),
  });

  const mod = await mk('Maya Moderator', 'mod@skillswap.dev', {
    role: 'moderator',
    headline: 'Community moderator',
    bio: 'Helping members resolve disputes and reviewing skill verifications.',
    createdAt: days(-26),
  });

  const priya = await mk('Priya Raman', 'priya@skillswap.dev', {
    headline: 'Data scientist who loves teaching',
    bio: 'Five years building analytics at a logistics startup. I teach Python and statistics on weekends.',
    location: 'Chennai',
    languages: ['English', 'Tamil'],
    skillsWanted: [{ name: 'Guitar', category: 'Music' }, { name: 'Spanish', category: 'Languages' }],
    interests: ['music', 'travel', 'data science'],
    points: 480,
    level: 4,
    credits: 32,
    stats: { sessionsTaught: 8, sessionsLearned: 3, hoursTaught: 11, hoursLearned: 3, ratingSum: 40, ratingCount: 8, forumPosts: 4, acceptedAnswers: 2 },
    availability: [{ day: 'sat', from: '10:00', to: '14:00' }, { day: 'sun', from: '15:00', to: '19:00' }],
    portfolio: [{ title: 'Delivery-time forecasting notebook', url: 'https://github.com/example/forecast', skill: 'Python' }],
    createdAt: days(-24),
  });

  const arjun = await mk('Arjun Mehta', 'arjun@skillswap.dev', {
    headline: 'Session guitarist & acoustic instructor',
    bio: 'Played in touring indie bands for a decade. Patient with absolute beginners looking to play their first song.',
    location: 'Bengaluru',
    languages: ['English', 'Hindi'],
    skillsWanted: [{ name: 'Python', category: 'Technology' }],
    points: 290,
    level: 3,
    credits: 24,
    stats: { sessionsTaught: 5, sessionsLearned: 2, hoursTaught: 7, hoursLearned: 2, ratingSum: 24, ratingCount: 5, forumPosts: 2 },
    createdAt: days(-20),
  });

  const lucia = await mk('Lucía Fernández', 'lucia@skillswap.dev', {
    headline: 'Spanish tutor & Senior UX designer',
    bio: 'Native Spanish speaker and product designer. Passionate about sourdough baking and practical language learning.',
    location: 'Remote',
    languages: ['Spanish', 'English'],
    skillsWanted: [{ name: 'Sourdough baking', category: 'Cooking' }, { name: 'Data analysis', category: 'Technology' }],
    points: 195,
    level: 2,
    credits: 18,
    stats: { sessionsTaught: 3, sessionsLearned: 2, hoursTaught: 4, hoursLearned: 2, ratingSum: 15, ratingCount: 3 },
    createdAt: days(-16),
  });

  const ken = await mk('Ken Okafor', 'ken@skillswap.dev', {
    headline: 'Artisan baker & culinary mentor',
    bio: 'Retired pastry chef with 15 years experience. Teaching natural sourdough fermentation and knife precision.',
    location: 'Chennai',
    languages: ['English'],
    skillsWanted: [{ name: 'Figma', category: 'Design' }],
    points: 140,
    level: 2,
    credits: 15,
    stats: { sessionsTaught: 2, sessionsLearned: 1, hoursTaught: 3, hoursLearned: 1, ratingSum: 10, ratingCount: 2, forumPosts: 3 },
    createdAt: days(-14),
  });

  const sara = await mk('Sara Lee', 'sara@skillswap.dev', {
    headline: 'Lifelong learner & community explorer',
    bio: 'Exploring creative coding, guitar strumming, and foreign languages.',
    skillsWanted: [{ name: 'Python', category: 'Technology' }, { name: 'Guitar', category: 'Music' }],
    interests: ['data', 'music', 'baking'],
    points: 90,
    level: 1,
    credits: 14,
    stats: { sessionsLearned: 4, hoursLearned: 5, forumPosts: 2 },
    createdAt: days(-10),
  });

  const david = await mk('David Kim', 'david@skillswap.dev', {
    headline: 'Full-Stack Engineer & React Specialist',
    bio: 'Senior software engineer building modern cloud applications. Teaching Node.js, React, and API design.',
    location: 'San Francisco',
    languages: ['English', 'Korean'],
    skillsWanted: [{ name: 'Yoga', category: 'Fitness' }, { name: 'Spanish', category: 'Languages' }],
    points: 310,
    level: 3,
    credits: 28,
    stats: { sessionsTaught: 4, hoursTaught: 6, ratingSum: 20, ratingCount: 4 },
    createdAt: days(-8),
  });

  const elena = await mk('Elena Rostova', 'elena@skillswap.dev', {
    headline: 'Certified Vinyasa Yoga & Breathwork Guide',
    bio: 'RYT-500 registered yoga instructor teaching mindful movement, flexibility, and stress reduction.',
    location: 'Berlin',
    languages: ['English', 'German', 'Russian'],
    skillsWanted: [{ name: 'Web development', category: 'Technology' }],
    points: 220,
    level: 2,
    credits: 22,
    stats: { sessionsTaught: 3, hoursTaught: 4, ratingSum: 15, ratingCount: 3 },
    createdAt: days(-5),
  });

  const marcus = await mk('Marcus Thorne', 'marcus@skillswap.dev', {
    headline: 'Digital marketer',
    status: 'suspended',
    suspendedUntil: days(5),
    warnings: [{ reason: 'Missed three scheduled exchange sessions without prior notice', by: mod._id, at: days(-4) }],
    createdAt: days(-12),
  });

  const spammer = await mk('Promo Bot', 'spammer@skillswap.dev', {
    headline: 'Crypto trader',
    status: 'banned',
    emailVerified: false,
    warnings: [
      { reason: 'Posted external advertising links in forum comments', by: admin._id, at: days(-8) },
      { reason: 'Repeated promotional spam violation', by: admin._id, at: days(-7) },
    ],
    createdAt: days(-15),
  });

  // 2. Skills
  const S = (owner, o) => m.Skill.create({ owner: owner._id, ...o });

  const py = await S(priya, {
    title: 'Python for Data Analysis',
    description: 'Hands-on pandas, numpy and matplotlib using real public datasets. We start from your learning goals and build a small analysis project together.',
    category: 'Technology',
    level: 'advanced',
    tags: ['python', 'pandas', 'data', 'analytics'],
    creditsPerHour: 2,
    yearsExperience: 5,
    verification: { status: 'verified', evidence: 'https://github.com/priya-raman/data-analysis-portfolio', reviewedBy: admin._id, reviewedAt: days(-15) },
    sessionsCompleted: 8,
    ratingSum: 40,
    ratingCount: 8,
    views: 185,
    createdAt: days(-22),
  });

  await S(priya, {
    title: 'Intro to Statistics & Probability',
    description: 'Mean, variance, normal distributions, hypothesis tests and A/B testing — explained with everyday examples and lots of drawing.',
    category: 'Academics',
    level: 'intermediate',
    tags: ['statistics', 'math', 'probability'],
    creditsPerHour: 1,
    sessionsCompleted: 2,
    ratingSum: 10,
    ratingCount: 2,
    views: 64,
    createdAt: days(-20),
  });

  const gtr = await S(arjun, {
    title: 'Acoustic Guitar from Zero',
    description: 'Chords, strumming patterns and your first three songs. Bring any guitar; I will help you tune it and find your rhythm.',
    category: 'Music',
    level: 'expert',
    tags: ['guitar', 'music', 'acoustic', 'chords'],
    creditsPerHour: 2,
    mode: 'both',
    location: 'Bengaluru',
    sessionsCompleted: 5,
    ratingSum: 24,
    ratingCount: 5,
    views: 120,
    createdAt: days(-19),
  });

  const es = await S(lucia, {
    title: 'Conversational Spanish',
    description: 'Relaxed conversation practice for A2–B2 learners, with vocabulary notes and pronunciation guidance after each session.',
    category: 'Languages',
    level: 'expert',
    tags: ['spanish', 'language', 'conversation'],
    creditsPerHour: 1,
    sessionsCompleted: 3,
    ratingSum: 15,
    ratingCount: 3,
    views: 88,
    createdAt: days(-15),
  });

  const figma = await S(lucia, {
    title: 'Figma for Beginners & UI Fundamentals',
    description: 'Frames, auto layout, component variants, and interactive prototypes. We will design a clean mobile interface together from scratch.',
    category: 'Design',
    level: 'advanced',
    tags: ['figma', 'ux', 'ui', 'design'],
    creditsPerHour: 2,
    verification: { status: 'pending', evidence: 'https://dribbble.com/lucia-ux - 6 years product design portfolio' },
    views: 76,
    createdAt: days(-14),
  });

  const bread = await S(ken, {
    title: 'Sourdough Baking Fundamentals',
    description: 'Starter care, hydration, dough shaping, cold fermentation, and scoring. Includes a printable feeding schedule and trouble-shooting guide.',
    category: 'Cooking',
    level: 'expert',
    tags: ['baking', 'sourdough', 'cooking', 'bread'],
    creditsPerHour: 1,
    mode: 'in-person',
    location: 'Chennai',
    sessionsCompleted: 2,
    ratingSum: 10,
    ratingCount: 2,
    views: 52,
    createdAt: days(-13),
  });

  await S(ken, {
    title: 'Knife Skills for Home Cooks',
    description: 'Safe, fast cutting techniques: dice, julienne, chiffonade, and proper whetstone knife sharpening at home.',
    category: 'Cooking',
    level: 'expert',
    tags: ['cooking', 'kitchen', 'knife-skills'],
    creditsPerHour: 1,
    views: 31,
    createdAt: days(-11),
  });

  const nodeSkill = await S(david, {
    title: 'Full-Stack Node.js & React Mastery',
    description: 'Build production-ready web apps with Express, MongoDB, and React. Clean architecture, JWT authentication, and component patterns.',
    category: 'Technology',
    level: 'advanced',
    tags: ['nodejs', 'react', 'javascript', 'mongodb'],
    creditsPerHour: 2,
    verification: { status: 'pending', evidence: 'https://github.com/david-kim - Lead engineer at CloudFlow, 8 years Node/React experience' },
    sessionsCompleted: 4,
    ratingSum: 20,
    ratingCount: 4,
    views: 94,
    createdAt: days(-8),
  });

  const yogaSkill = await S(elena, {
    title: 'Vinyasa Yoga & Breathwork for Beginners',
    description: 'Mindful alignment, sun salutations, core stability, and nervous system regulation through diaphragmatic breathwork.',
    category: 'Fitness',
    level: 'intermediate',
    tags: ['yoga', 'wellness', 'fitness', 'meditation'],
    creditsPerHour: 1,
    verification: { status: 'pending', evidence: 'https://yogaalliance.org/verify/YA-94821 - RYT-500 Certified Yoga Alliance Instructor' },
    sessionsCompleted: 3,
    ratingSum: 15,
    ratingCount: 3,
    views: 65,
    createdAt: days(-5),
  });

  // 3. Exchanges & Historical Sessions
  const done1 = await m.Exchange.create({
    requester: sara._id,
    provider: priya._id,
    skill: py._id,
    type: 'credit',
    hoursRequested: 2,
    status: 'completed',
    message: 'I want to analyse my personal running data!',
    sharedNotes: '## Session 1\n- read_csv, head, describe\n- groupby by week\n\n## Session 2\n- matplotlib line and scatter charts\n- rolling average trendline',
    sessions: [
      { startTime: days(-16), durationMinutes: 60, status: 'completed', confirmedBy: [sara._id, priya._id], creditsCharged: 2, completedAt: days(-16), teacher: priya._id },
      { startTime: days(-9), durationMinutes: 60, status: 'completed', confirmedBy: [sara._id, priya._id], creditsCharged: 2, completedAt: days(-9), teacher: priya._id },
    ],
    reviewedBy: [sara._id],
    createdAt: days(-18),
  });
  await m.Review.create({ exchange: done1._id, reviewer: sara._id, reviewee: priya._id, skill: py._id, rating: 5, comment: 'Clear, patient and practical. Loved the real dataset exercises!', createdAt: days(-9) });

  const done2 = await m.Exchange.create({
    requester: sara._id,
    provider: arjun._id,
    skill: gtr._id,
    type: 'credit',
    hoursRequested: 1,
    status: 'completed',
    message: 'Can you teach me basic finger chords for campfire songs?',
    sessions: [
      { startTime: days(-6), durationMinutes: 60, status: 'completed', confirmedBy: [sara._id, arjun._id], creditsCharged: 2, completedAt: days(-6), teacher: arjun._id },
    ],
    reviewedBy: [sara._id],
    createdAt: days(-8),
  });
  await m.Review.create({ exchange: done2._id, reviewer: sara._id, reviewee: arjun._id, skill: gtr._id, rating: 5, comment: 'Arjun is an incredible teacher, got me playing chords in 45 minutes.', createdAt: days(-6) });

  const done3 = await m.Exchange.create({
    requester: priya._id,
    provider: ken._id,
    skill: bread._id,
    type: 'credit',
    hoursRequested: 1,
    status: 'completed',
    message: 'My sourdough starter was sluggish, need help with feeding ratios!',
    sessions: [
      { startTime: days(-3), durationMinutes: 60, status: 'completed', confirmedBy: [priya._id, ken._id], creditsCharged: 1, completedAt: days(-3), teacher: ken._id },
    ],
    reviewedBy: [priya._id],
    createdAt: days(-5),
  });
  await m.Review.create({ exchange: done3._id, reviewer: priya._id, reviewee: ken._id, skill: bread._id, rating: 5, comment: 'Ken knows everything about wild yeast. My loaf came out perfect.', createdAt: days(-3) });

  const active = await m.Exchange.create({
    requester: priya._id,
    provider: arjun._id,
    skill: gtr._id,
    type: 'swap',
    offeredSkill: py._id,
    hoursRequested: 4,
    status: 'accepted',
    message: 'Swap guitar lessons for Python data analysis sessions?',
    sessions: [
      { startTime: days(2), durationMinutes: 60, meetingLink: 'https://meet.skillswap.dev/gtr-1', status: 'scheduled', teacher: arjun._id },
      { startTime: days(5), durationMinutes: 60, meetingLink: 'https://meet.skillswap.dev/py-1', status: 'scheduled', teacher: priya._id },
    ],
    createdAt: days(-4),
  });

  await m.Exchange.create({
    requester: sara._id,
    provider: lucia._id,
    skill: es._id,
    type: 'credit',
    hoursRequested: 2,
    status: 'pending',
    message: 'Hola Lucía! I would love to practice conversational travel phrases before my trip.',
    createdAt: days(-2),
  });

  await m.Exchange.create({
    requester: elena._id,
    provider: david._id,
    skill: nodeSkill._id,
    type: 'swap',
    offeredSkill: yogaSkill._id,
    hoursRequested: 2,
    status: 'pending',
    message: 'Swap web development sessions for private morning yoga classes?',
    createdAt: days(-1),
  });

  await m.Exchange.create({
    requester: ken._id,
    provider: lucia._id,
    skill: figma._id,
    type: 'credit',
    hoursRequested: 1,
    status: 'declined',
    message: 'Looking to design menus for my bakery.',
    createdAt: days(-6),
  });

  await m.Exchange.create({
    requester: marcus._id,
    provider: priya._id,
    skill: py._id,
    type: 'credit',
    hoursRequested: 3,
    status: 'cancelled',
    message: 'Need urgent help with a corporate report.',
    createdAt: days(-7),
  });

  // Credit circulation transactions (for analytics graph)
  await m.CreditTransaction.create({ user: priya._id, amount: 4, type: 'earned_teaching', description: 'Session payment from Sara Lee', exchange: done1._id, balanceAfter: 24, createdAt: days(-9) });
  await m.CreditTransaction.create({ user: arjun._id, amount: 2, type: 'earned_teaching', description: 'Session payment from Sara Lee', exchange: done2._id, balanceAfter: 22, createdAt: days(-6) });
  await m.CreditTransaction.create({ user: ken._id, amount: 1, type: 'earned_teaching', description: 'Session payment from Priya Raman', exchange: done3._id, balanceAfter: 15, createdAt: days(-3) });

  // Conversations
  const convo = await m.Conversation.create({
    participants: [priya._id, arjun._id],
    exchange: active._id,
    lastMessage: { text: 'See you Saturday for guitar!', sender: arjun._id, at: new Date() },
  });
  await m.Message.insertMany([
    { conversation: convo._id, sender: priya._id, text: 'Hi Arjun, really excited to start learning acoustic guitar!', readBy: [priya._id, arjun._id] },
    { conversation: convo._id, sender: arjun._id, text: 'Same here! Do you already have a capo or should we stick to open chords first?', readBy: [arjun._id, priya._id] },
    { conversation: convo._id, sender: arjun._id, text: 'See you Saturday for guitar!', readBy: [arjun._id] },
  ]);

  // 4. Assessments & Certifications
  const js = await m.Assessment.create({
    title: 'Python Fundamentals',
    skillName: 'Python',
    category: 'Technology',
    level: 'beginner',
    description: 'Check your grasp of core Python syntax, data structures, and functions.',
    createdBy: mod._id,
    status: 'published',
    passingScore: 70,
    timeLimitMinutes: 15,
    questions: [
      { prompt: 'What does len([1, 2, 3]) return?', options: ['2', '3', '4'], correctIndex: 1, explanation: 'len counts elements.' },
      { prompt: 'Which Python type is immutable?', options: ['list', 'dict', 'tuple', 'set'], correctIndex: 2, explanation: 'Tuples cannot be modified after creation.' },
      { prompt: 'How do you start a single-line comment in Python?', options: ['//', '#', '<!--', '/*'], correctIndex: 1 },
      { prompt: 'What is the result of 7 // 2?', options: ['3.5', '3', '4'], correctIndex: 1, explanation: '// performs integer floor division.' },
      { prompt: 'Which keyword defines a function in Python?', options: ['func', 'def', 'function', 'fn'], correctIndex: 1 },
    ],
  });

  await m.Assessment.create({
    title: 'Acoustic Guitar Basics',
    skillName: 'Guitar',
    category: 'Music',
    level: 'beginner',
    description: 'Assess standard string tuning, fundamental open chords, and rhythm comprehension.',
    createdBy: mod._id,
    status: 'published',
    passingScore: 60,
    timeLimitMinutes: 10,
    questions: [
      { prompt: 'How many strings does a standard acoustic guitar have?', options: ['4', '6', '7', '8'], correctIndex: 1 },
      { prompt: 'In standard tuning, what note is the lowest pitch string?', options: ['E', 'A', 'D', 'G'], correctIndex: 0 },
      { prompt: 'A capo is placed on the fretboard to…', options: ['Raise pitch of all strings', 'Mute strings', 'Tune pegs'], correctIndex: 0 },
    ],
  });

  // Pending Review Assessments (for Admin Verification Queue)
  await m.Assessment.create({
    title: 'React & Modern Frontend Architecture',
    skillName: 'React',
    category: 'Technology',
    level: 'intermediate',
    description: 'Assessment covering hooks, component lifecycle, memoization, and state architecture.',
    createdBy: david._id,
    status: 'pending_review',
    passingScore: 75,
    timeLimitMinutes: 20,
    questions: [
      { prompt: 'What hook is used to execute side-effects in functional components?', options: ['useEffect', 'useState', 'useRef', 'useMemo'], correctIndex: 0 },
      { prompt: 'Why should keys be unique when rendering a list in React?', options: ['For CSS styling', 'To help React identify which items have changed, been added, or removed', 'To increase bundle size'], correctIndex: 1 },
      { prompt: 'What does useCallback do?', options: ['Executes an API call', 'Returns a memoized version of the callback that only changes if dependencies change', 'Creates a ref'], correctIndex: 1 },
    ],
  });

  await m.Assessment.create({
    title: 'Spanish Grammar & Subjunctive Essentials',
    skillName: 'Spanish',
    category: 'Languages',
    level: 'intermediate',
    description: 'Test your understanding of present subjunctive triggers, preterite vs imperfect, and conversational connectors.',
    createdBy: lucia._id,
    status: 'pending_review',
    passingScore: 70,
    timeLimitMinutes: 15,
    questions: [
      { prompt: 'Which sentence correctly uses the subjunctive?', options: ['Espero que tengas un buen día', 'Espero que tienes un buen día', 'Espero que tener un buen día'], correctIndex: 0 },
      { prompt: 'Which tense is used for habitual actions in the past in Spanish?', options: ['Pretérito perfecto', 'Pretérito imperfecto', 'Futuro simple'], correctIndex: 1 },
      { prompt: 'How do you say "Although" in Spanish?', options: ['Porque', 'Aunque', 'Sin embargo'], correctIndex: 1 },
    ],
  });

  await m.Certificate.create({
    user: priya._id,
    assessment: js._id,
    skillName: 'Python',
    level: 'beginner',
    score: 100,
    code: crypto.randomBytes(6).toString('hex').toUpperCase(),
    issuedAt: days(-12),
  });

  await m.Goal.create({
    user: priya._id,
    skillName: 'Guitar',
    targetLevel: 'intermediate',
    targetDate: days(60),
    milestones: [
      { title: 'Learn 5 fundamental open chords (C, G, D, Em, Am)', done: true, doneAt: days(-2) },
      { title: 'Play a full song smoothly at 80 BPM' },
      { title: 'Master 4/4 and 3/4 strumming patterns' },
      { title: 'Pass the Acoustic Guitar Basics assessment' },
    ],
    hoursLogged: 4,
  });

  // 5. Community Forum
  const q = await m.Post.create({
    author: sara._id,
    title: 'Best way to stay consistent while learning a new skill?',
    body: 'I usually start strong and fade after two weeks. How do community members keep their study momentum going?',
    category: 'question',
    tags: ['motivation', 'habits', 'productivity'],
    commentCount: 2,
    createdAt: days(-8),
  });
  const c1 = await m.Comment.create({
    post: q._id,
    author: priya._id,
    body: 'Book recurring 1-on-1 sessions with a mentor — social commitment carries you through the dip when solo motivation fades.',
    createdAt: days(-7),
  });
  await m.Comment.create({
    post: q._id,
    author: arjun._id,
    body: 'Break practice into 20-minute daily blocks rather than 3-hour weekend marathons. Consistency compounds quickly!',
    createdAt: days(-6),
  });
  q.acceptedComment = c1._id;
  await q.save();

  await m.Post.create({
    author: mod._id,
    title: 'Welcome to the SkillSwap Community!',
    body: 'Introduce yourself, ask questions, propose direct swaps, and share helpful tutorials. Keep conversations respectful, constructive, and kind.',
    category: 'announcement',
    pinned: true,
    createdAt: days(-20),
  });

  await m.Post.create({
    author: ken._id,
    title: 'Printable Sourdough Starter Feeding & Hydration Chart',
    body: 'Feed 1:1:1 at room temperature twice daily. Discard 50% before each feed to prevent acidity buildup. Happy baking!',
    category: 'resource',
    tags: ['baking', 'sourdough', 'cooking'],
    createdAt: days(-5),
  });

  // 6. Announcements
  await m.Announcement.create({
    title: 'Community Skill Fair this Saturday',
    body: 'Drop in online to try 15-minute taster sessions across coding, languages, and music.',
    createdBy: admin._id,
    createdAt: days(-10),
  });

  await m.Announcement.create({
    title: 'New Feature: AI Learning Roadmaps & Milestones',
    body: 'You can now generate custom step-by-step learning roadmaps and save them directly as personal learning goals.',
    createdBy: admin._id,
    createdAt: days(-4),
  });

  await m.Announcement.create({
    title: 'Platform Milestone: 100+ Hours Exchanged 🎉',
    body: 'Our peer-learning community has officially surpassed 100 hours of knowledge exchanged across 8 different categories.',
    createdBy: admin._id,
    createdAt: days(-1),
  });

  // 7. Reports (Open, Resolved, Dismissed)
  // Open reports
  await m.Report.create({
    reporter: ken._id,
    targetType: 'post',
    targetId: q._id,
    reason: 'spam',
    details: 'Third party promotional referral links detected in comments.',
    status: 'open',
    createdAt: days(-2),
  });

  await m.Report.create({
    reporter: sara._id,
    targetType: 'skill',
    targetId: figma._id,
    reason: 'inappropriate',
    details: 'External payment requested outside the platform escrow system.',
    status: 'open',
    createdAt: days(-1),
  });

  await m.Report.create({
    reporter: priya._id,
    targetType: 'user',
    targetId: marcus._id,
    reason: 'harassment',
    details: 'Repeated unannounced cancellations and unprofessional conduct during session chat.',
    status: 'open',
    createdAt: days(-1),
  });

  // Resolved reports
  await m.Report.create({
    reporter: lucia._id,
    targetType: 'user',
    targetId: spammer._id,
    reason: 'spam',
    details: 'Automated spam account posting commercial crypto services.',
    status: 'resolved',
    action: 'user_banned',
    resolvedBy: admin._id,
    resolutionNote: 'Confirmed automated spam bot; account banned.',
    resolvedAt: days(-7),
    createdAt: days(-8),
  });

  await m.Report.create({
    reporter: ken._id,
    targetType: 'user',
    targetId: marcus._id,
    reason: 'other',
    details: 'Chronic attendance issues and ghosting scheduled meetings.',
    status: 'resolved',
    action: 'user_suspended',
    resolvedBy: mod._id,
    resolutionNote: 'Account suspended for 7 days per community policy.',
    resolvedAt: days(-4),
    createdAt: days(-5),
  });

  // Dismissed report
  await m.Report.create({
    reporter: arjun._id,
    targetType: 'skill',
    targetId: py._id,
    reason: 'other',
    details: 'Price inquiry clarification.',
    status: 'dismissed',
    action: 'none',
    resolvedBy: mod._id,
    resolutionNote: 'Listing adheres to community guidelines and fair pricing policies.',
    resolvedAt: days(-3),
    createdAt: days(-3),
  });

  // 8. Audit Logs
  await m.AuditLog.create({ actor: admin._id, action: 'skill.verified', targetType: 'skill', targetId: py._id, meta: { note: 'Verified via GitHub open-source portfolio' }, createdAt: days(-15) });
  await m.AuditLog.create({ actor: mod._id, action: 'assessment.published', targetType: 'assessment', targetId: js._id, meta: { title: 'Python Fundamentals' }, createdAt: days(-13) });
  await m.AuditLog.create({ actor: admin._id, action: 'announcement.create', targetType: 'announcement', meta: { title: 'Community Skill Fair this Saturday' }, createdAt: days(-10) });
  await m.AuditLog.create({ actor: admin._id, action: 'user.banned', targetType: 'user', targetId: spammer._id, meta: { reason: 'Automated spam network' }, createdAt: days(-7) });
  await m.AuditLog.create({ actor: mod._id, action: 'report.resolved', targetType: 'user', targetId: spammer._id, meta: { action: 'user_banned' }, createdAt: days(-7) });
  await m.AuditLog.create({ actor: mod._id, action: 'user.suspended', targetType: 'user', targetId: marcus._id, meta: { days: 7, reason: 'Repeated unexcused cancellations' }, createdAt: days(-4) });
  await m.AuditLog.create({ actor: admin._id, action: 'announcement.create', targetType: 'announcement', meta: { title: 'New Feature: AI Learning Roadmaps' }, createdAt: days(-4) });
  await m.AuditLog.create({ actor: admin._id, action: 'credits.adjust', targetType: 'user', targetId: priya._id, meta: { amount: 10, reason: 'Top Mentor Award for community teaching' }, createdAt: days(-3) });
  await m.AuditLog.create({ actor: mod._id, action: 'report.dismissed', targetType: 'skill', targetId: py._id, meta: { action: 'none', note: 'No violation found' }, createdAt: days(-3) });
  await m.AuditLog.create({ actor: admin._id, action: 'announcement.create', targetType: 'announcement', meta: { title: 'Platform Milestone: 100+ Hours' }, createdAt: days(-1) });

  await m.Notification.create({
    user: priya._id,
    type: 'session',
    title: 'Upcoming guitar session with Arjun Mehta',
    link: `/exchanges/${active._id}`,
    createdAt: days(-1),
  });

  console.log('Seeded. Log in with any of these (password: password123):');
  ['admin@skillswap.dev', 'mod@skillswap.dev', 'priya@skillswap.dev', 'arjun@skillswap.dev', 'lucia@skillswap.dev', 'ken@skillswap.dev', 'sara@skillswap.dev', 'david@skillswap.dev', 'elena@skillswap.dev'].forEach((e) => console.log('  ', e));
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
