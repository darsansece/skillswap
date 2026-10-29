/**
 * AI Learning Assistant + recommendation engine.
 * - Recommendations are computed with a transparent content-based scoring model (works offline).
 * - The chat assistant and learning-path generator use the Anthropic Messages API when
 *   ANTHROPIC_API_KEY is set, and provide a rich, intelligent fallback assistant otherwise.
 */
const { Skill, User, Assessment } = require('../models');

const tokenize = (s = '') => String(s).toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length > 1);
const overlap = (a, b) => { const B = new Set(b); return a.filter((w) => B.has(w)).length; };

async function recommendSkills(user, limit = 10) {
  const wanted = (user.skillsWanted || []);
  const wantedTokens = wanted.flatMap((w) => tokenize(w.name));
  const wantedCats = new Set(wanted.map((w) => w.category).filter(Boolean));
  const interestTokens = (user.interests || []).flatMap(tokenize);
  const mySkills = await Skill.find({ owner: user._id, status: 'active' }).select('title tags');
  const myOfferTokens = mySkills.flatMap((s) => [...tokenize(s.title), ...s.tags]);

  const candidates = await Skill.find({ owner: { $ne: user._id }, status: 'active' })
    .populate('owner', 'name avatar skillsWanted stats level status').limit(500);

  const scored = candidates.filter((s) => s.owner && s.owner.status === 'active').map((s) => {
    const reasons = [];
    let score = 0;
    const sTokens = [...tokenize(s.title), ...s.tags, ...tokenize(s.category)];
    const m = overlap(wantedTokens, sTokens);
    if (m) { score += 40 + 10 * (m - 1); reasons.push('Matches a skill you want to learn'); }
    if (wantedCats.has(s.category)) { score += 15; reasons.push(`In your wanted category: ${s.category}`); }
    const im = overlap(interestTokens, sTokens);
    if (im) { score += 8 * im; reasons.push('Related to your interests'); }
    const ownerWants = (s.owner.skillsWanted || []).flatMap((w) => tokenize(w.name));
    if (s.acceptsSwap && overlap(ownerWants, myOfferTokens)) { score += 25; reasons.push('Swap match: they want a skill you teach'); }
    if (s.verification && s.verification.status === 'verified') { score += 10; reasons.push('Verified skill'); }
    score += (s.rating || 0) * 4 + Math.min(s.sessionsCompleted, 20);
    if (s.creditsPerHour > user.credits && !s.acceptsSwap) score -= 15;
    return { skill: s, score: Math.round(score), reasons };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

async function recommendPeople(user, limit = 8) {
  const mySkills = await Skill.find({ owner: user._id, status: 'active' }).select('title tags');
  const myOfferTokens = mySkills.flatMap((s) => [...tokenize(s.title), ...s.tags]);
  const wantedTokens = (user.skillsWanted || []).flatMap((w) => tokenize(w.name));
  const others = await User.find({ _id: { $ne: user._id }, status: 'active' }).select('name avatar headline skillsWanted stats level').limit(500);
  const otherSkills = await Skill.find({ owner: { $in: others.map((o) => o._id) }, status: 'active' }).select('owner title tags');
  const byOwner = {};
  otherSkills.forEach((s) => { (byOwner[s.owner] = byOwner[s.owner] || []).push(s); });
  return others.map((o) => {
    const theyOffer = (byOwner[o._id] || []).flatMap((s) => [...tokenize(s.title), ...s.tags]);
    const theyWant = (o.skillsWanted || []).flatMap((w) => tokenize(w.name));
    const canTeachMe = overlap(wantedTokens, theyOffer);
    const iCanTeach = overlap(theyWant, myOfferTokens);
    const score = canTeachMe * 30 + iCanTeach * 30 + (canTeachMe && iCanTeach ? 40 : 0) + (o.rating || 0) * 2;
    return { user: o, score, mutual: !!(canTeachMe && iCanTeach), canTeachMe: !!canTeachMe, iCanTeach: !!iCanTeach };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

async function callClaude(system, messages, maxTokens = 1000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) throw new Error(`AI provider error ${res.status}`);
  const data = await res.json();
  return data.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
}

// Curated specialized learning roadmaps
const CURATED_PATHS = {
  python: [
    { stage: 'beginner', title: 'Python Syntax, Variables, Control Flow & Functions' },
    { stage: 'beginner', title: 'Data Structures: Lists, Dictionaries, Sets & Tuples' },
    { stage: 'beginner', title: 'File Handling, JSON parsing & Virtual Environments' },
    { stage: 'intermediate', title: 'Data Analysis with Pandas DataFrames & NumPy Arrays' },
    { stage: 'intermediate', title: 'Data Visualizations with Matplotlib and Seaborn' },
    { stage: 'intermediate', title: 'Book a 1-on-1 session with a SkillSwap Python mentor for code review' },
    { stage: 'advanced', title: 'Build an end-to-end Automated Analysis or REST API project' },
    { stage: 'advanced', title: 'Take the Python Fundamentals Certification Assessment on SkillSwap' },
  ],
  guitar: [
    { stage: 'beginner', title: 'Acoustic Guitar Anatomy, Tuning, and Left-Hand Finger Mechanics' },
    { stage: 'beginner', title: 'Master 5 Open Chords (C, G, D, Em, Am) and Clean Strumming' },
    { stage: 'beginner', title: 'Smooth Chord Transitions & 4/4 Steady Rhythm Practice' },
    { stage: 'intermediate', title: 'Learn Your First 3 Full Songs and Strumming Dynamics' },
    { stage: 'intermediate', title: '1-on-1 Practice Session with a SkillSwap Guitarist on Capo & Timing' },
    { stage: 'intermediate', title: 'Introduction to Major Scales, Barre Chords (F Major), and Fingerpicking' },
    { stage: 'advanced', title: 'Record a Clean Full Acoustic Performance or Improvise Solo Patterns' },
    { stage: 'advanced', title: 'Pass the Acoustic Guitar Basics Certification on SkillSwap' },
  ],
  spanish: [
    { stage: 'beginner', title: 'Pronunciation Rules, Essential Greetings, and Numbers' },
    { stage: 'beginner', title: 'Present Tense Regular and Irregular Verbs (Ser, Estar, Tener, Ir)' },
    { stage: 'beginner', title: 'Daily Conversational Phrases and Asking Questions' },
    { stage: 'intermediate', title: 'Past Tenses Mastery: Pretérito Indefinido vs Pretérito Imperfecto' },
    { stage: 'intermediate', title: 'Live 1-on-1 Conversation Practice with a Native Spanish Speaker' },
    { stage: 'intermediate', title: 'Subjunctive Mood Triggers & Natural Idiomatic Expressions' },
    { stage: 'advanced', title: 'Engage in a 30-minute Fluency Discussion on Culture or News' },
    { stage: 'advanced', title: 'Take the Spanish Language & Subjunctive Assessment on SkillSwap' },
  ],
  sourdough: [
    { stage: 'beginner', title: 'Building and Maintaining a Healthy Wild Yeast Sourdough Starter' },
    { stage: 'beginner', title: 'Understanding Flour Protein, Hydration Percentages, and Salt Ratios' },
    { stage: 'beginner', title: 'Autolyse, Bulk Fermentation, and Stretch-and-Fold Techniques' },
    { stage: 'intermediate', title: 'Dough Pre-Shaping, Bench Rest, and Final Banneton Shaping' },
    { stage: 'intermediate', title: 'Live Baking Troubleshooting Session with a Mentor on Oven Spring' },
    { stage: 'intermediate', title: 'Scoring Patterns and Dutch Oven Steam Management' },
    { stage: 'advanced', title: 'Bake an Open-Crumb Artisanal Sourdough Loaf with Blended Flours' },
  ],
  figma: [
    { stage: 'beginner', title: 'Figma Workspace, Vector Tools, Frames, and Layout Grids' },
    { stage: 'beginner', title: 'Typography Hierarchies, Color Styles, and Component Primitives' },
    { stage: 'beginner', title: 'Auto Layout Deep Dive: Padding, Spacing, and Responsive Stacks' },
    { stage: 'intermediate', title: 'Component Variants, Properties, and Interactive Micro-States' },
    { stage: 'intermediate', title: 'Portfolio Review Session with a Senior Product Designer' },
    { stage: 'intermediate', title: 'Building a Cohesive Multi-Screen Mobile App Prototype' },
    { stage: 'advanced', title: 'Create a Comprehensive Reusable Design System with Tokens' },
  ],
  react: [
    { stage: 'beginner', title: 'Modern JavaScript (ES6+): Destructuring, Modules, and Array Methods' },
    { stage: 'beginner', title: 'React JSX, Props, State with useState, and Component Hierarchy' },
    { stage: 'beginner', title: 'Side Effects and Data Fetching with useEffect' },
    { stage: 'intermediate', title: 'Custom Hooks, Context API, and Client-Side Routing' },
    { stage: 'intermediate', title: 'Mentor Code Review on Performance Optimization (useMemo, memo)' },
    { stage: 'intermediate', title: 'Full-Stack Integration with RESTful APIs and Error Boundaries' },
    { stage: 'advanced', title: 'Deploy a Responsive Full-Stack React Application' },
    { stage: 'advanced', title: 'Pass the React & Modern Frontend Assessment on SkillSwap' },
  ],
};

function fallbackPath(skillName, currentLevel = 'beginner') {
  const norm = skillName.toLowerCase().trim();
  const key = Object.keys(CURATED_PATHS).find((k) => norm.includes(k));
  let steps;
  if (key) {
    steps = CURATED_PATHS[key];
  } else {
    steps = [
      { stage: 'beginner', title: `Core Concepts & Foundational Terminology in ${skillName}` },
      { stage: 'beginner', title: `Environment Setup, Tooling & Your First Practical Exercise` },
      { stage: 'beginner', title: `Guided Practice: Complete 3 Small Beginner Workouts` },
      { stage: 'intermediate', title: `Book a 1-on-1 Practice & Feedback Session with a Mentor` },
      { stage: 'intermediate', title: `Solve Real-World Practical Problems and Study Common Pitfalls` },
      { stage: 'intermediate', title: `Build an Independent Applied Project Demonstrating Competency` },
      { stage: 'advanced', title: `Conduct a Comprehensive Review and Refinement with an Expert` },
      { stage: 'advanced', title: `Take the Skill Certification Assessment on SkillSwap` },
    ];
  }

  const order = ['beginner', 'intermediate', 'advanced'];
  const start = Math.max(0, order.indexOf(currentLevel || 'beginner'));
  const filtered = steps.filter((s) => order.indexOf(s.stage) >= start);
  const finalSteps = filtered.length >= 6 ? filtered : steps;

  return {
    skillName,
    source: 'rule-based',
    steps: finalSteps,
    weeklyHours: 4,
    estimatedWeeks: Math.round(finalSteps.length * 1.5),
  };
}

async function learningPath(user, skillName, currentLevel) {
  const safeRegex = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentors = await Skill.find({
    status: 'active',
    owner: { $ne: user._id },
    $or: [{ title: { $regex: safeRegex, $options: 'i' } }, { tags: skillName.toLowerCase() }],
  }).populate('owner', 'name avatar level stats').limit(5);

  const assessments = await Assessment.find({
    status: 'published',
    $or: [{ skillName: { $regex: safeRegex, $options: 'i' } }, { category: { $regex: safeRegex, $options: 'i' } }],
  }).select('title level passingScore skillName').limit(5);

  let plan = fallbackPath(skillName, currentLevel);
  try {
    const text = await callClaude(
      'You design concise learning paths. Respond ONLY with JSON: {"steps":[{"stage":"beginner|intermediate|advanced","title":"..."}],"weeklyHours":number,"estimatedWeeks":number}. 6-9 steps.',
      [{ role: 'user', content: `Skill: ${skillName}. Current level: ${currentLevel || 'beginner'}. Learner interests: ${(user.interests || []).join(', ') || 'n/a'}.` }],
    );
    if (text) {
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed.steps) && parsed.steps.length >= 6) {
        plan = { skillName, source: 'ai', ...parsed };
      }
    }
  } catch (e) {
    /* keep robust rule-based fallback */
  }

  return { ...plan, mentors, assessments };
}

async function ruleBasedReply(message, ctx, user) {
  const m = message.toLowerCase().trim();

  // 1. Credits & Wallet
  if (/credit|wallet|balance/.test(m)) {
    return `You have ${ctx.credits} credits available in your wallet. You earn credits by teaching sessions (1 credit per hour at your listed rate), and spend them when booking learning sessions with mentors. Direct skill swaps let you trade knowledge without spending any credits.`;
  }

  // 2. Recommendations & Mentors
  if (/recommend|suggest|what should i learn|match|who should i learn from/.test(m)) {
    if (ctx.recs && ctx.recs.length > 0) {
      const list = ctx.recs.map((r) => `• **${r.skill.title}** taught by **${r.skill.owner?.name || 'Community Mentor'}** (${r.reasons[0] || 'Popular skill'})`).join('\n');
      return `Based on your profile and skills wanted, here are top recommended matches for you:\n${list}\n\nYou can view details and request an exchange directly from the Marketplace!`;
    }
    return 'Add a few skills you want to learn on your profile (under Profile > Skills Wanted) and I will automatically match you with top community mentors.';
  }

  // 3. Leveling & Gamification
  if (/badge|level|points|xp|streak|rank|leaderboard/.test(m)) {
    return `You are currently level ${ctx.level} with ${ctx.points} points and a login streak of ${user?.loginStreak || 1} day(s). You earn XP points through:\n• Teaching an exchange session (+50 points)\n• Learning a new skill (+20 points)\n• Leaving a session review (+10 points)\n• Having an answer accepted in the forum (+25 points)\n• Daily login streaks (+5 points/day)`;
  }

  // 4. Greetings & Introduction
  if (/^(hi|hello|hey|greetings|good (morning|afternoon|evening)|howdy)\b/i.test(m)) {
    const name = user?.name ? ` ${user.name.split(' ')[0]}` : '';
    return `Hello${name}! 👋 I'm your SkillSwap learning assistant. I can help you:\n• Find top mentors for any skill (e.g. Python, Guitar, Spanish, Sourdough, Figma, Yoga)\n• Build a personalized learning roadmap with milestones\n• Check your credit balance (${ctx.credits} credits) and explain skill swaps\n• Guide you on taking skill assessments and earning verifiable certificates\n\nWhat would you like to learn or teach today?`;
  }

  // 5. How SkillSwap Works / Getting Started
  if (/how (does )?(this|it|skillswap) work|getting started|how to start|what is skillswap/i.test(m)) {
    return `SkillSwap is a community skill exchange platform where members teach what they know and learn what they want:\n1. **Time Credits**: Teach 1 hour to earn credits at your rate. Spend your credits learning from other mentors.\n2. **Direct Swaps**: If member A wants what you teach and teaches what you want, you can swap skills directly with zero credits!\n3. **Scheduled Sessions**: Propose meeting times, track progress, share live notes, and confirm completed sessions.\n4. **Certifications**: Validate your knowledge by taking timed assessments and earning public verified certificates.`;
  }

  // 6. Direct Skill Swaps
  if (/swap|direct swap|skill swap|trade skills/i.test(m)) {
    return `Skill Swaps let you trade knowledge directly without spending credits! When requesting an exchange, select "Skill Swap" instead of "Credits" and pick one of your active skills to offer in return. If the mentor accepts, you both take turns teaching each other.`;
  }

  // 7. Booking & Scheduling Sessions
  if (/session|book|schedule|meeting|how to book|how to schedule/i.test(m)) {
    return `To book a session:\n1. Find a skill in the **Marketplace** and click **Request Exchange**.\n2. Choose either **Credit Exchange** or **Direct Skill Swap**.\n3. Once the mentor accepts, open the exchange page to propose date and time slots.\n4. When the session finishes, both learner and mentor click "Confirm Session" to release credits from escrow and leave reviews.`;
  }

  // 8. Assessments & Certifications
  if (/certif|assessment|test|quiz|exam|verify certificate/i.test(m)) {
    return `You can earn official SkillSwap Certificates in the **Learn** section:\n• Choose an assessment (e.g., Python Fundamentals or Guitar Theory Basics)\n• Complete the timed multiple-choice questions (passing score is usually 60–75%)\n• Once passed, a certificate with a unique public verification code is issued and displayed on your public profile!`;
  }

  // 9. Teaching & Mentoring
  if (/how to teach|become a mentor|list a skill|my skills|offer skill/i.test(m)) {
    return `To teach a skill:\n1. Go to **My Skills** in the menu and click **Offer a Skill**.\n2. Set your skill title, category, level, hourly rate in credits, and whether you accept direct swaps.\n3. Add your portfolio links or credentials to request a **Verified Skill** badge from our moderation team!\n4. When members request sessions, accept their requests to start earning credits.`;
  }

  // 10. Verification Questions
  if (/verify|verification|badge/i.test(m)) {
    return `Skill verification gives your listings a verified trust badge. To get verified:\n1. Open your skill in **My Skills**.\n2. Click **Request Verification** and paste a link to your portfolio, GitHub, certifications, or past work.\n3. Our moderation team reviews the evidence and approves verified status!`;
  }

  // 11. Forum & Community
  if (/forum|community|ask question|discussion/i.test(m)) {
    return `The **Community Forum** is where members ask questions, share tutorials, and discuss learning strategies. You can post questions with tags, upvote helpful answers, and earn reputation points when your answer is accepted!`;
  }

  // 12. Dynamic Skill Search (e.g. Python, Guitar, Spanish, React, Baking, Design, etc.)
  const keywords = ['python', 'guitar', 'spanish', 'baking', 'sourdough', 'figma', 'design', 'react', 'javascript', 'yoga', 'cooking', 'statistics', 'math', 'fitness'];
  const matchedKw = keywords.find((k) => m.includes(k));
  if (matchedKw) {
    try {
      const skills = await Skill.find({
        status: 'active',
        $or: [{ title: { $regex: matchedKw, $options: 'i' } }, { tags: matchedKw }],
      }).populate('owner', 'name rating level').limit(3);

      if (skills.length > 0) {
        const skillList = skills.map((s) => `• **${s.title}** by **${s.owner?.name}** (${s.creditsPerHour} credits/hr, ⭐ ${s.rating || 5.0})`).join('\n');
        return `We have great mentors ready to teach **${matchedKw.toUpperCase()}** on SkillSwap:\n${skillList}\n\nYou can head over to the **Marketplace** to request a session, or visit the **Learning Path** tab to see a step-by-step roadmap for ${matchedKw}!`;
      }
    } catch (err) {
      /* continue to fallback */
    }
  }

  // 13. Learning Path / Roadmap Query
  if (/how.*(learn|start|improve)|path|roadmap|plan|curriculum/i.test(m)) {
    return 'Try the **Learning Path** generator tab right here in the Assistant! Enter any skill name and your current level to get a structured 8-stage roadmap with suggested mentors, recommended milestones, and official assessments.';
  }

  // Default intelligent assistant reply
  return `I'm your SkillSwap learning assistant. You can ask me:\n• To recommend mentors for specific skills (e.g. Python, Guitar, Spanish, Sourdough, Figma, Yoga)\n• How credits (${ctx.credits} balance), escrow, and direct skill swaps work\n• How to schedule exchange sessions and earn badges\n• How to take skill assessments and earn verified certificates\n\nWhat would you like to explore?`;
}

async function chat(user, message, history = []) {
  const recs = await recommendSkills(user, 3);
  const ctx = { credits: user.credits, level: user.level, points: user.points, recs };
  const system = `You are the learning assistant for a community skill-exchange platform where members teach and learn from each other using time-based credits or direct skill swaps. Be concise, warm, practical.
Member: ${user.name}. Level ${user.level}, ${user.points} points, ${user.credits} credits.
Wants to learn: ${(user.skillsWanted || []).map((w) => w.name).join(', ') || 'not set'}.
Top platform matches: ${recs.map((r) => `${r.skill.title} by ${r.skill.owner?.name || 'Mentor'}`).join('; ') || 'none yet'}.`;

  try {
    const msgs = [
      ...history.slice(-10).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 4000) })),
      { role: 'user', content: message },
    ];
    const text = await callClaude(system, msgs);
    if (text) return { reply: text, source: 'ai' };
  } catch (e) {
    /* fall back */
  }

  const reply = await ruleBasedReply(message, ctx, user);
  return { reply, source: 'rule-based' };
}

module.exports = { recommendSkills, recommendPeople, learningPath, chat, tokenize };
