import { useState, useMemo } from 'react';
import Header from '../components/Header/Header';
import './TasksPage.css';

interface Task {
  id: number;
  title: string;
  meeting: string;
  assignee: string;
  due: string;
  priority: 'High' | 'Medium' | 'Low';
  tag: string;
  status: 'To Do' | 'In Progress' | 'Done';
}

const MOCK_TASKS: Task[] = [
  { id: 1,  title: 'Project description',     meeting: 'Planning Mingo Project', assignee: 'Liron Dabach',  due: '30.12.25', priority: 'High',   tag: 'MINGO-12', status: 'Done' },
  { id: 2,  title: 'Figma Design',            meeting: 'Planning Mingo Project', assignee: 'Shiran Levi',   due: '30.12.25', priority: 'Medium', tag: 'MINGO-32', status: 'In Progress' },
  { id: 3,  title: 'API Integration',         meeting: 'Planning Mingo Project', assignee: 'Liron Dabach',  due: '30.12.25', priority: 'Low',    tag: 'MINGO-17', status: 'To Do' },
  { id: 4,  title: 'Database Schema',         meeting: 'Planning Mingo Project', assignee: 'Shiran Levi',   due: '30.12.25', priority: 'Low',    tag: 'MINGO-41', status: 'To Do' },
  { id: 5,  title: 'Setup CI/CD Pipeline',    meeting: 'Planning Mingo Project', assignee: 'Tal Gohar',     due: '30.12.25', priority: 'High',   tag: 'MINGO-45', status: 'To Do' },
  { id: 6,  title: 'User Authentication',     meeting: 'Planning Mingo Project', assignee: 'Sean Nedorez',  due: '30.12.25', priority: 'Medium', tag: 'MINGO-5',  status: 'Done' },
  { id: 7,  title: 'Architecture Document',   meeting: 'Planning Mingo Project', assignee: 'Tal Gohar',     due: '30.11.25', priority: 'High',   tag: 'MINGO-3',  status: 'In Progress' },
  { id: 8,  title: 'Testing Strategy',        meeting: 'Planning Mingo Project', assignee: 'Liron Dabach',  due: '30.12.25', priority: 'Medium', tag: 'MINGO-1',  status: 'In Progress' },
  { id: 9,  title: 'Sprint Retrospective',    meeting: 'Sprint 4 Kickoff',       assignee: 'Sean Nedorez',  due: '15.01.26', priority: 'Low',    tag: 'MINGO-22', status: 'To Do' },
  { id: 10, title: 'Code Review Guidelines',  meeting: 'Architecture Review',    assignee: 'Tal Gohar',     due: '20.01.26', priority: 'Medium', tag: 'MINGO-28', status: 'Done' },
  { id: 11, title: 'Performance Optimization', meeting: 'Sprint 4 Kickoff',      assignee: 'Shiran Levi',   due: '25.01.26', priority: 'High',   tag: 'MINGO-33', status: 'To Do' },
  { id: 12, title: 'Documentation Update',    meeting: 'Architecture Review',    assignee: 'Liron Dabach',  due: '10.01.26', priority: 'Low',    tag: 'MINGO-19', status: 'In Progress' },
];

type FilterTab = 'All' | 'To Do' | 'In Progress' | 'Done';
type SortKey = 'priority' | 'due' | 'assignee' | 'status';

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

const TasksPage = () => {
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [sortBy, setSortBy] = useState<SortKey>('priority');
  const [priorityFilter, setPriorityFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');

  const assignees = useMemo(() => {
    const set = new Set(tasks.map((t) => t.assignee));
    return ['All', ...Array.from(set).sort()];
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = [...tasks];

    // Tab filter
    if (activeTab !== 'All') {
      result = result.filter((t) => t.status === activeTab);
    }

    // Priority filter
    if (priorityFilter !== 'All') {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    // Assignee filter
    if (assigneeFilter !== 'All') {
      result = result.filter((t) => t.assignee === assigneeFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          t.meeting.toLowerCase().includes(q) ||
          t.tag.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (sortBy === 'due') return a.due.localeCompare(b.due);
      if (sortBy === 'assignee') return a.assignee.localeCompare(b.assignee);
      if (sortBy === 'status') {
        const order: Record<string, number> = { 'To Do': 0, 'In Progress': 1, 'Done': 2 };
        return order[a.status] - order[b.status];
      }
      return 0;
    });

    return result;
  }, [tasks, activeTab, search, sortBy, priorityFilter, assigneeFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'To Do').length,
    inProgress: tasks.filter((t) => t.status === 'In Progress').length,
    done: tasks.filter((t) => t.status === 'Done').length,
    highPriority: tasks.filter((t) => t.priority === 'High').length,
  }), [tasks]);

  const toggleDone = (id: number) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: t.status === 'Done' ? 'To Do' : 'Done' }
          : t
      )
    );
  };

  const tabs: FilterTab[] = ['All', 'To Do', 'In Progress', 'Done'];

  return (
    <div className="tasks-layout">
      <Header />

      <main className="tasks-main">
        {/* Stats Row */}
        <div className="tasks-stats-row">
          <div className="tasks-stat-card" onClick={() => setActiveTab('All')}>
            <div className="stat-icon stat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Tasks</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('To Do')}>
            <div className="stat-icon stat-icon--todo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <span className="stat-number">{stats.todo}</span>
            <span className="stat-label">To Do</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('In Progress')}>
            <div className="stat-icon stat-icon--progress">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </div>
            <span className="stat-number">{stats.inProgress}</span>
            <span className="stat-label">In Progress</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('Done')}>
            <div className="stat-icon stat-icon--done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" />
              </svg>
            </div>
            <span className="stat-number">{stats.done}</span>
            <span className="stat-label">Done</span>
          </div>
          <div className="tasks-stat-card" onClick={() => { setActiveTab('All'); setPriorityFilter('High'); }}>
            <div className="stat-icon stat-icon--high">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="stat-number">{stats.highPriority}</span>
            <span className="stat-label">High Priority</span>
          </div>
        </div>

        {/* Toolbar: Search + Filters */}
        <div className="tasks-toolbar">
          <div className="tasks-search-box">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks, assignees, meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="tasks-filter-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`filter-tab ${activeTab === tab ? 'filter-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {tab !== 'All' && (
                  <span className="filter-tab-count">
                    {tab === 'To Do' ? stats.todo : tab === 'In Progress' ? stats.inProgress : stats.done}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Filter dropdowns row */}
        <div className="tasks-filters-row">
          <div className="filter-dropdown">
            <label>Priority</label>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}>
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div className="filter-dropdown">
            <label>Assignee</label>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              {assignees.map((a) => (
                <option key={a} value={a}>{a === 'All' ? 'All Assignees' : a}</option>
              ))}
            </select>
          </div>
          <div className="filter-dropdown">
            <label>Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="priority">Priority</option>
              <option value="due">Due Date</option>
              <option value="assignee">Assignee</option>
              <option value="status">Status</option>
            </select>
          </div>
          {(priorityFilter !== 'All' || assigneeFilter !== 'All' || activeTab !== 'All') && (
            <button className="clear-filters-btn" onClick={() => { setPriorityFilter('All'); setAssigneeFilter('All'); setActiveTab('All'); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear Filters
            </button>
          )}
        </div>

        {/* Task List */}
        <div className="tasks-card">
          <div className="tasks-card-header">
            <h2>Tasks</h2>
            <span className="tasks-count">{filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="tasks-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
              <p>No tasks match your filters</p>
            </div>
          ) : (
            <div className="tasks-list">
              {filtered.map((task) => (
                <div key={task.id} className={`task-row ${task.status === 'Done' ? 'task-row--done' : ''}`}>
                  <span
                    className={`task-checkbox ${task.status === 'Done' ? 'task-checkbox--done' : ''}`}
                    onClick={() => toggleDone(task.id)}
                  >
                    {task.status === 'Done' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>

                  <span className={`task-status-dot task-status-dot--${task.status === 'Done' ? 'done' : task.status === 'In Progress' ? 'progress' : 'todo'}`}>
                    {task.status === 'Done' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>

                  <div className="task-row-info">
                    <span className={`task-row-title ${task.status === 'Done' ? 'task-row-title--done' : ''}`}>{task.title}</span>
                    <span className="task-row-meta">
                      {task.meeting}
                      <span className="meta-sep">|</span>
                      {task.assignee}
                      <span className="meta-sep">|</span>
                      Due to {task.due}
                    </span>
                  </div>

                  <div className="task-row-badges">
                    <span className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}>{task.priority}</span>
                    <span className="task-tag">{task.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TasksPage;
