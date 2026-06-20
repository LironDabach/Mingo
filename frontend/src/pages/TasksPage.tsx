import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header/Header';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../lib/auth';
import './TasksPage.css';

type TaskStatus = 'To Do' | 'Done';
type FilterTab = 'All' | TaskStatus;
type SortKey = 'due' | 'assignee' | 'status';

type UserOption = {
  _id: string;
  fullname?: string;
  username?: string;
  email?: string;
};

type MeetingOption = {
  _id: string;
  title?: string;
  date?: string;
  gitHubRepoName?: string;
};

type RawTask = {
  _id: string;
  title?: string;
  description?: string;
  assigneeId?: UserOption | string;
  assigneeName?: string;
  dueDate?: string;
  status?: string;
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  source?: 'github' | 'local';
  sourceType?: 'project' | 'issue';
  projectTitle?: string;
  htmlUrl?: string;
  meeting?: MeetingOption | null;
};

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
};

type Task = {
  id: string;
  title: string;
  meetingId?: string;
  meeting: string;
  assigneeId?: string;
  assignee: string;
  due: string;
  dueSort: number;
  isOverdue: boolean;
  tag: string;
  status: TaskStatus;
  source: 'github' | 'local';
  sourceType?: 'project' | 'issue';
  projectTitle?: string;
  htmlUrl?: string;
};

const STATUS_ORDER: Record<TaskStatus, number> = { 'To Do': 0, Done: 1 };
const tabs: FilterTab[] = ['All', 'To Do', 'Done'];

const getUserLabel = (user?: UserOption | null) =>
  user?.fullname || user?.username || user?.email || 'Unassigned';

const getAssigneeId = (assignee?: UserOption | string) =>
  typeof assignee === 'string' ? assignee : assignee?._id;

const formatDueDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
};

const isDateOverdue = (value?: string, status?: TaskStatus): boolean => {
  if (!value || status === 'Done') return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date < new Date();
};

const normalizeTask = (task: RawTask): Task => {
  const assignee = typeof task.assigneeId === 'object' ? task.assigneeId : null;
  const assigneeLabel = assignee ? getUserLabel(assignee) : task.assigneeName || 'Unassigned';
  const dueTime = task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const issueTag = task.gitHubIssueId
    ? `${task.gitHubRepoName || 'MINGO'}-${task.gitHubIssueId}`
    : task.gitHubRepoName || 'Manual';
  const status: TaskStatus = task.status === 'Done' ? 'Done' : 'To Do';

  return {
    id: task._id,
    title:
      task.title ||
      task.description ||
      (task.gitHubIssueId ? `GitHub issue #${task.gitHubIssueId}` : 'Untitled task'),
    ...(task.meeting?._id ? { meetingId: task.meeting._id } : {}),
    meeting: task.meeting?.title || 'Unlinked',
    ...(getAssigneeId(task.assigneeId) ? { assigneeId: getAssigneeId(task.assigneeId) } : {}),
    assignee: assigneeLabel,
    due: formatDueDate(task.dueDate),
    dueSort: Number.isNaN(dueTime) ? Number.POSITIVE_INFINITY : dueTime,
    isOverdue: isDateOverdue(task.dueDate, status),
    tag: issueTag,
    status,
    source: task.source === 'github' ? 'github' : 'local',
    ...(task.sourceType ? { sourceType: task.sourceType } : {}),
    ...(task.projectTitle ? { projectTitle: task.projectTitle } : {}),
    ...(task.htmlUrl ? { htmlUrl: task.htmlUrl } : {}),
  };
};

const SkeletonRows = () => (
  <>
    {[1, 2, 3, 4].map((n) => (
      <div key={n} className="task-row-skeleton">
        <div className="task-row-skeleton__dot" />
        <div className="task-row-skeleton__lines">
          <div className="task-row-skeleton__line" />
          <div className="task-row-skeleton__line" />
        </div>
      </div>
    ))}
  </>
);

const TasksPage = () => {
  const currentUser = getStoredUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [sortBy, setSortBy] = useState<SortKey>('due');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepoName, setSelectedRepoName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [repoError, setRepoError] = useState('');

  const loadRepos = async () => {
    if (!currentUser?._id) {
      setRepos([]);
      setSelectedRepoName('');
      setIsLoadingRepos(false);
      return;
    }

    try {
      setIsLoadingRepos(true);
      setRepoError('');
      const response = await fetchWithAuth('/api/auth/github/repos');

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to load GitHub repositories.';
        throw new Error(message);
      }

      const data = (await response.json()) as GitHubRepo[];
      const nextRepos = Array.isArray(data) ? data.filter((repo) => repo.fullName) : [];
      setRepos(nextRepos);
      setSelectedRepoName((current) =>
        current && nextRepos.some((repo) => repo.fullName === current) ? current : '',
      );
    } catch (err) {
      setRepos([]);
      setSelectedRepoName('');
      setRepoError(err instanceof Error ? err.message : 'Unable to load GitHub repositories.');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const loadTasks = async (repoName = selectedRepoName, showRefresh = false) => {
    if (!currentUser?._id) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      if (showRefresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError('');
      const params = new URLSearchParams();
      if (repoName) params.set('repo', repoName);
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetchWithAuth(`/api/users/${currentUser._id}/tasks${query}`);

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to load tasks.';
        throw new Error(message);
      }

      const data = (await response.json()) as RawTask[];
      setTasks(Array.isArray(data) ? data.map(normalizeTask) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tasks.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { void loadRepos(); }, [currentUser?._id]);
  useEffect(() => { void loadTasks(selectedRepoName); }, [currentUser?._id, selectedRepoName]);

  const assignees = useMemo(() => {
    const set = new Set(tasks.map((task) => task.assignee));
    return ['All', ...Array.from(set).sort()];
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = [...tasks];

    if (activeTab !== 'All') result = result.filter((task) => task.status === activeTab);
    if (assigneeFilter !== 'All') result = result.filter((task) => task.assignee === assigneeFilter);

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(query) ||
          task.assignee.toLowerCase().includes(query) ||
          task.meeting.toLowerCase().includes(query) ||
          task.tag.toLowerCase().includes(query),
      );
    }

    result.sort((left, right) => {
      if (sortBy === 'due') return left.dueSort - right.dueSort;
      if (sortBy === 'assignee') return left.assignee.localeCompare(right.assignee);
      if (sortBy === 'status') return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      return 0;
    });

    return result;
  }, [tasks, activeTab, search, sortBy, assigneeFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((t) => t.status === 'To Do').length,
    done: tasks.filter((t) => t.status === 'Done').length,
  }), [tasks]);

  const updateTaskStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (task.source === 'github') {
      setError('GitHub tasks must be updated in GitHub Issues.');
      return;
    }
    if (!task.meetingId) {
      setError('This task is not linked to a meeting.');
      return;
    }

    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus, isOverdue: false } : t)),
    );

    try {
      const response = await fetchWithAuth(`/api/meetings/${task.meetingId}/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error('Unable to update task status.');
    } catch (err) {
      setTasks(previousTasks);
      setError(err instanceof Error ? err.message : 'Unable to update task status.');
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (task.source === 'github') {
      setError('GitHub tasks can only be managed in GitHub.');
      return;
    }
    if (!task.meetingId) {
      setError('This task is not linked to a meeting.');
      return;
    }

    try {
      setError('');
      const response = await fetchWithAuth(`/api/meetings/${task.meetingId}/tasks/${task.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Unable to delete task.');
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete task.');
    }
  };

  const hasFilters = assigneeFilter !== 'All' || activeTab !== 'All' || Boolean(selectedRepoName);

  const clearAllFilters = () => {
    setAssigneeFilter('All');
    setActiveTab('All');
    setSelectedRepoName('');
    setSearch('');
  };

  return (
    <div className="tasks-layout">
      <Header />

      <main className="tasks-main">
        <div className="tasks-heading">
          <h1>Tasks</h1>
          {!isLoading && (
            <span className="tasks-heading-count">
              {stats.total} total · {stats.todo} to do · {stats.done} done
            </span>
          )}
        </div>

        {/* ── Stat cards ── */}
        <div className="tasks-stats-row">
          <div
            className={`tasks-stat-card${activeTab === 'All' ? ' tasks-stat-card--active' : ''}`}
            onClick={() => setActiveTab('All')}
          >
            <div className="stat-icon stat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number">{isLoading ? '–' : stats.total}</span>
              <span className="stat-label">All Tasks</span>
            </div>
          </div>

          <div
            className={`tasks-stat-card${activeTab === 'To Do' ? ' tasks-stat-card--active' : ''}`}
            onClick={() => setActiveTab('To Do')}
          >
            <div className="stat-icon stat-icon--todo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number">{isLoading ? '–' : stats.todo}</span>
              <span className="stat-label">To Do</span>
            </div>
          </div>

          <div
            className={`tasks-stat-card${activeTab === 'Done' ? ' tasks-stat-card--active' : ''}`}
            onClick={() => setActiveTab('Done')}
          >
            <div className="stat-icon stat-icon--done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number">{isLoading ? '–' : stats.done}</span>
              <span className="stat-label">Done</span>
            </div>
          </div>
        </div>

        {/* ── Unified controls bar ── */}
        <div className="tasks-controls">
          <div className="tasks-search-box">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="search-clear" onClick={() => setSearch('')}>
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
                type="button"
                className={`filter-tab${activeTab === tab ? ' filter-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {tab !== 'All' && (
                  <span className="filter-tab-count">
                    {tab === 'To Do' ? stats.todo : stats.done}
                  </span>
                )}
              </button>
            ))}
          </div>

          {assignees.length > 2 && (
            <select
              className="tasks-control-select"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              title="Filter by assignee"
            >
              {assignees.map((a) => (
                <option key={a} value={a}>{a === 'All' ? 'All assignees' : a}</option>
              ))}
            </select>
          )}

          <select
            className="tasks-control-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
          >
            <option value="due">Sort: Due date</option>
            <option value="assignee">Sort: Assignee</option>
            <option value="status">Sort: Status</option>
          </select>

          {repos.length > 0 && (
            <select
              className="tasks-control-select"
              value={selectedRepoName}
              onChange={(e) => setSelectedRepoName(e.target.value)}
              disabled={isLoadingRepos}
              title="GitHub repository"
            >
              <option value="">All repos</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.fullName}>{repo.fullName}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            className={`tasks-refresh-btn${isRefreshing ? ' tasks-refresh-btn--spinning' : ''}`}
            onClick={() => void loadTasks(selectedRepoName, true)}
            disabled={isLoading || isRefreshing}
            title="Refresh tasks"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {/* ── Active filter pills ── */}
        {hasFilters && (
          <div className="tasks-active-filters">
            {activeTab !== 'All' && (
              <span className="tasks-filter-pill">
                {activeTab}
                <button type="button" onClick={() => setActiveTab('All')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            {assigneeFilter !== 'All' && (
              <span className="tasks-filter-pill">
                {assigneeFilter}
                <button type="button" onClick={() => setAssigneeFilter('All')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            {selectedRepoName && (
              <span className="tasks-filter-pill">
                {selectedRepoName}
                <button type="button" onClick={() => setSelectedRepoName('')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            )}
            <button type="button" className="tasks-clear-all" onClick={clearAllFilters}>
              Clear all
            </button>
          </div>
        )}

        {/* ── Errors ── */}
        {repoError && <p className="tasks-error">{repoError}</p>}
        {error && <p className="tasks-error">{error}</p>}

        {/* ── Task list card ── */}
        <div className="tasks-card">
          <div className="tasks-card-header">
            <h2>Tasks</h2>
            <span className="tasks-count">
              {isLoading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}`}
            </span>
          </div>

          {isLoading ? (
            <SkeletonRows />
          ) : filtered.length === 0 ? (
            <div className="tasks-empty">
              <div className="tasks-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <p>
                {search.trim()
                  ? `No tasks match "${search}"`
                  : hasFilters
                    ? 'No tasks match the active filters.'
                    : "No tasks yet. They’ll appear here once meetings are processed."}
              </p>
            </div>
          ) : (
            <div className="tasks-list">
              {filtered.map((task) => (
                <div key={task.id} className={`task-row${task.status === 'Done' ? ' task-row--done' : ''}`}>

                  {/* Status toggle button */}
                  <button
                    type="button"
                    className={`task-status-btn${task.status === 'Done' ? ' task-status-btn--done' : ''}${task.source === 'github' ? ' task-status-btn--disabled' : ''}`}
                    title={
                      task.source === 'github'
                        ? 'Update this in GitHub Issues'
                        : task.status === 'Done'
                          ? 'Mark as To Do'
                          : 'Mark as Done'
                    }
                    onClick={() => {
                      if (task.source === 'github') return;
                      void updateTaskStatus(task, task.status === 'Done' ? 'To Do' : 'Done');
                    }}
                  >
                    {task.status === 'Done' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  {/* Task info */}
                  <div className="task-row-info">
                    <span className={`task-row-title${task.status === 'Done' ? ' task-row-title--done' : ''}`}>
                      {task.title}
                    </span>
                    <span className="task-row-meta">
                      <span className="task-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {task.meeting}
                      </span>

                      <span className="task-meta-sep" />
                      <span className="task-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                        {task.assignee}
                      </span>

                      {task.due && (
                        <>
                          <span className="task-meta-sep" />
                          <span className={`task-meta-item${task.isOverdue ? ' task-due--overdue' : ''}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            {task.isOverdue ? 'Overdue · ' : 'Due '}{task.due}
                          </span>
                        </>
                      )}

                      {task.projectTitle && (
                        <>
                          <span className="task-meta-sep" />
                          <span className="task-meta-item">{task.projectTitle}</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Right side badges */}
                  <div className="task-row-badges">
                    <span className={`task-source-badge task-source-badge--${task.source}`}>
                      {task.source === 'github' ? (
                        <>
                          <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.37 0 0 5.49 0 12.26c0 5.42 3.44 10.02 8.2 11.64.6.12.82-.27.82-.6 0-.3-.01-1.1-.02-2.16-3.34.75-4.04-1.67-4.04-1.67-.55-1.43-1.33-1.81-1.33-1.81-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.9 2.8 1.35 3.49 1.03.11-.8.42-1.35.76-1.66-2.67-.31-5.48-1.38-5.48-6.14 0-1.36.47-2.46 1.24-3.33-.13-.31-.54-1.58.12-3.3 0 0 1.01-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.3-1.6 3.3-1.27 3.3-1.27.66 1.72.25 2.99.12 3.3.77.87 1.24 1.97 1.24 3.33 0 4.77-2.82 5.82-5.5 6.13.43.38.82 1.12.82 2.27 0 1.64-.02 2.95-.02 3.35 0 .33.22.73.83.6A12.27 12.27 0 0 0 24 12.26C24 5.49 18.63 0 12 0Z" />
                          </svg>
                          GitHub
                        </>
                      ) : 'Mingo'}
                    </span>

                    {task.htmlUrl && (
                      <a className="task-open-link" href={task.htmlUrl} target="_blank" rel="noreferrer" title="Open in GitHub">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        View
                      </a>
                    )}

                    <span className="task-tag">{task.tag}</span>

                    {task.source === 'local' && (
                      <button
                        type="button"
                        className="task-delete-btn"
                        title="Delete task"
                        onClick={() => void handleDeleteTask(task)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    )}
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
