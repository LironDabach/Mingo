import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header/Header';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../lib/auth';
import './TasksPage.css';

type TaskPriority = 'High' | 'Medium' | 'Low';
type TaskStatus = 'To Do' | 'In Progress' | 'Done';
type FilterTab = 'All' | TaskStatus;
type SortKey = 'priority' | 'due' | 'assignee' | 'status';

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
  priority?: TaskPriority;
  status?: TaskStatus;
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  source?: 'github' | 'local';
  sourceType?: 'project' | 'issue';
  projectTitle?: string;
  htmlUrl?: string;
  meeting?: MeetingOption | null;
};

type GitHubProject = {
  id: string;
  title: string;
  number: number;
  owner: string;
  ownerType?: 'users' | 'orgs';
  url: string;
  taskCount?: number;
  updatedAt?: string | null;
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
  priority: TaskPriority;
  tag: string;
  status: TaskStatus;
  source: 'github' | 'local';
  sourceType?: 'project' | 'issue';
  projectTitle?: string;
  htmlUrl?: string;
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { High: 0, Medium: 1, Low: 2 };
const STATUS_ORDER: Record<TaskStatus, number> = { 'To Do': 0, 'In Progress': 1, Done: 2 };
const tabs: FilterTab[] = ['All', 'To Do', 'In Progress', 'Done'];

const getUserLabel = (user?: UserOption | null) =>
  user?.fullname || user?.username || user?.email || 'Unassigned';

const getAssigneeId = (assignee?: UserOption | string) =>
  typeof assignee === 'string' ? assignee : assignee?._id;

const formatDueDate = (value?: string) => {
  if (!value) {
    return 'No due date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

const normalizeTask = (task: RawTask): Task => {
  const assignee = typeof task.assigneeId === 'object' ? task.assigneeId : null;
  const assigneeLabel = assignee ? getUserLabel(assignee) : task.assigneeName || 'Unassigned';
  const dueTime = task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const issueTag = task.gitHubIssueId
    ? `${task.gitHubRepoName || 'MINGO'}-${task.gitHubIssueId}`
    : task.gitHubRepoName || 'Manual';

  return {
    id: task._id,
    title:
      task.title ||
      task.description ||
      (task.gitHubIssueId ? `GitHub issue #${task.gitHubIssueId}` : 'Untitled task'),
    ...(task.meeting?._id ? { meetingId: task.meeting._id } : {}),
    meeting: task.meeting?.title || 'Unlinked meeting',
    ...(getAssigneeId(task.assigneeId) ? { assigneeId: getAssigneeId(task.assigneeId) } : {}),
    assignee: assigneeLabel,
    due: formatDueDate(task.dueDate),
    dueSort: Number.isNaN(dueTime) ? Number.POSITIVE_INFINITY : dueTime,
    priority: task.priority || 'Medium',
    tag: issueTag,
    status: task.status || 'To Do',
    source: task.source === 'github' ? 'github' : 'local',
    ...(task.sourceType ? { sourceType: task.sourceType } : {}),
    ...(task.projectTitle ? { projectTitle: task.projectTitle } : {}),
    ...(task.htmlUrl ? { htmlUrl: task.htmlUrl } : {}),
  };
};

const TasksPage = () => {
  const currentUser = getStoredUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [sortBy, setSortBy] = useState<SortKey>('priority');
  const [priorityFilter, setPriorityFilter] = useState<'All' | TaskPriority>('All');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [projects, setProjects] = useState<GitHubProject[]>([]);
  const [selectedProjectUrl, setSelectedProjectUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [error, setError] = useState('');
  const [projectError, setProjectError] = useState('');

  const loadProjects = async () => {
    if (!currentUser?._id) {
      setProjects([]);
      setSelectedProjectUrl('');
      setIsLoadingProjects(false);
      return;
    }

    try {
      setIsLoadingProjects(true);
      setProjectError('');
      const response = await fetchWithAuth('/api/auth/github/projects');

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to load GitHub projects.';
        throw new Error(message);
      }

      const data = (await response.json()) as GitHubProject[];
      const nextProjects = Array.isArray(data) ? data.filter((project) => project.url) : [];
      setProjects(nextProjects);
      setSelectedProjectUrl((current) =>
        current && nextProjects.some((project) => project.url === current) ? current : '',
      );
    } catch (err) {
      setProjects([]);
      setSelectedProjectUrl('');
      setProjectError(err instanceof Error ? err.message : 'Unable to load GitHub projects.');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const loadTasks = async (projectUrl = selectedProjectUrl) => {
    if (!currentUser?._id || !projectUrl) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.set('project', projectUrl);
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
    }
  };

  useEffect(() => {
    void loadProjects();
  }, [currentUser?._id]);

  useEffect(() => {
    void loadTasks(selectedProjectUrl);
  }, [currentUser?._id, selectedProjectUrl]);

  const assignees = useMemo(() => {
    const set = new Set(tasks.map((task) => task.assignee));
    return ['All', ...Array.from(set).sort()];
  }, [tasks]);

  const filtered = useMemo(() => {
    let result = [...tasks];

    if (activeTab !== 'All') {
      result = result.filter((task) => task.status === activeTab);
    }

    if (priorityFilter !== 'All') {
      result = result.filter((task) => task.priority === priorityFilter);
    }

    if (assigneeFilter !== 'All') {
      result = result.filter((task) => task.assignee === assigneeFilter);
    }

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
      if (sortBy === 'priority') return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (sortBy === 'due') return left.dueSort - right.dueSort;
      if (sortBy === 'assignee') return left.assignee.localeCompare(right.assignee);
      if (sortBy === 'status') return STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      return 0;
    });

    return result;
  }, [tasks, activeTab, search, sortBy, priorityFilter, assigneeFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    todo: tasks.filter((task) => task.status === 'To Do').length,
    inProgress: tasks.filter((task) => task.status === 'In Progress').length,
    done: tasks.filter((task) => task.status === 'Done').length,
    highPriority: tasks.filter((task) => task.priority === 'High' && task.status !== 'Done').length,
  }), [tasks]);

  const updateTaskStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (task.source === 'github') {
      setError('GitHub tasks are synced from GitHub. Update their status in GitHub Projects or Issues.');
      return;
    }

    if (!task.meetingId) {
      setError('This task is not linked to a meeting yet.');
      return;
    }

    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((current) => (current.id === task.id ? { ...current, status: nextStatus } : current)),
    );

    try {
      const response = await fetchWithAuth(`/api/meetings/${task.meetingId}/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!response.ok) {
        throw new Error('Unable to update task status.');
      }
    } catch (err) {
      setTasks(previousTasks);
      setError(err instanceof Error ? err.message : 'Unable to update task status.');
    }
  };

  const toggleDone = (task: Task) => {
    void updateTaskStatus(task, task.status === 'Done' ? 'To Do' : 'Done');
  };

  const handleDeleteTask = async (task: Task) => {
    if (task.source === 'github') {
      setError('GitHub tasks cannot be deleted from Mingo. Manage them in GitHub.');
      return;
    }

    if (!task.meetingId) {
      setError('This task is not linked to a meeting yet.');
      return;
    }

    try {
      setError('');
      const response = await fetchWithAuth(`/api/meetings/${task.meetingId}/tasks/${task.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Unable to delete task.');
      }

      setTasks((prev) => prev.filter((current) => current.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete task.');
    }
  };

  return (
    <div className="tasks-layout">
      <Header />

      <main className="tasks-main">
        <div className="tasks-stats-row">
          <div className="tasks-stat-card" onClick={() => setActiveTab('All')}>
            <div className="stat-icon stat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <span className="stat-number">{isLoading ? '...' : stats.total}</span>
            <span className="stat-label">Total Tasks</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('To Do')}>
            <div className="stat-icon stat-icon--todo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <span className="stat-number">{isLoading ? '...' : stats.todo}</span>
            <span className="stat-label">To Do</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('In Progress')}>
            <div className="stat-icon stat-icon--progress">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </div>
            <span className="stat-number">{isLoading ? '...' : stats.inProgress}</span>
            <span className="stat-label">In Progress</span>
          </div>
          <div className="tasks-stat-card" onClick={() => setActiveTab('Done')}>
            <div className="stat-icon stat-icon--done">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="8 12 11 15 16 9" />
              </svg>
            </div>
            <span className="stat-number">{isLoading ? '...' : stats.done}</span>
            <span className="stat-label">Done</span>
          </div>
          <div className="tasks-stat-card" onClick={() => { setActiveTab('All'); setPriorityFilter('High'); }}>
            <div className="stat-icon stat-icon--high">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="stat-number">{isLoading ? '...' : stats.highPriority}</span>
            <span className="stat-label">High Priority</span>
          </div>
        </div>

        <div className="tasks-sync-note">
          <div>
            <strong>Synced from GitHub</strong>
            <span>Choose a GitHub Project and Mingo will pull the tasks from that project.</span>
          </div>
          <div className="tasks-sync-controls">
            <select
              value={selectedProjectUrl}
              onChange={(event) => setSelectedProjectUrl(event.target.value)}
              disabled={isLoadingProjects}
            >
              <option value="">
                {isLoadingProjects ? 'Loading GitHub Projects...' : 'Select GitHub Project'}
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.url}>
                  {project.title} #{project.number}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadTasks()} disabled={isLoading || !selectedProjectUrl}>
              {isLoading ? 'Syncing...' : 'Sync now'}
            </button>
          </div>
        </div>

        {projectError && <p className="tasks-error">{projectError}</p>}
        {error && <p className="tasks-error">{error}</p>}

        <div className="tasks-toolbar">
          <div className="tasks-search-box">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search tasks, assignees, meetings..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
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
                type="button"
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

        <div className="tasks-filters-row">
          <div className="filter-dropdown">
            <label>Priority</label>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}>
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
          <div className="filter-dropdown">
            <label>Assignee</label>
            <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
              {assignees.map((assignee) => (
                <option key={assignee} value={assignee}>{assignee === 'All' ? 'All Assignees' : assignee}</option>
              ))}
            </select>
          </div>
          <div className="filter-dropdown">
            <label>Sort by</label>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
              <option value="priority">Priority</option>
              <option value="due">Due Date</option>
              <option value="assignee">Assignee</option>
              <option value="status">Status</option>
            </select>
          </div>
          {(priorityFilter !== 'All' || assigneeFilter !== 'All' || activeTab !== 'All') && (
            <button
              type="button"
              className="clear-filters-btn"
              onClick={() => { setPriorityFilter('All'); setAssigneeFilter('All'); setActiveTab('All'); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear Filters
            </button>
          )}
        </div>

        <div className="tasks-card">
          <div className="tasks-card-header">
            <h2>Tasks</h2>
            <span className="tasks-count">{isLoading ? 'Loading...' : `${filtered.length} ${filtered.length === 1 ? 'task' : 'tasks'}`}</span>
          </div>

          {!isLoading && filtered.length === 0 ? (
            <div className="tasks-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="8" y1="15" x2="16" y2="15" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
              <p>
                {selectedProjectUrl
                  ? 'No GitHub tasks were found for this project.'
                  : 'Choose a GitHub Project and sync tasks.'}
              </p>
            </div>
          ) : (
            <div className="tasks-list">
              {filtered.map((task) => (
                <div key={task.id} className={`task-row ${task.status === 'Done' ? 'task-row--done' : ''}`}>
                  <button
                    type="button"
                    className={`task-checkbox ${task.status === 'Done' ? 'task-checkbox--done' : ''}`}
                    onClick={() => toggleDone(task)}
                    aria-label={task.status === 'Done' ? 'Mark task as open' : 'Mark task as done'}
                  >
                    {task.status === 'Done' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </button>

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
                      {task.projectTitle && (
                        <>
                          <span className="meta-sep">|</span>
                          {task.projectTitle}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="task-row-badges">
                    {task.source === 'local' && (
                      <select
                        className="task-status-select"
                        value={task.status}
                        onChange={(event) => void updateTaskStatus(task, event.target.value as TaskStatus)}
                      >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                      </select>
                    )}
                    {task.htmlUrl && (
                      <a className="task-open-link" href={task.htmlUrl} target="_blank" rel="noreferrer">
                        GitHub
                      </a>
                    )}
                    <span className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}>{task.priority}</span>
                    <span className="task-tag">{task.tag}</span>
                    {task.source === 'local' && (
                      <button type="button" className="task-delete-btn" onClick={() => void handleDeleteTask(task)}>
                        Delete
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
