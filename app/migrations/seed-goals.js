#!/usr/bin/env node
/**
 * Seed goals and projects from existing journal plan entries.
 * Run after 002_goals_hierarchy.sql migration.
 *
 * Usage: node app/migrations/seed-goals.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://matthewsteele@localhost/entries' });

// ─── Goals ──────────────────────────────────────────────────────────────────

const GOALS = [
  {
    id: 'goal-financial-independence',
    title: 'Financial Independence',
    description: 'Build multiple income streams, investment portfolio, and financial security independent of employment.',
    horizon: '5yr',
    status: 'active',
    context: 'projects',
    weight: 8,
    sort_order: 1,
  },
  {
    id: 'goal-intellectual-community',
    title: 'Intellectual Community',
    description: 'Build an intellectual community through writing, podcasting, and content that attracts thinkers rather than followers.',
    horizon: '3yr',
    status: 'active',
    context: 'projects',
    weight: 6,
    sort_order: 2,
  },
  {
    id: 'goal-cultivo-career',
    title: 'Cultivo Career',
    description: 'Become indispensable at Cultivo, operate as de facto CTO, potentially secure equity.',
    horizon: '1yr',
    status: 'active',
    context: 'cultivo',
    weight: 7,
    sort_order: 3,
  },
  {
    id: 'goal-life-in-brazil',
    title: 'Life in Brazil',
    description: 'Establish a fulfilling life in Brazil — geographic strategy, living situation, social connections, and long-term base for entrepreneurship.',
    horizon: '3yr',
    status: 'active',
    context: 'personal',
    weight: 5,
    sort_order: 4,
  },
  {
    id: 'goal-life-infrastructure',
    title: 'Life Infrastructure',
    description: 'Build personal systems for productivity, health tracking, knowledge management, and daily optimization.',
    horizon: '3yr',
    status: 'active',
    context: 'personal',
    weight: 4,
    sort_order: 5,
  },
  {
    id: 'goal-ai-entrepreneurship',
    title: 'AI Entrepreneurship',
    description: 'Build AI-powered products and platforms — startups, SaaS, community tools.',
    horizon: '5yr',
    status: 'active',
    context: 'projects',
    weight: 6,
    sort_order: 6,
  },
];

// ─── Projects (mapped from journal plan entries) ────────────────────────────

const PROJECTS = [
  // Financial Independence
  {
    id: 'proj-solar-geo',
    title: 'Solar Investment Geospatial Product',
    journal_id: '68c26a45-ede2-418f-b125-70b344f1514b',
    goal_id: 'goal-financial-independence',
    status: 'active',
    context: 'projects',
    weight: 9,
    horizon: 'now',
    impact_score: 5,
  },
  {
    id: 'proj-financial-ai',
    title: 'Financial Analysis AI / Trading System',
    journal_id: '079df8fb-fcaf-4fa3-98b9-2877e1614ec1',
    goal_id: 'goal-financial-independence',
    status: 'active',
    context: 'projects',
    weight: 5,
    horizon: 'soon',
    impact_score: 3,
  },
  {
    id: 'proj-family-office',
    title: 'Family Office for Middle-Class Families',
    journal_id: '6343a3df-d560-42de-9867-40888e471ab9',
    goal_id: 'goal-financial-independence',
    status: 'dormant',
    context: 'projects',
    weight: 3,
    horizon: 'someday',
    impact_score: 2,
  },
  {
    id: 'proj-property',
    title: 'Property Purchase Strategy',
    journal_id: '00359880-ff56-4443-b86e-c85fb3f687ff',
    goal_id: 'goal-financial-independence',
    status: 'dormant',
    context: 'personal',
    weight: 2,
    horizon: 'someday',
    impact_score: 2,
  },

  // Intellectual Community
  {
    id: 'proj-substack',
    title: 'Substack Intellectual Community',
    journal_id: 'f431a31d-485b-42d9-8f67-4a9c60c1e1ed',
    goal_id: 'goal-intellectual-community',
    status: 'active',
    context: 'projects',
    weight: 7,
    horizon: 'now',
    impact_score: 4,
  },
  {
    id: 'proj-podcast',
    title: 'Political/Cultural Podcast with Fernando',
    journal_id: '762f62ef-26a6-4bb2-a313-3953433a61a9',
    goal_id: 'goal-intellectual-community',
    status: 'active',
    context: 'projects',
    weight: 4,
    horizon: 'soon',
    impact_score: 3,
  },
  {
    id: 'proj-paradox-series',
    title: 'Paradox Series — Short-Form Content',
    journal_id: 'a05f56ff-63ba-41f7-856e-cfd865d362a2',
    goal_id: 'goal-intellectual-community',
    status: 'active',
    context: 'projects',
    weight: 3,
    horizon: 'soon',
    impact_score: 2,
  },

  // Cultivo Career
  {
    id: 'proj-cultivo-performance',
    title: 'Cultivo Performance and Job Security',
    journal_id: '6fbad2eb-0aba-4882-bbde-85eea2cc91c5',
    goal_id: 'goal-cultivo-career',
    status: 'active',
    context: 'cultivo',
    weight: 8,
    horizon: 'now',
    impact_score: 5,
  },

  // Life in Brazil
  {
    id: 'proj-geo-strategy',
    title: 'Long-Term Geographic Strategy',
    journal_id: '8d2ee238-4bf2-409f-a46a-f88c261b2b3b',
    goal_id: 'goal-life-in-brazil',
    status: 'active',
    context: 'personal',
    weight: 4,
    horizon: 'soon',
    impact_score: 3,
  },
  {
    id: 'proj-social-strategy',
    title: 'Two-Month Annual Social Strategy',
    journal_id: '75c6e4ea-4038-496b-956d-a76b4a1eb741',
    goal_id: 'goal-life-in-brazil',
    status: 'active',
    context: 'personal',
    weight: 3,
    horizon: 'soon',
    impact_score: 2,
  },
  {
    id: 'proj-sharing-spaces',
    title: 'Sharing Spaces / Community Fund Platform',
    journal_id: '10f5f21e-80d2-4db8-837c-4bf76e59a2c1',
    goal_id: 'goal-life-in-brazil',
    status: 'dormant',
    context: 'projects',
    weight: 2,
    horizon: 'someday',
    impact_score: 2,
  },

  // Life Infrastructure (completed projects still tracked)
  {
    id: 'proj-life-system',
    title: 'Life Planning System Architecture',
    journal_id: '10978b6c-1615-4f47-8c25-07850cc93994',
    goal_id: 'goal-life-infrastructure',
    status: 'completed',
    context: 'projects',
    weight: 3,
    horizon: 'now',
    impact_score: 4,
  },
  {
    id: 'proj-rag-system',
    title: 'RAG System with PGVector',
    journal_id: '93815a02-4402-4f34-87ff-4b4a26bccbd1',
    goal_id: 'goal-life-infrastructure',
    status: 'completed',
    context: 'personal',
    weight: 2,
    horizon: 'now',
    impact_score: 3,
  },
  {
    id: 'proj-fitness-tracking',
    title: 'Fitness Tracking with RAG',
    journal_id: '2c1f29c8-bd75-48b4-8f50-87cfade7ff81',
    goal_id: 'goal-life-infrastructure',
    status: 'completed',
    context: 'personal',
    weight: 2,
    horizon: 'now',
    impact_score: 2,
  },

  // AI Entrepreneurship
  {
    id: 'proj-ai-startup',
    title: 'AI Startup Hiring and Business Development',
    journal_id: 'f98fc8a7-d0f1-4592-902a-855e30c7684a',
    goal_id: 'goal-ai-entrepreneurship',
    status: 'dormant',
    context: 'projects',
    weight: 4,
    horizon: 'someday',
    impact_score: 3,
  },
  {
    id: 'proj-community-land-trust',
    title: 'Community Land Trust Platform',
    journal_id: 'f95419ac-fa0a-4487-92c7-bf427e6ca7e6',
    goal_id: 'goal-ai-entrepreneurship',
    status: 'dormant',
    context: 'projects',
    weight: 3,
    horizon: 'someday',
    impact_score: 2,
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert goals
    for (const g of GOALS) {
      await client.query(
        `INSERT INTO goals (id, title, description, horizon, status, context, weight, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description,
           horizon = EXCLUDED.horizon, status = EXCLUDED.status,
           context = EXCLUDED.context, weight = EXCLUDED.weight, sort_order = EXCLUDED.sort_order`,
        [g.id, g.title, g.description, g.horizon, g.status, g.context, g.weight, g.sort_order]
      );
    }
    console.log(`✅ Seeded ${GOALS.length} goals`);

    // Insert projects into plans table
    for (const p of PROJECTS) {
      await client.query(
        `INSERT INTO plans (id, title, name, journal_id, goal_id, status, context, weight, horizon, impact_score)
         VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title, name = EXCLUDED.name, journal_id = EXCLUDED.journal_id,
           goal_id = EXCLUDED.goal_id, status = EXCLUDED.status, context = EXCLUDED.context,
           weight = EXCLUDED.weight, horizon = EXCLUDED.horizon, impact_score = EXCLUDED.impact_score`,
        [p.id, p.title, p.journal_id, p.goal_id, p.status, p.context, p.weight, p.horizon, p.impact_score]
      );
    }
    console.log(`✅ Seeded ${PROJECTS.length} projects into plans table`);

    await client.query('COMMIT');
    console.log('\n🎯 Seeding complete!');
    console.log(`   ${GOALS.length} goals`);
    console.log(`   ${PROJECTS.length} projects`);
    console.log(`   ${PROJECTS.filter(p => p.status === 'active').length} active, ${PROJECTS.filter(p => p.status === 'dormant').length} dormant, ${PROJECTS.filter(p => p.status === 'completed').length} completed`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
