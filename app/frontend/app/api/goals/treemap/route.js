import { NextResponse } from 'next/server';
import { Pool } from 'pg';
export const dynamic = 'force-dynamic';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * GET /api/goals/treemap — full hierarchy shaped for d3-treemap.
 *
 * Returns:
 * {
 *   name: "root",
 *   children: [
 *     {
 *       id, name, weight, status, horizon, context, description,
 *       project_count, active_project_count,
 *       children: [
 *         {
 *           id, name, weight, status, horizon, impact_score, context,
 *           journal_id, next_action, last_reviewed,
 *           epic_count, action_count, completed_action_count,
 *           children: [
 *             { id, name, status, sort_order, target_date, action_count, completed_action_count,
 *               children: [{ id, name, status, estimated_minutes }] }
 *           ]
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export async function GET() {
  try {
    // Fetch all data in parallel
    const [goalsRes, projectsRes, epicsRes, actionsRes] = await Promise.all([
      pool.query('SELECT * FROM goals ORDER BY sort_order'),
      pool.query('SELECT * FROM plans ORDER BY weight DESC NULLS LAST, title'),
      pool.query('SELECT * FROM epics ORDER BY sort_order, created_at'),
      pool.query('SELECT * FROM actions ORDER BY sort_order, created_at'),
    ]);

    const goals = goalsRes.rows;
    const projects = projectsRes.rows;
    const epics = epicsRes.rows;
    const actions = actionsRes.rows;

    // Index epics by project_id
    const epicsByProject = {};
    for (const e of epics) {
      if (!epicsByProject[e.project_id]) epicsByProject[e.project_id] = [];
      epicsByProject[e.project_id].push(e);
    }

    // Index actions by epic_id and project_id
    const actionsByEpic = {};
    const actionsByProject = {};
    for (const a of actions) {
      if (a.epic_id) {
        if (!actionsByEpic[a.epic_id]) actionsByEpic[a.epic_id] = [];
        actionsByEpic[a.epic_id].push(a);
      }
      if (!actionsByProject[a.project_id]) actionsByProject[a.project_id] = [];
      actionsByProject[a.project_id].push(a);
    }

    // Build tree
    const tree = {
      name: 'root',
      children: goals.map(g => {
        const goalProjects = projects.filter(p => p.goal_id === g.id);
        return {
          id: g.id,
          name: g.title,
          type: 'goal',
          weight: g.weight,
          status: g.status,
          horizon: g.horizon,
          context: g.context,
          description: g.description,
          sort_order: g.sort_order,
          weekly_target_minutes: g.weekly_target_minutes || 0,
          project_count: goalProjects.length,
          active_project_count: goalProjects.filter(p => p.status === 'active').length,
          children: goalProjects.map(p => {
            const projEpics = epicsByProject[p.id] || [];
            const projActions = actionsByProject[p.id] || [];
            const completedActions = projActions.filter(a => a.status === 'completed').length;
            return {
              id: p.id,
              name: p.title || p.name,
              type: 'project',
              weight: p.weight || 5,
              status: p.status,
              horizon: p.horizon,
              impact_score: p.impact_score,
              context: p.context,
              journal_id: p.journal_id,
              folder_path: p.folder_path || null,
              weekly_target_minutes: p.weekly_target_minutes || 0,
              next_action: p.next_action,
              last_reviewed: p.last_reviewed,
              epic_count: projEpics.length,
              action_count: projActions.length,
              completed_action_count: completedActions,
              children: projEpics.map(e => {
                const epicActions = actionsByEpic[e.id] || [];
                const epicCompleted = epicActions.filter(a => a.status === 'completed').length;
                // Context inheritance: epic.context ?? project.context ?? goal.context
                const epicContext = e.context || p.context || g.context;
                return {
                  id: e.id,
                  name: e.title,
                  type: 'epic',
                  weight: e.weight || 5,
                  status: e.status,
                  context: epicContext,
                  project_id: p.id,
                  goal_id: g.id,
                  sort_order: e.sort_order,
                  target_date: e.target_date,
                  description: e.description,
                  action_count: epicActions.length,
                  completed_action_count: epicCompleted,
                  children: epicActions.map(a => ({
                    id: a.id,
                    name: a.title,
                    type: 'action',
                    weight: a.weight || 5,
                    status: a.status,
                    // Context inheritance: action.context ?? epic.context ?? project.context ?? goal.context
                    context: a.context || epicContext,
                    estimated_minutes: a.estimated_minutes,
                    sort_order: a.sort_order,
                  })),
                };
              }),
            };
          }),
        };
      }),
    };

    return NextResponse.json(tree);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
